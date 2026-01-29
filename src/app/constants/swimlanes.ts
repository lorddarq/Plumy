import { TaskStatus } from '../types';

export const swimlanes = [
  { id: 'open' as TaskStatus, title: 'Open', color: 'bg-cyan-500', icon: 'rocket' },
  { id: 'in-progress' as TaskStatus, title: 'In Progress', color: 'bg-blue-500', icon: 'zap' },
  { id: 'under-review' as TaskStatus, title: 'Under Review', color: 'bg-pink-500', icon: 'alert' },
  { id: 'done' as TaskStatus, title: 'Done', color: 'bg-purple-500', icon: 'check' },
];

export const getIcon = (iconName: string) => {
  switch (iconName) {
    case 'rocket':
      return '🚀';
    case 'zap':
      return '⚡';
    case 'alert':
      return '⚠️';
    case 'check':
      return '✅';
    default:
      return null;
  }
};