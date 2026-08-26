const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentRuntimeSessionService } = require('./agent-runtime-session-service.cjs');

function harness(seed = {}) {
  const state = { bindings: [], events: [], ...seed };
  let ordinal = 0;
  const service = createAgentRuntimeSessionService({
    readBindings: () => {
      state.bindingReads = (state.bindingReads || 0) + 1;
      return state.bindings;
    },
    writeBindings: (_store, value) => { state.bindings = value; },
    readEvents: () => {
      state.eventReads = (state.eventReads || 0) + 1;
      return state.events;
    },
    writeEvents: (_store, value) => { state.events = value; },
    attachBindingToAttempt: (_store, binding) => {
      state.attachedBindingId = binding.id;
      return { ok: true };
    },
    appendTaskContext: (_store, value) => {
      state.contextEntries = [...(state.contextEntries || []), value];
      return { ok: true, entry: value };
    },
    normalizeString: value => typeof value === 'string' ? value.trim() : '',
    now: () => '2026-07-30T10:00:00.000Z',
    createId: prefix => `${prefix}-${++ordinal}`,
  });
  return { service, state };
}

const scope = { kind: 'task', taskId: 'task-1', contributionId: 'contribution-1', executionAttemptId: 'attempt-1', taskRevision: 4 };

test('session bindings are provider-neutral, revisioned, idempotent, and keep one active turn globally', () => {
  const { service, state } = harness();
  const first = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1', capabilities: [{ id: 'resume', support: 'supported' }], turn: { id: 'turn-1', state: 'queued' } });
  assert.equal(first.ok, true);
  assert.equal(first.binding.state, 'starting');
  assert.equal(first.binding.revision, 0);
  assert.equal(state.attachedBindingId, first.binding.id);
  assert.equal(service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1', capabilities: [{ id: 'resume', support: 'supported' }], turn: { id: 'turn-1', state: 'queued' } }).idempotent, true);
  assert.equal(service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-2' }).error, 'ACP_EXECUTION_ALREADY_ACTIVE');

  const ready = service.updateBinding(null, { bindingId: first.binding.id, expectedRevision: 0, state: 'ready', opaqueSessionRef: 'provider-session-1' });
  assert.equal(ready.binding.revision, 1);
  assert.equal(ready.binding.opaqueSessionRef, 'provider-session-1');
  assert.equal(service.updateBinding(null, { bindingId: first.binding.id, expectedRevision: 0, state: 'active' }).error, 'REVISION_MISMATCH');
  assert.equal(state.bindings.length, 1);
});

test('session lists can omit retained events without reading their store collection', () => {
  const { service, state } = harness({
    bindings: [{ id: 'binding-1', state: 'closed' }],
    events: [{ id: 'event-1', bindingId: 'binding-1' }],
  });

  const result = service.list(null, { limit: 100, includeEvents: false });

  assert.equal(result.ok, true);
  assert.equal(result.bindings.length, 1);
  assert.deepEqual(result.events, []);
  assert.equal(state.eventReads, undefined);
});

test('session lists read each retained collection once', () => {
  const { service, state } = harness({
    bindings: [{ id: 'binding-1', state: 'closed' }],
    events: [{ id: 'event-1', bindingId: 'binding-1' }],
  });

  const result = service.list(null, { limit: 100 });

  assert.equal(result.ok, true);
  assert.equal(state.bindingReads, 1);
  assert.equal(state.eventReads, 1);
});

test('a reusable ready session is idle capacity while an in-flight turn blocks task and Goal-node starts', () => {
  const { service } = harness();
  const first = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'task-binding' });
  const ready = service.updateBinding(null, { bindingId: first.binding.id, expectedRevision: 0, state: 'ready', opaqueSessionRef: 'session-1' });
  const second = service.createBinding(null, {
    runtimeProfileId: 'runtime-1',
    scope: { kind: 'goal-node', goalId: 'goal-1', goalElementId: 'node-1', goalExecutionId: 'execution-1', executionAttempt: 0, goalRevision: 1 },
    idempotencyKey: 'goal-binding',
  });
  assert.equal(first.ok, true);
  assert.equal(ready.ok, true);
  assert.equal(second.ok, true);
  const active = service.updateBinding(null, { bindingId: first.binding.id, expectedRevision: ready.binding.revision, turn: { id: 'turn-1', state: 'active' } });
  assert.equal(active.ok, true);
  const blocked = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'task-binding-2' });
  assert.equal(blocked.error, 'ACP_EXECUTION_ALREADY_ACTIVE');
  assert.equal(blocked.bindingId, first.binding.id);
});

