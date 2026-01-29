import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Edit2, GripVertical } from 'lucide-react';
import { Task, TimelineSwimlane } from '../types';
import { Button } from '../components/ui/button';
import { DraggableTimelineTask, TIMELINE_TASK_TYPE } from '../components/DraggableTimelineTask';

const ITEM_TYPE = 'SWIMLANE_ROW';

interface DraggableSwimlaneRowProps {
  swimlane: TimelineSwimlane;
  index: number;
  tasks: Task[];
  dates: Date[];
  dateWidths?: number[]; // per-date widths computed by TimelineView
  monthKeys?: string[];
  monthWidths?: Record<string, number>;
  datesByMonth?: Record<string, Date[]>;
  totalTimelineWidth?: number;
  rowHeight?: number;
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
  dateWidths,
  monthKeys,
  monthWidths,
  datesByMonth,
  totalTimelineWidth,
  onTaskClick,
  onAddTask,
  onEditSwimlane,
  onMoveSwimlane,
  onMoveTaskToSwimlane,
  getTaskPosition,
  getTaskColor,
  handleResizeStart,
  resizingTaskId,
  rowHeight,
}: DraggableSwimlaneRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Drop zone for timeline tasks — row handles only task drops
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

  // Apply task drop to timeline area
  dropTask(timelineRef);

  const timelineTasks = tasks.filter(task => task.swimlaneId === swimlane.id);

  return (
    <div
      ref={ref}
      className={`flex border-b border-gray-100 hover:bg-gray-50/50 group ${isTaskOver && canDrop ? 'bg-blue-100/50' : ''}`}
      style={{ height: 'var(--row-height)' }}
    >
    

      {/* Timeline grid for this swimlane */}
      <div
        ref={timelineRef}
        className={`relative flex-1 transition-colors ${
          isTaskOver && canDrop ? 'bg-blue-100/50' : ''
        }`}
      >
        {/* Month containers; each contains the swimlane cell for that month and any task fragments that overlap it. */}
        <div className="flex" style={{ height: 'var(--row-height)' }}>
          {/* Precompute prefix sums for date widths to make slicing easier */}
          {(() => {
            const dayWidths = (dateWidths && dateWidths.length === dates.length) ? dateWidths : dates.map(() => 60);
            const prefix: number[] = [0];
            for (let i = 0; i < dayWidths.length; i++) prefix.push(prefix[i] + dayWidths[i]);

            const firstDate = dates[0];

            // helper to compute day index for a date (0-based)
            const dateIndex = (d: Date) => Math.floor((new Date(d).getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));

            // build monthStarts map
            const monthStarts: Record<string, number> = {};
            (monthKeys ?? []).forEach((k) => {
              const md = datesByMonth?.[k];
              if (md && md.length) {
                const idx = dates.findIndex(d => d.getTime() === md[0].getTime());
                monthStarts[k] = idx >= 0 ? idx : 0;
              }
            });

            // Precompute task ranges
            const tasksRanges = timelineTasks.map(task => {
              const s = task.startDate ? dateIndex(new Date(task.startDate)) : -1;
              const e = task.endDate ? (dateIndex(new Date(task.endDate))) : -1;
              return { task, startIndex: s, endIndex: e };
            });

            return (monthKeys ?? []).map((monthKey) => {
              const startIdx = monthStarts[monthKey] ?? 0;
              const len = datesByMonth?.[monthKey]?.length ?? 0;
              const monthLeft = prefix[startIdx];
              const monthWidth = prefix[startIdx + len] - prefix[startIdx];

              return (
                <div
                  key={monthKey}
                  className="border-r last:border-r-0 relative flex-shrink-0"
                  style={{ width: `${monthWidth}px` }}
                >
                  <div className="h-full relative">
                    {tasksRanges.map(({ task, startIndex, endIndex }) => {
                      if (startIndex < 0 || endIndex < 0) return null;

                      const overlapStart = Math.max(startIndex, startIdx);
                      const overlapEnd = Math.min(endIndex, startIdx + len - 1);
                      if (overlapStart > overlapEnd) return null;

                      const leftWithin = prefix[overlapStart] - monthLeft;
                      let widthWithin = prefix[overlapEnd + 1] - prefix[overlapStart];
                      widthWithin = Math.max(8, widthWithin - 8); // small padding like before

                      // vertically center using CSS calc against the --row-height variable
                      const TASK_RENDER_HEIGHT = 32; // matches h-8 in tailwind (8 * 4px)
                      const topCalc = `calc((var(--row-height) - ${TASK_RENDER_HEIGHT}px) / 2)`;

                      return (
                        <div
                          key={`${task.id}-${monthKey}`}
                          className="absolute"
                          style={{ left: `${leftWithin}px`, width: `${widthWithin}px`, top: topCalc as any }}
                        >
                          <DraggableTimelineTask
                            task={task}
                            position={{ left: 0, width: widthWithin }}
                            getTaskColor={getTaskColor}
                            handleResizeStart={handleResizeStart}
                            onTaskClick={onTaskClick}
                            resizingTaskId={resizingTaskId}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
