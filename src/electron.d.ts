// Asset module declarations for Vite
declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.jpeg' {
  const content: string;
  export default content;
}

declare module '*.gif' {
  const content: string;
  export default content;
}

export {};

declare global {
  interface McpBridgeError {
    code: string;
    message: string;
  }

  interface McpCapabilities {
    enabled: boolean;
    readOnly: boolean;
    protocolVersion?: string;
    serverInfo?: {
      name: string;
      version: string;
    };
    capabilityProfile?: 'read_only' | 'task_write' | 'admin';
    capabilityProfiles?: Array<'read_only' | 'task_write' | 'admin'>;
    transportModes?: Array<'http' | 'stdio'>;
    capabilities: {
      workspaceSnapshot: boolean;
      resourcesRead?: boolean;
      writeTools?: boolean;
      initialize?: boolean;
    };
    writeBoundary?: {
      enforced: boolean;
      writeToolsEnabled: boolean;
      exposedWriteTools: string[];
    };
  }

  interface McpWorkspaceSnapshot {
    schemaVersion: string;
    generatedAt: string;
    readOnly: boolean;
    workspace: {
      tasks: any[];
      people: any[];
      projects: any[];
      swimlanes: any[];
      statusColumns: any[];
    };
    meta: {
      source: string;
      mcpAgentAccessEnabled: boolean;
      counts: {
        tasks: number;
        people: number;
        projects: number;
        statusColumns: number;
      };
    };
  }

  interface McpBridgeResult<T> {
    ok: boolean;
    data?: T;
    error?: McpBridgeError;
  }

  interface McpTokenStatus {
    configured: boolean;
    status: 'none' | 'active' | 'expired' | 'invalid-issued-at';
    expired: boolean;
    issuedAt: string | null;
    expiresAt: string | null;
    remainingMinutes: number | null;
    ttlMinutes: number;
  }

  interface McpListenerStatus {
    enabled: boolean;
    status: 'disabled' | 'starting' | 'running' | 'stopped' | 'error';
    listening: boolean;
    host: string;
    port: number;
    path: string;
    expectedAddress: string;
    boundAddress: string | null;
    boundUrl: string | null;
    capabilityProfile: 'read_only' | 'task_write' | 'admin';
    authMode: 'none' | 'token';
    token: McpTokenStatus;
    error: string | null;
    lastStartedAt: string | null;
    lastStoppedAt: string | null;
    lastUpdatedAt: string | null;
    restartRequired: boolean;
  }

  interface McpAuditEntry {
    auditId: string;
    timestamp: string;
    type?: string;
    outcome?: string;
    reason?: string;
    toolName?: string;
    taskId?: string;
    nextRevision?: number;
    targetStatusId?: string;
    targetStatusTitle?: string;
    assigneeId?: string;
    assigneeName?: string;
    method?: string;
    origin?: string;
    transport?: string;
    userAgent?: string;
    clientName?: string;
    clientVersion?: string;
    remoteAddress?: string;
    capabilityProfile?: string;
    durationMs?: number;
    failureClass?: string | null;
    [key: string]: unknown;
  }

  interface McpAuditMetricSummary {
    count: number;
    successCount: number;
    failureCount: number;
    deniedCount: number;
    successRate: number | null;
    failureRate: number | null;
    deniedRate: number | null;
    duration: {
      sampleSize: number;
      medianMs: number | null;
      p95Ms: number | null;
    };
    logicalCalls: {
      sampleSize: number;
      total: number | null;
      median: number | null;
    };
  }

  interface McpAuditDimensionGroup extends McpAuditMetricSummary {
    key: string;
  }

  interface McpAuditSummary {
    schemaVersion: 1;
    generatedAt: string;
    sampleSize: number;
    filters: Record<string, string>;
    overall: McpAuditMetricSummary;
    by: Record<string, McpAuditDimensionGroup[]>;
  }

  interface AppUpdateInfo {
    version: string;
    releaseDate: string | null;
    releaseName: string | null;
    releaseNotes: string | null;
    isPrerelease: boolean;
  }

  interface AppUpdateState {
    supported: boolean;
    packaged: boolean;
    channel: 'stable' | 'rc';
    status: 'idle' | 'unsupported' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
    unsupportedReason: 'unpackaged' | 'updater-unavailable';
    unsupportedDetails: string | null;
    update: AppUpdateInfo | null;
    progressPercent: number | null;
    error: string | null;
    requiresBackup: boolean;
    lastCheckedAt: string | null;
  }

  interface Window {
    electron: {
      storeGet: (key: string) => Promise<any>;
      storeSet: (key: string, value: any) => Promise<void>;
      storeDelete: (key: string) => Promise<void>;
      storeExport: () => Promise<Record<string, any>>;
      recordGoalPolicyImpact: (payload: { previousPolicy: any; nextPolicy: any; actor?: string }) => Promise<{ ok: boolean; changed?: boolean; impacts?: any[] }>;
      goals: {
        getRuntime: (goalId: string) => Promise<any>;
        resetExecution: (payload: { goalId: string }) => Promise<{ ok: boolean; reset?: boolean; execution?: any; abandonedExecutionId?: string | null; error?: string; message?: string }>;
        update: (payload: { goalId: string; title?: string; elements?: any[]; overseerAgentId?: string; expectedRevision: number }) => Promise<{ ok: boolean; goal?: any; revision?: number; error?: string; currentRevision?: number; message?: string }>;
        updateArtifacts: (payload: { goalId: string; elementId: string; artifactReferences: any[]; expectedRevision: number; idempotencyKey: string }) => Promise<{ ok: boolean; goal?: any; revision?: number; error?: string; currentRevision?: number; message?: string; idempotent?: boolean }>;
        onRuntimeChanged: (listener: (payload: { eventId: string; scope: 'graph' | 'execution' | 'policy' | 'conflict' | 'reconciliation' | 'schedule'; goalId: string; revision: number; actor: string; changeType: string; occurredAt: string; errorCode?: string; details?: Record<string, unknown> }) => void) => () => void;
      };
      onStoreChanged: (listener: (payload: { updatedAt: string }) => void) => () => void;
      app: {
        getRuntimeInfo: () => Promise<{
          name: string;
          version: string;
          isPackaged: boolean;
          electronVersion: string;
          chromeVersion: string;
          nodeVersion: string;
          codeSignature?: {
            status: 'unchecked' | 'unknown' | 'adhoc' | 'signed';
            signature: string | null;
            teamIdentifier: string | null;
            details: string | null;
          };
        }>;
      };
      updates: {
        getState: () => Promise<AppUpdateState>;
        check: () => Promise<AppUpdateState>;
        download: () => Promise<AppUpdateState>;
        install: () => Promise<{ success: boolean; error?: string | null }>;
        dismiss: () => Promise<AppUpdateState>;
        setChannel: (channel: 'stable' | 'rc') => Promise<Pick<AppUpdateState, 'channel'> | AppUpdateState>;
        onStateChanged: (listener: (payload: AppUpdateState) => void) => () => void;
      };
      attachments: {
        pick: () => Promise<string[]>;
        verify: (path: string) => Promise<any>;
        embed: (path: string) => Promise<any>;
        reveal: (path: string) => Promise<{ success: boolean; error?: string }>;
      };
      goalAudit: {
        pickDirectory: () => Promise<string | null>;
      };
      skills: {
        pickDirectory: () => Promise<string | null>;
      };
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      tasks: {
        exportPdf: (payload: {
          html: string;
          defaultFileName?: string;
        }) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
      };
      agentConfigurations: {
        export: (payload: {
          json: string;
          defaultFileName?: string;
        }) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
      };
      mcp: {
        getCapabilities: () => Promise<McpBridgeResult<McpCapabilities>>;
        getListenerStatus: () => Promise<McpBridgeResult<McpListenerStatus>>;
        getAuditLog: (options?: { limit?: number }) => Promise<McpBridgeResult<McpAuditEntry[]>>;
        getAuditSummary: (options?: Record<string, string | number>) => Promise<McpBridgeResult<McpAuditSummary>>;
        getWorkspaceSnapshot: () => Promise<McpBridgeResult<McpWorkspaceSnapshot>>;
        restartServer: () => Promise<{ success: boolean; error?: string; listenerStatus?: McpListenerStatus }>;
      };
    };
  }
}
