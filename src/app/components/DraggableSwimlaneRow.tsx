import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useDrag, useDragLayer, useDrop } from 'react-dnd';
import { GripVertical } from 'lucide-react';
import { Task, TimelineSwimlane } from '../types';
import { Button } from '../components/ui/button';
import { DraggableTimelineTask, TIMELINE_TASK_TYPE } from '../components/DraggableTimelineTask';
import { allocateTasksToTracks } from '../utils/trackAllocation';
import { parseISODateLocal, toLocalISODate } from '../utils/date';
import { canDropTimelineTaskInRow } from '../utils/timelineTaskDrop';
import { isPointerReleased } from '../utils/pointerInteraction';

const ITEM_TYPE = 'SWIMLANE_ROW';

interface DraggableSwimlaneRowProps {
  swimlane: TimelineSwimlane;
  index: number;
  mode?: 'projects' | 'people';
  tasks: Task[];
  dates: Date[];
  dateWidths?: number[]; // per-date widths computed by TimelineView
  monthKeys?: string[];
  monthWidths?: Record<string, number>;
  datesByMonth?: Record<string, Date[]>;
  leadingSpacerWidth?: number;
  trailingSpacerWidth?: number;
  totalTimelineWidth?: number;
  rowHeight?: number;
  scrollContainerRef?: React.RefObject<HTMLDivElement>; // Reference to the scrollable container for accurate drop calculations
  onTaskClick: (task: Task) => void;
  onTaskEdit: (task: Task) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskDuplicate: (task: Task) => void;
  onAddTask: (date: Date, swimlaneId: string, endDate?: Date, mode?: 'projects' | 'people') => void;
  shouldIgnoreAddTask?: () => boolean;
  onEditSwimlane: (swimlane: TimelineSwimlane) => void;
  onMoveSwimlane: (dragIndex: number, hoverIndex: number) => void;
  onMoveTaskToSwimlane: (taskId: string, swimlaneId: string, newStartDate?: string, newEndDate?: string) => void;
  onRevealDate?: (dateISO: string) => void;
  getTaskColor: (status: string) => { className?: string; style?: React.CSSProperties; textClass?: string; bulletOutlineColor?: string };
  handleResizeStart: (e: React.MouseEvent, task: Task, edge: 'start' | 'end') => void;
  resizingTaskId: string | null;
  taskResizePreview?: TaskResizePreview | null;
} 

interface TaskResizePreview {
  taskId: string;
  left: number;
  width: number;
}

interface DragItem {
  type: string;
  index: number;
  swimlane: TimelineSwimlane;
}

interface TaskDragItem {
  type: string;
  task: Task;
  dragOffsetX?: number;
}

interface TimelineDropPreview {
  left: number;
  width: number;
  top: string;
}

