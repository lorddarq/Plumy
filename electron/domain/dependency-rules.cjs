function createDependencyRules({ listTasks, normalizeTaskIdList }) {
  if (typeof listTasks !== 'function' || typeof normalizeTaskIdList !== 'function') {
    throw new TypeError('createDependencyRules requires listTasks and normalizeTaskIdList.');
  }

  function validateTaskReferences(store, taskIds, { fieldName = 'taskIds', excludeTaskId } = {}) {
    const normalizedTaskIds = normalizeTaskIdList(taskIds);
    const existingTaskIds = new Set(listTasks(store).map(task => task && task.id).filter(Boolean));

    for (const taskId of normalizedTaskIds) {
      if (excludeTaskId && taskId === excludeTaskId) {
        return {
          ok: false,
          error: 'INVALID_TASK_REFERENCE',
          message: `${fieldName} cannot include the task itself.`,
        };
      }
      if (!existingTaskIds.has(taskId)) {
        return {
          ok: false,
          error: 'TASK_REFERENCE_NOT_FOUND',
          message: `${fieldName} contains unknown task "${taskId}".`,
        };
      }
    }

    return { ok: true, taskIds: normalizedTaskIds };
  }

  function normalizeRoadmapDependencyUpdates(value) {
    if (!Array.isArray(value)) return [];
    const updatesByTaskId = new Map();

    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const taskId = typeof (item.taskId || item.id) === 'string' ? (item.taskId || item.id).trim() : '';
      if (!taskId) continue;
      updatesByTaskId.set(taskId, {
        taskId,
        dependencyIds: normalizeTaskIdList(item.dependencyIds),
      });
    }

    return Array.from(updatesByTaskId.values());
  }

  function validateDependencyCycles(store, updatesOrOptions = [], maybeOptions = {}) {
    const updates = Array.isArray(updatesOrOptions) ? updatesOrOptions : [];
    const {
      taskId,
      dependencyIds,
      fieldName = 'dependencyIds',
    } = Array.isArray(updatesOrOptions) ? maybeOptions : (updatesOrOptions || {});
    const dependencyMap = new Map(listTasks(store).map(task => [
      task.id,
      normalizeTaskIdList(task.dependencyIds),
    ]));

    for (const update of updates) {
      dependencyMap.set(update.taskId, normalizeTaskIdList(update.dependencyIds));
    }
    if (taskId) {
      dependencyMap.set(taskId, normalizeTaskIdList(dependencyIds));
    }

    const createsCycle = (rootTaskId, nextDependencyId) => {
      if (rootTaskId === nextDependencyId) return true;

      const visited = new Set();
      const visit = (currentTaskId) => {
        if (currentTaskId === rootTaskId) return true;
        if (visited.has(currentTaskId)) return false;
        visited.add(currentTaskId);
        return (dependencyMap.get(currentTaskId) || []).some(visit);
      };

      return visit(nextDependencyId);
    };

    for (const [candidateTaskId, candidateDependencyIds] of dependencyMap.entries()) {
      for (const candidateDependencyId of candidateDependencyIds) {
        if (createsCycle(candidateTaskId, candidateDependencyId)) {
          return {
            ok: false,
            error: 'DEPENDENCY_CYCLE',
            message: `${fieldName} creates a dependency cycle for task "${candidateTaskId}".`,
          };
        }
      }
    }

    return { ok: true };
  }

  function validateRoadmapDependencyUpdates(store, updates) {
    const normalizedUpdates = normalizeRoadmapDependencyUpdates(updates);
    const updateTaskValidation = validateTaskReferences(
      store,
      normalizedUpdates.map(update => update.taskId),
      { fieldName: 'dependencyUpdates.taskId' }
    );
    if (!updateTaskValidation.ok) return updateTaskValidation;

    for (const update of normalizedUpdates) {
      const dependencyValidation = validateTaskReferences(store, update.dependencyIds, {
        fieldName: `dependencyUpdates[${update.taskId}].dependencyIds`,
        excludeTaskId: update.taskId,
      });
      if (!dependencyValidation.ok) return dependencyValidation;
      update.dependencyIds = dependencyValidation.taskIds;
    }

    const cycleValidation = validateDependencyCycles(store, normalizedUpdates);
    if (!cycleValidation.ok) return cycleValidation;

    return { ok: true, updates: normalizedUpdates };
  }

  return {
    validateTaskReferences,
    validateDependencyCycles,
    validateRoadmapDependencyUpdates,
  };
}

module.exports = {
  createDependencyRules,
};
