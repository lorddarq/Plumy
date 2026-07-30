import { useRef, useState } from 'react';
import { useDrag } from 'react-dnd';
import { Trash2 } from 'lucide-react';
import { Task } from '../types';
import { PenWritingIcon } from './icons/PenWritingIcon';
import { FilesCopyIcon } from './icons/FilesCopyIcon';
import { TaskExecutionAction } from './TaskExecutionAction';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './ui/context-menu';

const TIMELINE_TASK_TYPE = 'TIMELINE_TASK';
const PRIORITY_STYLES: Record<string, { className: string }> = {
  urgent: { className: 'bg-red-500/90' },
  moderate: { className: 'bg-orange-500/90' },
  normal: { className: 'bg-blue-500/90' },
  low: { className: 'bg-green-500/90' },
};

interface DraggableTimelineTaskProps {
  task: Task;
  position: { left: number; width: number };
  getTaskColor: (status: string) => { className?: string; style?: React.CSSProperties; textClass?: string; bulletOutlineColor?: string };
  handleResizeStart: (e: React.MouseEvent, task: Task, edge: 'start' | 'end') => void;
  onTaskClick: (task: Task) => void;
  onTaskEdit: (task: Task) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskDuplicate: (task: Task) => void;
  repositoryFolder?: string;
  resizingTaskId: string | null;
}

export function DraggableTimelineTask({
  task,
  position,
  getTaskColor,
  handleResizeStart,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  onTaskDuplicate,
  repositoryFolder,
  resizingTaskId,
}: DraggableTimelineTaskProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  const dragOffsetXRef = useRef(0);

  const [{ isDragging }, drag] = useDrag({
    type: TIMELINE_TASK_TYPE,
    item: () => ({
      type: TIMELINE_TASK_TYPE,
      task,
      dragOffsetX: dragOffsetXRef.current,
    }),
    canDrag: () => !resizingTaskId, // disable dragging while any task is being resized
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(dragHandleRef);

  const color = getTaskColor(task.status);
  const backgroundClass = color.className ?? '';
  const textClass = color.textClass ?? 'text-white';
  const bulletOutlineColor = color.bulletOutlineColor ?? 'rgba(255,255,255,0.28)';

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    const rect = ref.current?.getBoundingClientRect();
    dragOffsetXRef.current = rect ? e.clientX - rect.left : 0;
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if (!mouseDownPos.current) return;
    
    const dx = Math.abs(e.clientX - mouseDownPos.current.x);
    const dy = Math.abs(e.clientY - mouseDownPos.current.y);
    
    // If mouse didn't move much (< 5px), treat it as a click
    if (dx < 5 && dy < 5) {
      onTaskClick(task);
    }
    
    mouseDownPos.current = null;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onTaskClick(task);
  }

  const isResizing = resizingTaskId === task.id;

  function handleEditFromContextMenu() {
    setContextMenuOpen(false);
    window.setTimeout(() => onTaskEdit(task), 0);
  }

  return (
    <ContextMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
      <ContextMenuTrigger asChild>
        <div
          ref={ref}
          role="button"
          tabIndex={0}
          aria-label={`Open task ${task.title}`}
          className={`timeline-task-bar absolute h-8 rounded-md px-3 flex items-center gap-2 cursor-pointer pointer-events-auto group/task ${backgroundClass} ${textClass} text-xs font-medium ${
            isResizing ? 'is-resizing shadow-lg z-10' : ''
          } ${isDragging ? 'is-dragging opacity-0' : ''}`}
          style={{
            left: `${position.left + 4}px`,
            width: `${position.width}px`,
            ...(color.style || {}),
          }}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onKeyDown={handleKeyDown}
        >
      {/* Left resize handle */}
      <div
        className="timeline-task-resize-grip left-0 absolute top-0 bottom-0 w-2 cursor-ew-resize flex items-center justify-center opacity-0 group-hover/task:opacity-100"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleResizeStart(e, task, 'start');
        }}
      >
        <div className="timeline-task-resize-grip-indicator w-0.5 h-4 bg-white/50 rounded"></div>
      </div>

      <div ref={dragHandleRef} className="flex min-w-0 flex-1 items-center gap-2 h-full">
        <span
          className={`timeline-task-priority shrink-0 rounded-xl w-3 h-3 ${
            PRIORITY_STYLES[task.priority || 'normal']?.className || PRIORITY_STYLES.normal.className
          }`}
          style={{ boxShadow: `0 0 0 2px ${bulletOutlineColor}` }}
        />
        <span className="truncate flex-1 text-left">{task.title}</span>
      </div>

      {/* Right resize handle */}
      <div
        className="timeline-task-resize-grip right-0 absolute top-0 bottom-0 w-2 cursor-ew-resize flex items-center justify-center opacity-0 group-hover/task:opacity-100"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleResizeStart(e, task, 'end');
        }}
      >
        <div className="timeline-task-resize-grip-indicator w-0.5 h-4 bg-white/50 rounded"></div>
      </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent aria-label={`Actions for ${task.title}`}>
        <ContextMenuItem onSelect={handleEditFromContextMenu}>
          <PenWritingIcon />
          Edit
        </ContextMenuItem>
        <TaskExecutionAction task={task} repositoryFolder={repositoryFolder} />
        <ContextMenuItem variant="destructive" onSelect={() => onTaskDelete(task.id)}>
          <Trash2 />
          Delete
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onTaskDuplicate(task)}>
          <FilesCopyIcon />
          Duplicate
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export { TIMELINE_TASK_TYPE };
