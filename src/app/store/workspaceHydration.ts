import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect } from 'react';
import type { Person, ProjectMilestone, Task, TaskStatus, TimelineSwimlane } from '../types.ts';
import { swimlanes as defaultSwimlanes } from '../constants/swimlanes.ts';
import { buildLocalMcpAddress, DEFAULT_MCP_BIND_HOST, DEFAULT_MCP_PORT } from '../constants/mcp.ts';
import { shouldBootstrapFromLocalStorage } from '../utils/canonicalHydration.js';
import { DEFAULT_MARKDOWN_APPEARANCE, sanitizeMarkdownAppearance } from '../utils/markdownAppearance.ts';
import { getDefaultStatusId } from '../utils/mcpPreferences.ts';
import {
  getPortableStoreValue,
  hasAnyPortableLocalStorageData,
  readInitialWorkspaceJSON,
  safeReadLocalStorageJSON,
} from '../utils/storage.ts';
import { GOAL_POLICY_KEY, sanitizeGoalPolicy, type GoalPolicyV1 } from '../utils/goalPolicy.ts';
import {
  normalizeTask,
  sanitizeMilestones,
  sanitizePeople,
  sanitizePreferences,
  sanitizeStatusColumns,
  sanitizeTasks,
  sanitizeTimelineSwimlanes,
  type StatusColumnState,
} from '../utils/workspaceSanitizers.ts';
import type { AppPreferences } from './workspaceStore.tsx';
import { areSerializedValuesEqual, normalizeLoadStatusIds } from './workspaceSelectors.ts';
import {
  MILESTONES_KEY,
  PEOPLE_KEY,
  PREFERENCES_KEY,
  STATUS_COLUMNS_KEY,
  SWIMLANES_KEY,
  TASKS_KEY,
} from './workspacePersistence.ts';

const CANONICAL_WORKSPACE_KEYS = [
  TASKS_KEY,
  SWIMLANES_KEY,
  PEOPLE_KEY,
  MILESTONES_KEY,
  STATUS_COLUMNS_KEY,
  PREFERENCES_KEY,
  GOAL_POLICY_KEY,
];

// A blocked external sync (pendingCanonicalWritesRef was up for that key,
// meaning a local write was in flight) is retried a bounded number of times
// rather than dropped, so a legitimate concurrent write is applied late
// instead of lost until the next unrelated change to that key.
const MAX_EXTERNAL_SYNC_RETRIES = 5;
const EXTERNAL_SYNC_RETRY_DELAY_MS = 150;

async function readCanonicalWorkspaceSnapshot(keys: string[] = CANONICAL_WORKSPACE_KEYS): Promise<Record<string, unknown>> {
  const scopedRead = window.electron?.storeGetMany;
  if (typeof scopedRead === 'function') {
    return scopedRead(keys);
  }
  const exported = await window.electron?.storeExport?.();
  return exported && typeof exported === 'object' ? exported : {};
}

export interface WorkspaceSeeds {
  tasks: Task[];
  timelineSwimlanes: TimelineSwimlane[];
  people: Person[];
  milestones: ProjectMilestone[];
}

export interface InitialWorkspaceState extends WorkspaceSeeds {
  statusColumns: StatusColumnState[];
  preferences: AppPreferences;
  goalPolicy: GoalPolicyV1;
  hasHydratedCanonicalWorkspace: boolean;
}