export function DraggableSwimlaneRow({
  swimlane,
  index,
  mode = 'projects',
  tasks,
  dates,
  dateWidths,
  monthKeys,
  monthWidths,
  datesByMonth,
  leadingSpacerWidth = 0,
  trailingSpacerWidth = 0,
  totalTimelineWidth,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  onTaskDuplicate,
  onAddTask,
  onEditSwimlane,
  onMoveSwimlane,
  onMoveTaskToSwimlane,
  onRevealDate,
  getTaskColor,
  handleResizeStart,
  resizingTaskId,
  taskResizePreview,
  rowHeight,
  shouldIgnoreAddTask,
  scrollContainerRef,
}: DraggableSwimlaneRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Date range selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const selectionRef = useRef<{ active: boolean; start: number | null; end: number | null }>({
    active: false,
    start: null,
    end: null,
  });

  // Compute track assignments for tasks in this swimlane (memoized)
  const trackAssignments = useMemo(
    () => allocateTasksToTracks(tasks),
    [tasks]
  );
  const includesWeekends = useMemo(
    () => dates.some(d => d.getDay() === 0 || d.getDay() === 6),
    [dates]
  );

  const addTimelineDays = useCallback((baseDate: Date, deltaDays: number): Date => {
    const next = new Date(baseDate);
    if (deltaDays === 0) return next;

    if (includesWeekends) {
      next.setDate(next.getDate() + deltaDays);
      return next;
    }

    const direction = deltaDays > 0 ? 1 : -1;
    let remaining = Math.abs(deltaDays);
    while (remaining > 0) {
      next.setDate(next.getDate() + direction);
      const day = next.getDay();
      if (day !== 0 && day !== 6) remaining -= 1;
    }
    return next;
  }, [includesWeekends]);

  const getDateForDropIndex = useCallback((dayIdx: number): Date | null => {
    if (dates.length === 0) return null;
    if (dayIdx >= 0 && dayIdx < dates.length) return new Date(dates[dayIdx]);

    if (dayIdx < 0) {
      const steps = Math.abs(dayIdx);
      return addTimelineDays(new Date(dates[0]), -steps);
    }

    const steps = dayIdx - (dates.length - 1);
    return addTimelineDays(new Date(dates[dates.length - 1]), steps);
  }, [dates, addTimelineDays]);

  const getVisibleIndexForDate = useCallback(
    (date: Date, mode: 'start' | 'end'): number => {
      if (dates.length === 0) return -1;
      const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

      if (mode === 'start') {
        for (let i = 0; i < dates.length; i++) {
          if (dates[i].getTime() >= target) return i;
        }
        return dates.length - 1;
      }

      for (let i = dates.length - 1; i >= 0; i--) {
        if (dates[i].getTime() <= target) return i;
      }
      return 0;
    },
    [dates]
  );

  const getTaskDurationDays = useCallback((task: Task): number => {
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const origStart = parseISODateLocal(task.startDate);
    const origEnd = parseISODateLocal(task.endDate);
    if (!origStart || !origEnd) return 1;

    return Math.max(1, Math.floor((origEnd.getTime() - origStart.getTime()) / MS_PER_DAY) + 1);
  }, []);

  // Helper function to calculate drop line position from client coordinates
  const calculateDropPosition = (clientOffset: { x: number; y: number } | null, dragOffsetX = 0) => {
    if (!clientOffset || !scrollContainerRef?.current) return null;

    const scrollContainer = scrollContainerRef.current;
    const scrollLeft = scrollContainer.scrollLeft;
    const containerRect = scrollContainer.getBoundingClientRect();
    const localX = clientOffset.x - containerRect.left + scrollLeft - dragOffsetX;

    if (localX < 0) return null;

    // Compute prefix sums for day widths
    const dayWidthsLocal = (dateWidths && dateWidths.length === dates.length) ? dateWidths : dates.map(() => 60);
    const prefix: number[] = [0];
    for (let i = 0; i < dayWidthsLocal.length; i++) {
      prefix.push(prefix[i] + (dayWidthsLocal[i] ?? 60));
    }

    // Find which day index the drop position corresponds to
    let dayIdx = 0;
    for (let i = 0; i < prefix.length - 1; i++) {
      if (localX >= prefix[i] && localX < prefix[i + 1]) {
        dayIdx = i;
        const dayCenter = prefix[i] + (dayWidthsLocal[i] ?? 60) / 2;
        if (localX > dayCenter && i < prefix.length - 2) {
          dayIdx = i + 1;
        }
        break;
      }
    }
    if (localX >= prefix[prefix.length - 1] && dates.length > 0) {
      dayIdx = dates.length - 1;
    }

    dayIdx = Math.max(0, Math.min(dayIdx, Math.max(0, dates.length - 1)));

    // Return the pixel position where the drop line should be
    // This is the start of the target day
    return prefix[dayIdx] ?? 0;
  };

  const calculateTimelineDropPreview = (
    clientOffset: { x: number; y: number } | null,
    task: Task | null,
    dragOffsetX = 0
  ): TimelineDropPreview | null => {
    if (!task) return null;

    const left = calculateDropPosition(clientOffset, dragOffsetX);
    if (left === null) return null;

    const dayWidthsLocal = (dateWidths && dateWidths.length === dates.length) ? dateWidths : dates.map(() => 60);
    const prefix: number[] = [0];
    for (let i = 0; i < dayWidthsLocal.length; i++) {
      prefix.push(prefix[i] + (dayWidthsLocal[i] ?? 60));
    }
    const matchedStartIdx = prefix.findIndex((value, index) => (
      index < prefix.length - 1 && left >= value && left < prefix[index + 1]
    ));
    const startIdx = matchedStartIdx >= 0 ? matchedStartIdx : Math.max(0, dates.length - 1);
    const fallbackDayWidth = dayWidthsLocal[startIdx] ?? dayWidthsLocal[0] ?? 60;
    const durationDays = getTaskDurationDays(task);
    let previewWidth = 0;

    for (let i = 0; i < durationDays; i++) {
      previewWidth += dayWidthsLocal[Math.min(startIdx + i, dayWidthsLocal.length - 1)] ?? fallbackDayWidth;
    }

    const TASK_RENDER_HEIGHT = 32;
    const TRACK_HEIGHT = 40;
    const trackIndex = trackAssignments[task.id] || 0;

    return {
      left,
      width: Math.max(8, previewWidth - 8),
      top: `calc(${trackIndex * TRACK_HEIGHT}px + (${TRACK_HEIGHT}px - ${TASK_RENDER_HEIGHT}px) / 2)`,
    };
  };

  // Handle date range selection via click-drag
  const handleSelectionStart = useCallback((dayIdx: number) => {
    selectionRef.current = { active: true, start: dayIdx, end: dayIdx };
    setIsSelecting(true);
    setSelectionStart(dayIdx);
    setSelectionEnd(dayIdx);
  }, []);

  const handleSelectionMove = useCallback((dayIdx: number) => {
    if (selectionRef.current.active && selectionRef.current.start !== null) {
      selectionRef.current.end = dayIdx;
      setSelectionEnd(dayIdx);
    }
  }, []);

  const handleSelectionEnd = useCallback(() => {
    const { active, start, end } = selectionRef.current;
    selectionRef.current = { active: false, start: null, end: null };

    if (shouldIgnoreAddTask?.()) {
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }

    if (active && start !== null && end !== null && dates.length > 0) {
      const startIdx = Math.min(start, end);
      const endIdx = Math.max(start, end);
      
      if (startIdx >= 0 && startIdx < dates.length && endIdx >= 0 && endIdx < dates.length) {
        const startDate = dates[startIdx];
        const endDate = dates[endIdx];
        onAddTask(startDate, swimlane.id, endDate, mode);
      }
    }
    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [dates, swimlane.id, onAddTask, mode, shouldIgnoreAddTask]);

  // Global mouse up listener to end selection
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelecting) {
        handleSelectionEnd();
      }
    };
    const handleGlobalMouseMove = (event: MouseEvent) => {
      // If the button was released outside the originating day cell, React may
      // not deliver that cell's mouseup. Never leave the selection latched.
      if (isSelecting && isPointerReleased(event.buttons)) {
        handleSelectionEnd();
      }
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('pointerup', handleGlobalMouseUp);
    document.addEventListener('pointercancel', handleGlobalMouseUp);
    document.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('blur', handleGlobalMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('pointerup', handleGlobalMouseUp);
      document.removeEventListener('pointercancel', handleGlobalMouseUp);
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('blur', handleGlobalMouseUp);
    };
  }, [isSelecting, handleSelectionEnd]);

  const liveTimelineDrag = useDragLayer((monitor) => {
    const item = monitor.getItem<TaskDragItem | null>();
    const clientOffset = monitor.getClientOffset();
    const isDraggingTimelineTask = monitor.isDragging() && monitor.getItemType() === TIMELINE_TASK_TYPE;

    return {
      item,
      clientOffset,
      isDraggingTimelineTask,
    };
  });

  // Drop zone for timeline tasks — row handles task drops and repositioning
  const [{ isOver: isTaskOver, canDrop }, dropTask] = useDrop({
    accept: TIMELINE_TASK_TYPE,
    canDrop: (item: TaskDragItem) => canDropTimelineTaskInRow(item.task, swimlane.id, mode),
    drop: (item: TaskDragItem, monitor) => {
      const task = item.task;
      if (!canDropTimelineTaskInRow(task, swimlane.id, mode)) {
        return;
      }
      if (!timelineRef.current) {
        onMoveTaskToSwimlane(task.id, swimlane.id);
        return;
      }

      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) {
        onMoveTaskToSwimlane(task.id, swimlane.id);
        return;
      }

      // Get scroll offset and position from the scroll container ref
      if (!scrollContainerRef?.current) {
        onMoveTaskToSwimlane(task.id, swimlane.id);
        return;
      }

      const scrollContainer = scrollContainerRef.current;
      const scrollLeft = scrollContainer.scrollLeft;
      const containerRect = scrollContainer.getBoundingClientRect();
      
      // Calculate position within the scrolled content:
      // clientOffset.x - containerRect.left = position within the visible container
      // + scrollLeft = position within the entire scrolled content
      const localX = clientOffset.x - containerRect.left + scrollLeft - (item.dragOffsetX ?? 0);

      // Compute prefix sums for day widths to find which day slot the drop is over
      const dayWidthsLocal = (dateWidths && dateWidths.length === dates.length) ? dateWidths : dates.map(() => 60);
      const prefix: number[] = [0];
      for (let i = 0; i < dayWidthsLocal.length; i++) {
        prefix.push(prefix[i] + (dayWidthsLocal[i] ?? 60));
      }

      // Find which day index the drop position corresponds to
      let dayIdx = 0;
      let isOutOfRangeDrop = false;
      if (localX < 0 && dates.length > 0) {
        const leftEdgeWidth = dayWidthsLocal[0] ?? 60;
        const daysBeyondLeft = Math.max(1, Math.ceil(Math.abs(localX) / leftEdgeWidth));
        dayIdx = -daysBeyondLeft;
        isOutOfRangeDrop = true;
      } else if (localX >= prefix[prefix.length - 1] && dates.length > 0) {
        const rightEdgeWidth = dayWidthsLocal[dayWidthsLocal.length - 1] ?? 60;
        const overflow = localX - prefix[prefix.length - 1];
        const daysBeyondRight = Math.floor((overflow + rightEdgeWidth / 2) / rightEdgeWidth);
        dayIdx = (dates.length - 1) + daysBeyondRight;
        isOutOfRangeDrop = true;
      } else {
        for (let i = 0; i < prefix.length - 1; i++) {
          if (localX >= prefix[i] && localX < prefix[i + 1]) {
            dayIdx = i;
            // Snap to nearest day center
            const dayCenter = prefix[i] + (dayWidthsLocal[i] ?? 60) / 2;
            if (localX > dayCenter && i < prefix.length - 2) {
              dayIdx = i + 1;
            }
            break;
          }
        }
      }

      const newStart = getDateForDropIndex(dayIdx);
      if (!newStart) {
        onMoveTaskToSwimlane(task.id, swimlane.id);
        return;
      }

      const durationDays = getTaskDurationDays(task);

      // Calculate new dates based on the dropped day index
      const newEnd = new Date(newStart);
      newEnd.setDate(newStart.getDate() + durationDays - 1);

      const newStartISO = toLocalISODate(newStart);
      const newEndISO = toLocalISODate(newEnd);

      onMoveTaskToSwimlane(task.id, swimlane.id, newStartISO, newEndISO);
      if (isOutOfRangeDrop) {
        onRevealDate?.(newStartISO);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const liveDropPreview = isTaskOver && canDrop && liveTimelineDrag.isDraggingTimelineTask
    ? calculateTimelineDropPreview(
      liveTimelineDrag.clientOffset,
      liveTimelineDrag.item?.task ?? null,
      liveTimelineDrag.item?.dragOffsetX ?? 0
    )
    : null;

  // Apply task drop to timeline area
  dropTask(timelineRef);

  // Tasks are already filtered by the parent (TimelineView) based on mode
  const timelineTasks = tasks;
  const timelineTaskRanges = useMemo(() => timelineTasks.map(task => {
    const parsedStart = parseISODateLocal(task.startDate);
    const startIndex = parsedStart ? getVisibleIndexForDate(parsedStart, 'start') : -1;
    const parsedEnd = parseISODateLocal(task.endDate);
    const endIndex = task.endDate
      ? (parsedEnd ? getVisibleIndexForDate(parsedEnd, 'end') : startIndex)
      : startIndex;
    return { task, startIndex, endIndex };
  }), [getVisibleIndexForDate, timelineTasks]);

  return (
    <div
      ref={ref}
      className="swimlane-row"
      style={{ 
        height: `${rowHeight || 48}px`
      }}
    >
    

      {/* Timeline grid for this swimlane */}
      <div
        ref={timelineRef}
        className="swimlane-row-timeline"
      >
        {/* Task-shaped drop preview when dragging over - positioned in timeline content coordinates */}
        {liveDropPreview && scrollContainerRef?.current && (
          (() => {
            return (
              <div
                className="reserved-slot reserved-slot--timeline-task"
                style={{
                  left: `${liveDropPreview.left + 4}px`,
                  top: liveDropPreview.top,
                  width: `${liveDropPreview.width}px`,
                }}
                aria-hidden="true"
              />
            );
          })()
        )}
        {/* Month containers; each contains the swimlane cell for that month and any task fragments that overlap it. */}
        <div className="flex" style={{ height: '100%', width: '100%' }}>
          {/* Precompute prefix sums for date widths to make slicing easier */}
          {(() => {
            const dayWidths = (dateWidths && dateWidths.length === dates.length) ? dateWidths : dates.map(() => 60);
            const prefix: number[] = [0];
            for (let i = 0; i < dayWidths.length; i++) prefix.push(prefix[i] + dayWidths[i]);

            // build monthStarts map
            const monthStarts: Record<string, number> = {};
            (monthKeys ?? []).forEach((k) => {
              const md = datesByMonth?.[k];
              if (md && md.length) {
                const idx = dates.findIndex(d => d.getTime() === md[0].getTime());
                monthStarts[k] = idx >= 0 ? idx : 0;
              }
            });

            return (
              <>
                {leadingSpacerWidth > 0 && (
                  <div
                    className="month-leading-spacer flex-shrink-0"
                    style={{ width: `${leadingSpacerWidth}px` }}
                    aria-hidden
                  />
                )}
                {(monthKeys ?? []).map((monthKey) => {
              const startIdx = monthStarts[monthKey] ?? 0;
              const len = datesByMonth?.[monthKey]?.length ?? 0;
              const monthLeft = prefix[startIdx];
              const monthWidth = prefix[startIdx + len] - prefix[startIdx];

              return (
                <div
                  key={monthKey}
                  className="month-column"
                  style={{ width: `${monthWidth}px` }}
                >
                  <div className="h-full relative">
                    {/* Clickable day overlay: clicking a day cell creates a new task at that date in this swimlane */}
                    <div className="absolute inset-0 flex" aria-hidden>
                      {(datesByMonth?.[monthKey] ?? []).map((d, di) => {
                        const globalIdx = startIdx + di;
                        const w = dayWidths?.[globalIdx] ?? 60;
                        
                        // Check if this is a weekend (Saturday = 6, Sunday = 0)
                        const dayOfWeek = d.getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        const isWeekStart = dayOfWeek === 1; // Monday
                        
                        // Check if this day is in the selection range
                        const isInSelection = isSelecting && selectionStart !== null && selectionEnd !== null &&
                          globalIdx >= Math.min(selectionStart, selectionEnd) &&
                          globalIdx <= Math.max(selectionStart, selectionEnd);
                        
                        return (
                          <div
                            key={`day-${monthKey}-${di}`}
                            className={`day-click-cell ${
                              isInSelection ? 'selected' : ''
                            } ${isWeekend ? 'weekend' : ''} ${isWeekStart ? 'week-start' : ''}`}
                            title={isWeekend ? 'Weekend (unavailable)' : `Add task for ${d.toDateString()}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (isWeekend) {
                                return;
                              }
                              if (shouldIgnoreAddTask?.()) {
                                return;
                              }
                              handleSelectionStart(globalIdx);
                            }}
                            onMouseMove={() => {
                              if (!isWeekend) {
                                handleSelectionMove(globalIdx);
                              }
                            }}
                            onMouseUp={(e) => {
                              e.stopPropagation();
                              handleSelectionEnd();
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            style={{ width: `${w}px`, height: '100%' }}
                          />
                        );
                      })}
                    </div>

                    {/* Selection border overlay */}
                    {isSelecting && selectionStart !== null && selectionEnd !== null && (() => {
                      const minIdx = Math.min(selectionStart, selectionEnd);
                      const maxIdx = Math.max(selectionStart, selectionEnd);
                      
                      // Check if selection intersects with this month
                      const selectionIntersectsMonth = minIdx <= (startIdx + len - 1) && maxIdx >= startIdx;
                      
                      if (!selectionIntersectsMonth) return null;
                      
                      // Calculate the overlap of selection with this month
                      const monthSelectionStart = Math.max(minIdx, startIdx);
                      const monthSelectionEnd = Math.min(maxIdx, startIdx + len - 1);
                      
                      const selectionLeft = prefix[monthSelectionStart] - monthLeft;
                      const selectionWidth = prefix[monthSelectionEnd + 1] - prefix[monthSelectionStart];
                      
                      return (
                        <div
                          className="selection-border"
                          style={{
                            left: `${selectionLeft}px`,
                            width: `${selectionWidth}px`,
                          }}
                        />
                      );
                    })()}

                    {timelineTaskRanges.map(({ task, startIndex, endIndex }) => {
                      if (startIndex < 0 || endIndex < 0) return null;

                      const preview = taskResizePreview?.taskId === task.id ? taskResizePreview : null;
                      let leftWithin: number;
                      let widthWithin: number;

                      if (preview) {
                        const previewLeft = preview.left;
                        const previewRight = preview.left + preview.width;
                        const monthRight = monthLeft + monthWidth;
                        const fragmentLeft = Math.max(previewLeft, monthLeft);
                        const fragmentRight = Math.min(previewRight, monthRight);
                        if (fragmentLeft >= fragmentRight) return null;
                        leftWithin = fragmentLeft - monthLeft;
                        widthWithin = Math.max(8, fragmentRight - fragmentLeft);
                      } else {
                        const overlapStart = Math.max(startIndex, startIdx);
                        const overlapEnd = Math.min(endIndex, startIdx + len - 1);
                        if (overlapStart > overlapEnd) return null;

                        leftWithin = prefix[overlapStart] - monthLeft;
                        widthWithin = prefix[overlapEnd + 1] - prefix[overlapStart];
                        widthWithin = Math.max(8, widthWithin - 8); // small padding like before
                      }

                      // Use track index for vertical positioning
                      const TASK_RENDER_HEIGHT = 32; // matches h-8 in tailwind (8 * 4px)
                      const TRACK_HEIGHT = 40; // height per track (task height + gap)
                      const trackIndex = trackAssignments[task.id] || 0;
                      const topCalc = `calc(${trackIndex * TRACK_HEIGHT}px + (${TRACK_HEIGHT}px - ${TASK_RENDER_HEIGHT}px) / 2)`;

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
                            onTaskEdit={onTaskEdit}
                            onTaskDelete={onTaskDelete}
                            onTaskDuplicate={onTaskDuplicate}
                            repositoryFolder={swimlane.repositoryFolder}
                            resizingTaskId={resizingTaskId}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
                {trailingSpacerWidth > 0 && (
                  <div
                    className="month-trailing-spacer flex-shrink-0"
                    style={{ width: `${trailingSpacerWidth}px` }}
                    aria-hidden
                  />
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
