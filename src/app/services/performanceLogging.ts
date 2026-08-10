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

function createCorrelationId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function configurePerformanceLogging(nextEnabled: boolean): void {
  enabled = nextEnabled;
}

export function getLatestWorkspaceCorrelationId(): string | null {
  return latestWorkspaceCorrelationId;
}

export function recordPerformanceEvent(event: PerformanceEvent): void {
  if (!enabled || typeof window === 'undefined') return;
  const record = window.electron?.performance?.record;
  if (typeof record !== 'function') return;
  void record({ ...event, occurredAt: new Date().toISOString() }).catch(() => undefined);
}

export function recordWorkspacePublication(changedFields: string[]): string {
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
  correlationId = createCorrelationId(category),
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await run();
  } finally {
    latestActivity = { correlationId, recordedAt: performance.now() };
    recordPerformanceEvent({
      category,
      operation,
      correlationId,
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
