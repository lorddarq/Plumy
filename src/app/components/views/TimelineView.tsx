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
import { Task, TimelineSwimlane, TaskStatus, Person, StatusColumn } from '../../types';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { CalendarDays } from 'lucide-react';
import { TimelineHeader } from '../headers/TimelineHeader';
import { TimelineToolbar } from '../TimelineToolbar';
import { PlusIcon } from '../icons/PlusIcon';
import { UsersIcon } from '../icons/UsersIcon';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { filterTimelineTasks } from '../../utils/statusColumnSemantics';
import { EmptyStateCard } from '../EmptyStateCard';
import {
  DraggableSwimlaneLabel,
  SWIMLANE_ROW_ITEM_TYPE,
  type SwimlaneRowDragItem,
  type SwimlaneRowDropIndicator,
} from '../DraggableSwimlaneLabel';
import { DraggableSwimlaneRow } from '../DraggableSwimlaneRow';
import { allocateTasksToTracks, calculateSwimlaneHeight } from '../../utils/trackAllocation';
import { getStatusVisual } from '../../utils/roadmap';
import { getReadableOutlineColorFor } from '../../utils/contrast';
import { parseISODateLocal, toLocalISODate } from '../../utils/date';
import {
  createInitialTimelineWindow,
  extendTimelineWindow,
  extendTimelineWindowToDate,
  getTimelineWindowDates,
  getTimelineWindowScrollCompensation,
} from '../../utils/timelineWindow';
import { applyTimelineTaskDrop } from '../../utils/timelineTaskDrop';
import { resolveReorderDropIndex } from '../../utils/swimlaneReorder';
import {
  findNearestVisibleDateIndex,
  getCenteredScrollLeftForMarker,
  getVariableDaySurfaceMarker,
} from '../../utils/timeSurface';
import type { TimelineLayoutState } from '../../services/uiState';
import { persistTimelineLayoutState } from '../../services/uiState';
import { isPointerReleased } from '../../utils/pointerInteraction';
import { HorizontalScrollbar } from '../HorizontalScrollbar';

const DEFAULT_ROW_HEIGHT = 48;
const HEADER_HEIGHT = 89;
const DEFAULT_DAY_WIDTH = 60;
const DEFAULT_LEFT_COL_WIDTH = 282;
const MIN_LEFT_COL_WIDTH = 260;
const MAX_LEFT_COL_WIDTH = 420;
const HORIZONTAL_RENDER_BUFFER_PX = 1200;
const WINDOW_EXTENSION_BUFFER_PX = 1200;
const HORIZONTAL_METRICS_STEP_PX = 64;

