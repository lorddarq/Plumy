import type { TaskStatus, StatusColumn } from '../types.ts';

export const swimlanes = [
  { id: 'open' as TaskStatus, title: 'Open', color: '#06b6d4', loadClassification: 'open-tasks', roadmapStage: 'not-started' },
  { id: 'in-progress' as TaskStatus, title: 'In Progress', color: '#3b82f6', loadClassification: 'in-progress', roadmapStage: 'in-progress' },
  { id: 'under-review' as TaskStatus, title: 'Under Review', color: '#ec4899', loadClassification: 'in-review', roadmapStage: 'in-review' },
  { id: 'done' as TaskStatus, title: 'Done', color: '#a855f7', loadClassification: 'none', roadmapStage: 'complete' },
] satisfies StatusColumn[];
