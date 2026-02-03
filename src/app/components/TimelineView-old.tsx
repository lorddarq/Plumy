import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import type { CSSProperties } from 'react';
import MonthsScroller from './MonthsScrollerFixed';
import { TimelineHeader } from './TimelineHeader';
import { SwimlaneRowsView } from './SwimlaneRowsView';
import { allocateTasksToTracks, calculateSwimlaneHeight } from '../utils/trackAllocation';

// Left column resize defaults

import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Plus } from 'lucide-react';
import { Task, TimelineSwimlane, TaskStatus } from '../types';
import { getReadableTextClassFor } from '../utils/contrast';
import { DraggableSwimlaneRow } from '../components/DraggableSwimlaneRow';
import { DraggableSwimlaneLabel } from '../components/DraggableSwimlaneLabel';

interface TimelineViewProps {
  tasks: Task[];
  swimlanes: TimelineSwimlane[];
  statusColumns?: Array<{ id: TaskStatus; title: string; color?: string }>;
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
  statusColumns,
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
  const leftResizeRef = useRef<{ startX: number; startWidth: number; pendingWidth?: number } | null>(null);
  const resizeRafRef = useRef<number | null>(null);

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
      leftResizeRef.current.pendingWidth = newWidth;

      // throttle updates to one per animation frame to avoid paint artifacts
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

      // ensure we force a redraw to clear any artifacts that linger after resize
      triggerTimelineRedraw();

      // recompute header height (fixes header jump/offset issues)
      recomputeHeaderHeight();

      // force a lightweight React re-render (matching the behavior when a task is moved)
      setRerenderTick(t => t + 1);

      // ignore clicks for a short time to avoid click-after-resize triggering add-task
      setIgnoreAddTaskUntil(Date.now() + 350);

