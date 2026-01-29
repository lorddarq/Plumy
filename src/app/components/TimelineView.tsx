import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import MonthsScroller from './MonthsScrollerFixed';

// Left column resize defaults

import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Plus } from 'lucide-react';
import { Task, TimelineSwimlane } from '../types';
import { DraggableSwimlaneRow } from '../components/DraggableSwimlaneRow';
import { DraggableSwimlaneLabel } from '../components/DraggableSwimlaneLabel';

interface TimelineViewProps {
  tasks: Task[];
  swimlanes: TimelineSwimlane[];
  onTaskClick: (task: Task) => void;
  onAddTask: (date: Date, swimlaneId: string) => void;
  onUpdateTaskDates: (taskId: string, startDate: string, endDate: string) => void;
  onEditSwimlane: (swimlane: TimelineSwimlane) => void;
  onAddSwimlane: () => void;
  onReorderSwimlanes: (swimlanes: TimelineSwimlane[]) => void;
  onReorderTasks: (tasks: Task[]) => void;
}

export function TimelineView({
  tasks,
  swimlanes,
  onTaskClick,
  onAddTask,
  onUpdateTaskDates,
  onEditSwimlane,
  onAddSwimlane,
  onReorderSwimlanes,
  onReorderTasks,
}: TimelineViewProps) {
  const [resizingTask, setResizingTask] = useState<{
    taskId: string;
    edge: 'start' | 'end';
    initialX: number;
    initialStartDate: string;
    initialEndDate: string;
  } | null>(null);

  // Left column resizing state
  const [leftColWidth, setLeftColWidth] = useState<number>(200);
  const [isResizingLeft, setIsResizingLeft] = useState<boolean>(false);
  const leftResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

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
      newWidth = Math.max(120, Math.min(480, newWidth)); // clamp between 120 and 480
      setLeftColWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      leftResizeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeft]);


  // Generate dates for the timeline (30 days starting from today)
  const generateDates = () => {
    const dates = [];
    const today = new Date(2026, 1, 16); // Feb 16, 2026 as starting point
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const dates = useMemo(() => generateDates(), []);
  const defaultDayWidth = 60; // base day width used to initialize month widths

  // Group dates by month (memoized)
  const datesByMonth = useMemo(() => {
    const m: { [key: string]: Date[] } = {};
    dates.forEach(date => {
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!m[monthKey]) m[monthKey] = [];
      m[monthKey].push(date);
    });
    return m;
  }, [dates]);

  const monthKeys = Object.keys(datesByMonth);

  // Initialize month widths state to proportional default sizes
  const [monthWidths, setMonthWidths] = useState<Record<string, number>>(() => {
    const mw: Record<string, number> = {};
    Object.entries(datesByMonth).forEach(([k, monthDates]) => {
      mw[k] = monthDates.length * defaultDayWidth;
    });
    return mw;
  });

  // Derived day widths array aligned with dates[]
  const [dayWidths, setDayWidths] = useState<number[]>(() => {
    const arr: number[] = [];
    Object.entries(datesByMonth).forEach(([k, monthDates]) => {
      const perDay = (monthWidths && monthWidths[k]) ? monthWidths[k] / monthDates.length : defaultDayWidth;
      monthDates.forEach(() => arr.push(perDay));
    });
    return arr;
  });

  
  const getMonthLabel = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long' });
  };

  const getDayLabel = (date: Date) => {
    return date.getDate().toString().padStart(2, '0');
  };

  // datesByMonth creation moved above where month widths are initialized

  // Update dayWidths when monthWidths changes
  useEffect(() => {
    const arr: number[] = [];
    Object.entries(datesByMonth).forEach(([k, monthDates]) => {
      const perDay = (monthWidths && monthWidths[k]) ? monthWidths[k] / monthDates.length : defaultDayWidth;
      monthDates.forEach(() => arr.push(perDay));
    });
    setDayWidths(arr);
  }, [monthWidths, datesByMonth]);

  // Month resize state
  const [resizingMonth, setResizingMonth] = useState<{ monthKey: string; startX: number; startWidth: number } | null>(null);
  const resizingMonthRef = useRef<{ monthKey: string; startX: number; startWidth: number } | null>(null);
  // End padding (breathing room) for timeline scrollers
  const [endPadding, setEndPadding] = useState<number>(24);
  const [isResizingEnd, setIsResizingEnd] = useState<boolean>(false);
  const endResizeRef = useRef<{ startX: number; startPadding: number } | null>(null);

  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const leftListRef = useRef<HTMLDivElement | null>(null);
  const isSyncingRef = useRef(false);
  // CSS vars: --row-height and --timeline-header-height will be set on the timeline container
  const DEFAULT_ROW_HEIGHT = 48; // px
  const DEFAULT_HEADER_HEIGHT = 72; // px (month label + day row)

  const totalTimelineWidth = useMemo(() => Object.values(monthWidths).reduce((a, b) => a + (b || 0), 0), [monthWidths]);

  // Measure header once to sync CSS var --timeline-header-height to actual header content height
  useLayoutEffect(() => {
    const el = headerRef.current;
    const container = timelineContainerRef.current;
    if (!el || !container) return;
    // measure only the month header row and the day header row (not the full grid)
    const monthEl = el.querySelector('[data-month-header]') as HTMLElement | null;
    const dayEl = el.querySelector('[data-day-header]') as HTMLElement | null;
    let h = 0;
    if (monthEl) h += Math.round(monthEl.getBoundingClientRect().height);
    if (dayEl) h += Math.round(dayEl.getBoundingClientRect().height);
    if (h === 0) h = DEFAULT_HEADER_HEIGHT;
    container.style.setProperty('--timeline-header-height', `${h}px`);
  }, [dayWidths, monthWidths, dates.length]);

  // We now render months (header + body) together so no scroll-sync is needed.



  const handleMonthResizeStart = (e: React.MouseEvent, monthKey: string) => {
    e.preventDefault();
    setResizingMonth({ monthKey, startX: e.clientX, startWidth: monthWidths[monthKey] });
    resizingMonthRef.current = { monthKey, startX: e.clientX, startWidth: monthWidths[monthKey] };
  };

  useEffect(() => {
    if (!resizingMonth) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingMonthRef.current) return;
      const delta = e.clientX - resizingMonthRef.current.startX;
      const monthKey = resizingMonthRef.current.monthKey;
      const numDays = datesByMonth[monthKey].length;
      let newWidth = Math.round(resizingMonthRef.current.startWidth + delta);
      const minWidth = 40 * numDays; // min 40px per day
      const maxWidth = 1000; // arbitrary max
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setMonthWidths(prev => ({ ...prev, [monthKey]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizingMonth(null);
      resizingMonthRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingMonth, datesByMonth]);

  // End padding resize handlers
  const handleEndResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingEnd(true);
    endResizeRef.current = { startX: e.clientX, startPadding: endPadding };
  };

  useEffect(() => {
    if (!isResizingEnd) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!endResizeRef.current) return;
      const delta = e.clientX - endResizeRef.current.startX;
      let newPad = Math.round(endResizeRef.current.startPadding + delta);
      newPad = Math.max(0, Math.min(800, newPad));
      setEndPadding(newPad);
    };

    const handleMouseUp = () => {
      setIsResizingEnd(false);
      endResizeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingEnd]);


  // Get timeline tasks (tasks with dates)
  const timelineTasks = tasks.filter(task => task.startDate && task.endDate);

  // Calculate task position and width
  const getTaskPosition = useCallback((task: Task) => {
    if (!task.startDate || !task.endDate) return null;

    const startDate = new Date(task.startDate);
    const endDate = new Date(task.endDate);
    const firstDate = dates[0];

    const startIndex = Math.floor((startDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    const duration = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // compute left by summing dayWidths up to startIndex
    let left = 0;
    for (let i = 0; i < startIndex; i++) {
      left += dayWidths[i] ?? defaultDayWidth;
    }

    // compute width by summing dayWidths across duration
    let width = 0;
    for (let i = startIndex; i < startIndex + duration; i++) {
      width += dayWidths[i] ?? defaultDayWidth;
    }

    return {
      left,
      width: Math.max(8, width - 8),
    };
  }, [dates, dayWidths]);

  const getTaskColor = useCallback((status: string) => {
    switch (status) {
      case 'open':
        return 'bg-cyan-400 hover:bg-cyan-500';
      case 'in-progress':
        return 'bg-blue-400 hover:bg-blue-500';
      case 'under-review':
        return 'bg-pink-400 hover:bg-pink-500';
      case 'done':
        return 'bg-purple-400 hover:bg-purple-500';
      default:
        return 'bg-gray-400 hover:bg-gray-500';
    }
  }, []);

  const handleResizeStart = useCallback((
    e: React.MouseEvent,
    task: Task,
    edge: 'start' | 'end'
  ) => {
    e.stopPropagation();
    if (!task.startDate || !task.endDate) return;

    setResizingTask({
      taskId: task.id,
      edge,
      initialX: e.clientX,
      initialStartDate: task.startDate,
      initialEndDate: task.endDate,
    });
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingTask) return;

    const deltaX = e.clientX - resizingTask.initialX;

    // compute delta in days using average day width
    const avgDayWidth = dayWidths.length ? dayWidths.reduce((a, b) => a + b, 0) / dayWidths.length : defaultDayWidth;
    const daysDelta = Math.round(deltaX / avgDayWidth);

    if (daysDelta === 0) return;

    const task = tasks.find(t => t.id === resizingTask.taskId);
    if (!task) return;

    const startDate = new Date(resizingTask.initialStartDate);
    const endDate = new Date(resizingTask.initialEndDate);

    if (resizingTask.edge === 'start') {
      startDate.setDate(startDate.getDate() + daysDelta);
      // Ensure start date doesn't go past end date
      if (startDate >= endDate) return;
    } else {
      endDate.setDate(endDate.getDate() + daysDelta);
      // Ensure end date doesn't go before start date
      if (endDate <= startDate) return;
    }

    onUpdateTaskDates(
      resizingTask.taskId,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
  }, [resizingTask, tasks, dayWidths, onUpdateTaskDates]);

  const handleMouseUp = useCallback(() => {
    setResizingTask(null);
  }, []);

  // Add event listeners for resize
  useEffect(() => {
    if (resizingTask) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [resizingTask, handleMouseMove, handleMouseUp]);

  const handleMoveSwimlane = useCallback((dragIndex: number, hoverIndex: number) => {
    const updatedSwimlanes = [...swimlanes];
    const [removed] = updatedSwimlanes.splice(dragIndex, 1);
    updatedSwimlanes.splice(hoverIndex, 0, removed);
    onReorderSwimlanes(updatedSwimlanes);
  }, [swimlanes, onReorderSwimlanes]);

  const handleMoveTaskToSwimlane = useCallback((taskId: string, swimlaneId: string) => {
    const updatedTasks = tasks.map(task =>
      task.id === taskId ? { ...task, swimlaneId } : task
    );
    onReorderTasks(updatedTasks);
  }, [tasks, onReorderTasks]);

  // Keep left and right vertical scroll positions in sync so swimlane rows line up
  // with the left labels. Sync in both directions and guard against feedback loops.
  // This effect relies on DOM refs and doesn't run on server.
  useEffect(() => {
    const left = leftListRef.current;
    const right = headerRef.current;
    if (!left || !right) return;

    const onRightScroll = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      left.scrollTop = right.scrollTop;
      requestAnimationFrame(() => { isSyncingRef.current = false; });
    };

    const onLeftScroll = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      right.scrollTop = left.scrollTop;
      requestAnimationFrame(() => { isSyncingRef.current = false; });
    };

    right.addEventListener('scroll', onRightScroll, { passive: true });
    left.addEventListener('scroll', onLeftScroll, { passive: true });

    return () => {
      right.removeEventListener('scroll', onRightScroll);
      left.removeEventListener('scroll', onLeftScroll);
    };
  }, []);

  // set CSS variables for layout (no DOM measurement to avoid recursion)
  useLayoutEffect(() => {
    const container = timelineContainerRef.current;
    if (!container) return;

    container.style.setProperty('--timeline-header-height', `${DEFAULT_HEADER_HEIGHT}px`);
    container.style.setProperty('--row-height', `${DEFAULT_ROW_HEIGHT}px`);
    container.style.setProperty('--left-col-width', `${leftColWidth}px`);
    container.style.setProperty('--total-timeline-width', `${totalTimelineWidth + endPadding}px`);
    container.style.setProperty('--end-padding', `${endPadding}px`);
  }, [leftColWidth, totalTimelineWidth, endPadding]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div ref={timelineContainerRef} className="timeline-container bg-white border-b">
        <div className="flex">
          {/* Left column */}
          <div className="left-column flex-shrink-0 flex flex-col h-full w-[var(--left-col-width)]">
            <div className="left-header border-r px-3 py-2 bg-gray-50 sticky z-40 flex items-center gap-2 w-[var(--left-col-width)] top-0 h-[var(--timeline-header-height)]" style={{ top: 0 }}>
              <span className="text-sm font-medium text-gray-700">Swimlanes</span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={onAddSwimlane} aria-label="Add swimlane" className="w-8 h-8 rounded flex items-center justify-center text-gray-600 hover:bg-gray-100">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize swimlane column"
                onMouseDown={handleLeftResizeStart}
                className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-gray-200"
              />
            </div>

            <div className="left-list-wrap bg-white border-r flex flex-col" style={{ minHeight: 0 }}>
              <div ref={leftListRef} className="left-list flex-1 overflow-auto flex-shrink-0">
                {swimlanes.map((swimlane, index) => (
                  <div key={swimlane.id} className="flex-shrink-0">
                    <DraggableSwimlaneLabel
                      swimlane={swimlane}
                      index={index}
                      leftColWidth={leftColWidth}
                      onEditSwimlane={onEditSwimlane}
                      onMoveSwimlane={(dragIndex, hoverIndex) => handleMoveSwimlane(dragIndex, hoverIndex)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column: unified grid where each month is a column group (header + days + swimlane rows) */}
          <div className="flex-1">
            <div className="relative">
              <div className="overflow-auto" ref={headerRef}>
                {/* Flex-based months wrapper + swimlanes rendered in same scroll container */}
                {(() => {
                  // ordered month keys and month meta
                  const monthKeysOrdered = Object.keys(datesByMonth).sort((a, b) => {
                    const ta = datesByMonth[a]?.[0]?.getTime() ?? 0;
                    const tb = datesByMonth[b]?.[0]?.getTime() ?? 0;
                    return ta - tb;
                  });

                  // compute monthMeta with start index so we can map into global dayWidths
                  const monthMeta: { key: string; dates: Date[]; width: number; startIndex: number }[] = [];
                  let runningIndex = 0;
                  monthKeysOrdered.forEach(k => {
                    const md = datesByMonth[k] ?? [];
                    const w = monthWidths[k] ?? (md.length * defaultDayWidth);
                    monthMeta.push({ key: k, dates: md, width: w, startIndex: runningIndex });
                    runningIndex += md.length;
                  });

                  const timelineInnerStyle: React.CSSProperties = { minWidth: `${totalTimelineWidth + endPadding}px`, display: 'flex', flexDirection: 'column' };

                  return (
                    <div style={timelineInnerStyle}>
                      {/* Top: month headers and day rows in a single horizontal flex row of month columns */}
                      <div style={{ display: 'flex', width: '100%' }}>
                        <div style={{ display: 'flex', width: '100%' }}>
                          {monthMeta.map(m => (
                                                  <div key={m.key} style={{ width: `${m.width}px` }} className="month-column border-r bg-white relative">
                                                    <div data-month-header className="month-header px-3 py-2 border-b bg-white relative">
                                                <span className="text-sm font-medium text-gray-700">{getMonthLabel(m.dates[0])}</span>
                                <div
                                  role="separator"
                                  aria-orientation="vertical"
                                  aria-label={`Resize month ${m.key}`}
                                  onMouseDown={(e) => handleMonthResizeStart(e, m.key)}
                                  className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-gray-100"
                                />
                              </div>
                              <div data-day-header className="day-row px-1 py-2 border-b bg-white flex h-[var(--row-height)]">
                                {m.dates.map((d, i) => {
                                  const globalIdx = m.startIndex + i;
                                  const w = dayWidths[globalIdx] ?? defaultDayWidth;
                                  return (
                                    <div key={i} className="day-cell flex items-center justify-center" style={{ width: `${w}px` }}>
                                      <div className="text-xs text-gray-500">{getDayLabel(d)}</div>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Per-month swimlane placeholders so area-selection and month-scoped interactions live inside the same column */}
                              <div className="month-swimlanes absolute left-0 right-0 top-[var(--timeline-header-height)] flex flex-col pointer-events-none">
                                {swimlanes.map((s, si) => (
                                  <div key={s.id} data-month-cell className="month-swimlane-cell" style={{ height: 'var(--row-height)', minHeight: 'var(--row-height)', borderBottom: '1px solid rgba(0,0,0,0.04)' }} aria-hidden />
                                ))}
                              </div>
                            </div>
                          ))}
                          {/* trailing spacer */}
                          <div className="months-end-spacer w-[var(--end-padding)] flex-shrink-0" aria-hidden />
                        </div>
                      </div>

                      {/* Swimlane area: stacked rows positioned over the same horizontal width */}
                      <div className="swimlane-rows relative min-w-[var(--total-timeline-width)]">
                        {swimlanes.map((swimlane, idx) => (
                          <div key={swimlane.id} className="swimlane-row min-h-[var(--row-height)] h-[var(--row-height)] border-b" style={{ position: 'relative' }}>
                            <DraggableSwimlaneRow
                              swimlane={swimlane}
                              index={idx}
                              tasks={timelineTasks}
                              dates={dates}
                              dateWidths={dayWidths}
                              monthKeys={monthKeysOrdered}
                              monthWidths={monthWidths}
                              datesByMonth={datesByMonth}
                              totalTimelineWidth={totalTimelineWidth}
                              onTaskClick={onTaskClick}
                              onAddTask={onAddTask}
                              onEditSwimlane={onEditSwimlane}
                              onMoveSwimlane={handleMoveSwimlane}
                              onMoveTaskToSwimlane={handleMoveTaskToSwimlane}
                              getTaskPosition={getTaskPosition}
                              getTaskColor={getTaskColor}
                              handleResizeStart={handleResizeStart}
                              resizingTaskId={resizingTask?.taskId || null}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
 