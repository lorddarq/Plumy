const { randomUUID } = require('node:crypto');
const { createNativeRuntimeClient } = require('./agent-runtime-protocol-client.cjs');

const ACTIVE_STATES = new Set(['starting', 'ready', 'active', 'needs-input', 'cancelling']);

function createAgentRuntimeSessionRunner({
  store,
  resolveProfile,
  confirmStart,
  transitionContribution,
  createBinding,
  updateBinding,
  appendEvent,
  listSessions,
  now = () => new Date().toISOString(),
}) {
  const clients = new Map();

  const failure = (error, message, details = {}) => ({ ok: false, error, message, ...details });

  function bindingFor(id) {
    const result = listSessions(store, { bindingId: id, limit: 1 });
    return result?.bindings?.[0] || null;
  }

  function recordNotification(binding, message) {
    const method = typeof message?.method === 'string' ? message.method : 'runtime/notification';
    const lower = method.toLowerCase();
    const kind = lower.includes('permission') ? 'permission'
      : lower.includes('input') || lower.includes('elicitation') ? 'input'
        : lower.includes('usage') || lower.includes('cost') ? 'usage'
          : lower.includes('tool') ? 'tool'
            : lower.includes('plan') ? 'plan'
              : lower.includes('turn') || lower.includes('prompt') ? 'turn'
                : 'session';
    const params = message?.params || {};
    return appendEvent(store, {
      bindingId: binding.id,
      runtimeProfileId: binding.runtimeProfileId,
      kind,
      nativeEventType: method,
      state: params.state || params.status,
      outcome: params.outcome,
      requestId: message?.id || params.requestId,
      toolName: params.toolName || params.tool?.name,
      capabilityId: params.capabilityId,
      permissionState: params.permissionState || params.state,
      usageAggregation: params.usage?.aggregation,
      inputTokens: params.usage?.inputTokens,
      outputTokens: params.usage?.outputTokens,
      totalTokens: params.usage?.totalTokens,
      contextTokens: params.usage?.contextTokens,
      cost: params.usage?.cost,
      currency: params.usage?.currency,
      idempotencyKey: `runtime:${binding.id}:${randomUUID()}`,
    });
  }

  async function start(payload = {}) {
    if (payload.confirmed !== true) return failure('ACP_START_CONFIRMATION_REQUIRED', 'Explicit confirmation is required before starting work.');
    if (typeof payload.workspacePath !== 'string' || !payload.workspacePath.trim()) return failure('ACP_REPOSITORY_FOLDER_REQUIRED', 'A repository folder is required before starting work.');

    const existingSessions = listSessions(store, { limit: 100 });
    const activeExisting = (existingSessions?.bindings || []).find(binding => binding.scope?.kind === 'task' && binding.scope.taskId === payload.taskId && ACTIVE_STATES.has(binding.state));
    if (activeExisting) return failure('ACP_EXECUTION_ALREADY_ACTIVE', 'This task already has an active runtime session.', { bindingId: activeExisting.id, binding: activeExisting });

    const confirmed = confirmStart(store, payload);
    if (!confirmed?.canStart) return confirmed;
    let attempt = confirmed.attempt;

    const profileResolution = resolveProfile(store, payload);
    if (!profileResolution.ok || !profileResolution.profile) return failure('ACP_RUNTIME_NOT_CONFIGURED', 'The selected runtime profile could not be resolved.', { preflight: confirmed });
    const profile = profileResolution.profile;
    const actorPersonId = payload.actorPersonId || confirmed.task?.assigneeId || confirmed.context?.assignee?.id;
    const latestRevision = Number(confirmed.task?.__mcpRevision || confirmed.contractSnapshot.taskRevision);
    const transitionBase = {
      taskId: confirmed.contractSnapshot.taskId,
      contributionId: confirmed.contractSnapshot.contributionId,
      actorPersonId,
      expectedRevision: latestRevision,
    };
    let started = { ok: true, task: confirmed.task };
    if (confirmed.contractSnapshot.contributionId) {
      const acknowledged = transitionContribution(store, { ...transitionBase, command: 'acknowledge', idempotencyKey: `${payload.idempotencyKey}:acknowledge` });
      if (!acknowledged.ok) return failure(acknowledged.error, acknowledged.message || 'The contribution could not be acknowledged.', { preflight: confirmed });
      started = transitionContribution(store, { ...transitionBase, expectedRevision: acknowledged.task.__mcpRevision, command: 'start', idempotencyKey: `${payload.idempotencyKey}:start`, attemptId: confirmed.attempt.id });
      if (!started.ok) return failure(started.error, started.message || 'The contribution could not be started.', { preflight: confirmed });
    } else {
      attempt = {
        schemaVersion: 1,
        id: `attempt-${randomUUID()}`,
        taskId: confirmed.contractSnapshot.taskId,
        state: 'working',
        createdAt: now(),
        updatedAt: now(),
        executionContract: confirmed.contractSnapshot,
        executionContractDigest: confirmed.contractDigest,
      };
      const attempts = Array.isArray(store.get('omvra.taskContributionAttempts.v1')) ? store.get('omvra.taskContributionAttempts.v1') : [];
      store.set('omvra.taskContributionAttempts.v1', attempts.concat(attempt));
    }

    const bindingResult = createBinding(store, {
      runtimeProfileId: profile.id,
      idempotencyKey: `${payload.idempotencyKey}:binding`,
      scope: {
        kind: 'task',
        taskId: confirmed.contractSnapshot.taskId,
        contributionId: confirmed.contractSnapshot.contributionId,
        executionAttemptId: attempt.id,
        taskRevision: Number(started.task?.__mcpRevision || acknowledged.task.__mcpRevision || latestRevision),
      },
      capabilities: [],
    });
    if (!bindingResult.ok) return failure(bindingResult.error, bindingResult.message || 'The runtime session binding could not be created.', { preflight: confirmed });

    const binding = bindingResult.binding;
    let client;
    try {
      client = createNativeRuntimeClient(profile, { workspacePath: payload.workspacePath });
      const negotiated = await client.initialize();
      const session = await client.startSession({});
      client.onNotification?.(message => recordNotification(binding, message));
      const ready = updateBinding(store, {
        bindingId: binding.id,
        expectedRevision: binding.revision,
        state: 'ready',
        opaqueSessionRef: session.sessionId,
        capabilities: Object.entries(negotiated.capabilities || {}).filter(([, supported]) => supported === true).map(([id]) => ({ id, support: 'supported' })),
      });
      if (!ready.ok) throw Object.assign(new Error(ready.message || 'The runtime session could not be marked ready.'), { code: ready.error });
      clients.set(binding.id, { client, workspacePath: payload.workspacePath, profileId: profile.id });
      return { ok: true, state: 'ready', binding: ready.binding, attempt, task: started.task, preflight: confirmed };
    } catch (error) {
      client?.close?.();
      updateBinding(store, { bindingId: binding.id, expectedRevision: binding.revision, state: 'failed', terminalReason: 'protocol-error' });
      return failure(error.code || 'ACP_RUNTIME_UNAVAILABLE', error.message || 'The runtime session could not be started.', { preflight: confirmed, binding });
    }
  }

  async function startGoalNode(payload = {}) {
    if (payload.confirmed !== true) return failure('ACP_START_CONFIRMATION_REQUIRED', 'Explicit confirmation is required before starting Goal-node work.');
    const required = ['goalId', 'goalElementId', 'goalExecutionId', 'workspacePath'];
    if (required.some(field => typeof payload[field] !== 'string' || !payload[field].trim())) return failure('ACP_GOAL_SCOPE_REQUIRED', 'A Goal, agent-node, execution, and repository folder are required.');
    const goalRevision = Number(payload.goalRevision);
    const executionAttempt = Number(payload.executionAttempt);
    if (!Number.isInteger(goalRevision) || goalRevision < 0 || !Number.isInteger(executionAttempt) || executionAttempt < 0) return failure('ACP_GOAL_SCOPE_REQUIRED', 'Goal revision and execution attempt are required.');
    const existingSessions = listSessions(store, { limit: 100 });
    const activeExisting = (existingSessions?.bindings || []).find(binding => binding.scope?.kind === 'goal-node'
      && binding.scope.goalId === payload.goalId && binding.scope.goalElementId === payload.goalElementId
      && binding.scope.goalExecutionId === payload.goalExecutionId && binding.scope.executionAttempt === executionAttempt
      && ACTIVE_STATES.has(binding.state));
    if (activeExisting) return failure('ACP_EXECUTION_ALREADY_ACTIVE', 'This Goal agent-node already has an active runtime session.', { bindingId: activeExisting.id, binding: activeExisting });
    const profileResolution = resolveProfile(store, payload);
    if (!profileResolution.ok || !profileResolution.profile) return failure('ACP_RUNTIME_NOT_CONFIGURED', 'The selected runtime profile could not be resolved.');
    const bindingResult = createBinding(store, {
      runtimeProfileId: profileResolution.profile.id,
      idempotencyKey: `${payload.idempotencyKey || `goal-${payload.goalExecutionId}-${payload.goalElementId}`}:binding`,
      scope: { kind: 'goal-node', goalId: payload.goalId, goalElementId: payload.goalElementId, goalExecutionId: payload.goalExecutionId, executionAttempt, goalRevision },
      capabilities: [],
    });
    if (!bindingResult.ok) return bindingResult;
    const binding = bindingResult.binding;
    let client;
    try {
      client = createNativeRuntimeClient(profileResolution.profile, { workspacePath: payload.workspacePath });
      const negotiated = await client.initialize();
      const session = await client.startSession({});
      client.onNotification?.(message => recordNotification(binding, message));
      const ready = updateBinding(store, {
        bindingId: binding.id,
        expectedRevision: binding.revision,
        state: 'ready',
        opaqueSessionRef: session.sessionId,
        capabilities: Object.entries(negotiated.capabilities || {}).filter(([, supported]) => supported === true).map(([id]) => ({ id, support: 'supported' })),
      });
      if (!ready.ok) throw Object.assign(new Error(ready.message || 'The Goal runtime session could not be marked ready.'), { code: ready.error });
      clients.set(binding.id, { client, workspacePath: payload.workspacePath, profileId: profileResolution.profile.id });
      return { ok: true, state: 'ready', binding: ready.binding };
    } catch (error) {
      client?.close?.();
      updateBinding(store, { bindingId: binding.id, expectedRevision: binding.revision, state: 'failed', terminalReason: 'protocol-error' });
      return failure(error.code || 'ACP_RUNTIME_UNAVAILABLE', error.message || 'The Goal runtime session could not be started.', { binding });
    }
  }

  async function invoke(bindingId, method, text) {
    const current = bindingFor(bindingId);
    const session = clients.get(bindingId);
    if (!current || !session) return failure('ACP_SESSION_NOT_FOUND', 'The runtime session is not active in this app process.');
    const ref = current.opaqueSessionRef;
    try {
      const result = method === 'prompt' ? await session.client.prompt(ref, text) : method === 'steer' ? await session.client.steer(ref, text) : await session.client.cancel(ref);
      if (method === 'cancel') {
        const cancelling = updateBinding(store, { bindingId, expectedRevision: current.revision, state: 'cancelling' });
        if (cancelling.ok) updateBinding(store, { bindingId, expectedRevision: cancelling.binding.revision, state: 'interrupted', terminalReason: 'cancelled' });
      }
      return { ok: true, result };
    } catch (error) {
      return failure(error.code || 'ACP_RUNTIME_UNAVAILABLE', error.message || 'The runtime operation failed.');
    }
  }

  async function respond(bindingId, requestId, result, error) {
    const current = bindingFor(bindingId);
    const session = clients.get(bindingId);
    if (!current || !session) return failure('ACP_SESSION_NOT_FOUND', 'The runtime session is not active in this app process.');
    if (requestId === undefined || requestId === null) return failure('ACP_PROTOCOL_INCOMPATIBLE', 'A runtime request ID is required.');
    try {
      session.client.respond(requestId, result, error);
      return { ok: true };
    } catch (caught) {
      return failure(caught.code || 'ACP_PROTOCOL_INCOMPATIBLE', caught.message || 'The runtime request could not be answered.');
    }
  }

  async function resume(bindingId, payload = {}) {
    const current = bindingFor(bindingId);
    if (!current || !current.opaqueSessionRef) return failure('ACP_SESSION_RESUME_UNSUPPORTED', 'This session has no resumable runtime reference.');
    if (!['interrupted', 'starting'].includes(current.state)) return failure('ACP_SESSION_NOT_RESUMABLE', `Session is ${current.state}.`);
    const profileResolution = resolveProfile(store, { executionProfileId: current.runtimeProfileId });
    if (!profileResolution.ok) return failure('ACP_RUNTIME_NOT_CONFIGURED', 'The runtime profile could not be resolved.');
    const workspacePath = typeof payload.workspacePath === 'string' ? payload.workspacePath.trim() : '';
    if (!workspacePath) return failure('ACP_REPOSITORY_FOLDER_REQUIRED', 'A repository folder is required before resuming work.');
    const starting = current.state === 'interrupted'
      ? updateBinding(store, { bindingId, expectedRevision: current.revision, state: 'starting' })
      : { ok: true, binding: current };
    if (!starting.ok) return starting;
    let client;
    try {
      client = createNativeRuntimeClient(profileResolution.profile, { workspacePath });
      const negotiated = await client.initialize();
      await client.resumeSession(current.opaqueSessionRef, {});
      client.onNotification?.(message => recordNotification(starting.binding, message));
      const ready = updateBinding(store, {
        bindingId,
        expectedRevision: starting.binding.revision,
        state: 'ready',
        opaqueSessionRef: current.opaqueSessionRef,
        capabilities: Object.entries(negotiated.capabilities || {}).filter(([, supported]) => supported === true).map(([id]) => ({ id, support: 'supported' })),
      });
      if (!ready.ok) throw Object.assign(new Error(ready.message || 'The session could not be resumed.'), { code: ready.error });
      clients.set(bindingId, { client, workspacePath, profileId: current.runtimeProfileId });
      return ready;
    } catch (error) {
      client?.close?.();
      updateBinding(store, { bindingId, expectedRevision: starting.binding.revision, state: 'failed', terminalReason: 'protocol-error' });
      return failure(error.code || 'ACP_SESSION_RESUME_UNSUPPORTED', error.message || 'The runtime session could not be resumed.');
    }
  }

  async function close(bindingId) {
    const current = bindingFor(bindingId);
    const session = clients.get(bindingId);
    if (!current || !session) return failure('ACP_SESSION_NOT_FOUND', 'The runtime session is not active in this app process.');
    try {
      await session.client.closeSession(current.opaqueSessionRef);
      const result = updateBinding(store, { bindingId, expectedRevision: current.revision, state: 'closed', terminalReason: 'closed' });
      session.client.close?.();
      clients.delete(bindingId);
      return result;
    } catch (error) {
      return failure(error.code || 'ACP_CAPABILITY_UNSUPPORTED', error.message || 'The runtime does not support closing this session.');
    }
  }

  return { close, invoke, respond, resume, start, startGoalNode };
}

module.exports = { createAgentRuntimeSessionRunner };
