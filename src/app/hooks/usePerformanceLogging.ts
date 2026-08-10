import { useEffect } from 'react';
import { configurePerformanceLogging, recordPerformanceEvent } from '../services/performanceLogging.ts';

export function usePerformanceLogging(enabled: boolean): void {
  useEffect(() => {
    configurePerformanceLogging(enabled);
    if (enabled) {
      recordPerformanceEvent({ category: 'browser', operation: 'app-run.started' });
    }
    if (!enabled || typeof PerformanceObserver === 'undefined') {
      return () => configurePerformanceLogging(false);
    }

    const supportedEntryTypes = Array.isArray(PerformanceObserver.supportedEntryTypes)
      ? PerformanceObserver.supportedEntryTypes
      : [];
    const observers: PerformanceObserver[] = [];

    if (supportedEntryTypes.includes('longtask')) {
      const longTaskObserver = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          recordPerformanceEvent({
            category: 'browser',
            operation: 'long-task',
            durationMs: entry.duration,
          });
        });
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
      observers.push(longTaskObserver);
    }

    // Event Timing exposes delayed input dispatch (including wheel) without
    // exposing event payloads, which keeps the diagnostic log privacy-safe.
    if (supportedEntryTypes.includes('event')) {
      const inputObserver = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          if (entry.duration < 16) return;
          recordPerformanceEvent({
            category: 'browser',
            operation: 'input-delay',
            durationMs: entry.duration,
            detail: entry.name,
          });
        });
      });
      inputObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 });
      observers.push(inputObserver);
    }

    return () => {
      observers.forEach(observer => observer.disconnect());
      configurePerformanceLogging(false);
    };
  }, [enabled]);
}
