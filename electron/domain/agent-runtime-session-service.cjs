const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const SESSION_BINDINGS_KEY = 'omvra.acpSessionBindings.v1';
const SESSION_EVENTS_KEY = 'omvra.acpSessionEvents.v1';
const SESSION_SCHEMA_VERSION = 1;
const ACTIVE_STATES = new Set(['starting', 'ready', 'active', 'needs-input', 'cancelling']);
const SESSION_STATES = new Set([...ACTIVE_STATES, 'interrupted', 'closed', 'failed']);
const TERMINAL_REASONS = new Set(['closed', 'cancelled', 'process-exit', 'runtime-missing', 'protocol-error']);
const STATE_TRANSITIONS = new Map([
  ['starting', new Set(['ready', 'interrupted', 'closed', 'failed'])],
  ['ready', new Set(['active', 'needs-input', 'cancelling', 'interrupted', 'closed', 'failed'])],
  ['active', new Set(['needs-input', 'cancelling', 'interrupted', 'closed', 'failed'])],
  ['needs-input', new Set(['active', 'cancelling', 'interrupted', 'closed', 'failed'])],
  ['cancelling', new Set(['interrupted', 'closed', 'failed'])],
  ['interrupted', new Set(['starting', 'closed', 'failed'])],
  ['closed', new Set()],
  ['failed', new Set()],
]);
const MAX_EVENTS = 2_000;
const MAX_READ_LIMIT = 100;
const FORBIDDEN_KEYS = new Set(['authorization', 'body', 'chainOfThought', 'cookie', 'credential', 'evidenceBody', 'hiddenReasoning', 'messages', 'opaqueSessionRef', 'password', 'prompt', 'rawPrompt', 'response', 'secret', 'token', 'toolPayload', 'toolResponse', 'transcript']);

