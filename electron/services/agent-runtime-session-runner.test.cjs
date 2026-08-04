const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentRuntimeSessionRunner } = require('./agent-runtime-session-runner.cjs');

test('does not start a second active task session', async () => {
  let confirmCalls = 0;
  const activeBinding = {
    id: 'binding-1',
    state: 'active',
    scope: { kind: 'task', taskId: 'task-1' },
  };
  const runner = createAgentRuntimeSessionRunner({
    store: { get: () => [], set: () => {} },
    resolveProfile: () => { throw new Error('must not resolve a duplicate session'); },
    confirmStart: () => { confirmCalls += 1; return { canStart: true }; },
    transitionContribution: () => ({ ok: true }),
    createBinding: () => { throw new Error('must not create a duplicate binding'); },
    updateBinding: () => ({ ok: true }),
    appendEvent: () => ({ ok: true }),
    listSessions: () => ({ bindings: [activeBinding], events: [] }),
  });

  const result = await runner.start({ confirmed: true, taskId: 'task-1', workspacePath: '/tmp/workspace' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'ACP_EXECUTION_ALREADY_ACTIVE');
  assert.equal(result.bindingId, 'binding-1');
  assert.equal(confirmCalls, 0);
});

test('does not create a session when ACP runtime access is disabled', async () => {
  let bindingsCreated = false;
  const runner = createAgentRuntimeSessionRunner({
    store: {},
    resolveProfile: () => ({ ok: false, state: 'disabled', error: 'ACP runtime access is disabled.' }),
    confirmStart: () => ({ canStart: true, contractSnapshot: { taskId: 'task-1', taskRevision: 0 }, task: {} }),
    transitionContribution: () => ({ ok: true }),
    createBinding: () => { bindingsCreated = true; return { ok: true, binding: {} }; },
    updateBinding: () => ({ ok: true }),
    appendEvent: () => ({ ok: true }),
    listSessions: () => ({ bindings: [], events: [] }),
  });

  const result = await runner.start({ confirmed: true, taskId: 'task-1', workspacePath: '/tmp/workspace' });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'disabled');
  assert.equal(result.error, 'ACP_RUNTIME_ACCESS_DISABLED');
  assert.equal(bindingsCreated, false);
});

test('explains that a persisted session needs a new app-process session when its client is gone', async () => {
  const runner = createAgentRuntimeSessionRunner({
    store: {},
    resolveProfile: () => ({ ok: true, profile: { id: 'runtime-1', integrationMode: 'codex-app-server-stdio' } }),
    confirmStart: () => ({ canStart: false }),
    transitionContribution: () => ({ ok: true }),
    createBinding: () => ({ ok: false }),
    updateBinding: () => ({ ok: true }),
    appendEvent: () => ({ ok: true }),
    listSessions: () => ({ bindings: [{ id: 'binding-1', state: 'ready', scope: { kind: 'task', taskId: 'task-1' } }], events: [] }),
  });

  const result = await runner.continueTask('binding-1');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'ACP_SESSION_NOT_FOUND');
  assert.match(result.message, /Start a new session/);
  assert.match(result.message, /current task context/);
});

