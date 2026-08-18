import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import TestRenderer from 'react-test-renderer';
import os from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import type { Person, ProjectMilestone, Task, TimelineSwimlane } from '../types.ts';
import { swimlanes as defaultSwimlanes } from '../constants/swimlanes.ts';
import { sanitizeGoalPolicy } from '../utils/goalPolicy.ts';
import { DEFAULT_MARKDOWN_APPEARANCE } from '../utils/markdownAppearance.ts';
import type { StatusColumnState } from '../utils/workspaceSanitizers.ts';
import type { AppPreferences } from './workspaceStore.tsx';
import { useWorkspacePersistence, TASKS_KEY } from './workspacePersistence.ts';
import { useCanonicalWorkspaceHydration, type WorkspaceSeeds } from './workspaceHydration.ts';
import mcpHandlers from '../../../electron/services/mcp-handlers.cjs';
import testFixtures from '../../../electron/services/test-fixtures.cjs';
import ElectronStore from 'electron-store';
import storeDiff from '../../../electron/domain/store-diff.cjs';

const { handleToolCall } = mcpHandlers as { handleToolCall: (store: unknown, req: unknown, params: unknown) => { error?: { message: string }; result?: { structuredContent: Record<string, unknown> } } };
const { loadFixture } = testFixtures as { loadFixture: (name: string) => Record<string, unknown> };
const { diffStoreSnapshots } = storeDiff as { diffStoreSnapshots: (previousNode: unknown, nextNode: unknown, isEqual: (a: unknown, b: unknown) => boolean) => Set<string> };

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

const { act, create } = TestRenderer as unknown as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => { unmount: () => void };
};

const SEEDS: WorkspaceSeeds = { tasks: [], timelineSwimlanes: [], people: [], milestones: [] };

function makeDefaultPreferences(): AppPreferences {
  return {
    executionLoadStatusIds: ['in-progress'],
    pipelineLoadStatusIds: ['open'],
    cleanupGoalArtifacts: false,
    goalAuditArchiveDirectory: '',
    skillRoots: [],
    customScrollbarsEnabled: true,
    condensedUI: false,
    performanceLoggingEnabled: false,
    updateChannel: 'stable' as const,
    markdownAppearance: { ...DEFAULT_MARKDOWN_APPEARANCE },
    mcpAgentAccessEnabled: false,
    mcpCapabilityProfile: 'task_write' as const,
    mcpBindHost: '127.0.0.1',
    mcpPort: 4173,
    mcpServerAddress: 'http://127.0.0.1:4173',
    mcpAccessToken: '',
    mcpAccessTokenIssuedAt: undefined,
    mcpAccessTokenTtlMinutes: 60,
  };
}

interface Bridge {
  mcpStore: InstanceType<typeof ElectronStore>;
  electron: Record<string, unknown>;
  storeChangedListener: ((payload: { keys: string[] }) => void) | null;
  storeSetManyCalls: Array<Record<string, unknown>>;
  pendingStoreSetManyReleases: Array<{ keys: string[]; release: () => void }>;
  releaseStoreSetManyForKey: (key: string) => void;
  storeGetManyCallsForTasks: number;
  // Wraps a store mutation the way electron/main.cjs's store.onDidAnyChange
  // handler observes one: snapshot before, run the mutation, snapshot after,
  // derive the real changed dotted keys via diffStoreSnapshots (the same
  // function main.cjs uses), and broadcast exactly that -- not a key the
  // test assumes is correct.
  emitRealStoreChangeAround: <T>(mutate: () => T) => T;
}

