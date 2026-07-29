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
const STORE_DID_CHANGE_CHANNEL = 'store/did-change';
const UPDATE_STATE_CHANNEL = 'updates/state-changed';
const GOAL_RUNTIME_CHANGED_CHANNEL = 'goals/runtime-changed';
const PREFERENCES_KEY = 'omvra.preferences.v1';
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

function sanitizePdfFileName(value) {
  const baseName = typeof value === 'string' && value.trim() ? value.trim() : 'task-details.pdf';
  const safeName = baseName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120);

  return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
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

async function exportHtmlToPdf(event, { html, defaultFileName } = {}) {
  if (typeof html !== 'string' || !html.trim()) {
    return { success: false, error: 'PDF content is missing.' };
  }

  const sourceWindow = BrowserWindow.fromWebContents(event.sender);
  const saveDialogOptions = {
    title: 'Export task as PDF',
    defaultPath: sanitizePdfFileName(defaultFileName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  };
  const saveResult = sourceWindow
    ? await dialog.showSaveDialog(sourceWindow, saveDialogOptions)
    : await dialog.showSaveDialog(saveDialogOptions);

  if (saveResult.canceled || !saveResult.filePath) {
    return { success: false, canceled: true };
  }

  let exportWindow;

  try {
    exportWindow = new BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    await exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdfBuffer = await exportWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        marginType: 'custom',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
    });

    await fs.promises.writeFile(saveResult.filePath, pdfBuffer);
    shell.showItemInFolder(saveResult.filePath);
    return { success: true, filePath: saveResult.filePath };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  } finally {
    if (exportWindow && !exportWindow.isDestroyed()) {
      exportWindow.destroy();
    }
  }
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
  store.onDidAnyChange(() => {
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

// =====================
// IPC: Store
// =====================
ipcMain.handle('store/get', (_, key) => store.get(key));
ipcMain.handle('store/set', (_, key, value) => {
  const result = store.set(key, value);
  if (key === PREFERENCES_KEY && value?.goalAuditArchiveDirectory) {
    archiveMcpAuditEntries(store, store.get('omvra.mcp.audit.v1'));
    createGoalLifecycleService({
      store,
      skillsRoot: getBundledSkillsRoot({ isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath }),
      userDataPath: app.getPath('userData'),
    });
  }
  return result;
});
ipcMain.handle('store/delete', (_, key) => store.delete(key));
ipcMain.handle('store/export', () => store.store);
ipcMain.handle('goal-policy/record-impact', (_, payload) => {
  const result = recordGoalPolicyChangeImpact(store, payload);
  if (result.ok && result.changed) {
    for (const impact of result.impacts || []) goalRuntime.emit({ scope: 'policy', goalId: impact.goalId, revision: impact.effectivePolicyRevision, actor: payload?.actor || 'workspace-settings', changeType: 'policy.impact-recorded' });
  }
  return result;
});
ipcMain.handle('goals/get-runtime', (_, goalId) => goalRuntime.get(goalId));
ipcMain.handle('goals/reset-execution', (_, payload = {}) => {
  const goalId = typeof payload.goalId === 'string' ? payload.goalId.trim() : '';
  if (!goalId) return { ok: false, error: 'GOAL_ID_REQUIRED', message: 'goalId is required.' };

  const lifecycle = createGoalLifecycleService({
    store,
    skillsRoot: getBundledSkillsRoot({ isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath }),
    userDataPath: app.getPath('userData'),
    onRuntimeChange: goalRuntime.emit,
  });
  const current = lifecycle.getExecution(goalId);
  if (!current) return { ok: true, reset: true, alreadyReset: true, execution: null };
  const resetResult = lifecycle.execute({
    command: 'reset',
    goalId,
    expectedRevision: current.revision,
    commandId: `renderer-reset-${randomUUID()}`,
    actor: 'human',
    payload: { humanConfirmed: true, reason: 'user-requested-reset' },
  });
  if (!resetResult.ok) return resetResult;
  return { ...resetResult, reset: true };
});
ipcMain.handle('goals/update', (_, payload = {}) => updateGoal(store, {
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
}));
ipcMain.handle('goals/update-artifacts', (_, payload = {}) => updateGoalArtifactReferences(store, {
  goalId: payload.goalId,
  elementId: payload.elementId,
  artifactReferences: payload.artifactReferences,
  expectedRevision: payload.expectedRevision,
  actor: 'renderer',
  emitRuntimeChange: goalRuntime.emit,
}));
ipcMain.handle('app/get-runtime-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  isPackaged: app.isPackaged,
  electronVersion: process.versions.electron || 'unknown',
  chromeVersion: process.versions.chrome || 'unknown',
  nodeVersion: process.versions.node || 'unknown',
  codeSignature: readCurrentMacCodeSignature(),
}));
registerUpdateIpcHandlers({
  ipcMain,
  app,
  getUpdateController: () => updateController,
  setStoredUpdateChannel,
});
ipcMain.handle('tasks/export-pdf', exportHtmlToPdf);
ipcMain.handle('agent-configurations/export', async (event, { json, defaultFileName = 'omvra-agent-configurations.json' } = {}) => {
  if (typeof json !== 'string' || !json.trim()) {
    return { success: false, error: 'Agent configuration data is missing.' };
  }

  const sourceWindow = BrowserWindow.fromWebContents(event.sender);
  const saveDialogOptions = {
    title: 'Export agents',
    defaultPath: defaultFileName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  };
  const saveResult = sourceWindow
    ? await dialog.showSaveDialog(sourceWindow, saveDialogOptions)
    : await dialog.showSaveDialog(saveDialogOptions);

  if (saveResult.canceled || !saveResult.filePath) {
    return { success: false, canceled: true };
  }

  try {
    await fs.promises.writeFile(saveResult.filePath, json, 'utf8');
    shell.showItemInFolder(saveResult.filePath);
    return { success: true, filePath: saveResult.filePath };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});
ipcMain.handle('mcp/restart-server', () => {
  try {
    restartMcpServer();
    if (!mcpHttpServer) {
      return {
        success: false,
        error: 'MCP server is disabled. Enable mcpAgentAccessEnabled or set OMVRA_ENABLE_MCP_SERVER=1.',
      };
    }
    return {
      success: true,
      listenerStatus: buildMcpListenerStatus(store, mcpRuntimeState),
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message || String(err),
    };
  }
});

// =====================
// IPC: Attachments
// =====================
ipcMain.handle('goal-audit/pick-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle('skills/pick-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle('attachments/pick', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('attachments/verify', async (_, filePath) => {
  try {
    const stats = await fs.promises.stat(filePath);
    return { exists: true, size: stats.size, mtime: stats.mtimeMs, readable: true };
  } catch (err) {
    return { exists: false, error: err.message };
  }
});

ipcMain.handle('attachments/embed', async (_, filePath) => {
  try {
    const attachmentsDir = path.join(app.getPath('userData'), 'attachments');
    await fs.promises.mkdir(attachmentsDir, { recursive: true });
    const base = path.basename(filePath);
    const dest = path.join(attachmentsDir, `${Date.now()}-${base}`);
    await fs.promises.copyFile(filePath, dest);
    return { success: true, path: dest };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('attachments/reveal', async (_, filePath) => {
  try {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Attachment path is required');
    }

    await fs.promises.stat(filePath);
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// =====================
// IPC: Open external URLs (validate protocol)
// =====================
ipcMain.handle('open-external', async (_, urlStr) => {
  try {
    const url = new URL(urlStr);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error('Invalid protocol');
    await shell.openExternal(urlStr);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// =====================
// IPC: MCP bridge (read-only, gated)
// =====================
registerMcpIpcHandlers({
  ipcMain,
  store,
  getListenerStatus: () => mcpRuntimeState,
});
