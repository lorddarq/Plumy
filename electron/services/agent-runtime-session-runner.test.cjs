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
    store: {},
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
