const {
  getWorkspaceSnapshot,
  buildMcpAgentGuide,
  buildMcpTaskExecutionSchema,
  listMilestones,
  getMilestoneById,
  listGoals,
  getGoalById,
  getTaskById,
  listAssignedWorkForAgent,
  listTasks,
  listKanbanCards,
  listTimelineCards,
} = require('./workspace-service.cjs');
const { normalizeObject, invalidParams } = require('./mcp-response.cjs');

function getResourceForUri(store, uri, requestParams) {
  if (uri === 'omvra://workspace') {
    return { uri, data: getWorkspaceSnapshot(store) };
  }

  if (uri === 'omvra://agent/guide') {
    return { uri, data: buildMcpAgentGuide() };
  }

  if (uri === 'omvra://schema/task-execution') {
    return { uri, data: buildMcpTaskExecutionSchema() };
  }

  if (uri === 'omvra://milestones') {
    return { uri, data: listMilestones(store) };
  }

  if (uri === 'omvra://goals') {
    return { uri, data: listGoals(store) };
  }

  if (uri === 'omvra://tasks/{taskId}'
    || uri === 'omvra://milestones/{milestoneId}'
    || uri === 'omvra://goals/{goalId}'
    || uri === 'omvra://agents/{personId}/assigned'
    || uri === 'omvra://projects/{projectId}/tasks'
    || uri === 'omvra://boards/{statusId}/tasks') {
    return {
      error: invalidParams(`Resource URI "${uri}" is a template. Use resources/templates/list and substitute the path parameter before calling resources/read.`, { uri }),
    };
  }

  if (uri.startsWith('omvra://tasks/')) {
    const taskId = decodeURIComponent(uri.slice('omvra://tasks/'.length));
    if (!taskId) {
      return {
        error: invalidParams('Invalid params: task resource URI must include task id.', { uri }),
      };
    }
    return { uri, data: getTaskById(store, taskId) };
  }

  if (uri.startsWith('omvra://milestones/')) {
    const milestoneId = decodeURIComponent(uri.slice('omvra://milestones/'.length));
    if (!milestoneId) {
      return {
        error: invalidParams('Invalid params: milestone resource URI must include milestone id.', { uri }),
      };
    }
    return { uri, data: getMilestoneById(store, milestoneId) };
  }

  if (uri.startsWith('omvra://goals/')) {
    const goalId = decodeURIComponent(uri.slice('omvra://goals/'.length));
    if (!goalId) {
      return {
        error: invalidParams('Invalid params: goal resource URI must include goal id.', { uri }),
      };
    }
    return { uri, data: getGoalById(store, goalId) };
  }

  if (uri.startsWith('omvra://agents/') && uri.endsWith('/assigned')) {
    const personId = decodeURIComponent(uri.slice('omvra://agents/'.length, -'/assigned'.length));
    if (!personId) {
      return {
        error: invalidParams('Invalid params: agent resource URI must include person id.', { uri }),
      };
    }
    const filters = normalizeObject(requestParams);
    const payload = listAssignedWorkForAgent(store, {
      personId,
      search: filters.search,
      status: filters.status,
      projectId: filters.projectId,
    });
    if (!payload.ok) {
      return { error: invalidParams(payload.message, payload) };
    }
    return {
      uri,
      data: payload,
    };
  }

  if (uri.startsWith('omvra://projects/') && uri.endsWith('/tasks')) {
    const projectId = decodeURIComponent(uri.slice('omvra://projects/'.length, -'/tasks'.length));
    if (!projectId) {
      return {
        error: invalidParams('Invalid params: project resource URI must include project id.', { uri }),
      };
    }
    const filters = normalizeObject(requestParams);
    return {
      uri,
      data: listTasks(store, {
        projectId,
        search: filters.search,
        assigneeId: filters.assigneeId,
        status: filters.status,
      }),
    };
  }

  if (uri.startsWith('omvra://boards/') && uri.endsWith('/tasks')) {
    const statusId = decodeURIComponent(uri.slice('omvra://boards/'.length, -'/tasks'.length));
    if (!statusId) {
      return {
        error: invalidParams('Invalid params: board resource URI must include status id.', { uri }),
      };
    }
    const filters = normalizeObject(requestParams);
    return {
      uri,
      data: listTasks(store, {
        status: statusId,
        search: filters.search,
        assigneeId: filters.assigneeId,
        projectId: filters.projectId,
      }),
    };
  }

  if (uri.startsWith('omvra://cards/kanban')) {
    const filters = normalizeObject(requestParams);
    const payload = listKanbanCards(store, {
      status: filters.statusId,
      assigneeId: filters.assigneeId,
      search: filters.search,
    });
    return { uri: 'omvra://cards/kanban', data: payload };
  }

  if (uri.startsWith('omvra://cards/timeline')) {
    const filters = normalizeObject(requestParams);
    const payload = listTimelineCards(store, filters);
    return { uri: 'omvra://cards/timeline', data: payload };
  }

  return {
    error: invalidParams(`Unsupported resource URI "${uri}".`, {
      supported: ['omvra://workspace', 'omvra://tasks/{taskId}', 'omvra://milestones', 'omvra://milestones/{milestoneId}', 'omvra://cards/kanban', 'omvra://cards/timeline'],
    }),
  };
}

module.exports = { getResourceForUri };
