import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Edit2, GripVertical } from 'lucide-react';
import { Task, TimelineSwimlane } from '@/app/types';
import { Button } from '@/app/components/ui/button';
import { DraggableTimelineTask, TIMELINE_TASK_TYPE } from '@/app/components/DraggableTimelineTask';

const ITEM_TYPE = 'SWIMLANE_ROW';

interface DraggableSwimlaneRowProps {
  swimlane: TimelineSwimlane;
  index: number;
  tasks: Task[];
  dates: Date[];
  dayWidth: number;
  onTaskClick: (task: Task) => void;
  onAddTask: (date: Date, swimlaneId: string) => void;
  onEditSwimlane: (swimlane: TimelineSwimlane) => void;
  onMoveSwimlane: (dragIndex: number, hoverIndex: number) => void;
  onMoveTaskToSwimlane: (taskId: string, swimlaneId: string) => void;
  getTaskPosition: (task: Task) => { left: number; width: number } | null;
  getTaskColor: (status: string) => string;
  handleResizeStart: (e: React.MouseEvent, task: Task, edge: 'start' | 'end') => void;
  resizingTaskId: string | null;
}

interface DragItem {
  type: string;
  index: number;
  swimlane: TimelineSwimlane;
}

interface TaskDragItem {
  type: string;
  task: Task;
}

export function DraggableSwimlaneRow({
  swimlane,
  index,
  tasks,
  dates,
  dayWidth,
  onTaskClick,
  onAddTask,
  onEditSwimlane,
  onMoveSwimlane,
  onMoveTaskToSwimlane,
  getTaskPosition,
  getTaskColor,
  handleResizeStart,
  resizingTaskId,
}: DraggableSwimlaneRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: ITEM_TYPE,
    item: { type: ITEM_TYPE, index, swimlane },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver: isSwimlaneOver }, dropSwimlane] = useDrop({
    accept: ITEM_TYPE,
    hover: (item: DragItem, monitor) => {
      if (!ref.current) return;

      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) return;

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset!.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;

      onMoveSwimlane(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  // Drop zone for timeline tasks
  const [{ isOver: isTaskOver, canDrop }, dropTask] = useDrop({
    accept: TIMELINE_TASK_TYPE,
    drop: (item: TaskDragItem) => {
      if (item.task.swimlaneId !== swimlane.id) {
        onMoveTaskToSwimlane(item.task.id, swimlane.id);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  // Combine drag and drop refs for swimlane reordering
  preview(dropSwimlane(ref));
  
  // Apply task drop to timeline area
  dropTask(timelineRef);

  const timelineTasks = tasks.filter(task => task.swimlaneId === swimlane.id);

  return (
    <div
      ref={ref}
      className={`flex border-b hover:bg-gray-50/50 group ${isDragging ? 'opacity-50' : ''} ${
        isSwimlaneOver ? 'bg-blue-50/50' : ''
      }`}
    >
      {/* Swimlane label */}
      <div className="w-[200px] border-r px-4 py-3 bg-white flex items-center justify-between group-hover:bg-gray-50/50">
        <div className="flex items-center gap-2">
          <div ref={drag} className="cursor-move">
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>
          <span className="text-sm font-medium text-gray-700">{swimlane.name}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100"
          onClick={() => onEditSwimlane(swimlane)}
        >
          <Edit2 className="w-3 h-3" />
        </Button>
      </div>

      {/* Timeline grid for this swimlane */}
      <div
        ref={timelineRef}
        className={`relative flex-1 transition-colors ${
          isTaskOver && canDrop ? 'bg-blue-100/50' : ''
        }`}
      >
        <div className="flex h-[60px]">
          {dates.map((date, dateIndex) => (
            <div
              key={dateIndex}
              className="w-[60px] border-r last:border-r-0 hover:bg-blue-50/30 cursor-pointer transition-colors"
              onClick={() => onAddTask(date, swimlane.id)}
            />
          ))}
        </div>

        {/* Task cards for this swimlane */}
        <div className="absolute inset-0 pointer-events-none">
          {timelineTasks.map((task) => {
            const position = getTaskPosition(task);
            if (!position) return null;

            return (
              <DraggableTimelineTask
                key={task.id}
                task={task}
                position={position}
                getTaskColor={getTaskColor}
                handleResizeStart={handleResizeStart}
                onTaskClick={onTaskClick}
                resizingTaskId={resizingTaskId}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
