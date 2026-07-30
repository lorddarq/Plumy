const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawnSync } = require('child_process');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
let autoUpdater = null;
let autoUpdaterLoadError = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (error) {
  autoUpdaterLoadError = error?.message || String(error);
  console.warn('[updates] electron-updater is unavailable:', error?.message || error);
}
const { registerMcpIpcHandlers } = require('./ipc/mcp.cjs');
const { registerStoreIpcHandlers } = require('./ipc/store.cjs');
const { registerGoalIpcHandlers } = require('./ipc/goals.cjs');
const { registerDocumentIpcHandlers } = require('./ipc/documents.cjs');
const { registerAttachmentIpcHandlers } = require('./ipc/attachments.cjs');
const { registerExternalLinkIpcHandlers } = require('./ipc/external-links.cjs');
const { registerRuntimeIpcHandlers } = require('./ipc/runtime.cjs');
const { registerAgentRuntimeIpcHandlers } = require('./ipc/agent-runtime.cjs');
const { createAgentRuntimeSessionRunner } = require('./services/agent-runtime-session-runner.cjs');
const { resolveProfile: resolveAgentRuntimeProfile } = require('./domain/agent-runtime-profile-service.cjs');
const { registerTaskContextIpcHandlers } = require('./ipc/task-context.cjs');
const { captureMeaningfulTaskCheckpoints } = require('./domain/task-context-checkpoint-service.cjs');
const { startMcpHttpServer } = require('./services/mcp-http-server.cjs');
const {
  createUpdateController,
  normalizeUpdateChannel,
  normalizeUnsupportedReason,
} = require('./services/update-service.cjs');
const { registerUpdateIpcHandlers } = require('./services/update-ipc.cjs');
const {
  isMcpAgentAccessEnabled,
  buildMcpListenerStatus,
  updateGoal,
  updateGoalArtifactReferences,
  archiveMcpAuditEntries,
  listTaskContextEntries,
  getTaskContextEntry,
  appendTaskContextEntry,
  appendAgentRuntimeEvent,
  appendAgentRuntimeOutcome,
  confirmAgentExecutionStart,
  createAgentRuntimeSessionBinding,
  evaluateAgentRuntimeGovernance,
  listAgentRuntimeSessions,
  prepareAgentExecution,
  prepareAgentRuntimeSessionArchive,
  reconcileInterruptedAgentRuntimeSessions,
  updateAgentRuntimeSessionBinding,
} = require('./services/workspace-service.cjs');
const { recordGoalPolicyChangeImpact } = require('./services/goal-policy.cjs');
const { createGoalLifecycleService } = require('./services/goal-lifecycle-service.cjs');
const { runDueSchedules } = require('./services/goal-schedule-service.cjs');
const { createGoalRuntimeService } = require('./services/goal-runtime-service.cjs');
const { getBundledSkillsRoot } = require('./services/skill-service.cjs');
const { resolveWorkspaceUserDataPath } = require('./services/workspace-paths.cjs');

const APP_NAME = 'Omvra';
// Consider the app to be in dev mode when it's not packaged. This avoids trying to load a dev server in packaged builds.
const isDev = !app.isPackaged;
const storeName = isDev ? 'omvra-store-dev' : 'omvra-store';
// Keep existing development workspaces on their original path after the package rename.
const appDataPath = app.getPath('appData');
const userDataPath = resolveWorkspaceUserDataPath({ appDataPath, appName: APP_NAME, isDev }) || app.getPath('userData');
app.setName(APP_NAME);
app.setPath('userData', userDataPath);
const store = new Store({ name: storeName });
reconcileInterruptedAgentRuntimeSessions(store);
const agentRuntimeSessionRunner = createAgentRuntimeSessionRunner({
  store,
  resolveProfile: resolveAgentRuntimeProfile,
  confirmStart: (runtimeStore, payload) => confirmAgentExecutionStart(runtimeStore, payload),
  transitionContribution: (runtimeStore, payload) => require('./services/workspace-service.cjs').transitionTaskContribution(runtimeStore, payload),
  createBinding: (runtimeStore, payload) => createAgentRuntimeSessionBinding(runtimeStore, payload),
  updateBinding: (runtimeStore, payload) => updateAgentRuntimeSessionBinding(runtimeStore, payload),
  appendEvent: (runtimeStore, payload) => appendAgentRuntimeEvent(runtimeStore, payload),
  listSessions: (runtimeStore, payload) => listAgentRuntimeSessions(runtimeStore, payload),
});
const STORE_DID_CHANGE_CHANNEL = 'store/did-change';
const UPDATE_STATE_CHANNEL = 'updates/state-changed';
const GOAL_RUNTIME_CHANGED_CHANNEL = 'goals/runtime-changed';
const PREFERENCES_KEY = 'omvra.preferences.v1';
const TASKS_KEY = 'omvra.tasks.v1';
const goalRuntime = createGoalRuntimeService({ store });
let mcpHttpServer = null;
let updateController = null;
let goalScheduleTimer = null;
let mcpRuntimeState = {
  status: 'stopped',
  listening: false,
  error: null,
  boundAddress: null,
  boundUrl: null,
  lastStartedAt: null,
  lastStoppedAt: null,
  lastUpdatedAt: null,
  restartRequired: false,
};

