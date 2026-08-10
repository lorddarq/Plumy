import type { LoadClassification, ProjectMilestone, RoadmapStage, Task, TaskAttachment, TaskStatus, TimelineSwimlane, Person, StatusColumn } from '../types.ts';
import { buildLocalMcpAddress, normalizeMcpBindHost, normalizeMcpPort, normalizeMcpServerAddress } from '../constants/mcp.ts';
import { getTaskProjectIds } from './roadmap.ts';
import { normalizeTaskCollaboration } from './taskCollaboration.ts';
import {
  DEFAULT_MARKDOWN_APPEARANCE,
  type MarkdownAppearance,
  sanitizeMarkdownAppearance,
} from './markdownAppearance.ts';

export type StatusColumnState = StatusColumn;

export interface AppPreferencesLike {
  executionLoadStatusIds: TaskStatus[];
  pipelineLoadStatusIds: TaskStatus[];
  cleanupGoalArtifacts: boolean;
  goalAuditArchiveDirectory: string;
  skillRoots?: Array<{ root: string; source?: string }>;
  customScrollbarsEnabled: boolean;
  condensedUI?: boolean;
  performanceLoggingEnabled?: boolean;
  executionLoadStatusId?: TaskStatus;
  pipelineLoadStatusId?: TaskStatus;
  updateChannel: 'stable' | 'rc';
  markdownAppearance: MarkdownAppearance;
  mcpAgentAccessEnabled: boolean;
  mcpCapabilityProfile: 'read_only' | 'task_write' | 'admin';
  mcpBindHost: string;
  mcpPort: number;
  mcpServerAddress: string;
  mcpAccessToken: string;
  mcpAccessTokenIssuedAt?: string;
  mcpAccessTokenTtlMinutes: number;
}

const LOAD_CLASSIFICATIONS = new Set<LoadClassification>(['open-tasks', 'in-progress', 'in-review', 'none']);
const ROADMAP_STAGES = new Set<RoadmapStage>(['not-started', 'in-progress', 'in-review', 'complete', 'excluded']);