export function readInitialWorkspaceState(seeds: WorkspaceSeeds): InitialWorkspaceState {
  const storedProjects = readInitialWorkspaceJSON<TimelineSwimlane[]>(SWIMLANES_KEY, seeds.timelineSwimlanes);
  const storedPreferences = readInitialWorkspaceJSON<Partial<AppPreferences> & {
    executionLoadStatusId?: TaskStatus;
    pipelineLoadStatusId?: TaskStatus;
  }>(PREFERENCES_KEY, {});
  const storedMilestones = readInitialWorkspaceJSON<ProjectMilestone[]>(MILESTONES_KEY, seeds.milestones);
  const storedTasks = readInitialWorkspaceJSON<Task[]>(TASKS_KEY, seeds.tasks);
  const tasks = storedTasks.map(task => normalizeTask(task, storedProjects));
  const timelineSwimlanes = sanitizeTimelineSwimlanes(storedProjects, seeds.timelineSwimlanes);
  const people = sanitizePeople(
    readInitialWorkspaceJSON<Person[]>(PEOPLE_KEY, seeds.people),
    seeds.people
  );
  const milestoneProjects = storedProjects;
  const milestones = sanitizeMilestones(
    storedMilestones,
    milestoneProjects,
    seeds.milestones
  );
  const statusColumns = sanitizeStatusColumns(
    readInitialWorkspaceJSON<StatusColumnState[]>(STATUS_COLUMNS_KEY, defaultSwimlanes),
    defaultSwimlanes,
    {
      executionLoadStatusIds: storedPreferences.executionLoadStatusIds,
      pipelineLoadStatusIds: storedPreferences.pipelineLoadStatusIds,
    }
  );
  const executionDefault = getDefaultStatusId(defaultSwimlanes, 'in-progress');
  const pipelineDefault = getDefaultStatusId(defaultSwimlanes, 'open');
  const preferences: AppPreferences = {
    executionLoadStatusIds: normalizeLoadStatusIds(
      storedPreferences.executionLoadStatusIds ?? storedPreferences.executionLoadStatusId,
      [executionDefault],
      defaultSwimlanes
    ),
    pipelineLoadStatusIds: normalizeLoadStatusIds(
      storedPreferences.pipelineLoadStatusIds ?? storedPreferences.pipelineLoadStatusId,
      [pipelineDefault],
      defaultSwimlanes
    ),
    cleanupGoalArtifacts: Boolean(storedPreferences.cleanupGoalArtifacts),
    goalAuditArchiveDirectory: typeof storedPreferences.goalAuditArchiveDirectory === 'string' ? storedPreferences.goalAuditArchiveDirectory : '',
    skillRoots: Array.isArray(storedPreferences.skillRoots)
      ? storedPreferences.skillRoots.filter(item => item && typeof item.root === 'string' && item.root.trim()).map(item => ({ root: item.root.trim(), source: typeof item.source === 'string' ? item.source : 'omvra-configured' }))
      : [],
    customScrollbarsEnabled: storedPreferences.customScrollbarsEnabled !== false,
    condensedUI: storedPreferences.condensedUI === true,
    performanceLoggingEnabled: storedPreferences.performanceLoggingEnabled === true,
    updateChannel: storedPreferences.updateChannel === 'rc' ? 'rc' : 'stable',
    markdownAppearance: sanitizeMarkdownAppearance(storedPreferences.markdownAppearance, DEFAULT_MARKDOWN_APPEARANCE),
    mcpAgentAccessEnabled: Boolean(storedPreferences.mcpAgentAccessEnabled),
    mcpCapabilityProfile: storedPreferences.mcpCapabilityProfile === 'task_write' || storedPreferences.mcpCapabilityProfile === 'admin'
      ? storedPreferences.mcpCapabilityProfile
      : 'read_only',
    mcpBindHost: typeof storedPreferences.mcpBindHost === 'string' ? storedPreferences.mcpBindHost : DEFAULT_MCP_BIND_HOST,
    mcpPort: Number.isFinite(Number(storedPreferences.mcpPort)) ? Number(storedPreferences.mcpPort) : DEFAULT_MCP_PORT,
    mcpServerAddress: typeof storedPreferences.mcpServerAddress === 'string'
      ? storedPreferences.mcpServerAddress
      : buildLocalMcpAddress(DEFAULT_MCP_BIND_HOST, DEFAULT_MCP_PORT),
    mcpAccessToken: typeof storedPreferences.mcpAccessToken === 'string' ? storedPreferences.mcpAccessToken : '',
    mcpAccessTokenIssuedAt: typeof storedPreferences.mcpAccessTokenIssuedAt === 'string' ? storedPreferences.mcpAccessTokenIssuedAt : undefined,
    mcpAccessTokenTtlMinutes: Number.isFinite(Number(storedPreferences.mcpAccessTokenTtlMinutes))
      ? Math.max(1, Math.min(1440, Number(storedPreferences.mcpAccessTokenTtlMinutes)))
      : 60,
  };

  return {
    tasks,
    timelineSwimlanes,
    people,
    milestones,
    statusColumns,
    preferences,
    goalPolicy: sanitizeGoalPolicy(readInitialWorkspaceJSON<unknown>(GOAL_POLICY_KEY, undefined)).policy,
    hasHydratedCanonicalWorkspace: shouldBootstrapFromLocalStorage(),
  };
}

export function hasCanonicalWorkspaceData(exported: Record<string, unknown>): boolean {
  return [
    TASKS_KEY,
    SWIMLANES_KEY,
    PEOPLE_KEY,
    MILESTONES_KEY,
    STATUS_COLUMNS_KEY,
    PREFERENCES_KEY,
    GOAL_POLICY_KEY,
  ].some(key => getPortableStoreValue(exported, key) !== undefined);
}

