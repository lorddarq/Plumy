export type TaskStatus = 'open' | 'in-progress' | 'under-review' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  notes?: string;
  startDate?: string;
  endDate?: string;
  swimlaneOnly?: boolean; // Tasks that only appear in swimlanes
  swimlaneId?: string; // Which timeline swimlane row this task belongs to
}

export interface Swimlane {
  id: TaskStatus;
  title: string;
  color: string;
  icon: string;
}

export interface TimelineSwimlane {
  id: string;
  name: string;
  color?: string;
}