test('injects the bounded Omvra context pack into a new native session', async () => {
  const prompts = [];
  const bindingInputs = [];
  const updates = [];
  const events = [];
  const logs = [];
  const responses = [];
  let storedBinding = null;
  let notify;
  let lifecycle;
  const statusMoves = [];
  const client = {
    initialize: async () => ({ capabilities: { prompt: true } }),
    startSession: async () => {
      assert.equal(typeof notify, 'function');
      notify({ method: 'mcpServer/startupStatus/updated', params: { name: 'figma', status: 'failed', failureReason: 'reauthenticationRequired', error: 'Login required' } });
      return { sessionId: 'native-session-1' };
    },
    prompt: async (_sessionId, text) => {
      prompts.push(text);
      notify({ method: 'turn/started', params: { turn: { status: 'inProgress' } } });
      return { accepted: true };
    },
    onNotification: callback => { notify = callback; },
    onLifecycle: callback => { lifecycle = callback; },
    respond: (requestId, response, error) => { responses.push({ requestId, response, error }); },
  };
  const runner = createAgentRuntimeSessionRunner({
    store: { get: () => [], set: () => {} },
    resolveProfile: () => ({ ok: true, profile: { id: 'runtime-1', integrationMode: 'acp-local-stdio', executablePath: '/tmp/runtime' } }),
    confirmStart: () => ({
      ok: true,
      canStart: true,
      task: { __mcpRevision: 4 },
      contractSnapshot: { taskId: 'task-1', taskRevision: 4, contributionId: null, contextEntryIds: ['checkpoint-1'] },
      contractDigest: 'digest',
    }),
    transitionContribution: () => ({ ok: true }),
    moveTaskToStatus: (_store, input) => {
      statusMoves.push(input);
      return { ok: true, task: { __mcpRevision: input.expectedRevision + 1, status: 'in-progress' } };
    },
    createBinding: (_store, input) => {
      bindingInputs.push(input);
      storedBinding = { id: 'binding-1', revision: 0, runtimeProfileId: 'runtime-1', state: 'starting', scope: { kind: 'task', taskId: 'task-1' } };
      return { ok: true, binding: storedBinding };
    },
    updateBinding: (_store, input) => {
      updates.push(input);
      storedBinding = { ...storedBinding, ...input, id: 'binding-1', revision: input.expectedRevision + 1 };
      return { ok: true, binding: storedBinding };
    },
    appendEvent: (_store, event) => { events.push(event); return { ok: true }; },
    listSessions: () => ({ bindings: storedBinding ? [storedBinding] : [], events: [] }),
    getTaskContextEntry: (_store, { entryId }) => ({ ok: true, entry: { id: entryId, kind: 'context-checkpoint', fromRevision: 4, toRevision: 4, summary: 'Continue from accepted checkpoint', markers: [], provenance: 'human-authored', createdAt: '2026-08-02T00:00:00.000Z', sourceRefs: [{ type: 'activity', id: 'activity-1' }] } }),
    createClient: () => client,
    logger: { info: (message, details) => logs.push({ message, details }), debug: (message, details) => logs.push({ message, details }), warn: (message, details) => logs.push({ message, details }), error: (message, details) => logs.push({ message, details }) },
  });

  const result = await runner.start({ confirmed: true, taskId: 'task-1', workspacePath: '/tmp/workspace', idempotencyKey: 'start-1' });
  assert.equal(result.ok, true);
  assert.deepEqual(statusMoves[0], {
    taskId: 'task-1',
    statusId: 'in-progress',
    statusTitle: 'In Progress',
    expectedRevision: 4,
    actor: 'agent-runtime',
  });
  assert.equal(bindingInputs[0].extensions.workspacePath, '/tmp/workspace');
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /Continue from accepted checkpoint/);
  assert.equal(result.binding.state, 'active');
  assert.equal(updates.at(-1).state, 'active');
  const mcpEvent = events.find(event => event.nativeEventType === 'mcpServer/startupStatus/updated');
  assert.equal(mcpEvent.toolName, 'figma');
  assert.equal(mcpEvent.state, 'failed');
  assert.equal(mcpEvent.outcome, 'reauthenticationRequired');
  assert.equal(events.some(event => event.nativeEventType === 'omvra/taskInstructions/sent'), true);
  assert.equal(logs.some(entry => entry.message === '[agent-runtime] session.ready' && entry.details.bindingId === 'binding-1'), true);
  assert.equal(logs.some(entry => entry.message === '[agent-runtime] notification' && entry.details.subject === 'figma'), true);
  notify({ method: 'mcpServer/elicitation/request', id: 42, params: { serverName: 'omvra_testing_mcp', mode: 'form', message: 'Allow the task preflight?', requestedSchema: { type: 'object', properties: { confirmed: { type: 'boolean', title: 'Confirm', default: true } }, required: ['confirmed'] } } });
  assert.equal(runner.listRequests('binding-1')[0].message, 'Allow the task preflight?');
  assert.equal(storedBinding.state, 'needs-input');
  assert.equal((await runner.respond('binding-1', 42, { action: 'accept', content: { confirmed: true }, _meta: null })).ok, true);
  assert.equal(runner.listRequests('binding-1').length, 0);
  assert.equal(responses[0].requestId, 42);
  assert.equal(storedBinding.state, 'active');
  notify({ method: 'item/commandExecution/requestApproval', id: 'approval-1', params: { reason: 'Write the requested implementation.' } });
  assert.equal(runner.listRequests('binding-1')[0].responseKind, 'codex-approval');
  assert.equal(storedBinding.state, 'needs-input');
  assert.equal((await runner.respond('binding-1', 'approval-1', { decision: 'accept' })).ok, true);
  assert.deepEqual(responses.at(-1), { requestId: 'approval-1', response: { decision: 'accept' }, error: undefined });
  assert.equal(storedBinding.state, 'active');
  notify({ method: 'error', params: { error: { message: 'Task tool failed.' }, willRetry: false } });
  assert.equal(events.at(-1).outcome, 'Task tool failed.');
  lifecycle({ kind: 'exit', code: 'ACP_SESSION_INTERRUPTED' });
  assert.equal(storedBinding.state, 'interrupted');
  assert.equal(events.at(-1).nativeEventType, 'omvra/runtime/connection-lost');
  assert.equal(runner.listRequests('binding-1').length, 0);
  notify({ method: 'turn/completed', params: { turn: { status: 'interrupted' } } });
});

