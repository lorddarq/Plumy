import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateTasksToTracks,
  buildTimelineRowWindow,
  buildTimelineTrackPlan,
  getTimelineCompensatedScrollTop,
} from './trackAllocation.ts';
import { filterTimelineTasks } from './statusColumnSemantics.ts';

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

test('indexes only authored project or person rows, including out-of-window tasks', () => {
  const tasks = [
    { id: 'past', title: 'Past', status: 'open' as const, swimlaneId: 'project-a', assigneeId: 'person-a', startDate: '2020-01-01', endDate: '2020-01-02' },
    { id: 'future', title: 'Future', status: 'open' as const, swimlaneId: 'project-b', assigneeId: 'person-a', startDate: '2035-01-01', endDate: '2035-01-02' },
    { id: 'orphan', title: 'Orphan', status: 'open' as const, swimlaneId: 'missing', assigneeId: 'missing' },
  ];

  const projects = buildTimelineTrackPlan(tasks, ['project-a', 'project-b'], 'projects', 40, 48);
  const people = buildTimelineTrackPlan(tasks, ['person-a'], 'people', 40, 48);

  assert.deepEqual(projects.tasksByRow.get('project-a')?.map(task => task.id), ['past']);
  assert.deepEqual(projects.tasksByRow.get('project-b')?.map(task => task.id), ['future']);
  assert.deepEqual(people.tasksByRow.get('person-a')?.map(task => task.id), ['past', 'future']);
  assert.equal(projects.taskCount, 2);
  assert.equal(people.taskCount, 2);
});

test('derives inclusive overlap tracks, empty-row heights, and prefix offsets together', () => {
  const plan = buildTimelineTrackPlan([
    { id: 'a', title: 'A', status: 'open', swimlaneId: 'one', startDate: '2026-01-01', endDate: '2026-01-03' },
    { id: 'b', title: 'B', status: 'open', swimlaneId: 'one', startDate: '2026-01-03', endDate: '2026-01-04' },
  ], ['one', 'empty'], 'projects', 40, 48);

  assert.deepEqual(plan.rowsById.get('one')?.trackAssignments, { a: 0, b: 1 });
  assert.deepEqual(
    [...plan.rowsById.values()].map(row => ({ id: row.rowId, height: row.height, top: row.topOffset })),
    [{ id: 'one', height: 80, top: 0 }, { id: 'empty', height: 48, top: 80 }]
  );
  assert.equal(plan.totalHeight, 128);
});

test('updates only authored row membership and date-driven tracks', () => {
  const tasks = [
    { id: 'a', title: 'A', status: 'open' as const, swimlaneId: 'one', startDate: '2026-01-01', endDate: '2026-01-03' },
    { id: 'b', title: 'B', status: 'open' as const, swimlaneId: 'one', startDate: '2026-01-02', endDate: '2026-01-02' },
  ];
  const initial = buildTimelineTrackPlan(tasks, ['one', 'two'], 'projects', 40, 48);
  const sameInputs = buildTimelineTrackPlan(tasks, ['one', 'two'], 'projects', 40, 48);
  const reassigned = buildTimelineTrackPlan(
    tasks.map(task => task.id === 'b' ? { ...task, swimlaneId: 'two' } : task),
    ['one', 'two'],
    'projects',
    40,
    48
  );
  const resized = buildTimelineTrackPlan(
    tasks.map(task => task.id === 'b' ? { ...task, startDate: '2026-01-04', endDate: '2026-01-04' } : task),
    ['one', 'two'],
    'projects',
    40,
    48
  );

  assert.deepEqual(sameInputs.rowsById.get('one')?.trackAssignments, initial.rowsById.get('one')?.trackAssignments);
  assert.deepEqual(reassigned.tasksByRow.get('one')?.map(task => task.id), ['a']);
  assert.deepEqual(reassigned.tasksByRow.get('two')?.map(task => task.id), ['b']);
  assert.deepEqual(resized.rowsById.get('one')?.trackAssignments, { a: 0, b: 0 });
});

