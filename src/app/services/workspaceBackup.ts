import type { Task, TaskAttachment, TaskStatus, TimelineSwimlane, Person, StatusColumn, ProjectMilestone } from '../types.ts';
import type {
  KanbanViewState,
  RoadmapViewState,
  TimelineViewState,
  ViewType as WorkspaceViewType,
} from '../hooks/useViewState.ts';
import type { TimelineLayoutState } from './uiState.ts';
import {
  buildLocalMcpAddress,
  normalizeMcpBindHost,
  normalizeMcpPort,
  normalizeMcpServerAddress,
} from '../constants/mcp.ts';
import {
  DEFAULT_MARKDOWN_APPEARANCE,
  type MarkdownAppearance,
  sanitizeMarkdownAppearance,
} from '../utils/markdownAppearance.ts';
import { getTaskProjectIds } from '../utils/roadmap.ts';
import { getDefaultStatusId, syncLocalMcpServerAddress } from '../utils/mcpPreferences.ts';
import { flattenPortableStoreEntries, normalizePortableStorageKey } from '../utils/storage.ts';
import { AI_ACTIONS, LOAD_CLASSIFICATIONS, ROADMAP_STAGES, getDefaultColumnSemantics } from '../utils/statusColumnSemantics.ts';
import { createDefaultGoalPolicy, sanitizeGoalPolicy, type GoalPolicyV1 } from '../utils/goalPolicy.ts';
import { normalizeTaskCollaboration } from '../utils/taskCollaboration.ts';

export const WORKSPACE_BACKUP_SCHEMA_VERSION = 2;
export const GOAL_POLICY_BACKUP_SCHEMA_VERSION = 1;
const GOALS_STORE_KEY = 'omvra.goals.v1';

export interface GoalPolicyBackupPayload {
  kind: 'omvra-goal-policy';
  version: typeof GOAL_POLICY_BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  goalPolicy: GoalPolicyV1;
}

export interface GoalPolicyBackupRepairResult {
  ok: boolean;
  error?: string;
  warnings: string[];
  policy: GoalPolicyV1;
}

export interface WorkspacePreferences {
  executionLoadStatusIds: TaskStatus[];
  pipelineLoadStatusIds: TaskStatus[];
  executionLoadStatusId?: TaskStatus;
  pipelineLoadStatusId?: TaskStatus;
  updateChannel: 'stable' | 'rc';
  markdownAppearance: MarkdownAppearance;
  condensedUI?: boolean;
  mcpAgentAccessEnabled: boolean;
  mcpCapabilityProfile: 'read_only' | 'task_write' | 'admin';
  mcpBindHost: string;
  mcpPort: number;
  mcpServerAddress: string;
  mcpAccessToken: string;
  mcpAccessTokenIssuedAt?: string;
  mcpAccessTokenTtlMinutes: number;
}

function normalizeLoadStatusIds(
  value: unknown,
  fallback: TaskStatus[],
  statusColumns: StatusColumn[]
): TaskStatus[] {
  const validIds = new Set(statusColumns.map(column => column.id));
  const candidates = Array.isArray(value) ? value : typeof value === 'string' ? [value] : fallback;
  const normalized = candidates.filter((statusId): statusId is TaskStatus => (
    typeof statusId === 'string' && validIds.has(statusId)
  ));

  return Array.from(new Set(normalized));
}

export type WorkspaceStatusColumn = StatusColumn;

export interface WorkspaceBackupUiState {
  currentView?: WorkspaceViewType;
  viewState?: {
    timeline?: TimelineViewState;
    kanban?: KanbanViewState;
    roadmap?: RoadmapViewState;
  };
  timeline?: Partial<TimelineLayoutState>;
}

export interface WorkspaceBackupPayload {
  version: number;
  exportedAt: string;
  tasks?: Task[];
  milestones?: ProjectMilestone[];
  projects?: TimelineSwimlane[];
  people?: Person[];
  statusColumns?: WorkspaceStatusColumn[];
  preferences?: Partial<WorkspacePreferences>;
  goalPolicy?: GoalPolicyV1;
  ui?: WorkspaceBackupUiState;
  storage?: Record<string, string>;
  electronStore?: Record<string, unknown>;
}

