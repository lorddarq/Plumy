const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentExecutionPreflightService } = require('./agent-execution-preflight-service.cjs');

function harness(overrides = {}) {
  const state = {
    tasks: [
      { id: 'dependency', status: 'done', __mcpRevision: 2 },
      {
        id: 'task-1', status: 'open', assigneeId: 'arc', projectIds: ['project-1'], dependencyIds: ['dependency'], __mcpRevision: 4,
        collaboration: { orchestratorId: 'arc', contributions: [{ id: 'contribution-1', personId: 'edgar', role: 'subagent', scope: 'Implement the runtime gate.', state: 'pending' }] },
      },
    ],
    attempts: [],
    observations: { local: { availability: 'available', authentication: 'authenticated', modelOrMode: 'gpt-5', models: [{ id: 'gpt-5' }], agentCapabilities: { resume: true } } },
    ...overrides,
  };
  let transitionCalls = 0;
  const service = createAgentExecutionPreflightService({
    getTaskById: (_store, id) => state.tasks.find(task => task.id === id) || null,
    listTasks: () => state.tasks,
    readAttempts: () => state.attempts,
    readObservations: () => state.observations,
    resolveRuntimeProfile: (_store, input) => ({
      ok: true, source: input.executionProfileId ? 'execution-override' : 'project-default',
      profile: { id: input.executionProfileId || 'local', name: 'Local', integrationMode: 'acp-local-stdio', enabled: true },
    }),
    resolveTaskContext: () => ({
      ok: true, canStart: true, assignee: { id: 'arc', modelPreference: 'ignored' },
      taskContext: { latestCheckpoint: { id: 'checkpoint-1' }, entriesSinceCheckpoint: [{ id: 'decision-1' }], recentHistory: [] },
    }),
    startContributionAttempt: (_store, input) => {
      transitionCalls += 1;
      return { ok: true, idempotent: false, attempt: { id: 'attempt-1', state: 'handed-off', executionContract: input.executionContract }, task: { __mcpRevision: input.expectedRevision + 1 } };
    },
    normalizeString: value => typeof value === 'string' ? value.trim() : '',
  });
  return { service, state, getTransitionCalls: () => transitionCalls };
}

test('composed preflight resolves task, contribution, dependencies, runtime, model, and bounded context without writes', () => {
  const { service, getTransitionCalls } = harness();
  const result = service.prepare(null, {
    taskId: 'task-1', contributionId: 'contribution-1', requestedModel: 'gpt-5', requiredCapabilities: ['resume'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.runtime.profileId, 'local');
  assert.deepEqual(result.model, { requested: 'gpt-5', effective: 'gpt-5' });
  assert.deepEqual(result.contractSnapshot.contextEntryIds, ['checkpoint-1', 'decision-1']);
  assert.equal(Object.hasOwn(result.contractSnapshot, 'agentInstructions'), false);
  assert.equal(getTransitionCalls(), 0);
});

test('preflight fails closed for unfinished dependencies, active attempts, auth, and capability gaps', () => {
  const { service } = harness({
    tasks: [
      { id: 'dependency', status: 'in-progress', __mcpRevision: 2 },
      { id: 'task-1', status: 'open', assigneeId: 'arc', dependencyIds: ['dependency'], __mcpRevision: 4, collaboration: { orchestratorId: 'arc', contributions: [{ id: 'contribution-1', personId: 'edgar', role: 'subagent', scope: 'Work', state: 'pending' }] } },
    ],
    attempts: [{ id: 'attempt-active', taskId: 'task-1', contributionId: 'contribution-1', state: 'working' }],
    observations: { local: { availability: 'available', authentication: 'required', agentCapabilities: {} } },
  });
  const result = service.prepare(null, {
    taskId: 'task-1', contributionId: 'contribution-1', requiredCapabilities: ['resume'],
    requireScopedMcp: true, scopedMcpAvailable: false, budgetAllowed: false, permissionsAllowed: false,
  });
  assert.equal(result.canStart, false);
  assert.deepEqual(new Set(result.blockers.map(item => item.code)), new Set([
    'TASK_DEPENDENCY_INELIGIBLE', 'ACP_EXECUTION_ALREADY_ACTIVE', 'ACP_AUTHENTICATION_REQUIRED', 'ACP_CAPABILITY_UNSUPPORTED',
    'ACP_MCP_GRANT_FAILED', 'ACP_BUDGET_EXCEEDED', 'ACP_PERMISSION_DENIED',
  ]));
});

test('final start gate requires explicit confirmation and revalidates revision and digest before one attempt write', () => {
  const { service, state, getTransitionCalls } = harness();
  const prepared = service.prepare(null, { taskId: 'task-1', contributionId: 'contribution-1' });
  assert.equal(service.confirmStart(null, { taskId: 'task-1', contributionId: 'contribution-1', expectedRevision: 4 }).blockers[0].code, 'ACP_START_CONFIRMATION_REQUIRED');
  assert.equal(getTransitionCalls(), 0);

  state.tasks[1].__mcpRevision = 5;
  const stale = service.confirmStart(null, {
    taskId: 'task-1', contributionId: 'contribution-1', expectedRevision: 4, expectedContractDigest: prepared.contractDigest, confirmed: true,
  });
  assert.equal(stale.blockers[0].code, 'REVISION_MISMATCH');
  assert.equal(getTransitionCalls(), 0);

  state.tasks[1].__mcpRevision = 4;
  const started = service.confirmStart(null, {
    taskId: 'task-1', contributionId: 'contribution-1', actorPersonId: 'arc', expectedRevision: 4,
    expectedContractDigest: prepared.contractDigest, idempotencyKey: 'start-1', confirmed: true,
  });
  assert.equal(started.ok, true);
  assert.equal(started.attempt.id, 'attempt-1');
  assert.equal(started.attempt.executionContract.runtimeProfileId, 'local');
  assert.equal(getTransitionCalls(), 1);
});

test('direct task execution stays backward compatible and does not fabricate collaboration attempts', () => {
  const { service, state, getTransitionCalls } = harness();
  delete state.tasks[1].collaboration;
  const prepared = service.prepare(null, { taskId: 'task-1' });
  const result = service.confirmStart(null, {
    taskId: 'task-1', expectedRevision: 4, expectedContractDigest: prepared.contractDigest, confirmed: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.directExecution, true);
  assert.equal(result.attempt, null);
  assert.equal(getTransitionCalls(), 0);
});

test('persona model preference applies only when the selected runtime advertises it', () => {
  const { service, state } = harness();
  state.observations.local.models = [{ id: 'gpt-5' }];
  const unavailable = service.prepare(null, { taskId: 'task-1', contributionId: 'contribution-1' });
  assert.equal(unavailable.model.effective, 'gpt-5');
  assert.equal(unavailable.warnings.some(item => item.code === 'ACP_PERSONA_MODEL_UNAVAILABLE'), true);

  state.observations.local.models.push({ id: 'ignored' });
  const advertised = service.prepare(null, { taskId: 'task-1', contributionId: 'contribution-1' });
  assert.equal(advertised.model.effective, 'ignored');
});
