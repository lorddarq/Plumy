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
  evaluateAgentRuntimeGovernance,
  listAgentRuntimeSessions,
  prepareAgentExecution,
  recoverOrphanedTaskExecution = null,
  prepareAgentRuntimeSessionArchive,
  updateAgentRuntimeSessionBinding,
  startAgentRuntimeSession,
  startGoalAgentRuntimeSession,
  invokeAgentRuntimeSession,
  respondAgentRuntimeSession,
  listAgentRuntimeSessionRequests,
  closeAgentRuntimeSession,
  continueAgentRuntimeTaskSession,
  resumeAgentRuntimeSession,
  resolveManagedWorkspace,
  logger = null,
}) {
  const log = (level, event, details = {}) => logger?.[level]?.(`[agent-runtime:ipc] ${event}`, details);
  const logged = async (operation, details, action) => {
    log('info', `${operation}.requested`, details);
    try {
      const result = await action();
      const failed = result?.ok === false || result?.canStart === false || Boolean(result?.blockers?.length);
      log(failed ? 'warn' : 'info', `${operation}.${failed ? 'rejected' : 'completed'}`, {
        ...details,
        error: result?.error || null,
        blockerCount: result?.blockers?.length || 0,
        bindingId: result?.binding?.id || result?.bindingId || null,
      });
      return result;
    } catch (error) {
      log('error', `${operation}.failed`, { ...details, code: error?.code || null, message: error?.message || String(error), stack: error?.stack || null });
      throw error;
    }
  };
  ipcMain.handle('agent-runtime/get-state', () => resultOf(() => getState(store)));
  ipcMain.handle('agent-runtime/save-profile', (_, profile) => resultOf(() => saveProfile(store, profile)));
  ipcMain.handle('agent-runtime/delete-profile', (_, profileId) => resultOf(() => deleteProfile(store, profileId)));
  ipcMain.handle('agent-runtime/save-defaults', (_, defaults) => resultOf(() => saveDefaults(store, defaults)));
  ipcMain.handle('agent-runtime/resolve', (_, payload) => resultOf(() => resolveProfile(store, payload)));
  ipcMain.handle('agent-runtime/resolve-managed-workspace', (_, taskId) => resultOf(() => resolveManagedWorkspace(taskId)));
  ipcMain.handle('agent-runtime/prepare-execution', async (_, payload = {}) => {
    return logged('prepare-execution', { taskId: payload.taskId || null }, async () => {
      recoverOrphanedTaskExecution?.(payload);
      const prepared = prepareAgentExecution({ ...payload, deferConnection: true });
      if (prepared.blockers?.length) return prepared;
      const connection = await testConnection(store, payload);
      const result = prepareAgentExecution(payload);
      return { ...result, connection };
    });
  });
  ipcMain.handle('agent-runtime/confirm-start', async (_, payload = {}) => {
    return logged('confirm-start', { taskId: payload.taskId || null, confirmed: payload.confirmed === true }, async () => {
      recoverOrphanedTaskExecution?.(payload);
      if (payload.confirmed !== true) return confirmAgentExecutionStart(payload);
      const prepared = prepareAgentExecution({ ...payload, deferConnection: true });
      if (prepared.blockers?.length) return prepared;
      const connection = await testConnection(store, payload);
      if (!connection.ok) return { ...prepareAgentExecution(payload), connection };
      return { ...confirmAgentExecutionStart(payload), connection };
    });
  });
  ipcMain.handle('agent-runtime/sessions/list', (_, payload) => listAgentRuntimeSessions(payload));
  ipcMain.handle('agent-runtime/sessions/requests', (_, bindingId) => listAgentRuntimeSessionRequests(bindingId));
  ipcMain.handle('agent-runtime/sessions/create-binding', (_, payload) => createAgentRuntimeSessionBinding(payload));
  ipcMain.handle('agent-runtime/sessions/update-binding', (_, payload) => updateAgentRuntimeSessionBinding(payload));
  ipcMain.handle('agent-runtime/sessions/append-event', (_, payload) => appendAgentRuntimeEvent(payload));
  ipcMain.handle('agent-runtime/sessions/evaluate-governance', (_, payload) => evaluateAgentRuntimeGovernance(payload));
  ipcMain.handle('agent-runtime/sessions/append-outcome', (_, payload) => appendAgentRuntimeOutcome(payload));
  ipcMain.handle('agent-runtime/sessions/prepare-archive', (_, bindingId) => prepareAgentRuntimeSessionArchive(bindingId));
  ipcMain.handle('agent-runtime/sessions/start', async (_, payload = {}) => logged('session-start', { taskId: payload.taskId || null }, () => startAgentRuntimeSession(payload)));
  ipcMain.handle('agent-runtime/sessions/start-goal-node', async (_, payload) => startGoalAgentRuntimeSession(payload));
  ipcMain.handle('agent-runtime/sessions/prompt', async (_, payload) => invokeAgentRuntimeSession(payload.bindingId, 'prompt', payload.text));
  ipcMain.handle('agent-runtime/sessions/steer', async (_, payload) => invokeAgentRuntimeSession(payload.bindingId, 'steer', payload.text));
  ipcMain.handle('agent-runtime/sessions/cancel', async (_, payload) => invokeAgentRuntimeSession(payload.bindingId, 'cancel'));
  ipcMain.handle('agent-runtime/sessions/respond', async (_, payload) => respondAgentRuntimeSession(payload.bindingId, payload.requestId, payload.result, payload.error));
  ipcMain.handle('agent-runtime/sessions/close', async (_, bindingId) => closeAgentRuntimeSession(bindingId));
  ipcMain.handle('agent-runtime/sessions/continue-task', async (_, bindingId) => logged('session-continue-task', { bindingId: bindingId || null }, () => continueAgentRuntimeTaskSession(bindingId)));
  ipcMain.handle('agent-runtime/sessions/resume', async (_, payload = {}) => logged('session-resume', { bindingId: payload.bindingId || null }, () => resumeAgentRuntimeSession(payload.bindingId, payload)));
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
