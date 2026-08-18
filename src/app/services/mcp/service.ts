import { McpClient, McpClientDisabledError } from './client.ts';
import { getTaskProjectIds } from '../../utils/roadmap.ts';
import type {
  McpCard,
  McpClientConfig,
  McpDiagnosticsResult,
  McpHealthCheckResult,
  McpResourceResponse,
  McpSnapshotExpectation,
  McpTaskSummary,
  McpWorkspaceSnapshot,
} from './types.ts';

const CORE_READ_TOOLS = [
  'workspace.get_snapshot',
  'tasks.list',
  'tasks.get',
  'cards.kanban.list',
  'cards.timeline.list',
] as const;

const CORE_RESOURCE_URIS = [
  'omvra://workspace',
  'omvra://cards/kanban',
  'omvra://cards/timeline',
] as const;

const TOOL_NAME_ALIASES: Record<string, string> = {
  workspace_get_snapshot: 'workspace.get_snapshot',
  tasks_list: 'tasks.list',
  tasks_get: 'tasks.get',
  cards_kanban_list: 'cards.kanban.list',
  cards_timeline_list: 'cards.timeline.list',
};

export interface McpReadService {
  diagnostics: () => Promise<McpDiagnosticsResult>;
  validateHealth: (expectation?: McpSnapshotExpectation) => Promise<McpHealthCheckResult>;
  getWorkspaceSnapshot: () => Promise<McpWorkspaceSnapshot>;
  listTasks: (filters?: Record<string, unknown>) => Promise<McpTaskSummary[]>;
  getTask: (taskId: string) => Promise<McpTaskSummary | null>;
  listKanbanCards: (filters?: Record<string, unknown>) => Promise<McpCard[]>;
  listTimelineCards: (filters?: Record<string, unknown>) => Promise<McpCard[]>;
}

function normalizeWorkspaceSnapshot(payload: unknown): McpWorkspaceSnapshot | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const snapshot = payload as McpWorkspaceSnapshot;

  if (snapshot.workspace && typeof snapshot.workspace === 'object') {
    return snapshot;
  }

  const directWorkspace = payload as Record<string, unknown>;
  const hasWorkspaceArrays =
    Array.isArray(directWorkspace.tasks) ||
    Array.isArray(directWorkspace.people) ||
    Array.isArray(directWorkspace.swimlanes) ||
    Array.isArray(directWorkspace.statusColumns);
  if (!hasWorkspaceArrays) return null;

  return {
    workspace: {
      tasks: Array.isArray(directWorkspace.tasks) ? directWorkspace.tasks : [],
      people: Array.isArray(directWorkspace.people) ? directWorkspace.people : [],
      projects: Array.isArray(directWorkspace.projects) ? directWorkspace.projects : [],
      swimlanes: Array.isArray(directWorkspace.swimlanes) ? directWorkspace.swimlanes : [],
      statusColumns: Array.isArray(directWorkspace.statusColumns) ? directWorkspace.statusColumns : [],
    },
  };
}

function normalizeToolName(name: string): string {
  return TOOL_NAME_ALIASES[name] || name;
}

function parseResourceJson<T>(contents: McpResourceResponse[]): T | null {
  for (const content of contents) {
    if (typeof content.text === 'string' && content.text.trim()) {
      try {
        return JSON.parse(content.text) as T;
      } catch {
        // Ignore malformed text blobs and continue probing.
      }
    }
    if (typeof content.blob === 'string' && content.blob.trim()) {
      try {
        const decoded = atob(content.blob);
        return JSON.parse(decoded) as T;
      } catch {
        // Ignore malformed binary blobs and continue probing.
      }
    }
  }

  return null;
}

function isResourceReadUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('method not found') ||
    message.includes('resources/read') ||
    message.includes('mcp request failed')
  );
}

function hasRequiredKeys(rows: unknown[], requiredKeys: string[]): boolean {
  if (!requiredKeys.length || rows.length === 0) return true;
  return rows.every(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    return requiredKeys.every(key => key in (row as Record<string, unknown>));
  });
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

function getEndpointMode(endpoint: string): 'local' | 'remote' | 'unknown' {
  try {
    const parsed = new URL(endpoint);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'local';
    return 'remote';
  } catch {
    return 'unknown';
  }
}

function getAuthMode(headers?: Record<string, string>): 'none' | 'token' {
  if (!headers) return 'none';
  const hasBearer = typeof headers.Authorization === 'string' && headers.Authorization.trim().length > 0;
  const hasTokenHeader = typeof headers['x-mcp-token'] === 'string' && headers['x-mcp-token'].trim().length > 0;
  return hasBearer || hasTokenHeader ? 'token' : 'none';
}

