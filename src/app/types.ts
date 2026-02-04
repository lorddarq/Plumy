export type TaskStatus = 'open' | 'in-progress' | 'under-review' | 'done';

export interface Person {
  id: string;
  name: string;
  role: string;
  avatar?: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  notes?: string;
  startDate?: string;
  endDate?: string;
  color?: string;
  swimlaneOnly?: boolean; // Tasks that only appear in swimlanes
  swimlaneId?: string; // Which timeline swimlane row this task belongs to
  assigneeId?: string; // Person assigned to this task
}

export interface Swimlane {
  id: TaskStatus;
  title: string;
  color?: string;
}

export interface TimelineSwimlane {
  id: string;
  name: string;
  color?: string;
}