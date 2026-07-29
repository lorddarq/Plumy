function registerGoalIpcHandlers({
  ipcMain,
  goalRuntime,
  recordPolicyImpact,
  createLifecycle,
  updateGoal,
  updateGoalArtifacts,
  createCommandId,
}) {
  ipcMain.handle('goal-policy/record-impact', (_, payload) => {
    const result = recordPolicyImpact(payload);
    if (result.ok && result.changed) {
      for (const impact of result.impacts || []) {
        goalRuntime.emit({
          scope: 'policy',
          goalId: impact.goalId,
          revision: impact.effectivePolicyRevision,
          actor: payload?.actor || 'workspace-settings',
          changeType: 'policy.impact-recorded',
        });
      }
    }
    return result;
  });

  ipcMain.handle('goals/get-runtime', (_, goalId) => goalRuntime.get(goalId));
  ipcMain.handle('goals/reset-execution', (_, payload = {}) => {
    const goalId = typeof payload.goalId === 'string' ? payload.goalId.trim() : '';
    if (!goalId) return { ok: false, error: 'GOAL_ID_REQUIRED', message: 'goalId is required.' };

    const lifecycle = createLifecycle();
    const current = lifecycle.getExecution(goalId);
    if (!current) return { ok: true, reset: true, alreadyReset: true, execution: null };
    const resetResult = lifecycle.execute({
      command: 'reset',
      goalId,
      expectedRevision: current.revision,
      commandId: createCommandId(),
      actor: 'human',
      payload: { humanConfirmed: true, reason: 'user-requested-reset' },
    });
    return resetResult.ok ? { ...resetResult, reset: true } : resetResult;
  });
  ipcMain.handle('goals/update', (_, payload = {}) => updateGoal(payload));
  ipcMain.handle('goals/update-artifacts', (_, payload = {}) => updateGoalArtifacts(payload));
}

module.exports = { registerGoalIpcHandlers };
