/**
 * Timeline Configuration Constants
 * Unified, centralized configuration for all timeline-related calculations
 * and rendering behavior.
 *
 * These constants define the fixed grid system (60px/day), virtualization window
 * settings, and performance tuning parameters.
 */

export const TIMELINE_CONFIG = {
  /**
   * Fixed day slot width in pixels.
   * All tasks are positioned and sized relative to this constant.
   * No dynamic day widths; simplifies calculations and enables consistent virtualization.
   */
  DAY_SLOT_WIDTH: 60,

  /**
   * Timeline header height (month row + day row) in pixels.
   * Determines where swimlane rows start vertically.
   */
  HEADER_HEIGHT: 72,

  /**
   * Base swimlane row height in pixels (before track expansion).
   * Increased from previous ~48px to accommodate track display.
   */
  ROW_HEIGHT: 48,

  /**
   * Additional height per track within a swimlane (pixels).
   * When swimlane has multiple tracks due to overlapping tasks,
   * each additional track adds this height.
   * Example: 2 tracks = ROW_HEIGHT + 1 * TRACK_HEIGHT
   */
  TRACK_HEIGHT: 48,

  /**
   * Epoch date for day index calculations.
   * All day indices are offsets from this date.
   * Use a stable, far-past date to ensure consistent indexing.
   */
  EPOCH_DATE: new Date(2020, 0, 1),

  /**
   * Virtualized window: how many days to keep in memory.
   * Larger window = more memory but smoother scrolling near edges.
   * Example: 240 days ≈ ~8 months of calendar.
   */
  WINDOW_DAY_COUNT: 240,

  /**
   * Virtualized window: how many days to add when extending.
   * When user scrolls near edge (< BUFFER_DAYS), append/prepend this many days.
   */
  WINDOW_CHUNK_SIZE: 60,

  /**
   * Virtualized window: buffer distance in days.
   * When visible scroll position nears this distance from window edge,
   * trigger window extension.
   */
  WINDOW_BUFFER_DAYS: 60,

  /**
   * Scroll debounce/throttle in milliseconds.
   * Scroll events fire very frequently; throttle to avoid excessive
   * window extension checks and re-renders.
   */
  SCROLL_THROTTLE_MS: 100,

  /**
   * Task drag/resize snapping: should tasks snap to day boundaries?
   * If true, dropped tasks align to nearest day start (multiple of DAY_SLOT_WIDTH).
   */
  SNAP_TO_DAY_GRID: true,

  /**
   * Task visibility buffer: render tasks within this many pixels
   * beyond the visible viewport (to avoid pop-in on fast scroll).
   */
  TASK_RENDER_BUFFER_PX: 200,

  /**
   * Swimlane row virtualization: only render rows currently visible.
   * For very large swimlane counts (100+), enable this to avoid DOM bloat.
   * Estimated rows per viewport = VIEWPORT_HEIGHT / ROW_HEIGHT.
   */
  VIRTUALIZE_SWIMLANE_ROWS: false,

  /**
   * Swimlane row virtualization buffer: how many rows to render
   * above/below visible area (when VIRTUALIZE_SWIMLANE_ROWS is true).
   */
  SWIMLANE_ROW_BUFFER: 3,

  /**
   * Milliseconds to debounce view resize events (App-level
   * timeline/kanban height adjustment).
   */
  VIEW_RESIZE_DEBOUNCE_MS: 150,

  /**
   * Milliseconds to debounce swimlane height recalculation
   * when track count changes (prevents layout thrash).
   */
  SWIMLANE_HEIGHT_DEBOUNCE_MS: 50,
} as const;

/**
 * Utility: Convert milliseconds to days (24 hours).
 */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Utility: Calculate day index for a given date relative to EPOCH_DATE.
 * @param date - The date to convert
 * @returns Integer day index (negative for dates before epoch, positive after)
 */
export function dateToIndex(date: Date): number {
  const diff = date.getTime() - TIMELINE_CONFIG.EPOCH_DATE.getTime();
  return Math.floor(diff / MS_PER_DAY);
}

/**
 * Utility: Convert day index back to Date.
 * @param index - Day index to convert
 * @returns Date corresponding to the index
 */
export function indexToDate(index: number): Date {
  const ms = TIMELINE_CONFIG.EPOCH_DATE.getTime() + index * MS_PER_DAY;
  return new Date(ms);
}

/**
 * Utility: Convert day index to pixel offset on timeline.
 * @param index - Day index
 * @returns Pixel offset from timeline start (0 = epoch date)
 */
export function indexToOffset(index: number): number {
  return index * TIMELINE_CONFIG.DAY_SLOT_WIDTH;
}

/**
 * Utility: Calculate the width (in pixels) for a task spanning
 * from startIndex to endIndex (inclusive).
 * @param startIndex - Day index of task start (inclusive)
 * @param endIndex - Day index of task end (inclusive)
 * @returns Width in pixels
 */
export function taskSpanToWidth(startIndex: number, endIndex: number): number {
  const daySpan = Math.max(1, endIndex - startIndex + 1);
  return daySpan * TIMELINE_CONFIG.DAY_SLOT_WIDTH;
}

/**
 * Utility: Get the visible day range for a given scroll position and viewport width.
 * Returns [firstVisibleIndex, lastVisibleIndex] (inclusive).
 * @param scrollLeft - Current scroll position (pixels)
 * @param viewportWidth - Width of visible area (pixels)
 * @returns Tuple of first and last visible day indices
 */
export function getVisibleDayRange(
  scrollLeft: number,
  viewportWidth: number
): [number, number] {
  const firstIndex = Math.floor(scrollLeft / TIMELINE_CONFIG.DAY_SLOT_WIDTH);
  const lastIndex = Math.ceil(
    (scrollLeft + viewportWidth) / TIMELINE_CONFIG.DAY_SLOT_WIDTH
  );
  return [firstIndex, lastIndex];
}