      setIsResizingLeft(false);
      leftResizeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (resizeRafRef.current != null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    };
  }, [isResizingLeft, leftColWidth]);


  const defaultDayWidth = 60; // base day width used to initialize month widths

  // Compute visible date range from real tasks (pad and align to month boundaries). If there
  // are no dated tasks, show current + next month by default.
  const dates = useMemo(() => {
    const datedTasks = tasks.filter(t => t.startDate && t.endDate);

    if (datedTasks.length === 0) {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      // include next month for some context
      const extendedEnd = new Date(end);
      extendedEnd.setMonth(extendedEnd.getMonth() + 1);

      const arr: Date[] = [];
      const d = new Date(start);
      while (d <= extendedEnd) {
        arr.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
      return arr;
    }

    // find min and max from tasks
    let minDate = datedTasks.map(t => new Date(t.startDate!)).reduce((a, b) => a < b ? a : b);
    let maxDate = datedTasks.map(t => new Date(t.endDate!)).reduce((a, b) => a > b ? a : b);

    // pad for breathing room
    const PAD_DAYS = 7;
    minDate = new Date(minDate);
    minDate.setDate(minDate.getDate() - PAD_DAYS);
    maxDate = new Date(maxDate);
    maxDate.setDate(maxDate.getDate() + PAD_DAYS);

    // align to month boundaries for cleaner headers
    let start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    let end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);

    // Ensure today's date is included in the range so we can scroll to it and highlight it
    const today = new Date();
    const todayNoTime = new Date(today.getFullYear(), today.getMonth(), today.getDate());
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

  // Ensure month widths exist for any newly created months when the date range changes
  useEffect(() => {
    setMonthWidths(prev => {
      const nw: Record<string, number> = { ...prev };
      Object.entries(datesByMonth).forEach(([k, monthDates]) => {
        if (!nw[k]) nw[k] = monthDates.length * defaultDayWidth;
      });
      return nw;
    });
    // allow auto-sizing to re-run for the new date range
    lastAutoSizeRef.current = null;
  }, [datesByMonth]);

  
  const getMonthLabel = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long' });
  };

  const getDayLabel = (date: Date) => {
    return date.getDate().toString().padStart(2, '0');
  };

  const isSameDate = (a: Date, b: Date) => {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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

  // End padding (breathing room) for timeline scrollers
  const [endPadding, setEndPadding] = useState<number>(24);
  const [isResizingEnd, setIsResizingEnd] = useState<boolean>(false);
  const endResizeRef = useRef<{ startX: number; startPadding: number } | null>(null);

  // Today marker and automatic scroll-to-today
  const scrolledToTodayRef = useRef(false);
  const [todayIndex, setTodayIndex] = useState<number | null>(null);
  const [todayOffset, setTodayOffset] = useState<number | null>(null);
  const [highlightToday, setHighlightToday] = useState(false);

  const scrollToToday = (opts?: { smooth?: boolean }) => {
    const offset = typeof todayOffset === 'number' ? todayOffset : (todayIndex != null ? dayWidths.slice(0, todayIndex).reduce((a, b) => a + b, 0) : null);
    if (offset == null || !headerRef.current) return;
    try {
      headerRef.current.scrollTo({ left: offset, behavior: opts?.smooth ? 'smooth' : 'auto' });
    } catch (e) {
      // some environments might not support smooth option; fallback
      headerRef.current.scrollLeft = offset;
    }
    setHighlightToday(true);
    window.setTimeout(() => setHighlightToday(false), 900);
  };

  // Timestamp until which clicks to add tasks should be ignored (used to prevent click-after-resize)
  const [ignoreAddTaskUntil, setIgnoreAddTaskUntil] = useState<number | null>(null);

  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const rowsContainerRef = useRef<HTMLDivElement | null>(null);
  const leftListRef = useRef<HTMLDivElement | null>(null);
  const fixedBtnRef = useRef<HTMLDivElement | null>(null);
  const isSyncingRef = useRef(false);
  const lastAutoSizeRef = useRef<number | null>(null);

  // Panning (drag-to-scroll) state refs
  const panRef = useRef<{ isPanning: boolean; startX: number; startScrollLeft: number }>({ isPanning: false, startX: 0, startScrollLeft: 0 });

  const startPan = (clientX: number) => {
    const el = headerRef.current;
    if (!el) return;
    panRef.current.isPanning = true;
    panRef.current.startX = clientX;
    panRef.current.startScrollLeft = el.scrollLeft;
    // prevent text selection while panning
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  };

  // Force a small redraw/painter nudge on key timeline elements to fix repaint artifacts
  const [, setRerenderTick] = useState(0);

  // Compute today's index & offset whenever dates/dayWidths changes
  useEffect(() => {
    if (!dayWidths || dayWidths.length === 0) return;
    const today = new Date();
    const todayNoTime = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const idx = dates.findIndex(d => isSameDate(d, todayNoTime));
    if (idx >= 0) {
      setTodayIndex(idx);
      const prefix = dayWidths.slice(0, idx).reduce((a, b) => a + b, 0);
      setTodayOffset(prefix);

      // Scroll the header so that today is the leftmost visible date on initial render
      if (headerRef.current && !scrolledToTodayRef.current) {
        headerRef.current.scrollLeft = prefix;
        scrolledToTodayRef.current = true;
      }
    } else {
      setTodayIndex(null);
      setTodayOffset(null);
    }
  }, [dates, dayWidths]);

  const triggerTimelineRedraw = useCallback(() => {
    try {
      const els = [timelineContainerRef.current, headerRef.current, rowsContainerRef.current].filter(Boolean) as HTMLElement[];
      if (!els.length) return;
      els.forEach(el => el.classList.add('timeline-redraw-flash'));
      // force layout
      els.forEach(el => void el.offsetHeight);
      requestAnimationFrame(() => {
        els.forEach(el => el.classList.remove('timeline-redraw-flash'));
      });
    } catch (err) {
      // ignore
    }
  }, []);

  // Recompute header height after layout changes (used after resize to ensure header sizing is correct)
  const recomputeHeaderHeight = useCallback(() => {
    const el = headerRef.current;
    const container = timelineContainerRef.current;
    if (!el || !container) return;
    const monthEl = el.querySelector('[data-month-header]') as HTMLElement | null;
    const dayEl = el.querySelector('[data-day-header]') as HTMLElement | null;
    let h = 0;
    if (monthEl) h += Math.round(monthEl.getBoundingClientRect().height);
    if (dayEl) h += Math.round(dayEl.getBoundingClientRect().height);
    if (h === 0) h = DEFAULT_HEADER_HEIGHT;
    container.style.setProperty('--timeline-header-height', `${h}px`);
  }, []);

  // find first ancestor that can scroll horizontally
  function findHorizontalScrollAncestor(el: HTMLElement | null): HTMLElement | null {
    let cur = el;
    while (cur && cur !== document.body) {
      const style = getComputedStyle(cur);
      const overflowX = style.overflowX;
      if ((overflowX === 'auto' || overflowX === 'scroll') && cur.scrollWidth > cur.clientWidth) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  const scrollByAmount = useCallback((amount: number) => {
    const el = headerRef.current as HTMLElement | null;
    if (!el) return;

    // find the actual horizontal scroller ancestor (in case structure changes)
    let target = findHorizontalScrollAncestor(el) ?? el;

    // if the chosen target has no scrollable width, try falling back to the document/body scroller
    let max = Math.max(0, (target.scrollWidth || 0) - (target.clientWidth || 0));
    let used = target === el ? 'headerRef' : 'foundAncestor';

    if (max === 0) {
      const docEl = (document.scrollingElement || document.documentElement) as HTMLElement | null;
      const bodyEl = document.body as HTMLElement | null;

      const docCandidates: { el: HTMLElement; diff: number }[] = [];
      [docEl, bodyEl].forEach(d => {
        if (!d) return;
        const diff = Math.max(0, (d.scrollWidth || 0) - (d.clientWidth || 0));
        if (diff > 0) docCandidates.push({ el: d, diff });
      });

      if (docCandidates.length) {
        docCandidates.sort((a, b) => b.diff - a.diff);
        target = docCandidates[0].el;
        max = docCandidates[0].diff;
        used = 'document';
      }
    }



    if (typeof target.scrollBy === 'function' && max > 0) {
      try {
        target.scrollBy({ left: amount, behavior: 'smooth' });
        return;
      } catch (err) {
        // fall through
      }
    }

    if (max > 0) {
      const cur = (target.scrollLeft || 0);
      const next = Math.max(0, Math.min(cur + amount, max));
      target.scrollLeft = next;
    } else {
      // nothing scrollable found — no-op
    }
  }, []);



  // Handlers that log clicks and call the scroller helper
  const handleScrollLeft = useCallback(() => {
    scrollByAmount(-400);
  }, [scrollByAmount]);

  const handleScrollRight = useCallback(() => {
    scrollByAmount(400);
  }, [scrollByAmount]);

  const handleHeaderMouseDown = useCallback((e: any) => {
    const target = e.target as HTMLElement;
    // be careful: task elements use a class name containing a slash ('group/task'), which
    // must be escaped in a CSS selector when calling closest()
    if (target.closest('.group\\/task')) return;
    startPan(e.clientX);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!panRef.current.isPanning) return;
      const el = headerRef.current;
      if (!el) return;
      const delta = e.clientX - panRef.current.startX;
      el.scrollLeft = Math.max(0, panRef.current.startScrollLeft - delta);
    };

    const handleMouseUp = () => {
      if (!panRef.current.isPanning) return;
      panRef.current.isPanning = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);  // CSS vars: --row-height and --timeline-header-height will be set on the timeline container
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

  // Auto-resize months to fill available container width when the timeline is much smaller than viewport
  useLayoutEffect(() => {
    const container = timelineContainerRef.current;
    if (!container) return;
    const availableWidth = Math.max(0, container.clientWidth - leftColWidth);
    const currentTotal = Object.values(monthWidths).reduce((a, b) => a + (b || 0), 0) + endPadding;

    // If there's extra room, distribute it proportionally to months (but only re-run when different available width)
    if (availableWidth > currentTotal && lastAutoSizeRef.current !== availableWidth) {
      const scale = (availableWidth - endPadding) / (currentTotal - endPadding || 1);
      setMonthWidths(prev => {
        const out: Record<string, number> = {};
        Object.entries(prev).forEach(([k, v]) => {
          const minW = 40 * (datesByMonth[k]?.length ?? 1);
          out[k] = Math.max(minW, Math.round(v * scale));
        });
        return out;
      });
      lastAutoSizeRef.current = availableWidth;
    }
  }, [leftColWidth, monthWidths, endPadding, datesByMonth]);

  // Keep the fixed scroll buttons aligned with the visible header area
  useLayoutEffect(() => {
    const wrapper = fixedBtnRef.current;
    const update = () => {
      const w = fixedBtnRef.current;
      const h = headerRef.current;
      if (!w || !h) return;
      const rect = h.getBoundingClientRect();
      // place buttons slightly below the header's top (8px offset)
      const top = Math.max(8, rect.top + 8);
      w.style.top = `${top}px`;
      w.style.right = `8px`;
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
    };
  }, [headerRef, leftColWidth, monthWidths, endPadding, dates.length]);



  // We now render months (header + body) together so no scroll-sync is needed.





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
      // ignore clicks briefly after resizing to avoid triggering add-task clicks
      setIgnoreAddTaskUntil(Date.now() + 350);
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

  // Calculate task position and width (robust to tasks outside the visible date range)
  const getTaskPosition = useCallback((task: Task) => {
    if (!task.startDate || !task.endDate) return null;

    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const startDate = new Date(task.startDate);
    const endDate = new Date(task.endDate);
    const firstDate = dates[0];

    // build prefix sums of day widths for O(1) range queries
    const prefix: number[] = [0];
    for (let i = 0; i < dayWidths.length; i++) prefix.push(prefix[i] + (dayWidths[i] ?? defaultDayWidth));

    const rawStart = Math.floor((startDate.getTime() - firstDate.getTime()) / MS_PER_DAY);
    const rawEnd = Math.floor((endDate.getTime() - firstDate.getTime()) / MS_PER_DAY);

    const startIndex = Math.max(0, Math.min(dates.length - 1, rawStart));
    const endIndex = Math.max(0, Math.min(dates.length - 1, rawEnd));

    const left = prefix[startIndex] ?? 0;
    const width = (prefix[endIndex + 1] ?? prefix[prefix.length - 1]) - (prefix[startIndex] ?? 0);

    return {
      left,
      width: Math.max(8, width - 8),
    };
  }, [dates, dayWidths]);


  const getTaskColor = useCallback((status: string) => {
    // Prefer a statusColumns mapping provided by parent so colors stay in sync with columns
    const col = (statusColumns || []).find(s => s.id === status);
    if (col && col.color) {
      const c = col.color;
      // If it's a Tailwind class like 'bg-cyan-500' use it as a className and compute readable text color
      if (c.startsWith('bg-') || c.startsWith('text-') || c.startsWith('border-')) {
        const textClass = getReadableTextClassFor(c);
        return { className: c, textClass };
      }
      // If it's a hex color, return inline style and compute readable text class
      if (c.startsWith('#')) {
        const textClass = getReadableTextClassFor(c, c);
        return { style: { backgroundColor: c }, textClass };
      }
      // fallback: treat as className
      const textClass = getReadableTextClassFor(c);
      return { className: c, textClass };
    }

    // Default theme mapping
    switch (status) {
      case 'open': {
        const cn = 'bg-cyan-400 hover:bg-cyan-500';
        return { className: cn, textClass: getReadableTextClassFor(cn) };
      }
      case 'in-progress': {
        const cn = 'bg-blue-400 hover:bg-blue-500';
        return { className: cn, textClass: getReadableTextClassFor(cn) };
      }
      case 'under-review': {
        const cn = 'bg-pink-400 hover:bg-pink-500';
        return { className: cn, textClass: getReadableTextClassFor(cn) };
      }
      case 'done': {
        const cn = 'bg-purple-400 hover:bg-purple-500';
        return { className: cn, textClass: getReadableTextClassFor(cn) };
      }
      default: {
        const cn = 'bg-gray-400 hover:bg-gray-500';
        return { className: cn, textClass: getReadableTextClassFor(cn) };
      }
    }
  }, [statusColumns]);

  const handleResizeStart = useCallback((
    e: React.MouseEvent,
    task: Task,
    edge: 'start' | 'end'
  ) => {
    // Prevent other interactions (drag, selection) from starting
    e.preventDefault();
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

  const handleMoveTaskToSwimlane = useCallback((taskId: string, swimlaneId: string, newStartDate?: string, newEndDate?: string) => {
    const updatedTasks = tasks.map(task =>
      task.id === taskId ? { ...task, swimlaneId, ...(newStartDate ? { startDate: newStartDate } : {}), ...(newEndDate ? { endDate: newEndDate } : {}) } : task
    );
    // if dates were provided, also call onUpdateTaskDates for single-source-of-truth handlers
    if (newStartDate && newEndDate) {
      onUpdateTaskDates(taskId, newStartDate, newEndDate);
    }
    onReorderTasks(updatedTasks);
  }, [tasks, onReorderTasks, onUpdateTaskDates]);

  // Keep left and right vertical scroll positions in sync so swimlane rows line up
  // with the left labels. Sync in both directions and guard against feedback loops.
  // This effect relies on DOM refs and doesn't run on server.
  useEffect(() => {
    const left = leftListRef.current;
    const right = rowsContainerRef.current;
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

  // Prevent vertical wheel events from causing horizontal scrolling on the header.
  useEffect(() => {
    const header = headerRef.current;
    const rows = rowsContainerRef.current;
    if (!header) return;

    const onWheelHeader = (e: WheelEvent) => {
      // if the wheel movement is predominantly vertical, forward to the rows scroller
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        if (rows) rows.scrollTop += e.deltaY;
      }
    };

    header.addEventListener('wheel', onWheelHeader, { passive: false });
    return () => header.removeEventListener('wheel', onWheelHeader);
  }, []);

  // Prevent horizontal wheel events on the rows container from causing body scroll
  useEffect(() => {
    const header = headerRef.current;
    const rows = rowsContainerRef.current;
    if (!rows) return;

    const onWheelRows = (e: WheelEvent) => {
      // if the wheel movement is predominantly horizontal, forward to the header scroller
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        if (header) header.scrollLeft += e.deltaX;
      }
    };

    rows.addEventListener('wheel', onWheelRows, { passive: false });
    return () => rows.removeEventListener('wheel', onWheelRows);
  }, []);

  // set CSS variables for layout (no DOM measurement to avoid recursion)
  useLayoutEffect(() => {
    const container = timelineContainerRef.current;
    const header = headerRef.current;
    if (!container) return;

    // prevent the page from gaining horizontal overflow due to the timeline content
    container.style.overflowX = 'hidden';

    // set CSS vars
    container.style.setProperty('--timeline-header-height', `${DEFAULT_HEADER_HEIGHT}px`);
    container.style.setProperty('--row-height', `${DEFAULT_ROW_HEIGHT}px`);
    container.style.setProperty('--left-col-width', `${leftColWidth}px`);
    container.style.setProperty('--total-timeline-width', `${totalTimelineWidth + endPadding}px`);
    container.style.setProperty('--end-padding', `${endPadding}px`);

    // constrain the header scroller to the available viewport width minus left column
    const updateHeaderMax = () => {
      if (!header) return;
      const available = Math.max(0, window.innerWidth - leftColWidth - 32); // 32px for padding & buttons
      header.style.maxWidth = `${available}px`;
      header.style.boxSizing = 'border-box';
    };

    updateHeaderMax();
    window.addEventListener('resize', updateHeaderMax);
    return () => window.removeEventListener('resize', updateHeaderMax);
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
                  {/* Buttons anchored to the viewport: position:fixed and measured so they stay visible */}
                  <div ref={fixedBtnRef} style={{ position: 'fixed', right: 8, top: 80, zIndex: 99999, pointerEvents: 'auto' }}>
                    <div style={{ pointerEvents: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button aria-label="Scroll left" title="Scroll left" className="timeline-scroll-btn z-40 rounded-full bg-white/70 hover:bg-white p-1 shadow" onClick={handleScrollLeft}>◀</button>

                      <button aria-label="Today" title="Today" className="timeline-today-btn z-40 rounded bg-white/90 hover:bg-white px-3 py-1 shadow text-sm" onClick={() => scrollToToday({ smooth: true })}>Today</button>

                      <button aria-label="Scroll right" title="Scroll right" className="timeline-scroll-btn z-40 rounded-full bg-white/70 hover:bg-white p-1 shadow" onClick={handleScrollRight}>▶</button>
                    </div>
                  </div>
              <div className="timeline-viewport relative overflow-hidden">
                <div ref={headerRef} className="hide-scrollbar" style={{ overflowX: 'auto', overflowY: 'hidden' }} onMouseDown={handleHeaderMouseDown}>
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
                              </div>
                              <div data-day-header className="day-row px-1 py-2 border-b bg-white flex h-[var(--row-height)]">
                                {m.dates.map((d, i) => {
                                  const globalIdx = m.startIndex + i;
                                  const w = dayWidths[globalIdx] ?? defaultDayWidth;
                                  const today = new Date();
                                  const todayNoTime = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                                  const isToday = isSameDate(d, todayNoTime);
                                  return (
                                    <div key={i} className="day-cell flex items-center justify-center" style={{ width: `${w}px` }}>
                                      <div
                                        title={isToday ? 'Today' : undefined}
                                        aria-label={isToday ? 'Today' : undefined}
                                        className={`text-xs ${isToday ? 'border-2 border-blue-500 text-blue-600 rounded-full w-6 h-6 flex items-center justify-center' : 'text-gray-500'} ${isToday && highlightToday ? 'ring-2 ring-blue-300' : ''}`}
                                      >
                                        {getDayLabel(d)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Per-month swimlane placeholders so area-selection and month-scoped interactions live inside the same column */}
                              <div className="month-swimlanes absolute left-0 right-0 top-[var(--timeline-header-height)] flex flex-col pointer-events-none">
                                {swimlanes.map((s, si) => (
                                  <div key={s.id} data-month-cell className="month-swimlane-cell" style={{ height: 'var(--row-height)', minHeight: 'var(--row-height)', borderBottom: '1px solid rgba(0,0,0,0.04)' }} aria-hidden />
                                ))}

                                {/* Vertical today marker */}
                                {typeof todayOffset !== 'undefined' && todayOffset !== null && (
                                  <div className="absolute top-0 bottom-0 w-[2px] bg-blue-200 pointer-events-none" style={{ left: `${todayOffset}px` }} aria-hidden />
                                )}
                              </div>
                            </div>
                          ))}
                          {/* trailing spacer */}
                          <div className="months-end-spacer w-[var(--end-padding)] flex-shrink-0" aria-hidden />
                        </div>
                      </div>

                      {/* Swimlane area: stacked rows positioned over the same horizontal width */}

                      {/* Swimlane area: stacked rows positioned over the same horizontal width */}
                      <div ref={rowsContainerRef} className="swimlane-rows relative min-w-[var(--total-timeline-width)]" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
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
                              ignoreAddTaskUntil={ignoreAddTaskUntil}
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
      </div>
    </DndProvider>
  );
}
 