function sanitizeAppPreferences(
  preferences: Partial<AppPreferences> | undefined,
  statusColumns: StatusColumnState[],
  fallback: AppPreferences
): AppPreferences {
  return sanitizePreferences(preferences, statusColumns, fallback) as AppPreferences;
}

const pendingLocalMirrorWrites = new Map<string, unknown>();
let localMirrorFlushTimer: number | null = null;

function flushLocalMirrorWrites(): void {
  localMirrorFlushTimer = null;
  if (typeof window === 'undefined') return;
  const writes = Array.from(pendingLocalMirrorWrites.entries());
  pendingLocalMirrorWrites.clear();
  writes.forEach(([key, value]) => {
    try {
      if (value === undefined) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local mirroring is best effort; canonical-store updates remain non-blocking.
    }
  });
}

function mirrorCanonicalJsonToLocalStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  pendingLocalMirrorWrites.set(key, value);
  if (localMirrorFlushTimer === null) {
    localMirrorFlushTimer = window.setTimeout(flushLocalMirrorWrites, 0);
  }
}

interface WorkspaceHydrationOptions {
  seeds: WorkspaceSeeds;
  hasHydratedCanonicalWorkspace: boolean;
  setHasHydratedCanonicalWorkspace: Dispatch<SetStateAction<boolean>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  setTimelineSwimlanes: Dispatch<SetStateAction<TimelineSwimlane[]>>;
  setPeople: Dispatch<SetStateAction<Person[]>>;
  setMilestones: Dispatch<SetStateAction<ProjectMilestone[]>>;
  setStatusColumns: Dispatch<SetStateAction<StatusColumnState[]>>;
  setPreferences: Dispatch<SetStateAction<AppPreferences>>;
  setGoalPolicy: Dispatch<SetStateAction<GoalPolicyV1>>;
  timelineSwimlanesRef: RefObject<TimelineSwimlane[]>;
  statusColumnsRef: RefObject<StatusColumnState[]>;
  preferencesRef: RefObject<AppPreferences>;
  goalPolicyRef: RefObject<GoalPolicyV1>;
  pendingCanonicalWritesRef: RefObject<Record<string, number>>;
  suppressNextPersistRef: RefObject<Record<string, boolean>>;
}

