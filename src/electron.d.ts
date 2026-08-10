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
      agentRuntime: {
        getState: () => Promise<{ ok: boolean; value?: AgentRuntimeState; error?: string }>;
        saveProfile: (profile: AgentRuntimeProfile) => Promise<{ ok: boolean; value?: AgentRuntimeProfile; error?: string }>;
        deleteProfile: (profileId: string) => Promise<{ ok: boolean; value?: boolean; error?: string }>;
        saveDefaults: (defaults: AgentRuntimeDefaults) => Promise<{ ok: boolean; value?: AgentRuntimeDefaults; error?: string }>;
        resolve: (payload: AgentRuntimeResolutionInput) => Promise<{ ok: boolean; value?: AgentRuntimeResolution; error?: string }>;
        resolveManagedWorkspace: (taskId: string) => Promise<{ ok: boolean; value?: { workspacePath: string; source: 'scratch-workspace' }; error?: string }>;
        prepareExecution: (payload: Record<string, unknown>) => Promise<any>;
        confirmStart: (payload: Record<string, unknown>) => Promise<any>;
        testConnection: (payload: AgentRuntimeResolutionInput & { workspacePath: string }) => Promise<AgentRuntimeOperationResult>;
        openExternal: (payload: AgentRuntimeResolutionInput & {
          workspacePath: string;
          taskId: string;
          contextReference: string;
          prompt: string;
        }) => Promise<AgentRuntimeOperationResult>;
        sessions: {
          list: (payload?: { bindingId?: string; limit?: number }) => Promise<any>;
          onEvent: (listener: (payload: { kind: 'event' | 'binding'; event?: any; binding?: any }) => void) => () => void;
          requests: (bindingId: string) => Promise<Array<{ bindingId: string; turnId?: string; requestId: string | number; method: string; serverName: string; mode: string; message: string; fields: Array<{ name: string; type: string; title: string; description: string; required: boolean; defaultValue?: unknown; options?: unknown[] }> }>>;
          createBinding: (payload: Record<string, unknown>) => Promise<any>;
          updateBinding: (payload: Record<string, unknown>) => Promise<any>;
          appendEvent: (payload: Record<string, unknown>) => Promise<any>;
          evaluateGovernance: (payload: Record<string, unknown>) => Promise<any>;
          appendOutcome: (payload: Record<string, unknown>) => Promise<any>;
          prepareArchive: (bindingId: string) => Promise<any>;
          start: (payload: Record<string, unknown>) => Promise<any>;
          startGoalNode: (payload: Record<string, unknown>) => Promise<any>;
          prompt: (payload: { bindingId: string; text: string }) => Promise<any>;
          steer: (payload: { bindingId: string; text: string }) => Promise<any>;
          cancel: (payload: { bindingId: string }) => Promise<any>;
          respond: (payload: { bindingId: string; requestId: string | number; result?: unknown; error?: unknown }) => Promise<any>;
          close: (bindingId: string) => Promise<any>;
          continueTask: (bindingId: string) => Promise<any>;
          resume: (payload: Record<string, unknown>) => Promise<any>;
        };
      };
      tasks: {
        exportPdf: (payload: {
          html: string;
          defaultFileName?: string;
        }) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
      };
      taskContext: {
        list: (payload: { taskId: string; limit?: number }) => Promise<any>;
        get: (payload: { taskId: string; entryId: string }) => Promise<any>;
        appendCheckpoint: (payload: { taskId: string; expectedRevision: number; summary: string; idempotencyKey: string }) => Promise<any>;
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

  interface AgentRuntimeProfile {
    schemaVersion: 1;
    id: string;
    name: string;
    integrationMode: 'acp-local-stdio' | 'claude-stream-json-stdio' | 'codex-app-server-stdio' | 'external-handoff';
    executablePath?: string;
    fixedArgs: string[];
    approvalPolicy?: 'untrusted' | 'on-request' | 'never';
    modelPreference?: string;
    externalUrlScheme?: string;
    enabled: boolean;
    createdAt?: string;
    updatedAt?: string;
  }

  interface AgentRuntimeDefaults {
    schemaVersion?: 1;
    acpRuntimeAccessEnabled: boolean;
    globalProfileId: string | null;
    globalWorkspacePath?: string | null;
    projectProfileIds: Record<string, string>;
  }

  interface AgentRuntimeObservation {
    availability: 'available' | 'unavailable' | 'unknown';
    authentication: 'authenticated' | 'not-required' | 'required' | 'unknown';
    capabilities: 'supported' | 'unsupported' | 'unknown';
    observedAt: string;
    state: string;
    implementationName?: string | null;
    adapterVersion?: string | null;
    providerName?: string | null;
    modelOrMode?: string | null;
    agentCapabilities?: Record<string, unknown>;
    models?: Array<{ id: string; isDefault?: boolean }>;
    modelSelection?: 'supported' | 'unsupported' | 'unknown';
    authMethodCount?: number;
    error?: string;
  }

  interface AgentRuntimeState {
    schemaVersion: 1;
    profiles: AgentRuntimeProfile[];
    defaults: AgentRuntimeDefaults;
    observations: Record<string, AgentRuntimeObservation>;
  }

  interface AgentRuntimeResolutionInput {
    executionProfileId?: string;
    projectId?: string;
  }

  interface AgentRuntimeResolution {
    ok: boolean;
    state: string;
    source: 'execution-override' | 'project-default' | 'global-default';
    profile?: AgentRuntimeProfile;
    error?: string;
  }

  interface AgentRuntimeOperationResult extends AgentRuntimeResolution {
    observation?: AgentRuntimeObservation;
    handoff?: {
      id: string;
      profileId: string;
      taskId: string;
      contextReference: string;
      workspacePath: string;
      promptLength: number;
      requestedAt: string;
      outcome: 'intent-recorded';
    };
  }
}
