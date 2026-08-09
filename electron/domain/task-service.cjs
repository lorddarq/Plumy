const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

function createTaskService({
  activityLogMaxEntries,
  dependencyRules,
  collaborationService,
  findPersonById,
  findPersonByReference,
  hasOwn,
  normalizeBoolean,
  normalizeMilestone,
  normalizeName,
  normalizeOptionalDate,
  normalizeOptionalEnum,
  normalizePatchDate,
  normalizePatchEnum,
  normalizePositiveInteger,
  normalizeString,
  normalizeTaskIdList,
  readMilestones,
  readPeople,
  readProjects,
  readStatusColumns,
  readTasks,
  requiresHumanReviewStatusColor,
  requiresHumanReviewStatusId,
  requiresHumanReviewStatusTitle,
  resolveMilestoneReference,
  revisionField,
  writeMilestones,
  writeStatusColumns,
  writeTasks,
}) {
  const requiredFunctions = {
    findPersonById,
    findPersonByReference,
    hasOwn,
    normalizeBoolean,
    normalizeMilestone,
    normalizeName,
    normalizeOptionalDate,
    normalizeOptionalEnum,
    normalizePatchDate,
    normalizePatchEnum,
    normalizePositiveInteger,
    normalizeString,
    normalizeTaskIdList,
    readMilestones,
    readPeople,
    readProjects,
    readStatusColumns,
    readTasks,
    resolveMilestoneReference,
    writeMilestones,
    writeStatusColumns,
    writeTasks,
  };
  for (const [name, value] of Object.entries(requiredFunctions)) {
    if (typeof value !== "function") throw new TypeError(`createTaskService requires ${name}.`);
  }
  if (!dependencyRules || typeof dependencyRules.validateTaskReferences !== "function"
    || typeof dependencyRules.validateDependencyCycles !== "function") {
    throw new TypeError("createTaskService requires dependencyRules.");
  }
  if (!collaborationService || typeof collaborationService.normalizeStored !== 'function'
    || typeof collaborationService.validate !== 'function') {
    throw new TypeError('createTaskService requires collaborationService.');
  }
  if (typeof revisionField !== "string" || !revisionField) {
    throw new TypeError("createTaskService requires revisionField.");
  }
  const { validateDependencyCycles, validateTaskReferences } = dependencyRules;
  function normalizeTimeEntries(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry))
      .map(entry => {
        const minutes = normalizePositiveInteger(entry.minutes);
        if (!minutes || minutes <= 0) return null;
        return {
          id: normalizeString(entry.id).trim() || `time-${randomUUID()}`,
          minutes,
          note: normalizeString(entry.note).trim() || undefined,
          loggedAt: normalizeString(entry.loggedAt).trim() || new Date().toISOString(),
          actor: normalizeString(entry.actor).trim() || undefined,
        };
      })
      .filter(Boolean);
  }
  
  function getFileNameFromPath(filePath) {
    const normalized = normalizeString(filePath).replace(/\\/g, '/');
    return normalized.split('/').filter(Boolean).pop() || normalized;
  }
  
  function toFileUri(filePath) {
    const normalized = normalizeString(filePath).replace(/\\/g, '/');
    const prefixed = normalized.match(/^[A-Za-z]:\//) ? `/${normalized}` : normalized;
    return `file://${encodeURI(prefixed)}`;
  }
  
  function fileUriToPath(uri) {
    try {
      const url = new URL(uri);
      if (url.protocol !== 'file:') return null;
      return decodeURIComponent(url.pathname || '');
    } catch (err) {
      return null;
    }
  }
  
  function normalizeAttachmentPath(value) {
    const raw = normalizeString(value);
    if (!raw) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      return raw.toLowerCase().startsWith('file:') ? fileUriToPath(raw) : null;
    }
    if (raw.startsWith('/') || /^[A-Za-z]:[\\/]/.test(raw)) {
      return raw;
    }
    return null;
  }
  
  function normalizeTaskAttachments(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value
      .filter(attachment => attachment && typeof attachment === 'object' && !Array.isArray(attachment))
      .map((attachment, index) => {
        const path = normalizeAttachmentPath(attachment.path || attachment.uri || attachment.fileUri || attachment.url);
        if (!path || seen.has(path)) return null;
        seen.add(path);
        const size = normalizePositiveInteger(attachment.size);
        return {
          id: normalizeString(attachment.id).trim() || `attachment-${index}`,
          name: normalizeString(attachment.name).trim() || getFileNameFromPath(path),
          path,
          uri: normalizeString(attachment.uri).trim() || toFileUri(path),
          size: size === null ? undefined : size,
          addedAt: normalizeString(attachment.addedAt).trim() || new Date().toISOString(),
        };
      })
      .filter(Boolean);
  }
  
  function normalizeAttachmentInput(input = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const path = normalizeAttachmentPath(source.path || source.filePath || source.uri || source.fileUri || source.url);
    if (!path) {
      return {
        ok: false,
        error: 'INVALID_ATTACHMENT_URI',
        message: 'Provide an absolute local path or file:// URL for the attachment.',
      };
    }
  
    const size = normalizePositiveInteger(source.size);
    return {
      ok: true,
      attachment: {
        id: normalizeString(source.id).trim() || `attachment-${randomUUID()}`,
        name: normalizeString(source.name).trim() || getFileNameFromPath(path),
        path,
        uri: normalizeString(source.uri || source.fileUri || source.url).trim() || toFileUri(path),
        size: size === null ? undefined : size,
        addedAt: normalizeString(source.addedAt).trim() || new Date().toISOString(),
      },
    };
  }

  function listTasks(store, filters = {}) {
    const tasks = readTasks(store).map(normalizeTaskForMcp);
    const status = normalizeString(filters.status);
    const assigneeId = normalizeString(filters.assigneeId);
    const projectId = normalizeString(filters.projectId);
    const search = normalizeString(filters.search).trim().toLowerCase();
  
    return tasks.filter(task => {
      if (!task || typeof task !== 'object') return false;
      if (status && task.status !== status) return false;
      if (assigneeId && task.assigneeId !== assigneeId) return false;
  
      if (projectId) {
        const projectIds = Array.isArray(task.projectIds) ? task.projectIds : [];
        if (!projectIds.includes(projectId) && task.swimlaneId !== projectId) return false;
      }
  
      if (search) {
        const title = String(task.title || '').toLowerCase();
        const notes = String(task.notes || '').toLowerCase();
        if (!title.includes(search) && !notes.includes(search)) return false;
      }
  
      return true;
    });
  }
  
  function getTaskById(store, taskId) {
    if (typeof taskId !== 'string' || !taskId.trim()) return null;
    const tasks = readTasks(store);
    const task = tasks.find(t => t && t.id === taskId) || null;
    return task ? normalizeTaskForMcp(task) : null;
  }
  
  function normalizeTaskForMcp(task) {
    if (!task || typeof task !== 'object') return task;
    const revision = Number.isFinite(Number(task[revisionField]))
      ? Math.max(0, Math.floor(Number(task[revisionField])))
      : 0;
    const descriptionProjectContext = extractProjectContextFromDescription(task.notes);
    const timeSpentMinutes = normalizePositiveInteger(task.timeSpentMinutes);
    const collaborationResult = collaborationService.normalizeStored(task.collaboration);
    return {
      ...task,
      dependencyIds: normalizeTaskIdList(task.dependencyIds),
      timeSpentMinutes: timeSpentMinutes === null ? undefined : timeSpentMinutes,
      timeSpentNote: normalizeString(task.timeSpentNote).trim() || undefined,
      timeEntries: normalizeTimeEntries(task.timeEntries),
      attachments: normalizeTaskAttachments(task.attachments),
      [revisionField]: revision,
      descriptionProjectContext,
      collaboration: collaborationResult.ok ? collaborationResult.collaboration : task.collaboration,
      collaborationError: collaborationResult.ok ? undefined : {
        error: collaborationResult.error,
        message: collaborationResult.message,
      },
    };
  }
  
  function extractProjectContextFromDescription(notes) {
    if (typeof notes !== 'string' || !notes.trim()) {
      return {
        projectMentions: [],
        repoHints: [],
        urls: [],
      };
    }
  
    const lines = notes.split(/\r?\n/);
    const projectMentions = [];
    const repoHints = [];
    const urls = [];
  
    const urlMatches = notes.match(/https?:\/\/[^\s)\]]+/g) || [];
    for (const url of urlMatches) {
      if (!urls.includes(url)) urls.push(url);
      if (/github\.com|gitlab\.com|bitbucket\.org|\.git($|[/?#])/i.test(url) && !repoHints.includes(url)) {
        repoHints.push(url);
      }
    }
  
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
  
      const projectMatch = line.match(/^projects?\s*:\s*(.+)$/i);
      if (projectMatch) {
        const values = projectMatch[1]
          .split(/[;,]/)
          .map(value => value.trim())
          .filter(Boolean);
        for (const value of values) {
          if (!projectMentions.includes(value)) projectMentions.push(value);
        }
      }
  
      const repoMatch = line.match(/^repos?(itory)?\s*:\s*(.+)$/i);
      if (repoMatch) {
        const value = repoMatch[2].trim();
        if (value && !repoHints.includes(value)) repoHints.push(value);
      }
  
      const pathLikeMatch = line.match(/(?:^|\s)([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\.git)?)(?:$|\s)/g) || [];
      for (const match of pathLikeMatch) {
        const cleaned = match.trim();
        if (cleaned && !repoHints.includes(cleaned)) repoHints.push(cleaned);
      }
    }
  
    return {
      projectMentions,
      repoHints,
      urls,
    };
  }
  
  function findStatusColumnByReference(store, { statusId, statusTitle }) {
    const columns = readStatusColumns(store);
    const normalizedTitle = normalizeName(statusTitle);
    const normalizedId = normalizeName(statusId);
  
    return columns.find(column => {
      if (!column || typeof column !== 'object') return false;
      const idMatches = typeof statusId === 'string' && column.id === statusId.trim();
      const titleMatches = normalizedTitle && normalizeName(column.title) === normalizedTitle;
      const fallbackMatches = normalizedId && normalizeName(column.title) === normalizedId;
      return idMatches || titleMatches || fallbackMatches;
    }) || null;
  }
  
  function findProjectById(store, projectId) {
    const normalizedProjectId = normalizeString(projectId).trim();
    if (!normalizedProjectId) return null;
    const projects = readProjects(store);
    return projects.find(project => project && project.id === normalizedProjectId) || null;
  }
  
  function findProjectByName(store, projectName) {
    const normalizedProjectName = normalizeName(projectName);
    if (!normalizedProjectName) return null;
    const projects = readProjects(store);
    return projects.find(project => project && normalizeName(project.name) === normalizedProjectName) || null;
  }
  
  function findProjectByReference(store, reference) {
    const byId = findProjectById(store, reference);
    if (byId) return byId;
    return findProjectByName(store, reference);
  }
  
  function resolveProjectReferences(store, references) {
    const requestedProjectIds = normalizeTaskIdList(references);
    const resolvedProjects = [];
    for (const id of requestedProjectIds) {
      const project = findProjectByReference(store, id);
      if (!project) {
        return {
          ok: false,
          error: 'PROJECT_NOT_FOUND',
          message: `Project "${id}" not found. Provide a valid project id or project name.`,
        };
      }
      resolvedProjects.push(project);
    }
    return { ok: true, projects: resolvedProjects };
  }
  
  function createTask(store, {
    title,
    notes,
    statusId,
    statusTitle,
    assigneeId,
    assigneeName,
    assigneeKind,
    projectId,
    projectIds,
    swimlaneId,
    startDate,
    endDate,
    size,
    complexity,
    priority,
    blocked,
    swimlaneOnly,
    milestoneId,
    dependencyIds,
    parentTaskId,
    timeSpentMinutes,
    timeSpentNote,
    actor = 'agent',
  } = {}) {
    const normalizedTitle = normalizeString(title).trim();
    if (!normalizedTitle) {
      return {
        ok: false,
        error: 'INVALID_TITLE',
        message: 'title is required.',
      };
    }
  
    const targetStatus = (statusId || statusTitle)
      ? findStatusColumnByReference(store, { statusId, statusTitle })
      : null;
    if ((statusId || statusTitle) && !targetStatus) {
      return {
        ok: false,
        error: 'STATUS_NOT_FOUND',
        message: 'Target status/board not found.',
      };
    }
  
    const assignee = (assigneeId || assigneeName)
      ? findPersonByReference(store, { assigneeId, assigneeName })
      : null;
    if ((assigneeId || assigneeName) && !assignee) {
      return {
        ok: false,
        error: 'ASSIGNEE_NOT_FOUND',
        message: 'Assignee not found.',
      };
    }
  
    if (assignee && typeof assigneeKind === 'string' && assigneeKind.trim() && assignee.kind !== assigneeKind.trim()) {
      return {
        ok: false,
        error: 'ASSIGNEE_KIND_MISMATCH',
        message: 'Assignee kind does not match the selected person.',
      };
    }
    const requestedProjectIds = normalizeTaskIdList(
      Array.isArray(projectIds)
        ? projectIds.concat(projectId ? [projectId] : [])
        : (projectId ? [projectId] : [])
    );
    const resolvedProjects = [];
    for (const id of requestedProjectIds) {
      const project = findProjectByReference(store, id);
      if (!project) {
        return {
          ok: false,
          error: 'PROJECT_NOT_FOUND',
          message: `Project "${id}" not found. Provide a valid project id or project name.`,
        };
      }
      resolvedProjects.push(project);
    }
  
    const normalizedSwimlaneId = normalizeString(swimlaneId).trim();
    const primaryTimelineProject = normalizedSwimlaneId ? findProjectByReference(store, normalizedSwimlaneId) : null;
    if (normalizedSwimlaneId && !primaryTimelineProject) {
      return {
        ok: false,
        error: 'TIMELINE_PROJECT_NOT_FOUND',
        message: `Timeline project "${normalizedSwimlaneId}" not found. Provide a valid project id or project name.`,
      };
    }
  
    const finalProjectIds = resolvedProjects.map(project => project.id);
    const finalSwimlaneId = primaryTimelineProject?.id || finalProjectIds[0] || undefined;
    if (finalSwimlaneId && !finalProjectIds.includes(finalSwimlaneId)) {
      finalProjectIds.unshift(finalSwimlaneId);
    }
  
    const normalizedStartDate = normalizeOptionalDate(startDate);
    const normalizedEndDate = normalizeOptionalDate(endDate) || normalizedStartDate;
    if (normalizedStartDate && normalizedEndDate && normalizedEndDate < normalizedStartDate) {
      return {
        ok: false,
        error: 'INVALID_DATE_RANGE',
        message: 'endDate cannot be earlier than startDate.',
      };
    }
  
    const parentValidation = validateTaskReferences(store, parentTaskId ? [parentTaskId] : [], { fieldName: 'parentTaskId' });
    if (!parentValidation.ok) return parentValidation;
    const dependencyValidation = validateTaskReferences(store, dependencyIds, { fieldName: 'dependencyIds' });
    if (!dependencyValidation.ok) return dependencyValidation;
    const dependencyCycleValidation = validateDependencyCycles(store, {
      taskId: '__new_task__',
      dependencyIds: dependencyValidation.taskIds,
      fieldName: 'dependencyIds',
    });
    if (!dependencyCycleValidation.ok) return dependencyCycleValidation;
  
    const milestoneValidation = resolveMilestoneReference(store, milestoneId);
    if (!milestoneValidation.ok) return milestoneValidation;
  
    const hasTimeSpentValue = timeSpentMinutes !== undefined && timeSpentMinutes !== null;
    const normalizedTimeSpentMinutes = hasTimeSpentValue ? normalizePositiveInteger(timeSpentMinutes) : null;
    if (hasTimeSpentValue && normalizedTimeSpentMinutes === null) {
      return {
        ok: false,
        error: 'INVALID_TIME_SPENT',
        message: 'timeSpentMinutes must be a finite non-negative number.',
      };
    }
  
    const nextTask = {
      id: `task-${randomUUID()}`,
      title: normalizedTitle,
      status: targetStatus?.id || 'open',
      notes: typeof notes === 'string' ? notes : '',
      size: normalizeOptionalEnum(size, ['xs', 's', 'm', 'l'], 'm'),
      complexity: normalizeOptionalEnum(complexity, ['routine', 'medium', 'hard'], 'medium'),
      priority: normalizeOptionalEnum(priority, ['urgent', 'moderate', 'normal', 'low'], 'normal'),
      blocked: normalizeBoolean(blocked),
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      projectIds: finalProjectIds,
      swimlaneId: finalSwimlaneId,
      swimlaneOnly: typeof swimlaneOnly === 'boolean'
        ? swimlaneOnly
        : (finalProjectIds.length === 0 || !finalSwimlaneId),
      project: finalProjectIds
        .map(id => findProjectById(store, id)?.name)
        .filter(Boolean)
        .join(', ') || undefined,
      assigneeId: assignee?.id,
      milestoneId: milestoneValidation.milestoneId,
      dependencyIds: dependencyValidation.taskIds,
      parentTaskId: parentValidation.taskIds[0],
      timeSpentMinutes: normalizedTimeSpentMinutes === null ? undefined : normalizedTimeSpentMinutes,
      timeSpentNote: normalizeString(timeSpentNote).trim() || undefined,
      timeEntries: [],
      comments: [],
      [revisionField]: 0,
      mcpUpdatedAt: new Date().toISOString(),
      mcpLastActor: actor,
    };
  
    const tasks = readTasks(store);
    writeTasks(store, tasks.concat(nextTask));
  
    return {
      ok: true,
      task: normalizeTaskForMcp(nextTask),
    };
  }
  
  function ensureReadyForHumanReviewStatusColumn(store) {
    const existing = findStatusColumnByReference(store, {
      statusId: requiresHumanReviewStatusId,
      statusTitle: 'Ready for human review',
    });
    if (existing) {
      return { created: false, statusColumn: existing };
    }
  
    const columns = readStatusColumns(store);
    const statusColumn = {
      id: 'ready-human',
      title: 'Ready for human review',
      color: '#ffb61a',
    };
    writeStatusColumns(store, columns.concat(statusColumn));
    return { created: true, statusColumn };
  }
  
  function updateTaskWithRevision(store, taskId, expectedRevision, updater) {
    const tasks = readTasks(store);
    const taskIndex = tasks.findIndex(task => task && task.id === taskId);
    if (taskIndex < 0) {
      return { ok: false, error: 'TASK_NOT_FOUND', message: `Task "${taskId}" not found.` };
    }
  
    const currentTask = normalizeTaskForMcp(tasks[taskIndex]);
    const currentRevision = currentTask[revisionField] || 0;
  
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
        message: 'Task revision mismatch.',
        currentRevision,
        expectedRevision: expected,
      };
    }
  
    const nextTask = updater(currentTask);
    if (!nextTask) {
      return { ok: false, error: 'INVALID_UPDATE', message: 'Task update was rejected.' };
    }
  
    const updated = {
      ...nextTask,
      [revisionField]: currentRevision + 1,
      mcpUpdatedAt: new Date().toISOString(),
    };
  
    const nextTasks = tasks.slice();
    nextTasks[taskIndex] = updated;
    writeTasks(store, nextTasks);
  
    return { ok: true, task: normalizeTaskForMcp(updated) };
  }

  function getAggregateReviewBlockers(task) {
    if (!task?.collaboration) return [];
    return task.collaboration.contributions
      .filter(contribution => contribution.state !== 'accepted')
      .map(contribution => ({ id: contribution.id, personId: contribution.personId, state: contribution.state }));
  }

  function requireAcceptedContributions(store, taskId, actorPersonId) {
    const task = getTaskById(store, taskId);
    if (!task) return { ok: false, error: 'TASK_NOT_FOUND', message: `Task "${taskId}" not found.` };
    if (task.collaboration && normalizeString(actorPersonId) !== task.collaboration.orchestratorId) {
      return {
        ok: false,
        error: 'COLLABORATION_ORCHESTRATOR_REQUIRED',
        message: 'Only the task orchestrator can request aggregate review for a collaborative task.',
        currentRevision: task[revisionField] || 0,
      };
    }
    const blockers = getAggregateReviewBlockers(task);
    if (blockers.length > 0) {
      return {
        ok: false,
        error: 'CONTRIBUTIONS_NOT_ACCEPTED',
        message: 'Every contribution must be accepted before aggregate review can be requested.',
        blockers,
        currentRevision: task[revisionField] || 0,
      };
    }
    return { ok: true, task };
  }
  
  function updateTaskDetails(store, options = {}) {
    const patch = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const {
      taskId,
      expectedRevision,
      title,
      notes,
      statusId,
      statusTitle,
      assigneeId,
      assigneeName,
      assigneeKind,
      projectId,
      projectIds,
      swimlaneId,
      startDate,
      endDate,
      size,
      complexity,
      priority,
      blocked,
      swimlaneOnly,
      milestoneId,
      dependencyIds,
      timeSpentMinutes,
      timeSpentNote,
      actor = 'agent',
    } = patch;
  
    const normalizedTaskId = normalizeString(taskId).trim();
    if (!normalizedTaskId) {
      return { ok: false, error: 'TASK_ID_REQUIRED', message: 'taskId is required.' };
    }
  
    if (hasOwn(patch, 'title') && !normalizeString(title).trim()) {
      return { ok: false, error: 'INVALID_TITLE', message: 'title cannot be empty.' };
    }
  
    const hasStatusPatch = hasOwn(patch, 'statusId') || hasOwn(patch, 'statusTitle');
    const targetStatus = hasStatusPatch && (normalizeString(statusId) || normalizeString(statusTitle))
      ? findStatusColumnByReference(store, { statusId, statusTitle })
      : null;
    if (hasStatusPatch && (normalizeString(statusId) || normalizeString(statusTitle)) && !targetStatus) {
      return { ok: false, error: 'STATUS_NOT_FOUND', message: 'Target status/board not found.' };
    }
  
    const hasAssigneePatch = hasOwn(patch, 'assigneeId') || hasOwn(patch, 'assigneeName');
    const hasAssigneeValue = normalizeString(assigneeId) || normalizeString(assigneeName);
    const assignee = hasAssigneePatch && hasAssigneeValue
      ? findPersonByReference(store, { assigneeId, assigneeName })
      : null;
    if (hasAssigneePatch && hasAssigneeValue && !assignee) {
      return { ok: false, error: 'ASSIGNEE_NOT_FOUND', message: 'Assignee not found.' };
    }
    if (assignee && typeof assigneeKind === 'string' && assigneeKind.trim() && assignee.kind !== assigneeKind.trim()) {
      return {
        ok: false,
        error: 'ASSIGNEE_KIND_MISMATCH',
        message: 'Assignee kind does not match the selected person.',
      };
    }
    const currentTaskForAssignment = hasAssigneePatch ? getTaskById(store, normalizedTaskId) : null;
    if (currentTaskForAssignment?.collaboration && assignee?.id !== currentTaskForAssignment.assigneeId) {
      return {
        ok: false,
        error: 'COLLABORATION_ASSIGNMENT_REQUIRES_ASSIGN_TOOL',
        message: 'Collaborative task assignment must use tasks.assign so orchestratorId and assigneeId stay synchronized.',
      };
    }
  
    const hasProjectPatch = hasOwn(patch, 'projectId') || hasOwn(patch, 'projectIds');
    let resolvedProjects = null;
    if (hasProjectPatch) {
      const requestedProjectIds = normalizeTaskIdList(
        Array.isArray(projectIds)
          ? projectIds.concat(projectId ? [projectId] : [])
          : (projectId ? [projectId] : [])
      );
      resolvedProjects = [];
      for (const id of requestedProjectIds) {
        const project = findProjectByReference(store, id);
        if (!project) {
          return {
            ok: false,
            error: 'PROJECT_NOT_FOUND',
            message: `Project "${id}" not found. Provide a valid project id or project name.`,
          };
        }
        resolvedProjects.push(project);
      }
    }
  
    const hasSwimlanePatch = hasOwn(patch, 'swimlaneId');
    const normalizedSwimlaneId = normalizeString(swimlaneId).trim();
    const primaryTimelineProject = hasSwimlanePatch && normalizedSwimlaneId
      ? findProjectByReference(store, normalizedSwimlaneId)
      : null;
    if (hasSwimlanePatch && normalizedSwimlaneId && !primaryTimelineProject) {
      return {
        ok: false,
        error: 'TIMELINE_PROJECT_NOT_FOUND',
        message: `Timeline project "${normalizedSwimlaneId}" not found. Provide a valid project id or project name.`,
      };
    }
  
    const startDatePatch = hasOwn(patch, 'startDate') ? normalizePatchDate(startDate, 'startDate') : null;
    if (startDatePatch && !startDatePatch.ok) return startDatePatch;
    const endDatePatch = hasOwn(patch, 'endDate') ? normalizePatchDate(endDate, 'endDate') : null;
    if (endDatePatch && !endDatePatch.ok) return endDatePatch;
  
    const sizePatch = hasOwn(patch, 'size') ? normalizePatchEnum(size, ['xs', 's', 'm', 'l'], 'size') : null;
    if (sizePatch && !sizePatch.ok) return sizePatch;
    const complexityPatch = hasOwn(patch, 'complexity') ? normalizePatchEnum(complexity, ['routine', 'medium', 'hard'], 'complexity') : null;
    if (complexityPatch && !complexityPatch.ok) return complexityPatch;
    const priorityPatch = hasOwn(patch, 'priority') ? normalizePatchEnum(priority, ['urgent', 'moderate', 'normal', 'low'], 'priority') : null;
    if (priorityPatch && !priorityPatch.ok) return priorityPatch;
  
    const hasDependencyPatch = hasOwn(patch, 'dependencyIds');
    const dependencyPatch = hasDependencyPatch
      ? validateTaskReferences(store, dependencyIds, { fieldName: 'dependencyIds', excludeTaskId: normalizedTaskId })
      : null;
    if (dependencyPatch && !dependencyPatch.ok) return dependencyPatch;
    const dependencyCyclePatch = dependencyPatch
      ? validateDependencyCycles(store, {
          taskId: normalizedTaskId,
          dependencyIds: dependencyPatch.taskIds,
          fieldName: 'dependencyIds',
        })
      : null;
    if (dependencyCyclePatch && !dependencyCyclePatch.ok) return dependencyCyclePatch;
  
    const hasMilestonePatch = hasOwn(patch, 'milestoneId');
    const milestonePatch = hasMilestonePatch ? resolveMilestoneReference(store, milestoneId) : null;
    if (milestonePatch && !milestonePatch.ok) return milestonePatch;
  
    const hasTimeSpentPatch = hasOwn(patch, 'timeSpentMinutes');
    const normalizedTimeSpentMinutes = hasTimeSpentPatch ? normalizePositiveInteger(timeSpentMinutes) : null;
    if (hasTimeSpentPatch && normalizedTimeSpentMinutes === null) {
      return {
        ok: false,
        error: 'INVALID_TIME_SPENT',
        message: 'timeSpentMinutes must be a finite non-negative number.',
      };
    }
  
    return updateTaskWithRevision(store, normalizedTaskId, expectedRevision, (task) => {
      const nextTask = { ...task };
  
      if (hasOwn(patch, 'title')) {
        const normalizedTitle = normalizeString(title).trim();
        nextTask.title = normalizedTitle;
      }
  
      if (hasOwn(patch, 'notes')) {
        nextTask.notes = typeof notes === 'string' ? notes : '';
      }
  
      if (hasStatusPatch && targetStatus) {
        nextTask.status = targetStatus.id;
      }
  
      if (hasAssigneePatch) {
        nextTask.assigneeId = assignee?.id;
      }
  
      if (hasProjectPatch || hasSwimlanePatch) {
        const nextProjectIds = hasProjectPatch
          ? resolvedProjects.map(project => project.id)
          : normalizeTaskIdList(nextTask.projectIds);
        let nextSwimlaneId = nextTask.swimlaneId;
  
        if (hasSwimlanePatch) {
          nextSwimlaneId = primaryTimelineProject?.id;
        } else if (hasProjectPatch && nextProjectIds.length === 0) {
          nextSwimlaneId = undefined;
        } else if (hasProjectPatch && nextSwimlaneId && nextProjectIds.length > 0 && !nextProjectIds.includes(nextSwimlaneId)) {
          nextSwimlaneId = nextProjectIds[0];
        }
  
        if (nextSwimlaneId && !nextProjectIds.includes(nextSwimlaneId)) {
          nextProjectIds.unshift(nextSwimlaneId);
        }
  
        nextTask.projectIds = nextProjectIds;
        nextTask.swimlaneId = nextSwimlaneId;
        nextTask.project = nextProjectIds
          .map(id => findProjectById(store, id)?.name)
          .filter(Boolean)
          .join(', ') || undefined;
      }
  
      if (startDatePatch) nextTask.startDate = startDatePatch.value;
      if (endDatePatch) nextTask.endDate = endDatePatch.value;
      if (nextTask.startDate && nextTask.endDate && nextTask.endDate < nextTask.startDate) return null;
  
      if (sizePatch) nextTask.size = sizePatch.value || 'm';
      if (complexityPatch) nextTask.complexity = complexityPatch.value || 'medium';
      if (priorityPatch) nextTask.priority = priorityPatch.value || 'normal';
      if (hasOwn(patch, 'blocked')) nextTask.blocked = normalizeBoolean(blocked);
      if (hasOwn(patch, 'swimlaneOnly')) nextTask.swimlaneOnly = normalizeBoolean(swimlaneOnly);
      if (dependencyPatch) nextTask.dependencyIds = dependencyPatch.taskIds;
      if (milestonePatch) nextTask.milestoneId = milestonePatch.milestoneId;
      if (hasTimeSpentPatch) nextTask.timeSpentMinutes = normalizedTimeSpentMinutes;
      if (hasOwn(patch, 'timeSpentNote')) nextTask.timeSpentNote = normalizeString(timeSpentNote).trim() || undefined;
  
      nextTask.mcpLastActor = actor;
      return nextTask;
    });
  }
  
  function updateTaskDescription(store, options = {}) {
    const patch = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const { taskId, expectedRevision, notes, description, actor = 'agent' } = patch;
    const normalizedTaskId = normalizeString(taskId).trim();
    if (!normalizedTaskId) {
      return { ok: false, error: 'TASK_ID_REQUIRED', message: 'taskId is required.' };
    }
  
    const hasNotes = hasOwn(patch, 'notes') && notes !== undefined;
    const hasDescription = hasOwn(patch, 'description') && description !== undefined;
    if (!hasNotes && !hasDescription) {
      return {
        ok: false,
        error: 'DESCRIPTION_REQUIRED',
        message: 'notes or description is required.',
      };
    }
  
    const nextNotes = hasNotes ? notes : description;
    return updateTaskWithRevision(store, normalizedTaskId, expectedRevision, (task) => ({
      ...task,
      notes: typeof nextNotes === 'string' ? nextNotes : '',
      mcpLastActor: actor,
    }));
  }

  function updateTaskCollaboration(store, options = {}) {
    const patch = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const taskId = normalizeString(patch.taskId);
    if (!taskId) return { ok: false, error: 'TASK_ID_REQUIRED', message: 'taskId is required.' };

    if (patch.collaboration === null) {
      return updateTaskWithRevision(store, taskId, patch.expectedRevision, task => {
        const { collaboration: _collaboration, collaborationError: _collaborationError, ...legacyTask } = task;
        return { ...legacyTask, mcpLastActor: patch.actor || 'agent' };
      });
    }

    const validation = collaborationService.validate(store, patch.collaboration, {
      allowIneligibleExistingContributionIds: patch.allowIneligibleExistingContributionIds,
    });
    if (!validation.ok) return validation;

    return updateTaskWithRevision(store, taskId, patch.expectedRevision, task => ({
      ...task,
      assigneeId: validation.collaboration.orchestratorId,
      collaboration: validation.collaboration,
      mcpLastActor: patch.actor || 'agent',
    }));
  }
  
  function attachTaskFile(store, options = {}) {
    const patch = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const { taskId, expectedRevision, actor = 'agent' } = patch;
    const normalizedTaskId = normalizeString(taskId).trim();
    if (!normalizedTaskId) {
      return { ok: false, error: 'TASK_ID_REQUIRED', message: 'taskId is required.' };
    }
  
    const normalizedAttachment = normalizeAttachmentInput(patch);
    if (!normalizedAttachment.ok) return normalizedAttachment;
  
    let unchangedDuplicate = null;
    const result = updateTaskWithRevision(store, normalizedTaskId, expectedRevision, (task) => {
      const existingAttachments = normalizeTaskAttachments(task.attachments);
      const attachment = normalizedAttachment.attachment;
      if (existingAttachments.some(item => item.path === attachment.path)) {
        unchangedDuplicate = existingAttachments.find(item => item.path === attachment.path) || attachment;
        return null;
      }
  
      return {
        ...task,
        attachments: existingAttachments.concat(attachment),
        mcpLastActor: actor,
      };
    });
  
    if (!result.ok && result.error === 'INVALID_UPDATE' && unchangedDuplicate) {
      return {
        ok: true,
        changed: false,
        attachment: unchangedDuplicate,
        task: getTaskById(store, normalizedTaskId),
      };
    }
  
    if (result.ok) {
      return {
        ...result,
        changed: true,
        attachment: normalizedAttachment.attachment,
      };
    }
  
    return result;
  }
  
  function removeTaskAttachment(store, options = {}) {
    const patch = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const { taskId, expectedRevision, attachmentId, actor = 'agent' } = patch;
    const normalizedTaskId = normalizeString(taskId).trim();
    if (!normalizedTaskId) {
      return { ok: false, error: 'TASK_ID_REQUIRED', message: 'taskId is required.' };
    }
  
    const normalizedAttachmentId = normalizeString(attachmentId).trim();
    const normalizedPath = normalizeAttachmentPath(patch.path || patch.filePath || patch.uri || patch.fileUri || patch.url);
    if (!normalizedAttachmentId && !normalizedPath) {
      return {
        ok: false,
        error: 'ATTACHMENT_REFERENCE_REQUIRED',
        message: 'attachmentId or an attachment path/file URL is required.',
      };
    }
  
    let removedAttachment = null;
    const result = updateTaskWithRevision(store, normalizedTaskId, expectedRevision, (task) => {
      const existingAttachments = normalizeTaskAttachments(task.attachments);
      const nextAttachments = existingAttachments.filter(attachment => {
        const shouldRemove = normalizedAttachmentId
          ? attachment.id === normalizedAttachmentId
          : attachment.path === normalizedPath;
        if (shouldRemove) removedAttachment = attachment;
        return !shouldRemove;
      });
  
      if (!removedAttachment) return null;
  
      return {
        ...task,
        attachments: nextAttachments,
        mcpLastActor: actor,
      };
    });
  
    if (!result.ok && result.error === 'INVALID_UPDATE' && !removedAttachment) {
      return {
        ok: false,
        error: 'ATTACHMENT_NOT_FOUND',
        message: 'Attachment not found on task.',
      };
    }
  
    if (result.ok) {
      return {
        ...result,
        removedAttachment,
      };
    }
  
    return result;
  }
  
  function logTaskTime(store, {
    taskId,
    minutes,
    note,
    expectedRevision,
    actor = 'agent',
  } = {}) {
    const normalizedTaskId = normalizeString(taskId).trim();
    if (!normalizedTaskId) {
      return { ok: false, error: 'TASK_ID_REQUIRED', message: 'taskId is required.' };
    }
  
    const normalizedMinutes = normalizePositiveInteger(minutes);
    if (!normalizedMinutes || normalizedMinutes <= 0) {
      return {
        ok: false,
        error: 'INVALID_TIME_SPENT',
        message: 'minutes must be a finite number greater than 0.',
      };
    }
  
    return updateTaskWithRevision(store, normalizedTaskId, expectedRevision, (task) => {
      const existingEntries = normalizeTimeEntries(task.timeEntries);
      const nextEntry = {
        id: `time-${randomUUID()}`,
        minutes: normalizedMinutes,
        note: normalizeString(note).trim() || undefined,
        loggedAt: new Date().toISOString(),
        actor,
      };
      const currentTotal = normalizePositiveInteger(task.timeSpentMinutes) || 0;
      return {
        ...task,
        timeSpentMinutes: currentTotal + normalizedMinutes,
        timeSpentNote: nextEntry.note || task.timeSpentNote,
        timeEntries: existingEntries.concat(nextEntry).slice(-activityLogMaxEntries),
        mcpLastActor: actor,
      };
    });
  }
  
  function deleteTask(store, {
    taskId,
    expectedRevision,
    actor = 'agent',
  } = {}) {
    const normalizedTaskId = normalizeString(taskId).trim();
    if (!normalizedTaskId) {
      return { ok: false, error: 'TASK_ID_REQUIRED', message: 'taskId is required.' };
    }
  
    const tasks = readTasks(store);
    const taskIndex = tasks.findIndex(task => task && task.id === normalizedTaskId);
    if (taskIndex < 0) {
      return { ok: false, error: 'TASK_NOT_FOUND', message: `Task "${normalizedTaskId}" not found.` };
    }
  
    const currentTask = normalizeTaskForMcp(tasks[taskIndex]);
    const currentRevision = currentTask[revisionField] || 0;
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
        message: 'Task revision mismatch.',
        currentRevision,
        expectedRevision: expected,
      };
    }
  
    const cleanup = {
      removedDependencyReferences: [],
      clearedParentReferences: [],
      updatedMilestoneIds: [],
    };
    const nextTasks = tasks
      .slice(0, taskIndex)
      .concat(tasks.slice(taskIndex + 1))
      .map(rawTask => {
        if (!rawTask || typeof rawTask !== 'object') return rawTask;
        const task = normalizeTaskForMcp(rawTask);
        const nextDependencyIds = (task.dependencyIds || []).filter(dependencyId => dependencyId !== normalizedTaskId);
        const clearsParent = task.parentTaskId === normalizedTaskId;
        if (nextDependencyIds.length === (task.dependencyIds || []).length && !clearsParent) return rawTask;
        if (nextDependencyIds.length !== (task.dependencyIds || []).length) cleanup.removedDependencyReferences.push(task.id);
        if (clearsParent) cleanup.clearedParentReferences.push(task.id);
        return {
          ...task,
          dependencyIds: nextDependencyIds,
          parentTaskId: clearsParent ? undefined : task.parentTaskId,
          [revisionField]: (task[revisionField] || 0) + 1,
          mcpUpdatedAt: new Date().toISOString(),
          mcpLastActor: actor,
        };
      });
    writeTasks(store, nextTasks);
  
    const milestones = readMilestones(store);
    const nextMilestones = milestones.map(rawMilestone => {
      const milestone = normalizeMilestone(rawMilestone);
      if (!milestone) return rawMilestone;
      const nextLinkedTaskIds = (milestone.linkedTaskIds || []).filter(taskId => taskId !== normalizedTaskId);
      if (nextLinkedTaskIds.length === (milestone.linkedTaskIds || []).length) return rawMilestone;
      cleanup.updatedMilestoneIds.push(milestone.id);
      return {
        ...milestone,
        linkedTaskIds: nextLinkedTaskIds,
        [revisionField]: (milestone[revisionField] || 0) + 1,
        mcpUpdatedAt: new Date().toISOString(),
        mcpLastActor: actor,
      };
    });
    if (cleanup.updatedMilestoneIds.length > 0) {
      writeMilestones(store, nextMilestones);
    }
  
    return {
      ok: true,
      deletedTaskId: normalizedTaskId,
      task: {
        ...currentTask,
        mcpLastActor: actor,
      },
      currentRevision,
      cleanup,
    };
  }
  
  function transitionTaskToUnderReview(store, { taskId, expectedRevision, actorPersonId, actor = 'agent' }) {
    const gate = requireAcceptedContributions(store, taskId, actorPersonId);
    if (!gate.ok) return gate;
    return updateTaskWithRevision(store, taskId, expectedRevision, (task) => {
      if (task.status !== 'in-progress') return null;
      const assignee = findPersonById(store, task.assigneeId);
      if (!assignee || assignee.kind !== 'agentic') return null;
      return {
        ...task,
        status: 'under-review',
        mcpLastActor: actor,
      };
    });
  }
  
  function moveTaskToStatus(store, {
    taskId,
    statusId,
    statusTitle,
    expectedRevision,
    actor = 'agent',
  }) {
    const target = findStatusColumnByReference(store, { statusId, statusTitle });
    if (!target) {
      return {
        ok: false,
        error: 'STATUS_NOT_FOUND',
        message: 'Target status/board not found.',
      };
    }
  
    const tasks = readTasks(store);
    const task = tasks.find(item => item && item.id === taskId) || null;
    const currentTask = normalizeTaskForMcp(task);
    if (!currentTask) {
      return {
        ok: false,
        error: 'TASK_NOT_FOUND',
        message: `Task "${taskId}" not found.`,
      };
    }
  
    const currentRevision = currentTask[revisionField] || 0;
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
        message: 'Task revision mismatch.',
        currentRevision,
        expectedRevision: expected,
      };
    }
  
    if (currentTask.status === target.id) {
      return { ok: true, changed: false, task: currentTask, currentRevision };
    }
  
    return updateTaskWithRevision(store, taskId, expectedRevision, (nextTask) => ({
      ...nextTask,
      status: target.id,
      mcpLastActor: actor,
    }));
  }
  
  function moveTaskToReadyForHumanReview(store, { taskId, expectedRevision, actorPersonId, actor = 'agent' }) {
    const gate = requireAcceptedContributions(store, taskId, actorPersonId);
    if (!gate.ok) return gate;
    const ensured = ensureReadyForHumanReviewStatusColumn(store);
    const result = moveTaskToStatus(store, {
      taskId,
      statusId: ensured.statusColumn.id,
      statusTitle: ensured.statusColumn.title,
      expectedRevision,
      actor,
    });
  
    return {
      ...result,
      statusCreated: ensured.created,
      statusId: ensured.statusColumn.id,
    };
  }
  
  function completeTaskAndRequestReview(store, {
    taskId,
    completion,
    expectedRevision,
    actorPersonId,
    actor = 'agent',
  }) {
    const completionText = sanitizeCompletionText(completion);
    if (!completionText) {
      return {
        ok: false,
        error: 'INVALID_COMPLETION',
        message: 'completion is required.',
      };
    }
    const gate = requireAcceptedContributions(store, taskId, actorPersonId);
    if (!gate.ok) return gate;
  
    const ensured = ensureReadyForHumanReviewStatusColumn(store);
    const result = updateTaskWithRevision(store, taskId, expectedRevision, (task) => ({
      ...task,
      notes: upsertCompletionSection(task.notes, completionText),
      status: ensured.statusColumn.id,
      mcpLastActor: actor,
    }));
  
    return {
      ...result,
      statusCreated: ensured.created,
      statusId: ensured.statusColumn.id,
    };
  }
  
  function assignTaskToPerson(store, {
    taskId,
    assigneeId,
    assigneeName,
    assigneeKind,
    expectedRevision,
    actor = 'agent',
  }) {
    const assignee = findPersonByReference(store, { assigneeId, assigneeName });
    if (!assignee) {
      return {
        ok: false,
        error: 'ASSIGNEE_NOT_FOUND',
        message: 'Assignee not found.',
      };
    }
  
    if (typeof assigneeKind === 'string' && assigneeKind.trim() && assignee.kind !== assigneeKind.trim()) {
      return {
        ok: false,
        error: 'ASSIGNEE_KIND_MISMATCH',
        message: 'Assignee kind does not match the selected person.',
      };
    }
  
    const tasks = readTasks(store);
    const task = tasks.find(item => item && item.id === taskId) || null;
    const currentTask = normalizeTaskForMcp(task);
    if (!currentTask) {
      return {
        ok: false,
        error: 'TASK_NOT_FOUND',
        message: `Task "${taskId}" not found.`,
      };
    }
  
    const currentRevision = currentTask[revisionField] || 0;
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
        message: 'Task revision mismatch.',
        currentRevision,
        expectedRevision: expected,
      };
    }
  
    if (currentTask.assigneeId === assignee.id) {
      return { ok: true, changed: false, task: currentTask, currentRevision };
    }

    let nextCollaboration;
    if (currentTask.collaboration) {
      const validation = collaborationService.validate(store, {
        ...currentTask.collaboration,
        orchestratorId: assignee.id,
      });
      if (!validation.ok) return validation;
      nextCollaboration = validation.collaboration;
    }
  
    return updateTaskWithRevision(store, taskId, expectedRevision, nextTask => ({
      ...nextTask,
      assigneeId: assignee.id,
      ...(nextCollaboration ? { collaboration: nextCollaboration } : {}),
      mcpLastActor: actor,
    }));
  }
  
  function updateTaskAgentSummary(store, { taskId, summary, expectedRevision, actor = 'agent' }) {
    const normalizedSummary = typeof summary === 'string' ? summary.trim() : '';
    if (!normalizedSummary) {
      return {
        ok: false,
        error: 'INVALID_SUMMARY',
        message: 'summary is required.',
      };
    }
    return updateTaskWithRevision(store, taskId, expectedRevision, (task) => ({
      ...task,
      agentSummary: normalizedSummary,
      agentSummaryUpdatedAt: new Date().toISOString(),
      mcpLastActor: actor,
    }));
  }
  
  function sanitizeTaskActivityMessage(message) {
    if (typeof message !== 'string') return '';
    const normalized = message.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > 400 ? `${normalized.slice(0, 400).trim()}...` : normalized;
  }
  
  function normalizeTaskActivityType(type) {
    const normalized = normalizeString(type).toLowerCase();
    if (normalized === 'comment') return 'comment';
    return 'activity';
  }
  
  function addTaskActivityEntry(store, {
    taskId,
    message,
    type = 'activity',
    expectedRevision,
    actor = 'agent',
  }) {
    const sanitizedMessage = sanitizeTaskActivityMessage(message);
    if (!sanitizedMessage) {
      return {
        ok: false,
        error: 'INVALID_ACTIVITY_MESSAGE',
        message: 'message is required.',
      };
    }
  
    return updateTaskWithRevision(store, taskId, expectedRevision, (task) => {
      const existingEntries = Array.isArray(task.activityLog) ? task.activityLog : [];
      const nextEntry = {
        id: `activity-${randomUUID()}`,
        type: normalizeTaskActivityType(type),
        message: sanitizedMessage,
        actor,
        createdAt: new Date().toISOString(),
      };
  
      return {
        ...task,
        activityLog: existingEntries.concat(nextEntry).slice(-activityLogMaxEntries),
        mcpLastActor: actor,
      };
    });
  }
  
  function addTaskComment(store, {
    taskId,
    comment,
    author = 'agent',
    expectedRevision,
    actor = 'agent',
  }) {
    const sanitizedComment = sanitizeTaskActivityMessage(comment);
    const sanitizedAuthor = normalizeString(author) || 'agent';
    if (!sanitizedComment) {
      return {
        ok: false,
        error: 'INVALID_COMMENT',
        message: 'comment is required.',
      };
    }
  
    return updateTaskWithRevision(store, taskId, expectedRevision, (task) => {
      const existingComments = Array.isArray(task.comments) ? task.comments : [];
      const nextComment = {
        id: `comment-${randomUUID()}`,
        author: sanitizedAuthor,
        content: sanitizedComment,
        createdAt: new Date().toISOString(),
      };
  
      return {
        ...task,
        comments: existingComments.concat(nextComment).slice(-activityLogMaxEntries),
        mcpLastActor: actor,
      };
    });
  }
  
  function sanitizeCompletionText(completion) {
    if (typeof completion !== 'string') return '';
    const normalized = completion.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > 240 ? `${normalized.slice(0, 240).trim()}...` : normalized;
  }
  
  function upsertCompletionSection(notes, completionText) {
    const startMarker = '<!-- MCP_COMPLETION_START -->';
    const endMarker = '<!-- MCP_COMPLETION_END -->';
    const currentNotes = typeof notes === 'string' ? notes : '';
    const escaped = currentNotes.replace(
      new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'g'),
      ''
    ).trim();
    const completionBlock = [
      startMarker,
      '### Agent Completion',
      `- ${completionText}`,
      endMarker,
    ].join('\n');
  
    if (!escaped) return completionBlock;
    return `${escaped}\n\n${completionBlock}`;
  }
  
  function updateTaskCompletionDescription(store, {
    taskId,
    completion,
    expectedRevision,
    actor = 'agent',
  }) {
    const completionText = sanitizeCompletionText(completion);
    if (!completionText) {
      return {
        ok: false,
        error: 'INVALID_COMPLETION',
        message: 'completion is required.',
      };
    }
  
    return updateTaskWithRevision(store, taskId, expectedRevision, (task) => ({
      ...task,
      notes: upsertCompletionSection(task.notes, completionText),
      mcpLastActor: actor,
    }));
  }
  
  function ensureRequiresHumanReviewStatusColumn(store) {
    const columns = readStatusColumns(store);
    const existing = columns.find(col => col && col.id === requiresHumanReviewStatusId);
    if (existing) {
      return { created: false, statusId: requiresHumanReviewStatusId };
    }
  
    const nextColumns = columns.concat({
      id: requiresHumanReviewStatusId,
      title: requiresHumanReviewStatusTitle,
      color: requiresHumanReviewStatusColor,
    });
    writeStatusColumns(store, nextColumns);
    return { created: true, statusId: requiresHumanReviewStatusId };
  }
  
  function isTaskCandidateForHumanReview(task, peopleById, includeDone) {
    if (!task || typeof task !== 'object') return false;
  
    const assignee = task.assigneeId ? peopleById.get(task.assigneeId) : null;
    const isAgentTask = Boolean(assignee && assignee.kind === 'agentic');
    const hasAgentSummary = typeof task.agentSummary === 'string' && task.agentSummary.trim().length > 0;
  
    if (!isAgentTask && !hasAgentSummary) return false;
    if (task.status === 'under-review') return true;
    if (includeDone && task.status === 'done') return true;
    return false;
  }
  
  function moveTasksToRequiresHumanReviewBoard(store, {
    actor = 'mcp-agent',
    taskIds,
    includeDone = false,
    expectedRevisions,
  } = {}) {
    const ensuredColumn = ensureRequiresHumanReviewStatusColumn(store);
    const tasks = readTasks(store);
    const people = readPeople(store);
    const peopleById = new Map(people.map(person => [person.id, person]));
    const expectedMap = expectedRevisions && typeof expectedRevisions === 'object' ? expectedRevisions : {};
    const taskIdFilter = Array.isArray(taskIds) && taskIds.length > 0 ? new Set(taskIds) : null;
  
    const movedTaskIds = [];
    const skipped = [];
  
    const nextTasks = tasks.map(rawTask => {
      const task = normalizeTaskForMcp(rawTask);
      if (!task || typeof task !== 'object') return rawTask;
      if (taskIdFilter && !taskIdFilter.has(task.id)) return rawTask;
  
      if (!isTaskCandidateForHumanReview(task, peopleById, includeDone)) {
        skipped.push({ taskId: task.id, reason: 'not_candidate' });
        return rawTask;
      }
  
      const expected = expectedMap && Object.prototype.hasOwnProperty.call(expectedMap, task.id)
        ? Number(expectedMap[task.id])
        : null;
      if (expected !== null) {
        const currentRevision = Number(task[revisionField] || 0);
        if (!Number.isFinite(expected) || Math.floor(expected) !== currentRevision) {
          skipped.push({
            taskId: task.id,
            reason: 'revision_mismatch',
            currentRevision,
            expectedRevision: expected,
          });
          return rawTask;
        }
      }
  
      if (task.status === requiresHumanReviewStatusId) {
        skipped.push({ taskId: task.id, reason: 'already_in_board' });
        return rawTask;
      }
  
      movedTaskIds.push(task.id);
      return {
        ...task,
        status: requiresHumanReviewStatusId,
        [revisionField]: Number(task[revisionField] || 0) + 1,
        mcpUpdatedAt: new Date().toISOString(),
        mcpLastActor: actor,
      };
    });
  
    if (movedTaskIds.length > 0) {
      writeTasks(store, nextTasks);
    }
  
    return {
      statusId: requiresHumanReviewStatusId,
      statusCreated: ensuredColumn.created,
      movedTaskIds,
      skipped,
      totalMoved: movedTaskIds.length,
    };
  }

  return {
    normalizeTask: normalizeTaskForMcp,
    listTasks,
    getTaskById,
    findProjectById,
    findProjectByReference,
    resolveProjectReferences,
    createTask,
    updateTaskDetails,
    updateTaskDescription,
    updateTaskCollaboration,
    attachTaskFile,
    removeTaskAttachment,
    logTaskTime,
    deleteTask,
    transitionTaskToUnderReview,
    moveTaskToStatus,
    moveTaskToReadyForHumanReview,
    completeTaskAndRequestReview,
    assignTaskToPerson,
    updateTaskAgentSummary,
    addTaskActivityEntry,
    addTaskComment,
    updateTaskCompletionDescription,
    moveTasksToRequiresHumanReviewBoard,
  };
}

module.exports = {
  createTaskService,
};
