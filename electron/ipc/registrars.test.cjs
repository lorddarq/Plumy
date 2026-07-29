const test = require('node:test');
const assert = require('node:assert/strict');

const { registerStoreIpcHandlers } = require('./store.cjs');
const { registerGoalIpcHandlers } = require('./goals.cjs');
const { registerDocumentIpcHandlers, sanitizePdfFileName } = require('./documents.cjs');
const { registerAttachmentIpcHandlers } = require('./attachments.cjs');
const { registerExternalLinkIpcHandlers } = require('./external-links.cjs');
const { registerRuntimeIpcHandlers } = require('./runtime.cjs');
const { registerAgentRuntimeIpcHandlers } = require('./agent-runtime.cjs');

function createIpcHarness() {
  const handlers = new Map();
  return {
    handlers,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
  };
}

test('store registrar preserves channels and reports preference writes after persistence', () => {
  const { handlers, ipcMain } = createIpcHarness();
  const values = new Map();
  let persistedValue;
  const store = {
    get: key => values.get(key),
    set: (key, value) => { values.set(key, value); return value; },
    delete: key => values.delete(key),
    get store() { return Object.fromEntries(values); },
  };
  registerStoreIpcHandlers({
    ipcMain,
    store,
    preferencesKey: 'preferences',
    onPreferencesSet: value => { persistedValue = value; },
  });

  const value = { updateChannel: 'rc' };
  assert.equal(handlers.get('store/set')(null, 'preferences', value), value);
  assert.equal(store.get('preferences'), value);
  assert.equal(persistedValue, value);
  assert.deepEqual([...handlers.keys()].sort(), ['store/delete', 'store/export', 'store/get', 'store/set']);
});

test('Goal registrar rejects missing reset ids before creating a lifecycle service', () => {
  const { handlers, ipcMain } = createIpcHarness();
  let lifecycleCreated = false;
  registerGoalIpcHandlers({
    ipcMain,
    goalRuntime: { get: () => null, emit: () => {} },
    recordPolicyImpact: () => ({ ok: true, changed: false }),
    createLifecycle: () => { lifecycleCreated = true; return {}; },
    updateGoal: () => ({}),
    updateGoalArtifacts: () => ({}),
    createCommandId: () => 'command-1',
  });

  assert.deepEqual(handlers.get('goals/reset-execution')(null, {}), {
    ok: false,
    error: 'GOAL_ID_REQUIRED',
    message: 'goalId is required.',
  });
  assert.equal(lifecycleCreated, false);
});

test('document and attachment registrars keep invalid inputs fail-safe', async () => {
  const { handlers, ipcMain } = createIpcHarness();
  const BrowserWindow = { fromWebContents: () => null };
  const dialog = { showSaveDialog: async () => ({ canceled: true }), showOpenDialog: async () => ({ canceled: true, filePaths: [] }) };
  const fs = { promises: { stat: async () => { throw new Error('not found'); } } };
  const shell = { showItemInFolder: () => {} };
  registerDocumentIpcHandlers({ ipcMain, BrowserWindow, dialog, fs, shell });
  registerAttachmentIpcHandlers({ ipcMain, app: { getPath: () => '/tmp' }, dialog, fs, path: require('node:path'), shell });

  assert.equal(sanitizePdfFileName('unsafe/name'), 'unsafe-name.pdf');
  assert.deepEqual(await handlers.get('tasks/export-pdf')({}, {}), { success: false, error: 'PDF content is missing.' });
  assert.deepEqual(await handlers.get('agent-configurations/export')({}, {}), { success: false, error: 'Agent configuration data is missing.' });
  assert.deepEqual(await handlers.get('attachments/reveal')(null, ''), { success: false, error: 'Attachment path is required' });
});

test('external-link and runtime registrars preserve denial behavior', async () => {
  const { handlers, ipcMain } = createIpcHarness();
  let opened = false;
  registerExternalLinkIpcHandlers({ ipcMain, shell: { openExternal: async () => { opened = true; } } });
  registerRuntimeIpcHandlers({
    ipcMain,
    getAppRuntimeInfo: () => ({ name: 'Omvra' }),
    restartMcpServer: () => {},
    isMcpServerRunning: () => false,
    getMcpListenerStatus: () => ({}),
  });

  assert.deepEqual(await handlers.get('open-external')(null, 'file:///tmp/private'), { success: false, error: 'Invalid protocol' });
  assert.equal(opened, false);
  assert.equal(handlers.get('mcp/restart-server')().success, false);
  assert.deepEqual(handlers.get('app/get-runtime-info')(), { name: 'Omvra' });
});

test('agent runtime registrar validates writes and keeps custom schemes behind its dedicated boundary', async () => {
  const { handlers, ipcMain } = createIpcHarness();
  const values = new Map();
  const store = { get: key => values.get(key), set: (key, value) => values.set(key, value) };
  let opened;
  registerAgentRuntimeIpcHandlers({ ipcMain, store, shell: { openExternal: async url => { opened = url; } } });

  const saved = handlers.get('agent-runtime/save-profile')(null, {
    id: 'external', name: 'Codex', integrationMode: 'external-handoff', externalUrlScheme: 'codex', enabled: true,
  });
  assert.equal(saved.ok, true);
  assert.deepEqual(handlers.get('agent-runtime/save-defaults')(null, { globalProfileId: 'external', projectProfileIds: {} }).value.globalProfileId, 'external');
  const handoff = await handlers.get('agent-runtime/open-external')(null, {
    workspacePath: '/tmp/workspace', taskId: 'task-1', contextReference: 'omvra://task/task-1', prompt: 'Continue task',
  });
  assert.equal(handoff.ok, true);
  assert.equal(new URL(opened).protocol, 'codex:');
  assert.equal(handlers.has('agent-runtime/test-connection'), true);
});
