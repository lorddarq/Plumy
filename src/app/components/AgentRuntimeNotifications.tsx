import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { Task } from '../types.ts';
import { findNewCompletedTaskRuns } from '../utils/agentRuntimeNotifications.ts';
import { measurePerformanceOperation } from '../services/performanceLogging.ts';

export function AgentRuntimeNotifications({ tasks }: { tasks: Task[] }) {
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    const runtime = window.electron?.agentRuntime;
    if (!runtime?.sessions?.list) return;
    let disposed = false;
    let initialized = false;
    let refreshRunning = false;
    let refreshQueued = false;
    const seenEventIds = new Set<string>();

    const refresh = async () => {
      if (refreshRunning) {
        refreshQueued = true;
        return;
      }
      refreshRunning = true;
      try {
        const result = await measurePerformanceOperation('acp', 'notifications.sessions.list', () => (
          runtime.sessions.list({ limit: 100 })
        ));
        if (disposed || !result?.ok) return;
        const events = Array.isArray(result.events) ? result.events : [];
        if (!initialized) {
          events.forEach((event: { id?: string }) => { if (event.id) seenEventIds.add(event.id); });
          initialized = true;
          return;
        }
        const completedRuns = findNewCompletedTaskRuns(events, Array.isArray(result.bindings) ? result.bindings : [], seenEventIds);
        for (const run of completedRuns) {
          const task = tasksRef.current.find(candidate => candidate.id === run.taskId);
          toast.success('Agent run finished', { id: run.eventId, description: task?.title || run.taskId });
        }
      } finally {
        refreshRunning = false;
        if (refreshQueued && !disposed) {
          refreshQueued = false;
          void refresh();
        }
      }
    };

    void refresh();
    const unsubscribe = runtime.sessions.onEvent?.((payload) => {
      if (disposed || !initialized || payload?.kind !== 'event' || !payload.event || !payload.binding) return;
      const completedRuns = findNewCompletedTaskRuns([payload.event], [payload.binding], seenEventIds);
      for (const run of completedRuns) {
        const task = tasksRef.current.find(candidate => candidate.id === run.taskId);
        toast.success('Agent run finished', { id: run.eventId, description: task?.title || run.taskId });
      }
    });
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => {
      disposed = true;
      unsubscribe?.();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
