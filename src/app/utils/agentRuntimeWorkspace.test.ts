import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAgentRuntimeWorkspace, resolveConfiguredAgentWorkspace } from './agentRuntimeWorkspace.ts';

test('working-directory resolution keeps project filtering independent', () => {
  assert.deepEqual(resolveConfiguredAgentWorkspace('/task', '/project', '/global'), {
    workspacePath: '/task', source: 'task-override',
  });
  assert.deepEqual(resolveConfiguredAgentWorkspace(undefined, '/project', '/global'), {
    workspacePath: '/project', source: 'project-default',
  });
  assert.deepEqual(resolveConfiguredAgentWorkspace(undefined, undefined, '/global'), {
    workspacePath: '/global', source: 'global-default',
  });
  assert.equal(resolveConfiguredAgentWorkspace(undefined, undefined, undefined), null);
});

test('managed workspace resolution explains a stale Electron main process', async () => {
  await assert.rejects(
    resolveAgentRuntimeWorkspace('task-1', undefined, undefined, undefined, async () => {
      throw new Error("Error invoking remote method 'agent-runtime/resolve-managed-workspace': Error: No handler registered for 'agent-runtime/resolve-managed-workspace'");
    }),
    /Restart Omvra to load the managed workspace service/,
  );
});