export interface WorkspaceBackupBuildInput {
  tasks: Task[];
  milestones: ProjectMilestone[];
  projects: TimelineSwimlane[];
  people: Person[];
  statusColumns: WorkspaceStatusColumn[];
  preferences: WorkspacePreferences;
  goalPolicy?: GoalPolicyV1;
  ui?: WorkspaceBackupUiState;
  storage?: Record<string, string>;
  electronStore?: Record<string, unknown>;
  version?: number;
  exportedAt?: string;
}

export interface WorkspaceBackupRepairOptions {
  fallbackProjects?: TimelineSwimlane[];
  fallbackPeople?: Person[];
  fallbackStatusColumns?: WorkspaceStatusColumn[];
  fallbackPreferences: WorkspacePreferences;
  fallbackGoalPolicy?: GoalPolicyV1;
  fallbackTasks?: Task[];
  fallbackMilestones?: ProjectMilestone[];
  allowFallbackForMissingArrays?: boolean;
}

export interface WorkspaceBackupRepairResult {
  ok: boolean;
  error?: string;
  warnings: string[];
  version: number;
  exportedAt?: string;
  tasks: Task[];
  milestones: ProjectMilestone[];
  projects: TimelineSwimlane[];
  people: Person[];
  statusColumns: WorkspaceStatusColumn[];
  preferences: WorkspacePreferences;
  goalPolicy: GoalPolicyV1;
  ui?: WorkspaceBackupUiState;
  storageSnapshot: Record<string, string>;
  electronStoreSnapshot: Record<string, unknown>;
}