// Bridges the renderer's window.electron surface onto a real electron-store
// instance (not the flat-keyed MemoryStore test double used elsewhere in
// this repo's MCP tests), so "agent" writes (via handleToolCall) and
// "renderer" writes (via the persistence hook, exactly mirroring
// electron/ipc/store.cjs's real store/set-many handler above) mutate the
// SAME store with the SAME dot-notation nesting behavior production has.
// storeSetMany defers via an explicit release so the test controls the race
// window deterministically instead of racing real time.
function makeBridge(fixtureName: string): Bridge {
  const fixture = loadFixture(fixtureName);
  const mcpStore = new ElectronStore({
    name: `workspace-external-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    cwd: os.tmpdir(),
  });
  for (const [key, value] of Object.entries(fixture)) mcpStore.set(key, value);
  const state: Bridge = {
    mcpStore,
    electron: undefined as unknown as Record<string, unknown>,
    storeChangedListener: null,
    storeSetManyCalls: [],
    pendingStoreSetManyReleases: [],
    storeGetManyCallsForTasks: 0,
    emitRealStoreChangeAround: <T,>(mutate: () => T): T => {
      const before = JSON.parse(JSON.stringify(mcpStore.store));
      const result = mutate();
      const after = JSON.parse(JSON.stringify(mcpStore.store));
      const changedKeys = diffStoreSnapshots(before, after, isDeepStrictEqual);
      state.storeChangedListener?.({ keys: [...changedKeys] });
      return result;
    },
    // Initial hydration primes every canonical key present in
    // hasHydratedCanonicalWorkspace's dependency list, including ones the
    // fixture doesn't define (e.g. this fixture has no milestones/goalPolicy
    // entry, so those two persist their untouched defaults once on mount).
    // Those unrelated priming writes queue in the same
    // pendingStoreSetManyReleases list, so releases must target the batch
    // that actually contains the key under test rather than blindly
    // releasing in FIFO order.
    releaseStoreSetManyForKey: (key: string) => {
      const index = state.pendingStoreSetManyReleases.findIndex(entry => entry.keys.includes(key));
      if (index === -1) return;
      const [entry] = state.pendingStoreSetManyReleases.splice(index, 1);
      entry.release();
    },
  };
  state.electron = {
    storeGetMany: async (keys: string[]) => {
      if (keys.includes(TASKS_KEY)) state.storeGetManyCallsForTasks += 1;
      const out: Record<string, unknown> = {};
      for (const key of keys) out[key] = mcpStore.get(key);
      return out;
    },
    storeSetMany: (values: Record<string, unknown>) => {
      state.storeSetManyCalls.push(values);
      return new Promise<void>(resolve => {
        state.pendingStoreSetManyReleases.push({
          keys: Object.keys(values),
          release: () => {
            // Matches electron/ipc/store.cjs's store/set-many handler: a raw
            // per-key overwrite with no revision check whatsoever.
            Object.entries(values).forEach(([key, value]) => mcpStore.set(key, value));
            resolve();
          },
        });
      });
    },
    onStoreChanged: (listener: (payload: { keys: string[] }) => void) => {
      state.storeChangedListener = listener;
      return () => { state.storeChangedListener = null; };
    },
  };
  return state;
}

function useHarness() {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [timelineSwimlanes, setTimelineSwimlanes] = React.useState<TimelineSwimlane[]>([]);
  const [people, setPeople] = React.useState<Person[]>([]);
  const [milestones, setMilestones] = React.useState<ProjectMilestone[]>([]);
  const [statusColumns, setStatusColumns] = React.useState<StatusColumnState[]>(defaultSwimlanes as unknown as StatusColumnState[]);
  const [preferences, setPreferences] = React.useState(makeDefaultPreferences());
  const [goalPolicy, setGoalPolicy] = React.useState(sanitizeGoalPolicy(undefined).policy);
  const [hasHydratedCanonicalWorkspace, setHasHydratedCanonicalWorkspace] = React.useState(false);

  const persistence = useWorkspacePersistence({
    tasks, timelineSwimlanes, people, milestones, statusColumns, preferences, goalPolicy, hasHydratedCanonicalWorkspace,
  });

  useCanonicalWorkspaceHydration({
    seeds: SEEDS,
    hasHydratedCanonicalWorkspace,
    setHasHydratedCanonicalWorkspace,
    setTasks,
    setTimelineSwimlanes,
    setPeople,
    setMilestones,
    setStatusColumns,
    setPreferences,
    setGoalPolicy,
    timelineSwimlanesRef: persistence.timelineSwimlanesRef,
    statusColumnsRef: persistence.statusColumnsRef,
    preferencesRef: persistence.preferencesRef,
    goalPolicyRef: persistence.goalPolicyRef,
    pendingCanonicalWritesRef: persistence.pendingCanonicalWritesRef,
    suppressNextPersistRef: persistence.suppressNextPersistRef,
  });

  return { tasks, setTasks, hasHydratedCanonicalWorkspace, pendingCanonicalWritesRef: persistence.pendingCanonicalWritesRef };
}

async function flushMicrotasks(rounds = 5) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function setUpHarness(bridge: Bridge) {
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window: unknown }).window = {
    electron: bridge.electron,
    setTimeout: global.setTimeout.bind(global),
    clearTimeout: global.clearTimeout.bind(global),
  };

  let latest: ReturnType<typeof useHarness> | undefined;
  function Probe() {
    latest = useHarness();
    return null;
  }

  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(React.createElement(Probe));
  });
  await flushMicrotasks();

  return {
    get: () => {
      if (!latest) throw new Error('harness result not available yet');
      return latest;
    },
    cleanup: async () => {
      // Must be wrapped in act() so effect cleanups (which clear pending
      // retry timers via window.clearTimeout) flush synchronously before
      // the window global below is torn down; otherwise a timer firing
      // after teardown throws "window is not defined" into a detached tree.
      await act(async () => { renderer?.unmount(); });
      if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window: unknown }).window = originalWindow;
      bridge.mcpStore.clear();
    },
  };
}

// Performs the real MCP write AND derives/emits the store/did-change
// broadcast the same way electron/main.cjs would for a live agent session --
// via bridge.emitRealStoreChangeAround, not a hand-picked key. Must be
// called inside act() by the caller, since the broadcast synchronously
// triggers renderer state updates.
function realAgentDescriptionWrite(bridge: Bridge, taskId: string, description: string) {
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
function realAgentTaskCreate(bridge: Bridge) {
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
  const bridge = makeBridge('workspace-basic');
  const harness = await setUpHarness(bridge);
  try {
    const idsBeforeCreate = new Set(harness.get().tasks.map(item => item.id));
    const callsBeforeSync = bridge.storeSetManyCalls.length;
    let created: Task | undefined;

    await act(async () => { created = realAgentTaskCreate(bridge).task; });
    await flushMicrotasks();

    assert.ok(created);
    assert.equal(idsBeforeCreate.has(created!.id), false, 'the task must begin outside renderer state');

    assert.equal(harness.get().tasks.find(item => item.id === created!.id)?.title, 'Externally created task');
    assert.equal(harness.get().tasks.find(item => item.id === created!.id)?.swimlaneId, 'lane-1');
    assert.equal(bridge.storeSetManyCalls.length, callsBeforeSync, 'applying the external create must not echo the full task array back to storage');
  } finally {
    await harness.cleanup();
  }
});

test('a real MCP write applied while the renderer is idle is not echoed back to storage', async () => {
  const bridge = makeBridge('workspace-basic');
  const harness = await setUpHarness(bridge);
  try {
    const taskId = 'task-1';
    assert.equal(harness.get().tasks.find(item => item.id === taskId)?.notes, 'Implement drag', 'sanity check against the workspace-basic fixture\'s real initial content');

    const callsBeforeSync = bridge.storeSetManyCalls.length;
    await act(async () => { realAgentDescriptionWrite(bridge, taskId, 'Real agent update via handleToolCall'); });
    await flushMicrotasks();

    assert.equal(harness.get().tasks.find(item => item.id === taskId)?.notes, 'Real agent update via handleToolCall', 'the real MCP write should be reflected in the renderer');
    assert.equal(bridge.storeSetManyCalls.length, callsBeforeSync, 'applying the external sync must not itself trigger a new write-back');
    assert.equal(harness.get().pendingCanonicalWritesRef.current?.[TASKS_KEY] ?? 0, 0, 'the local-write guard must not be raised by an external sync');
  } finally {
    await harness.cleanup();
  }
});

test('a real MCP write landing while a local edit is still persisting: the drop is fixed, the write-clobber is not (reported honestly)', async () => {
  const bridge = makeBridge('workspace-basic');
  const harness = await setUpHarness(bridge);
  const taskId = 'task-1';
  try {
    // Drain the initial-mount priming write (this fixture has no milestones
    // or goalPolicy entry, so those two persist their untouched defaults
    // once on mount -- see makeBridge's comment). useWorkspacePersistence
    // shares ONE flush queue across all seven keys, so leaving this pending
    // would queue the local edit below behind it instead of giving tasks
    // its own flush, which is not what this test is exercising.
    while (bridge.pendingStoreSetManyReleases.length > 0) {
      await act(async () => { bridge.pendingStoreSetManyReleases.shift()?.release(); });
      await flushMicrotasks();
    }
    assert.ok(Object.values(harness.get().pendingCanonicalWritesRef.current ?? {}).every(count => !count), 'no write should still be in flight before the scenario starts');

    // A human edits the task locally (no MCP involved -- this is exactly how
    // local edits work today; see electron/ipc/store.cjs above).
    await act(async () => {
      harness.get().setTasks(previous => previous.map(item => item.id === taskId ? { ...item, notes: 'Local human edit' } : item));
    });
    await flushMicrotasks();

    assert.equal(harness.get().tasks.find(item => item.id === taskId)?.notes, 'Local human edit');
    assert.ok(harness.get().pendingCanonicalWritesRef.current?.[TASKS_KEY], 'the guard should be up while the local edit is still persisting');
    assert.ok(bridge.pendingStoreSetManyReleases.some(entry => entry.keys.includes(TASKS_KEY)), 'the local edit should have started its own tasks write-back');
    const getCallsBeforeAgentWrite = bridge.storeGetManyCallsForTasks;

    // While that local write is still in flight (not yet echoed to the
    // shared store), a real agent MCP write lands on the same task.
    await act(async () => { realAgentDescriptionWrite(bridge, taskId, 'Agent update while human was editing'); });
    await flushMicrotasks();

    // Fixed behavior: the in-flight local edit is not clobbered mid-write,
    // and the sync was not silently dropped -- it must be retried, not just
    // discarded once and forgotten.
    assert.equal(harness.get().tasks.find(item => item.id === taskId)?.notes, 'Local human edit', 'the external sync must not overwrite an edit that is still being persisted');

    // The local edit's write-back now completes. Per electron/ipc/store.cjs,
    // this is a raw, revision-blind overwrite of the shared store -- it will
    // clobber the agent's write that landed in between, exactly as it would
    // in the real app today. This is the separately-scoped OCC-asymmetry
    // gap (local edits aren't revision-guarded the way MCP writes are), not
    // part of what this pass fixed.
    await act(async () => { bridge.releaseStoreSetManyForKey(TASKS_KEY); });
    await flushMicrotasks();

    const storedNotesAfterClobber = (bridge.mcpStore.get(TASKS_KEY) as Array<{ id: string; notes?: string }>).find(item => item.id === taskId)?.notes;
    assert.equal(storedNotesAfterClobber, 'Local human edit', 'REPORTED, NOT ASSERTED-AS-CORRECT: the local edit\'s unguarded write-back overwrote the agent\'s change in the shared store itself -- this is the write-side OCC gap from our design discussion, reproduced faithfully, and is not fixed by this change.');

    // Give the bounded retry backstop room to fire and confirm it actually
    // re-checked rather than giving up after the first drop.
    const getCallsBeforeRetryWindow = bridge.storeGetManyCallsForTasks;
    await act(async () => { await new Promise(resolve => global.setTimeout(resolve, 250)); });
    await flushMicrotasks();

    assert.ok(bridge.storeGetManyCallsForTasks > getCallsBeforeRetryWindow, 'the retry backstop must re-fetch the blocked key rather than dropping it after one attempt');
    assert.ok(bridge.storeGetManyCallsForTasks > getCallsBeforeAgentWrite + 1, 'at least one retry attempt beyond the original blocked sync must have occurred');
    // Because the store was clobbered before the retry re-fetched, the retry
    // faithfully applies what is actually in the store now -- the human
    // edit -- not the agent's now-overwritten change. The retry mechanism
    // did its job (it did not drop the sync); the data loss happened one
    // layer down, at the unguarded write-back.
    assert.equal(harness.get().tasks.find(item => item.id === taskId)?.notes, 'Local human edit', 'the retry re-applies whatever is actually in the store -- it cannot recover data already overwritten by the unguarded local write-back');
  } finally {
    await harness.cleanup();
  }
});