test('a completed model turn cannot be resurrected and leaves its provider session ready', () => {
  const { service } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  const ready = service.updateBinding(null, { bindingId: binding.id, expectedRevision: 0, state: 'ready', opaqueSessionRef: 'session-1' }).binding;
  const active = service.updateBinding(null, { bindingId: binding.id, expectedRevision: ready.revision, turn: { id: 'turn-1', state: 'active' } }).binding;
  const idle = service.updateBinding(null, { bindingId: binding.id, expectedRevision: active.revision, turn: { id: 'turn-1', state: 'completed' } });
  assert.equal(idle.binding.state, 'ready');
  assert.equal(idle.binding.turn.state, 'completed');
  assert.equal(service.updateBinding(null, { bindingId: binding.id, expectedRevision: idle.binding.revision, turn: { id: 'turn-1', state: 'active' } }).error, 'INVALID_ACP_TURN_TRANSITION');
});

test('normalized events retain correlation and reported usage without private runtime payloads', () => {
  const { service, state } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  const usage = service.appendEvent(null, {
    bindingId: binding.id, runtimeProfileId: 'runtime-1', kind: 'usage', inputTokens: 0, outputTokens: 12, cost: 0,
    currency: 'USD', usageAggregation: 'cumulative', sourceProtocol: 'acp', nativeEventType: 'session/usage_update', idempotencyKey: 'usage-1',
  });
  assert.equal(usage.ok, true);
  assert.deepEqual(usage.event.usage, { provenance: 'provider-reported', optional: true, aggregation: 'cumulative', inputTokens: 0, outputTokens: 12, cost: 0, currency: 'USD' });
  assert.equal(usage.event.sourceProtocol, 'acp');
  assert.equal(usage.event.nativeEventType, 'session/usage_update');
  assert.equal(usage.event.executionAttemptId, 'attempt-1');
  assert.equal(usage.event.dispatchEligible, false);
  assert.equal(service.appendEvent(null, {
    bindingId: binding.id, runtimeProfileId: 'runtime-1', kind: 'message', prompt: 'private', idempotencyKey: 'private-1',
  }).error, 'ACP_EVENT_SENSITIVE_DATA_FORBIDDEN');
  assert.equal(JSON.stringify(state).includes('private'), false);
  assert.equal(service.appendEvent(null, {
    bindingId: binding.id, runtimeProfileId: 'runtime-1', kind: 'provider-new-event', idempotencyKey: 'unknown-1',
  }).event.type, 'unsupported-event');
});

test('normalized runtime failures keep a stable class and bounded provider detail', () => {
  const { service } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  const result = service.appendEvent(null, {
    bindingId: binding.id,
    runtimeProfileId: 'runtime-1',
    kind: 'turn',
    state: 'failed',
    outcome: 'ACP_RUNTIME_UNAVAILABLE',
    providerDetail: 'provider timed out with Authorization: Bearer secret-token at /private/workspace/file',
    idempotencyKey: 'failure-1',
  });
  assert.equal(result.ok, true);
  assert.equal(result.event.failureClass, 'internal');
  assert.match(result.event.providerDetail, /provider timed out/);
  assert.equal(result.event.providerDetail.includes('secret-token'), false);
  assert.equal(result.event.providerDetail.includes('/private/workspace/file'), false);
  assert.ok(result.event.providerDetail.length <= 240);
});

test('normalized message deltas preserve whitespace between streamed chunks', () => {
  const { service } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  const result = service.appendEvent(null, {
    bindingId: binding.id,
    runtimeProfileId: 'runtime-1',
    kind: 'message',
    nativeEventType: 'item/agentMessage/delta',
    messagePreview: 'Current implementation ',
    idempotencyKey: 'message-1',
  });
  assert.equal(result.ok, true);
  assert.equal(result.event.messagePreview, 'Current implementation ');
});

test('normalized message deltas retain normal-length agent output for supervision', () => {
  const { service } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  const output = `${'agent output '.repeat(200)}complete.`;
  const result = service.appendEvent(null, {
    bindingId: binding.id,
    runtimeProfileId: 'runtime-1',
    kind: 'message',
    nativeEventType: 'item/agentMessage/delta',
    messagePreview: output,
    idempotencyKey: 'message-long-1',
  });
  assert.equal(result.ok, true);
  assert.equal(result.event.messagePreview, output);
});