function createAgentRuntimeSessionService({
  readBindings,
  writeBindings,
  readEvents,
  writeEvents,
  attachBindingToAttempt,
  appendTaskContext,
  normalizeString,
  now = () => new Date().toISOString(),
  createId = prefix => `${prefix}-${randomUUID()}`,
}) {
  const required = { readBindings, writeBindings, readEvents, writeEvents, attachBindingToAttempt, appendTaskContext, normalizeString, now, createId };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== 'function') throw new TypeError(`createAgentRuntimeSessionService requires ${name}.`);
  }

  const failure = (error, message, details = {}) => ({ ok: false, error, message, ...details });
  const clone = value => JSON.parse(JSON.stringify(value));

  function forbiddenPath(value, path = 'value') {
    if (!value || typeof value !== 'object') return null;
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key) || /(?:api[-_]?key|access[-_]?token|auth[-_]?token|password|secret)/i.test(key)) return `${path}.${key}`;
      const nested = forbiddenPath(child, `${path}.${key}`);
      if (nested) return nested;
    }
    return null;
  }

  function normalizeCapabilities(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 50).map((item) => {
      const id = normalizeString(item?.id).slice(0, 128);
      const support = ['supported', 'unsupported', 'unknown'].includes(item?.support) ? item.support : 'unknown';
      return { id, support, ...(normalizeString(item?.version) ? { version: normalizeString(item.version).slice(0, 64) } : {}) };
    }).filter(item => item.id);
  }

  function normalizeScope(scope) {
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null;
    if (scope.kind === 'task') {
      const taskId = normalizeString(scope.taskId);
      const executionAttemptId = normalizeString(scope.executionAttemptId);
      const taskRevision = Number(scope.taskRevision);
      if (!taskId || !executionAttemptId || !Number.isInteger(taskRevision) || taskRevision < 0) return null;
      return {
        kind: 'task', taskId,
        ...(normalizeString(scope.contributionId) ? { contributionId: normalizeString(scope.contributionId) } : {}),
        executionAttemptId, taskRevision,
      };
    }
    if (scope.kind === 'goal-node') {
      const fields = ['goalId', 'goalElementId', 'goalExecutionId'];
      if (fields.some(field => !normalizeString(scope[field]))) return null;
      const executionAttempt = Number(scope.executionAttempt);
      const goalRevision = Number(scope.goalRevision);
      if (!Number.isInteger(executionAttempt) || executionAttempt < 0 || !Number.isInteger(goalRevision) || goalRevision < 0) return null;
      return { kind: 'goal-node', ...Object.fromEntries(fields.map(field => [field, normalizeString(scope[field])])), executionAttempt, goalRevision };
    }
    return null;
  }

  function createBinding(store, input = {}) {
    const sensitive = forbiddenPath(input);
    if (sensitive) return failure('ACP_SESSION_SENSITIVE_DATA_FORBIDDEN', `${sensitive} cannot be stored in a session binding.`);
    const runtimeProfileId = normalizeString(input.runtimeProfileId);
    const idempotencyKey = normalizeString(input.idempotencyKey).slice(0, 160);
    const scope = normalizeScope(input.scope);
    if (!runtimeProfileId) return failure('ACP_RUNTIME_NOT_CONFIGURED', 'runtimeProfileId is required.');
    if (!scope) return failure('INVALID_ACP_WORK_SCOPE', 'A valid task or Goal-node execution scope is required.');
    if (!idempotencyKey) return failure('IDEMPOTENCY_KEY_REQUIRED', 'idempotencyKey is required.');
    const bindings = Array.isArray(readBindings(store)) ? readBindings(store) : [];
    const existing = bindings.find(item => item.idempotencyKey === idempotencyKey);
    const identity = { runtimeProfileId, scope };
    if (existing) {
      if (!isDeepStrictEqual({ runtimeProfileId: existing.runtimeProfileId, scope: existing.scope }, identity)) {
        return failure('IDEMPOTENCY_CONFLICT', 'idempotencyKey was already used for a different session binding.');
      }
      const attached = attachBindingToAttempt(store, existing);
      if (!attached.ok) return { ...attached, binding: clone(existing), reconciliationRequired: true };
      return { ok: true, idempotent: true, binding: clone(existing) };
    }
    const active = bindings.find(item => item.scope?.executionAttemptId === scope.executionAttemptId && ACTIVE_STATES.has(item.state));
    if (active) return failure('ACP_EXECUTION_ALREADY_ACTIVE', 'This execution attempt already has an active session binding.', { bindingId: active.id });
    const timestamp = now();
    const binding = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id: createId('acp-binding'),
      idempotencyKey,
      revision: 0,
      runtimeProfileId,
      scope,
      state: 'starting',
      capabilities: normalizeCapabilities(input.capabilities),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastObservedAt: timestamp,
      ...(normalizeString(input.mcpGrantId) ? { mcpGrantId: normalizeString(input.mcpGrantId) } : {}),
      ...Object.fromEntries(Object.entries(input.extensions || {}).filter(([key]) => ![
        'schemaVersion', 'id', 'idempotencyKey', 'revision', 'runtimeProfileId', 'scope', 'state', 'capabilities',
        'createdAt', 'updatedAt', 'lastObservedAt', 'mcpGrantId', 'opaqueSessionRef', 'terminalReason', 'closedAt',
      ].includes(key))),
    };
    writeBindings(store, bindings.concat(binding));
    const attached = attachBindingToAttempt(store, binding);
    if (!attached.ok) return { ...attached, binding: clone(binding), reconciliationRequired: true };
    return { ok: true, idempotent: false, binding: clone(binding) };
  }

  function updateBinding(store, input = {}) {
    const bindingId = normalizeString(input.bindingId);
    const expectedRevision = Number(input.expectedRevision);
    const bindings = Array.isArray(readBindings(store)) ? readBindings(store) : [];
    const binding = bindings.find(item => item.id === bindingId);
    if (!binding) return failure('ACP_SESSION_NOT_FOUND', `Session binding "${bindingId}" was not found.`);
    if (!Number.isInteger(expectedRevision)) return failure('EXPECTED_REVISION_REQUIRED', 'expectedRevision is required.');
    if (binding.revision !== expectedRevision) return failure('REVISION_MISMATCH', 'Session binding revision mismatch.', { currentRevision: binding.revision });
    const state = normalizeString(input.state) || binding.state;
    if (!SESSION_STATES.has(state)) return failure('INVALID_ACP_SESSION_STATE', `Unsupported session state "${state}".`);
    if (state !== binding.state && !STATE_TRANSITIONS.get(binding.state)?.has(state)) {
      return failure('INVALID_ACP_SESSION_TRANSITION', `Session state cannot move from ${binding.state} to ${state}.`);
    }
    const opaqueSessionRef = input.opaqueSessionRef === undefined ? binding.opaqueSessionRef : normalizeString(input.opaqueSessionRef);
    if (ACTIVE_STATES.has(state) && state !== 'starting' && !opaqueSessionRef) return failure('ACP_SESSION_NOT_FOUND', 'Active and resumable bindings require an opaque session reference.');
    const terminalReason = input.terminalReason === undefined ? binding.terminalReason : normalizeString(input.terminalReason);
    if (terminalReason && !TERMINAL_REASONS.has(terminalReason)) return failure('INVALID_ACP_TERMINAL_REASON', 'terminalReason is invalid.');
    const terminal = ['closed', 'failed'].includes(state);
    const timestamp = now();
    const next = {
      ...binding,
      revision: binding.revision + 1,
      state,
      capabilities: input.capabilities === undefined ? binding.capabilities : normalizeCapabilities(input.capabilities),
      updatedAt: timestamp,
      lastObservedAt: timestamp,
      ...(terminalReason ? { terminalReason } : {}),
      ...(terminal ? { closedAt: timestamp } : {}),
    };
    if (opaqueSessionRef && !terminal) next.opaqueSessionRef = opaqueSessionRef;
    else delete next.opaqueSessionRef;
    writeBindings(store, bindings.map(item => item.id === bindingId ? next : item));
    return { ok: true, binding: clone(next) };
  }

  function normalizeEvent(input = {}) {
    const sensitive = forbiddenPath(input);
    if (sensitive) return failure('ACP_EVENT_SENSITIVE_DATA_FORBIDDEN', `${sensitive} cannot be stored in normalized runtime events.`);
    const kindMap = {
      session: 'session-state', turn: 'turn-state', plan: 'plan-update', message: 'message-observed', tool: 'tool-state',
      permission: 'permission-request', input: 'input-request', elicitation: 'input-request', usage: 'usage-reported', cancellation: 'cancellation-state', close: 'session-closed', closure: 'session-closed',
    };
    const sourceKind = normalizeString(input.kind);
    const type = kindMap[sourceKind] || 'unsupported-event';
    const event = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id: normalizeString(input.id) || createId('acp-event'),
      bindingId: normalizeString(input.bindingId),
      runtimeProfileId: normalizeString(input.runtimeProfileId),
      type,
      sourceKind: sourceKind || 'unknown',
      observedAt: normalizeString(input.observedAt) || now(),
      ...(normalizeString(input.state) ? { state: normalizeString(input.state).slice(0, 80) } : {}),
      ...(normalizeString(input.outcome) ? { outcome: normalizeString(input.outcome).slice(0, 80) } : {}),
      ...(normalizeString(input.requestId) ? { requestId: normalizeString(input.requestId).slice(0, 160) } : {}),
      ...(normalizeString(input.toolName) ? { toolName: normalizeString(input.toolName).slice(0, 160) } : {}),
    };
    if (!event.bindingId || !event.runtimeProfileId) return failure('INVALID_ACP_EVENT', 'bindingId and runtimeProfileId are required.');
    if (sourceKind === 'usage') {
      event.usage = { provenance: 'reported' };
      for (const field of ['inputTokens', 'outputTokens', 'contextTokens', 'cost']) {
        if (Number.isFinite(Number(input[field]))) event.usage[field] = Number(input[field]);
      }
      if (normalizeString(input.currency)) event.usage.currency = normalizeString(input.currency).slice(0, 16);
    }
    return { ok: true, event };
  }

  function appendEvent(store, input = {}) {
    const normalized = normalizeEvent(input);
    if (!normalized.ok) return normalized;
    const bindings = Array.isArray(readBindings(store)) ? readBindings(store) : [];
    const binding = bindings.find(item => item.id === normalized.event.bindingId);
    if (!binding || binding.runtimeProfileId !== normalized.event.runtimeProfileId) return failure('ACP_SESSION_NOT_FOUND', 'The event does not match a known session binding.');
    const events = Array.isArray(readEvents(store)) ? readEvents(store) : [];
    const idempotencyKey = normalizeString(input.idempotencyKey).slice(0, 160);
    if (!idempotencyKey) return failure('IDEMPOTENCY_KEY_REQUIRED', 'idempotencyKey is required.');
    const existing = events.find(item => item.bindingId === binding.id && item.idempotencyKey === idempotencyKey);
    if (existing) {
      if (existing.type !== normalized.event.type || existing.sourceKind !== normalized.event.sourceKind) return failure('IDEMPOTENCY_CONFLICT', 'idempotencyKey was already used for a different runtime event.');
      return { ok: true, idempotent: true, event: clone(existing) };
    }
    const event = { ...normalized.event, idempotencyKey };
    writeEvents(store, events.concat(event).slice(-MAX_EVENTS));
    return { ok: true, idempotent: false, event: clone(event) };
  }

  function list(store, input = {}) {
    const bindingId = normalizeString(input.bindingId);
    const limit = Number.isFinite(Number(input.limit)) ? Math.max(1, Math.min(MAX_READ_LIMIT, Math.floor(Number(input.limit)))) : 50;
    const bindings = (Array.isArray(readBindings(store)) ? readBindings(store) : []).filter(item => !bindingId || item.id === bindingId);
    const bindingIds = new Set(bindings.map(item => item.id));
    const events = (Array.isArray(readEvents(store)) ? readEvents(store) : []).filter(item => bindingIds.has(item.bindingId));
    return { ok: true, bindings: clone(bindings.slice(-limit)), events: clone(events.slice(-limit)), hasMore: bindings.length > limit || events.length > limit };
  }

  function appendDurableOutcome(store, input = {}) {
    const sensitive = forbiddenPath(input);
    if (sensitive) return failure('ACP_SESSION_SENSITIVE_DATA_FORBIDDEN', `${sensitive} cannot be stored as a durable outcome.`);
    const bindingId = normalizeString(input.bindingId);
    const binding = (Array.isArray(readBindings(store)) ? readBindings(store) : []).find(item => item.id === bindingId);
    if (!binding) return failure('ACP_SESSION_NOT_FOUND', 'Session binding was not found.');
    if (binding.scope?.kind !== 'task') return failure('ACP_CAPABILITY_UNSUPPORTED', 'Task context outcomes require a task-scoped session binding.');
    const kind = normalizeString(input.kind);
    if (!['decision', 'blocker', 'evidence', 'handoff', 'context-checkpoint'].includes(kind)) {
      return failure('INVALID_TASK_CONTEXT_KIND', 'Runtime outcomes must be a decision, blocker, evidence, handoff, or context checkpoint.');
    }
    return appendTaskContext(store, {
      taskId: binding.scope.taskId,
      expectedRevision: input.expectedRevision,
      idempotencyKey: normalizeString(input.idempotencyKey),
      kind,
      fromRevision: input.fromRevision,
      toRevision: input.toRevision,
      summary: normalizeString(input.summary),
      markers: input.markers,
      changedFields: input.changedFields,
      provenance: 'agent-authored',
      actor: normalizeString(input.actor),
      sourceRefs: input.sourceRefs,
      sessionBindingId: binding.id,
      executionAttemptId: binding.scope.executionAttemptId,
    });
  }

  function reconcileInterrupted(store) {
    const bindings = Array.isArray(readBindings(store)) ? readBindings(store) : [];
    const timestamp = now();
    let changed = 0;
    const next = bindings.map((binding) => {
      if (!ACTIVE_STATES.has(binding.state)) return binding;
      changed += 1;
      return { ...binding, revision: Number(binding.revision || 0) + 1, state: 'interrupted', terminalReason: 'process-exit', updatedAt: timestamp, lastObservedAt: timestamp };
    });
    if (changed) writeBindings(store, next);
    return { ok: true, changed };
  }

  function prepareArchive(store, bindingId) {
    const binding = (Array.isArray(readBindings(store)) ? readBindings(store) : []).find(item => item.id === normalizeString(bindingId));
    if (!binding) return failure('ACP_SESSION_NOT_FOUND', 'Session binding was not found.');
    if (ACTIVE_STATES.has(binding.state)) return failure('ACP_SESSION_ACTIVE', 'Close or cancel the active session before archiving its work.');
    if (!binding.opaqueSessionRef) return { ok: true, binding: clone(binding), changed: false };
    const result = updateBinding(store, { bindingId: binding.id, expectedRevision: binding.revision, state: 'closed', terminalReason: 'closed', opaqueSessionRef: '' });
    return result.ok ? { ...result, changed: true } : result;
  }

  return { appendDurableOutcome, appendEvent, createBinding, list, normalizeEvent, prepareArchive, reconcileInterrupted, updateBinding };
}

module.exports = {
  ACTIVE_STATES,
  SESSION_BINDINGS_KEY,
  SESSION_EVENTS_KEY,
  SESSION_SCHEMA_VERSION,
  createAgentRuntimeSessionService,
};
