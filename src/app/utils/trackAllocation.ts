/**
 * Track Allocation Utility
 *
 * Implements first-fit algorithm for assigning overlapping tasks
 * to tracks within a swimlane.
 *
 * When multiple tasks overlap in date ranges, they get assigned to
 * different tracks (0, 1, 2, ...) to avoid visual overlap.
 */

import type { Task } from '../types.ts';

export type TimelineTrackPlanMode = 'projects' | 'people';

export interface TimelineRowTrackPlan {
  index: number;
  rowId: string;
  tasks: Task[];
  trackAssignments: Record<string, number>;
  trackCount: number;
  trackHeight: number;
  height: number;
  topOffset: number;
}

export interface TimelineTrackPlan {
  tasksByRow: Map<string, Task[]>;
  rows: TimelineRowTrackPlan[];
  rowsById: Map<string, TimelineRowTrackPlan>;
  taskRowIdByTaskId: Map<string, string>;
  taskCount: number;
  totalHeight: number;
}

export interface TimelineRowWindow {
  rows: TimelineRowTrackPlan[];
  startIndex: number;
  endIndex: number;
  leadingSpacerHeight: number;
  trailingSpacerHeight: number;
  totalHeight: number;
}

/**
 * Represents a task assignment to a track.
 */
export interface TaskTrackAssignment {
  taskId: string;
  trackIndex: number;
}

type HeapItem = { end: number; trackIndex: number };

function pushMinHeap<T>(heap: T[], item: T, compare: (left: T, right: T) => number): void {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compare(heap[parent], heap[index]) <= 0) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function popMinHeap<T>(heap: T[], compare: (left: T, right: T) => number): T | undefined {
  if (heap.length === 0) return undefined;
  const first = heap[0];
  const last = heap.pop();
  if (last && heap.length > 0) {
    heap[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < heap.length && compare(heap[left], heap[smallest]) < 0) smallest = left;
      if (right < heap.length && compare(heap[right], heap[smallest]) < 0) smallest = right;
      if (smallest === index) break;
      [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
      index = smallest;
    }
  }
  return first;
}

function taskDate(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
}

/**
 * Allocate tasks to tracks using first-fit algorithm.
 *
 * Algorithm:
 * 1. Sort tasks by start date (earliest first)
 * 2. For each task, find the first track where it doesn't overlap with existing tasks
 * 3. If no suitable track exists, create a new track
 *
 * @param tasks - Array of tasks in a swimlane
 * @returns Object mapping taskId to track index
 */
export function allocateTasksToTracks(
  tasks: Task[]
): Record<string, number> {
  const assignments: Record<string, number> = {};

  // Early return for empty tasks
  if (!tasks || tasks.length === 0) {
    return assignments;
  }

  // Sort tasks by start date. The stable sort preserves the existing first-fit
  // ordering for tasks with the same date.
  const sortedTasks = [...tasks].sort((a, b) => {
    const dateA = taskDate(a.startDate);
    const dateB = taskDate(b.startDate);
    if (dateA === null) return dateB === null ? 0 : 1;
    if (dateB === null) return -1;
    return dateA - dateB;
  });

  // Active tracks are released by end date, while available track indices are
  // reused in ascending order to preserve first-fit assignments. This avoids
  // comparing every task against every task already assigned to a track.
  const trackEnds: Array<number | null> = [];
  const activeTracks: HeapItem[] = [];
  const availableTracks: number[] = [];
  const byEnd = (left: HeapItem, right: HeapItem) => left.end - right.end || left.trackIndex - right.trackIndex;
  const byIndex = (left: number, right: number) => left - right;

  for (const task of sortedTasks) {
    const start = taskDate(task.startDate);
    if (start === null) {
      // Missing/invalid dates never overlap in the legacy allocator and are
      // therefore assigned to the first track as before.
      assignments[task.id] = 0;
      if (trackEnds.length === 0) {
        trackEnds.push(null);
        pushMinHeap(availableTracks, 0, byIndex);
      }
      continue;
    }

    while (activeTracks.length > 0) {
      const active = activeTracks[0];
      if (trackEnds[active.trackIndex] !== active.end) {
        popMinHeap(activeTracks, byEnd);
      } else if (active.end < start) {
        popMinHeap(activeTracks, byEnd);
        pushMinHeap(availableTracks, active.trackIndex, byIndex);
      } else {
        break;
      }
    }

    const available = popMinHeap(availableTracks, byIndex);
    const trackIndex = available ?? trackEnds.length;
    const end = taskDate(task.endDate) ?? start;
    trackEnds[trackIndex] = end;
    pushMinHeap(activeTracks, { end, trackIndex }, byEnd);
    assignments[task.id] = trackIndex;
  }

  return assignments;
}

/**
 * Build the authored-row task index and its vertical track geometry together.
 * The plan intentionally has no viewport input, so horizontal mounting and width
 * changes cannot alter track placement or row height.
 */