export interface WorkspaceBackupParseResult {
  ok: boolean;
  error?: string;
  payload?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneRecord<T extends Record<string, unknown> | Record<string, string>>(value: T): T {
  return { ...value };
}

function getFileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || filePath;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function validateGoalSnapshot(value: unknown): string | undefined {
  if (!Array.isArray(value)) return 'Backup contains an invalid Goal snapshot.';

  const ids = new Set<string>();
  for (const goal of value) {
    if (!isRecord(goal) || typeof goal.id !== 'string' || !goal.id.trim()) {
      return 'Backup contains a Goal without a valid id.';
    }
    if (ids.has(goal.id)) return `Backup contains a duplicate Goal id: ${goal.id}.`;
    ids.add(goal.id);
    if (!Array.isArray(goal.elements)) return `Backup Goal ${goal.id} has no valid elements array.`;
    for (const element of goal.elements) {
      if (!isRecord(element) || typeof element.id !== 'string' || !element.id.trim()) {
        return `Backup Goal ${goal.id} contains an element without a valid id.`;
      }
      if (ids.has(element.id)) return `Backup contains a duplicate Goal or element id: ${element.id}.`;
      ids.add(element.id);
    }
  }

  return undefined;
}

function toFileUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const prefixed = normalized.match(/^[A-Za-z]:\//) ? `/${normalized}` : normalized;
  return `file://${encodeURI(prefixed)}`;
}

function normalizeTaskAttachments(value: unknown): TaskAttachment[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(attachment => attachment && typeof attachment === 'object')
    .map((attachment, index): TaskAttachment | null => {
      const candidate = attachment as Record<string, unknown>;
      const path = typeof candidate.path === 'string' ? candidate.path : '';
      if (!path.trim()) return null;

      const size = Number(candidate.size);
      return {
        id: typeof candidate.id === 'string' ? candidate.id : `attachment-${index}`,
        name: typeof candidate.name === 'string' && candidate.name.trim()
          ? candidate.name
          : getFileNameFromPath(path),
        path,
        uri: typeof candidate.uri === 'string' && candidate.uri.trim()
          ? candidate.uri
          : toFileUri(path),
        size: Number.isFinite(size) && size >= 0 ? size : undefined,
        addedAt: typeof candidate.addedAt === 'string' && candidate.addedAt.trim()
          ? candidate.addedAt
          : new Date().toISOString(),
      };
    })
    .filter((attachment): attachment is TaskAttachment => Boolean(attachment));
}

function normalizeTask(task: Task, swimlanes: TimelineSwimlane[]): Task {
  const projectIds = getTaskProjectIds(task);
  const projectName = projectIds
    .map(projectId => swimlanes.find(swimlane => swimlane.id === projectId)?.name)
    .filter(Boolean)
    .join(', ');

  return {
    ...task,
    projectIds,
    project: projectName || task.project,
    size: task.size || 'm',
    complexity: task.complexity || 'medium',
    blocked: Boolean(task.blocked),
    priority: task.priority || 'normal',
    dependencyIds: Array.isArray(task.dependencyIds) ? task.dependencyIds : [],
    timeSpentMinutes: Number.isFinite(Number(task.timeSpentMinutes))
      ? Math.max(0, Math.floor(Number(task.timeSpentMinutes)))
      : undefined,
    timeSpentNote: typeof task.timeSpentNote === 'string' ? task.timeSpentNote : undefined,
    timeEntries: Array.isArray(task.timeEntries)
      ? task.timeEntries
        .filter(entry => entry && typeof entry === 'object')
        .map(entry => ({
          id: typeof entry.id === 'string' ? entry.id : `time-${Date.now()}`,
          minutes: Number.isFinite(Number(entry.minutes)) ? Math.max(0, Math.floor(Number(entry.minutes))) : 0,
          note: typeof entry.note === 'string' ? entry.note : undefined,
          loggedAt: typeof entry.loggedAt === 'string' ? entry.loggedAt : new Date().toISOString(),
          actor: typeof entry.actor === 'string' ? entry.actor : undefined,
        }))
        .filter(entry => entry.minutes > 0)
      : [],
    attachments: normalizeTaskAttachments(task.attachments),
    collaboration: normalizeTaskCollaboration(task.collaboration),
  };
}

export function sanitizeMilestones(
  value: unknown,
  projects: TimelineSwimlane[],
  fallback: ProjectMilestone[] = []
): ProjectMilestone[] {
  if (!Array.isArray(value)) return fallback;

  const validProjectIds = new Set(projects.map(project => project.id));
  const sanitized = value
    .filter(item => item && typeof item === 'object')
    .map<ProjectMilestone | null>((item, index) => {
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.title !== 'string') return null;
      const rawProjectIds = Array.isArray(candidate.projectIds)
        ? candidate.projectIds.map(String)
        : typeof candidate.projectId === 'string'
          ? [candidate.projectId]
          : [];
      const projectIds = Array.from(new Set(rawProjectIds.filter(projectId => validProjectIds.has(projectId))));
      if (projectIds.length === 0 || typeof candidate.endDate !== 'string' || !candidate.endDate) return null;

      return {
        id: typeof candidate.id === 'string' ? candidate.id : `milestone-${index}`,
        convexId: typeof candidate.convexId === 'string' ? candidate.convexId : undefined,
        title: candidate.title,
        projectIds,
        projectId: projectIds[0],
        startDate: typeof candidate.startDate === 'string' ? candidate.startDate : undefined,
        endDate: candidate.endDate,
        notes: typeof candidate.notes === 'string' ? candidate.notes : undefined,
        color: typeof candidate.color === 'string' ? candidate.color : undefined,
        linkedTaskIds: Array.isArray(candidate.linkedTaskIds) ? candidate.linkedTaskIds.map(String) : [],
      };
    })
    .filter((item): item is ProjectMilestone => Boolean(item));

  return sanitized.length > 0 ? sanitized : fallback;
}

export function sanitizeTimelineSwimlanes(
  value: unknown,
  fallback: TimelineSwimlane[] = []
): TimelineSwimlane[] {
  if (!Array.isArray(value)) return fallback;

  const sanitized = value
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') {
        return null;
      }

      return {
        id: candidate.id,
        name: candidate.name,
        description: normalizeOptionalText(candidate.description) ?? normalizeOptionalText(candidate.subtitle),
        subtitle: normalizeOptionalText(candidate.subtitle),
        color: typeof candidate.color === 'string' ? candidate.color : '#3b82f6',
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return sanitized.length > 0 ? sanitized : fallback;
}

