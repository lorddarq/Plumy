import { rm } from 'node:fs/promises';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import * as React from 'react';
import TestRenderer from 'react-test-renderer';
import ElectronStore from 'electron-store';
import type { Person, ProjectMilestone, Task, TimelineSwimlane } from '../types.ts';
import { swimlanes as defaultSwimlanes } from '../constants/swimlanes.ts';
import { sanitizeGoalPolicy } from '../utils/goalPolicy.ts';
import { DEFAULT_MARKDOWN_APPEARANCE } from '../utils/markdownAppearance.ts';
import type { StatusColumnState } from '../utils/workspaceSanitizers.ts';
import storeDiff from '../../../electron/domain/store-diff.cjs';
import testFixtures from '../../../electron/services/test-fixtures.cjs';
import { useCanonicalWorkspaceHydration, type WorkspaceSeeds } from './workspaceHydration.ts';
import { TASKS_KEY, useWorkspacePersistence } from './workspacePersistence.ts';
import type { AppPreferences } from './workspaceStore.tsx';

const { act, create } = TestRenderer as unknown as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => { unmount: () => void };
};
const { loadFixture } = testFixtures as { loadFixture: (name: string) => Record<string, unknown> };
const { diffStoreSnapshots } = storeDiff as { diffStoreSnapshots: (previousNode: unknown, nextNode: unknown, isEqual: (a: unknown, b: unknown) => boolean) => Set<string> };

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

