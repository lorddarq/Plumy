import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Task, TaskStatus } from '../types.ts';
import type { GoalPolicyV1 } from '../utils/goalPolicy.ts';
import { useWorkspaceStore } from '../store/workspaceStore.tsx';
import { useUiLayoutStore } from '../store/uiLayoutStore.tsx';
import { useStorageMeter } from './useStorageMeter.ts';
import { buildWorkspaceReadModel } from '../domain/workspaceReadModel.ts';
import { useTaskActions } from './useTaskActions.ts';
import { useProjectActions } from './useProjectActions.ts';
import { useStatusColumnActions } from './useStatusColumnActions.ts';
import { getMilestoneProjectIds } from '../utils/roadmap.ts';
import { createMcpReadService } from '../services/mcp/service.ts';
import { useMcpHealthValidation } from './useMcpHealthValidation.ts';
import { useMcpPanelState } from './useMcpPanelState.ts';
import { getAgentWatchPollingInterval, useAgentWatchRuntime } from './useAgentWatchRuntime.ts';
import { getStatusIdsForLoad } from '../utils/statusColumnSemantics.ts';
import { usePeopleActions } from './usePeopleActions.ts';
import {
  buildWorkspaceBackupPayload,
  buildGoalPolicyBackupPayload,
  downloadWorkspaceBackupPayload,
  parseWorkspaceBackupJson,
  repairGoalPolicyBackupPayload,
  repairWorkspaceBackupPayload,
  WORKSPACE_BACKUP_SCHEMA_VERSION,
} from '../services/workspaceBackup.ts';
import {
  clearPortableElectronStoreKeys,
  getPortableElectronStoreSnapshot,
  getPortableStorageSnapshot,
  restorePortableStorageSnapshot,
} from '../utils/storage.ts';
import { useMcpDiagnostics } from './useMcpDiagnostics.ts';
import type { AppMainViewsProps } from '../components/views/AppMainViews.tsx';
import type { AppPanelsProps } from '../components/AppPanels.tsx';
import type { AppStatusBarProps } from '../components/statuses/AppStatusBar.tsx';
import type { ComponentProps } from 'react';
import { AppHeader } from '../components/headers/AppHeader.tsx';
import { DeleteConfirmDialog } from '../components/dialogs/DeleteConfirmDialog.tsx';
import { UpdateAvailablePopup } from '../components/UpdateAvailablePopup.tsx';
import {
  normalizeMcpBindHost,
  normalizeMcpPort,
  normalizeMcpServerAddress,
} from '../constants/mcp.ts';

