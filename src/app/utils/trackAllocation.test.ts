import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateTasksToTracks } from './trackAllocation.ts';

test('allocates dense swimlane task sets without quadratic overlap scans', () => {
  const tasks = Array.from({ length: 5000 }, (_, index) => ({
    id: `task-${index}`,
    title: `Task ${index}`,
    status: 'open' as const,
    startDate: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    endDate: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
  }));

  const assignments = allocateTasksToTracks(tasks);

  assert.equal(Object.keys(assignments).length, tasks.length);
  assert.equal(Math.max(...Object.values(assignments)), 178);
});

test('keeps first-fit track ordering for overlapping tasks', () => {
  const assignments = allocateTasksToTracks([
    { id: 'a', title: 'A', status: 'open', startDate: '2026-01-01', endDate: '2026-01-03' },
    { id: 'b', title: 'B', status: 'open', startDate: '2026-01-02', endDate: '2026-01-02' },
    { id: 'c', title: 'C', status: 'open', startDate: '2026-01-04', endDate: '2026-01-04' },
  ]);

  assert.deepEqual(assignments, { a: 0, b: 1, c: 0 });
});

test('keeps undated tasks on the first track without blocking dated tasks', () => {
  const assignments = allocateTasksToTracks([
    { id: 'undated', title: 'Undated', status: 'open' },
    { id: 'dated', title: 'Dated', status: 'open', startDate: '2026-01-01', endDate: '2026-01-01' },
  ]);

  assert.deepEqual(assignments, { dated: 0, undated: 0 });
});