export function buildTimelineTrackPlan(
  tasks: Task[],
  rowIds: string[],
  mode: TimelineTrackPlanMode,
  trackHeight: number,
  minimumRowHeight: number
): TimelineTrackPlan {
  const tasksByRow = new Map<string, Task[]>(rowIds.map(rowId => [rowId, []]));

  tasks.forEach(task => {
    const rowId = mode === 'people' ? task.assigneeId : task.swimlaneId;
    if (!rowId) return;
    tasksByRow.get(rowId)?.push(task);
  });

  const rows: TimelineRowTrackPlan[] = [];
  const rowsById = new Map<string, TimelineRowTrackPlan>();
  const taskRowIdByTaskId = new Map<string, string>();
  let topOffset = 0;
  let taskCount = 0;

  rowIds.forEach((rowId, index) => {
    const rowTasks = tasksByRow.get(rowId) ?? [];
    const trackAssignments = allocateTasksToTracks(rowTasks);
    const trackCount = rowTasks.length > 0
      ? Math.max(...Object.values(trackAssignments)) + 1
      : 1;
    const height = Math.max(minimumRowHeight, trackCount * trackHeight);

    const row = {
      index,
      rowId,
      tasks: rowTasks,
      trackAssignments,
      trackCount,
      trackHeight,
      height,
      topOffset,
    };
    rows.push(row);
    rowsById.set(rowId, row);
    rowTasks.forEach(task => taskRowIdByTaskId.set(task.id, rowId));
    topOffset += height;
    taskCount += rowTasks.length;
  });

  return { tasksByRow, rows, rowsById, taskRowIdByTaskId, taskCount, totalHeight: topOffset };
}

function findFirstRowEndingAfter(rows: TimelineRowTrackPlan[], offset: number): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle].topOffset + rows[middle].height > offset) high = middle;
    else low = middle + 1;
  }
  return Math.min(low, Math.max(0, rows.length - 1));
}

function findLastRowStartingBefore(rows: TimelineRowTrackPlan[], offset: number): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle].topOffset < offset) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, Math.min(rows.length - 1, low - 1));
}

export function buildTimelineRowWindow(
  plan: TimelineTrackPlan,
  scrollTop: number,
  viewportHeight: number,
  overscanPx: number,
  pinnedRowIds: Iterable<string> = []
): TimelineRowWindow {
  if (plan.rows.length === 0) {
    return {
      rows: [],
      startIndex: 0,
      endIndex: -1,
      leadingSpacerHeight: 0,
      trailingSpacerHeight: 0,
      totalHeight: 0,
    };
  }

  const safeScrollTop = Math.max(0, scrollTop);
  const safeOverscan = Math.max(0, overscanPx);
  const startOffset = Math.max(0, safeScrollTop - safeOverscan);
  const endOffset = Math.min(
    plan.totalHeight,
    safeScrollTop + Math.max(0, viewportHeight) + safeOverscan
  );
  let startIndex = findFirstRowEndingAfter(plan.rows, startOffset);
  let endIndex = findLastRowStartingBefore(plan.rows, Math.max(endOffset, startOffset + 1));

  for (const rowId of pinnedRowIds) {
    const pinnedIndex = plan.rowsById.get(rowId)?.index;
    if (pinnedIndex === undefined) continue;
    startIndex = Math.min(startIndex, pinnedIndex);
    endIndex = Math.max(endIndex, pinnedIndex);
  }

  const firstRow = plan.rows[startIndex];
  const lastRow = plan.rows[endIndex];
  return {
    rows: plan.rows.slice(startIndex, endIndex + 1),
    startIndex,
    endIndex,
    leadingSpacerHeight: firstRow.topOffset,
    trailingSpacerHeight: Math.max(0, plan.totalHeight - lastRow.topOffset - lastRow.height),
    totalHeight: plan.totalHeight,
  };
}

export function getTimelineCompensatedScrollTop(
  previousPlan: TimelineTrackPlan,
  nextPlan: TimelineTrackPlan,
  scrollTop: number
): number {
  if (previousPlan.rows.length === 0 || nextPlan.rows.length === 0) return 0;
  if (previousPlan.rows.length !== nextPlan.rows.length) return scrollTop;
  if (previousPlan.rows.some((row, index) => row.rowId !== nextPlan.rows[index]?.rowId)) return scrollTop;

  const anchorIndex = findFirstRowEndingAfter(previousPlan.rows, Math.max(0, scrollTop));
  const previousAnchor = previousPlan.rows[anchorIndex];
  const nextAnchor = nextPlan.rowsById.get(previousAnchor.rowId);
  if (!nextAnchor) return scrollTop;

  const offsetWithinRow = Math.max(0, scrollTop - previousAnchor.topOffset);
  return Math.max(
    0,
    Math.min(nextPlan.totalHeight, nextAnchor.topOffset + Math.min(offsetWithinRow, nextAnchor.height))
  );
}

/**
 * Calculate the total height needed for a swimlane given its tasks.
 *
 * @param tasks - Tasks in the swimlane
 * @param baseRowHeight - Height of a single row (px)
 * @param padding - Additional padding to add (px)
 * @returns Total height in pixels
 */
export function calculateSwimlaneHeight(
  tasks: Task[],
  baseRowHeight: number,
  padding: number = 0
): number {
  if (!tasks || tasks.length === 0) {
    return baseRowHeight + padding;
  }

  const assignments = allocateTasksToTracks(tasks);
  const trackCount = Math.max(...Object.values(assignments)) + 1;

  return trackCount * baseRowHeight + padding;
}

/**
 * Get the maximum track count across multiple swimlanes.
 * Useful for uniform height calculations.
 *
 * @param swimlaneTasksMap - Map of swimlaneId to task arrays
 * @returns Maximum track count
 */
export function getMaxTrackCount(
  swimlaneTasksMap: Record<string, Task[]>
): number {
  let maxTracks = 1;

  for (const tasks of Object.values(swimlaneTasksMap)) {
    if (!tasks || tasks.length === 0) continue;
    const assignments = allocateTasksToTracks(tasks);
    const trackCount = Math.max(...Object.values(assignments)) + 1;
    maxTracks = Math.max(maxTracks, trackCount);
  }

  return maxTracks;
}
