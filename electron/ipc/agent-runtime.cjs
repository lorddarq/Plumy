const {
  deleteProfile,
  getState,
  resolveProfile,
  saveDefaults,
  saveProfile,
} = require('../domain/agent-runtime-profile-service.cjs');
const { openExternalHandoff, testConnection } = require('../services/agent-runtime-service.cjs');

function resultOf(action) {
  try {
    return { ok: true, value: action() };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function registerAgentRuntimeIpcHandlers({
  ipcMain,
  store,
  shell,
  appendAgentRuntimeEvent,
  appendAgentRuntimeOutcome,
  confirmAgentExecutionStart,
  createAgentRuntimeSessionBinding,
  listAgentRuntimeSessions,
  prepareAgentExecution,
  prepareAgentRuntimeSessionArchive,
  updateAgentRuntimeSessionBinding,
}) {
  ipcMain.handle('agent-runtime/get-state', () => resultOf(() => getState(store)));
  ipcMain.handle('agent-runtime/save-profile', (_, profile) => resultOf(() => saveProfile(store, profile)));
  ipcMain.handle('agent-runtime/delete-profile', (_, profileId) => resultOf(() => deleteProfile(store, profileId)));
  ipcMain.handle('agent-runtime/save-defaults', (_, defaults) => resultOf(() => saveDefaults(store, defaults)));
  ipcMain.handle('agent-runtime/resolve', (_, payload) => resultOf(() => resolveProfile(store, payload)));
  ipcMain.handle('agent-runtime/prepare-execution', async (_, payload = {}) => {
    const prepared = prepareAgentExecution({ ...payload, deferConnection: true });
    if (prepared.blockers?.length) return prepared;
    const connection = await testConnection(store, payload);
    const result = prepareAgentExecution(payload);
    return { ...result, connection };
  });
  ipcMain.handle('agent-runtime/confirm-start', async (_, payload = {}) => {
    if (payload.confirmed !== true) return confirmAgentExecutionStart(payload);
    const prepared = prepareAgentExecution({ ...payload, deferConnection: true });
    if (prepared.blockers?.length) return prepared;
    const connection = await testConnection(store, payload);
    if (!connection.ok) return { ...prepareAgentExecution(payload), connection };
    return { ...confirmAgentExecutionStart(payload), connection };
  });
  ipcMain.handle('agent-runtime/sessions/list', (_, payload) => listAgentRuntimeSessions(payload));
  ipcMain.handle('agent-runtime/sessions/create-binding', (_, payload) => createAgentRuntimeSessionBinding(payload));
  ipcMain.handle('agent-runtime/sessions/update-binding', (_, payload) => updateAgentRuntimeSessionBinding(payload));
  ipcMain.handle('agent-runtime/sessions/append-event', (_, payload) => appendAgentRuntimeEvent(payload));
  ipcMain.handle('agent-runtime/sessions/append-outcome', (_, payload) => appendAgentRuntimeOutcome(payload));
  ipcMain.handle('agent-runtime/sessions/prepare-archive', (_, bindingId) => prepareAgentRuntimeSessionArchive(bindingId));
  ipcMain.handle('agent-runtime/test-connection', async (_, payload) => {
    try {
      return await testConnection(store, payload);
    } catch (error) {
      return { ok: false, state: 'unavailable', error: error?.message || String(error) };
    }
  });
  ipcMain.handle('agent-runtime/open-external', async (_, payload) => {
    try {
      return await openExternalHandoff(store, payload, { shell });
    } catch (error) {
      return { ok: false, state: 'unavailable', error: error?.message || String(error) };
    }
  });
}

module.exports = { registerAgentRuntimeIpcHandlers };