function defaultColumnSemantics(id: string) {
  if (id === 'open') return { loadClassification: 'open-tasks' as const, roadmapStage: 'not-started' as const };
  if (id === 'in-progress') return { loadClassification: 'in-progress' as const, roadmapStage: 'in-progress' as const };
  if (id === 'under-review') return { loadClassification: 'in-review' as const, roadmapStage: 'in-review' as const };
  if (id === 'done') return { loadClassification: 'none' as const, roadmapStage: 'complete' as const };
  return { loadClassification: 'none' as const, roadmapStage: 'excluded' as const };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function getDefaultStatusId(
  columns: StatusColumn[],
  preferred: TaskStatus
): TaskStatus {
  const preferredColumn = columns.find(column => column.id === preferred);
  if (preferredColumn) return preferredColumn.id as TaskStatus;
  return (columns[0]?.id as TaskStatus) || preferred;
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

function getFileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || filePath;
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

const SAMPLE_TITLE_EXPANSIONS: Record<string, string> = {
  'Look at the Mon...': 'Look at the Moon Through a Telescope',
  'Do Moon Research...': 'Do Moon Research',
  'Watch YouTube V...': 'Watch YouTube Video On Rocket Building',
  'Design The Spac...': 'Design The Spacesuits',
};

function normalizeTaskTitle(title: string): string {
  return SAMPLE_TITLE_EXPANSIONS[title] || title;
}

export function normalizeTask(task: Task, swimlanes: TimelineSwimlane[]): Task {
  const projectIds = getTaskProjectIds(task);
  const projectName = projectIds
    .map(projectId => swimlanes.find(s => s.id === projectId)?.name)
    .filter(Boolean)
    .join(', ');

  return {
    ...task,
    title: normalizeTaskTitle(task.title),
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
    .filter(isObject)
    .map<ProjectMilestone | null>((item, index) => {
      if (typeof item.title !== 'string') return null;
      const rawProjectIds = Array.isArray(item.projectIds)
        ? item.projectIds.map(String)
        : typeof item.projectId === 'string'
          ? [item.projectId]
          : [];
      const projectIds = Array.from(new Set(rawProjectIds.filter(projectId => validProjectIds.has(projectId))));
      if (projectIds.length === 0 || typeof item.endDate !== 'string' || !item.endDate) return null;

      return {
        id: typeof item.id === 'string' ? item.id : `milestone-${index}`,
        convexId: typeof item.convexId === 'string' ? item.convexId : undefined,
        title: item.title,
        projectIds,
        projectId: projectIds[0],
        startDate: typeof item.startDate === 'string' ? item.startDate : undefined,
        endDate: item.endDate,
        notes: typeof item.notes === 'string' ? item.notes : undefined,
        color: typeof item.color === 'string' ? item.color : undefined,
        linkedTaskIds: Array.isArray(item.linkedTaskIds) ? item.linkedTaskIds.map(String) : [],
      };
    })
    .filter((item): item is ProjectMilestone => Boolean(item));

  return sanitized;
}

export function sanitizeStatusColumns(
  columns: unknown,
  fallback: StatusColumnState[],
  legacy?: {
    executionLoadStatusIds?: unknown;
    pipelineLoadStatusIds?: unknown;
  }
): StatusColumnState[] {
  if (!Array.isArray(columns)) return fallback;

  const sanitized = columns
    .filter(isObject)
    .map(column => {
      if (typeof column.id !== 'string' || typeof column.title !== 'string') {
        return null;
      }

      const defaults = defaultColumnSemantics(column.id);
      const legacyExecutionIds = Array.isArray(legacy?.executionLoadStatusIds) ? legacy.executionLoadStatusIds : [];
      const legacyPipelineIds = Array.isArray(legacy?.pipelineLoadStatusIds) ? legacy.pipelineLoadStatusIds : [];
      const migratedLoadClassification = legacyExecutionIds.includes(column.id)
        ? 'in-progress'
        : legacyPipelineIds.includes(column.id) ? 'open-tasks' : defaults.loadClassification;

      return {
        id: column.id,
        title: column.title,
        color: typeof column.color === 'string' ? column.color : '#9ca3af',
        description: normalizeOptionalText(column.description),
        loadClassification: LOAD_CLASSIFICATIONS.has(column.loadClassification as LoadClassification)
          ? column.loadClassification as LoadClassification
          : migratedLoadClassification,
        roadmapStage: ROADMAP_STAGES.has(column.roadmapStage as RoadmapStage)
          ? column.roadmapStage as RoadmapStage
          : defaults.roadmapStage,
      };
    })
    .filter((column): column is NonNullable<typeof column> => Boolean(column));

  return sanitized.length > 0 ? sanitized : fallback;
}

export function deriveStatusColumnsFromTasks(
  taskList: Task[],
  currentColumns: StatusColumnState[]
): StatusColumnState[] {
  const columns = [...currentColumns];
  const knownIds = new Set(columns.map(column => column.id));

  taskList.forEach(task => {
    if (!task.status || knownIds.has(task.status)) {
      return;
    }

    knownIds.add(task.status);
    columns.push({
      id: task.status,
      title: `Imported column ${columns.length + 1}`,
      color: '#9ca3af',
      ...defaultColumnSemantics(task.status),
    });
  });

  return columns;
}

export function sanitizeTimelineSwimlanes(
  value: unknown,
  fallback: TimelineSwimlane[] = []
): TimelineSwimlane[] {
  if (!Array.isArray(value)) return fallback;

  const sanitized = value
    .filter(isObject)
    .map(item => {
      if (typeof item.id !== 'string' || typeof item.name !== 'string') {
        return null;
      }

      return {
        id: item.id,
        name: item.name,
        description: normalizeOptionalText(item.description) ?? normalizeOptionalText(item.subtitle),
        subtitle: normalizeOptionalText(item.subtitle),
        color: typeof item.color === 'string' ? item.color : '#3b82f6',
        repositoryFolder: normalizeOptionalText(item.repositoryFolder),
      };
    })
    .filter(item => item !== null) as TimelineSwimlane[];

  return sanitized;
}

export function sanitizePeople(value: unknown, fallback: Person[] = []): Person[] {
  if (!Array.isArray(value)) return fallback;

  const defaultColors = ['#ec4899', '#f97316', '#eab308', '#06b6d4', '#8b5cf6', '#10b981'];
  const sanitized = value
    .filter(isObject)
    .map((item, index) => {
      if (typeof item.id !== 'string' || typeof item.name !== 'string') {
        return null;
      }

      return {
        id: item.id,
        name: item.name,
        role: typeof item.role === 'string' ? item.role : 'Team Member',
        kind: (item.kind === 'agentic' ? 'agentic' : 'human') as Person['kind'],
        availableForSubagentDelegation: item.kind === 'agentic' && item.availableForSubagentDelegation === true,
        avatar: typeof item.avatar === 'string' ? item.avatar : undefined,
        color: typeof item.color === 'string' ? item.color : defaultColors[index % defaultColors.length],
        agentInstructions: item.kind === 'agentic' && typeof item.agentInstructions === 'string'
          ? item.agentInstructions.trim() || undefined
          : undefined,
        agentOperationalInstructions: item.kind === 'agentic' && typeof item.agentOperationalInstructions === 'string'
          ? item.agentOperationalInstructions.trim() || undefined
          : undefined,
      };
    })
    .filter(item => item !== null) as Person[];

  return sanitized;
}

export function sanitizeTasks(
  value: unknown,
  swimlanes: TimelineSwimlane[],
  fallback: Task[] = []
): Task[] {
  if (!Array.isArray(value)) return fallback.map(task => normalizeTask(task, swimlanes));

  const sanitized = value
    .filter(isObject)
    .map(item => {
      if (typeof item.id !== 'string' || typeof item.title !== 'string') {
        return null;
      }

      return normalizeTask(item as unknown as Task, swimlanes);
    })
    .filter(item => item !== null) as Task[];

  return sanitized;
}

export function sanitizePreferences(
  preferences: Partial<AppPreferencesLike> | undefined,
  statusColumns: Array<{ id: string; title: string; color?: string }>,
  fallback: AppPreferencesLike
): AppPreferencesLike {
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
    cleanupGoalArtifacts: Boolean(preferences.cleanupGoalArtifacts),
    goalAuditArchiveDirectory: typeof preferences.goalAuditArchiveDirectory === 'string' ? preferences.goalAuditArchiveDirectory.trim() : '',
    skillRoots: Array.isArray(preferences.skillRoots)
      ? preferences.skillRoots
          .filter(item => item && typeof item.root === 'string' && item.root.trim())
          .map(item => ({ root: item.root.trim(), source: typeof item.source === 'string' ? item.source : 'omvra-configured' }))
      : (fallback.skillRoots || []),
    customScrollbarsEnabled: preferences.customScrollbarsEnabled !== false,
    condensedUI: preferences.condensedUI === true,
    performanceLoggingEnabled: preferences.performanceLoggingEnabled === true,
    updateChannel: preferences.updateChannel === 'rc' ? 'rc' : 'stable',
    markdownAppearance: sanitizeMarkdownAppearance(preferences.markdownAppearance, fallback.markdownAppearance || DEFAULT_MARKDOWN_APPEARANCE),
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
