import type { Task, TaskComplexity, TaskPriority, TimelineSwimlane } from '../types.ts';
import { getTaskProjectIds } from '../domain/roadmap.ts';

export type KanbanTaskOrder = 'manual' | 'urgency' | 'project' | 'complexity' | 'newest' | 'oldest';

const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, moderate: 1, normal: 2, low: 3 };
const COMPLEXITY_ORDER: Record<TaskComplexity, number> = { hard: 0, medium: 1, routine: 2 };

function taskCreatedTime(task: Task): number {
  const createdAt = task.createdAt ? Date.parse(task.createdAt) : Number.parseInt(task.id, 10);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function projectLabel(task: Task, projects: TimelineSwimlane[]): string {
  const names = getTaskProjectIds(task)
    .map(projectId => projects.find(project => project.id === projectId)?.name)
    .filter((name): name is string => Boolean(name));
  return (names.length > 0 ? names.join(', ') : task.project || '').toLocaleLowerCase();
}

export function orderKanbanTasks(
  tasks: Task[],
  order: KanbanTaskOrder,
  projects: TimelineSwimlane[] = []
): Task[] {
  if (order === 'manual') return tasks;

  return tasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      let result = 0;
      if (order === 'urgency') result = PRIORITY_ORDER[left.task.priority || 'normal'] - PRIORITY_ORDER[right.task.priority || 'normal'];
      if (order === 'complexity') result = COMPLEXITY_ORDER[left.task.complexity || 'medium'] - COMPLEXITY_ORDER[right.task.complexity || 'medium'];
      if (order === 'project') result = projectLabel(left.task, projects).localeCompare(projectLabel(right.task, projects));
      if (order === 'newest' || order === 'oldest') {
        result = taskCreatedTime(right.task) - taskCreatedTime(left.task);
        if (order === 'oldest') result *= -1;
      }
      return result || left.index - right.index;
    })
    .map(({ task }) => task);
}
