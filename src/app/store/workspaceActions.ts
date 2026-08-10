import { type Dispatch, type RefObject, type SetStateAction, useCallback, useMemo } from 'react';
import type { Person, ProjectMilestone, Task, TaskStatus, TimelineSwimlane } from '../types.ts';
import { swimlanes as defaultSwimlanes } from '../constants/swimlanes.ts';
import { buildLocalMcpAddress } from '../constants/mcp.ts';
import { sanitizeMarkdownAppearance, type MarkdownAppearance } from '../utils/markdownAppearance.ts';
import {
  createDefaultGoalPolicy,
  resetGoalPolicy as resetGoalPolicyRecord,
  updateGoalPolicy,
  type GoalPolicyV1,
} from '../utils/goalPolicy.ts';
import type { AgentWatchConfig, StatusColumnState } from '../utils/workspaceSanitizers.ts';
import {
  deleteMilestoneFromWorkspace,
  linkTaskToMilestones,
  removeTaskFromMilestones,
  saveMilestoneRecord,
  syncMilestoneTaskLinks,
  updateRoadmapTaskDependencies,
} from './workspaceMutations.ts';
import type { AppPreferences } from './workspaceStore.tsx';

export interface WorkspaceSnapshot {
  tasks: Task[];
  timelineSwimlanes: TimelineSwimlane[];
  people: Person[];
  milestones: ProjectMilestone[];
  statusColumns: StatusColumnState[];
  preferences: AppPreferences;
  goalPolicy: GoalPolicyV1;
}

interface WorkspaceActionOptions {
  milestones: ProjectMilestone[];
  tasksRef: RefObject<Task[]>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  setTimelineSwimlanes: Dispatch<SetStateAction<TimelineSwimlane[]>>;
  setPeople: Dispatch<SetStateAction<Person[]>>;
  setMilestones: Dispatch<SetStateAction<ProjectMilestone[]>>;
  setStatusColumns: Dispatch<SetStateAction<StatusColumnState[]>>;
  setAgentWatchConfigs: Dispatch<SetStateAction<AgentWatchConfig[]>>;
  setPreferences: Dispatch<SetStateAction<AppPreferences>>;
  setGoalPolicy: Dispatch<SetStateAction<GoalPolicyV1>>;
  createDefaultPreferences: (statusColumns?: StatusColumnState[]) => AppPreferences;
}

