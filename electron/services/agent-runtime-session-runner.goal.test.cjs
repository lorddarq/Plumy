const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentRuntimeSessionRunner } = require('./agent-runtime-session-runner.cjs');

test('Goal-node start binds one provider-neutral session to the immutable execution scope', async () => {
  const bindings = [];
  const runner = createAgentRuntimeSessionRunner({
    store: {},
    resolveProfile: () => ({ ok: true, profile: { id: 'runtime-1', integrationMode: 'unsupported', executablePath: '/tmp/runtime' } }),
    confirmStart: () => ({ ok: true }),
    transitionContribution: () => ({ ok: true }),
    createBinding: (_store, input) => { bindings.push(input); return { ok: true, binding: { id: 'binding-1', revision: 0, ...input } }; },
    updateBinding: (_store, input) => ({ ok: true, binding: { id: input.bindingId, revision: 1, ...input } }),
    appendEvent: () => ({ ok: true }),
    listSessions: () => ({ bindings: [], events: [] }),
  });

  const result = await runner.startGoalNode({ confirmed: true, goalId: 'goal-1', goalElementId: 'node-1', goalExecutionId: 'execution-1', executionAttempt: 2, goalRevision: 5, workspacePath: '/tmp/workspace' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'ACP_CAPABILITY_UNSUPPORTED');
  assert.deepEqual(bindings[0].scope, { kind: 'goal-node', goalId: 'goal-1', goalElementId: 'node-1', goalExecutionId: 'execution-1', executionAttempt: 2, goalRevision: 5 });
});

test('Goal-node start rejects an active task turn before resolving the runtime', async () => {
  const activeBinding = { id: 'task-binding-1', revision: 1, runtimeProfileId: 'runtime-1', state: 'ready', turn: { id: 'turn-1', state: 'active' }, scope: { kind: 'task', taskId: 'task-1' } };
  let resolved = false;
  const runner = createAgentRuntimeSessionRunner({
    store: {},
    resolveProfile: () => { resolved = true; return { ok: true, profile: {} }; },
    confirmStart: () => ({ ok: true }),
    transitionContribution: () => ({ ok: true }),
    createBinding: () => { throw new Error('must not create a second session'); },
    updateBinding: () => ({ ok: true }),
    appendEvent: () => ({ ok: true }),
    listSessions: () => ({ bindings: [activeBinding], events: [] }),
  });

  const result = await runner.startGoalNode({ confirmed: true, goalId: 'goal-2', goalElementId: 'node-2', goalExecutionId: 'execution-2', executionAttempt: 0, goalRevision: 1, workspacePath: '/tmp/workspace' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'ACP_EXECUTION_ALREADY_ACTIVE');
  assert.equal(result.bindingId, activeBinding.id);
  assert.equal(resolved, false);
});
