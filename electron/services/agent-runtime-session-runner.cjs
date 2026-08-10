const { randomUUID } = require('node:crypto');
const { createNativeRuntimeClient } = require('./agent-runtime-protocol-client.cjs');
const { createAgentRuntimeContextPack } = require('../domain/agent-runtime-context-pack.cjs');

const ACTIVE_TURN_STATES = new Set(['queued', 'starting', 'active', 'waiting-input', 'cancelling']);
const TERMINAL_TURN_STATES = new Set(['completed', 'failed', 'interrupted']);
const CANCEL_SETTLE_TIMEOUT_MS = 3_000;

function createAgentRuntimeSessionRunner({
  store,
  resolveProfile,
  confirmStart,
  transitionContribution,
  moveTaskToStatus = null,
  finalizeTaskAttempt = null,
  createBinding,
  updateBinding,
  appendEvent,
  listSessions,
  getTaskById = null,
  listTaskContext = null,
  getTaskContextEntry = null,
  ensureMcpReady = null,
  updateTaskExecutionState = null,
  emitRuntimeEvent = null,
  createClient = createNativeRuntimeClient,
  now = () => new Date().toISOString(),
  logger = null,
  maxAutomaticBatches = 6,
}) {
  const clients = new Map();
  const pendingRequests = new Map();
  const automaticBatchCounts = new Map();
  const automaticContinuationInFlight = new Set();
  const buildContextPack = typeof getTaskContextEntry === 'function'
    ? createAgentRuntimeContextPack({ getEntry: getTaskContextEntry }).build
    : null;

  const failure = (error, message, details = {}) => ({ ok: false, error, message, ...details });
  const inactiveSession = () => failure(
    'ACP_SESSION_NOT_FOUND',
    'This runtime session is not active in the current Omvra app process. It may belong to an earlier app process or provider history state. Start a new session; Omvra will keep the current task context.',
  );
  const log = (level, event, details = {}) => logger?.[level]?.(`[agent-runtime] ${event}`, details);
  const emit = (payload) => {
    try { emitRuntimeEvent?.(payload); } catch (error) { log('warn', 'live-event.emit-failed', { message: error?.message || String(error) }); }
  };
  const appendRuntimeEvent = (payload) => {
    const turnId = bindingFor(payload.bindingId)?.turn?.id;
    const result = appendEvent(store, { ...payload, ...(turnId ? { turnId } : {}) });
    if (result?.ok && !result.idempotent && result.event) {
      emit({ kind: 'event', event: result.event, binding: bindingFor(result.event.bindingId) });
    }
    return result;
  };
  const syncTaskExecution = (binding, state, details = {}) => {
    if (typeof updateTaskExecutionState !== 'function' || binding?.scope?.kind !== 'task') return null;
    const result = updateTaskExecutionState(store, {
      taskId: binding.scope.taskId,
      attemptId: binding.scope.executionAttemptId,
      state,
      ...(binding.turn?.id ? { turnId: binding.turn.id, turnState: binding.turn.state } : {}),
      ...details,
    });
    if (!result?.ok) log('warn', 'task-execution.state-sync-failed', { bindingId: binding.id, state, error: result?.error });
    else emit({ kind: 'binding', binding: bindingFor(binding.id) || binding });
    return result;
  };
  const requestKey = (bindingId, requestId) => `${bindingId}:${typeof requestId}:${String(requestId)}`;
  const safeBinding = binding => {
    const { opaqueSessionRef: _opaqueSessionRef, mcpGrantId: _mcpGrantId, ...safe } = binding;
    return safe;
  };
  const turnStateFor = binding => binding?.turn?.state || ({ active: 'active', 'needs-input': 'waiting-input', cancelling: 'cancelling' }[binding?.state]);
  const activeTurn = () => (listSessions(store, { limit: 100 })?.bindings || []).find(binding => ACTIVE_TURN_STATES.has(turnStateFor(binding)));
  const activeTurnFailure = binding => failure(
    'ACP_EXECUTION_ALREADY_ACTIVE',
    'Another task turn is already active. Open its supervision before starting new work.',
    { bindingId: binding.id, turnId: binding.turn?.id, binding: safeBinding(binding) },
  );

  async function ensureOmvraMcpListener() {
    if (typeof ensureMcpReady === 'function') {
      const readiness = await ensureMcpReady(store);
      if (!readiness?.ok) return failure(readiness?.error || 'ACP_MCP_UNAVAILABLE', readiness?.message || 'The Omvra MCP server is unavailable.');
    }
    return { ok: true };
  }

  function sanitizedElicitation(bindingId, message) {
    if (message?.id === undefined || message?.id === null) return null;
    const approvalMethod = typeof message.method === 'string' && [
      'item/commandExecution/requestApproval',
      'item/fileChange/requestApproval',
      'item/mcpToolCall/requestApproval',
    ].includes(message.method);
    if (approvalMethod) {
      const params = message.params || {};
      const subject = message.method === 'item/commandExecution/requestApproval'
        ? 'run a command'
        : message.method === 'item/fileChange/requestApproval'
          ? 'apply a file change'
          : 'call an MCP tool';
      return {
        bindingId,
        turnId: bindingFor(bindingId)?.turn?.id,
        requestId: message.id,
        method: message.method,
        responseKind: 'codex-approval',
        serverName: typeof params.serverName === 'string' ? params.serverName.slice(0, 160) : '',
        mode: 'approval',
        message: `The agent requests permission to ${subject}.${typeof params.reason === 'string' && params.reason.trim() ? ` Reason: ${params.reason.trim().slice(0, 500)}` : ''}`,
        fields: [],
      };
    }
    if (message.method !== 'mcpServer/elicitation/request') return null;
    const params = message.params || {};
    const schema = params.requestedSchema && typeof params.requestedSchema === 'object' ? params.requestedSchema : {};
    const required = new Set(Array.isArray(schema.required) ? schema.required.filter(name => typeof name === 'string') : []);
    const fields = Object.entries(schema.properties || {}).slice(0, 20).map(([name, definition]) => {
      const field = definition && typeof definition === 'object' ? definition : {};
      const options = Array.isArray(field.enum) ? field.enum.filter(value => ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 50) : [];
      return {
        name: String(name).slice(0, 128),
        type: ['string', 'number', 'integer', 'boolean'].includes(field.type) ? field.type : 'string',
        title: typeof field.title === 'string' ? field.title.slice(0, 200) : String(name).slice(0, 128),
        description: typeof field.description === 'string' ? field.description.slice(0, 500) : '',
        required: required.has(name),
        ...(field.default !== undefined ? { defaultValue: field.default } : {}),
        ...(options.length ? { options } : {}),
      };
    });
    return {
      bindingId,
      turnId: bindingFor(bindingId)?.turn?.id,
      requestId: message.id,
      method: message.method,
      responseKind: 'elicitation',
      serverName: typeof params.serverName === 'string' ? params.serverName.slice(0, 160) : '',
      mode: ['form', 'openai/form', 'url'].includes(params.mode) ? params.mode : 'form',
      message: typeof params.message === 'string' ? params.message.slice(0, 2_000) : 'Codex needs input before it can continue.',
      fields,
    };
  }

  function listRequests(bindingId) {
    return [...pendingRequests.values()].filter(request => request.bindingId === bindingId).map(request => JSON.parse(JSON.stringify(request)));
  }

  function advertisedApprovalContent(params = {}) {
    const properties = params.requestedSchema?.properties;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};
    for (const [name, definition] of Object.entries(properties)) {
      if (!definition || typeof definition !== 'object' || !Array.isArray(definition.enum) || definition.enum.length === 0) continue;
      const preferred = definition.default !== undefined && definition.enum.includes(definition.default)
        ? definition.default
        : definition.enum.find(option => /^(?:allow|approve|approved|accept|yes)$/i.test(String(option))) ?? definition.enum[0];
      return { [String(name).slice(0, 128)]: preferred };
    }
    return {};
  }

  function buildCurrentTaskContext(binding) {
    if (!buildContextPack || typeof getTaskById !== 'function' || binding.scope?.kind !== 'task') return { ok: true, pack: null, text: '' };
    const task = getTaskById(store, binding.scope.taskId);
    if (!task) return failure('TASK_NOT_FOUND', `Task "${binding.scope.taskId}" not found.`);
    const context = typeof listTaskContext === 'function'
      ? listTaskContext(store, { taskId: task.id, limit: 12 })
      : null;
    return buildContextPack(store, {
      taskId: task.id,
      taskRevision: Number(task.__mcpRevision || 0),
      taskTitle: task.title,
      taskDescription: task.notes,
      taskStatus: task.status,
      contributionId: binding.scope.contributionId,
      contextEntryIds: context?.ok ? (context.entries || []).map(entry => entry.id) : [],
    });
  }

  function bindingFor(id) {
    const result = listSessions(store, { bindingId: id, limit: 1 });
    return result?.bindings?.[0] || null;
  }

  function syncSessionState(bindingId, state, terminalReason) {
    const current = bindingFor(bindingId);
    if (!current || current.state === state) return current;
    const result = updateBinding(store, { bindingId, expectedRevision: current.revision, state, ...(terminalReason ? { terminalReason } : {}) });
    if (!result.ok) log('warn', 'binding.state-sync-failed', { bindingId, from: current.state, to: state, error: result.error });
    else {
      const taskState = { starting: 'starting', ready: 'ready', interrupted: 'interrupted', failed: 'failed', closed: 'stopped' }[state];
      if (taskState) syncTaskExecution(result.binding || current, taskState, { reason: state });
      emit({ kind: 'binding', binding: result.binding || current });
      log('info', 'binding.state-changed', { bindingId, from: current.state, to: state });
    }
    return result.binding || current;
  }

  function syncTurnState(bindingId, state, details = {}) {
    const current = bindingFor(bindingId);
    if (!current) return null;
    const previous = current.turn;
    if (!previous && !details.turnId) return current;
    if (previous?.state === state && !details.requestId) return current;
    if (previous && TERMINAL_TURN_STATES.has(previous.state) && previous.id === (details.turnId || previous.id)) return current;
    const result = updateBinding(store, {
      bindingId,
      expectedRevision: current.revision,
      state: current.state,
      turn: {
        id: details.turnId || previous?.id,
        state,
        ...(details.reason ? { terminalReason: details.reason } : {}),
        ...(details.requestId !== undefined ? { requestId: details.requestId } : {}),
      },
    });
    if (!result.ok) {
      log('warn', 'turn.state-sync-failed', { bindingId, turnId: details.turnId || previous?.id, from: previous?.state, to: state, error: result.error });
      return bindingFor(bindingId) || current;
    }
    const next = result.binding || bindingFor(bindingId) || current;
    const taskState = { queued: 'starting', starting: 'starting', active: 'working', 'waiting-input': 'waiting', cancelling: 'stopping', completed: 'batch-finished', failed: 'failed', interrupted: 'interrupted' }[state];
    if (taskState) syncTaskExecution(next, taskState, { reason: details.reason || state, ...(details.batchNumber !== undefined ? { batchNumber: details.batchNumber } : {}) });
    emit({ kind: 'binding', binding: next });
    log('info', 'turn.state-changed', { bindingId, turnId: next.turn?.id || details.turnId || previous?.id, from: previous?.state || null, to: state });
    return next;
  }

  function beginTurn(bindingId, details = {}) {
    const current = bindingFor(bindingId);
    if (!current) return null;
    if (ACTIVE_TURN_STATES.has(current.turn?.state)) return current;
    return syncTurnState(bindingId, details.state || 'starting', { ...details, turnId: details.turnId || `turn-${randomUUID()}` });
  }

  function reconcileBindingLoss(bindingId, lifecycle = {}) {
    clients.delete(bindingId);
    for (const key of pendingRequests.keys()) if (key.startsWith(`${bindingId}:`)) pendingRequests.delete(key);
    const current = bindingFor(bindingId);
    if (!current || ['interrupted', 'closed', 'failed'].includes(current.state)) return current;
    const reason = lifecycle.code === 'ACP_RUNTIME_MISSING' ? 'runtime-missing' : lifecycle.kind === 'exit' ? 'process-exit' : 'protocol-error';
    if (ACTIVE_TURN_STATES.has(current.turn?.state)) syncTurnState(bindingId, 'interrupted', { reason });
    const afterTurn = bindingFor(bindingId) || current;
    let updated = updateBinding(store, { bindingId, expectedRevision: afterTurn.revision, state: 'interrupted', terminalReason: reason });
    if (!updated.ok && updated.error === 'REVISION_MISMATCH') {
      const latest = bindingFor(bindingId);
      if (latest && !['interrupted', 'closed', 'failed'].includes(latest.state)) {
        updated = updateBinding(store, { bindingId, expectedRevision: latest.revision, state: 'interrupted', terminalReason: reason });
      }
    }
    const binding = updated.ok && updated.binding ? updated.binding : bindingFor(bindingId) || current;
    appendRuntimeEvent({
      bindingId,
      runtimeProfileId: binding.runtimeProfileId,
      kind: 'session',
      nativeEventType: 'omvra/runtime/connection-lost',
      state: 'interrupted',
      outcome: lifecycle.kind === 'exit' ? 'process-exit' : lifecycle.code || 'transport-error',
      idempotencyKey: `runtime:${bindingId}:connection-lost:${binding.revision}`,
    });
    log('warn', 'session.connection-lost', { bindingId, runtimeProfileId: binding.runtimeProfileId, reason, lastObservedAt: binding.lastObservedAt || null });
    return binding;
  }

  function attachClient(binding, client) {
    client.onLifecycle?.(lifecycle => reconcileBindingLoss(binding.id, lifecycle));
    client.onNotification?.(message => recordNotification(binding, message));
  }

  function taskMayContinue(binding) {
    if (typeof getTaskById !== 'function' || binding.scope?.kind !== 'task') return false;
    const task = getTaskById(store, binding.scope.taskId);
    return Boolean(task && !['done', 'under-review'].includes(task.status));
  }

  async function finalizeAutomaticOutcome(binding) {
    const task = typeof getTaskById === 'function' && binding.scope?.kind === 'task' ? getTaskById(store, binding.scope.taskId) : null;
    if (!task) return;
    const attemptResult = typeof finalizeTaskAttempt === 'function'
      ? finalizeTaskAttempt(store, { taskId: binding.scope.taskId, attemptId: binding.scope.executionAttemptId, state: 'completed', reason: 'automatic-batch-limit' })
      : { ok: false, error: 'ATTEMPT_FINALIZER_UNAVAILABLE' };
    const latestTask = typeof getTaskById === 'function' ? getTaskById(store, binding.scope.taskId) : task;
    const moved = latestTask?.status === 'under-review' || latestTask?.status === 'done'
      ? { ok: true, task: latestTask }
      : typeof moveTaskToStatus === 'function'
        ? moveTaskToStatus(store, { taskId: binding.scope.taskId, statusId: 'under-review', statusTitle: 'Under Review', expectedRevision: latestTask?.__mcpRevision, actor: 'agent-runtime-reconciliation' })
        : { ok: false, error: 'TASK_STATUS_FINALIZER_UNAVAILABLE' };
    const executionState = moved.ok ? (moved.task?.status === 'done' ? 'complete' : 'ready-for-review') : 'outcome-unreconciled';
    appendRuntimeEvent({
      bindingId: binding.id,
      runtimeProfileId: binding.runtimeProfileId,
      kind: 'session',
      nativeEventType: moved.ok ? 'omvra/taskExecution/finalized-for-review' : 'omvra/taskExecution/outcome-unreconciled',
      state: executionState,
      outcome: moved.ok ? 'automatic-batch-limit-finalized' : `automatic-batch-limit:${moved.error || attemptResult.error || 'reconciliation-failed'}`,
      idempotencyKey: `runtime:${binding.id}:automatic-outcome:${executionState}`,
    });
    const current = bindingFor(binding.id) || binding;
    if (['starting', 'ready'].includes(current.state)) {
      const closed = updateBinding(store, { bindingId: current.id, expectedRevision: current.revision, state: 'closed', terminalReason: 'closed' });
      const session = clients.get(binding.id);
      try { await session?.client?.closeSession?.(current.opaqueSessionRef); } catch (error) { log('debug', 'automatic-outcome.remote-close-failed', { bindingId: binding.id, message: error?.message || String(error) }); }
      session?.client?.close?.();
      clients.delete(binding.id);
      const closedBinding = closed?.ok ? closed.binding : bindingFor(binding.id) || current;
      syncTaskExecution(closedBinding, executionState, { reason: moved.ok ? 'automatic-outcome-finalized' : 'automatic-outcome-unreconciled' });
    }
  }

  function scheduleAutomaticContinuation(bindingId) {
    if (!Number.isInteger(maxAutomaticBatches) || maxAutomaticBatches <= 0 || automaticContinuationInFlight.has(bindingId)) return;
    const current = bindingFor(bindingId);
    if (!current || current.state !== 'ready' || ACTIVE_TURN_STATES.has(current.turn?.state) || !taskMayContinue(current)) return;
    const completedBatches = (automaticBatchCounts.get(bindingId) || 0) + 1;
    automaticBatchCounts.set(bindingId, completedBatches);
    if (completedBatches > maxAutomaticBatches) {
      appendRuntimeEvent({
        bindingId,
        runtimeProfileId: current.runtimeProfileId,
        kind: 'session',
        nativeEventType: 'omvra/taskBatch/automatic-limit-reached',
        state: 'ready',
        outcome: `Automatic continuation stopped after ${maxAutomaticBatches} batches.`,
        idempotencyKey: `runtime:${bindingId}:automatic-limit:${completedBatches}`,
      });
      void finalizeAutomaticOutcome(current);
      return;
    }
    automaticContinuationInFlight.add(bindingId);
    setTimeout(async () => {
      try {
        const latest = bindingFor(bindingId);
        if (!latest || latest.state !== 'ready' || ACTIVE_TURN_STATES.has(latest.turn?.state) || !taskMayContinue(latest)) return;
      appendRuntimeEvent({
          bindingId,
          runtimeProfileId: latest.runtimeProfileId,
          kind: 'session',
          nativeEventType: 'omvra/taskBatch/automatic-continuing',
          state: 'continuing',
          outcome: `Starting automatic work batch ${completedBatches} of ${maxAutomaticBatches}.`,
          idempotencyKey: `runtime:${bindingId}:automatic-continuing:${completedBatches}`,
        });
        await continueTask(bindingId, { automatic: true });
      } finally {
        automaticContinuationInFlight.delete(bindingId);
      }
    }, 0);
  }

  function recordNotification(binding, message) {
    const method = typeof message?.method === 'string' ? message.method : 'runtime/notification';
    const lower = method.toLowerCase();
    const kind = lower.includes('permission') || lower.includes('approval') ? 'permission'
      : lower.includes('input') || lower.includes('elicitation') ? 'input'
        : lower.includes('usage') || lower.includes('cost') ? 'usage'
          : lower.includes('tool') ? 'tool'
            : lower.includes('plan') ? 'plan'
              : lower.includes('turn') || lower.includes('prompt') ? 'turn'
                : 'session';
    const params = message?.params || {};
    const errorMessage = typeof params.error === 'string' ? params.error
      : typeof params.error?.message === 'string' ? params.error.message
        : typeof params.turn?.error?.message === 'string' ? params.turn.error.message
          : null;
    const subject = params.toolName || params.tool?.name || params.serverName || params.server?.name || params.name || params.item?.type || null;
    const summary = {
      bindingId: binding.id,
      method,
      state: params.state || params.status || params.turn?.status || params.thread?.status || null,
      subject,
      failureReason: params.failureReason || null,
      error: errorMessage ? errorMessage.slice(0, 500) : null,
    };
    log(summary.state === 'failed' ? 'warn' : 'debug', 'notification', summary);
    const activeClient = clients.get(binding.id)?.client;
    const policyApprovedOmvraCall = message?.method === 'mcpServer/elicitation/request'
      && message.params?.serverName === 'omvra'
      && message.params?._meta?.codex_approval_kind === 'mcp_tool_call'
      && activeClient?.profile?.approvalPolicy === 'never';
    if (policyApprovedOmvraCall) {
      activeClient.respond(message.id, { action: 'accept', content: advertisedApprovalContent(message.params) });
      return appendRuntimeEvent({
        bindingId: binding.id,
        runtimeProfileId: binding.runtimeProfileId,
        kind: 'permission',
        nativeEventType: 'omvra/mcpToolApproval/policy-accepted',
        state: 'allowed',
        outcome: 'runtime-profile-policy',
        requestId: message.id,
        toolName: 'omvra',
        permissionState: 'allowed',
        idempotencyKey: `runtime:${binding.id}:mcp-policy-approval:${String(message.id)}`,
      });
    }
    const elicitation = sanitizedElicitation(binding.id, message);
    if (elicitation) pendingRequests.set(requestKey(binding.id, elicitation.requestId), elicitation);
    const appended = appendRuntimeEvent({
      bindingId: binding.id,
      runtimeProfileId: binding.runtimeProfileId,
      kind,
      nativeEventType: method,
      state: params.state || params.status || params.turn?.status || params.thread?.status,
      outcome: params.outcome || params.failureReason || (errorMessage ? errorMessage.slice(0, 500) : undefined),
      requestId: message?.id ?? params.requestId,
      toolName: subject,
      capabilityId: params.capabilityId,
      permissionState: params.permissionState || params.state,
      usageAggregation: params.usage?.aggregation,
      inputTokens: params.usage?.inputTokens,
      outputTokens: params.usage?.outputTokens,
      totalTokens: params.usage?.totalTokens,
      contextTokens: params.usage?.contextTokens,
      cost: params.usage?.cost,
      currency: params.usage?.currency,
      messagePreview: method === 'item/agentMessage/delta'
        ? (typeof params.delta === 'string' ? params.delta : typeof params.text === 'string' ? params.text : undefined)
        : undefined,
      idempotencyKey: `runtime:${binding.id}:${randomUUID()}`,
    });
    if (method === 'turn/started') syncTurnState(binding.id, 'active');
    else if (method === 'turn/completed') {
      const waitingForInput = [...pendingRequests.values()].some(request => request.bindingId === binding.id);
      const cancellationRequested = bindingFor(binding.id)?.turn?.state === 'cancelling';
      if (!waitingForInput) for (const key of pendingRequests.keys()) if (key.startsWith(`${binding.id}:`)) pendingRequests.delete(key);
      const turnState = params.turn?.status || params.status || params.state;
      const nextState = waitingForInput ? 'waiting-input' : turnState === 'failed' ? 'failed' : turnState === 'interrupted' || cancellationRequested ? 'interrupted' : 'completed';
      const nextBinding = syncTurnState(binding.id, nextState, { reason: nextState });
      if (!waitingForInput && turnState !== 'failed' && turnState !== 'interrupted' && nextBinding?.turn?.state === 'completed') {
        const task = typeof getTaskById === 'function' && binding.scope?.kind === 'task' ? getTaskById(store, binding.scope.taskId) : null;
        const taskState = task?.status === 'done' ? 'complete' : task?.status === 'under-review' ? 'ready-for-review' : 'batch-finished';
        syncTaskExecution(nextBinding, taskState, { reason: taskState === 'complete' ? 'task-complete' : taskState === 'ready-for-review' ? 'task-under-review' : 'turn-completed' });
      }
      if (!waitingForInput && turnState !== 'failed' && turnState !== 'interrupted' && nextBinding?.turn?.state === 'completed') scheduleAutomaticContinuation(binding.id);
    }
    else if (elicitation) syncTurnState(binding.id, 'waiting-input', { requestId: elicitation.requestId });
    return appended;
  }

  async function start(payload = {}) {
    log('info', 'start.requested', { taskId: payload.taskId || null, hasWorkspace: Boolean(payload.workspacePath), executionProfileId: payload.executionProfileId || null });
    if (payload.confirmed !== true) {
      log('warn', 'start.rejected', { taskId: payload.taskId || null, error: 'ACP_START_CONFIRMATION_REQUIRED' });
      return failure('ACP_START_CONFIRMATION_REQUIRED', 'Explicit confirmation is required before starting work.');
    }
    if (typeof payload.workspacePath !== 'string' || !payload.workspacePath.trim()) {
      log('warn', 'start.rejected', { taskId: payload.taskId || null, error: 'ACP_REPOSITORY_FOLDER_REQUIRED' });
      return failure('ACP_REPOSITORY_FOLDER_REQUIRED', 'A repository folder is required before starting work.');
    }

    reconcile();
    const activeExisting = activeTurn();
    if (activeExisting) {
      log('warn', 'start.rejected', { taskId: payload.taskId, bindingId: activeExisting.id, error: 'ACP_EXECUTION_ALREADY_ACTIVE' });
      return activeTurnFailure(activeExisting);
    }

    const confirmed = confirmStart(store, payload);
    if (!confirmed?.canStart) {
      log('warn', 'start.preflight-blocked', { taskId: payload.taskId, error: confirmed?.error || null, blockers: confirmed?.blockers?.map(blocker => blocker.code || blocker) || [] });
      return confirmed;
    }
    let attempt = confirmed.attempt;

    const profileResolution = resolveProfile(store, payload);
    if (!profileResolution.ok || !profileResolution.profile) {
      if (profileResolution.state === 'disabled') return failure('ACP_RUNTIME_ACCESS_DISABLED', profileResolution.error, { state: 'disabled', preflight: confirmed });
      return failure('ACP_RUNTIME_NOT_CONFIGURED', 'The selected runtime profile could not be resolved.', { preflight: confirmed });
    }
    const profile = profileResolution.profile;
    log('info', 'start.preflight-ready', { taskId: payload.taskId, runtimeProfileId: profile.id, integrationMode: profile.integrationMode });
    const contextPack = buildContextPack
      ? buildContextPack(store, confirmed.contractSnapshot)
      : { ok: true, pack: null, text: '' };
    if (!contextPack.ok) return failure(contextPack.error, contextPack.message, { preflight: confirmed });
    const mcpReadiness = await ensureOmvraMcpListener();
    if (!mcpReadiness.ok) return failure(mcpReadiness.error, mcpReadiness.message, { preflight: confirmed });
    const actorPersonId = payload.actorPersonId || confirmed.task?.assigneeId || confirmed.context?.assignee?.id;
    let latestRevision = Number(confirmed.task?.__mcpRevision ?? confirmed.contractSnapshot.taskRevision);
    let started = { ok: true, task: confirmed.task };
    if (typeof moveTaskToStatus === 'function') {
      const moved = moveTaskToStatus(store, {
        taskId: confirmed.contractSnapshot.taskId,
        statusId: 'in-progress',
        statusTitle: 'In Progress',
        expectedRevision: latestRevision,
        actor: 'agent-runtime',
      });
      if (!moved?.ok) {
        return failure(moved?.error || 'TASK_STATUS_UPDATE_FAILED', moved?.message || 'The task could not be moved to In Progress.', { preflight: confirmed });
      }
      latestRevision = Number(moved.task?.__mcpRevision ?? latestRevision);
      started = { ...started, task: moved.task || started.task };
    }
    const transitionBase = {
      taskId: confirmed.contractSnapshot.taskId,
      contributionId: confirmed.contractSnapshot.contributionId,
      actorPersonId,
      expectedRevision: latestRevision,
    };
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
        taskRevision: Number(started.task?.__mcpRevision || latestRevision),
      },
      capabilities: [],
      turn: { id: `turn-${randomUUID()}`, state: 'queued' },
      extensions: { workspacePath: payload.workspacePath.trim() },
    });
    if (!bindingResult.ok) return failure(bindingResult.error, bindingResult.message || 'The runtime session binding could not be created.', { preflight: confirmed });

    const binding = bindingResult.binding;
    syncTaskExecution(binding, 'starting', { reason: 'session-created' });
    log('info', 'binding.created', { taskId: payload.taskId, bindingId: binding.id, runtimeProfileId: profile.id });
    let client;
    try {
      client = createClient(profile, { workspacePath: payload.workspacePath, logger });
      log('info', 'runtime.initializing', { bindingId: binding.id, runtimeProfileId: profile.id });
      const negotiated = await client.initialize();
      log('info', 'runtime.initialized', { bindingId: binding.id, authentication: negotiated.authentication || 'unknown', capabilities: Object.keys(negotiated.capabilities || {}).filter(key => negotiated.capabilities[key] === true) });
      attachClient(binding, client);
      const session = await client.startSession();
      log('info', 'session.created', { bindingId: binding.id });
      const ready = updateBinding(store, {
        bindingId: binding.id,
        expectedRevision: binding.revision,
        state: 'ready',
        opaqueSessionRef: session.sessionId,
        capabilities: Object.entries(negotiated.capabilities || {}).filter(([, supported]) => supported === true).map(([id]) => ({ id, support: 'supported' })),
      });
      if (!ready.ok) throw Object.assign(new Error(ready.message || 'The runtime session could not be marked ready.'), { code: ready.error });
      syncTaskExecution(ready.binding, 'ready', { reason: 'session-ready' });
      clients.set(binding.id, { client, workspacePath: payload.workspacePath, profileId: profile.id });
      {
        const promptText = contextPack.text || 'Begin working on the assigned task. Re-read its current state before making changes.';
        log('info', 'context.prompting', { bindingId: binding.id, contextEntryCount: confirmed.contractSnapshot.contextEntryIds?.length || 0 });
        appendRuntimeEvent({ bindingId: binding.id, runtimeProfileId: profile.id, kind: 'session', nativeEventType: 'omvra/taskInstructions/sent', state: 'sent', idempotencyKey: `runtime:${binding.id}:task-instructions` });
        syncTurnState(binding.id, 'starting', { batchNumber: 1 });
        await client.prompt(session.sessionId, promptText);
        log('info', 'context.accepted', { bindingId: binding.id });
      }
      log('info', 'session.ready', { taskId: payload.taskId, bindingId: binding.id, runtimeProfileId: profile.id });
      const current = bindingFor(binding.id) || ready.binding;
      return { ok: true, state: current.state, binding: current, attempt, task: started.task, preflight: confirmed };
    } catch (error) {
      client?.close?.();
      syncTurnState(binding.id, 'failed', { reason: error.code || 'protocol-error' });
      const current = bindingFor(binding.id) || binding;
      updateBinding(store, { bindingId: binding.id, expectedRevision: current.revision, state: 'failed', terminalReason: 'protocol-error' });
      syncTaskExecution(bindingFor(binding.id) || binding, 'failed', { reason: error.code || 'protocol-error' });
      log('error', 'start.failed', { taskId: payload.taskId, bindingId: binding.id, code: error.code || 'ACP_RUNTIME_UNAVAILABLE', message: error.message || String(error), stack: error.stack || null });
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
    reconcile();
    const activeExisting = activeTurn();
    if (activeExisting) return activeTurnFailure(activeExisting);
    const profileResolution = resolveProfile(store, payload);
    if (!profileResolution.ok || !profileResolution.profile) {
      if (profileResolution.state === 'disabled') return failure('ACP_RUNTIME_ACCESS_DISABLED', profileResolution.error, { state: 'disabled' });
      return failure('ACP_RUNTIME_NOT_CONFIGURED', 'The selected runtime profile could not be resolved.');
    }
    const mcpReadiness = await ensureOmvraMcpListener();
    if (!mcpReadiness.ok) return mcpReadiness;
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
      client = createClient(profileResolution.profile, { workspacePath: payload.workspacePath, logger });
      const negotiated = await client.initialize();
      attachClient(binding, client);
      const session = await client.startSession();
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
    let current = bindingFor(bindingId);
    const session = clients.get(bindingId);
    if (!current || !session) return inactiveSession();
    if (method === 'prompt') {
      const blocking = activeTurn();
      if (blocking && blocking.id !== bindingId) return activeTurnFailure(blocking);
      current = beginTurn(bindingId, { state: 'starting' }) || current;
    }
    if (method === 'steer' && !ACTIVE_TURN_STATES.has(current.turn?.state)) return failure('ACP_SESSION_BUSY', 'There is no active task turn to steer.');
    if (method === 'cancel' && !ACTIVE_TURN_STATES.has(current.turn?.state)) return failure('ACP_SESSION_BUSY', 'There is no active task turn to cancel.');
    const ref = current.opaqueSessionRef;
    try {
      if (method === 'cancel') {
        current = syncTurnState(bindingId, 'cancelling') || current;
      }
      const result = method === 'prompt' ? await session.client.prompt(ref, text) : method === 'steer' ? await session.client.steer(ref, text) : await session.client.cancel(ref);
      if (method === 'cancel') {
        const latest = bindingFor(bindingId);
        if (result?.acknowledged === true && latest?.turn?.state === 'cancelling') {
          syncTurnState(bindingId, 'interrupted', { reason: 'cancelled' });
        } else if (latest?.turn?.state === 'cancelling') {
          setTimeout(() => {
            const pending = bindingFor(bindingId);
            if (pending?.turn?.state === 'cancelling') syncTurnState(bindingId, 'interrupted', { reason: 'cancelled' });
          }, CANCEL_SETTLE_TIMEOUT_MS);
        }
      }
      return { ok: true, result };
    } catch (error) {
      if (method === 'cancel') {
        const latest = bindingFor(bindingId);
        if (latest?.turn?.state === 'cancelling') syncTurnState(bindingId, 'active', { reason: 'cancel-failed' });
      }
      return failure(error.code || 'ACP_RUNTIME_UNAVAILABLE', error.message || 'The runtime operation failed.');
    }
  }

  async function continueTask(bindingId, { automatic = false } = {}) {
    const current = bindingFor(bindingId);
    const session = clients.get(bindingId);
    if (!current || !session) return inactiveSession();
    if (current.scope?.kind !== 'task') return failure('ACP_CAPABILITY_UNSUPPORTED', 'Only task sessions can be continued from Start work.');
    if (current.state !== 'ready') return failure('ACP_SESSION_BUSY', `Session is ${current.state}.`);
    const blocking = activeTurn();
    if (blocking && blocking.id !== bindingId) return activeTurnFailure(blocking);
    if (ACTIVE_TURN_STATES.has(current.turn?.state)) return failure('ACP_SESSION_BUSY', `Turn is ${current.turn.state}.`);
    const contextPack = buildCurrentTaskContext(current);
    if (!contextPack.ok) return contextPack;
    const text = contextPack.text || 'Continue working on the assigned task. Re-read its current state before making changes.';
    try {
      beginTurn(bindingId, { state: 'starting', batchNumber: Number(current.taskExecution?.batchNumber || 0) + 1 });
      syncTaskExecution(bindingFor(bindingId) || current, automatic ? 'continuing' : 'working', { reason: automatic ? 'automatic-batch' : 'manual-batch', batchNumber: Number(current.taskExecution?.batchNumber || 0) + 1 });
      appendRuntimeEvent({ bindingId, runtimeProfileId: current.runtimeProfileId, kind: 'session', nativeEventType: 'omvra/taskInstructions/sent', state: 'sent', idempotencyKey: `runtime:${bindingId}:task-instructions:${randomUUID()}` });
      await session.client.prompt(current.opaqueSessionRef, text);
      return { ok: true, binding: bindingFor(bindingId) || current };
    } catch (error) {
      return failure(error.code || 'ACP_RUNTIME_UNAVAILABLE', error.message || 'The runtime session could not be continued.');
    }
  }

  async function respond(bindingId, requestId, result, error) {
    const current = bindingFor(bindingId);
    const session = clients.get(bindingId);
    if (!current || !session) return inactiveSession();
    if (requestId === undefined || requestId === null) return failure('ACP_PROTOCOL_INCOMPATIBLE', 'A runtime request ID is required.');
    try {
      session.client.respond(requestId, result, error);
      pendingRequests.delete(requestKey(bindingId, requestId));
      if (current.turn?.state === 'waiting-input') syncTurnState(bindingId, 'active');
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
    if (!profileResolution.ok) {
      if (profileResolution.state === 'disabled') return failure('ACP_RUNTIME_ACCESS_DISABLED', profileResolution.error, { state: 'disabled' });
      return failure('ACP_RUNTIME_NOT_CONFIGURED', 'The runtime profile could not be resolved.');
    }
    const workspacePath = typeof payload.workspacePath === 'string' ? payload.workspacePath.trim() : '';
    if (!workspacePath) return failure('ACP_REPOSITORY_FOLDER_REQUIRED', 'A repository folder is required before resuming work.');
    const mcpReadiness = await ensureOmvraMcpListener();
    if (!mcpReadiness.ok) return mcpReadiness;
    const starting = current.state === 'interrupted'
      ? updateBinding(store, { bindingId, expectedRevision: current.revision, state: 'starting' })
      : { ok: true, binding: current };
    if (!starting.ok) return starting;
    let client;
    try {
      client = createClient(profileResolution.profile, { workspacePath, logger });
      const negotiated = await client.initialize();
      attachClient(starting.binding, client);
      await client.resumeSession(current.opaqueSessionRef);
      const ready = updateBinding(store, {
        bindingId,
        expectedRevision: starting.binding.revision,
        state: 'ready',
        opaqueSessionRef: current.opaqueSessionRef,
        capabilities: Object.entries(negotiated.capabilities || {}).filter(([, supported]) => supported === true).map(([id]) => ({ id, support: 'supported' })),
      });
      if (!ready.ok) throw Object.assign(new Error(ready.message || 'The session could not be resumed.'), { code: ready.error });
      syncTaskExecution(ready.binding, 'ready', { reason: 'session-resumed' });
      clients.set(bindingId, { client, workspacePath, profileId: current.runtimeProfileId });
      const contextPack = buildCurrentTaskContext(ready.binding);
      if (!contextPack.ok) throw Object.assign(new Error(contextPack.message), { code: contextPack.error });
      {
        const promptText = contextPack.text || 'Resume working on the assigned task. Re-read its current state before making changes.';
        appendRuntimeEvent({ bindingId, runtimeProfileId: current.runtimeProfileId, kind: 'session', nativeEventType: 'omvra/taskInstructions/sent', state: 'sent', idempotencyKey: `runtime:${bindingId}:task-instructions:${ready.binding.revision}` });
        beginTurn(bindingId, { state: 'starting' });
        await client.prompt(current.opaqueSessionRef, promptText);
      }
      return { ...ready, binding: bindingFor(bindingId) || ready.binding };
    } catch (error) {
      client?.close?.();
      if (ACTIVE_TURN_STATES.has(bindingFor(bindingId)?.turn?.state)) syncTurnState(bindingId, 'failed', { reason: error.code || 'protocol-error' });
      const latest = bindingFor(bindingId) || starting.binding;
      updateBinding(store, { bindingId, expectedRevision: latest.revision, state: 'failed', terminalReason: 'protocol-error' });
      syncTaskExecution(bindingFor(bindingId) || latest, 'failed', { reason: error.code || 'protocol-error' });
      return failure(error.code || 'ACP_SESSION_RESUME_UNSUPPORTED', error.message || 'The runtime session could not be resumed.');
    }
  }

  async function close(bindingId) {
    const current = bindingFor(bindingId);
    const session = clients.get(bindingId);
    if (!current) return failure('ACP_SESSION_NOT_FOUND', 'The runtime session binding was not found.');
    if (session) {
      try {
        await session.client.closeSession(current.opaqueSessionRef);
      } catch (error) {
        if (error.code !== 'ACP_CAPABILITY_UNSUPPORTED') {
          return failure(error.code || 'ACP_CAPABILITY_UNSUPPORTED', error.message || 'The runtime session could not be closed.');
        }
      }
    }
    try {
      if (ACTIVE_TURN_STATES.has((bindingFor(bindingId) || current).turn?.state)) syncTurnState(bindingId, 'interrupted', { reason: 'closed' });
      const latest = bindingFor(bindingId) || current;
      const result = updateBinding(store, { bindingId, expectedRevision: latest.revision, state: 'closed', terminalReason: 'closed' });
      if (!result.ok) return result;
      syncTaskExecution(result.binding, 'stopped', { reason: 'closed' });
      session?.client.close?.();
      clients.delete(bindingId);
      for (const key of pendingRequests.keys()) if (key.startsWith(`${bindingId}:`)) pendingRequests.delete(key);
      return result;
    } catch (error) {
      return failure(error.code || 'ACP_RUNTIME_UNAVAILABLE', error.message || 'The runtime session could not be closed.');
    }
  }

  function reconcile() {
    const persistedSessions = listSessions(store, { limit: 100 })?.bindings || [];
    for (const binding of persistedSessions) {
      if (['ready', 'active', 'needs-input', 'cancelling'].includes(binding.state) && !clients.has(binding.id)) {
        reconcileBindingLoss(binding.id, { code: 'ACP_RUNTIME_MISSING', kind: 'error' });
      }
    }
    for (const [bindingId, session] of clients.entries()) {
      if (typeof session.client.isAlive === 'function' && !session.client.isAlive()) reconcileBindingLoss(bindingId, { code: 'ACP_SESSION_INTERRUPTED', kind: 'error' });
    }
    return listSessions(store, { limit: 100 });
  }

  return { close, continueTask, invoke, listRequests, reconcile, respond, resume, start, startGoalNode };
}

module.exports = { createAgentRuntimeSessionRunner };
