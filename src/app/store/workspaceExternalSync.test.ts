import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { Task } from '../types.ts';
import { TASKS_KEY } from './workspacePersistence.ts';
import { createWorkspaceExternalSyncTestHost, type WorkspaceExternalSyncTestHost } from './workspaceExternalSyncTestHost.ts';
import mcpHandlers from '../../../electron/services/mcp-handlers.cjs';

const { handleToolCall } = mcpHandlers as { handleToolCall: (store: unknown, req: unknown, params: unknown) => { error?: { message: string }; result?: { structuredContent: Record<string, unknown> } } };

// This exercises the real production MCP write path (electron/services/
// mcp-handlers.cjs's handleToolCall, over a real electron-store instance --
// not the flat-keyed MemoryStore test double, and not a hand-typed JSON swap
// -- as the "agent", so an "agent write" here really does go through
// task-service.cjs's revision-checked updateTaskDescription exactly as a
// live ACP session's tool call would, AND the broadcast keys the renderer
// receives are derived the same way electron/main.cjs derives them
// (electron/domain/store-diff.cjs's diffStoreSnapshots against a real,
// nested electron-store snapshot), not hand-picked to match what the
// renderer happens to filter for. A prior version of this file used a flat
// MemoryStore and manually emitted {keys: [TASKS_KEY]}, which cannot
// reproduce the bug where electron-store's dot-notation nesting makes a live
// MCP write broadcast the single top-level key 'omvra' instead -- a key the
// renderer's exact-match filter silently discards. The renderer side is the
// real useWorkspacePersistence + useCanonicalWorkspaceHydration pair. Only
// the IPC transport itself is faked, since that's Electron plumbing with no
// in-process equivalent to call directly; electron/ipc/store.cjs was read to
// confirm the fake's storeSetMany bridge (a raw, unguarded key->value
// overwrite) matches its real behavior exactly.
//
// The point of this file is to report what the current code actually does,
// including where it's still wrong -- not to assert a hand-picked "should"
// and shape the scenario until it agrees.


// Performs the real MCP write AND derives/emits the store/did-change
// broadcast the same way electron/main.cjs would for a live agent session --
// via bridge.emitRealStoreChangeAround, not a hand-picked key. Must be
// called inside act() by the caller, since the broadcast synchronously
// triggers renderer state updates.
function realAgentDescriptionWrite(bridge: WorkspaceExternalSyncTestHost, taskId: string, description: string) {
  return bridge.emitRealStoreChangeAround(() => {
    const before = handleToolCall(bridge.mcpStore, {}, { name: 'tasks_get', arguments: { taskId } });
    assert.equal(before.error, undefined, 'tasks_get must succeed before the agent can write');
    const expectedRevision = (before.result!.structuredContent as { __mcpRevision?: number }).__mcpRevision ?? 0;
    const write = handleToolCall(bridge.mcpStore, {}, {
      name: 'tasks_update_description',
      arguments: { taskId, expectedRevision, description },
    });
    assert.equal(write.error, undefined, `real MCP write must succeed: ${write.error?.message}`);
    return write.result!.structuredContent;
  });
}

// Performs the real MCP task creation AND derives/emits the store/did-change
// broadcast the same way electron/main.cjs would -- see
// realAgentDescriptionWrite. Must be called inside act().
function realAgentTaskCreate(bridge: WorkspaceExternalSyncTestHost) {
  return bridge.emitRealStoreChangeAround(() => {
    const write = handleToolCall(bridge.mcpStore, {}, {
      name: 'task_write',
      arguments: {
        title: 'Externally created task',
        statusId: 'open',
        projectIds: ['lane-1'],
        swimlaneId: 'lane-1',
        startDate: '2026-03-21',
        endDate: '2026-03-21',
        swimlaneOnly: false,
      },
    });
    assert.equal(write.error, undefined, `real MCP create must succeed: ${write.error?.message}`);
    return write.result!.structuredContent as { task: Task };
  });
}

