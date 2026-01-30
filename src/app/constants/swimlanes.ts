import { TaskStatus } from '../types';

export const swimlanes = [
  { id: 'open' as TaskStatus, title: 'Open', color: 'bg-cyan-500' },
  { id: 'in-progress' as TaskStatus, title: 'In Progress', color: 'bg-blue-500' },
  { id: 'under-review' as TaskStatus, title: 'Under Review', color: 'bg-pink-500' },
  { id: 'done' as TaskStatus, title: 'Done', color: 'bg-purple-500' },
];