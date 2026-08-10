import type { LoadClassification, RoadmapStage, StatusColumn, Task } from '../types.ts';

export function getDefaultColumnSemantics(id: string): Pick<StatusColumn, 'loadClassification' | 'roadmapStage'> {
  switch (id) {
    case 'open':
      return { loadClassification: 'open-tasks', roadmapStage: 'not-started' };
    case 'in-progress':
      return { loadClassification: 'in-progress', roadmapStage: 'in-progress' };
    case 'under-review':
      return { loadClassification: 'in-review', roadmapStage: 'in-review' };
    case 'done':
      return { loadClassification: 'none', roadmapStage: 'complete' };
    default:
      return { loadClassification: 'none', roadmapStage: 'excluded' };
  }
}

export function getStatusIdsForLoad(columns: StatusColumn[], classification: LoadClassification): string[] {
  return columns.filter(column => (column.loadClassification ?? getDefaultColumnSemantics(column.id).loadClassification) === classification).map(column => column.id);
}

export function getRoadmapStage(columns: StatusColumn[], statusId: string): RoadmapStage {
  return columns.find(column => column.id === statusId)?.roadmapStage ?? getDefaultColumnSemantics(statusId).roadmapStage;
}

export function filterTimelineTasks(tasks: Task[], columns: StatusColumn[], showCompleted: boolean): Task[] {
  return showCompleted
    ? tasks
    : tasks.filter(task => getRoadmapStage(columns, task.status) !== 'complete');
}

export function getRoadmapStageProgress(stage: RoadmapStage): number {
  if (stage === 'complete') return 100;
  if (stage === 'in-review') return 80;
  if (stage === 'in-progress') return 50;
  return 0;
}

export const LOAD_CLASSIFICATIONS: Array<{ value: LoadClassification; label: string }> = [
  { value: 'open-tasks', label: 'Open tasks' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'in-review', label: 'In review' },
  { value: 'none', label: 'No load' },
];

export const ROADMAP_STAGES: Array<{ value: RoadmapStage; label: string }> = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'in-review', label: 'In review' },
  { value: 'complete', label: 'Complete' },
  { value: 'excluded', label: 'Excluded' },
];
