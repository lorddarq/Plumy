export interface McpClientConfig {
  enabled: boolean;
  endpoint: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpServerInfo {
  name?: string;
  version?: string;
}

export interface McpInitializeResult {
  protocolVersion?: string;
  serverInfo?: McpServerInfo;
  capabilities?: Record<string, unknown>;
  instructions?: string;
}

export interface McpResourceResponse {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export type McpReadToolName =
  | 'workspace.get_snapshot'
  | 'goals.list'
  | 'goals.get'
  | 'tasks.list'
  | 'tasks.get'
  | 'cards.kanban.list'
  | 'cards.timeline.list';

export interface McpDiagnosticsResult {
  ok: boolean;
  endpoint: string;
  latencyMs?: number;
  toolCount?: number;
  authMode?: 'none' | 'token';
  connectionStatus?: 'disabled' | 'local-ready' | 'remote-ready' | 'auth-error' | 'handshake-error' | 'unknown';
  error?: string;
}

export interface McpSnapshotExpectation {
  counts?: {
    tasks?: number;
    people?: number;
    swimlanes?: number;
    statusColumns?: number;
  };
  requiredTaskKeys?: string[];
  requiredPersonKeys?: string[];
  requiredStatusColumnKeys?: string[];
}

export interface McpHealthCheckResult {
  ok: boolean;
  endpoint: string;
  latencyMs?: number;
  authMode?: 'none' | 'token';
  connectionStatus?: 'disabled' | 'local-ready' | 'remote-ready' | 'auth-error' | 'handshake-error' | 'unknown';
  toolsAvailable: string[];
  missingTools: string[];
  resourceReadSupported: boolean;
  resourcesAvailable: string[];
  resourcesMissing: string[];
  snapshotCounts?: {
    tasks: number;
    people: number;
    swimlanes: number;
    statusColumns: number;
  };
  expectedCounts?: {
    tasks?: number;
    people?: number;
    swimlanes?: number;
    statusColumns?: number;
  };
  countParity: boolean;
  requiredKeyParity: boolean;
  medianLogicalCalls?: number;
  errors: string[];
}

export interface McpWorkspaceSnapshot {
  contentBoundary?: {
    classification?: string;
    instructionPrecedence?: string;
    note?: string;
  };
  workspaceId?: string;
  name?: string;
  tasks?: unknown[];
  projects?: unknown[];
  people?: unknown[];
  statusColumns?: unknown[];
  readOnly?: boolean;
  schemaVersion?: string;
  generatedAt?: string;
  meta?: {
    fieldSemantics?: {
      people?: {
        agentInstructions?: string;
        agentOperationalInstructions?: string;
      };
    };
    [key: string]: unknown;
  };
  workspace?: {
    tasks?: unknown[];
    people?: unknown[];
    projects?: unknown[];
    swimlanes?: unknown[];
    statusColumns?: unknown[];
    goals?: unknown[];
  };
  [key: string]: unknown;
}

export interface McpTaskSummary {
  id: string;
  title?: string;
  status?: string;
  [key: string]: unknown;
}

export interface McpCard {
  id: string;
  [key: string]: unknown;
}
