/**
 * useVirtualizedTimeline Hook
 *
 * Manages virtualized timeline window state (infinite horizontal scroll support).
 * Maintains a sliding window of dates and handles automatic window extension
 * when user scrolls near the edges.
 *
 * Core concepts:
 * - windowStartIndex: day index of first day in the current window
 * - windowDayCount: how many days are in the current window (~240 = 8 months)
 * - When scroll approaches edge (< BUFFER_DAYS), extend window and adjust scrollLeft
 *
 * Usage:
 *   const timeline = useVirtualizedTimeline(new Date()); // reference date
 *   const offset = timeline.indexToOffset(taskStartIndex);
 *   timeline.handleScroll(scrollLeft, viewportWidth);
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TIMELINE_CONFIG,
  MS_PER_DAY,
  dateToIndex,
  indexToDate,
  indexToOffset as baseIndexToOffset,
  getVisibleDayRange,
} from '@/app/constants/timeline';

interface VirtualizedTimelineState {
  windowStartIndex: number;
  windowDayCount: number;
}

export function useVirtualizedTimeline(referenceDate = new Date()) {
  // Initial window: centered on reference date (typically today)
  const initialStartIndex = dateToIndex(referenceDate) - Math.floor(TIMELINE_CONFIG.WINDOW_DAY_COUNT / 2);

  // Window state - use a generic number type to allow for updates
  const [windowStartIndex, setWindowStartIndex] = useState<number>(initialStartIndex);
  const [windowDayCount, setWindowDayCount] = useState<number>(
    TIMELINE_CONFIG.WINDOW_DAY_COUNT
  );

  // Track scroll position for extension logic
  const scrollStateRef = useRef({
    scrollLeft: 0,
    viewportWidth: 0,
    lastExtensionTime: 0,
  });

  // Throttle extension calls
  const extensionThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Convert day index to pixel offset relative to window start.
   * This allows positioning tasks anywhere, even outside current window
   * (with overflow clipping or extrapolation).
   *
   * @param index - Day index
   * @returns Pixel offset from timeline origin
   */
  const indexToOffset = useCallback((index: number): number => {
    return baseIndexToOffset(index);
  }, []);

  /**
   * Get the visible date range (first and last visible day indices).
   *
   * @param scrollLeft - Current scroll position
   * @param viewportWidth - Width of visible area
   * @returns [firstVisibleIndex, lastVisibleIndex]
   */
  const getVisibleRange = useCallback(
    (scrollLeft: number, viewportWidth: number): [number, number] => {
      return getVisibleDayRange(scrollLeft, viewportWidth);
    },
    []
  );

  /**
   * Check if a date is within the current window.
   *
   * @param date - Date to check
   * @returns true if date is within [windowStart, windowStart + windowDayCount]
   */
  const isDateInWindow = useCallback(
    (date: Date): boolean => {
      const index = dateToIndex(date);
      return (
        index >= windowStartIndex &&
        index < windowStartIndex + windowDayCount
      );
    },
    [windowStartIndex, windowDayCount]
  );

  /**
   * Extend window to the left (prepend days).
   * Computes pixel delta so subsequent scroll adjustment keeps content visually steady.
   *
   * @returns Width of added area (pixels) for scroll adjustment
   */
  const extendWindowLeft = useCallback((): number => {
    setWindowStartIndex(prev => {
      const newStart = prev - TIMELINE_CONFIG.WINDOW_CHUNK_SIZE;
      return newStart;
    });
    const addedWidth =
      TIMELINE_CONFIG.WINDOW_CHUNK_SIZE * TIMELINE_CONFIG.DAY_SLOT_WIDTH;
    return addedWidth;
  }, []);

  /**
   * Extend window to the right (append days).
   * No scroll adjustment needed (user is scrolling toward right).
   */
  const extendWindowRight = useCallback((): void => {
    setWindowDayCount(prev => prev + TIMELINE_CONFIG.WINDOW_CHUNK_SIZE);
  }, []);

  /**
   * Main scroll handler: detect edge proximity and extend window if needed.
   * Should be called from a scroll listener on the timeline container.
   *
   * @param scrollLeft - Current scroll position (pixels)
   * @param viewportWidth - Width of visible area (pixels)
   */
  const handleScroll = useCallback(
    (scrollLeft: number, viewportWidth: number, scrollRef?: React.RefObject<HTMLDivElement>) => {
      scrollStateRef.current = { scrollLeft, viewportWidth, lastExtensionTime: 0 };

      // Calculate how many days are visible
      const visibleDayCount = Math.ceil(
        viewportWidth / TIMELINE_CONFIG.DAY_SLOT_WIDTH
      );

      // Current visible range
      const [firstVisibleIndex] = getVisibleRange(scrollLeft, viewportWidth);

      // How far from the left edge of the window?
      const distanceFromLeftEdge = firstVisibleIndex - windowStartIndex;

      // How far from the right edge of the window?
      const distanceFromRightEdge =
        windowStartIndex +
        windowDayCount -
        (firstVisibleIndex + visibleDayCount);

      // Throttle extension calls (avoid rapid chaining)
      if (extensionThrottleRef.current) {
        clearTimeout(extensionThrottleRef.current);
      }

      extensionThrottleRef.current = setTimeout(() => {
        // Check left edge
        if (distanceFromLeftEdge < TIMELINE_CONFIG.WINDOW_BUFFER_DAYS) {
          const addedWidth = extendWindowLeft();
          // Adjust scroll to keep content visually fixed
          if (scrollRef?.current) {
            scrollRef.current.scrollLeft += addedWidth;
          }
        }

        // Check right edge
        if (distanceFromRightEdge < TIMELINE_CONFIG.WINDOW_BUFFER_DAYS) {
          extendWindowRight();
        }
      }, TIMELINE_CONFIG.SCROLL_THROTTLE_MS);
    },
    [windowStartIndex, windowDayCount, extendWindowLeft, extendWindowRight, getVisibleRange]
  );

  // Cleanup throttle on unmount
  useEffect(() => {
    return () => {
      if (extensionThrottleRef.current) {
        clearTimeout(extensionThrottleRef.current);
      }
    };
  }, []);

  return {
    // State
    windowStartIndex,
    windowDayCount,
    windowEndIndex: windowStartIndex + windowDayCount,

    // Utilities
    indexToOffset,
    indexToDate: (index: number) => indexToDate(index),
    dateToIndex: (date: Date) => dateToIndex(date),
    getVisibleRange,
    isDateInWindow,

    // Actions
    handleScroll,
    extendWindowLeft,
    extendWindowRight,

    // Reference helpers
    scrollStateRef,
  };
}