function areSerializedValuesEqual(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function normalizeLoadStatusIds(
  value: unknown,
  fallback: TaskStatus[],
  statusColumns: Array<{ id: string }>
): TaskStatus[] {
  const validIds = new Set(statusColumns.map(column => column.id));
  const candidates = Array.isArray(value) ? value : typeof value === 'string' ? [value] : fallback;
  const normalized = candidates.filter((statusId): statusId is TaskStatus => (
    typeof statusId === 'string' && validIds.has(statusId)
  ));

  return Array.from(new Set(normalized));
}

export interface AppShellState {
  isHydrated: boolean;
  headerProps: ComponentProps<typeof AppHeader>;
  mainViewsProps: AppMainViewsProps;
  statusBarProps: AppStatusBarProps;
  panelsProps: AppPanelsProps;
  updatePopupProps: ComponentProps<typeof UpdateAvailablePopup>;
  deleteConfirmProps: ComponentProps<typeof DeleteConfirmDialog>;
}

export function useAppShell(): AppShellState {
  const {
    tasks,
    setTasks,
    timelineSwimlanes,
    setTimelineSwimlanes,
    people,
    setPeople,
    milestones,
    setMilestones,
    statusColumns,
    setStatusColumns,
    agentWatchConfigs,
    setAgentWatchConfigs,
    preferences,
    setPreferences,
    goalPolicy,
    setGoalPolicy,
    updateGoalPolicy,
    resetGoalPolicy,
    setUpdateChannel,
    setMarkdownAppearance,
    setCleanupGoalArtifacts,
    setGoalAuditArchiveDirectory,
    setExternalSkillsDirectory,
    setCustomScrollbarsEnabled,
    setCondensedUI,
    replaceWorkspaceSnapshot,
    saveMilestone,
    deleteMilestone,
    linkTaskMilestone,
    removeTaskMilestoneLinks,
    applyRoadmapTaskDependencies,
    setMcpAgentAccessEnabled,
    setMcpServerAddress,
    setMcpBindHost,
    setMcpPort,
    setMcpAccessToken,
    setMcpAccessTokenTtlMinutes,
    setMcpCapabilityProfile,
    hasHydratedCanonicalWorkspace,
    resetWorkspaceData,
  } = useWorkspaceStore();
  const executionLoadStatusIds = useMemo(() => [
    ...getStatusIdsForLoad(statusColumns, 'in-progress'),
    ...getStatusIdsForLoad(statusColumns, 'in-review'),
  ] as TaskStatus[], [statusColumns]);
  const pipelineLoadStatusIds = useMemo(
    () => getStatusIdsForLoad(statusColumns, 'open-tasks') as TaskStatus[],
    [statusColumns]
  );
  const {
    hasHydratedUiState,
    timelineLayoutState,
    setTimelineLayoutState,
    hydratedKanbanFilters,
    isTaskDialogOpen,
    isTaskDetailsOpen,
    isSwimlaneDialogOpen,
    isPreferencesOpen,
    preferencesInitialAnchor,
    selectedTask,
    detailsTask,
    selectedSwimlane,
    defaultStatus,
    defaultDate,
    defaultEndDate,
    defaultSwimlaneId,
    defaultAssigneeId,
    selectedMilestone,
    detailsMilestone,
    isMilestoneDialogOpen,
    importFeedback,
    resetLocalDataConfirmOpen,
    currentView,
    switchView,
    getViewStateSnapshot,
    applyKanbanScrollState,
    setTimelineScrollState,
    restoreKanbanScroll,
    buildBackupUiState,
    restoreImportedUiState,
    viewRefreshKey,
    bumpViewRefreshKey,
    setImportFeedback,
    setResetLocalDataConfirmOpen,
    openPreferences,
    closePreferences,
    openPeoplePanel,
    openAgentsPanel,
    closeTaskDetails,
    addMilestone,
    openMilestoneDetails,
    editMilestoneFromDetails,
    closeMilestoneDialog,
    closeMilestoneDetails,
    handleMilestoneTaskClick,
    handleTaskClick,
    handleEditTaskFromKanban,
    handleEditTaskFromDetails,
    handleAddTaskFromTimeline,
    handleAddTaskFromSwimlane,
    handleCloseTaskDialog,
    handleEditSwimlane,
    handleAddSwimlane,
    handleCloseSwimlaneDialog,
    resetUiLayoutState,
  } = useUiLayoutStore();

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const kanbanContainerRef = useRef<HTMLDivElement>(null);

  const storageMeter = useStorageMeter({
    enabled: isPreferencesOpen,
    dependencies: [
      tasks,
      timelineSwimlanes,
      people,
      milestones,
      statusColumns,
      preferences,
      goalPolicy,
    ],
  });

  const workspaceReadModel = useMemo(
    () => buildWorkspaceReadModel({
      tasks,
      milestones,
      projects: timelineSwimlanes,
      people,
      statusColumns,
    }),
    [milestones, people, statusColumns, tasks, timelineSwimlanes]
  );

  const {
    saveTask: handleSaveTask,
    addTaskComment: handleAddTaskComment,
    updateTaskAttachments: handleUpdateTaskAttachments,
    deleteTask: handleDeleteTask,
    duplicateTask: handleDuplicateTask,
    moveTask: handleMoveTask,
    moveAgentTaskToReview: handleMoveAgentTaskToReview,
    updateTaskDates: handleUpdateTaskDates,
  } = useTaskActions({
    people,
    setTasks,
    onTaskMilestoneChange: linkTaskMilestone,
    onTaskDeleted: removeTaskMilestoneLinks,
  });
  const {
    saveSwimlane: handleSaveSwimlane,
    deleteSwimlane: deleteSwimlaneBase,
    reorderSwimlanes: handleReorderSwimlanes,
  } = useProjectActions({
    timelineSwimlanes,
    setTimelineSwimlanes,
    setTasks,
  });
  const handleDeleteSwimlane = useCallback((swimlaneId: string) => {
    deleteSwimlaneBase(swimlaneId);
    setMilestones(prevMilestones =>
      prevMilestones
        .map(milestone => {
          const projectIds = getMilestoneProjectIds(milestone)
            .filter(projectId => projectId !== swimlaneId);
          return { ...milestone, projectIds, projectId: projectIds[0] };
        })
        .filter(milestone => milestone.projectIds.length > 0)
    );
  }, [deleteSwimlaneBase, setMilestones]);
  const {
    updateStatusColumn: handleUpdateStatusColumn,
    reorderStatusColumns: handleReorderStatusColumns,
    addStatusColumn: handleAddStatusColumn,
    deleteStatusColumn: handleDeleteStatusColumn,
  } = useStatusColumnActions({
    statusColumns,
    tasks,
    setStatusColumns,
    setTasks,
  });

  const mcpReadService = useMemo(() => createMcpReadService({
    enabled: preferences.mcpAgentAccessEnabled,
    endpoint: preferences.mcpServerAddress,
    headers: preferences.mcpAccessToken
      ? { Authorization: `Bearer ${preferences.mcpAccessToken}` }
      : undefined,
  }), [preferences.mcpAccessToken, preferences.mcpAgentAccessEnabled, preferences.mcpServerAddress]);
  const mcpHealth = useMcpHealthValidation({
    enabled: preferences.mcpAgentAccessEnabled,
    endpoint: preferences.mcpServerAddress,
    headers: preferences.mcpAccessToken
      ? { Authorization: `Bearer ${preferences.mcpAccessToken}` }
      : undefined,
    expectation: {
      counts: {
        tasks: tasks.length,
        people: people.length,
        swimlanes: timelineSwimlanes.length,
        statusColumns: statusColumns.length,
      },
      requiredTaskKeys: ['id', 'title', 'status'],
      requiredPersonKeys: ['id', 'name'],
      requiredStatusColumnKeys: ['id', 'title'],
    },
  });
  const {
    appliedMcpSettingsSignature,
    mcpListenerStatus,
    mcpAuditLog,
    mcpAuditSummary,
    refreshMcpListenerStatus,
    refreshMcpAuditLog,
    handleRestartMcpServer,
    handleRotateMcpAccessToken,
    isMcpRestartPending,
  } = useMcpPanelState({
    preferences,
    setPreferences,
    runHealthCheck: mcpHealth.runHealthCheck,
  });
  const {
    agentWatchRuntime,
    pollAgentWatcher,
    upsertAgentWatchConfig,
    removeAgentWatchConfig,
  } = useAgentWatchRuntime({
    mcpReadService,
    enabled: preferences.mcpAgentAccessEnabled,
    agentWatchConfigs,
    setAgentWatchConfigs,
    statusColumns,
    setTasks,
  });

  useEffect(() => {
    if (!preferences.mcpAgentAccessEnabled) return;
    void refreshMcpAuditLog();
  }, [preferences.mcpAgentAccessEnabled, refreshMcpAuditLog]);

  useEffect(() => {
    if (!preferences.mcpAgentAccessEnabled) return;

    const intervalMs = getAgentWatchPollingInterval(agentWatchConfigs);
    if (intervalMs <= 0) return;

    const timer = window.setInterval(() => {
      void refreshMcpAuditLog();
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [agentWatchConfigs, preferences.mcpAgentAccessEnabled, refreshMcpAuditLog]);

  const handleTimelineScroll = useCallback((state: { scrollLeft: number; scrollTop: number }) => {
    setTimelineScrollState(state);
  }, [setTimelineScrollState]);

  useEffect(() => {
    const handleKanbanScroll = (event: Event) => {
      const { scrollLeft = 0, scrollTop = 0 } = (event as CustomEvent<{
        scrollLeft?: number;
        scrollTop?: number;
      }>).detail ?? {};

      applyKanbanScrollState({ scrollLeft, scrollTop });
    };

    document.addEventListener('kanbanScroll', handleKanbanScroll);
    return () => document.removeEventListener('kanbanScroll', handleKanbanScroll);
  }, [applyKanbanScrollState]);

  const handlePollAgentWatchFromPanel = useCallback((personId: string) => {
    const config = agentWatchConfigs.find(item => item.personId === personId) || {
      personId,
      enabled: true,
      intervalSeconds: 60,
    };
    void pollAgentWatcher(config);
  }, [agentWatchConfigs, pollAgentWatcher]);
  const {
    addPerson: handleAddPerson,
    deletePerson: handleDeletePerson,
    updatePerson: handleUpdatePerson,
    reorderPeople: handleReorderPeople,
  } = usePeopleActions({
    setPeople,
    setTasks,
    onDeleteAgentWatchConfig: removeAgentWatchConfig,
  });

  const handleReorderTasks = useCallback((reorderedTasks: Task[]) => {
    setTasks(reorderedTasks);
  }, [setTasks]);

  const handleGoalPolicyChange = useCallback((updates: {
    currency?: string;
    acceptance?: GoalPolicyV1['acceptance'];
    agentMutationConfirmation?: GoalPolicyV1['agentMutationConfirmation'];
    dimensions?: Partial<GoalPolicyV1['dimensions']>;
  }) => {
    updateGoalPolicy(updates);
  }, [updateGoalPolicy]);

  const handleConfirmNukeLocalData = useCallback(async () => {
    try {
      window.localStorage.clear();
      await clearPortableElectronStoreKeys();
    } catch {
      // ignore
    }

    resetWorkspaceData();
    resetUiLayoutState();
    setResetLocalDataConfirmOpen(false);
  }, [resetUiLayoutState, resetWorkspaceData, setResetLocalDataConfirmOpen]);

  const handleNukeLocalData = useCallback(() => {
    setResetLocalDataConfirmOpen(true);
  }, [setResetLocalDataConfirmOpen]);

  const handleExportWorkspaceBackup = useCallback(async () => {
    const payload = buildWorkspaceBackupPayload({
      tasks,
      milestones,
      projects: timelineSwimlanes,
      people,
      statusColumns,
      preferences,
      goalPolicy,
      ui: buildBackupUiState(),
      storage: getPortableStorageSnapshot(),
      electronStore: await getPortableElectronStoreSnapshot(),
      version: WORKSPACE_BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
    });

    return downloadWorkspaceBackupPayload(payload);
  }, [
    buildBackupUiState,
    milestones,
    people,
    preferences,
    statusColumns,
    tasks,
    timelineSwimlanes,
    goalPolicy,
  ]);

  const handleExportGoalPolicyBackup = useCallback(async () => (
    downloadWorkspaceBackupPayload(
      buildGoalPolicyBackupPayload(goalPolicy),
      { fileNamePrefix: 'omvra-goal-policy' },
    )
  ), [goalPolicy]);

  const handleImportGoalPolicyBackup = useCallback(async (file: File) => {
    try {
      const parsed = parseWorkspaceBackupJson(await file.text());
      if (!parsed.ok || !parsed.payload) {
        setImportFeedback({ type: 'error', message: parsed.error || 'Could not import policy backup.' });
        return;
      }

      const repaired = repairGoalPolicyBackupPayload(parsed.payload, goalPolicy);
      if (!repaired.ok) {
        setImportFeedback({ type: 'error', message: repaired.error || 'Could not import policy backup.' });
        return;
      }

      setGoalPolicy(repaired.policy);
      setImportFeedback({
        type: 'success',
        message: repaired.warnings.length > 0
          ? `Policy restored with warnings: ${repaired.warnings.join(' ')}`
          : `Policy restored (revision ${repaired.policy.policyRevision}).`,
      });
    } catch {
      setImportFeedback({ type: 'error', message: 'Could not import policy backup.' });
    }
  }, [goalPolicy, setGoalPolicy, setImportFeedback]);

  const handleImportTasksAndProjects = useCallback(async (file: File) => {
    try {
      setImportFeedback(null);
      const text = await file.text();
      const parsed = parseWorkspaceBackupJson(text);
      if (!parsed.ok || !parsed.payload) {
        setImportFeedback({
          type: 'error',
          message: parsed.error || 'Could not import backup. Please select a valid JSON export file.',
        });
        return;
      }

      const parsedPayload = parsed.payload as Record<string, unknown>;

      if (!Array.isArray(parsedPayload.tasks) || !Array.isArray(parsedPayload.projects)) {
        setImportFeedback({
          type: 'error',
          message: 'Invalid backup format. Expected "tasks" and "projects" arrays.',
        });
        return;
      }

      const repaired = repairWorkspaceBackupPayload(parsedPayload, {
        fallbackProjects: timelineSwimlanes,
        fallbackPeople: people,
        fallbackStatusColumns: statusColumns,
        fallbackPreferences: preferences,
        fallbackGoalPolicy: goalPolicy,
        fallbackTasks: tasks,
        fallbackMilestones: milestones,
        allowFallbackForMissingArrays: false,
      });

      if (!repaired.ok) {
        setImportFeedback({
          type: 'error',
          message: repaired.error || 'Could not import backup. Please select a valid JSON export file.',
        });
        return;
      }

      await restorePortableStorageSnapshot(repaired.storageSnapshot, repaired.electronStoreSnapshot);

      replaceWorkspaceSnapshot({
        timelineSwimlanes: repaired.projects,
        tasks: repaired.tasks,
        milestones: repaired.milestones,
        people: repaired.people,
        statusColumns: repaired.statusColumns,
        preferences: {
          ...repaired.preferences,
          cleanupGoalArtifacts: preferences.cleanupGoalArtifacts,
          goalAuditArchiveDirectory: preferences.goalAuditArchiveDirectory,
        },
        goalPolicy: repaired.goalPolicy,
      });
      await restoreImportedUiState(repaired.ui, repaired.projects, repaired.people);
      setImportFeedback({
        type: 'success',
        message: repaired.warnings.length > 0
          ? `Restored workspace with warnings: ${repaired.warnings.join(' ')}`
          : `Restored ${repaired.tasks.length} tasks, ${repaired.projects.length} projects, ${repaired.people.length} people, and ${repaired.milestones.length} milestones from backup.`,
      });
      bumpViewRefreshKey();
    } catch {
      setImportFeedback({
        type: 'error',
        message: 'Could not import backup. Please select a valid JSON export file.',
      });
    }
  }, [
    bumpViewRefreshKey,
    milestones,
    people,
    preferences,
    replaceWorkspaceSnapshot,
    restoreImportedUiState,
    setImportFeedback,
    statusColumns,
    tasks,
    timelineSwimlanes,
    goalPolicy,
  ]);

  useEffect(() => {
    setPreferences(prev => {
      const nextExecution = normalizeLoadStatusIds(prev.executionLoadStatusIds, [], statusColumns);
      const nextPipeline = normalizeLoadStatusIds(prev.pipelineLoadStatusIds, [], statusColumns);

      if (
        areSerializedValuesEqual(nextExecution, prev.executionLoadStatusIds) &&
        areSerializedValuesEqual(nextPipeline, prev.pipelineLoadStatusIds)
      ) {
        return prev;
      }

      return {
        ...prev,
        executionLoadStatusIds: nextExecution,
        pipelineLoadStatusIds: nextPipeline,
      };
    });
  }, [setPreferences, statusColumns]);

  useEffect(() => {
    const validPeople = new Set(people.filter(person => person.kind === 'agentic').map(person => person.id));
    setAgentWatchConfigs(prev => prev.filter(config => validPeople.has(config.personId)));
  }, [people, setAgentWatchConfigs, statusColumns]);

  useEffect(() => {
    if (!isPreferencesOpen) return;
    void refreshMcpListenerStatus();
    void refreshMcpAuditLog();
  }, [isPreferencesOpen, refreshMcpAuditLog, refreshMcpListenerStatus]);

  useMcpDiagnostics({
    enabled: preferences.mcpAgentAccessEnabled,
    endpoint: preferences.mcpServerAddress,
  });

  return {
    isHydrated: hasHydratedCanonicalWorkspace && hasHydratedUiState,
    headerProps: {
      currentView,
      onViewChange: (view) => {
        switchView(view);
        if (view === 'kanban') {
          restoreKanbanScroll(kanbanContainerRef);
        }
      },
      onOpenPreferences: openPreferences,
      onOpenPeople: openPeoplePanel,
      onOpenAgents: openAgentsPanel,
      condensedUI: preferences.condensedUI,
    },
    mainViewsProps: {
      currentView,
      frame: {
        viewRefreshKey,
        timelineContainerRef,
        kanbanContainerRef,
      },
      data: {
        tasks,
        timelineSwimlanes,
        people,
        statusColumns,
        milestones,
        goalPolicy,
        goalAuditArchiveDirectory: preferences.goalAuditArchiveDirectory,
        onGoalAuditArchiveDirectoryChange: setGoalAuditArchiveDirectory,
        customScrollbarsEnabled: preferences.customScrollbarsEnabled,
        condensedUI: preferences.condensedUI,
        readModel: workspaceReadModel,
      },
      timeline: {
        timelineInitialScrollLeft: getViewStateSnapshot('timeline').scrollLeft || 0,
        timelineInitialLayoutState: timelineLayoutState,
        onTimelineLayoutStateChange: setTimelineLayoutState,
        onTimelineTaskClick: handleTaskClick,
        onTimelineTaskEdit: handleEditTaskFromKanban,
        onTimelineTaskDelete: handleDeleteTask,
        onTimelineTaskDuplicate: handleDuplicateTask,
        onTimelineAddTask: handleAddTaskFromTimeline,
        onTimelineUpdateTaskDates: handleUpdateTaskDates,
        onTimelineEditSwimlane: handleEditSwimlane,
        onTimelineAddSwimlane: handleAddSwimlane,
        onTimelineReorderSwimlanes: handleReorderSwimlanes,
        onTimelineReorderPeople: handleReorderPeople,
        onTimelineReorderTasks: handleReorderTasks,
        onTimelineScroll: handleTimelineScroll,
      },
      kanban: {
        kanbanInitialFilters: hydratedKanbanFilters,
        kanbanInitialScrollLeft: getViewStateSnapshot('kanban').scrollLeft || 0,
        kanbanInitialScrollTop: getViewStateSnapshot('kanban').scrollTop || 0,
        onKanbanTaskClick: handleTaskClick,
        onKanbanEditTask: handleEditTaskFromKanban,
        onKanbanAddTask: handleAddTaskFromSwimlane,
        onKanbanMoveTask: handleMoveTask,
        onKanbanReorderTasks: handleReorderTasks,
        onKanbanReorderColumns: handleReorderStatusColumns,
        onKanbanUpdateColumn: handleUpdateStatusColumn,
        onKanbanAddColumn: handleAddStatusColumn,
        onKanbanDeleteColumn: handleDeleteStatusColumn,
      },
      roadmap: {
        showCompleted: timelineLayoutState.showCompleted,
        onRoadmapAddMilestone: addMilestone,
        onRoadmapMilestoneClick: openMilestoneDetails,
        onRoadmapTaskClick: handleTaskClick,
      },
    },
    statusBarProps: {
      tasks,
      people,
      agentWatchConfigs,
      agentWatchRuntime,
      mcpAuditLog,
      mcpAgentAccessEnabled: preferences.mcpAgentAccessEnabled,
      mcpListenerStatus,
      mcpRestartPending: isMcpRestartPending,
    },
    panelsProps: {
      dialogs: {
        isTaskDialogOpen,
        isTaskDetailsOpen,
        isSwimlaneDialogOpen,
        isPreferencesOpen,
        preferencesInitialAnchor,
        selectedTask,
        detailsTask,
        selectedMilestone,
        detailsMilestone,
        selectedSwimlane,
        defaultStatus,
        defaultDate,
        defaultEndDate,
        defaultSwimlaneId,
        defaultAssigneeId,
        isMilestoneDialogOpen,
      },
      workspace: {
        tasks,
        timelineSwimlanes,
        people,
        statusColumns,
        milestones,
        readModel: workspaceReadModel,
      },
      preferences: {
        executionLoadStatusIds,
        pipelineLoadStatusIds,
        updateChannel: preferences.updateChannel,
        markdownAppearance: preferences.markdownAppearance,
        showCompletedTimelineTasks: timelineLayoutState.showCompleted,
        cleanupGoalArtifacts: preferences.cleanupGoalArtifacts,
        goalAuditArchiveDirectory: preferences.goalAuditArchiveDirectory,
        externalSkillsDirectory: preferences.skillRoots?.[0]?.root || '',
        customScrollbarsEnabled: preferences.customScrollbarsEnabled,
        condensedUI: preferences.condensedUI,
        goalPolicy,
        agentWatchConfigs,
        agentWatchRuntime,
        storageMeter,
        importFeedback,
        mcpAgentAccessEnabled: preferences.mcpAgentAccessEnabled,
        mcpAddress: preferences.mcpServerAddress,
        mcpBindHost: preferences.mcpBindHost,
        mcpPort: preferences.mcpPort,
        mcpAccessToken: preferences.mcpAccessToken,
        mcpAccessTokenIssuedAt: preferences.mcpAccessTokenIssuedAt,
        mcpAccessTokenTtlMinutes: preferences.mcpAccessTokenTtlMinutes,
        mcpCapabilityProfile: preferences.mcpCapabilityProfile,
        mcpListenerStatus,
        mcpAuditLog,
        mcpAuditSummary,
        mcpHealthResult: mcpHealth.result,
        mcpHealthCheckRunning: mcpHealth.isRunning,
        mcpRestartPending: isMcpRestartPending,
      },
      taskActions: {
        onCloseTaskDialog: handleCloseTaskDialog,
        onSaveTask: handleSaveTask,
        onDeleteTask: handleDeleteTask,
        onCloseTaskDetails: closeTaskDetails,
        onEditTaskFromDetails: handleEditTaskFromDetails,
        onMoveAgentTaskToReview: handleMoveAgentTaskToReview,
        onAddTaskComment: handleAddTaskComment,
        onUpdateTaskAttachments: handleUpdateTaskAttachments,
      },
      milestoneActions: {
        onCloseMilestoneDialog: closeMilestoneDialog,
        onSaveMilestone: saveMilestone,
        onDeleteMilestone: deleteMilestone,
        onUpdateRoadmapTaskDependencies: applyRoadmapTaskDependencies,
        onCloseMilestoneDetails: closeMilestoneDetails,
        onEditMilestoneFromDetails: editMilestoneFromDetails,
        onMilestoneTaskClick: handleMilestoneTaskClick,
      },
      adminActions: {
        onCloseSwimlaneDialog: handleCloseSwimlaneDialog,
        onSaveSwimlane: handleSaveSwimlane,
        onDeleteSwimlane: handleDeleteSwimlane,
        onAddPerson: handleAddPerson,
        onUpdatePerson: handleUpdatePerson,
        onDeletePerson: handleDeletePerson,
        onSaveAgentWatchConfig: upsertAgentWatchConfig,
        onRemoveAgentWatchConfig: removeAgentWatchConfig,
        onPollAgentWatch: handlePollAgentWatchFromPanel,
        onClosePreferences: closePreferences,
        onNukeLocalData: handleNukeLocalData,
        onExportWorkspaceBackup: handleExportWorkspaceBackup,
        onExportGoalPolicyBackup: handleExportGoalPolicyBackup,
        onImportTasksAndProjects: handleImportTasksAndProjects,
        onImportGoalPolicyBackup: handleImportGoalPolicyBackup,
        onUpdateChannelChange: setUpdateChannel,
        onMarkdownAppearanceChange: setMarkdownAppearance,
        onShowCompletedTimelineTasksChange: (show) => setTimelineLayoutState(current => ({ ...current, showCompleted: show })),
        onCleanupGoalArtifactsChange: setCleanupGoalArtifacts,
        onGoalAuditArchiveDirectoryChange: setGoalAuditArchiveDirectory,
        onExternalSkillsDirectoryChange: setExternalSkillsDirectory,
        onCustomScrollbarsEnabledChange: setCustomScrollbarsEnabled,
        onCondensedUIChange: setCondensedUI,
        onGoalPolicyChange: handleGoalPolicyChange,
        onResetGoalPolicy: resetGoalPolicy,
        onUpdateStatusColumn: handleUpdateStatusColumn,
        onMcpAgentAccessToggle: setMcpAgentAccessEnabled,
        onMcpAddressChange: (address) => setMcpServerAddress(normalizeMcpServerAddress(address)),
        onMcpBindHostChange: (host) => setMcpBindHost(normalizeMcpBindHost(host)),
        onMcpPortChange: (port) => setMcpPort(normalizeMcpPort(port)),
        onMcpAccessTokenChange: setMcpAccessToken,
        onMcpAccessTokenRotate: handleRotateMcpAccessToken,
        onMcpAccessTokenTtlMinutesChange: setMcpAccessTokenTtlMinutes,
        onMcpCapabilityProfileChange: setMcpCapabilityProfile,
        onRestartMcpServer: handleRestartMcpServer,
        onRunMcpHealthCheck: mcpHealth.runHealthCheck,
        onRefreshMcpAuditLog: refreshMcpAuditLog,
      },
    },
    updatePopupProps: {
      updateChannel: preferences.updateChannel,
      onUpdateChannelChange: setUpdateChannel,
      onExportWorkspaceBackup: handleExportWorkspaceBackup,
    },
    deleteConfirmProps: {
      isOpen: resetLocalDataConfirmOpen,
      title: 'Erase local storage?',
      description: 'This clears local workspace data stored by the app and resets your workspace. This cannot be undone.',
      confirmLabel: 'Erase local storage',
      onOpenChange: setResetLocalDataConfirmOpen,
      onCancel: () => setResetLocalDataConfirmOpen(false),
      onConfirm: handleConfirmNukeLocalData,
    },
  };
}
