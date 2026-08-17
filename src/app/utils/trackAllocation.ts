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
