import test from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '../types.ts';
import { orderKanbanTasks } from './taskOrdering.ts';

const tasks: Task[] = [
  { id: '100', title: 'Routine', status: 'open', priority: 'low', complexity: 'routine', project: 'Zeta' },
  { id: '300', title: 'Urgent', status: 'open', priority: 'urgent', complexity: 'hard', project: 'Alpha' },
  { id: '200', title: 'Medium', status: 'open', priority: 'moderate', complexity: 'medium', project: 'Beta' },
];

test('orders Kanban tasks by requested criteria while preserving ties', () => {
  assert.deepEqual(orderKanbanTasks(tasks, 'urgency').map(task => task.title), ['Urgent', 'Medium', 'Routine']);
  assert.deepEqual(orderKanbanTasks(tasks, 'complexity').map(task => task.title), ['Urgent', 'Medium', 'Routine']);
  assert.deepEqual(orderKanbanTasks(tasks, 'project').map(task => task.title), ['Urgent', 'Medium', 'Routine']);
  assert.deepEqual(orderKanbanTasks(tasks, 'newest').map(task => task.title), ['Urgent', 'Medium', 'Routine']);
  assert.deepEqual(orderKanbanTasks(tasks, 'oldest').map(task => task.title), ['Routine', 'Medium', 'Urgent']);
  assert.deepEqual(orderKanbanTasks(tasks, 'manual'), tasks);
});
