import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

interface HorizontalScrollbarProps {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  ariaLabel: string;
  enabled?: boolean;
  hideWhenNoOverflow?: boolean;
}

/** Persistent, mouse-draggable horizontal scrollbar shared by wide workspace views. */
export function HorizontalScrollbar({ scrollContainerRef, ariaLabel, enabled = true, hideWhenNoOverflow = false }: HorizontalScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startClientX: number; startScrollLeft: number } | null>(null);
  const scrollSyncRafRef = useRef<number | null>(null);
  const [metrics, setMetrics] = useState({ clientWidth: 0, scrollWidth: 0, scrollLeft: 0 });

  const syncMetrics = useCallback(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    setMetrics({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, scrollLeft: node.scrollLeft });
  }, [scrollContainerRef]);

  const syncScrollPosition = useCallback(() => {
    if (scrollSyncRafRef.current !== null) return;
    scrollSyncRafRef.current = window.requestAnimationFrame(() => {
      scrollSyncRafRef.current = null;
      const node = scrollContainerRef.current;
      if (!node) return;
      const nextScrollLeft = node.scrollLeft;
      setMetrics(current => current.scrollLeft === nextScrollLeft
        ? current
        : { ...current, scrollLeft: nextScrollLeft });
    });
  }, [scrollContainerRef]);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    syncMetrics();
    const observer = new ResizeObserver(syncMetrics);
    observer.observe(node);
    if (node.firstElementChild instanceof HTMLElement) observer.observe(node.firstElementChild);
    node.addEventListener('scroll', syncScrollPosition, { passive: true });
    window.addEventListener('resize', syncMetrics);
    return () => {
      observer.disconnect();
      node.removeEventListener('scroll', syncScrollPosition);
      window.removeEventListener('resize', syncMetrics);
      if (scrollSyncRafRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncRafRef.current);
        scrollSyncRafRef.current = null;
      }
    };
  }, [scrollContainerRef, syncMetrics, syncScrollPosition]);

  const maxScrollLeft = Math.max(metrics.scrollWidth - metrics.clientWidth, 0);
  const thumbWidthRatio = maxScrollLeft > 0 ? Math.max(metrics.clientWidth / metrics.scrollWidth, 0.12) : 1;
  const thumbWidthPercent = thumbWidthRatio * 100;
  const thumbLeftPercent = maxScrollLeft > 0
    ? (metrics.scrollLeft / maxScrollLeft) * (100 - thumbWidthPercent)
    : 0;

  const moveThumb = useCallback((clientX: number) => {
    const node = scrollContainerRef.current;
    const track = trackRef.current;
    const drag = dragRef.current;
    if (!node || !track || !drag || maxScrollLeft <= 0) return;
    const trackWidth = track.getBoundingClientRect().width;
    const thumbWidth = trackWidth * thumbWidthRatio;
    const maxThumbOffset = Math.max(trackWidth - thumbWidth, 1);
    const scrollDelta = ((clientX - drag.startClientX) / maxThumbOffset) * maxScrollLeft;
    node.scrollLeft = Math.min(maxScrollLeft, Math.max(0, drag.startScrollLeft + scrollDelta));
    syncMetrics();
  }, [maxScrollLeft, scrollContainerRef, syncMetrics, thumbWidthRatio]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (dragRef.current) moveThumb(event.clientX);
    };
    const handleMouseUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [moveThumb]);

  const handleTrackMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const node = scrollContainerRef.current;
    const track = trackRef.current;
    if (!node || !track || maxScrollLeft <= 0) return;
    const rect = track.getBoundingClientRect();
    const thumbWidth = rect.width * thumbWidthRatio;
    const maxThumbOffset = Math.max(rect.width - thumbWidth, 1);
    const ratio = Math.min(Math.max((event.clientX - rect.left - thumbWidth / 2) / maxThumbOffset, 0), 1);
    node.scrollLeft = ratio * maxScrollLeft;
    syncMetrics();
  };

  const handleThumbMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const node = scrollContainerRef.current;
    if (node) dragRef.current = { startClientX: event.clientX, startScrollLeft: node.scrollLeft };
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const node = scrollContainerRef.current;
    if (!node || maxScrollLeft <= 0) return;
    const step = Math.max(40, node.clientWidth * 0.1);
    const page = Math.max(40, node.clientWidth * 0.8);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? maxScrollLeft
        : event.key === 'ArrowLeft' ? node.scrollLeft - step
          : event.key === 'ArrowRight' ? node.scrollLeft + step
            : event.key === 'PageUp' ? node.scrollLeft - page
              : event.key === 'PageDown' ? node.scrollLeft + page
                : null;
    if (next === null) return;
    event.preventDefault();
    node.scrollLeft = Math.min(maxScrollLeft, Math.max(0, next));
    syncMetrics();
  };

  if (!enabled || (hideWhenNoOverflow && metrics.scrollWidth > 0 && maxScrollLeft <= 0)) return null;

  return (
    <div className="persistent-horizontal-scrollbar-shell">
      <div
        ref={trackRef}
        role="scrollbar"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={Math.round(maxScrollLeft)}
        aria-valuenow={Math.round(metrics.scrollLeft)}
        onKeyDown={handleKeyDown}
        onMouseDown={handleTrackMouseDown}
        className="persistent-horizontal-scrollbar-track"
      >
        <div
          onMouseDown={handleThumbMouseDown}
          className="persistent-horizontal-scrollbar-thumb"
          style={{ left: `${thumbLeftPercent}%`, width: `${thumbWidthPercent}%` }}
        />
      </div>
    </div>
  );
}
