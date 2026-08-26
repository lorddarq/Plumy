const test = require('node:test');
const assert = require('node:assert/strict');
const { TASK_CONTEXT_ENTRIES_KEY, createTaskContextLedgerService } = require('./task-context-ledger-service.cjs');

class MemoryStore {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed));
  }

  get(key) {
    return this.values.get(key);
  }

  set(key, value) {
    this.values.set(key, value);
  }
}

function createHarness(seed = {}) {
  const store = new MemoryStore({
    tasks: [{ id: 'task-1', title: 'Ledger task', __mcpRevision: 4 }],
    entries: [],
    ...seed,
  });
  let ordinal = 0;
  const service = createTaskContextLedgerService({
    getTaskById: (current, taskId) => current.get('tasks').find(task => task.id === taskId) || null,
    readEntries: current => current.get('entries'),
    writeEntries: (current, entries) => current.set('entries', entries),
    normalizeString: value => typeof value === 'string' ? value.trim() : '',
    now: () => '2026-07-29T20:00:00.000Z',
    createId: () => `context-${++ordinal}`,
  });
  return { service, store };
}

function appendDecision(service, store, overrides = {}) {
  return service.append(store, {
    taskId: 'task-1',
    expectedRevision: 4,
    idempotencyKey: 'decision-1',
    kind: 'decision',
    fromRevision: 3,
    toRevision: 4,
    summary: 'Keep the ledger separate from the task projection.',
    markers: ['Architecture', 'ledger'],
    changedFields: ['notes'],
    provenance: 'agent-authored',
    actor: 'agent-edgar',
    sourceRefs: [{ type: 'attachment', id: 'architecture-doc', extension: { retained: true } }],
    extension: { retained: true },
    ...overrides,
  });
}

test('tasks without a ledger return an empty bounded read and remain unchanged', () => {
  const { service, store } = createHarness({ entries: undefined });
  const before = structuredClone(store.get('tasks')[0]);

  assert.deepEqual(service.list(store, { taskId: 'task-1' }), {
    ok: true,
    taskId: 'task-1',
    entries: [],
    hasMore: false,
  });
  assert.deepEqual(store.get('tasks')[0], before);
  assert.equal(store.get('entries'), undefined);
});

test('append persists an immutable source-linked record without advancing task revision', () => {
  const { service, store } = createHarness();
  const result = appendDecision(service, store);

  assert.equal(result.ok, true);
  assert.equal(result.idempotent, false);
  assert.equal(result.entry.schemaVersion, 1);
  assert.deepEqual(result.entry.markers, ['architecture', 'ledger']);
  assert.equal(result.entry.extension.retained, true);
  assert.equal(result.entry.sourceRefs[0].extension.retained, true);
  assert.equal(store.get('tasks')[0].__mcpRevision, 4);
  assert.equal(store.get('entries').length, 1);

  result.entry.summary = 'Mutated by caller';
  const exact = service.get(store, { taskId: 'task-1', entryId: 'context-1' });
  assert.equal(exact.entry.summary, 'Keep the ledger separate from the task projection.');
  exact.entry.extension.retained = false;
  assert.equal(store.get('entries')[0].extension.retained, true);
});