export function useCanonicalWorkspaceHydration(options: WorkspaceHydrationOptions): void {
  const {
    seeds,
    hasHydratedCanonicalWorkspace,
    setHasHydratedCanonicalWorkspace,
    setTasks,
    setTimelineSwimlanes,
    setPeople,
    setMilestones,
    setStatusColumns,
    setPreferences,
    setGoalPolicy,
    timelineSwimlanesRef,
    statusColumnsRef,
    preferencesRef,
    goalPolicyRef,
    pendingCanonicalWritesRef,
    suppressNextPersistRef,
  } = options;

  // Applies an external snapshot (initial hydration or a store/did-change
  // push, e.g. from an MCP write) to renderer state. Returns the subset of
  // canonical keys that were present in `exported` but skipped because a
  // local write to that key was still in flight (pendingCanonicalWritesRef),
  // so the caller can retry them instead of treating the sync as done.
  const syncCanonicalWorkspaceFromExport = useCallback((exported: Record<string, unknown>): string[] => {
    const exportedTasks = getPortableStoreValue<Task[]>(exported, TASKS_KEY);
    const exportedProjects = getPortableStoreValue<TimelineSwimlane[]>(exported, SWIMLANES_KEY);
    const exportedPeople = getPortableStoreValue<Person[]>(exported, PEOPLE_KEY);
    const exportedMilestones = getPortableStoreValue<ProjectMilestone[]>(exported, MILESTONES_KEY);
    const exportedStatusColumns = getPortableStoreValue<StatusColumnState[]>(exported, STATUS_COLUMNS_KEY);
    const exportedPreferences = getPortableStoreValue<Partial<AppPreferences>>(exported, PREFERENCES_KEY);
    const exportedGoalPolicy = getPortableStoreValue<unknown>(exported, GOAL_POLICY_KEY);
    let nextProjects = timelineSwimlanesRef.current || [];
    let nextStatusColumns = statusColumnsRef.current || defaultSwimlanes;
    const blockedKeys: string[] = [];

    if (exportedProjects !== undefined) {
      if (pendingCanonicalWritesRef.current?.[SWIMLANES_KEY]) {
        blockedKeys.push(SWIMLANES_KEY);
      } else {
        nextProjects = sanitizeTimelineSwimlanes(exportedProjects, seeds.timelineSwimlanes);
        mirrorCanonicalJsonToLocalStorage(SWIMLANES_KEY, nextProjects);
        setTimelineSwimlanes(previous => {
          if (areSerializedValuesEqual(previous, nextProjects)) return previous;
          suppressNextPersistRef.current[SWIMLANES_KEY] = true;
          return nextProjects;
        });
      }
    }
    if (exportedPeople !== undefined) {
      if (pendingCanonicalWritesRef.current?.[PEOPLE_KEY]) {
        blockedKeys.push(PEOPLE_KEY);
      } else {
        const nextPeople = sanitizePeople(exportedPeople, seeds.people);
        mirrorCanonicalJsonToLocalStorage(PEOPLE_KEY, nextPeople);
        setPeople(previous => {
          if (areSerializedValuesEqual(previous, nextPeople)) return previous;
          suppressNextPersistRef.current[PEOPLE_KEY] = true;
          return nextPeople;
        });
      }
    }
    if (exportedMilestones !== undefined) {
      if (pendingCanonicalWritesRef.current?.[MILESTONES_KEY]) {
        blockedKeys.push(MILESTONES_KEY);
      } else {
        const nextMilestones = sanitizeMilestones(exportedMilestones, nextProjects, seeds.milestones);
        mirrorCanonicalJsonToLocalStorage(MILESTONES_KEY, nextMilestones);
        setMilestones(previous => {
          if (areSerializedValuesEqual(previous, nextMilestones)) return previous;
          suppressNextPersistRef.current[MILESTONES_KEY] = true;
          return nextMilestones;
        });
      }
    }
    if (exportedStatusColumns !== undefined) {
      if (pendingCanonicalWritesRef.current?.[STATUS_COLUMNS_KEY]) {
        blockedKeys.push(STATUS_COLUMNS_KEY);
      } else {
        nextStatusColumns = sanitizeStatusColumns(exportedStatusColumns, defaultSwimlanes, {
          executionLoadStatusIds: exportedPreferences?.executionLoadStatusIds,
          pipelineLoadStatusIds: exportedPreferences?.pipelineLoadStatusIds,
        });
        mirrorCanonicalJsonToLocalStorage(STATUS_COLUMNS_KEY, nextStatusColumns);
        setStatusColumns(previous => {
          if (areSerializedValuesEqual(previous, nextStatusColumns)) return previous;
          suppressNextPersistRef.current[STATUS_COLUMNS_KEY] = true;
          return nextStatusColumns;
        });
      }
    }
    if (exportedPreferences !== undefined) {
      if (pendingCanonicalWritesRef.current?.[PREFERENCES_KEY]) {
        blockedKeys.push(PREFERENCES_KEY);
      } else {
        const nextPreferences = sanitizeAppPreferences(exportedPreferences, nextStatusColumns, preferencesRef.current);
        mirrorCanonicalJsonToLocalStorage(PREFERENCES_KEY, nextPreferences);
        setPreferences(previous => {
          if (areSerializedValuesEqual(previous, nextPreferences)) return previous;
          suppressNextPersistRef.current[PREFERENCES_KEY] = true;
          return nextPreferences;
        });
      }
    }
    if (exportedGoalPolicy !== undefined) {
      if (pendingCanonicalWritesRef.current?.[GOAL_POLICY_KEY]) {
        blockedKeys.push(GOAL_POLICY_KEY);
      } else {
        const repairedGoalPolicy = sanitizeGoalPolicy(exportedGoalPolicy, goalPolicyRef.current || undefined).policy;
        mirrorCanonicalJsonToLocalStorage(GOAL_POLICY_KEY, repairedGoalPolicy);
        setGoalPolicy(previous => {
          if (areSerializedValuesEqual(previous, repairedGoalPolicy)) return previous;
          suppressNextPersistRef.current[GOAL_POLICY_KEY] = true;
          return repairedGoalPolicy;
        });
      }
    }
    if (exportedTasks !== undefined) {
      if (pendingCanonicalWritesRef.current?.[TASKS_KEY]) {
        blockedKeys.push(TASKS_KEY);
      } else {
        const nextTasks = sanitizeTasks(exportedTasks, nextProjects, seeds.tasks);
        mirrorCanonicalJsonToLocalStorage(TASKS_KEY, nextTasks);
        setTasks(previous => {
          if (areSerializedValuesEqual(previous, nextTasks)) return previous;
          suppressNextPersistRef.current[TASKS_KEY] = true;
          return nextTasks;
        });
      }
    }
    return blockedKeys;
  }, [goalPolicyRef, pendingCanonicalWritesRef, preferencesRef, seeds, setGoalPolicy, setMilestones, setPeople, setPreferences, setStatusColumns, setTasks, setTimelineSwimlanes, statusColumnsRef, suppressNextPersistRef, timelineSwimlanesRef]);

  useEffect(() => {
    let cancelled = false;
    const hydrateFromCanonicalStore = async () => {
      if (typeof window !== 'undefined') {
        try {
          const exported = await readCanonicalWorkspaceSnapshot();
          if (cancelled || !exported || typeof exported !== 'object') return;
          if (!hasCanonicalWorkspaceData(exported) && hasAnyPortableLocalStorageData()) {
            const migratedProjects = sanitizeTimelineSwimlanes(safeReadLocalStorageJSON(SWIMLANES_KEY, seeds.timelineSwimlanes), seeds.timelineSwimlanes);
            const migratedPeople = sanitizePeople(safeReadLocalStorageJSON(PEOPLE_KEY, seeds.people), seeds.people);
            const storedPreferences = safeReadLocalStorageJSON<Partial<AppPreferences>>(PREFERENCES_KEY, {});
            const migratedStatusColumns = sanitizeStatusColumns(safeReadLocalStorageJSON(STATUS_COLUMNS_KEY, defaultSwimlanes), defaultSwimlanes, {
              executionLoadStatusIds: storedPreferences.executionLoadStatusIds,
              pipelineLoadStatusIds: storedPreferences.pipelineLoadStatusIds,
            });
            setTimelineSwimlanes(migratedProjects);
            setPeople(migratedPeople);
            setMilestones(sanitizeMilestones(safeReadLocalStorageJSON(MILESTONES_KEY, seeds.milestones), migratedProjects, seeds.milestones));
            setStatusColumns(migratedStatusColumns);
            setPreferences(sanitizeAppPreferences(storedPreferences, migratedStatusColumns, preferencesRef.current));
            setGoalPolicy(sanitizeGoalPolicy(safeReadLocalStorageJSON(GOAL_POLICY_KEY, undefined)).policy);
            setTasks(sanitizeTasks(safeReadLocalStorageJSON(TASKS_KEY, seeds.tasks), migratedProjects, seeds.tasks));
            return;
          }
          syncCanonicalWorkspaceFromExport(exported);
        } finally {
          if (!cancelled) setHasHydratedCanonicalWorkspace(true);
        }
      } else if (!cancelled) {
        setHasHydratedCanonicalWorkspace(true);
      }
    };
    void hydrateFromCanonicalStore();
    return () => { cancelled = true; };
  }, [preferencesRef, seeds, setGoalPolicy, setHasHydratedCanonicalWorkspace, setMilestones, setPeople, setPreferences, setStatusColumns, setTasks, setTimelineSwimlanes, syncCanonicalWorkspaceFromExport]);

  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace) return;
    const retryTimeoutIds: number[] = [];

    const applyExternalChange = (keys: string[], attempt = 0) => {
      void readCanonicalWorkspaceSnapshot(keys).then(exported => {
        if (!exported || typeof exported !== 'object') return;
        const blockedKeys = syncCanonicalWorkspaceFromExport(exported);
        // A key can still be blocked here (a local edit is genuinely still
        // in flight for it); retry with backoff instead of dropping the
        // external update, bounded so a stuck local write can't retry forever.
        if (blockedKeys.length > 0 && attempt < MAX_EXTERNAL_SYNC_RETRIES) {
          retryTimeoutIds.push(window.setTimeout(() => applyExternalChange(blockedKeys, attempt + 1), EXTERNAL_SYNC_RETRY_DELAY_MS));
        }
      }).catch(() => {
        // External synchronization is best effort; keep the current workspace usable.
      });
    };

    const unsubscribe = window.electron?.onStoreChanged?.((payload) => {
      const changedKeys = Array.isArray(payload?.keys)
        ? payload.keys.filter(key => CANONICAL_WORKSPACE_KEYS.includes(key))
        : CANONICAL_WORKSPACE_KEYS;
      if (changedKeys.length === 0) return;
      applyExternalChange(changedKeys);
    });
    return () => {
      unsubscribe?.();
      retryTimeoutIds.forEach(id => window.clearTimeout(id));
    };
  }, [hasHydratedCanonicalWorkspace, syncCanonicalWorkspaceFromExport]);
}
