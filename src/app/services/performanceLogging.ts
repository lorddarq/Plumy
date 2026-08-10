export interface PerformanceEvent {
  category: 'workspace' | 'storage' | 'mcp' | 'acp' | 'render' | 'browser';
  operation: string;
  correlationId?: string | null;
  durationMs?: number | null;
  detail?: string | null;
}

let enabled = false;
let latestWorkspaceCorrelationId: string | null = null;
let latestActivity: { correlationId: string; recordedAt: number } | null = null;
const CORRELATION_WINDOW_MS = 250;
const FLUSH_INTERVAL_MS = 2000;
const MAX_BATCH_SIZE = 100;
type RecordedPerformanceEvent = PerformanceEvent & { occurredAt: string };
let bufferedEvents: RecordedPerformanceEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function createCorrelationId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function configurePerformanceLogging(nextEnabled: boolean): void {
  if (!nextEnabled && enabled) void flushPerformanceEvents();
  enabled = nextEnabled;
  if (!enabled && flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

export function getLatestWorkspaceCorrelationId(): string | null {
  return latestWorkspaceCorrelationId;
}

export function recordPerformanceEvent(event: PerformanceEvent): void {
  if (!enabled || typeof window === 'undefined') return;
  bufferedEvents.push({ ...event, occurredAt: new Date().toISOString() });
  if (bufferedEvents.length >= MAX_BATCH_SIZE) {
    void flushPerformanceEvents();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => { void flushPerformanceEvents(); }, FLUSH_INTERVAL_MS);
  }
}

export async function flushPerformanceEvents(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (bufferedEvents.length === 0 || typeof window === 'undefined') return;
  const events = bufferedEvents;
  bufferedEvents = [];
  const performanceApi = window.electron?.performance;
  try {
    if (typeof performanceApi?.recordBatch === 'function') {
      await performanceApi.recordBatch(events);
    } else if (typeof performanceApi?.record === 'function') {
      await Promise.all(events.map(event => performanceApi.record(event)));
    }
  } catch {
    // Diagnostics must never interfere with application work.
  }
}

export function recordWorkspacePublication(changedFields: string[]): string {
  if (!enabled) return '';
  const now = performance.now();
  const correlationId = latestActivity && now - latestActivity.recordedAt <= CORRELATION_WINDOW_MS
    ? latestActivity.correlationId
    : createCorrelationId('workspace');
  latestWorkspaceCorrelationId = correlationId;
  latestActivity = { correlationId, recordedAt: now };
  recordPerformanceEvent({
    category: 'workspace',
    operation: 'snapshot.publish',
    correlationId,
    detail: changedFields.join(','),
  });
  return correlationId;
}

export async function measurePerformanceOperation<T>(
  category: PerformanceEvent['category'],
  operation: string,
  run: () => Promise<T>,
  correlationId?: string,
): Promise<T> {
  if (!enabled) return run();
  const effectiveCorrelationId = correlationId || createCorrelationId(category);
  const startedAt = performance.now();
  try {
    return await run();
  } finally {
    latestActivity = { correlationId: effectiveCorrelationId, recordedAt: performance.now() };
    recordPerformanceEvent({
      category,
      operation,
      correlationId: effectiveCorrelationId,
      durationMs: performance.now() - startedAt,
    });
  }
}

export function recordReactCommit(view: string, durationMs: number): void {
  const now = performance.now();
  recordPerformanceEvent({
    category: 'render',
    operation: 'major-view.commit',
    correlationId: latestActivity && now - latestActivity.recordedAt <= CORRELATION_WINDOW_MS
      ? latestActivity.correlationId
      : latestWorkspaceCorrelationId,
    durationMs,
    detail: view,
  });
}
