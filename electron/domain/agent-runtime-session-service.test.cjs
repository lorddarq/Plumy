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

test('normalized events retain correlation and reported usage without private runtime payloads', () => {
  const { service, state } = harness();
  const binding = service.createBinding(null, { runtimeProfileId: 'runtime-1', scope, idempotencyKey: 'binding-1' }).binding;
  const usage = service.appendEvent(null, {
    bindingId: binding.id, runtimeProfileId: 'runtime-1', kind: 'usage', inputTokens: 0, outputTokens: 12, cost: 0,
    currency: 'USD', idempotencyKey: 'usage-1',
  });
  assert.equal(usage.ok, true);
  assert.deepEqual(usage.event.usage, { provenance: 'reported', inputTokens: 0, outputTokens: 12, cost: 0, currency: 'USD' });
  assert.equal(service.appendEvent(null, {
    bindingId: binding.id, runtimeProfileId: 'runtime-1', kind: 'message', prompt: 'private', idempotencyKey: 'private-1',
  }).error, 'ACP_EVENT_SENSITIVE_DATA_FORBIDDEN');
  assert.equal(JSON.stringify(state).includes('private'), false);
  assert.equal(service.appendEvent(null, {
    bindingId: binding.id, runtimeProfileId: 'runtime-1', kind: 'provider-new-event', idempotencyKey: 'unknown-1',
  }).event.type, 'unsupported-event');
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
  assert.equal(state.contextEntries[0].sessionBindingId, binding.id);
  assert.equal(service.appendDurableOutcome(null, { bindingId: binding.id, kind: 'status-change', summary: 'Done' }).error, 'INVALID_TASK_CONTEXT_KIND');
});
