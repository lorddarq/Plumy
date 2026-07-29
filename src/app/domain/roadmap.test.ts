import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectMilestone, Task } from '../types.ts';
import {
  assertNoDependencyCycle,
  getMilestoneHealthVisual,
  isMilestoneComplete,
  summarizeMilestone,
  wouldCreateDependencyCycle,
} from './roadmap.ts';
import {
  getStatusLabel,
  getStatusVisual,
  resolveStatusColor,
} from '../utils/statusVisual.ts';
import { getRoadmapStageProgress } from '../utils/statusColumnSemantics.ts';

const statusColumns = [
  { id: 'open', title: 'Open', color: '#d1d5db' },
  { id: 'in-progress', title: 'Doing', color: '#3b82f6' },
  { id: 'under-review', title: 'Review', color: 'bg-amber-500' },
  { id: 'done', title: 'Done', color: '#10b981' },
] as const;

test('getStatusVisual derives label, color, and progress from shared status columns', () => {
  const visual = getStatusVisual(statusColumns as any, 'under-review');

  assert.equal(visual.label, 'Review');
  assert.equal(visual.color, '#f59e0b');
  assert.equal(visual.backgroundClassName, 'bg-amber-500');
  assert.equal(visual.progressPercent, 80);
});

test('getStatusLabel falls back to the raw status when the column is missing', () => {
  assert.equal(getStatusLabel(statusColumns as any, 'blocked'), 'blocked');
});

test('summarizeMilestone and getMilestoneHealthVisual share milestone health semantics', () => {
  const milestone: ProjectMilestone = {
    id: 'milestone-1',
    title: 'Architecture',
    projectIds: ['project-1'],
    endDate: '2026-07-10',
    linkedTaskIds: ['task-1', 'task-2'],
  };
  const tasks: Task[] = [
    { id: 'task-1', title: 'Shared status layer', status: 'done', endDate: '2026-07-09' },
    { id: 'task-2', title: 'Roadmap rewiring', status: 'in-progress', endDate: '2026-07-08' },
  ];

  const summary = summarizeMilestone(milestone, tasks);
  const health = getMilestoneHealthVisual(summary.health);

  assert.equal(summary.health, 'in-progress');
  assert.equal(summary.completionPercent, 50);
  assert.equal(health.label, 'In progress');
  assert.match(health.className, /blue/);
});

test('summarizeMilestone derives progress from column roadmap stages and excludes non-roadmap work', () => {
  const milestone: ProjectMilestone = {
    id: 'milestone-semantic',
    title: 'Semantic roadmap',
    projectIds: ['project-1'],
    endDate: '2026-07-10',
    linkedTaskIds: ['task-open', 'task-complete', 'task-excluded'],
  };
  const tasks: Task[] = [
    { id: 'task-open', title: 'Queued', status: 'open' },
    { id: 'task-complete', title: 'Shipped', status: 'in-progress' },
    { id: 'task-excluded', title: 'Parking lot', status: 'under-review' },
  ];
  const columns = [
    { id: 'open', title: 'Open', roadmapStage: 'not-started' as const },
    { id: 'in-progress', title: 'Doing', roadmapStage: 'complete' as const },
    { id: 'under-review', title: 'Parking lot', roadmapStage: 'excluded' as const },
  ];

  const summary = summarizeMilestone(milestone, tasks, columns);

  assert.equal(summary.linkedTasks.length, 3);
  assert.equal(summary.includedTasks.length, 2);
  assert.equal(summary.totalTasks, 2);
  assert.equal(summary.completionPercent, 50);
  assert.equal(summary.stageCounts.complete, 1);
  assert.equal(getRoadmapStageProgress('complete'), 100);
  assert.equal(getRoadmapStageProgress('excluded'), 0);
});

test('isMilestoneComplete follows the shared milestone health semantics', () => {
  const milestone: ProjectMilestone = {
    id: 'milestone-complete',
    title: 'Completed milestone',
    endDate: '2026-07-10',
    linkedTaskIds: ['task-done'],
  };

  assert.equal(isMilestoneComplete(milestone, [{ id: 'task-done', title: 'Shipped', status: 'done' }]), true);
  assert.equal(isMilestoneComplete(milestone, [{ id: 'task-done', title: 'Still working', status: 'in-progress' }]), false);
});

test('completed milestones stay complete when finished tasks were late', () => {
  const milestone: ProjectMilestone = {
    id: 'milestone-late-complete',
    title: 'Late but completed milestone',
    projectIds: ['project-1'],
    endDate: '2026-07-10',
    linkedTaskIds: ['task-late'],
  };
  const tasks: Task[] = [
    { id: 'task-late', title: 'Finished after target', status: 'done', endDate: '2026-07-11' },
  ];

  const summary = summarizeMilestone(milestone, tasks);

  assert.equal(summary.lateTasks.length, 1);
  assert.equal(summary.health, 'complete');
  assert.equal(isMilestoneComplete(milestone, tasks), true);
});

test('wouldCreateDependencyCycle catches loops across linked tasks', () => {
  const dependenciesByTaskId: Record<string, string[]> = {
    'task-1': ['task-2'],
    'task-2': ['task-3'],
    'task-3': [],
  };

  assert.equal(
    wouldCreateDependencyCycle('task-3', 'task-1', taskId => dependenciesByTaskId[taskId]),
    true
  );
  assert.equal(
    wouldCreateDependencyCycle('task-1', 'task-3', taskId => dependenciesByTaskId[taskId]),
    false
  );
  assert.equal(
    assertNoDependencyCycle('task-3', ['task-1'], taskId => dependenciesByTaskId[taskId]),
    false
  );
  assert.equal(
    assertNoDependencyCycle('task-1', ['task-3'], taskId => dependenciesByTaskId[taskId]),
    true
  );
});

test('resolveStatusColor normalizes tailwind-style status colors for shared pills', () => {
  assert.equal(resolveStatusColor('under-review', 'bg-amber-500'), '#f59e0b');
  assert.equal(resolveStatusColor('bug', undefined), '#da0004');
});

test('getStatusVisual keeps class-based tokens available to non-roadmap views', () => {
  const visual = getStatusVisual(statusColumns as any, 'under-review');

  assert.equal(visual.backgroundClassName, 'bg-amber-500');
  assert.equal(visual.backgroundStyle, undefined);
  assert.equal(visual.textClassName, 'text-black');
});

test('getStatusVisual accepts an explicit color override for shared dependency surfaces', () => {
  const visual = getStatusVisual(statusColumns as any, 'done', 'bg-blue-500');

  assert.equal(visual.label, 'Done');
  assert.equal(visual.color, '#3b82f6');
  assert.equal(visual.backgroundClassName, 'bg-blue-500');
  assert.equal(visual.backgroundStyle, undefined);
});