test('permission events persist only redacted runtime authority facts and native correlation', () => {
  const { service } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  const result = service.appendEvent(null, {
    bindingId: binding.id,
    runtimeProfileId: 'runtime-1',
    kind: 'permission',
    sourceProtocol: 'codex-app-server',
    nativeEventType: 'item/commandExecution/requestApproval',
    capabilityId: 'shell.execute',
    permissionState: 'requested',
    requestId: 'request-1',
    resourcePath: '/private/workspace/file',
    startedAt: '2026-07-30T09:59:59.900Z',
    finishedAt: '2026-07-30T10:00:00.000Z',
    idempotencyKey: 'permission-1',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.event.permission, { authority: 'runtime-provider', state: 'requested', capabilityId: 'shell.execute' });
  assert.equal(result.event.durationMs, 100);
  assert.equal(result.event.taskId, 'task-1');
  assert.equal(result.event.contributionId, 'contribution-1');
  assert.equal(JSON.stringify(result.event).includes('/private/workspace/file'), false);
  assert.equal(service.appendEvent(null, {
    bindingId: binding.id, runtimeProfileId: 'runtime-1', kind: 'permission', rawPrompt: 'private', idempotencyKey: 'permission-private',
  }).error, 'ACP_EVENT_SENSITIVE_DATA_FORBIDDEN');
});

test('usage preserves missing versus measured zero and ambiguous aggregation remains unknown', () => {
  const { service } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  const usage = service.appendEvent(null, {
    bindingId: binding.id, runtimeProfileId: 'runtime-1', kind: 'usage', inputTokens: null, outputTokens: 0,
    contextTokens: undefined, cost: '', idempotencyKey: 'usage-1',
  }).event.usage;
  assert.equal(usage.outputTokens, 0);
  assert.equal('inputTokens' in usage, false);
  assert.equal('contextTokens' in usage, false);
  assert.equal('cost' in usage, false);
  const governance = service.evaluateGovernance(null, { bindingId: binding.id, thresholds: { reportedTokens: 0, reportedCost: 0 } });
  assert.deepEqual(governance.unknown.map(item => item.dimension), ['reportedTokens', 'reportedCost']);
  assert.equal(governance.action, 'warn');
  assert.equal(governance.usage.providerBillGuaranteed, false);
});

test('governance returns bounded cancel pause and warning decisions without automatic retry', () => {
  const { service, state } = harness();
  const first = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  const secondScope = { ...scope, executionAttemptId: 'attempt-2' };
  state.bindings.push({ ...first, id: 'binding-2', idempotencyKey: 'binding-2', scope: secondScope });
  service.appendEvent(null, { bindingId: first.id, runtimeProfileId: 'runtime-1', kind: 'turn', idempotencyKey: 'turn-1' });
  service.appendEvent(null, { bindingId: first.id, runtimeProfileId: 'runtime-1', kind: 'turn', idempotencyKey: 'turn-2' });
  service.appendEvent(null, { bindingId: first.id, runtimeProfileId: 'runtime-1', kind: 'tool', idempotencyKey: 'tool-1' });
  service.appendEvent(null, {
    bindingId: first.id, runtimeProfileId: 'runtime-1', kind: 'usage', totalTokens: 120, cost: 0,
    usageAggregation: 'cumulative', observedAt: '2026-07-30T10:00:00.000Z', idempotencyKey: 'usage-1',
  });
  const result = service.evaluateGovernance(null, {
    bindingId: first.id,
    evaluatedAt: '2026-07-30T10:00:02.000Z',
    maxUsageAgeMs: 1_000,
    delayedUsageAction: 'pause',
    thresholds: {
      wallTimeMs: { limit: 1_000, action: 'cancel' },
      turns: 1,
      toolCalls: 1,
      concurrency: { limit: 1, action: 'cancel' },
      attempts: 1,
      reportedTokens: 100,
      reportedCost: 0,
    },
  });
  assert.equal(result.action, 'cancel');
  assert.deepEqual(result.metrics, { wallTimeMs: 2000, turns: 2, toolCalls: 1, concurrency: 2, attempts: 2, reportedTokens: 120, reportedCost: 0 });
  assert.equal(result.usage.delayed, true);
  assert.equal(result.automaticRetry, false);
  assert.equal(result.dispatchEligible, false);
  assert.equal(result.breaches.some(item => item.dimension === 'reportedTokens' && item.providerReported), true);
  assert.equal(result.breaches.some(item => item.dimension === 'reportedCost'), false);
});

test('invalid governance thresholds fail closed instead of becoming unbounded', () => {
  const { service } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  assert.equal(service.evaluateGovernance(null, { bindingId: binding.id, thresholds: { turns: -1 } }).error, 'INVALID_ACP_GOVERNANCE_POLICY');
  assert.equal(service.evaluateGovernance(null, { bindingId: binding.id, thresholds: { reportedBill: 10 } }).error, 'INVALID_ACP_GOVERNANCE_POLICY');
  assert.equal(service.evaluateGovernance(null, { bindingId: binding.id, thresholds: { turns: { limit: 1, action: 'retry' } } }).error, 'INVALID_ACP_GOVERNANCE_POLICY');
});

test('crash reconciliation preserves resumability while close and archive clear opaque references without task mutation', () => {
  const { service, state } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  service.updateBinding(null, { bindingId: binding.id, expectedRevision: 0, state: 'ready', opaqueSessionRef: 'resume-me' });
  service.updateBinding(null, { bindingId: binding.id, expectedRevision: 1, state: 'active' });
  assert.equal(service.reconcileInterrupted(null).changed, 1);
  assert.equal(state.bindings[0].state, 'interrupted');
  assert.equal(state.bindings[0].opaqueSessionRef, 'resume-me');
  assert.equal(service.prepareArchive(null, binding.id).changed, true);
  assert.equal(state.bindings[0].state, 'closed');
  assert.equal(state.bindings[0].opaqueSessionRef, undefined);
  assert.equal(state.bindings[0].scope.taskRevision, 4);
});

test('resuming an interrupted binding clears its stale terminal reason', () => {
  const { service, state } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  service.updateBinding(null, { bindingId: binding.id, expectedRevision: 0, state: 'ready', opaqueSessionRef: 'resume-me' });
  service.reconcileInterrupted(null);
  assert.equal(state.bindings[0].terminalReason, 'process-exit');
  const starting = service.updateBinding(null, { bindingId: binding.id, expectedRevision: 2, state: 'starting' });
  assert.equal(starting.ok, true);
  assert.equal(starting.binding.terminalReason, undefined);
});

test('binding and event reads are bounded and unknown stored fields survive updates', () => {
  const seedBinding = {
    schemaVersion: 1, id: 'binding-existing', idempotencyKey: 'existing', revision: 0, runtimeProfileId: 'runtime-1', scope,
    state: 'starting', capabilities: [], createdAt: '2026-07-30T09:00:00.000Z', updatedAt: '2026-07-30T09:00:00.000Z', lastObservedAt: '2026-07-30T09:00:00.000Z', extension: { retained: true },
  };
  const { service, state } = harness({ bindings: [seedBinding] });
  service.updateBinding(null, { bindingId: seedBinding.id, expectedRevision: 0, state: 'ready', opaqueSessionRef: 'session' });
  assert.deepEqual(state.bindings[0].extension, { retained: true });
  for (let index = 0; index < 120; index += 1) {
    service.appendEvent(null, { bindingId: seedBinding.id, runtimeProfileId: 'runtime-1', kind: 'turn', state: 'working', idempotencyKey: `event-${index}` });
  }
  const read = service.list(null, { bindingId: seedBinding.id, limit: 10 });
  assert.equal(read.events.length, 10);
  assert.equal(read.hasMore, true);
});

test('sustained runtime event storage retains only the latest 2000 events', () => {
  const seedBinding = {
    schemaVersion: 1, id: 'binding-retention', idempotencyKey: 'retention-binding', revision: 0, runtimeProfileId: 'runtime-1', scope,
    state: 'ready', capabilities: [], createdAt: '2026-07-30T09:00:00.000Z', updatedAt: '2026-07-30T09:00:00.000Z', lastObservedAt: '2026-07-30T09:00:00.000Z',
  };
  const { service, state } = harness({ bindings: [seedBinding] });

  for (let index = 0; index < 2_005; index += 1) {
    const result = service.appendEvent(null, {
      bindingId: seedBinding.id,
      runtimeProfileId: 'runtime-1',
      kind: 'turn',
      state: 'working',
      idempotencyKey: `retained-event-${index}`,
    });
    assert.equal(result.ok, true);
  }

  assert.equal(state.events.length, 2_000);
  assert.equal(state.events[0].idempotencyKey, 'retained-event-5');
  assert.equal(state.events.at(-1).idempotencyKey, 'retained-event-2004');
});

test('durable runtime outcomes use the task ledger boundary and cannot claim human provenance', () => {
  const { service, state } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  const result = service.appendDurableOutcome(null, {
    bindingId: binding.id, expectedRevision: 4, idempotencyKey: 'handoff-1', kind: 'handoff', fromRevision: 4, toRevision: 4,
    summary: 'The implementation is ready for review.', markers: ['handoff'], actor: 'agent-edgar', sourceRefs: [{ type: 'evidence', id: 'tests-1' }],
  });
  assert.equal(result.ok, true);
  assert.equal(state.contextEntries[0].provenance, 'agent-authored');
  assert.deepEqual(state.contextEntries[0].markers, ['handoff', 'native-runtime', 'dispatch-suppressed']);
  assert.equal(state.contextEntries[0].sessionBindingId, binding.id);
  assert.equal(service.appendDurableOutcome(null, { bindingId: binding.id, kind: 'status-change', summary: 'Done' }).error, 'INVALID_TASK_CONTEXT_KIND');
});
