import { parseISODateLocal } from '../utils/date.ts';
import { formatDateRangeLabel } from '../utils/dateRange.ts';
import type { StatusVisual } from '../utils/statusVisual.ts';
import type { ProjectMilestone, RoadmapStage, StatusColumn, Task, TaskStatus } from '../types.ts';
import { getRoadmapStage } from '../utils/statusColumnSemantics.ts';

export type MilestoneHealth = 'complete' | 'at-risk' | 'in-progress' | 'planned' | 'empty';

export type MilestoneStatusCounts = Record<TaskStatus, number> & Record<string, number>;

export interface RoadmapMilestoneSummary {
  linkedTasks: Task[];
  includedTasks: Task[];
  lateTasks: Task[];
  counts: MilestoneStatusCounts;
  stageCounts: Record<Exclude<RoadmapStage, 'excluded'>, number>;
  totalTasks: number;
  completedTasks: number;
  completionPercent: number;
  health: MilestoneHealth;
}

export interface MilestoneHealthVisual {
  label: string;
  className: string;
}

const EMPTY_COUNTS: MilestoneStatusCounts = {
  open: 0,
  'in-progress': 0,
  'under-review': 0,
  done: 0,
};

export const MILESTONE_HEALTH_VISUALS: Record<MilestoneHealth, MilestoneHealthVisual> = {
  complete: {
    label: 'Complete',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  'at-risk': {
    label: 'At risk',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
  'in-progress': {
    label: 'In progress',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  planned: {
    label: 'Planned',
    className: 'border-gray-200 bg-gray-50 text-gray-700',
  },
  empty: {
    label: 'No tasks',
    className: 'border-gray-200 bg-white text-gray-500',
  },
};

export function getMilestoneHealthVisual(health: MilestoneHealth): MilestoneHealthVisual {
  return MILESTONE_HEALTH_VISUALS[health];
}

export function getMilestoneProjectIds(milestone: ProjectMilestone): string[] {
  if (Array.isArray(milestone.projectIds) && milestone.projectIds.length > 0) {
    return milestone.projectIds;
  }
  return milestone.projectId ? [milestone.projectId] : [];
}

export function getTaskProjectIds(task: Task): string[] {
  if (Array.isArray(task.projectIds) && task.projectIds.length > 0) {
    return task.projectIds;
  }
  return task.swimlaneId ? [task.swimlaneId] : [];
}

export function getTasksForMilestone(milestone: ProjectMilestone, tasks: Task[]): Task[] {
  const linkedTaskIds = new Set(milestone.linkedTaskIds || []);
  return tasks.filter(task => task.milestoneId === milestone.id || linkedTaskIds.has(task.id));
}

export function getMilestoneForTask(task: Task | null | undefined, milestones: ProjectMilestone[]): ProjectMilestone | undefined {
  if (!task) return undefined;
  if (task.milestoneId) {
    const directMilestone = milestones.find(milestone => milestone.id === task.milestoneId);
    if (directMilestone) return directMilestone;
  }
  return milestones.find(milestone => (milestone.linkedTaskIds || []).includes(task.id));
}

export function isTaskLateForMilestone(task: Task, milestone: ProjectMilestone): boolean {
  if (!task.endDate || !milestone.endDate) return false;
  const taskEnd = parseISODateLocal(task.endDate);
  const milestoneEnd = parseISODateLocal(milestone.endDate);
  if (!taskEnd || !milestoneEnd) return false;
  return taskEnd.getTime() > milestoneEnd.getTime();
}

export function summarizeMilestone(milestone: ProjectMilestone, tasks: Task[], statusColumns: StatusColumn[] = []): RoadmapMilestoneSummary {
  const linkedTasks = getTasksForMilestone(milestone, tasks);
  const includedTasks = linkedTasks.filter(task => getRoadmapStage(statusColumns, task.status) !== 'excluded');
  const counts = includedTasks.reduce<MilestoneStatusCounts>((nextCounts, task) => {
    nextCounts[task.status] = (nextCounts[task.status] || 0) + 1;
    return nextCounts;
  }, { ...EMPTY_COUNTS });
  const stageCounts = includedTasks.reduce<RoadmapMilestoneSummary['stageCounts']>((nextCounts, task) => {
    const stage = getRoadmapStage(statusColumns, task.status);
    if (stage !== 'excluded') nextCounts[stage] += 1;
    return nextCounts;
  }, { 'not-started': 0, 'in-progress': 0, 'in-review': 0, complete: 0 });
  const lateTasks = includedTasks.filter(task => isTaskLateForMilestone(task, milestone));
  const totalTasks = includedTasks.length;
  const completedTasks = stageCounts.complete;
  const completionPercent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  let health: MilestoneHealth = 'empty';
  if (totalTasks > 0 && completedTasks === totalTasks) {
    health = 'complete';
  } else if (totalTasks > 0 && lateTasks.length > 0) {
    health = 'at-risk';
  } else if (stageCounts['in-progress'] > 0 || stageCounts['in-review'] > 0) {
    health = 'in-progress';
  } else if (totalTasks > 0) {
    health = 'planned';
  }

  return {
    linkedTasks,
    includedTasks,
    lateTasks,
    counts,
    stageCounts,
    totalTasks,
    completedTasks,
    completionPercent,
    health,
  };
}

export function isMilestoneComplete(
  milestone: ProjectMilestone,
  tasks: Task[],
  statusColumns: StatusColumn[] = []
): boolean {
  return summarizeMilestone(milestone, tasks, statusColumns).health === 'complete';
}

export function getMilestoneDateRangeLabel(milestone: ProjectMilestone): string {
  return formatDateRangeLabel(milestone.startDate, milestone.endDate);
}

export function wouldCreateDependencyCycle(
  taskId: string,
  dependencyId: string,
  getDependencyIds: (currentTaskId: string) => string[] | undefined
): boolean {
  if (taskId === dependencyId) return true;

  const visited = new Set<string>();
  const visit = (currentTaskId: string): boolean => {
    if (currentTaskId === taskId) return true;
    if (visited.has(currentTaskId)) return false;
    visited.add(currentTaskId);
    return (getDependencyIds(currentTaskId) || []).some(visit);
  };

  return visit(dependencyId);
}

export function assertNoDependencyCycle(
  taskId: string,
  dependencyIds: string[],
  getDependencyIds: (currentTaskId: string) => string[] | undefined
): boolean {
  return dependencyIds.every(dependencyId => !wouldCreateDependencyCycle(taskId, dependencyId, getDependencyIds));
}
