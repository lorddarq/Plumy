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

    const supported = Array.isArray(PerformanceObserver.supportedEntryTypes)
      && PerformanceObserver.supportedEntryTypes.includes('longtask');
    if (!supported) return () => configurePerformanceLogging(false);

    const observer = new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        recordPerformanceEvent({
          category: 'browser',
          operation: 'long-task',
          durationMs: entry.duration,
        });
      });
    });
    observer.observe({ entryTypes: ['longtask'] });

    return () => {
      observer.disconnect();
      configurePerformanceLogging(false);
    };
  }, [enabled]);
}