test('resuming interrupted task work immediately sends the current authoritative task context', async () => {
  const prompts = [];
  const events = [];
  let notify;
  let binding = { id: 'binding-resume', revision: 2, runtimeProfileId: 'runtime-1', state: 'interrupted', opaqueSessionRef: 'thread-1', scope: { kind: 'task', taskId: 'task-1', executionAttemptId: 'attempt-1', taskRevision: 4 } };
  const runner = createAgentRuntimeSessionRunner({
    store: {},
    resolveProfile: () => ({ ok: true, profile: { id: 'runtime-1', integrationMode: 'codex-app-server-stdio', executablePath: '/tmp/codex' } }),
    confirmStart: () => ({ canStart: false }),
    transitionContribution: () => ({ ok: true }),
    createBinding: () => ({ ok: false }),
    updateBinding: (_store, input) => {
      binding = { ...binding, ...input, revision: input.expectedRevision + 1 };
      return { ok: true, binding };
    },
    appendEvent: (_store, event) => { events.push(event); return { ok: true }; },
    listSessions: () => ({ bindings: [binding], events: [] }),
    getTaskById: () => ({ id: 'task-1', title: 'Test task', notes: 'Update the task description with the agent details.', status: 'in-progress', __mcpRevision: 4 }),
    listTaskContext: () => ({ ok: true, entries: [{ id: 'checkpoint-1' }] }),
    getTaskContextEntry: () => ({ ok: true, entry: { id: 'checkpoint-1', kind: 'context-checkpoint', fromRevision: 4, toRevision: 4, summary: 'Use the accepted task brief.', sourceRefs: [] } }),
    createClient: () => ({
      initialize: async () => ({ capabilities: { prompt: true } }),
      onNotification: callback => { notify = callback; },
      resumeSession: async () => ({ sessionId: 'thread-1' }),
      prompt: async (_sessionId, text) => { prompts.push(text); notify({ method: 'turn/started', params: { turn: { status: 'inProgress' } } }); return { turnId: 'turn-1' }; },
      close: () => {},
    }),
  });

  const result = await runner.resume('binding-resume', { workspacePath: '/tmp/workspace' });
  assert.equal(result.ok, true);
  assert.equal(result.binding.state, 'active');
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /Title: Test task/);
  assert.match(prompts[0], /Update the task description with the agent details/);
  assert.equal(events.some(event => event.nativeEventType === 'omvra/taskInstructions/sent'), true);
  notify({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
  assert.equal((await runner.continueTask('binding-resume')).ok, true);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Update the task description with the agent details/);
});

test('closing a Codex session retires the binding when remote thread close is unsupported', async () => {
  let binding = { id: 'binding-1', revision: 3, runtimeProfileId: 'runtime-1', state: 'interrupted', opaqueSessionRef: 'thread-1', scope: { kind: 'task', taskId: 'task-1' } };
  let transportClosed = false;
  const runner = createAgentRuntimeSessionRunner({
    store: {},
    resolveProfile: () => ({ ok: true, profile: { id: 'runtime-1', integrationMode: 'codex-app-server-stdio' } }),
    confirmStart: () => ({ canStart: false }),
    transitionContribution: () => ({ ok: true }),
    createBinding: () => ({ ok: false }),
    updateBinding: (_store, input) => {
      binding = { ...binding, ...input, revision: input.expectedRevision + 1 };
      return { ok: true, binding };
    },
    appendEvent: () => ({ ok: true }),
    listSessions: () => ({ bindings: [binding], events: [] }),
    createClient: () => ({
      initialize: async () => ({ capabilities: {} }),
      onNotification: () => {},
      resumeSession: async () => ({ sessionId: 'thread-1' }),
      prompt: async () => ({ turnId: 'turn-1' }),
      closeSession: () => { throw Object.assign(new Error('No remote close.'), { code: 'ACP_CAPABILITY_UNSUPPORTED' }); },
      close: () => { transportClosed = true; },
    }),
  });

  const resumed = await runner.resume('binding-1', { workspacePath: '/tmp/workspace' });
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  const result = await runner.close('binding-1');
  assert.equal(result.ok, true);
  assert.equal(result.binding.state, 'closed');
  assert.equal(transportClosed, true);
});

test('closing an orphaned interrupted binding allows replacement after app restart', async () => {
  let binding = { id: 'binding-orphaned', revision: 5, runtimeProfileId: 'runtime-1', state: 'interrupted', opaqueSessionRef: 'thread-old', mcpGrantId: 'grant-old', scope: { kind: 'task', taskId: 'task-1' } };
  let revokedGrantId = null;
  const runner = createAgentRuntimeSessionRunner({
    store: {},
    resolveProfile: () => ({ ok: false }),
    confirmStart: () => ({ canStart: false }),
    transitionContribution: () => ({ ok: true }),
    createBinding: () => ({ ok: false }),
    updateBinding: (_store, input) => {
      binding = { ...binding, ...input, revision: input.expectedRevision + 1 };
      return { ok: true, binding };
    },
    appendEvent: () => ({ ok: true }),
    listSessions: () => ({ bindings: [binding], events: [] }),
    revokeMcpGrant: (_store, grantId) => { revokedGrantId = grantId; },
  });

  const result = await runner.close('binding-orphaned');
  assert.equal(result.ok, true);
  assert.equal(result.binding.state, 'closed');
  assert.equal(revokedGrantId, 'grant-old');
});