export function sanitizePeople(value: unknown, fallback: Person[] = []): Person[] {
  if (!Array.isArray(value)) return fallback;

  const defaultColors = ['#ec4899', '#f97316', '#eab308', '#06b6d4', '#8b5cf6', '#10b981'];
  const sanitized = value
    .filter(item => item && typeof item === 'object')
    .map((item, index) => {
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') {
        return null;
      }

      return {
        id: candidate.id,
        name: candidate.name,
        role: typeof candidate.role === 'string' ? candidate.role : 'Team Member',
        kind: (candidate.kind === 'agentic' ? 'agentic' : 'human') as Person['kind'],
        availableForSubagentDelegation: candidate.kind === 'agentic' && candidate.availableForSubagentDelegation === true,
        avatar: typeof candidate.avatar === 'string' ? candidate.avatar : undefined,
        color: typeof candidate.color === 'string' ? candidate.color : defaultColors[index % defaultColors.length],
        agentInstructions: candidate.kind === 'agentic' && typeof candidate.agentInstructions === 'string'
          ? candidate.agentInstructions.trim() || undefined
          : undefined,
        agentOperationalInstructions: candidate.kind === 'agentic' && typeof candidate.agentOperationalInstructions === 'string'
          ? candidate.agentOperationalInstructions.trim() || undefined
          : undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return sanitized.length > 0 ? sanitized : fallback;
}

export function sanitizeTasks(
  value: unknown,
  swimlanes: TimelineSwimlane[],
  fallback: Task[] = []
): Task[] {
  if (!Array.isArray(value)) {
    return fallback.map(task => normalizeTask(task, swimlanes));
  }

  const sanitized = value
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const candidate = item as Task;
      if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string') {
        return null;
      }
      return normalizeTask(candidate, swimlanes);
    })
    .filter((item): item is Task => Boolean(item));

  return sanitized.length > 0 ? sanitized : fallback.map(task => normalizeTask(task, swimlanes));
}

export function sanitizeStatusColumns(
  columns: unknown,
  fallback: WorkspaceStatusColumn[]
): WorkspaceStatusColumn[] {
  if (!Array.isArray(columns)) return fallback;

  const sanitized = columns
    .filter(column => column && typeof column === 'object')
    .map(column => {
      const candidate = column as Record<string, unknown>;
      if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string') {
        return null;
      }
      const defaults = getDefaultColumnSemantics(candidate.id);

      return {
        id: candidate.id,
        title: candidate.title,
        color: typeof candidate.color === 'string' ? candidate.color : '#9ca3af',
        description: normalizeOptionalText(candidate.description),
        loadClassification: LOAD_CLASSIFICATIONS.some(option => option.value === candidate.loadClassification)
          ? candidate.loadClassification as StatusColumn['loadClassification']
          : defaults.loadClassification,
        roadmapStage: ROADMAP_STAGES.some(option => option.value === candidate.roadmapStage)
          ? candidate.roadmapStage as StatusColumn['roadmapStage']
          : defaults.roadmapStage,
        aiWatchEnabled: candidate.aiWatchEnabled === true,
        aiAction: AI_ACTIONS.some(option => option.value === candidate.aiAction)
          ? candidate.aiAction as StatusColumn['aiAction']
          : defaults.aiAction,
      };
    })
    .filter((column): column is NonNullable<typeof column> => column !== null);

  return sanitized.length > 0 ? sanitized : fallback;
}

export function deriveStatusColumnsFromTasks(
  taskList: Task[],
  currentColumns: WorkspaceStatusColumn[]
): WorkspaceStatusColumn[] {
  const columns = [...currentColumns];
  const knownIds = new Set(columns.map(column => column.id));

  taskList.forEach(task => {
    if (!task.status || knownIds.has(task.status)) {
      return;
    }

    knownIds.add(task.status);
    columns.push({
      id: task.status as TaskStatus,
      title: `Imported column ${columns.length + 1}`,
      color: '#9ca3af',
      ...getDefaultColumnSemantics(task.status),
    });
  });

  return columns;
}

