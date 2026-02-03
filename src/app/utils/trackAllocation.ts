/**
 * Track Allocation Utility
 *
 * Implements first-fit algorithm for assigning overlapping tasks
 * to tracks within a swimlane.
 *
 * When multiple tasks overlap in date ranges, they get assigned to
 * different tracks (0, 1, 2, ...) to avoid visual overlap.
 */

import { Task } from '../types';

/**
 * Represents a task assignment to a track.
 */
export interface TaskTrackAssignment {
  taskId: string;
  trackIndex: number;
}

/**
 * Check if two tasks overlap in their date ranges.
 *
 * @param task1 - First task
 * @param task2 - Second task
 * @returns true if tasks overlap, false otherwise
 */
function tasksOverlap(task1: Task, task2: Task): boolean {
  const start1 = task1.startDate ? new Date(task1.startDate).getTime() : 0;
  const end1 = task1.endDate ? new Date(task1.endDate).getTime() : Number.MAX_VALUE;
  const start2 = task2.startDate ? new Date(task2.startDate).getTime() : 0;
  const end2 = task2.endDate ? new Date(task2.endDate).getTime() : Number.MAX_VALUE;

  // Tasks overlap if: task1.start < task2.end AND task1.end > task2.start
  return start1 < end2 && end1 > start2;
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

  // Sort tasks by start date
  const sortedTasks = [...tasks].sort((a, b) => {
    const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
    const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
    return dateA - dateB;
  });

  // Track arrays: each track contains the tasks assigned to it
  const tracks: Task[][] = [];

  // Assign each task to the first suitable track
  for (const task of sortedTasks) {
    let assigned = false;

    // Try to fit into an existing track
    for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
      const trackTasks = tracks[trackIdx];
      const hasOverlap = trackTasks.some(t => tasksOverlap(task, t));

      if (!hasOverlap) {
        // Task fits in this track
        trackTasks.push(task);
        assignments[task.id] = trackIdx;
        assigned = true;
        break;
      }
    }

    // If no suitable track found, create a new one
    if (!assigned) {
      tracks.push([task]);
      assignments[task.id] = tracks.length - 1;
    }
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
