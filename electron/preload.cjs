const { contextBridge, ipcRenderer } = require('electron');
const STORE_DID_CHANGE_CHANNEL = 'store/did-change';
const UPDATE_STATE_CHANNEL = 'updates/state-changed';
const GOAL_RUNTIME_CHANGED_CHANNEL = 'goals/runtime-changed';
const AGENT_RUNTIME_EVENT_CHANNEL = 'agent-runtime/event';
const RENDERER_DIAGNOSTIC_CHANNEL = 'renderer/diagnostic';

function reportRendererDiagnostic(kind, error) {
  const value = error?.reason || error?.error || error;
  ipcRenderer.send(RENDERER_DIAGNOSTIC_CHANNEL, {
    kind,
    message: typeof value === 'string' ? value.slice(0, 1000) : value?.message?.slice?.(0, 1000) || String(value).slice(0, 1000),
    stack: value?.stack?.slice?.(0, 4000) || null,
    url: typeof window !== 'undefined' ? window.location.href : null,
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', event => reportRendererDiagnostic('window-error', event.error || event.message));
  window.addEventListener('unhandledrejection', event => reportRendererDiagnostic('unhandled-rejection', event.reason));
}

contextBridge.exposeInMainWorld('electron', {
  // Store
  storeGet: (key) => ipcRenderer.invoke('store/get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store/set', key, value),
  storeSetMany: (values) => ipcRenderer.invoke('store/set-many', values),
  storeDelete: (key) => ipcRenderer.invoke('store/delete', key),
  storeExport: () => ipcRenderer.invoke('store/export'),
  recordGoalPolicyImpact: (payload) => ipcRenderer.invoke('goal-policy/record-impact', payload),
  goals: {
    getRuntime: (goalId) => ipcRenderer.invoke('goals/get-runtime', goalId),
    resetExecution: (payload) => ipcRenderer.invoke('goals/reset-execution', payload),
    update: (payload) => ipcRenderer.invoke('goals/update', payload),
    updateArtifacts: (payload) => ipcRenderer.invoke('goals/update-artifacts', payload),
    onRuntimeChanged: (listener) => {
      if (typeof listener !== 'function') return () => {};
      const wrappedListener = (_event, payload) => listener(payload);
      ipcRenderer.on(GOAL_RUNTIME_CHANGED_CHANNEL, wrappedListener);
      return () => ipcRenderer.removeListener(GOAL_RUNTIME_CHANGED_CHANNEL, wrappedListener);
    },
  },
  onStoreChanged: (listener) => {
    if (typeof listener !== 'function') {
      return () => {};
    }

    const wrappedListener = (_event, payload) => {
      listener(payload);
    };
    ipcRenderer.on(STORE_DID_CHANGE_CHANNEL, wrappedListener);

    return () => {
      ipcRenderer.removeListener(STORE_DID_CHANGE_CHANNEL, wrappedListener);
    };
  },

  app: {
    getRuntimeInfo: () => ipcRenderer.invoke('app/get-runtime-info'),
  },

  performance: {
    record: (event) => ipcRenderer.invoke('performance/record', event),
    recordBatch: (events) => ipcRenderer.invoke('performance/record-batch', events),
    openLogsFolder: () => ipcRenderer.invoke('performance/open-logs-folder'),
    clearLogs: () => ipcRenderer.invoke('performance/clear-logs'),
  },

  updates: {
    getState: () => ipcRenderer.invoke('updates/get-state'),
    check: () => ipcRenderer.invoke('updates/check'),
    download: () => ipcRenderer.invoke('updates/download'),
    install: () => ipcRenderer.invoke('updates/install'),
    dismiss: () => ipcRenderer.invoke('updates/dismiss'),
    setChannel: (channel) => ipcRenderer.invoke('updates/set-channel', channel),
    onStateChanged: (listener) => {
      if (typeof listener !== 'function') {
        return () => {};
      }

      const wrappedListener = (_event, payload) => {
        listener(payload);
      };
      ipcRenderer.on(UPDATE_STATE_CHANNEL, wrappedListener);

      return () => {
        ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrappedListener);
      };
    },
  },

  // Attachments
  attachments: {
    pick: () => ipcRenderer.invoke('attachments/pick'),
    verify: (filePath) => ipcRenderer.invoke('attachments/verify', filePath),
    embed: (filePath) => ipcRenderer.invoke('attachments/embed', filePath),
    reveal: (filePath) => ipcRenderer.invoke('attachments/reveal', filePath),
  },

  goalAudit: {
    pickDirectory: () => ipcRenderer.invoke('goal-audit/pick-directory'),
  },

  skills: {
    pickDirectory: () => ipcRenderer.invoke('skills/pick-directory'),
  },

  // Open external (validated in main)
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  agentRuntime: {
    getState: () => ipcRenderer.invoke('agent-runtime/get-state'),
    saveProfile: (profile) => ipcRenderer.invoke('agent-runtime/save-profile', profile),
    deleteProfile: (profileId) => ipcRenderer.invoke('agent-runtime/delete-profile', profileId),
    saveDefaults: (defaults) => ipcRenderer.invoke('agent-runtime/save-defaults', defaults),
    resolve: (payload) => ipcRenderer.invoke('agent-runtime/resolve', payload),
    resolveManagedWorkspace: (taskId) => ipcRenderer.invoke('agent-runtime/resolve-managed-workspace', taskId),
    prepareExecution: (payload) => ipcRenderer.invoke('agent-runtime/prepare-execution', payload),
    confirmStart: (payload) => ipcRenderer.invoke('agent-runtime/confirm-start', payload),
    testConnection: (payload) => ipcRenderer.invoke('agent-runtime/test-connection', payload),
    openExternal: (payload) => ipcRenderer.invoke('agent-runtime/open-external', payload),
    sessions: {
      list: (payload) => ipcRenderer.invoke('agent-runtime/sessions/list', payload),
      onEvent: (listener) => {
        if (typeof listener !== 'function') return () => {};
        const wrappedListener = (_event, payload) => listener(payload);
        ipcRenderer.on(AGENT_RUNTIME_EVENT_CHANNEL, wrappedListener);
        return () => ipcRenderer.removeListener(AGENT_RUNTIME_EVENT_CHANNEL, wrappedListener);
      },
      requests: (bindingId) => ipcRenderer.invoke('agent-runtime/sessions/requests', bindingId),
      createBinding: (payload) => ipcRenderer.invoke('agent-runtime/sessions/create-binding', payload),
      updateBinding: (payload) => ipcRenderer.invoke('agent-runtime/sessions/update-binding', payload),
      appendEvent: (payload) => ipcRenderer.invoke('agent-runtime/sessions/append-event', payload),
      evaluateGovernance: (payload) => ipcRenderer.invoke('agent-runtime/sessions/evaluate-governance', payload),
      appendOutcome: (payload) => ipcRenderer.invoke('agent-runtime/sessions/append-outcome', payload),
      prepareArchive: (bindingId) => ipcRenderer.invoke('agent-runtime/sessions/prepare-archive', bindingId),
      start: (payload) => ipcRenderer.invoke('agent-runtime/sessions/start', payload),
      startGoalNode: (payload) => ipcRenderer.invoke('agent-runtime/sessions/start-goal-node', payload),
      prompt: (payload) => ipcRenderer.invoke('agent-runtime/sessions/prompt', payload),
      steer: (payload) => ipcRenderer.invoke('agent-runtime/sessions/steer', payload),
      cancel: (payload) => ipcRenderer.invoke('agent-runtime/sessions/cancel', payload),
      respond: (payload) => ipcRenderer.invoke('agent-runtime/sessions/respond', payload),
      close: (bindingId) => ipcRenderer.invoke('agent-runtime/sessions/close', bindingId),
      continueTask: (bindingId) => ipcRenderer.invoke('agent-runtime/sessions/continue-task', bindingId),
      resume: (payload) => ipcRenderer.invoke('agent-runtime/sessions/resume', payload),
    },
  },

  // Task actions
  tasks: {
    exportPdf: (payload) => ipcRenderer.invoke('tasks/export-pdf', payload),
  },

  taskContext: {
    list: (payload) => ipcRenderer.invoke('task-context/list', payload),
    get: (payload) => ipcRenderer.invoke('task-context/get', payload),
    appendCheckpoint: (payload) => ipcRenderer.invoke('task-context/append-checkpoint', payload),
  },

  agentConfigurations: {
    export: (payload) => ipcRenderer.invoke('agent-configurations/export', payload),
  },

  // MCP bridge (read-only, gated by mcpAgentAccessEnabled preference)
  mcp: {
    getCapabilities: () => ipcRenderer.invoke('mcp/get-capabilities'),
    getListenerStatus: () => ipcRenderer.invoke('mcp/get-listener-status'),
    getAuditLog: (options) => ipcRenderer.invoke('mcp/get-audit-log', options),
    getAuditSummary: (options) => ipcRenderer.invoke('mcp/get-audit-summary', options),
    getWorkspaceSnapshot: () => ipcRenderer.invoke('mcp/workspace/snapshot'),
    restartServer: () => ipcRenderer.invoke('mcp/restart-server'),
  },
});