export function sanitizePreferences(
  preferences: Partial<WorkspacePreferences> | undefined,
  statusColumns: StatusColumn[],
  fallback: WorkspacePreferences
): WorkspacePreferences {
  if (!preferences) {
    return {
      ...fallback,
      executionLoadStatusIds: normalizeLoadStatusIds(
        fallback.executionLoadStatusIds,
        [getDefaultStatusId(statusColumns, 'in-progress')],
        statusColumns
      ),
      pipelineLoadStatusIds: normalizeLoadStatusIds(
        fallback.pipelineLoadStatusIds,
        [getDefaultStatusId(statusColumns, 'open')],
        statusColumns
      ),
    };
  }

  const bindHost = normalizeMcpBindHost(preferences.mcpBindHost || fallback.mcpBindHost);
  const port = normalizeMcpPort(preferences.mcpPort || fallback.mcpPort);
  const executionLoadStatusIds = normalizeLoadStatusIds(
    preferences.executionLoadStatusIds ?? preferences.executionLoadStatusId,
    [getDefaultStatusId(statusColumns, 'in-progress')],
    statusColumns
  );
  const pipelineLoadStatusIds = normalizeLoadStatusIds(
    preferences.pipelineLoadStatusIds ?? preferences.pipelineLoadStatusId,
    [getDefaultStatusId(statusColumns, 'open')],
    statusColumns
  );

  return {
    executionLoadStatusIds,
    pipelineLoadStatusIds,
    updateChannel: preferences.updateChannel === 'rc' ? 'rc' : 'stable',
    markdownAppearance: sanitizeMarkdownAppearance(preferences.markdownAppearance, fallback.markdownAppearance || DEFAULT_MARKDOWN_APPEARANCE),
    condensedUI: preferences.condensedUI === true,
    mcpAgentAccessEnabled: Boolean(preferences.mcpAgentAccessEnabled),
    mcpCapabilityProfile:
      preferences.mcpCapabilityProfile === 'task_write' || preferences.mcpCapabilityProfile === 'admin'
        ? preferences.mcpCapabilityProfile
        : 'read_only',
    mcpBindHost: bindHost,
    mcpPort: port,
    mcpServerAddress: normalizeMcpServerAddress(
      preferences.mcpServerAddress || buildLocalMcpAddress(bindHost, port)
    ),
    mcpAccessToken: typeof preferences.mcpAccessToken === 'string' ? preferences.mcpAccessToken : '',
    mcpAccessTokenIssuedAt:
      typeof preferences.mcpAccessTokenIssuedAt === 'string' ? preferences.mcpAccessTokenIssuedAt : undefined,
    mcpAccessTokenTtlMinutes: Number.isFinite(Number(preferences.mcpAccessTokenTtlMinutes))
      ? Math.max(1, Math.min(1440, Number(preferences.mcpAccessTokenTtlMinutes)))
      : fallback.mcpAccessTokenTtlMinutes,
  };
}

export function getPortableStorageSnapshotFromEntries(entries: Record<string, string>): Record<string, string> {
  const snapshot: Record<string, string> = {};

  for (const [key, value] of Object.entries(entries || {})) {
    const portableKey = normalizePortableStorageKey(key);
    if (!portableKey || typeof value !== 'string') continue;
    snapshot[portableKey] = value;
  }

  return snapshot;
}

export function getPortableElectronStoreSnapshotFromExport(exported: unknown): Record<string, unknown> {
  if (!isRecord(exported)) return {};

  const flattened = flattenPortableStoreEntries(exported);
  return Object.fromEntries(
    Object.entries(flattened).reduce<Array<[string, unknown]>>((acc, [key, value]) => {
      const portableKey = normalizePortableStorageKey(key);
      if (portableKey) {
        acc.push([portableKey, value]);
      }
      return acc;
    }, [])
  );
}

export function parseWorkspaceBackupJson(text: string): WorkspaceBackupParseResult {
  try {
    const payload = JSON.parse(text) as unknown;
    if (!isRecord(payload)) {
      return {
        ok: false,
        error: 'Invalid backup format. Expected a JSON object.',
      };
    }

    return {
      ok: true,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not parse backup JSON.',
    };
  }
}

export function buildWorkspaceBackupPayload(input: WorkspaceBackupBuildInput): WorkspaceBackupPayload {
  return {
    version: input.version ?? WORKSPACE_BACKUP_SCHEMA_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    tasks: input.tasks,
    milestones: input.milestones,
    projects: input.projects,
    people: input.people,
    statusColumns: input.statusColumns,
    preferences: input.preferences,
    goalPolicy: input.goalPolicy || createDefaultGoalPolicy(input.exportedAt),
    ui: input.ui,
    storage: input.storage,
    electronStore: input.electronStore,
  };
}

