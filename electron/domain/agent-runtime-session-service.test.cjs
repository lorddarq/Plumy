const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentRuntimeSessionService } = require('./agent-runtime-session-service.cjs');

function harness(seed = {}) {
  const state = { bindings: [], events: [], ...seed };
  let ordinal = 0;
  const service = createAgentRuntimeSessionService({
    readBindings: () => state.bindings,
    writeBindings: (_store, value) => { state.bindings = value; },
    readEvents: () => state.events,
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

test('session bindings are provider-neutral, revisioned, idempotent, and keep one active binding per attempt', () => {
  const { service, state } = harness();
  const first = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1', capabilities: [{ id: 'resume', support: 'supported' }] });
  assert.equal(first.ok, true);
  assert.equal(first.binding.state, 'starting');
  assert.equal(first.binding.revision, 0);
  assert.equal(state.attachedBindingId, first.binding.id);
  assert.equal(service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1', capabilities: [{ id: 'resume', support: 'supported' }] }).idempotent, true);
  assert.equal(service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-2' }).error, 'ACP_EXECUTION_ALREADY_ACTIVE');

  const ready = service.updateBinding(null, { bindingId: first.binding.id, expectedRevision: 0, state: 'ready', opaqueSessionRef: 'provider-session-1' });
  assert.equal(ready.binding.revision, 1);
  assert.equal(ready.binding.opaqueSessionRef, 'provider-session-1');
  assert.equal(service.updateBinding(null, { bindingId: first.binding.id, expectedRevision: 0, state: 'active' }).error, 'REVISION_MISMATCH');
  assert.equal(state.bindings.length, 1);
});

test('a completed model turn returns an active session to ready', () => {
  const { service } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  const ready = service.updateBinding(null, { bindingId: binding.id, expectedRevision: 0, state: 'ready', opaqueSessionRef: 'session-1' }).binding;
  const active = service.updateBinding(null, { bindingId: binding.id, expectedRevision: ready.revision, state: 'active' }).binding;
  const idle = service.updateBinding(null, { bindingId: binding.id, expectedRevision: active.revision, state: 'ready' });
  assert.equal(idle.ok, true);
  assert.equal(idle.binding.state, 'ready');
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
  const { service } = harness();
  const first = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  const secondScope = { ...scope, executionAttemptId: 'attempt-2' };
  service.createBinding(null, { runtimeProfileId: 'runtime-1', scope: secondScope, idempotencyKey: 'binding-2' });
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
