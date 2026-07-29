const { randomUUID } = require('crypto');

function createMilestoneService({
  dependencyRules,
  hasOwn,
  normalizeOptionalDate,
  normalizePatchDate,
  normalizeString,
  normalizeTask,
  normalizeTaskIdList,
  readMilestones,
  readTasks,
  resolveProjectReferences,
  revisionField,
  writeMilestones,
  writeTasks,
}) {
  const requiredFunctions = {
    hasOwn,
    normalizeOptionalDate,
    normalizePatchDate,
    normalizeString,
    normalizeTask,
    normalizeTaskIdList,
    readMilestones,
    readTasks,
    resolveProjectReferences,
    writeMilestones,
    writeTasks,
  };
  for (const [name, value] of Object.entries(requiredFunctions)) {
    if (typeof value !== 'function') throw new TypeError(`createMilestoneService requires ${name}.`);
  }
  if (!dependencyRules || typeof dependencyRules.validateTaskReferences !== 'function'
    || typeof dependencyRules.validateRoadmapDependencyUpdates !== 'function') {
    throw new TypeError('createMilestoneService requires dependencyRules.');
  }
  if (typeof revisionField !== 'string' || !revisionField) {
    throw new TypeError('createMilestoneService requires revisionField.');
  }

  const { validateRoadmapDependencyUpdates, validateTaskReferences } = dependencyRules;

  function normalizeMilestone(milestone) {
    if (!milestone || typeof milestone !== 'object') return null;
    const title = normalizeString(milestone.title).trim();
    const endDate = normalizeString(milestone.endDate).trim();
    if (!title || !endDate) return null;
    const revision = Number.isFinite(Number(milestone[revisionField]))
      ? Math.max(0, Math.floor(Number(milestone[revisionField])))
      : 0;
    const projectIds = normalizeTaskIdList(
      Array.isArray(milestone.projectIds)
        ? milestone.projectIds
        : (milestone.projectId ? [milestone.projectId] : [])
    );
    return {
      ...milestone,
      id: normalizeString(milestone.id).trim() || `milestone-${randomUUID()}`,
      title,
      projectIds,
      projectId: projectIds[0],
      startDate: normalizeString(milestone.startDate).trim() || undefined,
      endDate,
      notes: normalizeString(milestone.notes),
      color: normalizeString(milestone.color).trim() || undefined,
      linkedTaskIds: normalizeTaskIdList(milestone.linkedTaskIds),
      [revisionField]: revision,
    };
  }

  function listMilestones(store) {
    return readMilestones(store).map(normalizeMilestone).filter(Boolean);
  }

  function getMilestoneById(store, milestoneId) {
    const normalizedMilestoneId = normalizeString(milestoneId).trim();
    if (!normalizedMilestoneId) return null;
    return listMilestones(store).find(milestone => milestone.id === normalizedMilestoneId) || null;
  }

  function resolveMilestoneReference(store, milestoneId) {
    const normalizedMilestoneId = normalizeString(milestoneId).trim();
    if (!normalizedMilestoneId) return { ok: true, milestoneId: undefined };
    const milestone = getMilestoneById(store, normalizedMilestoneId);
    if (!milestone) {
      return {
        ok: false,
        error: 'MILESTONE_NOT_FOUND',
        message: `Milestone "${normalizedMilestoneId}" not found.`,
      };
    }
    return { ok: true, milestoneId: milestone.id, milestone };
  }

  function createMilestone(store, options = {}) {
    const {
      title,
      projectId,
      projectIds,
      startDate,
      endDate,
      notes,
      description,
      color,
      linkedTaskIds,
      actor = 'agent',
    } = options;
    const normalizedTitle = normalizeString(title).trim();
    if (!normalizedTitle) {
      return { ok: false, error: 'INVALID_TITLE', message: 'title is required.' };
    }

    const normalizedEndDate = normalizeOptionalDate(endDate);
    if (!normalizedEndDate) {
      return { ok: false, error: 'INVALID_DATE', message: 'endDate is required and must use YYYY-MM-DD format.' };
    }

    const normalizedStartDate = normalizeOptionalDate(startDate);
    if (normalizedStartDate && normalizedEndDate < normalizedStartDate) {
      return { ok: false, error: 'INVALID_DATE_RANGE', message: 'endDate cannot be earlier than startDate.' };
    }

    const projectResolution = resolveProjectReferences(
      store,
      Array.isArray(projectIds)
        ? projectIds.concat(projectId ? [projectId] : [])
        : (projectId ? [projectId] : [])
    );
    if (!projectResolution.ok) return projectResolution;
    if (projectResolution.projects.length === 0) {
      return { ok: false, error: 'PROJECT_REQUIRED', message: 'At least one project id or project name is required.' };
    }

    const taskValidation = validateTaskReferences(store, linkedTaskIds, { fieldName: 'linkedTaskIds' });
    if (!taskValidation.ok) return taskValidation;

    const milestone = {
      id: `milestone-${randomUUID()}`,
      title: normalizedTitle,
      projectIds: projectResolution.projects.map(project => project.id),
      projectId: projectResolution.projects[0].id,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      notes: typeof notes === 'string' ? notes : (typeof description === 'string' ? description : undefined),
      color: normalizeString(color).trim() || projectResolution.projects[0].color,
      linkedTaskIds: taskValidation.taskIds,
      [revisionField]: 0,
      mcpUpdatedAt: new Date().toISOString(),
      mcpLastActor: actor,
    };

    writeMilestones(store, readMilestones(store).concat(milestone));

    if (taskValidation.taskIds.length > 0) {
      const linkedTaskIdSet = new Set(taskValidation.taskIds);
      const nextTasks = readTasks(store).map(rawTask => {
        if (!rawTask || !linkedTaskIdSet.has(rawTask.id)) return rawTask;
        const task = normalizeTask(rawTask);
        return {
          ...task,
          milestoneId: milestone.id,
          [revisionField]: (task[revisionField] || 0) + 1,
          mcpUpdatedAt: new Date().toISOString(),
          mcpLastActor: actor,
        };
      });
      writeTasks(store, nextTasks);
    }

    return {
      ok: true,
      milestone: normalizeMilestone(milestone),
      linkedTaskIds: taskValidation.taskIds,
    };
  }

  function syncMilestoneTaskLinks(store, milestoneId, previousLinkedTaskIds, nextLinkedTaskIds, actor) {
    const previousLinked = new Set(normalizeTaskIdList(previousLinkedTaskIds));
    const nextLinked = new Set(normalizeTaskIdList(nextLinkedTaskIds));
    let changed = false;

    const nextTasks = readTasks(store).map(rawTask => {
      if (!rawTask || typeof rawTask !== 'object') return rawTask;
      const task = normalizeTask(rawTask);
      const wasLinked = previousLinked.has(task.id) || task.milestoneId === milestoneId;
      const shouldBeLinked = nextLinked.has(task.id);

      if (shouldBeLinked && task.milestoneId !== milestoneId) {
        changed = true;
        return {
          ...task,
          milestoneId,
          [revisionField]: (task[revisionField] || 0) + 1,
          mcpUpdatedAt: new Date().toISOString(),
          mcpLastActor: actor,
        };
      }

      if (wasLinked && !shouldBeLinked && task.milestoneId === milestoneId) {
        changed = true;
        return {
          ...task,
          milestoneId: undefined,
          [revisionField]: (task[revisionField] || 0) + 1,
          mcpUpdatedAt: new Date().toISOString(),
          mcpLastActor: actor,
        };
      }

      return rawTask;
    });

    if (changed) writeTasks(store, nextTasks);
  }

  function updateMilestone(store, options = {}) {
    const {
      milestoneId,
      title,
      projectId,
      projectIds,
      startDate,
      endDate,
      notes,
      description,
      color,
      linkedTaskIds,
      expectedRevision,
      actor = 'agent',
    } = options;
    const normalizedMilestoneId = normalizeString(milestoneId).trim();
    if (!normalizedMilestoneId) {
      return { ok: false, error: 'MILESTONE_ID_REQUIRED', message: 'milestoneId is required.' };
    }

    const milestones = readMilestones(store);
    const milestoneIndex = milestones.findIndex(milestone => milestone && milestone.id === normalizedMilestoneId);
    if (milestoneIndex < 0) {
      return { ok: false, error: 'MILESTONE_NOT_FOUND', message: `Milestone "${normalizedMilestoneId}" not found.` };
    }

    const currentMilestone = normalizeMilestone(milestones[milestoneIndex]);
    const currentRevision = currentMilestone[revisionField] || 0;
    if (!Number.isFinite(Number(expectedRevision))) {
      return {
        ok: false,
        error: 'EXPECTED_REVISION_REQUIRED',
        message: 'expectedRevision is required and must be a finite number.',
        currentRevision,
      };
    }

    const expected = Math.max(0, Math.floor(Number(expectedRevision)));
    if (expected !== currentRevision) {
      return {
        ok: false,
        error: 'REVISION_MISMATCH',
        message: 'Milestone revision mismatch.',
        currentRevision,
        expectedRevision: expected,
      };
    }

    if (hasOwn(options, 'title') && !normalizeString(title).trim()) {
      return { ok: false, error: 'INVALID_TITLE', message: 'title cannot be empty.' };
    }

    const startDatePatch = hasOwn(options, 'startDate') ? normalizePatchDate(startDate, 'startDate') : null;
    if (startDatePatch && !startDatePatch.ok) return startDatePatch;
    const endDatePatch = hasOwn(options, 'endDate') ? normalizePatchDate(endDate, 'endDate') : null;
    if (endDatePatch && !endDatePatch.ok) return endDatePatch;

    const hasProjectPatch = hasOwn(options, 'projectId') || hasOwn(options, 'projectIds');
    const projectResolution = hasProjectPatch
      ? resolveProjectReferences(
          store,
          Array.isArray(projectIds)
            ? projectIds.concat(projectId ? [projectId] : [])
            : (projectId ? [projectId] : [])
        )
      : null;
    if (projectResolution && !projectResolution.ok) return projectResolution;
    if (projectResolution && projectResolution.projects.length === 0) {
      return { ok: false, error: 'PROJECT_REQUIRED', message: 'At least one project id or project name is required.' };
    }

    const hasLinkedTaskPatch = hasOwn(options, 'linkedTaskIds');
    const taskValidation = hasLinkedTaskPatch
      ? validateTaskReferences(store, linkedTaskIds, { fieldName: 'linkedTaskIds' })
      : null;
    if (taskValidation && !taskValidation.ok) return taskValidation;

    const nextMilestone = {
      ...currentMilestone,
      title: hasOwn(options, 'title') ? normalizeString(title).trim() : currentMilestone.title,
      startDate: startDatePatch ? startDatePatch.value : currentMilestone.startDate,
      endDate: endDatePatch ? endDatePatch.value : currentMilestone.endDate,
      notes: hasOwn(options, 'notes')
        ? normalizeString(notes)
        : hasOwn(options, 'description')
          ? normalizeString(description)
          : currentMilestone.notes,
      color: hasOwn(options, 'color') ? normalizeString(color).trim() || undefined : currentMilestone.color,
      linkedTaskIds: taskValidation ? taskValidation.taskIds : currentMilestone.linkedTaskIds,
      [revisionField]: currentRevision + 1,
      mcpUpdatedAt: new Date().toISOString(),
      mcpLastActor: actor,
    };

    if (projectResolution) {
      nextMilestone.projectIds = projectResolution.projects.map(project => project.id);
      nextMilestone.projectId = projectResolution.projects[0].id;
    }

    if (nextMilestone.startDate && nextMilestone.endDate && nextMilestone.endDate < nextMilestone.startDate) {
      return { ok: false, error: 'INVALID_DATE_RANGE', message: 'endDate cannot be earlier than startDate.' };
    }

    const nextMilestones = milestones.slice();
    nextMilestones[milestoneIndex] = nextMilestone;
    writeMilestones(store, nextMilestones);

    if (taskValidation) {
      syncMilestoneTaskLinks(
        store,
        nextMilestone.id,
        currentMilestone.linkedTaskIds,
        taskValidation.taskIds,
        actor
      );
    }

    return {
      ok: true,
      milestone: normalizeMilestone(nextMilestone),
      linkedTaskIds: nextMilestone.linkedTaskIds,
    };
  }

  function linkMilestoneTasks(store, options = {}) {
    const {
      milestoneId,
      taskIds,
      dependencyUpdates,
      expectedRevision,
      actor = 'agent',
    } = options;
    const normalizedMilestoneId = normalizeString(milestoneId).trim();
    if (!normalizedMilestoneId) {
      return { ok: false, error: 'MILESTONE_ID_REQUIRED', message: 'milestoneId is required.' };
    }

    const milestones = readMilestones(store);
    const milestoneIndex = milestones.findIndex(milestone => milestone && milestone.id === normalizedMilestoneId);
    if (milestoneIndex < 0) {
      return { ok: false, error: 'MILESTONE_NOT_FOUND', message: `Milestone "${normalizedMilestoneId}" not found.` };
    }

    const currentMilestone = normalizeMilestone(milestones[milestoneIndex]);
    const currentRevision = currentMilestone[revisionField] || 0;
    if (!Number.isFinite(Number(expectedRevision))) {
      return {
        ok: false,
        error: 'EXPECTED_REVISION_REQUIRED',
        message: 'expectedRevision is required and must be a finite number.',
        currentRevision,
      };
    }

    const expected = Math.max(0, Math.floor(Number(expectedRevision)));
    if (expected !== currentRevision) {
      return {
        ok: false,
        error: 'REVISION_MISMATCH',
        message: 'Milestone revision mismatch.',
        currentRevision,
        expectedRevision: expected,
      };
    }

    const taskValidation = validateTaskReferences(store, taskIds, { fieldName: 'taskIds' });
    if (!taskValidation.ok) return taskValidation;

    const dependencyValidation = validateRoadmapDependencyUpdates(store, dependencyUpdates);
    if (!dependencyValidation.ok) return dependencyValidation;

    const linkedTaskIdSet = new Set(currentMilestone.linkedTaskIds || []);
    taskValidation.taskIds.forEach(taskId => linkedTaskIdSet.add(taskId));
    dependencyValidation.updates.forEach(update => linkedTaskIdSet.add(update.taskId));

    const linkedTaskIds = Array.from(linkedTaskIdSet);
    const dependencyUpdatesByTaskId = new Map(
      dependencyValidation.updates.map(update => [update.taskId, update.dependencyIds])
    );
    const now = new Date().toISOString();
    const changedTaskIds = [];

    const nextTasks = readTasks(store).map(rawTask => {
      if (!rawTask || typeof rawTask !== 'object') return rawTask;
      const task = normalizeTask(rawTask);
      const nextDependencyIds = dependencyUpdatesByTaskId.has(task.id)
        ? dependencyUpdatesByTaskId.get(task.id)
        : task.dependencyIds;
      const shouldLink = linkedTaskIdSet.has(task.id);
      const milestoneChanged = shouldLink && task.milestoneId !== currentMilestone.id;
      const dependencyChanged = dependencyUpdatesByTaskId.has(task.id)
        && JSON.stringify(nextDependencyIds) !== JSON.stringify(task.dependencyIds || []);

      if (!milestoneChanged && !dependencyChanged) return rawTask;

      changedTaskIds.push(task.id);
      return {
        ...task,
        milestoneId: shouldLink ? currentMilestone.id : task.milestoneId,
        dependencyIds: nextDependencyIds,
        [revisionField]: (task[revisionField] || 0) + 1,
        mcpUpdatedAt: now,
        mcpLastActor: actor,
      };
    });

    const milestoneChanged = JSON.stringify(linkedTaskIds) !== JSON.stringify(currentMilestone.linkedTaskIds || []);
    const nextMilestone = {
      ...currentMilestone,
      linkedTaskIds,
      [revisionField]: currentRevision + 1,
      mcpUpdatedAt: now,
      mcpLastActor: actor,
    };

    const nextMilestones = milestones.slice();
    nextMilestones[milestoneIndex] = nextMilestone;
    writeMilestones(store, nextMilestones);
    if (changedTaskIds.length > 0) writeTasks(store, nextTasks);

    return {
      ok: true,
      changed: milestoneChanged || changedTaskIds.length > 0,
      milestone: normalizeMilestone(nextMilestone),
      linkedTaskIds,
      linkedTaskIdsAdded: linkedTaskIds.filter(taskId => !(currentMilestone.linkedTaskIds || []).includes(taskId)),
      dependencyUpdates: dependencyValidation.updates,
      changedTaskIds,
    };
  }

  function deleteMilestone(store, options = {}) {
    const {
      milestoneId,
      expectedRevision,
      actor = 'agent',
    } = options;
    const normalizedMilestoneId = normalizeString(milestoneId).trim();
    if (!normalizedMilestoneId) {
      return { ok: false, error: 'MILESTONE_ID_REQUIRED', message: 'milestoneId is required.' };
    }

    const milestones = readMilestones(store);
    const milestoneIndex = milestones.findIndex(milestone => milestone && milestone.id === normalizedMilestoneId);
    if (milestoneIndex < 0) {
      return { ok: false, error: 'MILESTONE_NOT_FOUND', message: `Milestone "${normalizedMilestoneId}" not found.` };
    }

    const currentMilestone = normalizeMilestone(milestones[milestoneIndex]);
    const currentRevision = currentMilestone[revisionField] || 0;
    if (!Number.isFinite(Number(expectedRevision))) {
      return {
        ok: false,
        error: 'EXPECTED_REVISION_REQUIRED',
        message: 'expectedRevision is required and must be a finite number.',
        currentRevision,
      };
    }

    const expected = Math.max(0, Math.floor(Number(expectedRevision)));
    if (expected !== currentRevision) {
      return {
        ok: false,
        error: 'REVISION_MISMATCH',
        message: 'Milestone revision mismatch.',
        currentRevision,
        expectedRevision: expected,
      };
    }

    const affectedTaskIds = new Set(currentMilestone.linkedTaskIds || []);
    const cleanup = {
      clearedMilestoneTaskIds: [],
      clearedDependencyTaskIds: [],
    };

    const nextTasks = readTasks(store).map(rawTask => {
      if (!rawTask || typeof rawTask !== 'object') return rawTask;
      const task = normalizeTask(rawTask);
      const shouldClearMilestone = task.milestoneId === normalizedMilestoneId || affectedTaskIds.has(task.id);
      const shouldClearDependencies = shouldClearMilestone && (task.dependencyIds || []).length > 0;
      if (!shouldClearMilestone && !shouldClearDependencies) return rawTask;

      if (shouldClearMilestone) cleanup.clearedMilestoneTaskIds.push(task.id);
      if (shouldClearDependencies) cleanup.clearedDependencyTaskIds.push(task.id);

      return {
        ...task,
        milestoneId: shouldClearMilestone ? undefined : task.milestoneId,
        dependencyIds: shouldClearDependencies ? [] : task.dependencyIds,
        [revisionField]: (task[revisionField] || 0) + 1,
        mcpUpdatedAt: new Date().toISOString(),
        mcpLastActor: actor,
      };
    });

    writeMilestones(store, milestones.slice(0, milestoneIndex).concat(milestones.slice(milestoneIndex + 1)));
    if (cleanup.clearedMilestoneTaskIds.length > 0 || cleanup.clearedDependencyTaskIds.length > 0) {
      writeTasks(store, nextTasks);
    }

    return {
      ok: true,
      deletedMilestoneId: normalizedMilestoneId,
      milestone: currentMilestone,
      currentRevision,
      cleanup,
    };
  }

  return {
    normalizeMilestone,
    listMilestones,
    getMilestoneById,
    resolveMilestoneReference,
    createMilestone,
    updateMilestone,
    linkMilestoneTasks,
    deleteMilestone,
  };
}

module.exports = {
  createMilestoneService,
};