export function buildGoalPolicyBackupPayload(
  goalPolicy: GoalPolicyV1,
  exportedAt = new Date().toISOString(),
): GoalPolicyBackupPayload {
  return {
    kind: 'omvra-goal-policy',
    version: GOAL_POLICY_BACKUP_SCHEMA_VERSION,
    exportedAt,
    goalPolicy,
  };
}

export function repairGoalPolicyBackupPayload(
  payload: unknown,
  fallbackGoalPolicy: GoalPolicyV1,
): GoalPolicyBackupRepairResult {
  if (!isRecord(payload) || payload.kind !== 'omvra-goal-policy') {
    return {
      ok: false,
      error: 'Invalid policy backup format.',
      warnings: [],
      policy: fallbackGoalPolicy,
    };
  }

  const repaired = sanitizeGoalPolicy(payload.goalPolicy, fallbackGoalPolicy);
  return {
    ok: true,
    warnings: repaired.warnings.map(warning => `Goal policy: ${warning}`),
    policy: repaired.policy,
  };
}

export function buildWorkspaceBackupFileName(
  exportedAt: string,
  prefix = 'omvra-backup'
): string {
  const parsedDate = new Date(exportedAt);
  const dateStamp = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString().slice(0, 10)
    : parsedDate.toISOString().slice(0, 10);

  return `${prefix}-${dateStamp}.json`;
}

export async function downloadWorkspaceBackupPayload(
  payload: WorkspaceBackupPayload,
  options: { fileNamePrefix?: string } = {}
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = buildWorkspaceBackupFileName(
      payload.exportedAt || new Date().toISOString(),
      options.fileNamePrefix || 'omvra-backup'
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return true;
  } catch {
    return false;
  }
}

