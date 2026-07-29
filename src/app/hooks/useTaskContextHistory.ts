import { useCallback, useEffect, useState } from 'react';

export interface TaskContextIndexEntry {
  id: string;
  kind: string;
  fromRevision: number;
  toRevision: number;
  summary: string;
  markers: string[];
  provenance: 'system-derived' | 'human-authored' | 'agent-authored';
  createdAt: string;
}

export interface TaskContextSourceResult {
  ref: { type: string; id: string };
  status: 'resolved' | 'missing' | 'inaccessible';
  record?: Record<string, unknown>;
}

export interface TaskContextDetail {
  entry: TaskContextIndexEntry & {
    changedFields?: string[];
    sourceRefs: Array<{ type: string; id: string }>;
    actor: string;
  };
  sources: TaskContextSourceResult[];
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

export function useTaskContextHistory(taskId?: string, expectedRevision = 0) {
  const [entries, setEntries] = useState<TaskContextIndexEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<TaskContextDetail | null>(null);
  const [detailState, setDetailState] = useState<LoadState>('idle');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [isAppending, setIsAppending] = useState(false);

  const refresh = useCallback(async (limit = 12) => {
    if (!taskId) return;
    const list = window.electron?.taskContext?.list;
    if (!list) {
      setState('unavailable');
      return;
    }
    setState('loading');
    const result = await list({ taskId, limit }).catch(() => null);
    if (!result?.ok) {
      setError(result?.message || 'Context history could not be loaded.');
      setState('error');
      return;
    }
    setEntries(Array.isArray(result.entries) ? result.entries : []);
    setHasMore(result.hasMore === true);
    setError('');
    setState('ready');
  }, [taskId]);

  useEffect(() => {
    setEntries([]);
    setDetail(null);
    setSelectedEntryId(null);
    setDetailState('idle');
    if (!taskId) return;
    void refresh();
    const unsubscribe = window.electron?.onStoreChanged?.(() => void refresh());
    return () => { unsubscribe?.(); };
  }, [refresh, taskId]);

  const selectEntry = useCallback(async (entryId: string) => {
    if (!taskId) return;
    if (selectedEntryId === entryId) {
      setSelectedEntryId(null);
      setDetail(null);
      setDetailState('idle');
      return;
    }
    setSelectedEntryId(entryId);
    setDetail(null);
    const get = window.electron?.taskContext?.get;
    if (!get) {
      setDetailState('unavailable');
      return;
    }
    setDetailState('loading');
    const result = await get({ taskId, entryId }).catch(() => null);
    if (!result?.ok) {
      setError(result?.message || 'Context entry details could not be loaded.');
      setDetailState('error');
      return;
    }
    setDetail({ entry: result.entry, sources: Array.isArray(result.sources) ? result.sources : [] });
    setDetailState('ready');
  }, [selectedEntryId, taskId]);

  const appendCheckpoint = useCallback(async (summary: string) => {
    const append = window.electron?.taskContext?.appendCheckpoint;
    if (!taskId || !append || !summary.trim()) return false;
    setIsAppending(true);
    const result = await append({
      taskId,
      expectedRevision,
      summary: summary.trim(),
      idempotencyKey: `human-checkpoint:${taskId}:${expectedRevision}:${Date.now()}`,
    }).catch(() => null);
    setIsAppending(false);
    if (!result?.ok) {
      setError(result?.message || 'The checkpoint could not be saved.');
      return false;
    }
    await refresh();
    return true;
  }, [expectedRevision, refresh, taskId]);

  return { entries, hasMore, state, error, detail, detailState, selectedEntryId, isAppending, refresh, selectEntry, appendCheckpoint };
}
