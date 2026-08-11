import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import {
  getCenteredScrollLeftForMarker,
  getFixedDaySurfaceMarker,
  type TimeSurfaceMarker,
} from '../utils/timeSurface.ts';

interface UseFixedTimeSurfaceNavigationOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  rangeStart: Date;
  dayCount: number;
  dayWidth: number;
  today?: Date;
  autoScrollKey?: string;
  scrollStepPx?: number;
  onScrollFrame?: (state: { scrollLeft: number; scrollTop: number }) => void;
}

interface UseFixedTimeSurfaceNavigationResult {
  isHeaderScrubbing: boolean;
  scrollLeft: number;
  scrollTop: number;
  todayMarker: TimeSurfaceMarker | null;
  handleHeaderScrubStart: (event: ReactMouseEvent<HTMLElement>) => void;
  handleScroll: () => void;
  scrollToDate: (date: Date, behavior?: ScrollBehavior) => number | null;
  scrollToToday: () => number | null;
  scrollLeftByStep: () => void;
  scrollRightByStep: () => void;
}

export function useFixedTimeSurfaceNavigation({
  scrollRef,
  rangeStart,
  dayCount,
  dayWidth,
  today = new Date(),
  autoScrollKey,
  scrollStepPx = 200,
  onScrollFrame,
}: UseFixedTimeSurfaceNavigationOptions): UseFixedTimeSurfaceNavigationResult {
  // Roadmap uses a fixed-width day surface, so it can share this navigation hook directly.
  // Timeline keeps its own navigation because visible days can be filtered and widths vary per cell.
  const isHeaderScrubbingRef = useRef(false);
  const scrubStartXRef = useRef(0);
  const scrubStartScrollLeftRef = useRef(0);
  const autoScrolledKeyRef = useRef<string | null>(null);
  const startupAutoScrollRafRef = useRef<number | null>(null);
  const startupAutoScrollTimersRef = useRef<number[]>([]);
  const scrollUpdateRafRef = useRef<number | null>(null);
  const [isHeaderScrubbing, setIsHeaderScrubbing] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const todayMarker = useMemo(
    () => getFixedDaySurfaceMarker(rangeStart, dayCount, dayWidth, today),
    [dayCount, dayWidth, rangeStart, today]
  );

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!isHeaderScrubbingRef.current || !scrollRef.current) return;
      const dx = event.clientX - scrubStartXRef.current;
      scrollRef.current.scrollLeft = scrubStartScrollLeftRef.current - dx;
      event.preventDefault();
    };

    const handleUp = () => {
      if (!isHeaderScrubbingRef.current) return;
      isHeaderScrubbingRef.current = false;
      setIsHeaderScrubbing(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [scrollRef]);

  const handleHeaderScrubStart = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !scrollRef.current) return;
    const target = event.target as HTMLElement;
    const blockedTarget = target.closest('button, a, input, textarea, select, [role="button"]');
    if (blockedTarget) return;

    isHeaderScrubbingRef.current = true;
    setIsHeaderScrubbing(true);
    scrubStartXRef.current = event.clientX;
    scrubStartScrollLeftRef.current = scrollRef.current.scrollLeft;
    event.preventDefault();
  }, [scrollRef]);

  const handleScroll = useCallback(() => {
    if (scrollUpdateRafRef.current !== null) return;
    scrollUpdateRafRef.current = window.requestAnimationFrame(() => {
      scrollUpdateRafRef.current = null;
      const nextScrollLeft = scrollRef.current?.scrollLeft || 0;
      const nextScrollTop = scrollRef.current?.scrollTop || 0;
      if (onScrollFrame) {
        onScrollFrame({ scrollLeft: nextScrollLeft, scrollTop: nextScrollTop });
      } else {
        setScrollLeft(current => (current === nextScrollLeft ? current : nextScrollLeft));
        setScrollTop(current => (current === nextScrollTop ? current : nextScrollTop));
      }
    });
  }, [onScrollFrame, scrollRef]);

  useEffect(() => () => {
    if (scrollUpdateRafRef.current !== null) {
      window.cancelAnimationFrame(scrollUpdateRafRef.current);
      scrollUpdateRafRef.current = null;
    }
  }, []);

  const scrollToDate = useCallback((date: Date, behavior: ScrollBehavior = 'smooth') => {
    if (!scrollRef.current) return null;
    const marker = getFixedDaySurfaceMarker(rangeStart, dayCount, dayWidth, date);
    if (!marker) return null;

    const maxScrollLeft = Math.max(0, scrollRef.current.scrollWidth - scrollRef.current.clientWidth);
    const targetLeft = getCenteredScrollLeftForMarker(
      marker.center,
      scrollRef.current.clientWidth,
      maxScrollLeft
    );
    scrollRef.current.scrollTo({
      left: targetLeft,
      behavior,
    });
    if (behavior !== 'smooth') {
      const nextState = { scrollLeft: targetLeft, scrollTop: scrollRef.current.scrollTop };
      if (onScrollFrame) onScrollFrame(nextState);
      else {
        setScrollLeft(targetLeft);
        setScrollTop(nextState.scrollTop);
      }
    }
    return targetLeft;
  }, [dayCount, dayWidth, onScrollFrame, rangeStart, scrollRef]);

  const scrollToToday = useCallback(() => (
    scrollToDate(today, 'auto')
  ), [scrollToDate, today]);

  const scrollLeftByStep = useCallback(() => {
    scrollRef.current?.scrollBy({ left: -scrollStepPx, behavior: 'smooth' });
  }, [scrollRef, scrollStepPx]);

  const scrollRightByStep = useCallback(() => {
    scrollRef.current?.scrollBy({ left: scrollStepPx, behavior: 'smooth' });
  }, [scrollRef, scrollStepPx]);

  useLayoutEffect(() => {
    if (!todayMarker) return;

    const nextKey = autoScrollKey
      ?? `${rangeStart.toISOString()}:${dayCount}:${dayWidth}:${todayMarker.center}`;
    if (autoScrolledKeyRef.current === nextKey) return;

    let cancelled = false;
    let attempts = 0;
    let stableHits = 0;
    const MAX_ATTEMPTS = 40;

    const applyTodayUntilStable = () => {
      if (cancelled || !scrollRef.current) return;

      attempts += 1;
      const target = scrollToDate(today, 'auto');
      const actual = scrollRef.current.scrollLeft;
      const widthSettled = scrollRef.current.scrollWidth > scrollRef.current.clientWidth + 1;
      const aligned = target !== null && Math.abs(actual - target) <= 1;
      const canFinishAtZero = target !== null && (target <= 1 || !widthSettled);

      if (aligned && (canFinishAtZero || actual > 1)) {
        stableHits += 1;
      } else {
        stableHits = 0;
      }

      if (stableHits >= 2 || attempts >= MAX_ATTEMPTS) {
        autoScrolledKeyRef.current = nextKey;
        return;
      }

      const timeoutId = window.setTimeout(applyTodayUntilStable, 100);
      startupAutoScrollTimersRef.current.push(timeoutId);
    };

    startupAutoScrollRafRef.current = window.requestAnimationFrame(applyTodayUntilStable);

    return () => {
      cancelled = true;
      if (startupAutoScrollRafRef.current != null) {
        window.cancelAnimationFrame(startupAutoScrollRafRef.current);
        startupAutoScrollRafRef.current = null;
      }
      startupAutoScrollTimersRef.current.forEach(id => window.clearTimeout(id));
      startupAutoScrollTimersRef.current = [];
    };
  }, [autoScrollKey, dayCount, dayWidth, rangeStart, scrollRef, scrollToDate, today, todayMarker]);

  return {
    isHeaderScrubbing,
    scrollLeft,
    scrollTop,
    todayMarker,
    handleHeaderScrubStart,
    handleScroll,
    scrollToDate,
    scrollToToday,
    scrollLeftByStep,
    scrollRightByStep,
  };
}