export function repairWorkspaceBackupPayload(
  payload: unknown,
  options: WorkspaceBackupRepairOptions
): WorkspaceBackupRepairResult {
  const warnings: string[] = [];
  const fallbackProjects = options.fallbackProjects || [];
  const fallbackPeople = options.fallbackPeople || [];
  const fallbackStatusColumns = options.fallbackStatusColumns || [];
  const fallbackPreferences = options.fallbackPreferences;
  const fallbackGoalPolicy = options.fallbackGoalPolicy || createDefaultGoalPolicy();
  const fallbackTasks = options.fallbackTasks || [];
  const fallbackMilestones = options.fallbackMilestones || [];

  if (!isRecord(payload)) {
    return {
      ok: false,
      error: 'Invalid backup format. Expected a JSON object.',
      warnings,
      version: WORKSPACE_BACKUP_SCHEMA_VERSION,
      tasks: [],
      milestones: [],
      projects: [],
      people: [],
      statusColumns: fallbackStatusColumns,
      preferences: fallbackPreferences,
      goalPolicy: options.fallbackGoalPolicy || createDefaultGoalPolicy(),
      storageSnapshot: {},
      electronStoreSnapshot: {},
    };
  }

  const parsedVersion = Number.isFinite(Number(payload.version))
    ? Math.max(1, Math.floor(Number(payload.version)))
    : WORKSPACE_BACKUP_SCHEMA_VERSION;
  const exportedAt = typeof payload.exportedAt === 'string' ? payload.exportedAt : undefined;

  const importedProjects = sanitizeTimelineSwimlanes(
    payload.projects,
    options.allowFallbackForMissingArrays ? fallbackProjects : []
  );
  if (!Array.isArray(payload.projects)) {
    warnings.push('Backup was missing a projects array; using fallback projects.');
  }

  const importedTasks = sanitizeTasks(
    payload.tasks,
    importedProjects,
    options.allowFallbackForMissingArrays ? fallbackTasks : []
  );
  if (!Array.isArray(payload.tasks)) {
    warnings.push('Backup was missing a tasks array; using fallback tasks.');
  }

  const importedMilestones = sanitizeMilestones(
    payload.milestones,
    importedProjects,
    options.allowFallbackForMissingArrays ? fallbackMilestones : []
  );

  const importedPeople = sanitizePeople(
    payload.people,
    options.allowFallbackForMissingArrays ? fallbackPeople : []
  );
  if (!Array.isArray(payload.people)) {
    warnings.push('Backup was missing a people array; using fallback people.');
  }

  const importedStatusColumns = deriveStatusColumnsFromTasks(
    importedTasks,
    sanitizeStatusColumns(payload.statusColumns, fallbackStatusColumns)
  );

  const projectIds = new Set(importedProjects.map(project => project.id));
  const personIds = new Set(importedPeople.map(person => person.id));
  const statusIds = new Set(importedStatusColumns.map(column => column.id));
  const fallbackStatusId = importedStatusColumns[0]?.id || 'open';

  const repairedTasks = importedTasks.map(task => {
    const nextProjectIds = (task.projectIds || []).filter(projectId => projectIds.has(projectId));
    const nextSwimlaneId = task.swimlaneId && projectIds.has(task.swimlaneId) ? task.swimlaneId : undefined;
    const nextAssigneeId = task.assigneeId && personIds.has(task.assigneeId) ? task.assigneeId : undefined;
    const project = nextProjectIds
      .map(projectId => importedProjects.find(project => project.id === projectId)?.name)
      .filter(Boolean)
      .join(', ');
    const collaboration = normalizeTaskCollaboration(task.collaboration, importedPeople);
    if (task.collaboration && !collaboration) {
      warnings.push(`Task "${task.title}" had invalid collaboration data; it was omitted.`);
    }

    return {
      ...task,
      status: (statusIds.has(task.status) ? task.status : fallbackStatusId) as TaskStatus,
      projectIds: nextProjectIds,
      project: project || undefined,
      swimlaneId: nextSwimlaneId,
      assigneeId: collaboration?.orchestratorId || nextAssigneeId,
      collaboration,
      milestoneId: importedMilestones.some(milestone => milestone.id === task.milestoneId)
        ? task.milestoneId
        : undefined,
      dependencyIds: (task.dependencyIds || []).filter(dependencyId =>
        importedTasks.some(candidate => candidate.id === dependencyId)
      ),
    };
  });

  const importedPreferences = sanitizePreferences(
    isRecord(payload.preferences) ? (payload.preferences as Partial<WorkspacePreferences>) : undefined,
    importedStatusColumns,
    fallbackPreferences
  );
  const importedGoalPolicyResult = sanitizeGoalPolicy(
    payload.goalPolicy,
    options.fallbackGoalPolicy || createDefaultGoalPolicy(),
  );
  warnings.push(...importedGoalPolicyResult.warnings.map(warning => `Goal policy: ${warning}`));

  const ui: WorkspaceBackupUiState | undefined = isRecord(payload.ui)
    ? {
        currentView:
          payload.ui.currentView === 'timeline' || payload.ui.currentView === 'kanban' || payload.ui.currentView === 'roadmap'
            ? payload.ui.currentView
            : undefined,
        viewState: isRecord(payload.ui.viewState)
          ? {
              timeline: isRecord(payload.ui.viewState.timeline) ? cloneRecord(payload.ui.viewState.timeline) : undefined,
              kanban: isRecord(payload.ui.viewState.kanban) ? cloneRecord(payload.ui.viewState.kanban) : undefined,
              roadmap: isRecord(payload.ui.viewState.roadmap) ? cloneRecord(payload.ui.viewState.roadmap) : undefined,
            }
          : undefined,
        timeline: isRecord(payload.ui.timeline)
          ? {
              leftColWidth: Number.isFinite(Number(payload.ui.timeline.leftColWidth))
                ? Number(payload.ui.timeline.leftColWidth)
                : undefined,
              monthWidths: isRecord(payload.ui.timeline.monthWidths)
                ? Object.fromEntries(
                    Object.entries(payload.ui.timeline.monthWidths).reduce<Array<[string, number]>>((acc, [key, value]) => {
                      if (typeof key !== 'string' || !Number.isFinite(Number(value))) {
                        return acc;
                      }
                      acc.push([key, Number(value)]);
                      return acc;
                    }, [])
                  )
                : undefined,
              showCompleted: payload.ui.timeline.showCompleted === true,
            }
          : undefined,
      }
    : undefined;

  const storageSnapshot: Record<string, string> = isRecord(payload.storage)
    ? Object.fromEntries(
        Object.entries(payload.storage).reduce<Array<[string, string]>>((acc, [key, value]) => {
          const portableKey = normalizePortableStorageKey(key);
          if (portableKey && typeof value === 'string') {
            acc.push([portableKey, value]);
          }
          return acc;
        }, [])
      )
    : {};
  const electronStoreSnapshot = isRecord(payload.electronStore)
    ? getPortableElectronStoreSnapshotFromExport(payload.electronStore)
    : {};
  const goalSnapshotError = Object.prototype.hasOwnProperty.call(electronStoreSnapshot, GOALS_STORE_KEY)
    ? validateGoalSnapshot(electronStoreSnapshot[GOALS_STORE_KEY])
    : undefined;

  if (goalSnapshotError) {
    return {
      ok: false,
      error: goalSnapshotError,
      warnings,
      version: parsedVersion,
      exportedAt,
      tasks: repairedTasks,
      milestones: importedMilestones,
      projects: importedProjects,
      people: importedPeople,
      statusColumns: importedStatusColumns,
      preferences: importedPreferences,
      goalPolicy: importedGoalPolicyResult.policy,
      ui,
      storageSnapshot,
      electronStoreSnapshot,
    };
  }

  if (!Array.isArray(payload.statusColumns)) {
    warnings.push('Backup was missing statusColumns; derived columns from tasks and fallback columns.');
  }

  return {
    ok: true,
    warnings,
    version: parsedVersion,
    exportedAt,
    tasks: repairedTasks,
    milestones: importedMilestones,
    projects: importedProjects,
    people: importedPeople,
    statusColumns: importedStatusColumns,
    preferences: importedPreferences,
    goalPolicy: importedGoalPolicyResult.policy,
    ui,
    storageSnapshot,
    electronStoreSnapshot,
  };
}

