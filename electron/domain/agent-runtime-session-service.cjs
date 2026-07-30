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
const RUNTIME_PROTOCOLS = new Set(['acp', 'codex-app-server', 'claude-stream-json', 'unknown']);
const PERMISSION_STATES = new Set(['requested', 'allowed', 'denied', 'cancelled', 'unknown']);
const GOVERNANCE_ACTIONS = new Set(['warn', 'pause', 'cancel']);
const GOVERNANCE_THRESHOLDS = {
  wallTimeMs: { defaultAction: 'cancel' },
  turns: { defaultAction: 'pause' },
  toolCalls: { defaultAction: 'pause' },
  concurrency: { defaultAction: 'pause' },
  attempts: { defaultAction: 'pause' },
  reportedTokens: { defaultAction: 'warn', providerReported: true },
  reportedCost: { defaultAction: 'warn', providerReported: true },
};

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

  function safeIdentifier(value, maxLength = 160) {
    const normalized = normalizeString(value);
    return normalized && normalized.length <= maxLength && /^[a-zA-Z0-9._:/-]+$/.test(normalized) ? normalized : '';
  }

  function finiteNonNegative(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function validTimestamp(value) {
    const normalized = normalizeString(value);
    return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : '';
  }

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
    const sourceKind = safeIdentifier(input.kind, 80);
    const type = kindMap[sourceKind] || 'unsupported-event';
    const observedAt = input.observedAt === undefined ? now() : validTimestamp(input.observedAt);
    const startedAt = input.startedAt === undefined ? '' : validTimestamp(input.startedAt);
    const finishedAt = input.finishedAt === undefined ? '' : validTimestamp(input.finishedAt);
    if (!observedAt || (input.startedAt !== undefined && !startedAt) || (input.finishedAt !== undefined && !finishedAt)) {
      return failure('INVALID_ACP_EVENT_TIMESTAMP', 'Runtime event timestamps must be valid ISO-compatible timestamps.');
    }
    if (startedAt && finishedAt && Date.parse(finishedAt) < Date.parse(startedAt)) {
      return failure('INVALID_ACP_EVENT_TIMESTAMP', 'finishedAt cannot precede startedAt.');
    }
    const sourceProtocol = RUNTIME_PROTOCOLS.has(input.sourceProtocol) ? input.sourceProtocol : 'unknown';
    const nativeEventType = safeIdentifier(input.nativeEventType || sourceKind, 160) || 'unknown';
    const capabilityId = safeIdentifier(input.capabilityId, 128);
    const eventId = input.id === undefined ? createId('acp-event') : safeIdentifier(input.id);
    if (!eventId) return failure('INVALID_ACP_EVENT', 'Runtime event id must be a bounded identifier.');
    const event = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id: eventId,
      bindingId: normalizeString(input.bindingId),
      runtimeProfileId: normalizeString(input.runtimeProfileId),
      type,
      sourceKind: sourceKind || 'unknown',
      sourceProtocol,
      nativeEventType,
      origin: 'native-runtime',
      dispatchEligible: false,
      observedAt,
      ...(startedAt ? { startedAt } : {}),
      ...(finishedAt ? { finishedAt } : {}),
      ...(startedAt && finishedAt ? { durationMs: Date.parse(finishedAt) - Date.parse(startedAt) } : {}),
      ...(safeIdentifier(input.state, 80) ? { state: safeIdentifier(input.state, 80) } : {}),
      ...(safeIdentifier(input.outcome, 80) ? { outcome: safeIdentifier(input.outcome, 80) } : {}),
      ...(safeIdentifier(input.requestId) ? { requestId: safeIdentifier(input.requestId) } : {}),
      ...(safeIdentifier(input.toolName) ? { toolName: safeIdentifier(input.toolName) } : {}),
      ...(capabilityId ? { capabilityId } : {}),
    };
    if (!event.bindingId || !event.runtimeProfileId) return failure('INVALID_ACP_EVENT', 'bindingId and runtimeProfileId are required.');
    if (sourceKind === 'permission') {
      event.permission = {
        authority: 'runtime-provider',
        state: PERMISSION_STATES.has(input.permissionState) ? input.permissionState : 'unknown',
        ...(capabilityId ? { capabilityId } : {}),
      };
    }
    if (sourceKind === 'usage') {
      event.usage = {
        provenance: 'provider-reported',
        optional: true,
        aggregation: ['cumulative', 'delta'].includes(input.usageAggregation) ? input.usageAggregation : 'unknown',
      };
      for (const field of ['inputTokens', 'outputTokens', 'totalTokens', 'contextTokens', 'cost']) {
        const value = finiteNonNegative(input[field]);
        if (value !== null) event.usage[field] = value;
      }
      if (safeIdentifier(input.currency, 16)) event.usage.currency = safeIdentifier(input.currency, 16);
    }
    return { ok: true, event };
  }

  function correlateEvent(event, binding) {
    const scope = binding.scope || {};
    return {
      ...event,
      ...(scope.kind === 'task' ? {
        workScope: 'task',
        taskId: scope.taskId,
        ...(scope.contributionId ? { contributionId: scope.contributionId } : {}),
        executionAttemptId: scope.executionAttemptId,
        sourceRevision: scope.taskRevision,
      } : {
        workScope: 'goal-node',
        goalId: scope.goalId,
        goalElementId: scope.goalElementId,
        goalExecutionId: scope.goalExecutionId,
        executionAttempt: scope.executionAttempt,
        sourceRevision: scope.goalRevision,
      }),
    };
  }

  function normalizeThreshold(value, definition) {
    const limit = finiteNonNegative(typeof value === 'object' && value !== null ? value.limit : value);
    if (limit === null) return failure('INVALID_ACP_GOVERNANCE_POLICY', 'Governance thresholds require a non-negative numeric limit.');
    const requestedAction = typeof value === 'object' && value !== null ? value.action : undefined;
    if (requestedAction !== undefined && !GOVERNANCE_ACTIONS.has(requestedAction)) {
      return failure('INVALID_ACP_GOVERNANCE_POLICY', `Unsupported governance action "${requestedAction}".`);
    }
    const action = GOVERNANCE_ACTIONS.has(requestedAction) ? requestedAction : definition.defaultAction;
    return { ok: true, threshold: { limit, action, providerReported: definition.providerReported === true } };
  }

  function sameWorkScope(left, right) {
    if (left?.kind !== right?.kind) return false;
    if (left.kind === 'task') return left.taskId === right.taskId && (left.contributionId || null) === (right.contributionId || null);
    return left.goalId === right.goalId && left.goalElementId === right.goalElementId;
  }

  function reportedTokenValue(usage) {
    const total = finiteNonNegative(usage?.totalTokens);
    if (total !== null) return total;
    const input = finiteNonNegative(usage?.inputTokens);
    const output = finiteNonNegative(usage?.outputTokens);
    return input === null && output === null ? null : (input ?? 0) + (output ?? 0);
  }

  function evaluateGovernance(store, input = {}) {
    const bindingId = normalizeString(input.bindingId);
    const bindings = Array.isArray(readBindings(store)) ? readBindings(store) : [];
    const binding = bindings.find(item => item.id === bindingId);
    if (!binding) return failure('ACP_SESSION_NOT_FOUND', 'Session binding was not found.');
    const events = (Array.isArray(readEvents(store)) ? readEvents(store) : []).filter(item => item.bindingId === bindingId);
    const evaluatedAt = input.evaluatedAt === undefined ? now() : validTimestamp(input.evaluatedAt);
    if (!evaluatedAt) return failure('INVALID_ACP_GOVERNANCE_POLICY', 'evaluatedAt must be a valid timestamp.');
    const latestUsage = [...events].reverse().find(event => event.type === 'usage-reported');
    const usageEvents = events.filter(event => event.type === 'usage-reported');
    const usageAggregation = latestUsage?.usage?.aggregation || 'unknown';
    const tokenValue = usageAggregation === 'cumulative'
      ? reportedTokenValue(latestUsage?.usage)
      : usageAggregation === 'delta' && usageEvents.every(event => reportedTokenValue(event.usage) !== null)
        ? usageEvents.reduce((total, event) => total + reportedTokenValue(event.usage), 0)
        : null;
    const costValue = usageAggregation === 'cumulative'
      ? finiteNonNegative(latestUsage?.usage?.cost)
      : usageAggregation === 'delta' && usageEvents.every(event => finiteNonNegative(event.usage?.cost) !== null)
        ? usageEvents.reduce((total, event) => total + finiteNonNegative(event.usage.cost), 0)
        : null;
    const metrics = {
      wallTimeMs: Number.isNaN(Date.parse(binding.createdAt)) ? null : Math.max(0, Date.parse(evaluatedAt) - Date.parse(binding.createdAt)),
      turns: events.filter(event => event.type === 'turn-state').length,
      toolCalls: events.filter(event => event.type === 'tool-state').length,
      concurrency: bindings.filter(item => ACTIVE_STATES.has(item.state)).length,
      attempts: bindings.filter(item => sameWorkScope(item.scope, binding.scope)).length,
      reportedTokens: tokenValue,
      reportedCost: costValue,
    };
    if (input.thresholds !== undefined && (!input.thresholds || typeof input.thresholds !== 'object' || Array.isArray(input.thresholds))) {
      return failure('INVALID_ACP_GOVERNANCE_POLICY', 'thresholds must be an object.');
    }
    const unknownThreshold = Object.keys(input.thresholds || {}).find(dimension => !GOVERNANCE_THRESHOLDS[dimension]);
    if (unknownThreshold) return failure('INVALID_ACP_GOVERNANCE_POLICY', `Unsupported governance threshold "${unknownThreshold}".`);
    const thresholds = {};
    for (const [dimension, value] of Object.entries(input.thresholds || {})) {
      const normalized = normalizeThreshold(value, GOVERNANCE_THRESHOLDS[dimension]);
      if (!normalized.ok) return normalized;
      thresholds[dimension] = normalized.threshold;
    }
    const breaches = [];
    const unknown = [];
    for (const [dimension, threshold] of Object.entries(thresholds)) {
      const value = metrics[dimension];
      if (value === null) {
        unknown.push({ dimension, reason: 'missing-or-ambiguous-provider-report' });
      } else if (value > threshold.limit) {
        breaches.push({ dimension, value, limit: threshold.limit, action: threshold.action, providerReported: threshold.providerReported });
      }
    }
    const latestUsageAt = latestUsage ? Date.parse(latestUsage.observedAt) : null;
    const maxUsageAgeMs = finiteNonNegative(input.maxUsageAgeMs);
    if (input.maxUsageAgeMs !== undefined && maxUsageAgeMs === null) {
      return failure('INVALID_ACP_GOVERNANCE_POLICY', 'maxUsageAgeMs must be a non-negative number.');
    }
    const usageDelayed = latestUsageAt !== null && maxUsageAgeMs !== null && Date.parse(evaluatedAt) - latestUsageAt > maxUsageAgeMs;
    if (input.missingUsageAction !== undefined && !['warn', 'pause'].includes(input.missingUsageAction)) {
      return failure('INVALID_ACP_GOVERNANCE_POLICY', 'missingUsageAction must be warn or pause.');
    }
    if (input.delayedUsageAction !== undefined && !['warn', 'pause'].includes(input.delayedUsageAction)) {
      return failure('INVALID_ACP_GOVERNANCE_POLICY', 'delayedUsageAction must be warn or pause.');
    }
    const missingUsageAction = ['warn', 'pause'].includes(input.missingUsageAction) ? input.missingUsageAction : 'warn';
    const delayedUsageAction = ['warn', 'pause'].includes(input.delayedUsageAction) ? input.delayedUsageAction : 'warn';
    if (unknown.length) breaches.push({ dimension: 'providerUsage', action: missingUsageAction, reason: 'missing-or-ambiguous' });
    if (usageDelayed) breaches.push({ dimension: 'providerUsage', action: delayedUsageAction, reason: 'delayed' });
    const actions = ['cancel', 'pause', 'warn'];
    const action = actions.find(candidate => breaches.some(breach => breach.action === candidate)) || 'allow';
    return {
      ok: true,
      bindingId,
      evaluatedAt,
      metrics,
      thresholds,
      unknown,
      usage: {
        available: Boolean(latestUsage),
        aggregation: usageAggregation,
        delayed: usageDelayed,
        providerReported: true,
        providerBillGuaranteed: false,
      },
      breaches,
      action,
      automaticRetry: false,
      dispatchEligible: false,
    };
  }

  function appendEvent(store, input = {}) {
    const normalized = normalizeEvent(input);
    if (!normalized.ok) return normalized;
    const bindings = Array.isArray(readBindings(store)) ? readBindings(store) : [];
    const binding = bindings.find(item => item.id === normalized.event.bindingId);
    if (!binding || binding.runtimeProfileId !== normalized.event.runtimeProfileId) return failure('ACP_SESSION_NOT_FOUND', 'The event does not match a known session binding.');
    const events = Array.isArray(readEvents(store)) ? readEvents(store) : [];
    const idempotencyKey = safeIdentifier(input.idempotencyKey);
    if (!idempotencyKey) return failure('IDEMPOTENCY_KEY_REQUIRED', 'idempotencyKey is required.');
    const existing = events.find(item => item.bindingId === binding.id && item.idempotencyKey === idempotencyKey);
    if (existing) {
      if (existing.type !== normalized.event.type || existing.sourceKind !== normalized.event.sourceKind) return failure('IDEMPOTENCY_CONFLICT', 'idempotencyKey was already used for a different runtime event.');
      return { ok: true, idempotent: true, event: clone(existing) };
    }
    const event = { ...correlateEvent(normalized.event, binding), idempotencyKey };
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
      markers: [...new Set([...(Array.isArray(input.markers) ? input.markers : []), 'native-runtime', 'dispatch-suppressed'])],
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

  return { appendDurableOutcome, appendEvent, createBinding, evaluateGovernance, list, normalizeEvent, prepareArchive, reconcileInterrupted, updateBinding };
}

module.exports = {
  ACTIVE_STATES,
  SESSION_BINDINGS_KEY,
  SESSION_EVENTS_KEY,
  SESSION_SCHEMA_VERSION,
  createAgentRuntimeSessionService,
};
