import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Task, TaskStatus } from '@/app/types';
import { Button } from '@/app/components/ui/button';

const TASK_ITEM_TYPE = 'TASK_CARD';

interface DraggableTaskCardProps {
  task: Task;
  index: number;
  onTaskClick: (task: Task) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onReorderTask: (dragIndex: number, hoverIndex: number, status: TaskStatus) => void;
  swimlanes: Array<{ id: TaskStatus; title: string }>;
}

interface DragItem {
  type: string;
  task: Task;
  index: number;
  status: TaskStatus;
}

export function DraggableTaskCard({
  task,
  index,
  onTaskClick,
  onMoveTask,
  onReorderTask,
  swimlanes,
}: DraggableTaskCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: TASK_ITEM_TYPE,
    item: { type: TASK_ITEM_TYPE, task, index, status: task.status },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: TASK_ITEM_TYPE,
    hover: (item: DragItem, monitor) => {
      if (!ref.current) return;

      const dragIndex = item.index;
      const hoverIndex = index;
      const dragStatus = item.status;
      const hoverStatus = task.status;

      // Don't replace items with themselves
      if (dragIndex === hoverIndex && dragStatus === hoverStatus) return;

      // Only reorder within same status
      if (dragStatus === hoverStatus) {
        const hoverBoundingRect = ref.current?.getBoundingClientRect();
        const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
        const clientOffset = monitor.getClientOffset();
        const hoverClientY = clientOffset!.y - hoverBoundingRect.top;

        if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
        if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;

        onReorderTask(dragIndex, hoverIndex, hoverStatus);
        item.index = hoverIndex;
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  // Combine drag and drop refs
  drag(drop(ref));

  return (
    <div
      ref={ref}
      className={`bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-200 ${
        isDragging ? 'opacity-50' : ''
      } ${isOver ? 'border-blue-400 border-2' : ''}`}
      onClick={() => onTaskClick(task)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">{task.title}</p>
          {task.notes && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.notes}</p>
          )}
        </div>
        <div className="w-3 h-3 rounded-full border-2 border-gray-300"></div>
      </div>

      {/* Move buttons */}
      <div className="mt-2 pt-2 border-t border-gray-100 flex gap-1">
        {task.status !== 'open' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={(e) => {
              e.stopPropagation();
              const currentIndex = swimlanes.findIndex(s => s.id === task.status);
              if (currentIndex > 0) {
                onMoveTask(task.id, swimlanes[currentIndex - 1].id);
              }
            }}
          >
            ←
          </Button>
        )}
        {task.status !== 'done' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={(e) => {
              e.stopPropagation();
              const currentIndex = swimlanes.findIndex(s => s.id === task.status);
              if (currentIndex < swimlanes.length - 1) {
                onMoveTask(task.id, swimlanes[currentIndex + 1].id);
              }
            }}
          >
            →
          </Button>
        )}
      </div>
    </div>
  );
}
