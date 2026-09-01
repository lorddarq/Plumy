import type { Task } from '../types.ts';
import { parseISODateLocal } from './date.ts';

export interface TimelineWindow {
  startDate: Date;
  endDate: Date;
}

export type TimelineWindowDirection = 'past' | 'future';

export interface TimelineViewportScrollMetrics {
  scrollLeft: number;
  viewportWidth: number;
}

export interface TimelineViewportMonth {
  monthKey: string;
  dates: Date[];
  width: number;
  startDayIndex: number;
  endDayIndex: number;
  startPx: number;
  endPx: number;
}

export interface TimelineViewportDateGeometry {
  dates: Date[];
  dayWidths: number[];
  dayOffsets: number[];
  totalWidth: number;
}

export interface TimelineViewportGeometry {
  allMonths: TimelineViewportMonth[];
  dateGeometry: TimelineViewportDateGeometry;
}

export interface TimelineViewportResult {
  allMonths: TimelineViewportMonth[];
  visibleMonths: TimelineViewportMonth[];
  visibleMonthRange: {
    startIndex: number;
    endIndex: number;
    monthKeys: string[];
  };
  horizontalSpacers: {
    leadingWidth: number;
    trailingWidth: number;
  };
  scrollMetrics: TimelineViewportScrollMetrics;
  dateGeometry: TimelineViewportDateGeometry;
}

export interface BuildTimelineViewportOptions {
  geometry: TimelineViewportGeometry;
  scrollMetrics: TimelineViewportScrollMetrics;
  renderBufferPx: number;
}

export interface BuildTimelineViewportGeometryOptions {
  dates: Date[];
  monthWidths: Record<string, number>;
  defaultDayWidth: number;
}

const PAD_DAYS = 7;
const MIN_TOTAL_MONTHS = 12;

const atStartOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const atEndOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

export function createInitialTimelineWindow(tasks: Task[], referenceDate = new Date()): TimelineWindow {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const taskDates = tasks.flatMap(task => [task.startDate, task.endDate]
    .map(parseISODateLocal)
    .filter((date): date is Date => date !== null));

  const earliest = taskDates.length > 0
    ? new Date(Math.min(...taskDates.map(date => date.getTime())))
    : today;
  const latest = taskDates.length > 0
    ? new Date(Math.max(...taskDates.map(date => date.getTime())))
    : today;
  latest.setDate(latest.getDate() + PAD_DAYS);

  const startDate = atStartOfMonth(earliest < today ? earliest : today);
  const minimumEnd = new Date(today.getFullYear(), today.getMonth() + MIN_TOTAL_MONTHS, 0);
  const endDate = atEndOfMonth(latest > minimumEnd ? latest : minimumEnd);

  return { startDate, endDate };
}

