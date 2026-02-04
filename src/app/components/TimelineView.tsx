/**
 * TimelineView Component (Refactored)
 *
 * Main timeline/calendar view for task scheduling.
 * Renders swimlanes as rows with draggable tasks positioned on a date grid.
 *
 * Modular architecture:
 * - TimelineHeader: month/day headers
 * - SwimlaneRowsView: swimlane rows container
 * - DraggableSwimlaneRow: individual swimlane with tasks
 * - Track allocation: dynamic height calculation for overlapping tasks
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { Task, TimelineSwimlane, TaskStatus, Person } from '../types';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Plus } from 'lucide-react';
import { TimelineHeader } from './TimelineHeader';
import { DraggableSwimlaneLabel } from './DraggableSwimlaneLabel';
import { DraggableSwimlaneRow } from './DraggableSwimlaneRow';
import { allocateTasksToTracks, calculateSwimlaneHeight } from '../utils/trackAllocation';
import { getReadableTextClassFor } from '../utils/contrast';
import { useVirtualizedTimeline } from '../hooks/useVirtualizedTimeline';
import { TIMELINE_CONFIG } from '../constants/timeline';

const PAD_DAYS = 7;
const DEFAULT_ROW_HEIGHT = 48;
const HEADER_HEIGHT = 72;
const DEFAULT_DAY_WIDTH = 60;

interface TimelineViewProps {
  tasks: Task[];
  swimlanes: TimelineSwimlane[];
  people?: Person[];
  statusColumns?: Array<{ id: TaskStatus; title: string; color?: string }>;
  onTaskClick: (task: Task) => void;
  onAddTask: (date: Date, swimlaneId: string, endDate?: Date, mode?: 'projects' | 'people') => void;
  onUpdateTaskDates: (taskId: string, startDate: string, endDate: string) => void;
  onEditSwimlane: (swimlane: TimelineSwimlane) => void;
  onAddSwimlane: () => void;
  onReorderSwimlanes: (swimlanes: TimelineSwimlane[]) => void;
  onReorderPeople?: (people: Person[]) => void;
  onReorderTasks: (tasks: Task[]) => void;
}

export function TimelineView({
  tasks,
  swimlanes,
  people = [],
  statusColumns,
  onTaskClick,
  onAddTask,
  onUpdateTaskDates,
  onEditSwimlane,
  onAddSwimlane,
  onReorderSwimlanes,
  onReorderPeople,
  onReorderTasks,
}: TimelineViewProps) {
  // Left column width state
  const [leftColWidth, setLeftColWidth] = useState<number>(200);
  const [isResizingLeft, setIsResizingLeft] = useState<boolean>(false);
  const leftResizeRef = useRef<{ startX: number; startWidth: number; pendingWidth?: number } | null>(null);
  const resizeRafRef = useRef<number | null>(null);

  // Mode state: Projects or People
  const [mode, setMode] = useState<'projects' | 'people'>('projects');

  // Display swimlanes based on mode
  const displaySwimlanes = useMemo<TimelineSwimlane[]>(() => {
    if (mode === 'people') {
      return people.map(person => ({
        id: person.id,
        name: `${person.name} - ${person.role}`,
      }));
    }
    return swimlanes;
  }, [mode, people, swimlanes]);

  // Refs
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const rowsContainerRef = useRef<HTMLDivElement>(null);
  const leftListRef = useRef<HTMLDivElement>(null);
  const fixedBtnRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef<boolean>(false); // Flag to prevent feedback loops

  // Initialize virtualization with today as reference
  const timeline = useVirtualizedTimeline();

  // State for task resizing
  const [resizingTask, setResizingTask] = useState<{
    taskId: string;
    edge: 'start' | 'end';
    initialX: number;
    initialStartDate: string;
    initialEndDate: string;
  } | null>(null);

  // State for click suppression after resize
  const [ignoreAddTaskUntil, setIgnoreAddTaskUntil] = useState<number | null>(null);

  // Calculate date range from tasks
  const dates = useMemo(() => {
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (tasks.length === 0) {
      // Return range including today and padding
      const startDate = new Date(todayDate);
      startDate.setDate(startDate.getDate() - PAD_DAYS);
      const datesArr: Date[] = [];
      for (let i = 0; i <= PAD_DAYS * 2; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        datesArr.push(d);
      }
      return datesArr;
    }

    const taskDates = tasks
      .flatMap(t => {
        const dates: Date[] = [];
        if (t.startDate) {
          const d = new Date(t.startDate);
          dates.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
        }
        if (t.endDate) {
          const d = new Date(t.endDate);
          dates.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
        }
        return dates;
      })
      .filter(d => !isNaN(d.getTime()));

    if (taskDates.length === 0) {
      return [new Date()];
    }

    const minDate = new Date(Math.min(...taskDates.map(d => d.getTime())));
    let maxDate = new Date(Math.max(...taskDates.map(d => d.getTime())));

    minDate.setDate(minDate.getDate() - PAD_DAYS);
    maxDate.setDate(maxDate.getDate() + PAD_DAYS);

    // Align to month boundaries
    let start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    let end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);

    // Ensure today is included
    const currentDate = new Date();
    const todayNoTime = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    if (todayNoTime < start) start = new Date(todayNoTime.getFullYear(), todayNoTime.getMonth(), 1);
    if (todayNoTime > end) end = new Date(todayNoTime.getFullYear(), todayNoTime.getMonth() + 1, 0);

    const arr: Date[] = [];
    const d = new Date(start);
    while (d <= end) {
      arr.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

    return arr;
  }, [tasks]);

  // Calculate virtualized dates: only render window + buffer
  // TODO: Fix virtualization window indexing (currently disabled to show all dates)
  const virtualizedDates = useMemo(() => {
    // For now, show all dates. Virtualization needs fixes to window index calculation.
    return dates;
  }, [dates]);

  // Group dates by month
  const datesByMonth = useMemo(() => {
    const m: Record<string, Date[]> = {};
    virtualizedDates.forEach(date => {
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!m[monthKey]) m[monthKey] = [];
      m[monthKey].push(date);
    });
    return m;
  }, [virtualizedDates]);

  // Initialize month widths
  const [monthWidths, setMonthWidths] = useState<Record<string, number>>(() => {
    const mw: Record<string, number> = {};
    Object.entries(datesByMonth).forEach(([k, monthDates]) => {
      mw[k] = monthDates.length * DEFAULT_DAY_WIDTH;
    });
    return mw;
  });

  // Derive day widths
  const [dayWidths, setDayWidths] = useState<number[]>(() => {
    const arr: number[] = [];
    Object.entries(datesByMonth).forEach(([k, monthDates]) => {
      const perDay = monthWidths[k] ? monthWidths[k] / monthDates.length : DEFAULT_DAY_WIDTH;
      monthDates.forEach(() => arr.push(perDay));
    });
    return arr;
  });

  // Update dayWidths when monthWidths changes
  useEffect(() => {
    const arr: number[] = [];
    Object.entries(datesByMonth).forEach(([k, monthDates]) => {
      const perDay = monthWidths[k] ? monthWidths[k] / monthDates.length : DEFAULT_DAY_WIDTH;
      monthDates.forEach(() => arr.push(perDay));
    });
    setDayWidths(arr);
  }, [monthWidths, datesByMonth]);

  // Compute track assignments for each swimlane
  const swimlaneTrackAssignments = useMemo(() => {
    const assignments: Record<string, Record<string, number>> = {};
    displaySwimlanes.forEach(swimlane => {
      const swimlaneTasks = mode === 'people'
        ? tasks.filter(t => t.assigneeId === swimlane.id)
        : tasks.filter(t => t.swimlaneId === swimlane.id);
      assignments[swimlane.id] = allocateTasksToTracks(swimlaneTasks);
    });
    return assignments;
  }, [tasks, displaySwimlanes, mode]);

  // Compute dynamic heights for swimlanes
  const swimlaneHeights = useMemo(() => {
    const heights: Record<string, number> = {};
    displaySwimlanes.forEach(swimlane => {
      const swimlaneTasks = mode === 'people'
        ? tasks.filter(t => t.assigneeId === swimlane.id)
        : tasks.filter(t => t.swimlaneId === swimlane.id);
      // Each track is 40px (task render height 32px + gap 8px), with at least DEFAULT_ROW_HEIGHT
      const TRACK_HEIGHT = 40;
      const trackAssignments = allocateTasksToTracks(swimlaneTasks);
      const trackCount = swimlaneTasks.length > 0 ? Math.max(...Object.values(trackAssignments)) + 1 : 1;
      heights[swimlane.id] = Math.max(DEFAULT_ROW_HEIGHT, trackCount * TRACK_HEIGHT);
    });
    return heights;
  }, [tasks, displaySwimlanes, mode]);

  // Sync left column header height with timeline header actual height
  const [syncedHeaderHeight, setSyncedHeaderHeight] = useState<number | null>(null);
  
  useLayoutEffect(() => {
    const leftHeaderEl = document.querySelector('.left-col-header') as HTMLElement | null;
    const timelineHeaderEl = document.querySelector('.timeline-header-container') as HTMLElement | null;
    
    if (timelineHeaderEl) {
      const actualHeight = timelineHeaderEl.getBoundingClientRect().height;
      setSyncedHeaderHeight(actualHeight);
      if (leftHeaderEl) {
        leftHeaderEl.style.height = `${actualHeight}px`;
      }
    }
  }, [displaySwimlanes, tasks]);

  // Today marker
  const today = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const todayIndex = useMemo(() => {
    return dates.findIndex(d => d.getTime() === today.getTime());
  }, [dates, today]);

  const todayOffset = useMemo(() => {
    if (todayIndex < 0) return null;
    return dayWidths.slice(0, todayIndex).reduce((a, b) => a + b, 0);
  }, [todayIndex, dayWidths]);

  // Calculate total timeline width
  const totalTimelineWidth = useMemo(() => {
    return dayWidths.reduce((a, b) => a + b, 0);
  }, [dayWidths]);

  const endPadding = 24;

  // Handle left column resize
  const handleLeftResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingLeft(true);
    leftResizeRef.current = { startX: e.clientX, startWidth: leftColWidth };
  };

  useEffect(() => {
    if (!isResizingLeft) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!leftResizeRef.current) return;
      const delta = e.clientX - leftResizeRef.current.startX;
      let newWidth = Math.round(leftResizeRef.current.startWidth + delta);
      newWidth = Math.max(120, Math.min(480, newWidth));
      leftResizeRef.current.pendingWidth = newWidth;

      if (resizeRafRef.current == null) {
        resizeRafRef.current = requestAnimationFrame(() => {
          if (leftResizeRef.current) {
            setLeftColWidth(leftResizeRef.current.pendingWidth ?? leftColWidth);
            leftResizeRef.current.pendingWidth = undefined;
          }
          resizeRafRef.current = null;
        });
      }
    };

    const handleMouseUp = () => {
      if (resizeRafRef.current != null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      setIsResizingLeft(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeft, leftColWidth]);

  // Handle task resize with 60px grid snapping
  useEffect(() => {
    if (!resizingTask) return;

    const handleMouseMove = (e: MouseEvent) => {
      const task = tasks.find(t => t.id === resizingTask.taskId);
      if (!task) return;

      const sd = new Date(task.startDate || '');
      const startDate = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
      const ed = task.endDate ? new Date(task.endDate) : startDate;
      const endDate = task.endDate ? new Date(ed.getFullYear(), ed.getMonth(), ed.getDate()) : startDate;
      const startIdx = dates.findIndex(d => d.getTime() === startDate.getTime());
      const endIdx = dates.findIndex(d => d.getTime() === endDate.getTime());

      if (startIdx < 0) return;

      const prefix: number[] = [0];
      for (let i = 0; i < dayWidths.length; i++) prefix.push(prefix[i] + (dayWidths[i] ?? DEFAULT_DAY_WIDTH));

      // Use rowsContainerRef for accurate scroll position (not headerRef)
      const scrollEl = rowsContainerRef.current;
      if (!scrollEl) return;

      const rect = scrollEl.getBoundingClientRect();
      const scrollLeft = scrollEl.scrollLeft;
      const localX = e.clientX - rect.left + scrollLeft;

      // Snap to 60px grid
      const snappedX = Math.round(localX / DEFAULT_DAY_WIDTH) * DEFAULT_DAY_WIDTH;

      let newIdx = 0;
      for (let i = 0; i < prefix.length - 1; i++) {
        if (snappedX >= prefix[i] && snappedX < prefix[i + 1]) {
          newIdx = i;
          break;
        }
      }

      if (resizingTask.edge === 'start') {
        // Drag start date (can't go past end)
        if (newIdx <= endIdx && newIdx >= 0 && newIdx < dates.length) {
          const newDate = new Date(dates[newIdx]);
          const newISO = newDate.toISOString().split('T')[0];
          if (newISO !== task.startDate) {
            onUpdateTaskDates(task.id, newISO, task.endDate || '');
          }
        }
      } else {
        // Drag end date (can't go before start)
        if (newIdx >= startIdx && newIdx >= 0 && newIdx < dates.length) {
          const newDate = new Date(dates[newIdx]);
          const newISO = newDate.toISOString().split('T')[0];
          if (newISO !== task.endDate) {
            onUpdateTaskDates(task.id, task.startDate || '', newISO);
          }
        }
      }
    };

    const handleMouseUp = () => {
      setResizingTask(null);
      setIgnoreAddTaskUntil(Date.now() + 300);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingTask, tasks, dates, dayWidths, onUpdateTaskDates]);

  // Scroll to today
  const scrollToToday = useCallback((opts?: { smooth?: boolean }) => {
    if (!rowsContainerRef.current) return;
    
    // If todayOffset is null, compute it now
    let offset = todayOffset;
    if (offset === null) {
      const todayDate = new Date();
      const todayOnly = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
      const idx = dates.findIndex(d => d.getTime() === todayOnly.getTime());
      if (idx >= 0) {
        offset = dayWidths.slice(0, idx).reduce((a, b) => a + b, 0);
      }
    }
    
    if (offset === null) {
      // Default to scrolling to middle of content
      offset = Math.max(0, (totalTimelineWidth - rowsContainerRef.current.clientWidth) / 2);
    }
    
    try {
      rowsContainerRef.current.scrollTo({ left: offset, behavior: opts?.smooth ? 'smooth' : 'auto' });
    } catch (e) {
      rowsContainerRef.current.scrollLeft = offset;
    }
  }, [todayOffset, dates, dayWidths, totalTimelineWidth]);

  // Scroll handlers
  const handleScrollLeft = useCallback(() => {
    if (rowsContainerRef.current) {
      rowsContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  }, []);

  const handleScrollRight = useCallback(() => {
    if (rowsContainerRef.current) {
      rowsContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  }, []);

  // Virtualization scroll handler: detects edge proximity and extends window
  const handleVirtualizedScroll = useCallback(() => {
    if (!rowsContainerRef.current) return;
    const scrollLeft = rowsContainerRef.current.scrollLeft;
    const viewportWidth = rowsContainerRef.current.clientWidth;
    timeline.handleScroll(scrollLeft, viewportWidth, rowsContainerRef);
  }, [timeline]);

  // Sync scroll between header and rows container
  const handleHeaderScroll = useCallback(() => {
    // Header is now inside rowsContainer, no need to sync
  }, []);

  const handleRowsScroll = useCallback(() => {
    // All scrolling happens on rowsContainer now
  }, []);

  // Attach scroll listeners
  useEffect(() => {
    // No longer need horizontal sync since header is within rowsContainer
  }, []);

  // Initialize scroll position to today on mount
  useEffect(() => {
    // Delay to ensure DOM is ready
    const timer = setTimeout(() => {
      scrollToToday({ smooth: false });
    }, 100);
    
    return () => clearTimeout(timer);
  }, [scrollToToday]);

  // Swimlane reordering
  const handleMoveSwimlane = useCallback((dragIndex: number, hoverIndex: number) => {
    if (mode === 'people') {
      const newPeople = [...people];
      const [draggedPerson] = newPeople.splice(dragIndex, 1);
      newPeople.splice(hoverIndex, 0, draggedPerson);
      onReorderPeople?.(newPeople);
    } else {
      const newSwimlanes = [...swimlanes];
      const [draggedSwim] = newSwimlanes.splice(dragIndex, 1);
      newSwimlanes.splice(hoverIndex, 0, draggedSwim);
      onReorderSwimlanes(newSwimlanes);
    }
  }, [mode, people, swimlanes, onReorderPeople, onReorderSwimlanes]);

  // Sync vertical scroll between left column and rows container
  const handleLeftScroll = useCallback(() => {
    if (!leftListRef.current || !rowsContainerRef.current || isScrollingRef.current) return;
    isScrollingRef.current = true;
    rowsContainerRef.current.scrollTop = leftListRef.current.scrollTop;
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 0);
  }, []);

  const handleRowsVerticalScroll = useCallback(() => {
    if (!leftListRef.current || !rowsContainerRef.current || isScrollingRef.current) return;
    isScrollingRef.current = true;
    leftListRef.current.scrollTop = rowsContainerRef.current.scrollTop;
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 0);
  }, []);

  // Attach vertical scroll listeners
  useEffect(() => {
    const leftEl = leftListRef.current;
    const rowsEl = rowsContainerRef.current;
    if (!leftEl || !rowsEl) return;

    leftEl.addEventListener('scroll', handleLeftScroll);
    rowsEl.addEventListener('scroll', handleRowsVerticalScroll);
    return () => {
      leftEl.removeEventListener('scroll', handleLeftScroll);
      rowsEl.removeEventListener('scroll', handleRowsVerticalScroll);
    };
  }, [handleLeftScroll, handleRowsVerticalScroll]);

  // Get task position helper
  const getTaskPosition = useCallback(
    (task: Task): { left: number; width: number } | null => {
      if (!task.startDate) return null;

      const sd = new Date(task.startDate);
      const startDate = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
      const startIdx = dates.findIndex(d => d.getTime() === startDate.getTime());
      if (startIdx < 0) return null;

      // Adjust position for window offset
      const windowOffset = (timeline.windowStartIndex - Math.max(0, timeline.windowStartIndex)) * TIMELINE_CONFIG.DAY_SLOT_WIDTH;
      const left = dayWidths.slice(0, startIdx).reduce((a, b) => a + b, 0) - windowOffset;
      
      let endDate = startDate;
      if (task.endDate) {
        const ed = new Date(task.endDate);
        endDate = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate());
      }
      const endIdx = dates.findIndex(d => d.getTime() === endDate.getTime());
      const endIdx2 = endIdx >= 0 ? endIdx : startIdx;
      const width = dayWidths.slice(startIdx, endIdx2 + 1).reduce((a, b) => a + b, dayWidths[startIdx] || DEFAULT_DAY_WIDTH);

      return { left, width };
    },
    [dates, dayWidths, timeline.windowStartIndex]
  );

  // Get task color helper with fallback for orphaned statuses
  const getTaskColor = useCallback(
    (status: string): { className?: string; style?: React.CSSProperties } => {
      const col = statusColumns?.find(c => c.id === status);
      if (col) {
        const bgColor = col.color || '#e5e7eb';
        const textClass = getReadableTextClassFor(bgColor);
        return {
          className: textClass,
          style: { backgroundColor: bgColor },
        };
      }
      // Fallback for orphaned statuses (use first available column or gray)
      if (statusColumns && statusColumns.length > 0) {
        const fallbackCol = statusColumns[0];
        const bgColor = fallbackCol.color || '#e5e7eb';
        const textClass = getReadableTextClassFor(bgColor);
        return {
          className: textClass,
          style: { backgroundColor: bgColor },
        };
      }
      // Last resort fallback
      const defaultColor = '#e5e7eb';
      const textClass = getReadableTextClassFor(defaultColor);
      return {
        className: textClass,
        style: { backgroundColor: defaultColor },
      };
    },
    [statusColumns]
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <div ref={timelineContainerRef} className="timeline-container">
        {/* Header with controls */}
        <div className="timeline-toolbar">
          <h3 className="timeline-toolbar-title">Timeline</h3>
          <button onClick={handleScrollLeft} className="timeline-toolbar-button">
            ◀
          </button>
          <button onClick={() => scrollToToday({ smooth: true })} className="timeline-toolbar-button-primary">
            Today
          </button>
          <button onClick={handleScrollRight} className="timeline-toolbar-button">
            ▶
          </button>
          
          {/* Mode toggle */}
          <div className="ml-auto flex items-center gap-1 bg-gray-100 p-1 rounded-md">
            <button
              onClick={() => setMode('projects')}
              className={`px-3 py-1 text-sm rounded-sm font-medium transition-all ${
                mode === 'projects'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Projects
            </button>
            <button
              onClick={() => setMode('people')}
              className={`px-3 py-1 text-sm rounded-sm font-medium transition-all ${
                mode === 'people'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              People
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="timeline-main-content">
          {/* Left column: swimlane labels */}
          <div className="timeline-left-column" style={{ width: `${leftColWidth}px` }}>
            {/* Combined header matching month + day header height */}
            <div className="timeline-left-header">
              <span className="timeline-left-header-title">
                {mode === 'people' ? 'People' : 'Swimlanes'}
              </span>
              {mode === 'projects' && (
                <button onClick={onAddSwimlane} className="timeline-left-header-button">
                  <Plus className="w-4 h-4" />
                </button>
              )}
              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={handleLeftResizeStart}
                className="timeline-left-resize-handle"
              />
            </div>

            <div className="timeline-left-list" ref={leftListRef}>
              {displaySwimlanes.map((swimlane, index) => {
                const height = swimlaneHeights[swimlane.id] || DEFAULT_ROW_HEIGHT;
                const taskCount = mode === 'people'
                  ? tasks.filter(t => t.assigneeId === swimlane.id).length
                  : tasks.filter(t => t.swimlaneId === swimlane.id).length;
                
                return (
                  <div key={swimlane.id} className="timeline-swimlane-label-container" style={{ height: `${height}px`, minHeight: `${height}px` }}>
                    <DraggableSwimlaneLabel
                      swimlane={swimlane}
                      index={index}
                      leftColWidth={leftColWidth}
                      rowHeight={height}
                      onEditSwimlane={mode === 'projects' ? onEditSwimlane : () => {}}
                      onMoveSwimlane={handleMoveSwimlane}
                      mode={mode}
                      taskCount={taskCount}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right column: timeline */}
          <div ref={rowsContainerRef} className="timeline-right-column">
            <div className="timeline-grid-container" style={{ minWidth: `${totalTimelineWidth + endPadding}px` }}>
              {/* Header: months and days - sticky at top */}
              <div className="timeline-header-container" style={{ height: 'fit-content', minHeight: `${HEADER_HEIGHT}px`, overflow: 'visible' }}>
              <TimelineHeader
                datesByMonth={datesByMonth}
                monthWidths={monthWidths}
                dayWidths={dayWidths}
                defaultDayWidth={DEFAULT_DAY_WIDTH}
                totalTimelineWidth={totalTimelineWidth}
                endPadding={endPadding}
                rowHeight={DEFAULT_ROW_HEIGHT}
                swimlaneCount={displaySwimlanes.length}
                todayOffset={todayOffset}
                highlightToday={true}
                headerRef={headerRef}
              />
            </div>

            {/* Swimlane rows: tasks */}
            <div className="timeline-rows-container">
              {displaySwimlanes.map((swimlane, idx) => {
                const swimlaneTasks = mode === 'people'
                  ? tasks.filter(t => t.assigneeId === swimlane.id)
                  : tasks.filter(t => t.swimlaneId === swimlane.id);
                const height = swimlaneHeights[swimlane.id] || DEFAULT_ROW_HEIGHT;

                return (
                  <div
                    key={swimlane.id}
                    className="swimlane-row relative"
                    style={{ height: `${height}px`, minHeight: `${height}px` }}
                  >
                    <DraggableSwimlaneRow
                      swimlane={swimlane}
                      index={idx}
                      tasks={swimlaneTasks}
                      dates={dates}
                      dateWidths={dayWidths}
                      monthKeys={Object.keys(datesByMonth)}
                      monthWidths={monthWidths}
                      datesByMonth={datesByMonth}
                      totalTimelineWidth={totalTimelineWidth}
                      rowHeight={height}
                      onTaskClick={onTaskClick}
                      onAddTask={(date, swimlaneId, endDate) => onAddTask(date, swimlaneId, endDate, mode)}
                      onEditSwimlane={onEditSwimlane}
                      onMoveSwimlane={handleMoveSwimlane}
                      onMoveTaskToSwimlane={(taskId, swimlaneId, newStartDate, newEndDate) => {
                        const task = tasks.find(t => t.id === taskId);
                        if (task) {
                          // Update swimlane/assignee and dates if provided
                          const updated = { ...task };
                          if (mode === 'people') {
                            updated.assigneeId = swimlaneId;
                          } else {
                            updated.swimlaneId = swimlaneId;
                          }
                          if (newStartDate) updated.startDate = newStartDate;
                          if (newEndDate) updated.endDate = newEndDate;
                          
                          // Update the task in the state
                          onReorderTasks(tasks.map(t => (t.id === taskId ? updated : t)));
                          
                          // Also trigger onUpdateTaskDates if dates changed
                          if (newStartDate && newEndDate) {
                            onUpdateTaskDates(taskId, newStartDate, newEndDate);
                          }
                        }
                      }}
                      getTaskPosition={getTaskPosition}
                      getTaskColor={getTaskColor}
                      handleResizeStart={(e, task, edge) => {
                        setResizingTask({
                          taskId: task.id,
                          edge,
                          initialX: e.clientX,
                          initialStartDate: task.startDate || '',
                          initialEndDate: task.endDate || '',
                        });
                      }}
                      resizingTaskId={resizingTask?.taskId ?? null}
                      ignoreAddTaskUntil={ignoreAddTaskUntil}
                      scrollContainerRef={rowsContainerRef}
                    />
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