function TimelineSwimlaneInsertionMarker({
  height,
  width,
  indicator,
  onSwimlaneDrop,
  onSwimlaneDropIndicatorClear,
}: {
  height: number;
  width?: number | string;
  indicator: SwimlaneRowDropIndicator;
  onSwimlaneDrop: (draggedId: string, indicator: SwimlaneRowDropIndicator) => void;
  onSwimlaneDropIndicatorClear: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [, drop] = useDrop({
    accept: SWIMLANE_ROW_ITEM_TYPE,
    drop: (item: SwimlaneRowDragItem) => {
      onSwimlaneDrop(item.swimlane.id, indicator);
      onSwimlaneDropIndicatorClear();
    },
  });

  drop(ref);

  return (
    <div
      ref={ref}
      className="reserved-slot reserved-slot--interactive reserved-slot--timeline-swimlane"
      style={{
        height: `${height}px`,
        minHeight: `${height}px`,
        width,
      }}
      aria-hidden="true"
    />
  );
}

function TimelineSwimlaneEndDropZone({
  width,
  lastSwimlaneId,
  onSwimlaneDrop,
  onSwimlaneDropIndicatorChange,
  onSwimlaneDropIndicatorClear,
}: {
  width?: number | string;
  lastSwimlaneId?: string;
  onSwimlaneDrop: (draggedId: string, indicator: SwimlaneRowDropIndicator) => void;
  onSwimlaneDropIndicatorChange: (indicator: SwimlaneRowDropIndicator | null) => void;
  onSwimlaneDropIndicatorClear: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [, drop] = useDrop({
    accept: SWIMLANE_ROW_ITEM_TYPE,
    hover: () => {
      if (!lastSwimlaneId) return;
      onSwimlaneDropIndicatorChange({
        targetId: lastSwimlaneId,
        position: 'after',
      });
    },
    drop: (item: SwimlaneRowDragItem) => {
      if (!lastSwimlaneId) return;
      onSwimlaneDrop(item.swimlane.id, {
        targetId: lastSwimlaneId,
        position: 'after',
      });
      onSwimlaneDropIndicatorClear();
    },
  });

  drop(ref);

  return (
    <div
      ref={ref}
      className="timeline-swimlane-end-drop-zone"
      style={{ width }}
      aria-hidden="true"
    />
  );
}

interface TimelineViewProps {
  tasks: Task[];
  swimlanes: TimelineSwimlane[];
  people?: Person[];
  statusColumns?: StatusColumn[];
  customScrollbarsEnabled?: boolean;
  initialScrollLeft?: number;
  initialLayoutState?: TimelineLayoutState;
  onLayoutStateChange?: (layout: TimelineLayoutState) => void;
  onTaskClick: (task: Task) => void;
  onTaskEdit: (task: Task) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskDuplicate: (task: Task) => void;
  onAddTask: (date: Date, swimlaneId: string, endDate?: Date, mode?: 'projects' | 'people') => void;
  onUpdateTaskDates: (taskId: string, startDate: string, endDate: string) => void;
  onEditSwimlane: (swimlane: TimelineSwimlane) => void;
  onAddSwimlane: () => void;
  onReorderSwimlanes: (swimlanes: TimelineSwimlane[]) => void;
  onReorderPeople?: (people: Person[]) => void;
  onReorderTasks: (tasks: Task[]) => void;
  onTimelineScroll?: (state: { scrollLeft: number; scrollTop: number }) => void;
}

export function TimelineView({
  tasks,
  swimlanes,
  people = [],
  statusColumns,
  customScrollbarsEnabled = true,
  initialScrollLeft,
  initialLayoutState,
  onLayoutStateChange,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  onTaskDuplicate,
  onAddTask,
  onUpdateTaskDates,
  onEditSwimlane,
  onAddSwimlane,
  onReorderSwimlanes,
  onReorderPeople,
  onReorderTasks,
  onTimelineScroll,
}: TimelineViewProps) {
  // Left column width state
  const [leftColWidth, setLeftColWidth] = useState<number>(() => {
    return initialLayoutState?.leftColWidth ?? DEFAULT_LEFT_COL_WIDTH;
  });
  const [isResizingLeft, setIsResizingLeft] = useState<boolean>(false);
  const leftResizeRef = useRef<{ startX: number; startWidth: number; pendingWidth?: number } | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const monthResizeRef = useRef<{ monthKey: string; startX: number; startWidth: number } | null>(null);

  // Mode state: Projects or People
  const [mode, setMode] = useState<'projects' | 'people'>('projects');

  // Weekend visibility toggle
  const [showWeekends, setShowWeekends] = useState<boolean>(true);
  const showCompleted = initialLayoutState?.showCompleted ?? false;
  const timelineTasks = useMemo(
    () => filterTimelineTasks(tasks, statusColumns, showCompleted),
    [showCompleted, statusColumns, tasks]
  );
  const [horizontalMetrics, setHorizontalMetrics] = useState<{ scrollLeft: number; viewportWidth: number }>({
    scrollLeft: 0,
    viewportWidth: 0,
  });
  const horizontalMetricsRef = useRef(horizontalMetrics);

  useEffect(() => {
    horizontalMetricsRef.current = horizontalMetrics;
  }, [horizontalMetrics]);
  const [swimlaneDropIndicator, setSwimlaneDropIndicator] = useState<SwimlaneRowDropIndicator | null>(null);
  const [draggingSwimlaneId, setDraggingSwimlaneId] = useState<string | null>(null);
  const visibleSwimlaneDropIndicator = draggingSwimlaneId ? swimlaneDropIndicator : null;
  
  // Display swimlanes based on mode
  const displaySwimlanes = useMemo<TimelineSwimlane[]>(() => {
    if (mode === 'people') {
      return people.map(person => ({
        id: person.id,
        name: person.name,
        subtitle: `${person.role} • ${person.kind === 'agentic' ? 'Agentic' : 'Human'}`,
        color: person.color || '#3b82f6', // Default blue if no color
      }));
    }
    return swimlanes;
  }, [mode, people, swimlanes]);
  const timelineTasksBySwimlane = useMemo(() => {
    const tasksBySwimlane = new Map<string, Task[]>();
    timelineTasks.forEach(task => {
      const swimlaneId = mode === 'people' ? task.assigneeId : task.swimlaneId;
      if (!swimlaneId) return;
      const laneTasks = tasksBySwimlane.get(swimlaneId);
      if (laneTasks) laneTasks.push(task);
      else tasksBySwimlane.set(swimlaneId, [task]);
    });
    return tasksBySwimlane;
  }, [mode, timelineTasks]);
  const visibleTaskCount = useMemo(
    () => displaySwimlanes.reduce((count, swimlane) => count + (timelineTasksBySwimlane.get(swimlane.id)?.length ?? 0), 0),
    [displaySwimlanes, timelineTasksBySwimlane]
  );
  const lastDisplaySwimlaneId = displaySwimlanes[displaySwimlanes.length - 1]?.id;

  // Refs
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const rowsContainerRef = useRef<HTMLDivElement>(null);
  const leftListRef = useRef<HTMLDivElement>(null);
  const leftListContentRef = useRef<HTMLDivElement>(null);
  const fixedBtnRef = useRef<HTMLDivElement>(null);
  const hasInitializedScrollRef = useRef<boolean>(false);
  const scrollNotifyRafRef = useRef<number | null>(null);
  const windowExtensionPendingRef = useRef(false);
  const lastHorizontalScrollLeftRef = useRef<number | null>(null);
  const resizeUpdateRafRef = useRef<number | null>(null);
  const pendingResizePreviewRef = useRef<{ taskId: string; left: number; width: number } | null>(null);
  const pendingRevealDateRef = useRef<string | null>(null);
  const isHeaderScrubbingRef = useRef<boolean>(false);
  const scrubStartXRef = useRef<number>(0);
  const scrubStartScrollLeftRef = useRef<number>(0);
  const startupScrollTimersRef = useRef<number[]>([]);
  const startupScrollRafRef = useRef<number | null>(null);
  const [isHeaderScrubbing, setIsHeaderScrubbing] = useState(false);
  const [needsStartupTodayScroll, setNeedsStartupTodayScroll] = useState(false);

  // State for task resizing
  const [resizingTask, setResizingTask] = useState<{
    taskId: string;
    edge: 'start' | 'end';
    initialX: number;
    initialStartDate: string;
    initialEndDate: string;
  } | null>(null);
  const [taskResizePreview, setTaskResizePreview] = useState<{
    taskId: string;
    left: number;
    width: number;
  } | null>(null);

  // Ref for synchronously suppressing slot-add interactions around resize pointer cycles.
  const ignoreAddTaskUntilRef = useRef<number>(0);

  // The date window exists independently from the current task set. Rendering still
  // virtualizes a slice of it below; later extensions only update this single state.
  const [timelineWindow, setTimelineWindow] = useState(() => createInitialTimelineWindow(timelineTasks));
  const allDates = useMemo(
    () => getTimelineWindowDates(timelineWindow, showWeekends),
    [timelineWindow, showWeekends]
  );

  // Group dates by month
  const allDatesByMonth = useMemo(() => {
    const m: Record<string, Date[]> = {};
    allDates.forEach(date => {
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!m[monthKey]) m[monthKey] = [];
      m[monthKey].push(date);
    });
    return m;
  }, [allDates]);

  const orderedMonthKeys = useMemo(() => (
    Object.keys(allDatesByMonth).sort((a, b) => {
      const ta = allDatesByMonth[a]?.[0]?.getTime() ?? 0;
      const tb = allDatesByMonth[b]?.[0]?.getTime() ?? 0;
      return ta - tb;
    })
  ), [allDatesByMonth]);

  // Initialize month widths
  const [monthWidths, setMonthWidths] = useState<Record<string, number>>(() => {
    const defaults: Record<string, number> = {};
    Object.entries(allDatesByMonth).forEach(([k, monthDates]) => {
      defaults[k] = monthDates.length * DEFAULT_DAY_WIDTH;
    });
    return initialLayoutState?.monthWidths ? { ...defaults, ...initialLayoutState.monthWidths } : defaults;
  });

  // Derive day widths
  const [allDayWidths, setAllDayWidths] = useState<number[]>(() => {
    const arr: number[] = [];
    Object.entries(allDatesByMonth).forEach(([k, monthDates]) => {
      const perDay = monthWidths[k] ? monthWidths[k] / monthDates.length : DEFAULT_DAY_WIDTH;
      monthDates.forEach(() => arr.push(perDay));
    });
    return arr;
  });

  // Update dayWidths when monthWidths changes
  useEffect(() => {
    setMonthWidths(prev => {
      const next = { ...prev };
      let changed = false;
      Object.entries(allDatesByMonth).forEach(([k, monthDates]) => {
        if (!next[k]) {
          next[k] = monthDates.length * DEFAULT_DAY_WIDTH;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [allDatesByMonth]);

  useEffect(() => {
    const nextLayoutState = {
      leftColWidth,
      monthWidths,
      showCompleted,
    };
    persistTimelineLayoutState(nextLayoutState);
    onLayoutStateChange?.(nextLayoutState);
  }, [leftColWidth, monthWidths, onLayoutStateChange, showCompleted]);

  useEffect(() => {
    const arr: number[] = [];
    Object.entries(allDatesByMonth).forEach(([k, monthDates]) => {
      const perDay = monthWidths[k] ? monthWidths[k] / monthDates.length : DEFAULT_DAY_WIDTH;
      monthDates.forEach(() => arr.push(perDay));
    });
    setAllDayWidths(arr);
  }, [monthWidths, allDatesByMonth]);

  const monthMeta = useMemo(() => {
    const entries = orderedMonthKeys.map(monthKey => ({
      monthKey,
      width: monthWidths[monthKey] ?? (allDatesByMonth[monthKey]?.length || 0) * DEFAULT_DAY_WIDTH,
      dayCount: allDatesByMonth[monthKey]?.length || 0,
    }));

    let runningPx = 0;
    let runningDayIndex = 0;
    return entries.map(entry => {
      const meta = {
        ...entry,
        startPx: runningPx,
        endPx: runningPx + entry.width,
        startDayIndex: runningDayIndex,
      };
      runningPx += entry.width;
      runningDayIndex += entry.dayCount;
      return meta;
    });
  }, [orderedMonthKeys, monthWidths, allDatesByMonth]);

  const visibleMonthKeys = useMemo(() => {
    if (monthMeta.length === 0) return orderedMonthKeys;
    const viewportWidth = horizontalMetrics.viewportWidth || 0;
    const left = Math.max(0, horizontalMetrics.scrollLeft - HORIZONTAL_RENDER_BUFFER_PX);
    const right = horizontalMetrics.scrollLeft + viewportWidth + HORIZONTAL_RENDER_BUFFER_PX;
    const keys = monthMeta
      .filter(m => m.endPx >= left && m.startPx <= right)
      .map(m => m.monthKey);
    return keys.length > 0 ? keys : orderedMonthKeys;
  }, [monthMeta, horizontalMetrics, orderedMonthKeys]);

  const datesByMonth = useMemo(() => {
    const subset: Record<string, Date[]> = {};
    visibleMonthKeys.forEach(monthKey => {
      subset[monthKey] = allDatesByMonth[monthKey] || [];
    });
    return subset;
  }, [visibleMonthKeys, allDatesByMonth]);

  const monthStartIndices = useMemo(() => {
    const map: Record<string, number> = {};
    monthMeta.forEach(m => {
      map[m.monthKey] = m.startDayIndex;
    });
    return map;
  }, [monthMeta]);

  const leadingSpacerWidth = useMemo(() => {
    if (visibleMonthKeys.length === 0 || monthMeta.length === 0) return 0;
    const firstKey = visibleMonthKeys[0];
    const first = monthMeta.find(m => m.monthKey === firstKey);
    return first?.startPx ?? 0;
  }, [visibleMonthKeys, monthMeta]);

  const trailingSpacerWidth = useMemo(() => {
    if (visibleMonthKeys.length === 0 || monthMeta.length === 0) return 0;
    const lastKey = visibleMonthKeys[visibleMonthKeys.length - 1];
    const last = monthMeta.find(m => m.monthKey === lastKey);
    const totalWidth = monthMeta[monthMeta.length - 1].endPx;
    return Math.max(0, totalWidth - (last?.endPx ?? totalWidth));
  }, [visibleMonthKeys, monthMeta]);

  const dates = allDates;
  const dayWidths = allDayWidths;

  // Compute dynamic heights for swimlanes
  const swimlaneHeights = useMemo(() => {
    const heights: Record<string, number> = {};
    displaySwimlanes.forEach(swimlane => {
      const swimlaneTasks = timelineTasksBySwimlane.get(swimlane.id) ?? [];
      // Each track is 40px (task render height 32px + gap 8px), with at least DEFAULT_ROW_HEIGHT
      const TRACK_HEIGHT = 40;
      const trackAssignments = allocateTasksToTracks(swimlaneTasks);
      const trackCount = swimlaneTasks.length > 0 ? Math.max(...Object.values(trackAssignments)) + 1 : 1;
      heights[swimlane.id] = Math.max(DEFAULT_ROW_HEIGHT, trackCount * TRACK_HEIGHT);
    });
    return heights;
  }, [displaySwimlanes, timelineTasksBySwimlane]);

  const draggedSwimlaneHeight = draggingSwimlaneId
    ? swimlaneHeights[draggingSwimlaneId] || DEFAULT_ROW_HEIGHT
    : DEFAULT_ROW_HEIGHT;

  // Sync left column header height with timeline header actual height
  const [syncedHeaderHeight, setSyncedHeaderHeight] = useState<number | null>(null);
  
  useLayoutEffect(() => {
    const leftHeaderEl = document.querySelector('.timeline-left-header') as HTMLElement | null;
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
    // In 5-day mode, weekend "today" may be filtered out; use nearest visible day.
    return findNearestVisibleDateIndex(allDates, today);
  }, [allDates, today]);

  const todayMarker = useMemo(
    () => getVariableDaySurfaceMarker(dayWidths, todayIndex, DEFAULT_DAY_WIDTH),
    [dayWidths, todayIndex]
  );

  const todayCenterOffset = todayMarker?.center ?? null;

  // Calculate total timeline width
  const totalTimelineWidth = useMemo(() => {
    return dayWidths.reduce((a, b) => a + b, 0);
  }, [dayWidths]);

  const endPadding = 24;

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

  const queueTaskResizePreview = useCallback((preview: { taskId: string; left: number; width: number }) => {
    pendingResizePreviewRef.current = preview;
    if (resizeUpdateRafRef.current == null) {
      resizeUpdateRafRef.current = requestAnimationFrame(() => {
        const pending = pendingResizePreviewRef.current;
        if (pending) {
          setTaskResizePreview(pending);
        }
        pendingResizePreviewRef.current = null;
        resizeUpdateRafRef.current = null;
      });
    }
  }, []);

  const suppressAddTaskInteractions = useCallback((durationMs = 300) => {
    ignoreAddTaskUntilRef.current = Date.now() + durationMs;
  }, []);

  const shouldIgnoreAddTask = useCallback(() => Date.now() < ignoreAddTaskUntilRef.current, []);

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
      newWidth = Math.max(MIN_LEFT_COL_WIDTH, Math.min(MAX_LEFT_COL_WIDTH, newWidth));
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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!monthResizeRef.current) return;
      const { monthKey, startX, startWidth } = monthResizeRef.current;
      const delta = e.clientX - startX;
      const newWidth = Math.max(120, startWidth + delta);
      setMonthWidths(prev => ({ ...prev, [monthKey]: newWidth }));
    };

    const handleMouseUp = () => {
      monthResizeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Handle task resize with fluid preview and snap-on-release commit.
  useEffect(() => {
    if (!resizingTask) return;

    const buildResizeGeometry = (clientX: number) => {
      const task = tasks.find(t => t.id === resizingTask.taskId);
      if (!task) return;

      const parsedStart = parseISODateLocal(resizingTask.initialStartDate || task.startDate);
      if (!parsedStart) return;
      const startDate = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), parsedStart.getDate());
      const parsedEnd = parseISODateLocal(resizingTask.initialEndDate || task.endDate);
      const endDate = parsedEnd
        ? new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), parsedEnd.getDate())
        : startDate;
      const startIdx = getVisibleIndexForDate(startDate, 'start');
      const endIdx = getVisibleIndexForDate(endDate, 'end');

      if (startIdx < 0) return;

      const prefix: number[] = [0];
      for (let i = 0; i < dayWidths.length; i++) prefix.push(prefix[i] + (dayWidths[i] ?? DEFAULT_DAY_WIDTH));

      // Use rowsContainerRef for accurate scroll position (not headerRef)
      const scrollEl = rowsContainerRef.current;
      if (!scrollEl) return;

      const rect = scrollEl.getBoundingClientRect();
      const scrollLeft = scrollEl.scrollLeft;
      const localX = clientX - rect.left + scrollLeft;
      const originalLeft = prefix[startIdx];
      const originalRight = prefix[Math.min(endIdx + 1, prefix.length - 1)];
      const minWidth = 8;

      const previewLeft = resizingTask.edge === 'start'
        ? Math.max(prefix[0], Math.min(localX, originalRight - minWidth))
        : originalLeft;
      const previewRight = resizingTask.edge === 'end'
        ? Math.min(prefix[prefix.length - 1], Math.max(localX, originalLeft + minWidth))
        : originalRight;

      let boundaryIndex = 0;
      if (localX >= prefix[prefix.length - 1]) {
        boundaryIndex = dates.length;
      } else {
        for (let i = 0; i < prefix.length - 1; i++) {
          if (localX >= prefix[i] && localX < prefix[i + 1]) {
            const cellMiddle = prefix[i] + ((dayWidths[i] ?? DEFAULT_DAY_WIDTH) / 2);
            boundaryIndex = localX < cellMiddle ? i : i + 1;
            break;
          }
        }
      }

      return {
        task,
        startIdx,
        endIdx,
        boundaryIndex,
        preview: {
          taskId: task.id,
          left: previewLeft,
          width: Math.max(minWidth, previewRight - previewLeft),
        },
      };
    };

    const finishResize = (clientX: number) => {
      const geometry = buildResizeGeometry(clientX);

      if (resizeUpdateRafRef.current != null) {
        cancelAnimationFrame(resizeUpdateRafRef.current);
        resizeUpdateRafRef.current = null;
      }

      if (geometry) {
        const { task, startIdx, endIdx, boundaryIndex } = geometry;
        if (resizingTask.edge === 'start') {
          const newIdx = Math.max(0, Math.min(endIdx, boundaryIndex));
          const newISO = toLocalISODate(new Date(dates[newIdx]));
          if (newISO !== task.startDate) {
            onUpdateTaskDates(task.id, newISO, task.endDate || '');
          }
        } else {
          const newIdx = Math.max(startIdx, Math.min(dates.length - 1, boundaryIndex - 1));
          const newISO = toLocalISODate(new Date(dates[newIdx]));
          if (newISO !== task.endDate) {
            onUpdateTaskDates(task.id, task.startDate || '', newISO);
          }
        }
      }

      pendingResizePreviewRef.current = null;
      setTaskResizePreview(null);
      setResizingTask(null);
      suppressAddTaskInteractions();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isPointerReleased(e.buttons)) {
        finishResize(e.clientX);
        return;
      }

      const geometry = buildResizeGeometry(e.clientX);
      if (!geometry) return;
      queueTaskResizePreview(geometry.preview);
      e.preventDefault();
    };

    const handleMouseUp = (e: MouseEvent) => {
      finishResize(e.clientX);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingTask, tasks, dates, dayWidths, onUpdateTaskDates, getVisibleIndexForDate, queueTaskResizePreview, suppressAddTaskInteractions]);

  // Scroll to today
  const scrollToToday = useCallback((opts?: { smooth?: boolean }) => {
    if (!rowsContainerRef.current) return 0;

    let targetLeft = todayCenterOffset === null
      ? null
      : getCenteredScrollLeftForMarker(todayCenterOffset, rowsContainerRef.current.clientWidth);

    if (targetLeft === null) {
      const fallbackMarker = getVariableDaySurfaceMarker(
        dayWidths,
        findNearestVisibleDateIndex(allDates, new Date()),
        DEFAULT_DAY_WIDTH
      );
      if (fallbackMarker) {
        targetLeft = getCenteredScrollLeftForMarker(fallbackMarker.center, rowsContainerRef.current.clientWidth);
      }
    }

    if (targetLeft === null) {
      // Default to scrolling to middle of content
      targetLeft = Math.max(0, (totalTimelineWidth - rowsContainerRef.current.clientWidth) / 2);
    }

    const maxScrollLeft = Math.max(0, totalTimelineWidth - rowsContainerRef.current.clientWidth);
    targetLeft = Math.max(0, Math.min(targetLeft, maxScrollLeft));

    // Use deterministic jump to avoid smooth-scroll drift while virtualization window updates.
    rowsContainerRef.current.scrollLeft = targetLeft;
    setHorizontalMetrics({
      scrollLeft: targetLeft,
      viewportWidth: rowsContainerRef.current.clientWidth,
    });
    return targetLeft;
  }, [todayCenterOffset, allDates, dayWidths, totalTimelineWidth]);

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

  // Decide initial horizontal position only once per mount.
  useEffect(() => {
    if (hasInitializedScrollRef.current) return;
    hasInitializedScrollRef.current = true;

    // Restore saved view position only when it's meaningful; otherwise lock startup to today.
    if (
      typeof initialScrollLeft === 'number' &&
      initialScrollLeft > 0 &&
      rowsContainerRef.current
    ) {
      rowsContainerRef.current.scrollLeft = initialScrollLeft;
      setHorizontalMetrics({
        scrollLeft: initialScrollLeft,
        viewportWidth: rowsContainerRef.current.clientWidth,
      });
      setNeedsStartupTodayScroll(false);
    } else {
      setNeedsStartupTodayScroll(true);
    }

    return () => {
      if (startupScrollRafRef.current != null) {
        cancelAnimationFrame(startupScrollRafRef.current);
        startupScrollRafRef.current = null;
      }
      startupScrollTimersRef.current.forEach(id => clearTimeout(id));
      startupScrollTimersRef.current = [];
    };
  }, [initialScrollLeft]);

  // Cold-start guard: keep nudging to Today until the timeline width/virtual window stabilizes.
  useEffect(() => {
    if (!needsStartupTodayScroll) return;

    let cancelled = false;
    let attempts = 0;
    let stableHits = 0;
    const MAX_ATTEMPTS = 40; // ~4s with 100ms cadence

    const applyTodayUntilStable = () => {
      if (cancelled || !rowsContainerRef.current) return;

      attempts += 1;
      const target = scrollToToday({ smooth: false });
      const actual = rowsContainerRef.current.scrollLeft;
      const widthSettled = rowsContainerRef.current.scrollWidth > rowsContainerRef.current.clientWidth;
      const aligned = Math.abs(actual - target) <= 1;
      const canFinishAtZero = target <= 1 || !widthSettled;

      if (aligned && (canFinishAtZero || actual > 1)) {
        stableHits += 1;
      } else {
        stableHits = 0;
      }

      if (stableHits >= 2 || attempts >= MAX_ATTEMPTS) {
        setNeedsStartupTodayScroll(false);
        return;
      }

      const id = window.setTimeout(applyTodayUntilStable, 100);
      startupScrollTimersRef.current.push(id);
    };

    startupScrollRafRef.current = requestAnimationFrame(() => {
      applyTodayUntilStable();
    });

    return () => {
      cancelled = true;
      if (startupScrollRafRef.current != null) {
        cancelAnimationFrame(startupScrollRafRef.current);
        startupScrollRafRef.current = null;
      }
      startupScrollTimersRef.current.forEach(id => clearTimeout(id));
      startupScrollTimersRef.current = [];
    };
  }, [needsStartupTodayScroll, scrollToToday, totalTimelineWidth, dayWidths.length, allDates.length]);

  // Day-header hand scrubbing (click-drag to pan timeline horizontally)
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isHeaderScrubbingRef.current || !rowsContainerRef.current) return;
      if (e.buttons === 0) {
        isHeaderScrubbingRef.current = false;
        setIsHeaderScrubbing(false);
        return;
      }
      const dx = e.clientX - scrubStartXRef.current;
      rowsContainerRef.current.scrollLeft = scrubStartScrollLeftRef.current - dx;
      setHorizontalMetrics({
        scrollLeft: rowsContainerRef.current.scrollLeft,
        viewportWidth: rowsContainerRef.current.clientWidth,
      });
      e.preventDefault();
    };

    const handleUp = () => {
      if (!isHeaderScrubbingRef.current) return;
      isHeaderScrubbingRef.current = false;
      setIsHeaderScrubbing(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    window.addEventListener('blur', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      window.removeEventListener('blur', handleUp);
    };
  }, []);

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

  const handleSwimlaneDrop = useCallback((draggedId: string, fallbackIndicator: SwimlaneRowDropIndicator) => {
    const ids = displaySwimlanes.map(swimlane => swimlane.id);
    const dragIndex = ids.indexOf(draggedId);
    const toIndex = resolveReorderDropIndex(ids, draggedId, fallbackIndicator);

    if (dragIndex < 0 || toIndex === null) {
      setDraggingSwimlaneId(null);
      setSwimlaneDropIndicator(null);
      return;
    }

    if (dragIndex !== toIndex) {
      handleMoveSwimlane(dragIndex, toIndex);
    }
    setDraggingSwimlaneId(null);
    setSwimlaneDropIndicator(null);
  }, [displaySwimlanes, handleMoveSwimlane]);

  // Keep the timeline grid as the single vertical scroller. Wheel events over
  // the fixed Projects column proxy into it so the two panes cannot fight.
  useEffect(() => {
    const leftList = leftListRef.current;
    if (!leftList) return;

    const handleLeftWheel = (event: WheelEvent) => {
      const rowsContainer = rowsContainerRef.current;
      if (!rowsContainer) return;
      rowsContainer.scrollTop += event.deltaY;
      if (event.deltaX) rowsContainer.scrollLeft += event.deltaX;
    };

    leftList.addEventListener('wheel', handleLeftWheel, { passive: true });
    return () => leftList.removeEventListener('wheel', handleLeftWheel);
  }, []);

  const handleRowsVerticalScroll = useCallback(() => {
    if (scrollNotifyRafRef.current == null) {
      scrollNotifyRafRef.current = requestAnimationFrame(() => {
        const rowsContainer = rowsContainerRef.current;
        const leftListContent = leftListContentRef.current;
        if (rowsContainer && leftListContent) {
          // Keep the fixed-pane write in one frame. Horizontal geometry is
          // independent from vertical scrolling, so avoid forcing layout on
          // every vertical wheel frame just to re-check it.
          const scrollTop = rowsContainer.scrollTop;
          const scrollLeft = rowsContainer.scrollLeft;
          // The left pane is intentionally not a second scroll container. Move
          // its labels on the compositor instead of writing scrollTop, which
          // can trigger a second layout/scroll update during wheel dispatch.
          leftListContent.style.transform = `translate3d(0, -${scrollTop}px, 0)`;

          if (lastHorizontalScrollLeftRef.current !== scrollLeft) {
            lastHorizontalScrollLeftRef.current = scrollLeft;
            const scrollWidth = rowsContainer.scrollWidth;
            const clientWidth = rowsContainer.clientWidth;

            if (!windowExtensionPendingRef.current) {
              const remainingRight = scrollWidth - clientWidth - scrollLeft;
              const direction = scrollLeft <= WINDOW_EXTENSION_BUFFER_PX
                ? 'past'
                : remainingRight <= WINDOW_EXTENSION_BUFFER_PX
                  ? 'future'
                  : null;

              if (direction) {
                windowExtensionPendingRef.current = true;
                if (direction === 'past') {
                  rowsContainer.scrollLeft += getTimelineWindowScrollCompensation(
                    timelineWindow,
                    direction,
                    showWeekends,
                    DEFAULT_DAY_WIDTH
                  );
                }
                setTimelineWindow(window => extendTimelineWindow(window, direction));
              }
            }

            const nextMetrics = {
              scrollLeft: rowsContainer.scrollLeft,
              viewportWidth: clientWidth,
            };
            const publishedMetrics = horizontalMetricsRef.current;
            const shouldPublishMetrics = nextMetrics.viewportWidth !== publishedMetrics.viewportWidth
              || Math.abs(nextMetrics.scrollLeft - publishedMetrics.scrollLeft) >= HORIZONTAL_METRICS_STEP_PX;
            if (shouldPublishMetrics) {
              horizontalMetricsRef.current = nextMetrics;
              setHorizontalMetrics(nextMetrics);
            }
          }
          onTimelineScroll?.({
            scrollLeft,
            scrollTop,
          });
        }
        scrollNotifyRafRef.current = null;
      });
    }
  }, [onTimelineScroll, showWeekends, timelineWindow]);

  useEffect(() => {
    windowExtensionPendingRef.current = false;
  }, [timelineWindow]);

  // Attach vertical scroll listener
  useEffect(() => {
    const rowsEl = rowsContainerRef.current;
    if (!rowsEl) return;

    rowsEl.addEventListener('scroll', handleRowsVerticalScroll);
    return () => {
      if (scrollNotifyRafRef.current != null) {
        cancelAnimationFrame(scrollNotifyRafRef.current);
        scrollNotifyRafRef.current = null;
      }
      rowsEl.removeEventListener('scroll', handleRowsVerticalScroll);
    };
  }, [handleRowsVerticalScroll]);

  useEffect(() => {
    if (!rowsContainerRef.current) return;
    setHorizontalMetrics({
      scrollLeft: rowsContainerRef.current.scrollLeft,
      viewportWidth: rowsContainerRef.current.clientWidth,
    });
  }, [dayWidths.length, leftColWidth, showWeekends]);

  useEffect(() => {
    const pendingISO = pendingRevealDateRef.current;
    if (!pendingISO || !rowsContainerRef.current || dates.length === 0 || dayWidths.length === 0) return;

    const revealDate = parseISODateLocal(pendingISO);
    if (!revealDate || isNaN(revealDate.getTime())) {
      pendingRevealDateRef.current = null;
      return;
    }

    const idx = getVisibleIndexForDate(revealDate, 'start');
    if (idx < 0) return;

    const marker = getVariableDaySurfaceMarker(dayWidths, idx, DEFAULT_DAY_WIDTH);
    if (!marker) return;

    const left = marker.left;
    const target = Math.max(0, left - rowsContainerRef.current.clientWidth * 0.25);
    try {
      rowsContainerRef.current.scrollTo({ left: target, behavior: 'smooth' });
    } catch {
      rowsContainerRef.current.scrollLeft = target;
    }

    pendingRevealDateRef.current = null;
  }, [dates, dayWidths, getVisibleIndexForDate]);

  const getTaskColor = useCallback(
    (status: string): { className?: string; style?: React.CSSProperties; textClass?: string; bulletOutlineColor?: string } => {
      if (statusColumns?.some(column => column.id === status)) {
        const visual = getStatusVisual(statusColumns, status as TaskStatus);
        return {
          className: visual.backgroundClassName,
          style: visual.backgroundStyle,
          textClass: visual.textClassName,
          bulletOutlineColor: getReadableOutlineColorFor(visual.color),
        };
      }

      const defaultColor = '#e5e7eb';
      return {
        textClass: 'text-black',
        style: { backgroundColor: defaultColor },
        bulletOutlineColor: getReadableOutlineColorFor(defaultColor),
      };
    },
    [statusColumns]
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <div ref={timelineContainerRef} className="timeline-container">
        <TimelineToolbar
          mode={mode}
          showWeekends={showWeekends}
          onModeChange={setMode}
          onShowWeekendsChange={setShowWeekends}
          onScrollLeft={handleScrollLeft}
          onScrollRight={handleScrollRight}
          onScrollToToday={() => scrollToToday({ smooth: false })}
        />

        {/* Main content */}
        {displaySwimlanes.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 py-10">
            <div className="w-full max-w-3xl">
              <EmptyStateCard
                icon={mode === 'people' ? <UsersIcon className="size-5" /> : <CalendarDays className="size-5" />}
                title={mode === 'people' ? 'No people on the timeline yet' : 'No timeline projects yet'}
                description={mode === 'people'
                  ? 'Add people in Settings to plan work by assignee, then switch back here to schedule and review capacity.'
                  : 'Create a project lane to start planning work on the timeline. Tasks placed into a project will show up here automatically.'}
                action={mode === 'projects' ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" onClick={onAddSwimlane} className="timeline-left-header-button h-auto px-4 py-2">
                        <PlusIcon className="size-4" />
                        <span>Add first project</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Add first project</TooltipContent>
                  </Tooltip>
                ) : undefined}
              />
            </div>
          </div>
        ) : (
        <>
        <div className="timeline-main-content">
          {/* Left column: swimlane labels */}
          <div className="timeline-left-column" style={{ width: `${leftColWidth}px` }}>
            {/* Combined header matching month + day header height */}
            <div className="timeline-left-header">
              <span className="timeline-left-header-title">
                {mode === 'people' ? 'People' : 'Projects'}
              </span>
              {mode === 'projects' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={onAddSwimlane} className="timeline-left-header-button" aria-label="Add project">
                      <PlusIcon className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Add project</TooltipContent>
                </Tooltip>
              )}
              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={handleLeftResizeStart}
                className="timeline-left-resize-handle"
              />
            </div>

            <div className="timeline-left-list" ref={leftListRef}>
              <div ref={leftListContentRef} className="timeline-left-list-content">
              {displaySwimlanes.map((swimlane, index) => {
                const height = swimlaneHeights[swimlane.id] || DEFAULT_ROW_HEIGHT;
                const isDraggedRowCollapsed = Boolean(
                  visibleSwimlaneDropIndicator && draggingSwimlaneId === swimlane.id
                );
                const taskCount = timelineTasksBySwimlane.get(swimlane.id)?.length ?? 0;
                
                return (
                  <React.Fragment key={swimlane.id}>
                    {visibleSwimlaneDropIndicator?.targetId === swimlane.id && visibleSwimlaneDropIndicator.position === 'before' && (
                      <TimelineSwimlaneInsertionMarker
                        height={draggedSwimlaneHeight}
                        width={`${leftColWidth}px`}
                        indicator={visibleSwimlaneDropIndicator}
                        onSwimlaneDrop={handleSwimlaneDrop}
                        onSwimlaneDropIndicatorClear={() => setSwimlaneDropIndicator(null)}
                      />
                    )}
                    <div
                      className="timeline-swimlane-label-container"
                      style={{
                        height: isDraggedRowCollapsed ? '0px' : `${height}px`,
                        minHeight: isDraggedRowCollapsed ? '0px' : `${height}px`,
                        overflow: isDraggedRowCollapsed ? 'hidden' : undefined,
                      }}
                    >
                      <DraggableSwimlaneLabel
                        swimlane={swimlane}
                        index={index}
                        leftColWidth={leftColWidth}
                        rowHeight={height}
                        onEditSwimlane={mode === 'projects' ? onEditSwimlane : () => {}}
                        onSwimlaneDropIndicatorChange={setSwimlaneDropIndicator}
                        onSwimlaneDropIndicatorClear={() => setSwimlaneDropIndicator(null)}
                        onSwimlaneDrop={handleSwimlaneDrop}
                        onSwimlaneDragStart={setDraggingSwimlaneId}
                        onSwimlaneDragEnd={() => setDraggingSwimlaneId(null)}
                        mode={mode}
                        personKind={mode === 'people' ? people.find(person => person.id === swimlane.id)?.kind : undefined}
                        taskCount={taskCount}
                      />
                    </div>
                    {visibleSwimlaneDropIndicator?.targetId === swimlane.id && visibleSwimlaneDropIndicator.position === 'after' && (
                      <TimelineSwimlaneInsertionMarker
                        height={draggedSwimlaneHeight}
                        width={`${leftColWidth}px`}
                        indicator={visibleSwimlaneDropIndicator}
                        onSwimlaneDrop={handleSwimlaneDrop}
                        onSwimlaneDropIndicatorClear={() => setSwimlaneDropIndicator(null)}
                      />
                    )}
                  </React.Fragment>
                );
              })}
              <TimelineSwimlaneEndDropZone
                width={`${leftColWidth}px`}
                lastSwimlaneId={lastDisplaySwimlaneId}
                onSwimlaneDrop={handleSwimlaneDrop}
                onSwimlaneDropIndicatorChange={setSwimlaneDropIndicator}
                onSwimlaneDropIndicatorClear={() => setSwimlaneDropIndicator(null)}
              />
              </div>
            </div>
          </div>

          {/* Right column: timeline */}
          <div ref={rowsContainerRef} className={`timeline-right-column ${customScrollbarsEnabled ? 'timeline-native-horizontal-scrollbar-hidden' : ''}`}>
            <div className="timeline-grid-container" style={{ minWidth: `${totalTimelineWidth + endPadding}px` }}>
              {/* Header: months and days - sticky at top */}
              <div
                className={`timeline-header-container ${isHeaderScrubbing ? 'scrubbing' : ''}`}
                style={{ height: 'fit-content', minHeight: `${HEADER_HEIGHT}px`, overflow: 'visible' }}
                onMouseDown={(e) => {
                  if (e.button !== 0 || !rowsContainerRef.current) return;
                  const target = e.target as HTMLElement;
                  const scrubZone = target.closest('.timeline-day-scrub-handle');
                  const blockedTarget = target.closest('button, a, input, textarea, select, [role="separator"]');
                  if (!scrubZone || blockedTarget) return;

                  isHeaderScrubbingRef.current = true;
                  setIsHeaderScrubbing(true);
                  scrubStartXRef.current = e.clientX;
                  scrubStartScrollLeftRef.current = rowsContainerRef.current.scrollLeft;
                  e.preventDefault();
                }}
              >
              <TimelineHeader
                datesByMonth={datesByMonth}
                monthKeys={visibleMonthKeys}
                monthStartIndices={monthStartIndices}
                monthWidths={monthWidths}
                dayWidths={dayWidths}
                defaultDayWidth={DEFAULT_DAY_WIDTH}
                totalTimelineWidth={totalTimelineWidth}
                endPadding={endPadding}
                leadingSpacerWidth={leadingSpacerWidth}
                trailingSpacerWidth={trailingSpacerWidth}
                rowHeight={DEFAULT_ROW_HEIGHT}
                swimlaneCount={displaySwimlanes.length}
                highlightToday={true}
                headerRef={headerRef}
                onMonthResizeStart={(monthKey, e) => {
                  e.preventDefault();
                  monthResizeRef.current = {
                    monthKey,
                    startX: e.clientX,
                    startWidth: monthWidths[monthKey] || DEFAULT_DAY_WIDTH,
                  };
                }}
                onMonthReset={(monthKey) => {
                  const monthDates = datesByMonth[monthKey] || [];
                  setMonthWidths(prev => ({
                    ...prev,
                    [monthKey]: monthDates.length * DEFAULT_DAY_WIDTH,
                  }));
                }}
              />
            </div>

            {todayCenterOffset !== null && (
              <div
                className="timeline-today-lane-indicator"
                style={{ left: `${todayCenterOffset}px` }}
                aria-hidden="true"
              />
            )}

            {/* Swimlane rows: keep them interactive even when there are no tasks yet */}
            {visibleTaskCount === 0 && (
              <div
                className="pointer-events-none absolute inset-x-6 z-20 flex justify-center"
                style={{ top: 'calc(var(--timeline-header-height) + 1rem)' }}
              >
                <div className="w-full max-w-2xl">
                  <EmptyStateCard
                    icon={<CalendarDays className="size-5" />}
                    title="No scheduled timeline work yet"
                    description={mode === 'people'
                      ? 'Drag across a row to schedule work for these people.'
                      : 'Drag across a project row to create the first dated task on the timeline.'}
                  />
                </div>
              </div>
            )}
            <div className="timeline-rows-container">
              {displaySwimlanes.map((swimlane, idx) => {
                const swimlaneTasks = timelineTasksBySwimlane.get(swimlane.id) ?? [];
                const height = swimlaneHeights[swimlane.id] || DEFAULT_ROW_HEIGHT;
                const isDraggedRowCollapsed = Boolean(
                  visibleSwimlaneDropIndicator && draggingSwimlaneId === swimlane.id
                );

                return (
                  <React.Fragment key={swimlane.id}>
                    {visibleSwimlaneDropIndicator?.targetId === swimlane.id && visibleSwimlaneDropIndicator.position === 'before' && (
                      <TimelineSwimlaneInsertionMarker
                        height={draggedSwimlaneHeight}
                        width={`${totalTimelineWidth + endPadding}px`}
                        indicator={visibleSwimlaneDropIndicator}
                        onSwimlaneDrop={handleSwimlaneDrop}
                        onSwimlaneDropIndicatorClear={() => setSwimlaneDropIndicator(null)}
                      />
                    )}
                    <div
                      className="swimlane-row relative"
                      style={{
                        height: isDraggedRowCollapsed ? '0px' : `${height}px`,
                        minHeight: isDraggedRowCollapsed ? '0px' : `${height}px`,
                        overflow: isDraggedRowCollapsed ? 'hidden' : undefined,
                        opacity: draggingSwimlaneId === swimlane.id ? 0.4 : undefined,
                      }}
                    >
                      <DraggableSwimlaneRow
                        swimlane={swimlane}
                        index={idx}
                        mode={mode}
                        tasks={swimlaneTasks}
                        dates={dates}
                        dateWidths={dayWidths}
                        monthKeys={visibleMonthKeys}
                        monthWidths={monthWidths}
                        datesByMonth={datesByMonth}
                        leadingSpacerWidth={leadingSpacerWidth}
                        trailingSpacerWidth={trailingSpacerWidth + endPadding}
                        totalTimelineWidth={totalTimelineWidth}
                        rowHeight={height}
                        onTaskClick={onTaskClick}
                        onTaskEdit={onTaskEdit}
                        onTaskDelete={onTaskDelete}
                        onTaskDuplicate={onTaskDuplicate}
                        onAddTask={(date, swimlaneId, endDate) => onAddTask(date, swimlaneId, endDate, mode)}
                        onEditSwimlane={onEditSwimlane}
                        onMoveSwimlane={handleMoveSwimlane}
                        onMoveTaskToSwimlane={(taskId, swimlaneId, newStartDate, newEndDate) => {
                          const task = tasks.find(t => t.id === taskId);
                          if (task) {
                            const updated = applyTimelineTaskDrop(
                              task,
                              swimlaneId,
                              mode,
                              newStartDate,
                              newEndDate
                            );

                            if (updated === task) {
                              return;
                            }

                            onReorderTasks(tasks.map(t => (t.id === taskId ? updated : t)));
                          }
                        }}
                        onRevealDate={(dateISO) => {
                          const revealDate = parseISODateLocal(dateISO);
                          if (revealDate) {
                            setTimelineWindow(window => extendTimelineWindowToDate(window, revealDate));
                          }
                          pendingRevealDateRef.current = dateISO;
                        }}
                        getTaskColor={getTaskColor}
                        handleResizeStart={(e, task, edge) => {
                          suppressAddTaskInteractions();
                          setResizingTask({
                            taskId: task.id,
                            edge,
                            initialX: e.clientX,
                            initialStartDate: task.startDate || '',
                            initialEndDate: task.endDate || '',
                          });
                        }}
                        resizingTaskId={resizingTask?.taskId ?? null}
                        taskResizePreview={taskResizePreview}
                        shouldIgnoreAddTask={shouldIgnoreAddTask}
                        scrollContainerRef={rowsContainerRef}
                      />
                    </div>
                    {visibleSwimlaneDropIndicator?.targetId === swimlane.id && visibleSwimlaneDropIndicator.position === 'after' && (
                      <TimelineSwimlaneInsertionMarker
                        height={draggedSwimlaneHeight}
                        width={`${totalTimelineWidth + endPadding}px`}
                        indicator={visibleSwimlaneDropIndicator}
                        onSwimlaneDrop={handleSwimlaneDrop}
                        onSwimlaneDropIndicatorClear={() => setSwimlaneDropIndicator(null)}
                      />
                    )}
                  </React.Fragment>
                );
              })}
              <TimelineSwimlaneEndDropZone
                width={`${totalTimelineWidth + endPadding}px`}
                lastSwimlaneId={lastDisplaySwimlaneId}
                onSwimlaneDrop={handleSwimlaneDrop}
                onSwimlaneDropIndicatorChange={setSwimlaneDropIndicator}
                onSwimlaneDropIndicatorClear={() => setSwimlaneDropIndicator(null)}
              />
            </div>
            </div>
          </div>
        </div>
        <HorizontalScrollbar
          scrollContainerRef={rowsContainerRef}
          ariaLabel="Timeline horizontal scroll"
          enabled={customScrollbarsEnabled}
        />
        </>
        )}

      </div>
    </DndProvider>
  );
}
