import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Edit2, GripVertical } from 'lucide-react';
import { Task, TimelineSwimlane } from '../types';
import { Button } from '../components/ui/button';
import { DraggableTimelineTask, TIMELINE_TASK_TYPE } from '../components/DraggableTimelineTask';
import { allocateTasksToTracks } from '../utils/trackAllocation';

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
  scrollContainerRef?: React.RefObject<HTMLDivElement>; // Reference to the scrollable container for accurate drop calculations
  onTaskClick: (task: Task) => void;
  onAddTask: (date: Date, swimlaneId: string, endDate?: Date, mode?: 'projects' | 'people') => void;
  ignoreAddTaskUntil?: number | null;
  onEditSwimlane: (swimlane: TimelineSwimlane) => void;
  onMoveSwimlane: (dragIndex: number, hoverIndex: number) => void;
  onMoveTaskToSwimlane: (taskId: string, swimlaneId: string, newStartDate?: string, newEndDate?: string) => void;
  getTaskPosition: (task: Task) => { left: number; width: number } | null;
  getTaskColor: (status: string) => { className?: string; style?: React.CSSProperties };
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
  scrollContainerRef,
}: DraggableSwimlaneRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Date range selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  // Compute track assignments for tasks in this swimlane (memoized)
  const trackAssignments = useMemo(
    () => allocateTasksToTracks(tasks),
    [tasks]
  );

  // Helper function to calculate drop line position from client coordinates
  const calculateDropPosition = (clientOffset: { x: number; y: number } | null) => {
    if (!clientOffset || !scrollContainerRef?.current) return null;

    const scrollContainer = scrollContainerRef.current;
    const scrollLeft = scrollContainer.scrollLeft;
    const containerRect = scrollContainer.getBoundingClientRect();
    const localX = clientOffset.x - containerRect.left + scrollLeft;

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

  // Handle date range selection via click-drag
  const handleSelectionStart = useCallback((dayIdx: number) => {
    setIsSelecting(true);
    setSelectionStart(dayIdx);
    setSelectionEnd(dayIdx);
  }, []);

  const handleSelectionMove = useCallback((dayIdx: number) => {
    if (isSelecting && selectionStart !== null) {
      setSelectionEnd(dayIdx);
    }
  }, [isSelecting, selectionStart]);

  const handleSelectionEnd = useCallback(() => {
    if (isSelecting && selectionStart !== null && selectionEnd !== null && dates.length > 0) {
      const startIdx = Math.min(selectionStart, selectionEnd);
      const endIdx = Math.max(selectionStart, selectionEnd);
      
      if (startIdx >= 0 && startIdx < dates.length && endIdx >= 0 && endIdx < dates.length) {
        const startDate = dates[startIdx];
        const endDate = dates[endIdx];
        onAddTask(startDate, swimlane.id, endDate, 'people');
      }
    }
    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [isSelecting, selectionStart, selectionEnd, dates, swimlane.id, onAddTask]);

  // Global mouse up listener to end selection
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelecting) {
        handleSelectionEnd();
      }
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isSelecting, handleSelectionEnd]);

  // Drop zone for timeline tasks — row handles task drops and repositioning
  const [{ isOver: isTaskOver, canDrop, dropLinePosition }, dropTask] = useDrop({
    accept: TIMELINE_TASK_TYPE,
    drop: (item: TaskDragItem, monitor) => {
      const task = item.task;
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
      const localX = clientOffset.x - containerRect.left + scrollLeft;

      // Validate localX is reasonable
      if (localX < 0) {
        onMoveTaskToSwimlane(task.id, swimlane.id);
        return;
      }

      // Compute prefix sums for day widths to find which day slot the drop is over
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
          // Snap to nearest day center
          const dayCenter = prefix[i] + (dayWidthsLocal[i] ?? 60) / 2;
          if (localX > dayCenter && i < prefix.length - 2) {
            dayIdx = i + 1;
          }
          break;
        }
      }
      // Handle drops beyond last day
      if (localX >= prefix[prefix.length - 1] && dates.length > 0) {
        dayIdx = dates.length - 1;
      }
      
      // Clamp dayIdx to valid range
      dayIdx = Math.max(0, Math.min(dayIdx, Math.max(0, dates.length - 1)));

      // If no valid dates, don't proceed with drop
      if (dates.length === 0 || !dates[dayIdx]) {
        onMoveTaskToSwimlane(task.id, swimlane.id);
        return;
      }

      // Compute original task duration to preserve it
      const MS_PER_DAY = 1000 * 60 * 60 * 24;
      const origStart = task.startDate ? new Date(task.startDate) : null;
      const origEnd = task.endDate ? new Date(task.endDate) : null;
      let durationDays = 1;
      if (origStart && origEnd) {
        durationDays = Math.floor((origEnd.getTime() - origStart.getTime()) / MS_PER_DAY) + 1;
      }

      // Calculate new dates based on the dropped day index
      const newStart = new Date(dates[dayIdx]);
      const newEnd = new Date(newStart);
      newEnd.setDate(newStart.getDate() + durationDays - 1);

      const newStartISO = newStart.toISOString().split('T')[0];
      const newEndISO = newEnd.toISOString().split('T')[0];

      onMoveTaskToSwimlane(task.id, swimlane.id, newStartISO, newEndISO);
    },
    collect: (monitor) => {
      const offset = calculateDropPosition(monitor.getClientOffset());
      return {
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
        dropLinePosition: offset,
        clientOffset: monitor.getClientOffset(),
      };
    },
  });

  // Apply task drop to timeline area
  dropTask(timelineRef);

  // Tasks are already filtered by the parent (TimelineView) based on mode
  const timelineTasks = tasks;

  // Helper to convert hex color to rgba with opacity
  const getRowBackgroundColor = (color?: string) => {
    if (!color) {
      console.log('No color for swimlane:', swimlane.name);
      return undefined;
    }
    
    // Parse hex color to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    const rgba = `rgba(${r}, ${g}, ${b}, 0.08)`;
    console.log(`Swimlane ${swimlane.name} color:`, color, '→', rgba);
    return rgba;
  };

  return (
    <div
      ref={ref}
      className={`swimlane-row ${isTaskOver && canDrop ? 'dragging-over' : ''}`}
      style={{ 
        height: `${rowHeight || 48}px`
      }}
    >
    

      {/* Timeline grid for this swimlane */}
      <div
        ref={timelineRef}
        className={`swimlane-row-timeline ${
          isTaskOver && canDrop ? 'drop-target' : ''
        }`}
        style={{
          backgroundColor: getRowBackgroundColor(swimlane.color)
        }}
      >
        {/* Drop indicator line when dragging over - positioned in viewport coordinates */}
        {isTaskOver && canDrop && typeof dropLinePosition === 'number' && scrollContainerRef?.current && (
          (() => {
            const scrollLeft = scrollContainerRef.current?.scrollLeft ?? 0;
            const containerRect = scrollContainerRef.current?.getBoundingClientRect();
            const timelineRect = timelineRef.current?.getBoundingClientRect();
            
            // Convert from content space to viewport space
            // dropLinePosition is in content coords, subtract scrollLeft to get viewport offset
            // then add container's left position to get absolute viewport position
            const viewportLeft = dropLinePosition - scrollLeft;
            
            return (
              <>
                <div 
                  className="drop-indicator-line" 
                  style={{ left: `${viewportLeft}px` }}
                />
              </>
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
                              if (isWeekend || (ignoreAddTaskUntil && Date.now() < ignoreAddTaskUntil)) {
                                return;
                              }
                              handleSelectionStart(globalIdx);
                            }}
                            onMouseEnter={() => {
                              if (isSelecting && !isWeekend) {
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

                    {tasksRanges.map(({ task, startIndex, endIndex }) => {
                      if (startIndex < 0 || endIndex < 0) return null;

                      const overlapStart = Math.max(startIndex, startIdx);
                      const overlapEnd = Math.min(endIndex, startIdx + len - 1);
                      if (overlapStart > overlapEnd) return null;

                      const leftWithin = prefix[overlapStart] - monthLeft;
                      let widthWithin = prefix[overlapEnd + 1] - prefix[overlapStart];
                      widthWithin = Math.max(8, widthWithin - 8); // small padding like before

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