function classifyConnectionStatus(
  enabled: boolean,
  endpoint: string,
  errors: string[],
  toolsAvailable: string[]
): 'disabled' | 'local-ready' | 'remote-ready' | 'auth-error' | 'handshake-error' | 'unknown' {
  if (!enabled) return 'disabled';

  const errorText = errors.join(' ').toLowerCase();
  if (errorText.includes('unauthorized') || errorText.includes('token expired') || errorText.includes('authentication')) {
    return 'auth-error';
  }
  if (errorText.includes('access is disabled') || errorText.includes('mcp agent access is disabled')) {
    return 'auth-error';
  }

  if (
    errorText.includes('tools/list failed') ||
    errorText.includes('resources/read failed') ||
    errorText.includes('workspace.get_snapshot failed') ||
    errorText.includes('missing mcp tools') ||
    errorText.includes('snapshot payload is missing')
  ) {
    return 'handshake-error';
  }

  if (toolsAvailable.length > 0 && errors.length === 0) {
    return getEndpointMode(endpoint) === 'local' ? 'local-ready' : 'remote-ready';
  }

  return 'unknown';
}

export function createMcpReadService(config: McpClientConfig): McpReadService {
  const client = new McpClient(config);

  const tryReadWorkspaceResource = async (): Promise<McpWorkspaceSnapshot | null> => {
    try {
      const contents = await client.readResource('omvra://workspace');
      const parsed = parseResourceJson<unknown>(contents);
      return normalizeWorkspaceSnapshot(parsed);
    } catch (error) {
      if (isResourceReadUnsupportedError(error)) return null;
      return null;
    }
  };

  const getWorkspaceSnapshotWithFallback = async (): Promise<McpWorkspaceSnapshot> => {
    const resourceSnapshot = await tryReadWorkspaceResource();
    if (resourceSnapshot) return resourceSnapshot;
    return client.callReadTool<McpWorkspaceSnapshot>('workspace.get_snapshot');
  };

  const getSnapshotTasks = async (): Promise<McpTaskSummary[]> => {
    const snapshot = await getWorkspaceSnapshotWithFallback();
    const workspaceTasks = Array.isArray(snapshot?.workspace?.tasks) ? snapshot.workspace.tasks : [];
    return workspaceTasks as McpTaskSummary[];
  };

  const tryReadTaskResource = async (taskId: string): Promise<McpTaskSummary | null> => {
    if (!taskId.trim()) return null;
    try {
      const contents = await client.readResource(`omvra://tasks/${taskId}`);
      const parsed = parseResourceJson<unknown>(contents);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const task = parsed as McpTaskSummary;
        return typeof task.id === 'string' ? task : null;
      }
      return null;
    } catch (error) {
      if (isResourceReadUnsupportedError(error)) return null;
      return null;
    }
  };

  const tryReadCardResource = async (uri: string): Promise<McpCard[] | null> => {
    try {
      const contents = await client.readResource(uri);
      const parsed = parseResourceJson<unknown>(contents);
      if (Array.isArray(parsed)) return parsed as McpCard[];
      if (parsed && typeof parsed === 'object') {
        const candidate = parsed as Record<string, unknown>;
        if (Array.isArray(candidate.cards)) return candidate.cards as McpCard[];
      }
      return null;
    } catch (error) {
      if (isResourceReadUnsupportedError(error)) return null;
      return null;
    }
  };

  return {
    diagnostics: async () => {
      if (!client.enabled) {
        return {
          ok: false,
          endpoint: client.endpoint,
          authMode: getAuthMode(config.headers),
          connectionStatus: 'disabled',
          error: 'disabled',
        };
      }

      const startedAt = performance.now();
      try {
        await client.initialize();
        const tools = await client.listTools();
        const latencyMs = Math.round(performance.now() - startedAt);
        return {
          ok: true,
          endpoint: client.endpoint,
          latencyMs,
          toolCount: tools.length,
          authMode: getAuthMode(config.headers),
          connectionStatus: classifyConnectionStatus(client.enabled, client.endpoint, [], tools.map(tool => tool.name).filter(Boolean)),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          endpoint: client.endpoint,
          latencyMs: Math.round(performance.now() - startedAt),
          authMode: getAuthMode(config.headers),
          connectionStatus: classifyConnectionStatus(client.enabled, client.endpoint, [message], []),
          error: message,
        };
      }
    },

    validateHealth: async (expectation = {}) => {
      const startedAt = performance.now();
      const errors: string[] = [];
      let toolsAvailable: string[] = [];
      let canonicalToolsAvailable: string[] = [];
      let missingTools: string[] = [];
      let resourceReadSupported = false;
      let resourcesAvailable: string[] = [];
      let resourcesMissing: string[] = [...CORE_RESOURCE_URIS];

      if (!client.enabled) {
        return {
          ok: false,
          endpoint: client.endpoint,
          authMode: getAuthMode(config.headers),
          connectionStatus: 'disabled',
          toolsAvailable: [],
          missingTools: [...CORE_READ_TOOLS],
          resourceReadSupported: false,
          resourcesAvailable: [],
          resourcesMissing: [...CORE_RESOURCE_URIS],
          countParity: false,
          requiredKeyParity: false,
          errors: ['MCP access disabled in preferences.'],
        };
      }

      try {
        await client.initialize();
        const tools = await client.listTools();
        toolsAvailable = tools.map(tool => tool.name).filter(Boolean);
        canonicalToolsAvailable = Array.from(new Set(toolsAvailable.map(normalizeToolName)));
      } catch (error) {
        errors.push(`initialize/tools/list failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      missingTools = CORE_READ_TOOLS.filter(name => !canonicalToolsAvailable.includes(name));

      for (const uri of CORE_RESOURCE_URIS) {
        try {
          const contents = await client.readResource(uri);
          if (contents.length > 0) {
            resourceReadSupported = true;
            resourcesAvailable.push(uri);
          }
        } catch (error) {
          if (!isResourceReadUnsupportedError(error)) {
            errors.push(`resources/read failed for ${uri}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      resourcesMissing = CORE_RESOURCE_URIS.filter(uri => !resourcesAvailable.includes(uri));

      let snapshot: McpWorkspaceSnapshot | null = null;
      try {
        snapshot = await getWorkspaceSnapshotWithFallback();
      } catch (error) {
        errors.push(`workspace.get_snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      const workspace = snapshot?.workspace || {};
      const tasks = Array.isArray(workspace.tasks) ? workspace.tasks : [];
      const people = Array.isArray(workspace.people) ? workspace.people : [];
      const swimlanes = Array.isArray(workspace.swimlanes) ? workspace.swimlanes : [];
      const statusColumns = Array.isArray(workspace.statusColumns) ? workspace.statusColumns : [];
      const snapshotCounts = {
        tasks: tasks.length,
        people: people.length,
        swimlanes: swimlanes.length,
        statusColumns: statusColumns.length,
      };

      const expectedCounts = expectation.counts || {};
      const countParity =
        (expectedCounts.tasks === undefined || expectedCounts.tasks === snapshotCounts.tasks) &&
        (expectedCounts.people === undefined || expectedCounts.people === snapshotCounts.people) &&
        (expectedCounts.swimlanes === undefined || expectedCounts.swimlanes === snapshotCounts.swimlanes) &&
        (expectedCounts.statusColumns === undefined || expectedCounts.statusColumns === snapshotCounts.statusColumns);

      const requiredKeyParity =
        hasRequiredKeys(tasks, expectation.requiredTaskKeys || []) &&
        hasRequiredKeys(people, expectation.requiredPersonKeys || []) &&
        hasRequiredKeys(statusColumns, expectation.requiredStatusColumnKeys || []);

      const firstTaskId = typeof (tasks[0] as any)?.id === 'string' ? (tasks[0] as any).id : '';
      if (firstTaskId) {
        const taskUri = `omvra://tasks/${firstTaskId}`;
        try {
          const taskContents = await client.readResource(taskUri);
          if (taskContents.length > 0) {
            resourceReadSupported = true;
            resourcesAvailable.push(taskUri);
          }
        } catch (error) {
          if (!isResourceReadUnsupportedError(error)) {
            errors.push(
              `resources/read failed for ${taskUri}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
      const logicalCallSamples = [1];
      if (canonicalToolsAvailable.includes('tasks.list')) logicalCallSamples.push(1);
      if (canonicalToolsAvailable.includes('tasks.list') && canonicalToolsAvailable.includes('tasks.get') && firstTaskId) {
        logicalCallSamples.push(2);
      }
      if (canonicalToolsAvailable.includes('cards.kanban.list') && canonicalToolsAvailable.includes('tasks.get') && firstTaskId) {
        logicalCallSamples.push(2);
      }
      const medianLogicalCalls = median(logicalCallSamples);

      if (!countParity) {
        errors.push('Snapshot counts do not match in-app counts.');
      }
      if (!requiredKeyParity) {
        errors.push('Snapshot payload is missing one or more required keys.');
      }
      if (missingTools.length > 0) {
        errors.push(`Missing MCP tools: ${missingTools.join(', ')}`);
      }

      const latencyMs = Math.round(performance.now() - startedAt);
      return {
        ok: errors.length === 0,
        endpoint: client.endpoint,
        latencyMs,
        authMode: getAuthMode(config.headers),
        connectionStatus: classifyConnectionStatus(client.enabled, client.endpoint, errors, toolsAvailable),
        toolsAvailable,
        missingTools,
        resourceReadSupported,
        resourcesAvailable,
        resourcesMissing,
        snapshotCounts,
        expectedCounts,
        countParity,
        requiredKeyParity,
        medianLogicalCalls,
        errors,
      };
    },

    getWorkspaceSnapshot: () => getWorkspaceSnapshotWithFallback(),

    listTasks: async (filters = {}) => {
      const tasks = await getSnapshotTasks();
      const status = typeof filters.status === 'string' ? filters.status : null;
      const assigneeId = typeof filters.assigneeId === 'string' ? filters.assigneeId : null;
      const search = typeof filters.search === 'string' ? filters.search.trim().toLowerCase() : '';
      const projectId = typeof filters.projectId === 'string' ? filters.projectId : null;

      return tasks.filter(task => {
        if (status && task.status !== status) return false;
        if (assigneeId && (task as any).assigneeId !== assigneeId) return false;
        if (projectId && !getTaskProjectIds(task as any).includes(projectId)) return false;
        if (search) {
          const title = String(task.title || '').toLowerCase();
          const notes = String((task as any).notes || '').toLowerCase();
          if (!title.includes(search) && !notes.includes(search)) return false;
        }
        return true;
      });
    },

    getTask: async (taskId: string) => {
      if (!taskId.trim()) return null;
      const resourceTask = await tryReadTaskResource(taskId);
      if (resourceTask) return resourceTask;
      const tasks = await getSnapshotTasks();
      return tasks.find(task => task.id === taskId) ?? null;
    },

    listKanbanCards: async (filters = {}) => {
      const hasFilters = Object.values(filters).some(value => value !== undefined && value !== null && value !== '');
      if (!hasFilters) {
        const resourceCards = await tryReadCardResource('omvra://cards/kanban');
        if (resourceCards) return resourceCards;
      }
      const tasks = await getSnapshotTasks();
      const statusId = typeof filters.statusId === 'string' ? filters.statusId : null;
      const assigneeId = typeof filters.assigneeId === 'string' ? filters.assigneeId : null;
      const search = typeof filters.search === 'string' ? filters.search.trim().toLowerCase() : '';

      return tasks
        .filter(task => {
          if (statusId && task.status !== statusId) return false;
          if (assigneeId && (task as any).assigneeId !== assigneeId) return false;
          if (search) {
            const title = String(task.title || '').toLowerCase();
            const notes = String((task as any).notes || '').toLowerCase();
            if (!title.includes(search) && !notes.includes(search)) return false;
          }
          return true;
        })
        .map(task => ({
          id: task.id,
          status: task.status,
          title: task.title,
          assigneeId: (task as any).assigneeId,
          notes: (task as any).notes,
          projectIds: (task as any).projectIds,
        }));
    },

    listTimelineCards: async (filters = {}) => {
      const hasFilters = Object.values(filters).some(value => value !== undefined && value !== null && value !== '');
      if (!hasFilters) {
        const resourceCards = await tryReadCardResource('omvra://cards/timeline');
        if (resourceCards) return resourceCards;
      }
      const tasks = await getSnapshotTasks();
      const laneId = typeof filters.laneId === 'string' ? filters.laneId : null;
      const startDate = typeof filters.startDate === 'string' ? filters.startDate : null;
      const endDate = typeof filters.endDate === 'string' ? filters.endDate : null;

      return tasks
        .filter(task => {
          const taskStart = String((task as any).startDate || '');
          const taskEnd = String((task as any).endDate || taskStart);
          if (laneId && (task as any).swimlaneId !== laneId) return false;
          if (startDate && taskEnd && taskEnd < startDate) return false;
          if (endDate && taskStart && taskStart > endDate) return false;
          return true;
        })
        .map(task => ({
          id: task.id,
          title: task.title,
          swimlaneId: (task as any).swimlaneId,
          startDate: (task as any).startDate,
          endDate: (task as any).endDate,
          assigneeId: (task as any).assigneeId,
          status: task.status,
        }));
    },
  };
}

export function isMcpDisabledError(error: unknown): boolean {
  return error instanceof McpClientDisabledError;
}