test('indexed reads filter one task by marker, kind, text, and overlapping revision range', () => {
  const { service, store } = createHarness({
    tasks: [
      { id: 'task-1', title: 'Ledger task', __mcpRevision: 4 },
      { id: 'task-2', title: 'Other task', __mcpRevision: 1 },
    ],
  });
  appendDecision(service, store);
  store.set('entries', store.get('entries').concat({
    schemaVersion: 1,
    id: 'other-context',
    taskId: 'task-2',
    kind: 'blocker',
    fromRevision: 1,
    toRevision: 1,
    summary: 'Unrelated task blocker.',
    markers: ['ledger'],
    provenance: 'human-authored',
    actor: 'human-1',
    sourceRefs: [{ type: 'comment', id: 'comment-1' }],
    createdAt: '2026-07-29T20:01:00.000Z',
  }));

  const result = service.list(store, {
    taskId: 'task-1',
    kinds: ['decision'],
    markers: ['LEDGER'],
    search: 'separate',
    fromRevision: 4,
    toRevision: 5,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.entries.map(entry => entry.id), ['context-1']);
});

test('stale appends fail without writes and replays return the original record', () => {
  const { service, store } = createHarness();
  const stale = appendDecision(service, store, { expectedRevision: 3, idempotencyKey: 'stale' });
  assert.equal(stale.error, 'REVISION_MISMATCH');
  assert.equal(store.get('entries').length, 0);

  const first = appendDecision(service, store);
  store.set('tasks', [{ ...store.get('tasks')[0], __mcpRevision: 5 }]);
  const replay = appendDecision(service, store, { expectedRevision: 4 });
  assert.equal(replay.ok, true);
  assert.equal(replay.idempotent, true);
  assert.deepEqual(replay.entry, first.entry);
  assert.equal(store.get('entries').length, 1);

  const conflict = appendDecision(service, store, { summary: 'A different decision.', expectedRevision: 5 });
  assert.equal(conflict.error, 'IDEMPOTENCY_CONFLICT');
  assert.equal(store.get('entries').length, 1);
});

test('the first checkpoint defaults to a current-revision baseline only', () => {
  const { service, store } = createHarness();
  const baseline = service.append(store, {
    taskId: 'task-1',
    expectedRevision: 4,
    idempotencyKey: 'baseline-1',
    kind: 'context-checkpoint',
    summary: 'Ledger starts from the current known task state.',
    markers: ['baseline'],
    provenance: 'system-derived',
    actor: 'omvra',
    sourceRefs: [{ type: 'task-change', id: 'task-1@4' }],
  });
  assert.equal(baseline.ok, true);
  assert.equal(baseline.entry.fromRevision, 4);
  assert.equal(baseline.entry.toRevision, 4);

  const replay = service.append(store, {
    taskId: 'task-1',
    expectedRevision: 0,
    idempotencyKey: 'baseline-1',
    kind: 'context-checkpoint',
    summary: 'Ledger starts from the current known task state.',
    markers: ['baseline'],
    provenance: 'system-derived',
    actor: 'omvra',
    sourceRefs: [{ type: 'task-change', id: 'task-1@4' }],
  });
  assert.equal(replay.idempotent, true);

  const { service: invalidService, store: invalidStore } = createHarness();
  const invalid = invalidService.append(invalidStore, {
    taskId: 'task-1', expectedRevision: 4, idempotencyKey: 'baseline-invalid', kind: 'context-checkpoint',
    fromRevision: 0, toRevision: 4, summary: 'Fabricated history.', markers: ['baseline'],
    provenance: 'system-derived', actor: 'omvra', sourceRefs: [{ type: 'task-change', id: 'task-1@4' }],
  });
  assert.equal(invalid.error, 'INVALID_BASELINE_REVISION');
  assert.equal(invalidStore.get('entries').length, 0);
});

test('validation rejects unsupported, unsourced, future, and sensitive records', () => {
  const cases = [
    [{ kind: 'unknown', idempotencyKey: 'invalid-kind' }, 'INVALID_TASK_CONTEXT_KIND'],
    [{ fromRevision: 4, toRevision: 3, idempotencyKey: 'invalid-range' }, 'INVALID_TASK_CONTEXT_REVISION_RANGE'],
    [{ provenance: 'provider-authored', idempotencyKey: 'invalid-provenance' }, 'INVALID_TASK_CONTEXT_PROVENANCE'],
    [{ actor: ' ', idempotencyKey: 'invalid-actor' }, 'INVALID_TASK_CONTEXT_ACTOR'],
    [{ markers: 'ledger', idempotencyKey: 'invalid-markers' }, 'INVALID_TASK_CONTEXT_ENTRY'],
    [{ changedFields: 'notes', idempotencyKey: 'invalid-fields' }, 'INVALID_TASK_CONTEXT_ENTRY'],
    [{ sourceRefs: [], idempotencyKey: 'unsourced' }, 'TASK_CONTEXT_SOURCE_REQUIRED'],
    [{ sourceRefs: [{ type: 'message', id: 'message-1' }], idempotencyKey: 'invalid-source' }, 'INVALID_TASK_CONTEXT_SOURCE'],
    [{ toRevision: 5, idempotencyKey: 'future' }, 'INVALID_TASK_CONTEXT_REVISION_RANGE'],
    [{ rawPrompt: 'private', idempotencyKey: 'sensitive' }, 'TASK_CONTEXT_SENSITIVE_DATA_FORBIDDEN'],
    [{ task: { title: 'Full snapshot' }, idempotencyKey: 'snapshot' }, 'TASK_CONTEXT_SENSITIVE_DATA_FORBIDDEN'],
    [{ sourceRefs: [{ type: 'comment', id: 'comment-1', body: 'Raw source body' }], idempotencyKey: 'source-body' }, 'TASK_CONTEXT_SENSITIVE_DATA_FORBIDDEN'],
    [{ humanConfirmed: true, idempotencyKey: 'agent-authority' }, 'TASK_CONTEXT_AGENT_AUTHORITY_FORBIDDEN'],
  ];
  for (const [overrides, expectedError] of cases) {
    const { service, store } = createHarness();
    const result = appendDecision(service, store, overrides);
    assert.equal(result.error, expectedError);
    assert.equal(store.get('entries').length, 0);
  }
});

test('preflight projection is deduplicated, bounded to 12, and excludes source records', () => {
  const { service, store } = createHarness();
  const entries = Array.from({ length: 15 }, (_, index) => ({
    schemaVersion: 1,
    id: `entry-${index}`,
    taskId: 'task-1',
    kind: index === 6 ? 'context-checkpoint' : 'decision',
    fromRevision: Math.min(index, 4),
    toRevision: Math.min(index, 4),
    summary: `Context ${index}`,
    markers: ['history'],
    provenance: 'agent-authored',
    actor: 'agent-edgar',
    sourceRefs: [{ type: 'comment', id: `comment-${index}` }],
    createdAt: `2026-07-29T20:${String(index).padStart(2, '0')}:00.000Z`,
  }));
  store.set('entries', entries);

  const result = service.project(store, { taskId: 'task-1' });
  assert.equal(result.ok, true);
  assert.equal(result.taskContext.latestCheckpoint.id, 'entry-6');
  assert.equal(result.taskContext.entriesSinceCheckpoint.length, 8);
  assert.equal(result.taskContext.recentHistory.length, 3);
  assert.equal(result.taskContext.hasMore, true);
  const projected = [
    result.taskContext.latestCheckpoint,
    ...result.taskContext.entriesSinceCheckpoint,
    ...result.taskContext.recentHistory,
  ];
  assert.equal(new Set(projected.map(entry => entry.id)).size, 12);
  assert.ok(projected.every(entry => entry.sourceRefs === undefined));
});

test('exact retrieval reports resolved and missing task-scoped sources explicitly', () => {
  const store = new MemoryStore({
    tasks: [{ id: 'task-1', __mcpRevision: 4 }],
    entries: [{
      schemaVersion: 1, id: 'context-1', taskId: 'task-1', kind: 'decision', fromRevision: 4, toRevision: 4,
      summary: 'Use the task-scoped source resolver.', markers: ['source'], provenance: 'agent-authored',
      actor: 'agent-edgar', sourceRefs: [{ type: 'comment', id: 'comment-1' }, { type: 'comment', id: 'missing' }],
      createdAt: '2026-07-29T20:00:00.000Z',
    }],
  });
  const service = createTaskContextLedgerService({
    getTaskById: (current, taskId) => current.get('tasks').find(task => task.id === taskId) || null,
    readEntries: current => current.get('entries'),
    writeEntries: (current, entries) => current.set('entries', entries),
    normalizeString: value => typeof value === 'string' ? value.trim() : '',
    resolveSourceRef: (_current, _task, ref) => ref.id === 'comment-1' ? { id: ref.id, content: 'Exact source' } : null,
  });

  const result = service.get(store, { taskId: 'task-1', entryId: 'context-1' });
  assert.deepEqual(result.sources, [
    { ref: { type: 'comment', id: 'comment-1' }, status: 'resolved', record: { id: 'comment-1', content: 'Exact source' } },
    { ref: { type: 'comment', id: 'missing' }, status: 'missing' },
  ]);
});

test('workspace facade persists entries under the versioned ledger key', () => {
  const {
    appendTaskContextEntry,
    listTaskContextEntries,
  } = require('../services/workspace-service.cjs');
  const store = new MemoryStore({
    'omvra.tasks.v1': [{ id: 'task-1', title: 'Ledger task', status: 'open', __mcpRevision: 4 }],
  });
  const result = appendTaskContextEntry(store, {
    taskId: 'task-1', expectedRevision: 4, idempotencyKey: 'facade-1', kind: 'evidence',
    fromRevision: 4, toRevision: 4, summary: 'Focused tests passed.', markers: ['tests'],
    provenance: 'agent-authored', actor: 'agent-edgar', sourceRefs: [{ type: 'evidence', id: 'test-run-1' }],
  });

  assert.equal(result.ok, true);
  assert.equal(TASK_CONTEXT_ENTRIES_KEY, 'omvra.taskContextEntries.v1');
  assert.equal(store.get(TASK_CONTEXT_ENTRIES_KEY).length, 1);
  assert.equal(listTaskContextEntries(store, { taskId: 'task-1' }).entries.length, 1);
  assert.equal(store.get('omvra.tasks.v1')[0].__mcpRevision, 4);
});

test('archived tasks retain bounded context access and large ledgers are never truncated in storage', () => {
  const entries = Array.from({ length: 80 }, (_, index) => ({
    schemaVersion: 1, id: `archived-${index}`, taskId: 'task-1', kind: 'decision', fromRevision: 4, toRevision: 4,
    summary: `Archived decision ${index}`, markers: ['archive'], provenance: 'human-authored', actor: 'human-1',
    sourceRefs: [{ type: 'comment', id: `comment-${index}` }], createdAt: `2026-07-29T${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00.000Z`,
  }));
  const { service, store } = createHarness({ tasks: [{ id: 'task-1', archived: true, __mcpRevision: 4 }], entries });

  const listed = service.list(store, { taskId: 'task-1', limit: 500 });
  assert.equal(listed.ok, true);
  assert.equal(listed.entries.length, 50);
  assert.equal(listed.hasMore, true);
  assert.equal(service.get(store, { taskId: 'task-1', entryId: 'archived-0' }).ok, true);
  assert.equal(store.get('entries').length, 80);
});

test('invalid stored ledgers fail closed without fabricating or rewriting history', () => {
  const { service, store } = createHarness({ entries: { legacy: 'not-an-array' } });
  assert.equal(service.list(store, { taskId: 'task-1' }).error, 'INVALID_TASK_CONTEXT_STORE');
  assert.deepEqual(store.get('entries'), { legacy: 'not-an-array' });

  const valid = {
    schemaVersion: 1, id: 'duplicate', taskId: 'task-1', kind: 'decision', fromRevision: 4, toRevision: 4,
    summary: 'One known decision.', markers: ['history'], provenance: 'human-authored', actor: 'human-1',
    sourceRefs: [{ type: 'comment', id: 'comment-1' }], createdAt: '2026-07-29T20:00:00.000Z',
  };
  const duplicateHarness = createHarness({ entries: [valid, { ...valid }] });
  assert.equal(duplicateHarness.service.list(duplicateHarness.store, { taskId: 'task-1' }).error, 'DUPLICATE_TASK_CONTEXT_ENTRY_ID');
  assert.equal(duplicateHarness.store.get('entries').length, 2);
});
