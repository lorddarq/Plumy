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
  type AgentWatchConfig,
  normalizeTask,
  sanitizeAgentWatchConfigs,
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
  MCP_AGENT_WATCH_CONFIGS_KEY,
  MILESTONES_KEY,
  PEOPLE_KEY,
  PREFERENCES_KEY,
  STATUS_COLUMNS_KEY,
  SWIMLANES_KEY,
  TASKS_KEY,
} from './workspacePersistence.ts';

export interface WorkspaceSeeds {
  tasks: Task[];
  timelineSwimlanes: TimelineSwimlane[];
  people: Person[];
  milestones: ProjectMilestone[];
}

export interface InitialWorkspaceState extends WorkspaceSeeds {
  statusColumns: StatusColumnState[];
  agentWatchConfigs: AgentWatchConfig[];
  preferences: AppPreferences;
  goalPolicy: GoalPolicyV1;
  hasHydratedCanonicalWorkspace: boolean;
}

export function readInitialWorkspaceState(seeds: WorkspaceSeeds): InitialWorkspaceState {
  const storedTasks = readInitialWorkspaceJSON<Task[]>(TASKS_KEY, seeds.tasks);
  const taskProjects = readInitialWorkspaceJSON<TimelineSwimlane[]>(SWIMLANES_KEY, seeds.timelineSwimlanes);
  const tasks = storedTasks.map(task => normalizeTask(task, taskProjects));

  const storedProjects = readInitialWorkspaceJSON<TimelineSwimlane[]>(SWIMLANES_KEY, seeds.timelineSwimlanes);
  const timelineSwimlanes = sanitizeTimelineSwimlanes(storedProjects, seeds.timelineSwimlanes);
  const people = sanitizePeople(
    readInitialWorkspaceJSON<Person[]>(PEOPLE_KEY, seeds.people),
    seeds.people
  );
  const milestoneProjects = readInitialWorkspaceJSON<TimelineSwimlane[]>(SWIMLANES_KEY, seeds.timelineSwimlanes);
  const milestones = sanitizeMilestones(
    readInitialWorkspaceJSON<ProjectMilestone[]>(MILESTONES_KEY, seeds.milestones),
    milestoneProjects,
    seeds.milestones
  );
  const legacyPreferences = readInitialWorkspaceJSON<Partial<AppPreferences>>(PREFERENCES_KEY, {});
  const legacyWatchConfigs = readInitialWorkspaceJSON<AgentWatchConfig[]>(MCP_AGENT_WATCH_CONFIGS_KEY, []);
  const statusColumns = sanitizeStatusColumns(
    readInitialWorkspaceJSON<StatusColumnState[]>(STATUS_COLUMNS_KEY, defaultSwimlanes),
    defaultSwimlanes,
    {
      executionLoadStatusIds: legacyPreferences.executionLoadStatusIds,
      pipelineLoadStatusIds: legacyPreferences.pipelineLoadStatusIds,
      agentWatchConfigs: legacyWatchConfigs,
    }
  );
  const agentWatchConfigs = readInitialWorkspaceJSON<AgentWatchConfig[]>(MCP_AGENT_WATCH_CONFIGS_KEY, []);
  const storedPreferences = readInitialWorkspaceJSON<Partial<AppPreferences> & {
    executionLoadStatusId?: TaskStatus;
    pipelineLoadStatusId?: TaskStatus;
  }>(PREFERENCES_KEY, {});
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
    agentWatchConfigs,
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
    MCP_AGENT_WATCH_CONFIGS_KEY,
  ].some(key => getPortableStoreValue(exported, key) !== undefined);
}

function sanitizeAppPreferences(
  preferences: Partial<AppPreferences> | undefined,
  statusColumns: StatusColumnState[],
  fallback: AppPreferences
): AppPreferences {
  return sanitizePreferences(preferences, statusColumns, fallback) as AppPreferences;
}

function mirrorCanonicalJsonToLocalStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local mirroring is best effort; canonical-store updates remain non-blocking.
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
  setAgentWatchConfigs: Dispatch<SetStateAction<AgentWatchConfig[]>>;
  timelineSwimlanesRef: RefObject<TimelineSwimlane[]>;
  statusColumnsRef: RefObject<StatusColumnState[]>;
  preferencesRef: RefObject<AppPreferences>;
  goalPolicyRef: RefObject<GoalPolicyV1>;
  pendingCanonicalWritesRef: RefObject<Record<string, number>>;
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
    setAgentWatchConfigs,
    timelineSwimlanesRef,
    statusColumnsRef,
    preferencesRef,
    goalPolicyRef,
    pendingCanonicalWritesRef,
  } = options;

  const syncCanonicalWorkspaceFromExport = useCallback((exported: Record<string, unknown>) => {
    const exportedTasks = getPortableStoreValue<Task[]>(exported, TASKS_KEY);
    const exportedProjects = getPortableStoreValue<TimelineSwimlane[]>(exported, SWIMLANES_KEY);
    const exportedPeople = getPortableStoreValue<Person[]>(exported, PEOPLE_KEY);
    const exportedMilestones = getPortableStoreValue<ProjectMilestone[]>(exported, MILESTONES_KEY);
    const exportedStatusColumns = getPortableStoreValue<StatusColumnState[]>(exported, STATUS_COLUMNS_KEY);
    const exportedPreferences = getPortableStoreValue<Partial<AppPreferences>>(exported, PREFERENCES_KEY);
    const exportedGoalPolicy = getPortableStoreValue<unknown>(exported, GOAL_POLICY_KEY);
    const exportedAgentWatchConfigs = getPortableStoreValue<AgentWatchConfig[]>(exported, MCP_AGENT_WATCH_CONFIGS_KEY);
    let nextProjects = timelineSwimlanesRef.current || [];
    let nextStatusColumns = statusColumnsRef.current || defaultSwimlanes;

    if (exportedProjects !== undefined && !pendingCanonicalWritesRef.current?.[SWIMLANES_KEY]) {
      nextProjects = sanitizeTimelineSwimlanes(exportedProjects, seeds.timelineSwimlanes);
      mirrorCanonicalJsonToLocalStorage(SWIMLANES_KEY, nextProjects);
      setTimelineSwimlanes(previous => areSerializedValuesEqual(previous, nextProjects) ? previous : nextProjects);
    }
    if (exportedPeople !== undefined && !pendingCanonicalWritesRef.current?.[PEOPLE_KEY]) {
      const nextPeople = sanitizePeople(exportedPeople, seeds.people);
      mirrorCanonicalJsonToLocalStorage(PEOPLE_KEY, nextPeople);
      setPeople(previous => areSerializedValuesEqual(previous, nextPeople) ? previous : nextPeople);
    }
    if (exportedMilestones !== undefined && !pendingCanonicalWritesRef.current?.[MILESTONES_KEY]) {
      const nextMilestones = sanitizeMilestones(exportedMilestones, nextProjects, seeds.milestones);
      mirrorCanonicalJsonToLocalStorage(MILESTONES_KEY, nextMilestones);
      setMilestones(previous => areSerializedValuesEqual(previous, nextMilestones) ? previous : nextMilestones);
    }
    if (exportedStatusColumns !== undefined && !pendingCanonicalWritesRef.current?.[STATUS_COLUMNS_KEY]) {
      nextStatusColumns = sanitizeStatusColumns(exportedStatusColumns, defaultSwimlanes, {
        executionLoadStatusIds: exportedPreferences?.executionLoadStatusIds,
        pipelineLoadStatusIds: exportedPreferences?.pipelineLoadStatusIds,
        agentWatchConfigs: exportedAgentWatchConfigs,
      });
      mirrorCanonicalJsonToLocalStorage(STATUS_COLUMNS_KEY, nextStatusColumns);
      setStatusColumns(previous => areSerializedValuesEqual(previous, nextStatusColumns) ? previous : nextStatusColumns);
    }
    if (exportedPreferences !== undefined && !pendingCanonicalWritesRef.current?.[PREFERENCES_KEY]) {
      const nextPreferences = sanitizeAppPreferences(exportedPreferences, nextStatusColumns, preferencesRef.current);
      mirrorCanonicalJsonToLocalStorage(PREFERENCES_KEY, nextPreferences);
      setPreferences(previous => areSerializedValuesEqual(previous, nextPreferences) ? previous : nextPreferences);
    }
    if (exportedGoalPolicy !== undefined && !pendingCanonicalWritesRef.current?.[GOAL_POLICY_KEY]) {
      const repairedGoalPolicy = sanitizeGoalPolicy(exportedGoalPolicy, goalPolicyRef.current || undefined).policy;
      mirrorCanonicalJsonToLocalStorage(GOAL_POLICY_KEY, repairedGoalPolicy);
      setGoalPolicy(previous => areSerializedValuesEqual(previous, repairedGoalPolicy) ? previous : repairedGoalPolicy);
    }
    if (exportedAgentWatchConfigs !== undefined && !pendingCanonicalWritesRef.current?.[MCP_AGENT_WATCH_CONFIGS_KEY]) {
      const nextAgentWatchConfigs = sanitizeAgentWatchConfigs(exportedAgentWatchConfigs, []);
      mirrorCanonicalJsonToLocalStorage(MCP_AGENT_WATCH_CONFIGS_KEY, nextAgentWatchConfigs);
      setAgentWatchConfigs(previous => areSerializedValuesEqual(previous, nextAgentWatchConfigs) ? previous : nextAgentWatchConfigs);
    }
    if (exportedTasks !== undefined && !pendingCanonicalWritesRef.current?.[TASKS_KEY]) {
      const nextTasks = sanitizeTasks(exportedTasks, nextProjects, seeds.tasks);
      mirrorCanonicalJsonToLocalStorage(TASKS_KEY, nextTasks);
      setTasks(previous => areSerializedValuesEqual(previous, nextTasks) ? previous : nextTasks);
    }
  }, [goalPolicyRef, pendingCanonicalWritesRef, preferencesRef, seeds, setAgentWatchConfigs, setGoalPolicy, setMilestones, setPeople, setPreferences, setStatusColumns, setTasks, setTimelineSwimlanes, statusColumnsRef, timelineSwimlanesRef]);

  useEffect(() => {
    let cancelled = false;
    const hydrateFromCanonicalStore = async () => {
      if (typeof window !== 'undefined') {
        try {
          const exported = await window.electron?.storeExport?.();
          if (cancelled || !exported || typeof exported !== 'object') return;
          if (!hasCanonicalWorkspaceData(exported) && hasAnyPortableLocalStorageData()) {
            const migratedProjects = sanitizeTimelineSwimlanes(safeReadLocalStorageJSON(SWIMLANES_KEY, seeds.timelineSwimlanes), seeds.timelineSwimlanes);
            const migratedPeople = sanitizePeople(safeReadLocalStorageJSON(PEOPLE_KEY, seeds.people), seeds.people);
            const storedPreferences = safeReadLocalStorageJSON<Partial<AppPreferences>>(PREFERENCES_KEY, {});
            const storedAgentWatchConfigs = safeReadLocalStorageJSON<AgentWatchConfig[]>(MCP_AGENT_WATCH_CONFIGS_KEY, []);
            const migratedStatusColumns = sanitizeStatusColumns(safeReadLocalStorageJSON(STATUS_COLUMNS_KEY, defaultSwimlanes), defaultSwimlanes, {
              executionLoadStatusIds: storedPreferences.executionLoadStatusIds,
              pipelineLoadStatusIds: storedPreferences.pipelineLoadStatusIds,
              agentWatchConfigs: storedAgentWatchConfigs,
            });
            setTimelineSwimlanes(migratedProjects);
            setPeople(migratedPeople);
            setMilestones(sanitizeMilestones(safeReadLocalStorageJSON(MILESTONES_KEY, seeds.milestones), migratedProjects, seeds.milestones));
            setStatusColumns(migratedStatusColumns);
            setPreferences(sanitizeAppPreferences(storedPreferences, migratedStatusColumns, preferencesRef.current));
            setGoalPolicy(sanitizeGoalPolicy(safeReadLocalStorageJSON(GOAL_POLICY_KEY, undefined)).policy);
            setAgentWatchConfigs(sanitizeAgentWatchConfigs(storedAgentWatchConfigs, []));
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
  }, [preferencesRef, seeds, setAgentWatchConfigs, setGoalPolicy, setHasHydratedCanonicalWorkspace, setMilestones, setPeople, setPreferences, setStatusColumns, setTasks, setTimelineSwimlanes, syncCanonicalWorkspaceFromExport]);

  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace) return;
    const unsubscribe = window.electron?.onStoreChanged?.(() => {
      void window.electron?.storeExport?.().then(exported => {
        if (exported && typeof exported === 'object') syncCanonicalWorkspaceFromExport(exported);
      }).catch(() => {
        // External synchronization is best effort; keep the current workspace usable.
      });
    });
    return () => { unsubscribe?.(); };
  }, [hasHydratedCanonicalWorkspace, syncCanonicalWorkspaceFromExport]);
}