export function getTimelineWindowDates(window: TimelineWindow, showWeekends: boolean): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(window.startDate);

  while (cursor <= window.endDate) {
    const day = cursor.getDay();
    if (showWeekends || (day !== 0 && day !== 6)) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function createTimelineMonthWidths(
  dates: Date[],
  defaultDayWidth: number,
  overrides: Record<string, number> = {}
): Record<string, number> {
  const widths: Record<string, number> = {};
  dates.forEach(date => {
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    widths[monthKey] = (widths[monthKey] ?? 0) + defaultDayWidth;
  });
  return { ...widths, ...overrides };
}

export function buildTimelineViewportGeometry({
  dates,
  monthWidths,
  defaultDayWidth,
}: BuildTimelineViewportGeometryOptions): TimelineViewportGeometry {
  const datesByMonth = new Map<string, Date[]>();
  dates.forEach(date => {
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    const monthDates = datesByMonth.get(monthKey);
    if (monthDates) monthDates.push(date);
    else datesByMonth.set(monthKey, [date]);
  });

  let runningPx = 0;
  let runningDayIndex = 0;
  const allMonths = [...datesByMonth.entries()].map(([monthKey, monthDates]) => {
    const width = monthWidths[monthKey] ?? monthDates.length * defaultDayWidth;
    const month: TimelineViewportMonth = {
      monthKey,
      dates: monthDates,
      width,
      startDayIndex: runningDayIndex,
      endDayIndex: runningDayIndex + monthDates.length - 1,
      startPx: runningPx,
      endPx: runningPx + width,
    };
    runningPx = month.endPx;
    runningDayIndex += monthDates.length;
    return month;
  });

  const dayWidths = allMonths.flatMap(month => {
    const dayWidth = month.dates.length > 0 ? month.width / month.dates.length : defaultDayWidth;
    return month.dates.map(() => dayWidth);
  });
  const dayOffsets = [0];
  dayWidths.forEach(width => dayOffsets.push(dayOffsets[dayOffsets.length - 1] + width));

  return {
    allMonths,
    dateGeometry: {
      dates,
      dayWidths,
      dayOffsets,
      totalWidth: dayOffsets[dayOffsets.length - 1] ?? 0,
    },
  };
}

export function buildTimelineViewport({
  geometry,
  scrollMetrics,
  renderBufferPx,
}: BuildTimelineViewportOptions): TimelineViewportResult {
  const { allMonths, dateGeometry } = geometry;

  const left = Math.max(0, scrollMetrics.scrollLeft - renderBufferPx);
  const right = scrollMetrics.scrollLeft + scrollMetrics.viewportWidth + renderBufferPx;
  const intersectingMonths = allMonths.filter(month => month.endPx >= left && month.startPx <= right);
  const visibleMonths = intersectingMonths.length > 0 ? intersectingMonths : allMonths;
  const firstVisible = visibleMonths[0];
  const lastVisible = visibleMonths[visibleMonths.length - 1];
  const startIndex = firstVisible ? allMonths.indexOf(firstVisible) : -1;
  const endIndex = lastVisible ? allMonths.indexOf(lastVisible) : -1;
  const totalWidth = dateGeometry.totalWidth;

  return {
    allMonths,
    visibleMonths,
    visibleMonthRange: {
      startIndex,
      endIndex,
      monthKeys: visibleMonths.map(month => month.monthKey),
    },
    horizontalSpacers: {
      leadingWidth: firstVisible?.startPx ?? 0,
      trailingWidth: Math.max(0, totalWidth - (lastVisible?.endPx ?? totalWidth)),
    },
    scrollMetrics: { ...scrollMetrics },
    dateGeometry,
  };
}

export function findTimelineDateIndex(
  dates: Date[],
  date: Date,
  mode: 'start' | 'end'
): number {
  if (dates.length === 0) return -1;
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (mode === 'start') {
    for (let index = 0; index < dates.length; index += 1) {
      if (dates[index].getTime() >= target) return index;
    }
    return dates.length - 1;
  }

  for (let index = dates.length - 1; index >= 0; index -= 1) {
    if (dates[index].getTime() <= target) return index;
  }
  return 0;
}

export function getTimelineViewportMarker(
  geometry: TimelineViewportDateGeometry,
  index: number,
  fallbackDayWidth: number
): { index: number; left: number; center: number } | null {
  if (index < 0 || index >= geometry.dates.length) return null;
  const left = geometry.dayOffsets[index] ?? 0;
  const width = geometry.dayWidths[index] ?? fallbackDayWidth;
  return { index, left, center: left + width / 2 };
}

export function extendTimelineWindow(
  window: TimelineWindow,
  direction: TimelineWindowDirection,
  months = 3
): TimelineWindow {
  if (direction === 'past') {
    return {
      startDate: new Date(window.startDate.getFullYear(), window.startDate.getMonth() - months, 1),
      endDate: window.endDate,
    };
  }

  return {
    startDate: window.startDate,
    endDate: atEndOfMonth(new Date(window.endDate.getFullYear(), window.endDate.getMonth() + months, 1)),
  };
}

export function extendTimelineWindowToDate(
  window: TimelineWindow,
  date: Date
): TimelineWindow {
  if (date < window.startDate) {
    return { startDate: atStartOfMonth(date), endDate: window.endDate };
  }

  if (date > window.endDate) {
    return { startDate: window.startDate, endDate: atEndOfMonth(date) };
  }

  return window;
}

export function getTimelineWindowAddedDayCount(
  window: TimelineWindow,
  direction: TimelineWindowDirection,
  showWeekends: boolean,
  months = 3
): number {
  const extendedWindow = extendTimelineWindow(window, direction, months);
  const addedRange = direction === 'past'
    ? { startDate: extendedWindow.startDate, endDate: new Date(window.startDate.getFullYear(), window.startDate.getMonth(), 0) }
    : { startDate: new Date(window.endDate.getFullYear(), window.endDate.getMonth() + 1, 1), endDate: extendedWindow.endDate };

  return getTimelineWindowDates(addedRange, showWeekends).length;
}

export function getTimelineWindowScrollCompensation(
  window: TimelineWindow,
  direction: TimelineWindowDirection,
  showWeekends: boolean,
  dayWidth: number,
  months = 3
): number {
  return getTimelineWindowAddedDayCount(window, direction, showWeekends, months) * dayWidth;
}