test('plans only tasks left by completed-task filtering', () => {
  const tasks = [
    { id: 'open', title: 'Open', status: 'open' as const, swimlaneId: 'one', startDate: '2026-01-01', endDate: '2026-01-01' },
    { id: 'done', title: 'Done', status: 'done' as const, swimlaneId: 'one', startDate: '2026-01-01', endDate: '2026-01-01' },
  ];
  const columns = [
    { id: 'open', name: 'Open', stage: 'open' as const, color: 'bg-blue-500', order: 0 },
    { id: 'done', name: 'Done', stage: 'complete' as const, color: 'bg-green-500', order: 1 },
  ];
  const filtered = filterTimelineTasks(tasks, columns, false);
  const plan = buildTimelineTrackPlan(filtered, ['one'], 'projects', 40, 48);

  assert.deepEqual(plan.tasksByRow.get('one')?.map(task => task.id), ['open']);
  assert.equal(plan.rowsById.get('one')?.trackCount, 1);
});

test('windows variable-height rows at exact boundaries with pixel overscan', () => {
  const plan = buildTimelineTrackPlan([
    { id: 'a', title: 'A', status: 'open', swimlaneId: 'one', startDate: '2026-01-01', endDate: '2026-01-03' },
    { id: 'b', title: 'B', status: 'open', swimlaneId: 'one', startDate: '2026-01-02', endDate: '2026-01-02' },
  ], ['one', 'two', 'three', 'four'], 'projects', 40, 48);

  const atBoundary = buildTimelineRowWindow(plan, 80, 48, 0);
  const overscanned = buildTimelineRowWindow(plan, 128, 48, 48);

  assert.deepEqual(atBoundary.rows.map(row => row.rowId), ['two']);
  assert.equal(atBoundary.leadingSpacerHeight, 80);
  assert.equal(atBoundary.trailingSpacerHeight, 96);
  assert.deepEqual(overscanned.rows.map(row => row.rowId), ['two', 'three', 'four']);
  assert.equal(overscanned.leadingSpacerHeight + overscanned.rows.reduce((sum, row) => sum + row.height, 0) + overscanned.trailingSpacerHeight, plan.totalHeight);
});

test('handles empty datasets, large jumps, and interaction-pinned rows', () => {
  const empty = buildTimelineTrackPlan([], [], 'projects', 40, 48);
  assert.deepEqual(buildTimelineRowWindow(empty, 1000, 500, 200).rows, []);

  const rowIds = Array.from({ length: 1000 }, (_, index) => `row-${index}`);
  const plan = buildTimelineTrackPlan([], rowIds, 'projects', 40, 48);
  const jumped = buildTimelineRowWindow(plan, 40_000, 500, 96);
  const pinned = buildTimelineRowWindow(plan, 40_000, 500, 96, ['row-4']);

  assert.ok(jumped.startIndex > 800);
  assert.ok(jumped.rows.length < 20);
  assert.equal(jumped.rows[0].topOffset, jumped.leadingSpacerHeight);
  assert.equal(pinned.startIndex, 4);
  assert.equal(pinned.endIndex, jumped.endIndex);
});

test('compensates scrollTop when task edits change heights above the anchor row', () => {
  const rowIds = ['one', 'two', 'three'];
  const previous = buildTimelineTrackPlan([], rowIds, 'projects', 40, 48);
  const next = buildTimelineTrackPlan([
    { id: 'a', title: 'A', status: 'open', swimlaneId: 'one', startDate: '2026-01-01', endDate: '2026-01-03' },
    { id: 'b', title: 'B', status: 'open', swimlaneId: 'one', startDate: '2026-01-02', endDate: '2026-01-02' },
  ], rowIds, 'projects', 40, 48);

  assert.equal(getTimelineCompensatedScrollTop(previous, next, 58), 90);
  assert.equal(getTimelineCompensatedScrollTop(previous, next, 0), 0);

  const reordered = buildTimelineTrackPlan([], ['two', 'one', 'three'], 'projects', 40, 48);
  assert.equal(getTimelineCompensatedScrollTop(previous, reordered, 58), 58);
});
