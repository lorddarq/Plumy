import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Person, Task, TaskStatus, StatusColumn } from '../types';
import { TaskCard } from './TaskCard';
import { getTaskAssignmentSummary } from '../utils/taskAssignment';

export const TASK_ITEM_TYPE = 'TASK_CARD';

export interface TaskDragItem {
  type: string;
  task: Task;
  index: number;
  status: TaskStatus;
  size?: {
    height: number;
    width: number;
  };
}

export interface TaskDropIndicator {
  targetTaskId: string;
  status: TaskStatus;
  position: 'before' | 'after';
  draggedSize?: TaskDragItem['size'];
}

interface DraggableTaskCardProps {
  task: Task;
  index: number;
  onTaskClick: (task: Task) => void;
  onEditTask?: (task: Task) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onTaskDropIndicatorChange: (indicator: TaskDropIndicator) => void;
  onTaskDropIndicatorClear: () => void;
  onTaskDrop: (draggedTask: Task, status: TaskStatus, indicator: TaskDropIndicator) => void;
  swimlanes: StatusColumn[];
  people: Person[];
}

export function DraggableTaskCard({
  task,
  index,
  onTaskClick,
  onEditTask,
  onMoveTask,
  onTaskDropIndicatorChange,
  onTaskDropIndicatorClear,
  onTaskDrop,
  swimlanes,
  people,
}: DraggableTaskCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: TASK_ITEM_TYPE,
    item: () => {
      onTaskDropIndicatorClear();
      const rect = ref.current?.getBoundingClientRect();
      return {
        type: TASK_ITEM_TYPE,
        task,
        index,
        status: task.status,
        size: rect ? { height: rect.height, width: rect.width } : undefined,
      };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: () => {
      onTaskDropIndicatorClear();
    },
  });

  const [, drop] = useDrop({
    accept: TASK_ITEM_TYPE,
    hover: (item: TaskDragItem, monitor) => {
      if (!ref.current) return;

      const hoverStatus = task.status;
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const position = hoverClientY > hoverMiddleY ? 'after' : 'before';

      onTaskDropIndicatorChange({
        targetTaskId: task.id,
        status: hoverStatus,
        position,
        draggedSize: item.size,
      });
    },
    drop: (item: TaskDragItem, monitor) => {
      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const clientOffset = monitor.getClientOffset();
      const fallbackIndicator: TaskDropIndicator = {
        targetTaskId: task.id,
        status: task.status,
        position: hoverBoundingRect && clientOffset && clientOffset.y > hoverBoundingRect.top + hoverBoundingRect.height / 2
          ? 'after'
          : 'before',
        draggedSize: item.size,
      };

      onTaskDrop(item.task, task.status, fallbackIndicator);
      onTaskDropIndicatorClear();
    },
  });

  // Combine drag and drop refs
  drag(drop(ref));
  const assignmentSummary = getTaskAssignmentSummary(task, people);

  return (
    <div
      ref={ref}
      className={`kanban-task-card-frame ${isDragging ? 'is-dragging' : ''}`}
    >
      <TaskCard
        title={task.title}
        notes={task.notes}
        color={task.color}
        project={task.project}
        priority={task.priority}
        orchestratorName={assignmentSummary.orchestratorName === 'Unassigned' ? undefined : assignmentSummary.orchestratorName}
        contributorCount={assignmentSummary.contributorCount}
        onClick={() => onTaskClick(task)}
        onEdit={onEditTask ? () => onEditTask(task) : undefined}
      />
    </div>
  );
}
