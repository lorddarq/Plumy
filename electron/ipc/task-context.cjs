function registerTaskContextIpcHandlers({
  ipcMain,
  store,
  listTaskContextEntries,
  getTaskContextEntry,
  appendTaskContextEntry,
}) {
  ipcMain.handle('task-context/list', (_event, options = {}) => listTaskContextEntries(store, options));
  ipcMain.handle('task-context/get', (_event, options = {}) => getTaskContextEntry(store, options));
  ipcMain.handle('task-context/append-checkpoint', (_event, options = {}) => {
    const taskId = typeof options.taskId === 'string' ? options.taskId.trim() : '';
    const summary = typeof options.summary === 'string' ? options.summary.trim() : '';
    if (!taskId) return { ok: false, error: 'TASK_ID_REQUIRED', message: 'taskId is required.' };
    if (!summary) return { ok: false, error: 'TASK_CONTEXT_SUMMARY_REQUIRED', message: 'summary is required.' };
    const revision = Number(options.expectedRevision);
    return appendTaskContextEntry(store, {
      taskId,
      expectedRevision: revision,
      idempotencyKey: typeof options.idempotencyKey === 'string' && options.idempotencyKey.trim()
        ? options.idempotencyKey.trim()
        : `human-checkpoint:${taskId}:${revision}:${Date.now()}`,
      kind: 'context-checkpoint',
      fromRevision: revision,
      toRevision: revision,
      summary,
      markers: ['decision', 'manual-checkpoint'],
      provenance: 'human-authored',
      actor: 'workspace-user',
      sourceRefs: [{ type: 'task-change', id: `${taskId}@${revision}` }],
    });
  });
}

module.exports = { registerTaskContextIpcHandlers };
