/**
 * useViewHeights Hook
 *
 * Manages vertical sizing of TimelineView and KanbanView
 * when both are visible in a split layout (future use case).
 *
 * Allows users to drag a resize handle to adjust the relative heights
 * of the two views while maintaining minimum heights.
 */

import { useCallback, useState } from 'react';

interface ViewHeightsState {
  timeline: number;
  kanban: number;
}

export function useViewHeights(initialTimeline = 350, initialKanban = 400) {
  const [heights, setHeights] = useState<ViewHeightsState>({
    timeline: initialTimeline,
    kanban: initialKanban,
  });

  /**
   * Handle resize event from vertical resize handle.
   * Adjusts heights proportionally while maintaining minimums.
   *
   * @param delta - Pixel change (positive = grow timeline, shrink kanban)
   */
  const handleResize = useCallback((delta: number) => {
    setHeights(prev => {
      const newTimeline = Math.max(100, prev.timeline + delta);
      const newKanban = Math.max(100, prev.kanban - delta);
      return {
        timeline: newTimeline,
        kanban: newKanban,
      };
    });
  }, []);

  /**
   * Programmatically set heights.
   *
   * @param timelineHeight - Target timeline height in pixels
   * @param kanbanHeight - Target kanban height in pixels
   */
  const setHeights_ = useCallback(
    (timelineHeight: number, kanbanHeight: number) => {
      setHeights({
        timeline: Math.max(100, timelineHeight),
        kanban: Math.max(100, kanbanHeight),
      });
    },
    []
  );

  /**
   * Reset to initial heights.
   */
  const reset = useCallback(() => {
    setHeights({
      timeline: initialTimeline,
      kanban: initialKanban,
    });
  }, [initialTimeline, initialKanban]);

  return {
    heights,
    handleResize,
    setHeights: setHeights_,
    reset,
  };
}