export function useWorkspaceActions(options: WorkspaceActionOptions) {
  const {
    milestones,
    tasksRef,
    setTasks,
    setTimelineSwimlanes,
    setPeople,
    setMilestones,
    setStatusColumns,
    setAgentWatchConfigs,
    setPreferences,
    setGoalPolicy,
    createDefaultPreferences,
  } = options;

  const replaceWorkspaceSnapshot = useCallback((snapshot: WorkspaceSnapshot) => {
    setTimelineSwimlanes(snapshot.timelineSwimlanes);
    setTasks(snapshot.tasks);
    setMilestones(snapshot.milestones);
    setPeople(snapshot.people);
    setStatusColumns(snapshot.statusColumns);
    setPreferences(snapshot.preferences);
    setGoalPolicy(snapshot.goalPolicy);
  }, [setGoalPolicy, setMilestones, setPeople, setPreferences, setStatusColumns, setTasks, setTimelineSwimlanes]);

  const applyMilestoneTaskLinks = useCallback((milestone: ProjectMilestone) => {
    setTasks(previous => syncMilestoneTaskLinks(previous, milestone));
  }, [setTasks]);
  const saveMilestone = useCallback((milestone: ProjectMilestone) => {
    setMilestones(previous => saveMilestoneRecord(previous, milestone));
    applyMilestoneTaskLinks(milestone);
  }, [applyMilestoneTaskLinks, setMilestones]);
  const deleteMilestone = useCallback((milestoneId: string) => {
    const nextWorkspace = deleteMilestoneFromWorkspace(tasksRef.current || [], milestones, milestoneId);
    setMilestones(nextWorkspace.milestones);
    setTasks(nextWorkspace.tasks);
  }, [milestones, setMilestones, setTasks, tasksRef]);
  const linkTaskMilestone = useCallback((taskId: string, nextMilestoneId?: string) => {
    setMilestones(previous => linkTaskToMilestones(previous, taskId, nextMilestoneId));
  }, [setMilestones]);
  const removeTaskMilestoneLinks = useCallback((taskId: string) => {
    setMilestones(previous => removeTaskFromMilestones(previous, taskId));
  }, [setMilestones]);
  const applyRoadmapTaskDependencies = useCallback((updates: Array<{ taskId: string; dependencyIds: string[] }>) => {
    setTasks(previous => updateRoadmapTaskDependencies(previous, updates));
  }, [setTasks]);

  const toggleExecutionLoadStatus = useCallback((statusId: TaskStatus) => {
    setPreferences(previous => ({
      ...previous,
      executionLoadStatusIds: previous.executionLoadStatusIds.includes(statusId)
        ? previous.executionLoadStatusIds.filter(id => id !== statusId)
        : [...previous.executionLoadStatusIds, statusId],
    }));
  }, [setPreferences]);
  const togglePipelineLoadStatus = useCallback((statusId: TaskStatus) => {
    setPreferences(previous => ({
      ...previous,
      pipelineLoadStatusIds: previous.pipelineLoadStatusIds.includes(statusId)
        ? previous.pipelineLoadStatusIds.filter(id => id !== statusId)
        : [...previous.pipelineLoadStatusIds, statusId],
    }));
  }, [setPreferences]);
  const setUpdateChannel = useCallback((channel: AppPreferences['updateChannel']) => {
    setPreferences(previous => ({ ...previous, updateChannel: channel === 'rc' ? 'rc' : 'stable' }));
  }, [setPreferences]);
  const setMarkdownAppearance = useCallback((updates: Partial<MarkdownAppearance>) => {
    setPreferences(previous => ({
      ...previous,
      markdownAppearance: sanitizeMarkdownAppearance(
        { ...previous.markdownAppearance, ...updates },
        previous.markdownAppearance
      ),
    }));
  }, [setPreferences]);
  const setMcpAgentAccessEnabled = useCallback((enabled: boolean) => {
    setPreferences(previous => ({ ...previous, mcpAgentAccessEnabled: enabled }));
  }, [setPreferences]);
  const setCleanupGoalArtifacts = useCallback((enabled: boolean) => {
    setPreferences(previous => ({ ...previous, cleanupGoalArtifacts: enabled }));
  }, [setPreferences]);
  const setGoalAuditArchiveDirectory = useCallback((directory: string) => {
    setPreferences(previous => ({ ...previous, goalAuditArchiveDirectory: directory.trim() }));
  }, [setPreferences]);
  const setExternalSkillsDirectory = useCallback((directory: string) => {
    const root = directory.trim();
    setPreferences(previous => ({
      ...previous,
      skillRoots: root ? [{ root, source: 'omvra-configured' }] : [],
    }));
  }, [setPreferences]);
  const setCustomScrollbarsEnabled = useCallback((enabled: boolean) => {
    setPreferences(previous => ({ ...previous, customScrollbarsEnabled: enabled }));
  }, [setPreferences]);
  const setCondensedUI = useCallback((enabled: boolean) => {
    setPreferences(previous => ({ ...previous, condensedUI: enabled }));
  }, [setPreferences]);
  const setPerformanceLoggingEnabled = useCallback((enabled: boolean) => {
    setPreferences(previous => ({ ...previous, performanceLoggingEnabled: enabled }));
  }, [setPreferences]);
  const handleUpdateGoalPolicy = useCallback((updates: Parameters<typeof updateGoalPolicy>[1]) => {
    setGoalPolicy(previous => updateGoalPolicy(previous, updates));
  }, [setGoalPolicy]);
  const resetGoalPolicy = useCallback(() => {
    setGoalPolicy(previous => resetGoalPolicyRecord(previous));
  }, [setGoalPolicy]);
  const setMcpServerAddress = useCallback((address: string) => {
    setPreferences(previous => ({ ...previous, mcpServerAddress: address }));
  }, [setPreferences]);
  const setMcpBindHost = useCallback((host: string) => {
    setPreferences(previous => ({
      ...previous,
      mcpBindHost: host,
      mcpServerAddress: buildLocalMcpAddress(host, previous.mcpPort),
    }));
  }, [setPreferences]);
  const setMcpPort = useCallback((port: number) => {
    setPreferences(previous => ({
      ...previous,
      mcpPort: port,
      mcpServerAddress: buildLocalMcpAddress(previous.mcpBindHost, port),
    }));
  }, [setPreferences]);
  const setMcpAccessToken = useCallback((token: string) => {
    setPreferences(previous => ({
      ...previous,
      mcpAccessToken: token,
      mcpAccessTokenIssuedAt: token ? new Date().toISOString() : undefined,
    }));
  }, [setPreferences]);
  const setMcpAccessTokenTtlMinutes = useCallback((ttl: number) => {
    setPreferences(previous => ({
      ...previous,
      mcpAccessTokenTtlMinutes: Math.max(1, Math.min(1440, ttl || 60)),
    }));
  }, [setPreferences]);
  const setMcpCapabilityProfile = useCallback((profile: AppPreferences['mcpCapabilityProfile']) => {
    setPreferences(previous => ({ ...previous, mcpCapabilityProfile: profile }));
  }, [setPreferences]);
  const resetWorkspaceData = useCallback(() => {
    setTasks([]);
    setTimelineSwimlanes([]);
    setPeople([]);
    setMilestones([]);
    setStatusColumns(defaultSwimlanes);
    setAgentWatchConfigs([]);
    setPreferences(createDefaultPreferences(defaultSwimlanes));
    setGoalPolicy(createDefaultGoalPolicy());
  }, [createDefaultPreferences, setAgentWatchConfigs, setGoalPolicy, setMilestones, setPeople, setPreferences, setStatusColumns, setTasks, setTimelineSwimlanes]);

  return useMemo(() => ({
    replaceWorkspaceSnapshot,
    saveMilestone,
    deleteMilestone,
    syncMilestoneTaskLinks: applyMilestoneTaskLinks,
    linkTaskMilestone,
    removeTaskMilestoneLinks,
    applyRoadmapTaskDependencies,
    toggleExecutionLoadStatus,
    togglePipelineLoadStatus,
    setCleanupGoalArtifacts,
    setGoalAuditArchiveDirectory,
    setExternalSkillsDirectory,
    setCustomScrollbarsEnabled,
    setCondensedUI,
    setPerformanceLoggingEnabled,
    updateGoalPolicy: handleUpdateGoalPolicy,
    resetGoalPolicy,
    setUpdateChannel,
    setMarkdownAppearance,
    setMcpAgentAccessEnabled,
    setMcpServerAddress,
    setMcpBindHost,
    setMcpPort,
    setMcpAccessToken,
    setMcpAccessTokenTtlMinutes,
    setMcpCapabilityProfile,
    resetWorkspaceData,
  }), [
    applyMilestoneTaskLinks,
    applyRoadmapTaskDependencies,
    deleteMilestone,
    handleUpdateGoalPolicy,
    linkTaskMilestone,
    removeTaskMilestoneLinks,
    replaceWorkspaceSnapshot,
    resetGoalPolicy,
    resetWorkspaceData,
    saveMilestone,
    setCleanupGoalArtifacts,
    setCondensedUI,
    setPerformanceLoggingEnabled,
    setCustomScrollbarsEnabled,
    setExternalSkillsDirectory,
    setGoalAuditArchiveDirectory,
    setMarkdownAppearance,
    setMcpAccessToken,
    setMcpAccessTokenTtlMinutes,
    setMcpAgentAccessEnabled,
    setMcpBindHost,
    setMcpCapabilityProfile,
    setMcpPort,
    setMcpServerAddress,
    setUpdateChannel,
    toggleExecutionLoadStatus,
    togglePipelineLoadStatus,
  ]);
}
