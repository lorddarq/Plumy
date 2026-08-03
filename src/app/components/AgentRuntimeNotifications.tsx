import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { Task } from '../types.ts';
import { findNewCompletedTaskRuns } from '../utils/agentRuntimeNotifications.ts';

export function AgentRuntimeNotifications({ tasks }: { tasks: Task[] }) {
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    const runtime = window.electron?.agentRuntime;
    if (!runtime?.sessions?.list || !window.electron?.onStoreChanged) return;
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
        const result = await runtime.sessions.list({ limit: 100 });
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
    const unsubscribe = window.electron.onStoreChanged(() => void refresh());
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return null;
}
