import { useRef } from 'react';
import { useDrag } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { Task } from '../types';

const TIMELINE_TASK_TYPE = 'TIMELINE_TASK';

interface DraggableTimelineTaskProps {
  task: Task;
  position: { left: number; width: number };
  getTaskColor: (status: string) => { className?: string; style?: React.CSSProperties; textClass?: string };
  handleResizeStart: (e: React.MouseEvent, task: Task, edge: 'start' | 'end') => void;
  onTaskClick: (task: Task) => void;
  resizingTaskId: string | null;
}

export function DraggableTimelineTask({
  task,
  position,
  getTaskColor,
  handleResizeStart,
  onTaskClick,
  resizingTaskId,
}: DraggableTimelineTaskProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: TIMELINE_TASK_TYPE,
    item: { type: TIMELINE_TASK_TYPE, task },
    canDrag: () => !resizingTaskId, // disable dragging while any task is being resized
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(ref);

  // Set up drag preview with custom image
  preview(getEmptyImage(), { captureDraggingState: true });

  const color = getTaskColor(task.status);
  const textClass = color.textClass ?? 'text-white';

  return (
    <div
      ref={ref}
      className={`absolute h-8 rounded-md px-3 flex items-center justify-between shadow-sm cursor-pointer pointer-events-auto group/task ${color.className ?? ''} ${textClass} text-xs transition-all ${
        resizingTaskId === task.id ? 'shadow-lg z-10' : ''
      } ${isDragging ? 'opacity-50' : ''}`}
      style={{
        left: `${position.left + 4}px`,
        width: `${position.width}px`,
        ...(color.style || {}),
      }}
      onClick={() => onTaskClick(task)}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/20 flex items-center justify-center opacity-0 group-hover/task:opacity-100"
        onMouseDown={(e) => handleResizeStart(e, task, 'start')}
      >
        <div className="w-0.5 h-4 bg-white/50 rounded"></div>
      </div>

      <span className="truncate flex-1 text-center">{task.title}</span>

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/20 flex items-center justify-center opacity-0 group-hover/task:opacity-100"
        onMouseDown={(e) => handleResizeStart(e, task, 'end')}
      >
        <div className="w-0.5 h-4 bg-white/50 rounded"></div>
      </div>
    </div>
  );
}

export { TIMELINE_TASK_TYPE };