function setMcpRuntimeState(nextState) {
  mcpRuntimeState = {
    ...mcpRuntimeState,
    ...nextState,
  };
}

function shouldStartMcpServer() {
  // Explicit runtime overrides for troubleshooting enterprise endpoint controls.
  if (process.env.OMVRA_DISABLE_MCP_SERVER === '1') return false;
  if (process.env.OMVRA_ENABLE_MCP_SERVER === '1') return true;
  return isMcpAgentAccessEnabled(store);
}

function restartMcpServer() {
  if (mcpHttpServer) {
    mcpHttpServer.close();
    mcpHttpServer = null;
  }
  if (!shouldStartMcpServer()) {
    console.log('[mcp] Startup skipped (disabled by preferences or environment)');
    setMcpRuntimeState({
      status: 'disabled',
      listening: false,
      error: null,
      boundAddress: null,
      boundUrl: null,
      restartRequired: false,
      lastStoppedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    });
    return;
  }
  mcpHttpServer = startMcpHttpServer(store, {
    logger: console,
    onStatusChange: setMcpRuntimeState,
    skillsRoot: getBundledSkillsRoot({
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
    }),
    userSkillsRoot: app.getPath('userData'),
    emitRuntimeChange: goalRuntime.emit,
  });
}

function startGoalScheduleRuntime() {
  if (goalScheduleTimer) clearInterval(goalScheduleTimer);
  const lifecycle = createGoalLifecycleService({
    store,
    skillsRoot: getBundledSkillsRoot({
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
    }),
    userDataPath: app.getPath('userData'),
    onRuntimeChange: goalRuntime.emit,
  });
  const tick = () => {
    try {
      const result = runDueSchedules({ store, lifecycle, onRuntimeChange: goalRuntime.emit });
      if (result.occurrences.length) console.log(`[goals] scheduled ${result.occurrences.length} occurrence(s)`);
    } catch (error) {
      console.error('[goals] schedule runtime failed:', error?.message || error);
    }
  };
  tick();
  goalScheduleTimer = setInterval(tick, 30_000);
}

function broadcastStoreDidChange() {
  const payload = {
    updatedAt: new Date().toISOString(),
  };

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(STORE_DID_CHANGE_CHANNEL, payload);
    }
  }
}

goalRuntime.onChanged((event) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(GOAL_RUNTIME_CHANGED_CHANNEL, event);
  }
});

function broadcastUpdateState(updateState) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(UPDATE_STATE_CHANNEL, updateState);
    }
  }
}

function getStoredUpdateChannel() {
  const storedPreferences = store.get(PREFERENCES_KEY);
  return normalizeUpdateChannel(storedPreferences?.updateChannel);
}

function setStoredUpdateChannel(channel) {
  const normalized = normalizeUpdateChannel(channel);
  const storedPreferences = store.get(PREFERENCES_KEY);
  store.set(PREFERENCES_KEY, {
    ...(storedPreferences && typeof storedPreferences === 'object' ? storedPreferences : {}),
    updateChannel: normalized,
  });
  return normalized;
}

function syncUpdateChannelFromStore() {
  if (!updateController) return null;
  return updateController.setChannel(getStoredUpdateChannel());
}

