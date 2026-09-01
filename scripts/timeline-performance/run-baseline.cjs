const { app, BrowserWindow } = require('electron');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const repositoryRoot = path.resolve(__dirname, '../..');
const artifactDirectory = path.join(repositoryRoot, 'docs/qa/timeline-rendering-baseline');
const isCandidateCapture = process.argv.includes('--candidate');
const candidateLabel = process.argv.find(argument => argument.startsWith('--candidate-label='))?.split('=')[1];
const sample = process.argv.find(argument => argument.startsWith('--sample='))?.split('=')[1];
if (candidateLabel && !/^[a-z0-9-]+$/.test(candidateLabel)) {
  throw new Error('Candidate labels may contain only lowercase letters, numbers, and hyphens');
}
if (sample && !/^[1-9][0-9]?$/.test(sample)) {
  throw new Error('Sample must be an integer from 1 through 99');
}
const isolatedUserData = mkdtempSync(path.join(tmpdir(), 'omvra-timeline-benchmark-user-data-'));
const buildDirectory = mkdtempSync(path.join(tmpdir(), 'omvra-timeline-benchmark-build-'));
app.on('window-all-closed', () => {});

function git(...args) {
  const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

function commandVersion(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function assertControlSourceIsUnchanged() {
  const result = spawnSync('git', ['diff', '--quiet', 'main', '--', 'src/app'], { cwd: repositoryRoot });
  if (result.status !== 0) {
    throw new Error('Refusing to capture a control baseline because src/app differs from main');
  }
}

function getRendererDiffHash() {
  const result = spawnSync('git', ['diff', '--binary', 'HEAD', '--', 'src/app'], { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Unable to read renderer diff');
  return createHash('sha256').update(result.stdout).digest('hex');
}

async function buildHarness() {
  const { build } = await import('vite');
  await build({
    configFile: path.join(repositoryRoot, 'vite.config.ts'),
    build: {
      outDir: buildDirectory,
      emptyOutDir: true,
      rollupOptions: { input: path.join(repositoryRoot, 'timeline-benchmark.html') },
    },
  });
}

function metricMap(metrics) {
  const wanted = new Set([
    'Documents', 'Frames', 'JSEventListeners', 'Nodes', 'LayoutCount', 'RecalcStyleCount',
    'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration',
    'JSHeapUsedSize', 'JSHeapTotalSize',
  ]);
  return Object.fromEntries(metrics.filter(metric => wanted.has(metric.name)).map(metric => [metric.name, metric.value]));
}

function createBenchmarkWindow() {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) process.stderr.write(`Renderer console: ${message}\n`);
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    process.stderr.write(`Renderer load failed (${code}): ${description}\n`);
  });
  return win;
}

async function captureScenario(scenario) {
  const capturePhase = async phase => {
    const win = createBenchmarkWindow();
    try {
      await win.loadFile(path.join(buildDirectory, 'timeline-benchmark.html'), {
        query: {
          swimlanes: String(scenario.swimlanes),
          tasks: String(scenario.tasks),
          weekends: scenario.weekends,
          widths: scenario.widths,
        },
      });
      process.stdout.write(`  ${phase} page loaded; waiting for Timeline rows\n`);
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Performance.enable');
      await win.webContents.executeJavaScript(`Promise.race([
        window.__timelineBenchmark.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeline ready timeout')), 120000))
      ])`);
      process.stdout.write(`  ${phase} Timeline ready; running gestures\n`);
      const page = await win.webContents.executeJavaScript('window.__timelineBenchmark.run()');
      const performanceMetrics = await win.webContents.debugger.sendCommand('Performance.getMetrics');
      return { page, chromium: metricMap(performanceMetrics.metrics) };
    } finally {
      if (!win.isDestroyed() && !win.webContents.isDestroyed() && win.webContents.debugger.isAttached()) {
        win.webContents.debugger.detach();
      }
      if (!win.isDestroyed()) win.destroy();
    }
  };
  return { ...scenario, cold: await capturePhase('cold'), warm: await capturePhase('warm') };
}

async function main() {
  process.stdout.write(isCandidateCapture ? 'Capturing candidate renderer\n' : 'Verifying unchanged control source\n');
  if (!isCandidateCapture) assertControlSourceIsUnchanged();
  const mainCommit = git('rev-parse', 'main');
  const branch = git('branch', '--show-current');
  const branchCommit = git('rev-parse', 'HEAD');
  const mergeBase = git('merge-base', 'main', 'HEAD');
  const timelineBlob = git('rev-parse', 'main:src/app/components/views/TimelineView.tsx');
  const rendererDiffHash = getRendererDiffHash();
  const artifactSuffix = isCandidateCapture
    ? `candidate-${candidateLabel || 'working-tree'}-${rendererDiffHash.slice(0, 8)}`
    : 'control-814a336';
  const sampledArtifactSuffix = sample ? `${artifactSuffix}-sample-${sample.padStart(2, '0')}` : artifactSuffix;
  const rawOutputPath = path.join(artifactDirectory, `${sampledArtifactSuffix}.json`);
  const environmentOutputPath = path.join(
    artifactDirectory,
    sample || isCandidateCapture ? `${sampledArtifactSuffix}-environment.json` : 'environment.json',
  );
  app.setPath('userData', isolatedUserData);
  await app.whenReady();
  process.stdout.write('Building standalone production harness\n');
  await buildHarness();

  const scenarios = [];
  for (const [swimlanes, tasks] of [[100, 1000], [500, 5000], [1000, 10000]]) {
    for (const weekends of ['visible', 'hidden']) {
      for (const widths of ['default', 'resized']) scenarios.push({ swimlanes, tasks, weekends, widths });
    }
  }

  const results = [];
  for (const scenario of scenarios) {
    process.stdout.write(`Capturing ${scenario.swimlanes} lanes / ${scenario.tasks} tasks / ${scenario.weekends} weekends / ${scenario.widths} widths\n`);
    results.push(await captureScenario(scenario));
  }

  const environment = {
    capturedAt: new Date().toISOString(),
    repository: 'omvra',
    branch,
    captureKind: isCandidateCapture ? 'candidate-working-tree' : 'unchanged-control',
    candidateLabel: isCandidateCapture ? candidateLabel || 'working-tree' : undefined,
    sample: sample ? Number(sample) : undefined,
    phases: {
      cold: 'first load in a new BrowserWindow',
      warm: 'second load in a fresh BrowserWindow sharing the same Electron session and resource cache',
    },
    control: {
      mainCommit,
      branchCommit,
      mergeBase,
      timelineViewBlob: timelineBlob,
      rendererSourceDiffersFromMain: isCandidateCapture,
      candidateRendererDiffSha256: isCandidateCapture ? rendererDiffHash : undefined,
    },
    fixture: {
      seed: 0x4f4d5652,
      profiles: [
        { swimlanes: 100, tasks: 1000 },
        { swimlanes: 500, tasks: 5000 },
        { swimlanes: 1000, tasks: 10000 },
      ],
      dateSpan: ['2019-01-07', '2033-12-15'],
    },
    runtime: {
      platform: process.platform,
      architecture: process.arch,
      hostNode: commandVersion('node', ['--version']),
      npm: commandVersion('npm', ['--version']),
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      embeddedNode: process.versions.node,
      viewport: { width: 1440, height: 900, zoomFactor: 1 },
    },
    isolation: {
      standaloneEntry: 'timeline-benchmark.html',
      workspaceHydrationMounted: false,
      electronPreloadMounted: false,
      temporaryUserDataDirectory: true,
      temporaryBuildDirectory: true,
    },
    build: {
      mode: 'Vite production build',
      config: 'vite.config.ts',
      entry: 'timeline-benchmark.html',
    },
  };

  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(environmentOutputPath, `${JSON.stringify(environment, null, 2)}\n`);
  writeFileSync(rawOutputPath, `${JSON.stringify({
    schemaVersion: 1,
    environmentFile: path.basename(environmentOutputPath),
    scenarios: results,
  }, null, 2)}\n`);
  process.stdout.write(`Wrote ${path.relative(repositoryRoot, rawOutputPath)}\n`);
  process.stdout.write(`Wrote ${path.relative(repositoryRoot, environmentOutputPath)}\n`);
}

main()
  .catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    rmSync(isolatedUserData, { recursive: true, force: true });
    rmSync(buildDirectory, { recursive: true, force: true });
    app.quit();
  });
