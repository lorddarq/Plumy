import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export function VerticalScrollbar({ scrollContainerRef, ariaLabel }: { scrollContainerRef: RefObject<HTMLDivElement | null>; ariaLabel: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startClientY: number; startScrollTop: number } | null>(null);
  const scrollSyncRafRef = useRef<number | null>(null);
  const [metrics, setMetrics] = useState({ clientHeight: 0, scrollHeight: 0, scrollTop: 0 });

  const syncMetrics = useCallback(() => {
    const node = scrollContainerRef.current;
    if (node) setMetrics({ clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop });
  }, [scrollContainerRef]);

  const syncScrollPosition = useCallback(() => {
    if (scrollSyncRafRef.current !== null) return;
    scrollSyncRafRef.current = window.requestAnimationFrame(() => {
      scrollSyncRafRef.current = null;
      const node = scrollContainerRef.current;
      if (!node) return;
      const nextScrollTop = node.scrollTop;
      setMetrics(current => current.scrollTop === nextScrollTop
        ? current
        : { ...current, scrollTop: nextScrollTop });
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

  const maxScrollTop = Math.max(metrics.scrollHeight - metrics.clientHeight, 0);
  const thumbHeightRatio = maxScrollTop > 0 ? Math.max(metrics.clientHeight / metrics.scrollHeight, 0.16) : 1;
  const thumbHeightPercent = thumbHeightRatio * 100;
  const thumbTopPercent = maxScrollTop > 0 ? (metrics.scrollTop / maxScrollTop) * (100 - thumbHeightPercent) : 0;

  const moveThumb = useCallback((clientY: number) => {
    const track = trackRef.current;
    const node = scrollContainerRef.current;
    const drag = dragRef.current;
    if (!track || !node || !drag || maxScrollTop <= 0) return;
    const trackHeight = track.getBoundingClientRect().height;
    const thumbHeight = trackHeight * thumbHeightRatio;
    const maxThumbOffset = Math.max(trackHeight - thumbHeight, 1);
    node.scrollTop = Math.min(maxScrollTop, Math.max(0, drag.startScrollTop + ((clientY - drag.startClientY) / maxThumbOffset) * maxScrollTop));
    syncMetrics();
  }, [maxScrollTop, scrollContainerRef, syncMetrics, thumbHeightRatio]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => { if (dragRef.current) moveThumb(event.clientY); };
    const onMouseUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [moveThumb]);

  const handleTrackMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const node = scrollContainerRef.current;
    const track = trackRef.current;
    if (!node || !track || maxScrollTop <= 0) return;
    const rect = track.getBoundingClientRect();
    const thumbHeight = rect.height * thumbHeightRatio;
    const maxThumbOffset = Math.max(rect.height - thumbHeight, 1);
    node.scrollTop = Math.min(maxScrollTop, Math.max(0, ((event.clientY - rect.top - thumbHeight / 2) / maxThumbOffset) * maxScrollTop));
    syncMetrics();
  };

  const handleThumbMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { startClientY: event.clientY, startScrollTop: scrollContainerRef.current?.scrollTop || 0 };
  };

  if (maxScrollTop <= 0) return null;

  return (
    <div className="persistent-vertical-scrollbar-track" ref={trackRef} role="scrollbar" aria-label={ariaLabel} aria-valuemin={0} aria-valuemax={Math.round(maxScrollTop)} aria-valuenow={Math.round(metrics.scrollTop)} onMouseDown={handleTrackMouseDown}>
      <div className="persistent-vertical-scrollbar-thumb" onMouseDown={handleThumbMouseDown} style={{ top: `${thumbTopPercent}%`, height: `${thumbHeightPercent}%` }} />
    </div>
  );
}
