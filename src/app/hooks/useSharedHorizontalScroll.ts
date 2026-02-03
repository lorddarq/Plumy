/**
 * useSharedHorizontalScroll Hook
 *
 * Manages shared horizontal scroll state across multiple views
 * (TimelineView, KanbanView, etc.). Allows any scrollable view to
 * register itself and stay in sync with others.
 *
 * Usage:
 *   const scroll = useSharedHorizontalScroll();
 *   <TimelineView scrollLeft={scroll.scrollLeft} onScroll={scroll.handleScroll} />
 *   <KanbanView scrollLeft={scroll.scrollLeft} onScroll={scroll.handleScroll} />
 *
 * Both views will scroll in sync horizontally (left/right).
 */

import { useCallback, useRef, useState } from 'react';

interface ScrollState {
  scrollLeft: number;
  timestamp: number; // to prevent scroll feedback loops
}

export function useSharedHorizontalScroll() {
  // Current scroll position (in pixels)
  const [scrollLeft, setScrollLeft] = useState(0);

  // Array of registered scrollers (refs to HTML elements)
  const scrollerRefs = useRef<HTMLDivElement[]>([]);

  // Last scroll event source (to prevent feedback loops)
  const lastScrollSourceRef = useRef<HTMLDivElement | null>(null);

  // Latest scroll state (to detect changes)
  const scrollStateRef = useRef<ScrollState>({
    scrollLeft: 0,
    timestamp: 0,
  });

  /**
   * Register a scrollable element to be kept in sync.
   * Call this in useEffect with scrollContainer ref as argument.
   *
   * @param ref - HTML div element that scrolls horizontally
   */
  const registerScroller = useCallback((ref: HTMLDivElement | null) => {
    if (!ref) return;

    // Avoid duplicates
    if (scrollerRefs.current.includes(ref)) return;

    scrollerRefs.current.push(ref);
  }, []);

  /**
   * Unregister a scrollable element (cleanup).
   * Call in useEffect cleanup with scrollContainer ref.
   *
   * @param ref - HTML div element to unregister
   */
  const unregisterScroller = useCallback((ref: HTMLDivElement | null) => {
    if (!ref) return;
    scrollerRefs.current = scrollerRefs.current.filter(r => r !== ref);
  }, []);

  /**
   * Handle scroll event from any registered scroller.
   * Syncs all other scrollers to the same scrollLeft position.
   *
   * @param e - React scroll event
   */
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const source = e.currentTarget;
      const newScrollLeft = source.scrollLeft;

      // Update state
      setScrollLeft(newScrollLeft);
      lastScrollSourceRef.current = source;
      scrollStateRef.current = {
        scrollLeft: newScrollLeft,
        timestamp: Date.now(),
      };

      // Sync all other scrollers to this position (except the source)
      for (const scroller of scrollerRefs.current) {
        if (scroller !== source && scroller.scrollLeft !== newScrollLeft) {
          scroller.scrollLeft = newScrollLeft;
        }
      }
    },
    []
  );

  /**
   * Programmatically set scroll position (useful for external controls,
   * e.g., "snap to today" button).
   *
   * @param newScrollLeft - Target scroll position in pixels
   */
  const setScrollPosition = useCallback((newScrollLeft: number) => {
    setScrollLeft(newScrollLeft);
    scrollStateRef.current = {
      scrollLeft: newScrollLeft,
      timestamp: Date.now(),
    };

    // Update all registered scrollers
    for (const scroller of scrollerRefs.current) {
      if (scroller.scrollLeft !== newScrollLeft) {
        scroller.scrollLeft = newScrollLeft;
      }
    }
  }, []);

  return {
    scrollLeft,
    handleScroll,
    registerScroller,
    unregisterScroller,
    setScrollPosition,
  };
}
