import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createBenchmarkMonthWidths,
  createTimelineBenchmarkFixture,
  TIMELINE_FIXTURE_PROFILES,
} from './fixture.ts';

test('fixtures are deterministic and preserve the requested scale and date span', () => {
  for (const profile of TIMELINE_FIXTURE_PROFILES) {
    const first = createTimelineBenchmarkFixture(profile);
    const second = createTimelineBenchmarkFixture(profile);
    assert.deepEqual(first, second);
    assert.equal(first.swimlanes.length, profile.swimlaneCount);
    assert.equal(first.tasks.length, profile.taskCount);
    assert.equal(first.people.length, profile.swimlaneCount);
    assert.equal(first.tasks.filter(task => task.status === 'done').length, 0);
    assert.equal(first.tasks[0].startDate, '2019-01-07');
    assert.equal(first.tasks.at(-1)?.endDate, '2033-12-15');

    const tasksPerLane = new Map<string, number>();
    first.tasks.forEach(task => tasksPerLane.set(task.swimlaneId!, (tasksPerLane.get(task.swimlaneId!) ?? 0) + 1));
    assert.equal(tasksPerLane.size, profile.swimlaneCount);
    assert.ok([...tasksPerLane.values()].every(count => count === 10));

    const denseTasks = first.tasks.slice(10, 13);
    assert.ok(denseTasks[1].startDate! <= denseTasks[0].endDate!);
    assert.ok(denseTasks[2].startDate! <= denseTasks[0].endDate!);
  }
});

test('resized month widths cover the full fixture window and differ from defaults', () => {
  assert.deepEqual(createBenchmarkMonthWidths('default'), {});
  const resized = createBenchmarkMonthWidths('resized');
  assert.equal(Object.keys(resized).length, 15 * 12);
  assert.ok(new Set(Object.values(resized)).size > 1);
  assert.equal(resized['2019-0'] > 0, true);
  assert.equal(resized['2033-11'] > 0, true);
});

test('benchmark harness stays outside workspace hydration and persistence', async () => {
  const source = await readFile(new URL('./harness.tsx', import.meta.url), 'utf8');
  const html = await readFile(new URL('../../timeline-benchmark.html', import.meta.url), 'utf8');
  for (const forbidden of ['workspaceStore', 'WorkspaceProvider', 'workspaceHydration', 'electron-store', 'window.electron']) {
    assert.equal(source.includes(forbidden), false, `harness must not reference ${forbidden}`);
  }
  assert.equal(source.includes('timelineAuthoredRows'), true, 'harness must wait for the virtual row contract');
  assert.equal(source.includes("query.get('parity') === 'true'"), true, 'interactive parity runs must be explicit and stay out of performance captures');
  assert.equal(source.includes("type: 'move-task'"), true, 'parity runs must expose task drop results');
  assert.equal(source.includes("type: 'reorder-swimlanes'"), true, 'parity runs must expose swimlane reorder results');
  assert.equal(source.includes("performance.getEntriesByType('paint')"), true, 'performance runs must record paint milestones');
  assert.equal(html.includes('id="root" style="height: 100%"'), true, 'benchmark root must constrain the Timeline viewport');
});

test('benchmark runner keeps repeated cold and warm samples distinct', async () => {
  const source = await readFile(new URL('./run-baseline.cjs', import.meta.url), 'utf8');
  assert.equal(source.includes("--sample="), true);
  assert.equal(source.includes("cold: await capturePhase('cold')"), true);
  assert.equal(source.includes("warm: await capturePhase('warm')"), true);
  assert.equal(source.includes("const capturePhase = async phase => {\n    const win = createBenchmarkWindow();"), true, 'each phase must have isolated Chromium counters and heap gauges');
});
