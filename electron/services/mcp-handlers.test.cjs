const test = require('node:test');
const assert = require('node:assert/strict');

const { getToolCallPayload, handleToolCall } = require('./mcp-handlers.cjs');
const { makeStoreFromFixture } = require('./test-fixtures.cjs');

// Focused unit coverage for the MCP tool-call dispatcher itself, independent
// of mcp-http-server.test.cjs's full HTTP transport integration. The
// capability-profile write gate below is a real security boundary: a write
// tool that slips past it under a read-only profile is a write bypass, so
// both directions (blocked under read_only, allowed under task_write) are
// asserted explicitly rather than only through the HTTP-level fixtures.

test('getToolCallPayload requires a name', () => {
  const payload = getToolCallPayload({});
  assert.ok(payload.error);
  assert.match(payload.error.message, /"name" is required/);
});

test('getToolCallPayload canonicalizes a public (underscore) tool name', () => {
  const payload = getToolCallPayload({ name: 'tasks_get', arguments: { taskId: 'task-1' } });
  assert.equal(payload.name, 'tasks.get');
  assert.deepEqual(payload.args, { taskId: 'task-1' });
});

test('getToolCallPayload rejects non-object arguments', () => {
  const payload = getToolCallPayload({ name: 'tasks_get', arguments: ['not', 'an', 'object'] });
  assert.ok(payload.error);
  assert.match(payload.error.message, /"arguments" must be an object/);
});

test('getToolCallPayload defaults missing arguments to an empty object', () => {
  const payload = getToolCallPayload({ name: 'workspace_get_snapshot' });
  assert.deepEqual(payload.args, {});
});

test('handleToolCall rejects an unknown tool name', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const { error, result } = handleToolCall(store, {}, { name: 'not_a_real_tool' });
  assert.ok(error);
  assert.equal(result, undefined);
  assert.match(error.message, /Unknown tool/);
});

test('a read tool succeeds under the read_only capability profile', () => {
  const store = makeStoreFromFixture('workspace-custom-status');
  const { error, result } = handleToolCall(store, {}, { name: 'tasks_get', arguments: { taskId: 'task-custom-1' } });
  assert.equal(error, undefined);
  assert.equal(result.structuredContent.id, 'task-custom-1');
});

test('a write tool is blocked under the read_only capability profile and records a denied audit entry', () => {
  const store = makeStoreFromFixture('workspace-custom-status');
  const { error, result } = handleToolCall(store, {}, { name: 'tasks_update', arguments: { taskId: 'task-custom-1', expectedRevision: 0, title: 'Should not apply' } });
  assert.equal(result, undefined);
  assert.ok(error);
  assert.equal(error.code, -32003);
  assert.equal(error.data.capabilityProfile, 'read_only');
  assert.equal(error.data.writeToolsEnabled, false);

  const audit = store.get('omvra.mcp.audit.v1');
  const latest = audit[audit.length - 1];
  assert.equal(latest.outcome, 'denied');
  assert.equal(latest.reason, 'write_tools_unavailable');
  assert.equal(latest.toolName, 'tasks.update');
});

test('a write tool succeeds under the task_write capability profile', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const before = handleToolCall(store, {}, { name: 'tasks_get', arguments: { taskId: 'task-1' } });
  const expectedRevision = before.result.structuredContent.__mcpRevision ?? 0;

  const { error, result } = handleToolCall(store, {}, {
    name: 'tasks_update',
    arguments: { taskId: 'task-1', expectedRevision, title: 'Updated via focused unit test' },
  });
  assert.equal(error, undefined);
  assert.equal(result.structuredContent.ok, true);
  assert.equal(result.structuredContent.changed, true);
  assert.equal(result.structuredContent.task.title, 'Updated via focused unit test');

  const audit = store.get('omvra.mcp.audit.v1');
  const latest = audit[audit.length - 1];
  assert.equal(latest.outcome, 'success');
  assert.equal(latest.toolName, 'tasks.update');
});

test('agent.resolve_task_context requires taskId', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const { error } = handleToolCall(store, {}, { name: 'agent_resolve_task_context', arguments: {} });
  assert.ok(error);
  assert.match(error.message, /"taskId" is required/);
});