function useProbe() {
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

export async function flushExternalSyncMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

export interface ExternalSyncInitialTaskOptions {
  sourceTaskId?: string;
  id?: string;
  description?: string;
  revision?: number;
}

export interface ExternalSyncTestHostOptions {
  fixtureName?: string;
  initialTask?: ExternalSyncInitialTaskOptions;
}

interface PendingRendererWrite {
  keys: string[];
  release: () => void;
}

export interface WorkspaceExternalSyncTestHost {
  mcpStore: InstanceType<typeof ElectronStore>;
  electron: Record<string, unknown>;
  storeSetManyCalls: Array<Record<string, unknown>>;
  pendingStoreSetManyReleases: PendingRendererWrite[];
  readonly storeGetManyCallsForTasks: number;
  readonly activeTimerCount: number;
  get: () => ReturnType<typeof useProbe>;
  runInAct: (callback: () => void | Promise<void>) => Promise<void>;
  flushMicrotasks: (rounds?: number) => Promise<void>;
  emitRealStoreChangeAround: <T>(mutate: () => T) => T;
  releaseStoreSetManyForKey: (key: string) => Promise<void>;
  releaseAllStoreSetMany: () => Promise<void>;
  cleanup: () => Promise<void>;
}

function applyInitialTaskOptions(fixture: Record<string, unknown>, options: ExternalSyncInitialTaskOptions | undefined): void {
  if (!options) return;
  const tasks = fixture[TASKS_KEY];
  if (!Array.isArray(tasks)) throw new Error(`fixture does not contain ${TASKS_KEY}`);
  const sourceTaskId = options.sourceTaskId ?? 'task-1';
  const index = tasks.findIndex(task => task && typeof task === 'object' && (task as Task).id === sourceTaskId);
  if (index === -1) throw new Error(`fixture task ${sourceTaskId} not found`);
  const task = { ...(tasks[index] as Task) };
  if (options.id !== undefined) task.id = options.id;
  if (options.description !== undefined) task.notes = options.description;
  if (options.revision !== undefined) task.__mcpRevision = options.revision;
  tasks[index] = task;
}

export async function createWorkspaceExternalSyncTestHost(
  options: ExternalSyncTestHostOptions = {},
): Promise<WorkspaceExternalSyncTestHost> {
  const fixture = loadFixture(options.fixtureName ?? 'workspace-basic');
  applyInitialTaskOptions(fixture, options.initialTask);
  const mcpStore = new ElectronStore({
    name: `workspace-external-sync-test-${randomUUID()}`,
    cwd: os.tmpdir(),
  });
  for (const [key, value] of Object.entries(fixture)) mcpStore.set(key, value);

  const originalWindow = (globalThis as { window?: unknown }).window;
  const activeTimers = new Set<ReturnType<typeof global.setTimeout>>();
  let storeChangedListener: ((payload: { keys: string[] }) => void) | null = null;
  let storeGetManyCallsForTasks = 0;
  const storeSetManyCalls: Array<Record<string, unknown>> = [];
  const pendingStoreSetManyReleases: PendingRendererWrite[] = [];
  let latest: ReturnType<typeof useProbe> | undefined;
  let renderer: ReturnType<typeof create> | undefined;
  let cleanedUp = false;

  const trackedSetTimeout = (callback: () => void, delay?: number) => {
    const timer = global.setTimeout(() => {
      activeTimers.delete(timer);
      callback();
    }, delay);
    activeTimers.add(timer);
    return timer;
  };
  const trackedClearTimeout = (timer: ReturnType<typeof global.setTimeout>) => {
    activeTimers.delete(timer);
    global.clearTimeout(timer);
  };

  const electron = {
    storeGetMany: async (keys: string[]) => {
      if (keys.includes(TASKS_KEY)) storeGetManyCallsForTasks += 1;
      return Object.fromEntries(keys.map(key => [key, mcpStore.get(key)]));
    },
    storeSetMany: (values: Record<string, unknown>) => {
      storeSetManyCalls.push(values);
      return new Promise<void>(resolve => {
        pendingStoreSetManyReleases.push({
          keys: Object.keys(values),
          release: () => {
            Object.entries(values).forEach(([key, value]) => mcpStore.set(key, value));
            resolve();
          },
        });
      });
    },
    onStoreChanged: (listener: (payload: { keys: string[] }) => void) => {
      storeChangedListener = listener;
      return () => { storeChangedListener = null; };
    },
  };

  (globalThis as { window: unknown }).window = {
    electron,
    setTimeout: trackedSetTimeout,
    clearTimeout: trackedClearTimeout,
  };

  function Probe() {
    latest = useProbe();
    return null;
  }

  const flushMicrotasks = (rounds = 5) => flushExternalSyncMicrotasks(rounds);
  const releaseAllStoreSetMany = async () => {
    while (pendingStoreSetManyReleases.length > 0) {
      const pending = pendingStoreSetManyReleases.splice(0);
      await act(async () => { pending.forEach(entry => entry.release()); });
      await flushMicrotasks();
    }
  };
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await act(async () => { renderer?.unmount(); });
    await releaseAllStoreSetMany();
    activeTimers.forEach(timer => global.clearTimeout(timer));
    activeTimers.clear();
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = originalWindow;
    mcpStore.clear();
    await rm(mcpStore.path, { force: true });
  };

  try {
    await act(async () => { renderer = create(React.createElement(Probe)); });
    await flushMicrotasks();
  } catch (error) {
    await cleanup();
    throw error;
  }

  return {
    mcpStore,
    electron,
    storeSetManyCalls,
    pendingStoreSetManyReleases,
    get storeGetManyCallsForTasks() { return storeGetManyCallsForTasks; },
    get activeTimerCount() { return activeTimers.size; },
    get: () => {
      if (!latest) throw new Error('harness result not available yet');
      return latest;
    },
    runInAct: callback => act(callback),
    flushMicrotasks,
    emitRealStoreChangeAround: <T,>(mutate: () => T): T => {
      const before = JSON.parse(JSON.stringify(mcpStore.store));
      const result = mutate();
      const after = JSON.parse(JSON.stringify(mcpStore.store));
      storeChangedListener?.({ keys: [...diffStoreSnapshots(before, after, isDeepStrictEqual)] });
      return result;
    },
    releaseStoreSetManyForKey: async key => {
      const index = pendingStoreSetManyReleases.findIndex(entry => entry.keys.includes(key));
      if (index === -1) return;
      const [entry] = pendingStoreSetManyReleases.splice(index, 1);
      await act(async () => { entry.release(); });
      await flushMicrotasks();
    },
    releaseAllStoreSetMany,
    cleanup,
  };
}