export function createDefaultWorkspacePreferences(
  statusColumns: StatusColumn[],
  overrides: Partial<WorkspacePreferences> = {}
): WorkspacePreferences {
  const bindHost = normalizeMcpBindHost(overrides.mcpBindHost);
  const port = normalizeMcpPort(overrides.mcpPort);
  const executionLoadStatusIds = normalizeLoadStatusIds(
    overrides.executionLoadStatusIds ?? overrides.executionLoadStatusId,
    [getDefaultStatusId(statusColumns, 'in-progress')],
    statusColumns
  );
  const pipelineLoadStatusIds = normalizeLoadStatusIds(
    overrides.pipelineLoadStatusIds ?? overrides.pipelineLoadStatusId,
    [getDefaultStatusId(statusColumns, 'open')],
    statusColumns
  );
  const serverAddress = normalizeMcpServerAddress(
    overrides.mcpServerAddress || buildLocalMcpAddress(bindHost, port)
  );

  return {
    executionLoadStatusIds,
    pipelineLoadStatusIds,
    updateChannel: overrides.updateChannel === 'rc' ? 'rc' : 'stable',
    markdownAppearance: sanitizeMarkdownAppearance(overrides.markdownAppearance, DEFAULT_MARKDOWN_APPEARANCE),
    condensedUI: overrides.condensedUI === true,
    mcpAgentAccessEnabled: Boolean(overrides.mcpAgentAccessEnabled),
    mcpCapabilityProfile:
      overrides.mcpCapabilityProfile === 'task_write' || overrides.mcpCapabilityProfile === 'admin'
        ? overrides.mcpCapabilityProfile
        : 'read_only',
    mcpBindHost: bindHost,
    mcpPort: port,
    mcpServerAddress: syncLocalMcpServerAddress(
      {
        mcpBindHost: bindHost,
        mcpPort: port,
        mcpServerAddress: serverAddress,
      },
      bindHost,
      port
    ),
    mcpAccessToken: typeof overrides.mcpAccessToken === 'string' ? overrides.mcpAccessToken : '',
    mcpAccessTokenIssuedAt:
      typeof overrides.mcpAccessTokenIssuedAt === 'string' ? overrides.mcpAccessTokenIssuedAt : undefined,
    mcpAccessTokenTtlMinutes: Number.isFinite(Number(overrides.mcpAccessTokenTtlMinutes))
      ? Math.max(1, Math.min(1440, Number(overrides.mcpAccessTokenTtlMinutes)))
      : 60,
  };
}
