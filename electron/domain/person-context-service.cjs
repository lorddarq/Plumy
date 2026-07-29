function createPersonContextService({
  agentInstructionsBoundaryNote,
  buildAgentInstructionsFieldSemantics,
  buildContentBoundary,
  getTaskById,
  listTasks,
  normalizeName,
  normalizeString,
  readPeople,
}) {
  const requiredFunctions = {
    buildAgentInstructionsFieldSemantics,
    buildContentBoundary,
    getTaskById,
    listTasks,
    normalizeName,
    normalizeString,
    readPeople,
  };
  for (const [name, value] of Object.entries(requiredFunctions)) {
    if (typeof value !== "function") throw new TypeError(`createPersonContextService requires ${name}.`);
  }
  if (typeof agentInstructionsBoundaryNote !== "string" || !agentInstructionsBoundaryNote) {
    throw new TypeError("createPersonContextService requires agentInstructionsBoundaryNote.");
  }

  function normalizePersonForMcp(person) {
    if (!person || typeof person !== 'object') return person;
    const kind = person.kind === 'agentic' ? 'agentic' : 'human';
    const agentInstructions = kind === 'agentic'
      ? normalizeString(person.agentInstructions).trim()
      : '';
    const agentOperationalInstructions = kind === 'agentic'
      ? normalizeString(person.agentOperationalInstructions).trim()
      : '';
  
    return {
      ...person,
      kind,
      availableForSubagentDelegation: kind === 'agentic' && person.availableForSubagentDelegation === true,
      agentInstructions: agentInstructions || undefined,
      agentOperationalInstructions: agentOperationalInstructions || undefined,
    };
  }
  function buildTaskExecutionContextFailure(code, message, validation = {}, task = null, { canStart = false } = {}) {
    return {
      ok: false,
      canStart,
      fallback: canStart,
      mode: canStart ? 'standard-agentic' : 'blocked',
      error: code,
      message,
      userNotice: canStart
        ? 'Unable to retrieve or use the assigned agent or instructions; reverting to standard agentic operation.'
        : message,
      task,
      assignee: null,
      context: null,
      validation: {
        taskFound: Boolean(task),
        taskAssigned: false,
        assigneeFound: false,
        assigneeAgentic: false,
        agentInstructionsPresent: false,
        agentOperationalInstructionsPresent: false,
        ...validation,
      },
      source: {
        task: 'tasks.get',
        assignee: 'exact-id',
        resource: 'omvra://agents/{personId}/assigned',
      },
    };
  }
  
  function resolveTaskExecutionContext(store, taskId) {
    const normalizedTaskId = normalizeString(taskId);
    if (!normalizedTaskId) {
      return buildTaskExecutionContextFailure('TASK_ID_REQUIRED', 'A taskId is required for execution preflight.');
    }
  
    const task = getTaskById(store, normalizedTaskId);
    if (!task) {
      return buildTaskExecutionContextFailure(
        'TASK_NOT_FOUND',
        `Task "${normalizedTaskId}" was not found. Execution cannot start.`
      );
    }
  
    const assigneeId = normalizeString(task.assigneeId);
    if (!assigneeId) {
      return buildTaskExecutionContextFailure(
        'TASK_UNASSIGNED',
        `Task "${normalizedTaskId}" is unassigned. Continue using standard agentic operation.`,
        { taskAssigned: false },
        task,
        { canStart: true }
      );
    }
  
    const person = findPersonById(store, assigneeId);
    if (!person) {
      return buildTaskExecutionContextFailure(
        'ASSIGNEE_NOT_FOUND',
        `Assignee "${assigneeId}" for task "${normalizedTaskId}" was not found. Continue using standard agentic operation.`,
        { taskAssigned: true },
        task,
        { canStart: true }
      );
    }
  
    if (person.kind !== 'agentic') {
      return buildTaskExecutionContextFailure(
        'ASSIGNEE_NOT_AGENTIC',
        `Assignee "${assigneeId}" is not agentic. Continue using standard agentic operation.`,
        { taskAssigned: true, assigneeFound: true },
        task,
        { canStart: true }
      );
    }
  
    const assignee = normalizePersonForMcp(person);
    const agentInstructions = normalizeString(assignee.agentInstructions);
    const agentOperationalInstructions = normalizeString(assignee.agentOperationalInstructions);
    const agentInstructionsPresent = Boolean(agentInstructions);
    const agentOperationalInstructionsPresent = Boolean(agentOperationalInstructions);
  
    if (!agentInstructionsPresent || !agentOperationalInstructionsPresent) {
      return buildTaskExecutionContextFailure(
        'ASSIGNEE_CONTEXT_INCOMPLETE',
        `Assignee "${assigneeId}" is missing required agentInstructions and/or agentOperationalInstructions. Continue using standard agentic operation.`,
        {
          taskAssigned: true,
          assigneeFound: true,
          assigneeAgentic: true,
          agentInstructionsPresent,
          agentOperationalInstructionsPresent,
        },
        task,
        { canStart: true }
      );
    }
  
    return {
      ok: true,
      canStart: true,
      fallback: false,
      mode: 'assigned-persona',
      error: null,
      message: 'Execution preflight passed. The exact task assignee and required agent context were resolved.',
      task,
      assignee,
      context: {
        agentInstructions,
        agentOperationalInstructions,
      },
      validation: {
        taskFound: true,
        taskAssigned: true,
        assigneeFound: true,
        assigneeAgentic: true,
        agentInstructionsPresent: true,
        agentOperationalInstructionsPresent: true,
      },
      source: {
        task: 'tasks.get',
        assignee: 'exact-id',
        resource: 'omvra://agents/{personId}/assigned',
      },
    };
  }
  
  function summarizeAssignedTasks(tasks) {
    const byStatus = {};
    const byProjectId = {};
  
    for (const task of tasks) {
      if (!task || typeof task !== 'object') continue;
      const statusKey = normalizeString(task.status) || 'unknown';
      byStatus[statusKey] = (byStatus[statusKey] || 0) + 1;
  
      const projectIds = Array.isArray(task.projectIds) ? task.projectIds : [];
      if (projectIds.length === 0 && task.swimlaneId) {
        const laneKey = normalizeString(task.swimlaneId);
        if (laneKey) {
          byProjectId[laneKey] = (byProjectId[laneKey] || 0) + 1;
        }
        continue;
      }
  
      for (const projectId of projectIds) {
        const key = normalizeString(projectId);
        if (!key) continue;
        byProjectId[key] = (byProjectId[key] || 0) + 1;
      }
    }
  
    return {
      totalTasks: tasks.length,
      byStatus,
      byProjectId,
    };
  }
  
  function listAssignedWorkForAgent(store, {
    personId,
    personName,
    status,
    projectId,
    search,
  } = {}) {
    const person = findPersonByReference(store, {
      assigneeId: personId,
      assigneeName: personName,
    });
  
    if (!person) {
      return {
        ok: false,
        error: 'PERSON_NOT_FOUND',
        message: 'Assigned person not found.',
      };
    }
  
    if (person.kind !== 'agentic') {
      return {
        ok: false,
        error: 'PERSON_NOT_AGENTIC',
        message: 'Assigned person is not an agentic persona.',
      };
    }
  
    const filters = {
      assigneeId: person.id,
      status: normalizeString(status),
      projectId: normalizeString(projectId),
      search: normalizeString(search),
    };
  
    const tasks = listTasks(store, filters);
    const summary = summarizeAssignedTasks(tasks);
  
    return {
      ok: true,
      contentBoundary: buildContentBoundary('workspace-data', agentInstructionsBoundaryNote),
      fieldSemantics: buildAgentInstructionsFieldSemantics(),
      person: {
        id: person.id,
        name: person.name,
        role: person.role,
        kind: person.kind,
        agentInstructions: normalizeString(person.agentInstructions).trim() || undefined,
        agentOperationalInstructions: normalizeString(person.agentOperationalInstructions).trim() || undefined,
      },
      filters: {
        status: filters.status || null,
        projectId: filters.projectId || null,
        search: filters.search || null,
      },
      summary,
      tasks,
    };
  }
  function findPersonById(store, personId) {
    if (!personId) return null;
    const people = readPeople(store);
    return people.find(person => person && person.id === personId) || null;
  }
  
  function findPersonByName(store, personName) {
    const normalized = normalizeName(personName);
    if (!normalized) return null;
    const people = readPeople(store);
    return people.find(person => person && normalizeName(person.name) === normalized) || null;
  }
  
  function findPersonByReference(store, { assigneeId, assigneeName }) {
    if (typeof assigneeId === 'string' && assigneeId.trim()) {
      const person = findPersonById(store, assigneeId.trim());
      if (person) return person;
    }
  
    if (typeof assigneeName === 'string' && assigneeName.trim()) {
      return findPersonByName(store, assigneeName);
    }
  
    return null;
  }

  return {
    normalizePerson: normalizePersonForMcp,
    findPersonById,
    findPersonByName,
    findPersonByReference,
    resolveTaskExecutionContext,
    listAssignedWorkForAgent,
  };
}

module.exports = {
  createPersonContextService,
};
