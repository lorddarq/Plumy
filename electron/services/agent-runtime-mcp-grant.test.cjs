const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProviderMcpConfiguration,
  findScopedMcpGrant,
  issueScopedMcpGrant,
  isScopedToolCallAllowed,
  revokeScopedMcpGrant,
  _resetForTests,
} = require('./agent-runtime-mcp-grant.cjs');

test.afterEach(() => _resetForTests());

test('issues an in-memory task-scoped grant and provider configuration without persisting the token', () => {
  const grant = issueScopedMcpGrant({ endpoint: 'http://127.0.0.1:3456/mcp', scope: { kind: 'task', taskId: 'task-1' } });
  assert.equal(grant.ok, true);
  assert.equal(findScopedMcpGrant(grant.token).scope.taskId, 'task-1');
  assert.deepEqual(buildProviderMcpConfiguration(grant, 'acp'), {
    mcpServers: [{ name: 'omvra', url: 'http://127.0.0.1:3456/mcp', headers: { Authorization: `Bearer ${grant.token}` } }],
  });
  assert.equal(JSON.stringify(grant.scope).includes(grant.token), false);
});

test('allows only exact task reads and denies cross-task or global access', () => {
  const grant = issueScopedMcpGrant({ endpoint: 'http://127.0.0.1:3456/mcp', scope: { kind: 'task', taskId: 'task-1' } });
  assert.equal(isScopedToolCallAllowed(grant, 'tasks.get', { taskId: 'task-1' }), true);
  assert.equal(isScopedToolCallAllowed(grant, 'tasks.context.list', { taskId: 'task-2' }), false);
  assert.equal(isScopedToolCallAllowed(grant, 'workspace.get_snapshot', {}), false);
});

test('revokes grants and expires them', () => {
  const grant = issueScopedMcpGrant({ endpoint: 'http://127.0.0.1:3456/mcp', scope: { kind: 'task', taskId: 'task-1' }, ttlMs: 1 });
  assert.equal(revokeScopedMcpGrant(grant.grantId), true);
  assert.equal(findScopedMcpGrant(grant.token), null);
});