test('a task created through the real MCP write path appears in renderer state', async () => {
  const bridge = await createWorkspaceExternalSyncTestHost();
  try {
    const idsBeforeCreate = new Set(bridge.get().tasks.map(item => item.id));
    const callsBeforeSync = bridge.storeSetManyCalls.length;
    let created: Task | undefined;

    await bridge.runInAct(async () => { created = realAgentTaskCreate(bridge).task; });
    await bridge.flushMicrotasks();

    assert.ok(created);
    assert.equal(idsBeforeCreate.has(created!.id), false, 'the task must begin outside renderer state');

    assert.equal(bridge.get().tasks.find(item => item.id === created!.id)?.title, 'Externally created task');
    assert.equal(bridge.get().tasks.find(item => item.id === created!.id)?.swimlaneId, 'lane-1');
    assert.equal(bridge.storeSetManyCalls.length, callsBeforeSync, 'applying the external create must not echo the full task array back to storage');
  } finally {
    await bridge.cleanup();
  }
});

test('a real MCP write applied while the renderer is idle is not echoed back to storage', async () => {
  const taskId = 'task-idle-external-sync';
  const bridge = await createWorkspaceExternalSyncTestHost({
    initialTask: { id: taskId, description: 'Idle sync initial description', revision: 7 },
  });
  try {
    assert.equal(bridge.get().tasks.find(item => item.id === taskId)?.notes, 'Idle sync initial description', 'the host must hydrate the configured initial task state');

    // Capture the baseline before the external change so any persistence
    // call caused by applying that change is observable as an echo.
    const callsBeforeSync = bridge.storeSetManyCalls.length;
    let updated: Record<string, unknown> | undefined;
    await bridge.runInAct(async () => { updated = realAgentDescriptionWrite(bridge, taskId, 'Real agent update via handleToolCall'); });
    await bridge.flushMicrotasks();

    assert.equal(updated?.revision, 8, 'the MCP mutation must advance the configured starting revision');
    assert.equal(bridge.get().tasks.find(item => item.id === taskId)?.notes, 'Real agent update via handleToolCall', 'the real MCP write should be reflected in the renderer');
    assert.equal(bridge.storeSetManyCalls.length, callsBeforeSync, 'applying the external sync must not itself trigger a new write-back');
    assert.equal(bridge.get().pendingCanonicalWritesRef.current?.[TASKS_KEY] ?? 0, 0, 'the local-write guard must not be raised by an external sync');
  } finally {
    await bridge.cleanup();
  }
});

