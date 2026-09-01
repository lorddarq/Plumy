const { readFileSync, readdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../..');
const artifactDirectory = path.join(repositoryRoot, 'docs/qa/timeline-rendering-baseline');
const label = process.argv.find(argument => argument.startsWith('--candidate-label='))?.split('=')[1];
const output = process.argv.find(argument => argument.startsWith('--output='))?.split('=')[1];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Pass --candidate-label=<lowercase-label>');

const files = readdirSync(artifactDirectory);
const controlFiles = files.filter(file => /^control-814a336-sample-\d{2}\.json$/.test(file)).sort();
const candidateFiles = files.filter(file => file.startsWith(`candidate-${label}-`) && /-sample-\d{2}\.json$/.test(file)).sort();
if (controlFiles.length !== 5 || candidateFiles.length !== 5) {
  throw new Error(`Expected 5 control and 5 candidate samples; found ${controlFiles.length} and ${candidateFiles.length}`);
}

const readJson = file => JSON.parse(readFileSync(path.join(artifactDirectory, file), 'utf8'));
const controls = controlFiles.map(file => ({ file, data: readJson(file) }));
const candidates = candidateFiles.map(file => ({ file, data: readJson(file) }));
const environments = [...controlFiles, ...candidateFiles].map(file => readJson(file.replace(/\.json$/, '-environment.json')));
const reference = environments[0];
for (const environment of environments.slice(1)) {
  for (const field of ['fixture', 'runtime', 'isolation', 'build']) {
    if (JSON.stringify(environment[field]) !== JSON.stringify(reference[field])) {
      throw new Error(`Environment mismatch in ${field}`);
    }
  }
}

function scenarioKey(scenario) {
  return `${scenario.tasks}|${scenario.weekends}|${scenario.widths}`;
}

function validateSample(sample, kind) {
  if (sample.data.scenarios.length !== 12) throw new Error(`${sample.file} does not contain 12 scenarios`);
  const keys = new Set();
  for (const scenario of sample.data.scenarios) {
    const key = scenarioKey(scenario);
    if (keys.has(key)) throw new Error(`${sample.file} repeats ${key}`);
    keys.add(key);
    for (const phase of ['cold', 'warm']) {
      const result = scenario[phase];
      if (!result?.page || !result.chromium) throw new Error(`${sample.file} is missing ${key} ${phase}`);
      if (result.chromium.Documents !== 1) throw new Error(`${sample.file} ${key} ${phase} mounted ${result.chromium.Documents} documents`);
      if (result.page.fixture.taskCount !== scenario.tasks) throw new Error(`${sample.file} ${key} ${phase} changed fixture size`);
      if (result.page.interactions.resizePreview.status !== 'measured') throw new Error(`${sample.file} ${key} ${phase} missed resize preview`);
      if (result.page.interactions.taskDrag.status !== 'unavailable') throw new Error(`${sample.file} ${key} ${phase} unexpectedly reports synthetic drag latency`);
      const mountedRows = result.page.dom.swimlaneRows;
      if (kind === 'control' && mountedRows !== scenario.swimlanes) throw new Error(`${sample.file} ${key} ${phase} is not full-mount control`);
      if (kind === 'candidate' && mountedRows >= scenario.swimlanes) throw new Error(`${sample.file} ${key} ${phase} did not window rows`);
      for (const scroll of result.page.scroll) {
        if (kind === 'candidate' && (scroll.blankFrames !== 0 || scroll.alignmentFailures !== 0)) {
          throw new Error(`${sample.file} ${key} ${phase} has a candidate scroll parity failure`);
        }
      }
    }
  }
}

controls.forEach(sample => validateSample(sample, 'control'));
candidates.forEach(sample => validateSample(sample, 'candidate'));

function percentile(values, proportion) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * proportion) - 1)];
}

function statistics(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  return { count: values.length, median, p95: percentile(values, 0.95), min: sorted[0], max: sorted.at(-1) };
}