function getDebugUpdateFixtureFromEnv() {
  const status = typeof process.env.OMVRA_DEBUG_UPDATE_STATUS === 'string'
    ? process.env.OMVRA_DEBUG_UPDATE_STATUS.trim()
    : '';
  if (!status) return null;

  return {
    status,
    version: process.env.OMVRA_DEBUG_UPDATE_VERSION,
    releaseName: process.env.OMVRA_DEBUG_UPDATE_NAME,
    releaseNotes: process.env.OMVRA_DEBUG_UPDATE_NOTES,
    releaseDate: process.env.OMVRA_DEBUG_UPDATE_DATE,
    channel: process.env.OMVRA_DEBUG_UPDATE_CHANNEL,
    progressPercent: process.env.OMVRA_DEBUG_UPDATE_PROGRESS,
    requiresBackup: process.env.OMVRA_DEBUG_UPDATE_REQUIRES_BACKUP === '1',
    error: process.env.OMVRA_DEBUG_UPDATE_ERROR,
    lastCheckedAt: process.env.OMVRA_DEBUG_UPDATE_LAST_CHECKED_AT,
  };
}

function getAppBundlePath() {
  const marker = '.app/Contents/MacOS/';
  const executablePath = typeof process.execPath === 'string' ? process.execPath : '';
  const markerIndex = executablePath.indexOf(marker);
  return markerIndex === -1 ? null : executablePath.slice(0, markerIndex + 4);
}