test('a real MCP write landing while a local edit is still persisting: the drop is fixed, the write-clobber is not (reported honestly)', async () => {
  const taskId = 'task-concurrent-external-sync';
  const bridge = await createWorkspaceExternalSyncTestHost({
    initialTask: { id: taskId, description: 'Concurrent sync initial description', revision: 11 },
  });
  try {
    // Drain the initial-mount priming write (this fixture has no milestones
    // or goalPolicy entry, so those two persist their untouched defaults
    // once on mount). useWorkspacePersistence
    // shares ONE flush queue across all seven keys, so leaving this pending
    // would queue the local edit below behind it instead of giving tasks
    // its own flush, which is not what this test is exercising.
    await bridge.releaseAllStoreSetMany();
    assert.ok(Object.values(bridge.get().pendingCanonicalWritesRef.current ?? {}).every(count => !count), 'no write should still be in flight before the scenario starts');

    // A human edits the task locally (no MCP involved -- this is exactly how
    // local edits work today; see electron/ipc/store.cjs above).
    await bridge.runInAct(async () => {
      bridge.get().setTasks(previous => previous.map(item => item.id === taskId ? { ...item, notes: 'Local human edit' } : item));
    });
    await bridge.flushMicrotasks();

    assert.equal(bridge.get().tasks.find(item => item.id === taskId)?.notes, 'Local human edit');
    assert.ok(bridge.get().pendingCanonicalWritesRef.current?.[TASKS_KEY], 'the guard should be up while the local edit is still persisting');
    assert.ok(bridge.pendingStoreSetManyReleases.some(entry => entry.keys.includes(TASKS_KEY)), 'the local edit should have started its own tasks write-back');
    const getCallsBeforeAgentWrite = bridge.storeGetManyCallsForTasks;

    // While that local write is still in flight (not yet echoed to the
    // shared store), a real agent MCP write lands on the same task.
    await bridge.runInAct(async () => { realAgentDescriptionWrite(bridge, taskId, 'Agent update while human was editing'); });
    await bridge.flushMicrotasks();

    // Fixed behavior: the in-flight local edit is not clobbered mid-write,
    // and the sync was not silently dropped -- it must be retried, not just
    // discarded once and forgotten.
    assert.equal(bridge.get().tasks.find(item => item.id === taskId)?.notes, 'Local human edit', 'the external sync must not overwrite an edit that is still being persisted');

    // The local edit's write-back now completes. Per electron/ipc/store.cjs,
    // this is a raw, revision-blind overwrite of the shared store -- it will
    // clobber the agent's write that landed in between, exactly as it would
    // in the real app today. This is the separately-scoped OCC-asymmetry
    // gap (local edits aren't revision-guarded the way MCP writes are), not
    // part of what this pass fixed.
    await bridge.releaseStoreSetManyForKey(TASKS_KEY);

    const storedNotesAfterClobber = (bridge.mcpStore.get(TASKS_KEY) as Array<{ id: string; notes?: string }>).find(item => item.id === taskId)?.notes;
    assert.equal(storedNotesAfterClobber, 'Local human edit', 'REPORTED, NOT ASSERTED-AS-CORRECT: the local edit\'s unguarded write-back overwrote the agent\'s change in the shared store itself -- this is the write-side OCC gap from our design discussion, reproduced faithfully, and is not fixed by this change.');

    // Give the bounded retry backstop room to fire and confirm it actually
    // re-checked rather than giving up after the first drop.
    const getCallsBeforeRetryWindow = bridge.storeGetManyCallsForTasks;
    await bridge.runInAct(async () => { await new Promise(resolve => global.setTimeout(resolve, 250)); });
    await bridge.flushMicrotasks();

    assert.ok(bridge.storeGetManyCallsForTasks > getCallsBeforeRetryWindow, 'the retry backstop must re-fetch the blocked key rather than dropping it after one attempt');
    assert.ok(bridge.storeGetManyCallsForTasks > getCallsBeforeAgentWrite + 1, 'at least one retry attempt beyond the original blocked sync must have occurred');
    // Because the store was clobbered before the retry re-fetched, the retry
    // faithfully applies what is actually in the store now -- the human
    // edit -- not the agent's now-overwritten change. The retry mechanism
    // did its job (it did not drop the sync); the data loss happened one
    // layer down, at the unguarded write-back.
    assert.equal(bridge.get().tasks.find(item => item.id === taskId)?.notes, 'Local human edit', 'the retry re-applies whatever is actually in the store -- it cannot recover data already overwritten by the unguarded local write-back');
  } finally {
    await bridge.cleanup();
  }
});

test('host cleanup drains writes, clears timers, restores window, and removes its temporary store', async () => {
  const hadWindow = 'window' in globalThis;
  const originalWindow = (globalThis as { window?: unknown }).window;
  const host = await createWorkspaceExternalSyncTestHost();
  const storePath = host.mcpStore.path;

  assert.equal(existsSync(storePath), true);
  await host.cleanup();

  assert.equal(host.pendingStoreSetManyReleases.length, 0);
  assert.equal(host.activeTimerCount, 0);
  assert.equal(existsSync(storePath), false);
  assert.equal('window' in globalThis, hadWindow);
  if (hadWindow) assert.equal((globalThis as { window?: unknown }).window, originalWindow);
});
