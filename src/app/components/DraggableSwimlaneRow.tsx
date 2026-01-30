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
  ignoreAddTaskUntil?: number | null;
  onEditSwimlane: (swimlane: TimelineSwimlane) => void;
  onMoveSwimlane: (dragIndex: number, hoverIndex: number) => void;
  onMoveTaskToSwimlane: (taskId: string, swimlaneId: string, newStartDate?: string, newEndDate?: string) => void;
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
  ignoreAddTaskUntil,
}: DraggableSwimlaneRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Drop zone for timeline tasks — row handles task drops and repositioning
  const [{ isOver: isTaskOver, canDrop }, dropTask] = useDrop({
    accept: TIMELINE_TASK_TYPE,
    drop: (item: TaskDragItem, monitor) => {
      const task = item.task;
      if (!timelineRef.current) {
        // fallback: just move swimlane
        onMoveTaskToSwimlane(task.id, swimlane.id);
        return;
      }

      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) {
        onMoveTaskToSwimlane(task.id, swimlane.id);
        return;
      }

      // find nearest scrollable ancestor to account for scrolling
      const getScrollAncestor = (el: HTMLElement | null): HTMLElement | null => {
        let cur = el as HTMLElement | null;
        while (cur) {
          if (cur.scrollWidth > cur.clientWidth) return cur;
          cur = cur.parentElement;
        }
        return null;
      };

      const rect = timelineRef.current.getBoundingClientRect();
      const scrollAncestor = getScrollAncestor(timelineRef.current);
      const scrollLeft = scrollAncestor ? scrollAncestor.scrollLeft : 0;

      // x relative to the entire timeline content
      const localX = clientOffset.x - rect.left + scrollLeft;

      // compute prefix sums for day widths
      const dayWidthsLocal = (dateWidths && dateWidths.length === dates.length) ? dateWidths : dates.map(() => 60);
      const prefix: number[] = [0];
      for (let i = 0; i < dayWidthsLocal.length; i++) prefix.push(prefix[i] + (dayWidthsLocal[i] ?? 60));

      // binary search for index where prefix[idx] <= localX < prefix[idx+1]
      let lo = 0; let hi = prefix.length - 2; let idx = 0;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (prefix[mid] <= localX && localX < prefix[mid + 1]) {
          idx = mid; break;
        }
        if (localX < prefix[mid]) hi = mid - 1; else lo = mid + 1;
      }

      // clamp idx
      idx = Math.max(0, Math.min(dates.length - 1, idx));

      // compute original duration
      const MS_PER_DAY = 1000 * 60 * 60 * 24;
      const origStart = task.startDate ? new Date(task.startDate) : null;
      const origEnd = task.endDate ? new Date(task.endDate) : null;
      let durationDays = 1;
      if (origStart && origEnd) {
        durationDays = Math.floor((origEnd.getTime() - origStart.getTime()) / MS_PER_DAY) + 1;
      }

      const newStart = new Date(dates[0]);
      newStart.setDate(newStart.getDate() + idx);
      const newEnd = new Date(newStart);
      newEnd.setDate(newStart.getDate() + durationDays - 1);

      const newStartISO = newStart.toISOString().split('T')[0];
      const newEndISO = newEnd.toISOString().split('T')[0];

      onMoveTaskToSwimlane(task.id, swimlane.id, newStartISO, newEndISO);
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
                    {/* Clickable day overlay: clicking a day cell creates a new task at that date in this swimlane */}
                    <div className="absolute inset-0 flex" aria-hidden>
                      {(datesByMonth?.[monthKey] ?? []).map((d, di) => {
                        const globalIdx = startIdx + di;
                        const w = dayWidths?.[globalIdx] ?? 60;
                        return (
                          <div
                            key={`day-${monthKey}-${di}`}
                            className="day-click-cell hover:bg-gray-100/40 cursor-pointer"
                            title={`Add task for ${d.toDateString()}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              // ignore clicks that occur immediately after a resize finished
                              if (ignoreAddTaskUntil && Date.now() < ignoreAddTaskUntil) {
                                // eslint-disable-next-line no-console
                                console.debug('[Timeline] ignored add-task click due to recent resize');
                                return;
                              }
                              onAddTask(new Date(d), swimlane.id);
                            }}
                            style={{ width: `${w}px`, height: '100%' }}
                          />
                        );
                      })}
                    </div>

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