function readCurrentMacCodeSignature() {
  if (process.platform !== 'darwin' || !app.isPackaged) {
    return {
      status: 'unchecked',
      signature: null,
      teamIdentifier: null,
      details: null,
    };
  }

  const appBundlePath = getAppBundlePath();
  if (!appBundlePath) {
    return {
      status: 'unknown',
      signature: null,
      teamIdentifier: null,
      details: 'Could not resolve the installed Omvra app bundle.',
    };
  }

  const result = spawnSync('codesign', ['-dv', '--verbose=4', appBundlePath], { encoding: 'utf8' });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  if (result.status !== 0) {
    return {
      status: 'unknown',
      signature: null,
      teamIdentifier: null,
      details: output || 'codesign inspection failed.',
    };
  }

  let signature = null;
  let teamIdentifier = null;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('Signature=')) {
      signature = line.slice('Signature='.length).trim();
      continue;
    }
    if (line.startsWith('TeamIdentifier=')) {
      teamIdentifier = line.slice('TeamIdentifier='.length).trim();
    }
  }

  const isAdhoc = !signature || signature === 'adhoc' || !teamIdentifier || teamIdentifier === 'not set';
  return {
    status: isAdhoc ? 'adhoc' : 'signed',
    signature,
    teamIdentifier,
    details: null,
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Set macOS dock icon at runtime if the .icns file exists
  if (process.platform === 'darwin') {
    const dockIconCandidates = [path.join(__dirname, 'assets', 'app.icns'), path.join(__dirname, 'assets', 'icon.icns')];
    try {
      for (const dockIcon of dockIconCandidates) {
        if (fs.existsSync(dockIcon) && app.dock) {
          app.dock.setIcon(dockIcon);
          break;
        }
      }
    } catch (err) {
      // ignore errors setting dock icon
    }
  }

  const loadDev = async () => {
    const devUrl = 'http://localhost:5173';
    try {
      await win.loadURL(devUrl);
      win.webContents.openDevTools({ mode: 'detach' });
    } catch (e) {
      console.error('Failed to load dev server at', devUrl, e);
      // fallback to packaged index if available
      const prodIndex = path.join(__dirname, '../dist/index.html');
      try {
        if (fs.existsSync(prodIndex)) {
          await win.loadFile(prodIndex);
        } else {
          dialog.showErrorBox('App load error', `Could not load dev server (${devUrl}) and no packaged index found at ${prodIndex}`);
        }
      } catch (err) {
        dialog.showErrorBox('App load error', `Failed to load app: ${err?.message || err}`);
      }
    }
  };

  // Add error listeners to help diagnose load failures in packaged apps
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('WebContents failed to load', { errorCode, errorDescription, validatedURL, isMainFrame });
    try { dialog.showErrorBox('Load Error', `Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`); } catch (e) {}
  });

  win.webContents.on('did-finish-load', () => {
    console.log('WebContents finished load:', win.webContents.getURL());

    // Probe the renderer for DOM content to help diagnose empty UI
    try {
      win.webContents.executeJavaScript(`(async function(){
        await new Promise(r => setTimeout(r, 500));
        const root = document.getElementById('root');
        const bodyText = document.body ? document.body.innerText.slice(0,400) : null;
        const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src || s.innerHTML.slice(0,80));
        return { exists: !!root, html: root ? root.innerHTML.slice(0,200) : null, bodyText, scripts };
      })()`)
      .then((res) => {
        console.log('Renderer probe:', res);
      }).catch(err => console.error('Renderer probe failed', err));
    } catch (err) {
      console.error('Renderer probe error', err);
    }
  });

  // Forward renderer console messages to main process stdout for easier debugging
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[renderer console][level=${level}] ${message} (line:${line} source:${sourceId})`);
  });

  // Detect render process crashes or terminations
  win.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details);
    try { dialog.showErrorBox('Renderer error', `Renderer process terminated: ${details.reason}`); } catch (e) {}
  });

  win.webContents.on('crashed', (event) => {
    console.error('Renderer crashed');
    try { dialog.showErrorBox('Renderer crashed', 'The renderer process crashed.'); } catch (e) {}
  });

  const loadProd = async () => {
    const prodIndex = path.join(__dirname, '../dist/index.html');
    try {
      if (fs.existsSync(prodIndex)) {
        await win.loadFile(prodIndex);
      } else {
        dialog.showErrorBox('Missing app files', `Packaged index not found at ${prodIndex}. Ensure the build artifacts are included in the app bundle.`);
      }
    } catch (err) {
      console.error('Failed to load packaged index', err);
      dialog.showErrorBox('App load error', `Failed to load packaged app: ${err?.message || err}`);
    }
  };

  if (isDev) {
    loadDev();
  } else {
    loadProd();
  }

  // Optionally open devtools in packaged app for debugging when OMVRA_DEBUG_RENDERER=1
  try {
    if (!isDev && process.env.OMVRA_DEBUG_RENDERER === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } catch (e) {}

}

app.whenReady().then(() => {
  // Bind MCP endpoint to localhost only; no external interface exposure.
  store.onDidAnyChange((nextStore, previousStore) => {
    try {
      captureMeaningfulTaskCheckpoints(store, {
        previousTasks: previousStore?.[TASKS_KEY],
        nextTasks: nextStore?.[TASKS_KEY],
        appendTaskContextEntry,
      });
    } catch (error) {
      console.error('[task-context] checkpoint capture failed:', error?.message || error);
    }
    broadcastStoreDidChange();
    syncUpdateChannelFromStore();
  });
  updateController = createUpdateController({
    app,
    updater: autoUpdater,
    onStateChange: broadcastUpdateState,
    debugUpdateFixture: getDebugUpdateFixtureFromEnv(),
    unsupportedReason: normalizeUnsupportedReason(app.isPackaged && !autoUpdater ? 'updater-unavailable' : 'unpackaged'),
    unsupportedDetails: app.isPackaged && !autoUpdater ? autoUpdaterLoadError : null,
  });
  syncUpdateChannelFromStore();
  restartMcpServer();
  startGoalScheduleRuntime();
  createWindow();
  if (updateController && app.isPackaged) {
    void updateController.checkForUpdates();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  if (goalScheduleTimer) {
    clearInterval(goalScheduleTimer);
    goalScheduleTimer = null;
  }
  if (mcpHttpServer) {
    mcpHttpServer.close();
    mcpHttpServer = null;
  }
  if (updateController) {
    updateController.dispose();
    updateController = null;
  }
});

registerStoreIpcHandlers({
  ipcMain,
  store,
  preferencesKey: PREFERENCES_KEY,
  onPreferencesSet: (value) => {
    if (!value?.goalAuditArchiveDirectory) return;
    archiveMcpAuditEntries(store, store.get('omvra.mcp.audit.v1'));
    createGoalLifecycleService({
      store,
      skillsRoot: getBundledSkillsRoot({ isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath }),
      userDataPath: app.getPath('userData'),
    });
  },
});

registerTaskContextIpcHandlers({
  ipcMain,
  store,
  listTaskContextEntries,
  getTaskContextEntry,
  appendTaskContextEntry,
});

registerGoalIpcHandlers({
  ipcMain,
  goalRuntime,
  recordPolicyImpact: (payload) => recordGoalPolicyChangeImpact(store, payload),
  createLifecycle: () => createGoalLifecycleService({
    store,
    skillsRoot: getBundledSkillsRoot({ isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath }),
    userDataPath: app.getPath('userData'),
    onRuntimeChange: goalRuntime.emit,
  }),
  updateGoal: (payload) => updateGoal(store, {
    goalId: payload.goalId,
    title: payload.title,
    elements: payload.elements,
    inputs: payload.inputs,
    capabilities: payload.capabilities,
    projectBindings: payload.projectBindings,
    overseerAgentId: payload.overseerAgentId,
    expectedRevision: payload.expectedRevision,
    idempotencyKey: payload.idempotencyKey,
    actor: 'renderer',
    emitRuntimeChange: goalRuntime.emit,
  }),
  updateGoalArtifacts: (payload) => updateGoalArtifactReferences(store, {
    goalId: payload.goalId,
    elementId: payload.elementId,
    artifactReferences: payload.artifactReferences,
    expectedRevision: payload.expectedRevision,
    actor: 'renderer',
    emitRuntimeChange: goalRuntime.emit,
  }),
  createCommandId: () => `renderer-reset-${randomUUID()}`,
});

registerUpdateIpcHandlers({
  ipcMain,
  app,
  getUpdateController: () => updateController,
  setStoredUpdateChannel,
});

registerDocumentIpcHandlers({ ipcMain, BrowserWindow, dialog, fs, shell });
registerAttachmentIpcHandlers({ ipcMain, app, dialog, fs, path, shell });
registerExternalLinkIpcHandlers({ ipcMain, shell });
registerAgentRuntimeIpcHandlers({
  ipcMain,
  store,
  shell,
  appendAgentRuntimeEvent: (payload) => appendAgentRuntimeEvent(store, payload),
  appendAgentRuntimeOutcome: (payload) => appendAgentRuntimeOutcome(store, payload),
  confirmAgentExecutionStart: (payload) => confirmAgentExecutionStart(store, payload),
  createAgentRuntimeSessionBinding: (payload) => createAgentRuntimeSessionBinding(store, payload),
  evaluateAgentRuntimeGovernance: (payload) => evaluateAgentRuntimeGovernance(store, payload),
  listAgentRuntimeSessions: (payload) => listAgentRuntimeSessions(store, payload),
  prepareAgentExecution: (payload) => prepareAgentExecution(store, payload),
  prepareAgentRuntimeSessionArchive: (bindingId) => prepareAgentRuntimeSessionArchive(store, bindingId),
  updateAgentRuntimeSessionBinding: (payload) => updateAgentRuntimeSessionBinding(store, payload),
  startAgentRuntimeSession: (payload) => agentRuntimeSessionRunner.start(payload),
  startGoalAgentRuntimeSession: (payload) => agentRuntimeSessionRunner.startGoalNode(payload),
  invokeAgentRuntimeSession: (bindingId, method, text) => agentRuntimeSessionRunner.invoke(bindingId, method, text),
  respondAgentRuntimeSession: (bindingId, requestId, result, error) => agentRuntimeSessionRunner.respond(bindingId, requestId, result, error),
  closeAgentRuntimeSession: (bindingId) => agentRuntimeSessionRunner.close(bindingId),
  resumeAgentRuntimeSession: (bindingId, payload) => agentRuntimeSessionRunner.resume(bindingId, payload),
});
registerRuntimeIpcHandlers({
  ipcMain,
  getAppRuntimeInfo: () => ({
    name: app.getName(),
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    electronVersion: process.versions.electron || 'unknown',
    chromeVersion: process.versions.chrome || 'unknown',
    nodeVersion: process.versions.node || 'unknown',
    codeSignature: readCurrentMacCodeSignature(),
  }),
  restartMcpServer,
  isMcpServerRunning: () => Boolean(mcpHttpServer),
  getMcpListenerStatus: () => buildMcpListenerStatus(store, mcpRuntimeState),
});

registerMcpIpcHandlers({
  ipcMain,
  store,
  getListenerStatus: () => mcpRuntimeState,
});