function metric(result, name) {
  const vertical = result.page.scroll.find(sample => sample.axis === 'vertical');
  const horizontal = result.page.scroll.find(sample => sample.axis === 'horizontal');
  const metrics = {
    initialRenderMs: result.page.initialRenderMs,
    readyMs: result.page.display.weekends === 'hidden' ? result.page.scenarioReadyMs : result.page.initialRenderMs,
    firstContentfulPaintMs: result.page.paint.firstContentfulPaintMs,
    domElements: result.page.dom.totalNodes,
    chromiumNodes: result.chromium.Nodes,
    eventListeners: result.chromium.JSEventListeners,
    layoutCount: result.chromium.LayoutCount,
    styleRecalcCount: result.chromium.RecalcStyleCount,
    scriptMs: result.chromium.ScriptDuration * 1000,
    layoutMs: result.chromium.LayoutDuration * 1000,
    styleMs: result.chromium.RecalcStyleDuration * 1000,
    taskMs: result.chromium.TaskDuration * 1000,
    heapMiB: result.chromium.JSHeapUsedSize / 1024 / 1024,
    longTaskCount: result.page.longTasks.count,
    longTaskTotalMs: result.page.longTasks.totalDurationMs,
    longTaskMaxMs: result.page.longTasks.maxDurationMs,
    verticalP95Ms: vertical.p95FrameMs,
    horizontalP95Ms: horizontal.p95FrameMs,
    horizontalFramesOver50: horizontal.framesOver50ms,
    resizePreviewMs: result.page.interactions.resizePreview.latencyMs,
  };
  return metrics[name];
}

const metricNames = [
  'initialRenderMs', 'readyMs', 'firstContentfulPaintMs', 'domElements', 'chromiumNodes', 'eventListeners',
  'layoutCount', 'styleRecalcCount',
  'scriptMs', 'layoutMs', 'styleMs', 'taskMs', 'heapMiB', 'longTaskCount', 'longTaskTotalMs',
  'longTaskMaxMs', 'verticalP95Ms', 'horizontalP95Ms', 'horizontalFramesOver50', 'resizePreviewMs',
];

function collect(samples, tasks, phase, metricName) {
  return samples.flatMap(sample => sample.data.scenarios
    .filter(scenario => scenario.tasks === tasks)
    .map(scenario => metric(scenario[phase], metricName))
    .filter(Number.isFinite));
}

const comparison = {};
for (const tasks of [1000, 5000, 10000]) {
  comparison[tasks] = {};
  for (const phase of ['cold', 'warm']) {
    comparison[tasks][phase] = {};
    for (const metricName of metricNames) {
      const control = statistics(collect(controls, tasks, phase, metricName));
      const candidate = statistics(collect(candidates, tasks, phase, metricName));
      comparison[tasks][phase][metricName] = {
        control,
        candidate,
        medianChangePercent: control.median === 0 ? undefined : ((candidate.median / control.median) - 1) * 100,
      };
    }
  }
}

const result = {
  schemaVersion: 1,
  candidateLabel: label,
  generatedAt: new Date().toISOString(),
  samples: { control: controlFiles, candidate: candidateFiles },
  environment: {
    fixture: reference.fixture,
    runtime: reference.runtime,
    isolation: reference.isolation,
    build: reference.build,
  },
  validation: {
    samplesPerSide: 5,
    scenariosPerSample: 12,
    phasesPerScenario: 2,
    measuredScenarioPhasesPerSide: 120,
    environmentEquivalent: true,
    controlFullMount: true,
    candidateWindowed: true,
    candidateBlankFrames: 0,
    candidateAlignmentFailures: 0,
    resizePreviewMeasured: true,
    trustedDragMeasured: false,
  },
  comparison,
};

const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (output) writeFileSync(path.resolve(repositoryRoot, output), serialized);
else process.stdout.write(serialized);
