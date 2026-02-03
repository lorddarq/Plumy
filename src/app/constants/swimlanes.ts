import { TaskStatus } from '../types';

export const swimlanes = [
  { id: 'open' as TaskStatus, title: 'Open', color: '#06b6d4' },
  { id: 'in-progress' as TaskStatus, title: 'In Progress', color: '#3b82f6' },
  { id: 'under-review' as TaskStatus, title: 'Under Review', color: '#ec4899' },
  { id: 'done' as TaskStatus, title: 'Done', color: '#a855f7' },
];