const {
  getMcpCapabilityProfile,
  buildMcpAuditSummary,
  getWorkspaceSnapshot,
  listGoals,
  getGoalById,
  updateGoal,
  updateGoalProjectBindings,
  updateGoalElement,
  updateGoalArtifactReferences,
  listMilestones,
  getMilestoneById,
  listTasks,
  getTaskById,
  getTaskCollaborationHistory,
  listTaskContextEntries,
  getTaskContextEntry,
  appendTaskContextEntry,
  resolveTaskExecutionContext,
  listAssignedWorkForAgent,
  listKanbanCards,
  listTimelineCards,
  createTask,
  updateTaskDetails,
  updateTaskDescription,
  updateTaskCollaboration,
  transitionTaskContribution,
  attachTaskFile,
  removeTaskAttachment,
  deleteTask,
  logTaskTime,
  createMilestone,
  updateMilestone,
  linkMilestoneTasks,
  deleteMilestone,
  transitionTaskToUnderReview,
  updateTaskAgentSummary,
  addTaskComment,
  addTaskActivityEntry,
  updateTaskCompletionDescription,
  completeTaskAndRequestReview,
  moveTasksToRequiresHumanReviewBoard,
  moveTaskToStatus,
  moveTaskToReadyForHumanReview,
  assignTaskToPerson,
} = require('./workspace-service.cjs');
const { listAvailableSkills, getAvailableSkill } = require('./skill-service.cjs');
const { createGoalLifecycleService } = require('./goal-lifecycle-service.cjs');
const { toCanonicalToolName, isKnownWriteToolName } = require('./mcp-registry.cjs');
const {
  JSON_RPC_ERROR,
  createJsonRpcError,
  makeToolResult,
  makeWriteToolResult,
  normalizeObject,
  invalidParams,
} = require('./mcp-response.cjs');
const { recordWriteAttempt } = require('./mcp-audit-adapter.cjs');

function parseTaskId(args) {
  const normalized = normalizeObject(args);
  if (typeof normalized.id === 'string' && normalized.id.trim()) {
    return normalized.id.trim();
  }
  if (typeof normalized.taskId === 'string' && normalized.taskId.trim()) {
    return normalized.taskId.trim();
  }
  return null;
}

function parseMilestoneId(args) {
  const normalized = normalizeObject(args);
  if (typeof normalized.id === 'string' && normalized.id.trim()) {
    return normalized.id.trim();
  }
  if (typeof normalized.milestoneId === 'string' && normalized.milestoneId.trim()) {
    return normalized.milestoneId.trim();
  }
  return null;
}

function parseGoalId(args) {
  const normalized = normalizeObject(args);
  if (typeof normalized.id === 'string' && normalized.id.trim()) {
    return normalized.id.trim();
  }
  if (typeof normalized.goalId === 'string' && normalized.goalId.trim()) {
    return normalized.goalId.trim();
  }
  return null;
}

function getToolCallPayload(params) {
  const normalized = normalizeObject(params);
  const name = typeof normalized.name === 'string' ? normalized.name.trim() : '';

  if (!name) {
    return {
      error: invalidParams('Invalid params: "name" is required for tools/call.'),
    };
  }

  if (normalized.arguments !== undefined
    && (!normalized.arguments || typeof normalized.arguments !== 'object' || Array.isArray(normalized.arguments))) {
    return {
      error: invalidParams('Invalid params: "arguments" must be an object when provided.'),
    };
  }

  return {
    name: toCanonicalToolName(name),
    args: normalizeObject(normalized.arguments),
  };
}

function handleToolCall(store, req, params, { skillsRoot, userSkillsRoot, emitRuntimeChange } = {}) {
  const payload = getToolCallPayload(params);
  if (payload.error) {
    return { error: payload.error };
  }

  const { name, args } = payload;

  if (isKnownWriteToolName(name)) {
    const profile = getMcpCapabilityProfile(store);
    const writeToolsEnabled = profile === 'task_write' || profile === 'admin';
    if (!writeToolsEnabled) {
      recordWriteAttempt(store, req, {
        outcome: 'denied',
        reason: 'write_tools_unavailable',
        capabilityProfile: profile,
        toolName: name,
      });

      return {
        error: createJsonRpcError(
          JSON_RPC_ERROR.MCP_WRITE_FORBIDDEN,
          `Write tool "${name}" is not available. MCP is currently read-only by default.`,
          {
            capabilityProfile: profile,
            allowedProfiles: ['task_write', 'admin'],
            writeToolsEnabled,
          }
        ),
      };
    }
  }

  switch (name) {
    case 'workspace.get_snapshot':
      return { result: makeToolResult(getWorkspaceSnapshot(store)) };

    case 'tasks.list': {
      const tasks = listTasks(store, args);
      const hasFilters = ['status', 'assigneeId', 'projectId', 'search'].some(key => typeof args[key] === 'string' && args[key].trim());
      return {
        result: makeToolResult(tasks, {
          resultText: tasks.length > 0 || !hasFilters
            ? undefined
            : 'Not found: no tasks matched the supplied filters.',
        }),
      };
    }

    case 'goals.list':
      return { result: makeToolResult(listGoals(store)) };

    case 'diagnostics.audit_summary':
      return { result: makeToolResult(buildMcpAuditSummary(store, args)) };

    case 'tasks.get': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return {
          error: invalidParams('Invalid params: "id" (or "taskId") is required for tasks.get.'),
        };
      }
      const task = getTaskById(store, taskId);
      if (!task) return { result: makeToolResult(null) };
      const resolved = resolveTaskExecutionContext(store, taskId, { skillsRoot, userDataPath: userSkillsRoot });
      const { task: _resolvedTask, ...executionContext } = resolved;
      return {
        result: makeToolResult(
          { ...task, executionContext },
          { resultText: resolved.executionContract?.text }
        ),
      };
    }

    case 'tasks.context.list': {
      const result = listTaskContextEntries(store, args);
      if (!result.ok) return { error: invalidParams(result.message, result) };
      return { result: makeToolResult(result) };
    }

    case 'tasks.context.get': {
      const result = getTaskContextEntry(store, args);
      if (!result.ok) return { error: invalidParams(result.message, result) };
      return { result: makeToolResult(result) };
    }

    case 'tasks.collaboration_history': {
      const taskId = parseTaskId(args);
      if (!taskId) return { error: invalidParams('Invalid params: "taskId" is required.') };
      const result = getTaskCollaborationHistory(store, {
        taskId,
        contributionId: args.contributionId,
        limit: args.limit,
      });
      if (!result.ok) return { error: invalidParams(result.message, result) };
      return { result: makeToolResult(result) };
    }

    case 'agent.resolve_task_context': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return {
          error: invalidParams('Invalid params: "taskId" is required for agent.resolve_task_context.'),
        };
      }
      const preflight = resolveTaskExecutionContext(store, taskId, { skillsRoot, userDataPath: userSkillsRoot });
      return {
        result: makeToolResult(preflight, {
          isError: !preflight.canStart,
          resultText: preflight.executionContract?.text,
        }),
      };
    }

    case 'cards.kanban.list': {
      const filters = {
        status: args.statusId,
        assigneeId: args.assigneeId,
        search: args.search,
      };
      return { result: makeToolResult(listKanbanCards(store, filters)) };
    }

    case 'cards.timeline.list':
      return { result: makeToolResult(listTimelineCards(store, args)) };

    case 'milestones.list':
      return { result: makeToolResult(listMilestones(store)) };

    case 'milestones.get': {
      const milestoneId = parseMilestoneId(args);
      if (!milestoneId) {
        return {
          error: invalidParams('Invalid params: "id" (or "milestoneId") is required for milestones.get.'),
        };
      }
      return { result: makeToolResult(getMilestoneById(store, milestoneId)) };
    }

    case 'goals.get': {
      const goalId = parseGoalId(args);
      if (!goalId) {
        return {
          error: invalidParams('Invalid params: "id" (or "goalId") is required for goals.get.'),
        };
      }
      return { result: makeToolResult(getGoalById(store, goalId)) };
    }

    case 'goals.lifecycle': {
      const goalId = parseGoalId(args);
      if (!goalId) return { error: invalidParams('Invalid params: "goalId" (or "id") is required.') };
      const actor = args.actor || 'mcp-agent';
      const lifecycle = createGoalLifecycleService({ store, onRuntimeChange: emitRuntimeChange, skillsRoot, userDataPath: userSkillsRoot });
      const result = lifecycle.execute({
        goalId,
        command: args.command,
        expectedRevision: args.expectedRevision,
        idempotencyKey: args.idempotencyKey,
        commandId: args.commandId,
        actor,
        payload: args.payload,
      });
      if (!result.ok) {
        if (typeof emitRuntimeChange === 'function') emitRuntimeChange({ scope: result.error === 'RECONCILIATION_REQUIRED' ? 'reconciliation' : 'conflict', goalId, revision: result.currentRevision || result.currentRevision === 0 ? result.currentRevision : 0, actor, changeType: 'lifecycle.rejected', errorCode: result.error, details: { command: args.command } });
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          entityId: goalId,
          command: args.command,
          actor,
          expectedRevision: args.expectedRevision,
          currentRevision: result.currentRevision,
          executionId: result.execution?.id,
          executionState: result.execution?.state,
          executionRevision: result.execution?.revision,
          contractRevision: result.contractRevision,
          contractHash: result.contractHash,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        entityId: goalId,
        command: args.command,
        actor,
        expectedRevision: args.expectedRevision,
        nextRevision: result.execution?.revision,
        currentRevision: result.execution?.revision,
        executionId: result.execution?.id,
        executionState: result.execution?.state,
        executionRevision: result.execution?.revision,
        goalRevision: result.execution?.goalRevision,
        attempt: result.execution?.attempt,
        contractRevision: result.execution?.contractPacket?.contractRevision,
        contractHash: result.execution?.contractPacket?.contractHash,
        idempotent: result.idempotent === true,
      });
      const handoff = result.event?.payload?.handoffRecord;
      return {
        result: makeWriteToolResult(name, {
          changed: !result.idempotent,
          idempotent: result.idempotent === true,
          auditId: audit?.auditId,
          execution: result.execution,
          event: result.event,
          cleanup: result.cleanup,
          artifactReferences: handoff?.producedArtifactReferences,
          revision: result.execution?.revision,
        }),
      };
    }

    case 'goals.gc': {
      const goalId = parseGoalId(args);
      const lifecycle = createGoalLifecycleService({ store, onRuntimeChange: emitRuntimeChange, skillsRoot, userDataPath: userSkillsRoot });
      const result = lifecycle.collectStaleExecutions({
        goalId,
        maxAgeMs: args.maxAgeMs,
        apply: args.apply === true,
        humanConfirmed: args.humanConfirmed === true,
        actor: args.actor || 'mcp-agent',
      });
      if (!result.ok) return { error: invalidParams(result.message, result) };
      return { result: makeToolResult(result) };
    }

    case 'skills.list':
      return { result: makeToolResult(listAvailableSkills({ skillsRoot, userDataPath: userSkillsRoot })) };

    case 'skills.get': {
      const skillId = typeof args.skillId === 'string' ? args.skillId.trim() : '';
      if (!skillId) return { error: invalidParams('Invalid params: "skillId" is required for skills.get.') };
      const skill = getAvailableSkill(skillId, { skillsRoot, userDataPath: userSkillsRoot });
      if (!skill) return { error: invalidParams(`Bundled skill "${skillId}" was not found.`) };
      return { result: makeToolResult(skill) };
    }

    case 'goals.update': {
      const goalId = parseGoalId(args);
      if (!goalId) return { error: invalidParams('Invalid params: "goalId" (or "id") is required.') };
      const result = updateGoal(store, {
        goalId,
        title: args.title,
        elements: args.elements,
        inputs: args.inputs,
        capabilities: args.capabilities,
        projectBindings: args.projectBindings,
        overseerAgentId: args.overseerAgentId,
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
        humanConfirmed: args.humanConfirmed === true,
        emitRuntimeChange,
      });
      if (!result.ok) {
        if (typeof emitRuntimeChange === 'function') emitRuntimeChange({ scope: 'conflict', goalId, revision: result.currentRevision || 0, actor: 'mcp-agent', changeType: 'graph.rejected', errorCode: result.error, details: { fields: Object.keys(args).filter(key => key !== 'expectedRevision') } });
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          entityId: goalId,
          fields: Object.keys(args).filter(key => key !== 'expectedRevision'),
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        entityId: goalId,
        fields: Object.keys(args).filter(key => key !== 'expectedRevision'),
        nextRevision: result.revision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          goal: result.goal,
          revision: result.revision,
        }),
      };
    }

    case 'goals.update_project_bindings': {
      const goalId = parseGoalId(args);
      if (!goalId) return { error: invalidParams('Invalid params: "goalId" (or "id") is required.') };
      const result = updateGoalProjectBindings(store, {
        goalId,
        projectBindings: args.projectBindings,
        expectedRevision: args.expectedRevision,
        idempotencyKey: args.idempotencyKey,
        actor: 'mcp-agent',
        humanConfirmed: args.humanConfirmed === true,
        emitRuntimeChange,
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, { outcome: 'denied', reason: result.error, toolName: name, entityId: goalId });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, { outcome: 'allowed', toolName: name, entityId: goalId, fields: ['projectBindings'], nextRevision: result.revision });
      return { result: makeWriteToolResult(name, { changed: result.changed, idempotent: result.idempotent === true, auditId: audit?.auditId, goal: result.goal, revision: result.revision, bindingAudit: result.audit }) };
    }

    case 'goals.update_element':
    case 'goals.update_connector': {
      const goalId = parseGoalId(args);
      const elementId = typeof args.elementId === 'string' ? args.elementId : args.connectorId;
      if (!goalId) return { error: invalidParams('Invalid params: "goalId" (or "id") is required.') };
      const result = updateGoalElement(store, {
        goalId,
        elementId,
        updates: args.updates,
        expectedRevision: args.expectedRevision,
        idempotencyKey: args.idempotencyKey,
        connectorOnly: name === 'goals.update_connector',
        actor: 'mcp-agent',
        humanConfirmed: args.humanConfirmed === true,
        emitRuntimeChange,
      });
      if (!result.ok) {
        if (typeof emitRuntimeChange === 'function') emitRuntimeChange({ scope: 'conflict', goalId, revision: result.currentRevision || 0, actor: 'mcp-agent', changeType: 'element.rejected', errorCode: result.error, details: { elementId } });
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          entityId: goalId,
          fields: Object.keys(args).filter(key => !['expectedRevision', 'idempotencyKey', 'updates'].includes(key)),
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        entityId: goalId,
        fields: Object.keys(args).filter(key => !['expectedRevision', 'idempotencyKey', 'updates'].includes(key)),
        nextRevision: result.revision,
        idempotent: result.idempotent === true,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: result.changed,
          idempotent: result.idempotent === true,
          auditId: audit?.auditId,
          goal: result.goal,
          revision: result.revision,
        }),
      };
    }

    case 'goals.update_artifacts': {
      const goalId = parseGoalId(args);
      if (!goalId) return { error: invalidParams('Invalid params: "goalId" (or "id") is required.') };
      const result = updateGoalArtifactReferences(store, {
        goalId,
        elementId: args.elementId,
        artifactReferences: args.artifactReferences,
        expectedRevision: args.expectedRevision,
        idempotencyKey: args.idempotencyKey,
        actor: 'mcp-agent',
        humanConfirmed: args.humanConfirmed === true,
        emitRuntimeChange,
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, { outcome: 'denied', reason: result.error, toolName: name, entityId: goalId });
        return { error: invalidParams(result.message, result) };
      }
      if (result.idempotent) {
        return {
          result: makeWriteToolResult(name, {
            changed: false,
            idempotent: true,
            artifactAuditId: result.audit?.id,
            goal: result.goal,
            revision: result.revision,
          }),
        };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        entityId: goalId,
        fields: ['artifactReferences'],
        nextRevision: result.revision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          artifactAuditId: result.audit?.id,
          goal: result.goal,
          revision: result.revision,
        }),
      };
    }

    case 'tasks.context.append': {
      const taskId = parseTaskId(args);
      if (!taskId) return { error: invalidParams('Invalid params: "taskId" is required.') };
      const task = getTaskById(store, taskId);
      const currentRevision = Number.isInteger(Number(task?.__mcpRevision)) ? Number(task.__mcpRevision) : 0;
      const result = appendTaskContextEntry(store, {
        ...args,
        taskId,
        fromRevision: args.fromRevision ?? currentRevision,
        toRevision: args.toRevision ?? currentRevision,
        sourceRefs: Array.isArray(args.sourceRefs) && args.sourceRefs.length > 0
          ? args.sourceRefs
          : [{ type: 'task-change', id: `${taskId}@${currentRevision}` }],
        provenance: 'agent-authored',
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        entryId: result.entry.id,
        kind: result.entry.kind,
        provenance: result.entry.provenance,
        fromRevision: result.entry.fromRevision,
        toRevision: result.entry.toRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: !result.idempotent,
          idempotent: result.idempotent,
          auditId: audit?.auditId,
          entry: result.entry,
          currentRevision: result.currentRevision,
        }),
      };
    }

    case 'tasks.create_follow_up': {
      const parentTaskId = typeof args.parentTaskId === 'string' ? args.parentTaskId.trim() : '';
      const parent = getTaskById(store, parentTaskId);
      if (!parent) return { error: invalidParams('Invalid params: "parentTaskId" must identify an existing task.') };
      const result = createTask(store, {
        title: args.title,
        notes: args.notes,
        statusId: args.statusId,
        statusTitle: args.statusTitle,
        assigneeId: args.assigneeId,
        assigneeName: args.assigneeName,
        assigneeKind: args.assigneeKind,
        projectIds: Array.isArray(args.projectIds) ? args.projectIds : parent.projectIds,
        swimlaneId: args.swimlaneId || parent.swimlaneId,
        startDate: args.startDate,
        endDate: args.endDate,
        size: args.size,
        complexity: args.complexity,
        priority: args.priority,
        parentTaskId,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, { outcome: 'denied', reason: result.error, toolName: name, parentTaskId, title: args.title });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId: result.task?.id,
        parentTaskId,
        title: result.task?.title,
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          parentTaskId,
          task: result.task,
          revision: result.task?.__mcpRevision,
        }),
      };
    }

    case 'task_write':
    case 'tasks.create': {
      const result = createTask(store, {
        title: args.title,
        notes: args.notes,
        statusId: args.statusId,
        statusTitle: args.statusTitle,
        assigneeId: args.assigneeId,
        assigneeName: args.assigneeName,
        assigneeKind: args.assigneeKind,
        projectId: args.projectId,
        projectIds: args.projectIds,
        swimlaneId: args.swimlaneId,
        milestoneId: args.milestoneId,
        dependencyIds: args.dependencyIds,
        startDate: args.startDate,
        endDate: args.endDate,
        size: args.size,
        complexity: args.complexity,
        priority: args.priority,
        blocked: args.blocked,
        swimlaneOnly: args.swimlaneOnly,
        timeSpentMinutes: args.timeSpentMinutes,
        timeSpentNote: args.timeSpentNote,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          title: args.title,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId: result.task?.id,
        title: result.task?.title,
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision,
        }),
      };
    }

    case 'tasks.update': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }
      const result = updateTaskDetails(store, {
        ...args,
        taskId,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
          fields: Object.keys(args).filter(key => key !== 'expectedRevision'),
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        fields: Object.keys(args).filter(key => key !== 'expectedRevision'),
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision,
        }),
      };
    }

    case 'tasks.update_description': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }
      const result = updateTaskDescription(store, {
        taskId,
        notes: args.notes,
        description: args.description,
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
          fields: Object.keys(args).filter(key => key !== 'expectedRevision'),
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        fields: Object.keys(args).filter(key => key !== 'expectedRevision'),
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision,
        }),
      };
    }

    case 'tasks.update_collaboration': {
      const taskId = parseTaskId(args);
      if (!taskId) return { error: invalidParams('Invalid params: "taskId" is required.') };
      const result = updateTaskCollaboration(store, {
        taskId,
        collaboration: args.collaboration,
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        orchestratorId: result.task?.collaboration?.orchestratorId,
        contributionIds: result.task?.collaboration?.contributions?.map(item => item.id),
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          collaborationSchemaVersion: result.task?.collaboration?.schemaVersion,
          task: result.task,
          revision: result.task?.__mcpRevision,
        }),
      };
    }

    case 'tasks.transition_contribution': {
      const taskId = parseTaskId(args);
      if (!taskId) return { error: invalidParams('Invalid params: "taskId" is required.') };
      const result = transitionTaskContribution(store, {
        taskId,
        contributionId: args.contributionId,
        command: args.command,
        actorPersonId: args.actorPersonId,
        expectedRevision: args.expectedRevision,
        idempotencyKey: args.idempotencyKey,
        attemptId: args.attemptId,
        evidenceRefs: args.evidenceRefs,
        blockerRef: args.blockerRef,
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
          contributionId: args.contributionId,
          command: args.command,
          actor: args.actorPersonId,
          expectedRevision: args.expectedRevision,
          currentRevision: result.currentRevision,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        contributionId: result.contribution?.id,
        attemptId: result.attempt?.id,
        command: args.command,
        actor: args.actorPersonId,
        previousState: result.event?.previousState,
        nextState: result.event?.nextState,
        eventType: result.event?.type,
        nextRevision: result.task?.__mcpRevision,
        idempotent: result.idempotent,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: !result.idempotent,
          auditId: audit?.auditId,
          idempotent: result.idempotent,
          task: result.task,
          contribution: result.contribution,
          attempt: result.attempt,
          event: result.event,
          revision: result.task?.__mcpRevision,
        }),
      };
    }

    case 'tasks.attach_file': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }
      const result = attachTaskFile(store, {
        ...args,
        taskId,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
          attachmentReference: args.uri || args.fileUri || args.url || args.path || args.filePath || null,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        attachmentId: result.attachment?.id,
        attachmentPath: result.attachment?.path,
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: result.changed !== false,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision,
          result: {
            attachment: result.attachment,
          },
        }),
      };
    }

    case 'tasks.remove_attachment': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }
      const result = removeTaskAttachment(store, {
        ...args,
        taskId,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
          attachmentId: args.attachmentId,
          attachmentReference: args.uri || args.fileUri || args.url || args.path || args.filePath || null,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        attachmentId: result.removedAttachment?.id,
        attachmentPath: result.removedAttachment?.path,
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision,
          result: {
            removedAttachment: result.removedAttachment,
          },
        }),
      };
    }

    case 'tasks.delete': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }
      const result = deleteTask(store, {
        taskId,
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        deletedTaskId: result.deletedTaskId,
        revision: result.currentRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          task: result.task,
          deletedTaskId: result.deletedTaskId,
          revision: result.currentRevision,
          result: {
            cleanup: result.cleanup,
          },
        }),
      };
    }

    case 'tasks.log_time': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }
      const result = logTaskTime(store, {
        taskId,
        minutes: args.minutes,
        note: args.note,
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        minutes: args.minutes,
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision,
        }),
      };
    }

    case 'milestones.create': {
      const result = createMilestone(store, {
        title: args.title,
        projectId: args.projectId,
        projectIds: args.projectIds,
        startDate: args.startDate,
        endDate: args.endDate,
        notes: args.notes,
        description: args.description,
        color: args.color,
        linkedTaskIds: args.linkedTaskIds,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          title: args.title,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        milestoneId: result.milestone?.id,
        title: result.milestone?.title,
        linkedTaskIds: result.linkedTaskIds,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          result,
        }),
      };
    }

    case 'milestones.update': {
      const milestoneId = parseMilestoneId(args);
      if (!milestoneId) {
        return { error: invalidParams('Invalid params: "milestoneId" is required.') };
      }
      const result = updateMilestone(store, {
        ...args,
        milestoneId,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          milestoneId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        milestoneId: result.milestone?.id,
        linkedTaskIds: result.linkedTaskIds,
        nextRevision: result.milestone?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          result,
          revision: result.milestone?.__mcpRevision,
        }),
      };
    }

    case 'milestones.link_tasks': {
      const milestoneId = parseMilestoneId(args);
      if (!milestoneId) {
        return { error: invalidParams('Invalid params: "milestoneId" is required.') };
      }
      const result = linkMilestoneTasks(store, {
        milestoneId,
        taskIds: args.taskIds,
        dependencyUpdates: args.dependencyUpdates,
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          milestoneId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        milestoneId: result.milestone?.id,
        linkedTaskIds: result.linkedTaskIds,
        changedTaskIds: result.changedTaskIds,
        nextRevision: result.milestone?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: result.changed,
          auditId: audit?.auditId,
          result,
          revision: result.milestone?.__mcpRevision,
        }),
      };
    }

    case 'milestones.delete': {
      const milestoneId = parseMilestoneId(args);
      if (!milestoneId) {
        return { error: invalidParams('Invalid params: "milestoneId" is required.') };
      }
      const result = deleteMilestone(store, {
        milestoneId,
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          milestoneId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        milestoneId: result.deletedMilestoneId,
        revision: result.currentRevision,
        cleanup: result.cleanup,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          result,
          revision: result.currentRevision,
        }),
      };
    }

    case 'tasks.transition_under_review': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }
      const result = transitionTaskToUnderReview(store, {
        taskId,
        expectedRevision: args.expectedRevision,
        actorPersonId: args.actorPersonId,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision,
        }),
      };
    }

    case 'tasks.update_agent_summary': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }
      const result = updateTaskAgentSummary(store, {
        taskId,
        summary: args.summary,
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision,
        }),
      };
    }

    case 'tasks.add_comment': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }
      const result = addTaskComment(store, {
        taskId,
        comment: args.comment,
        author: args.author || 'mcp-agent',
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision,
        }),
      };
    }

    case 'tasks.add_activity_entry': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }
      const result = addTaskActivityEntry(store, {
        taskId,
        message: args.message,
        type: args.type,
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision,
        }),
      };
    }

    case 'tasks.move_to_requires_human_review': {
      const result = moveTasksToRequiresHumanReviewBoard(store, {
        actor: 'mcp-agent',
        taskIds: Array.isArray(args.taskIds) ? args.taskIds : undefined,
        includeDone: Boolean(args.includeDone),
        expectedRevisions: args.expectedRevisions,
      });
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        movedTaskIds: result.movedTaskIds,
        skipped: result.skipped,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: result.totalMoved > 0,
          auditId: audit?.auditId,
          result,
          statusId: result.statusId,
          statusCreated: result.statusCreated,
        }),
      };
    }

    case 'tasks.update_completion_description': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }
      const result = updateTaskCompletionDescription(store, {
        taskId,
        completion: args.completion,
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        nextRevision: result.task?.__mcpRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: true,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision,
        }),
      };
    }

    case 'tasks.complete_and_request_review': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }
      const result = completeTaskAndRequestReview(store, {
        taskId,
        completion: args.completion,
        expectedRevision: args.expectedRevision,
        actorPersonId: args.actorPersonId,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        targetStatusId: result.statusId,
        nextRevision: result.task?.__mcpRevision ?? result.currentRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: result.changed !== false,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision ?? result.currentRevision,
          statusId: result.statusId,
          statusCreated: result.statusCreated,
        }),
      };
    }

    case 'tasks.move_to_status': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }

      const result = moveTaskToStatus(store, {
        taskId,
        statusId: args.statusId,
        statusTitle: args.statusTitle,
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
          targetStatusId: args.statusId,
          targetStatusTitle: args.statusTitle,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        targetStatusId: args.statusId,
        targetStatusTitle: args.statusTitle,
        nextRevision: result.task?.__mcpRevision ?? result.currentRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: result.changed !== false,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision ?? result.currentRevision,
        }),
      };
    }

    case 'tasks.move_to_ready_for_human_review': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }

      const result = moveTaskToReadyForHumanReview(store, {
        taskId,
        expectedRevision: args.expectedRevision,
        actorPersonId: args.actorPersonId,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        targetStatusId: result.statusId,
        nextRevision: result.task?.__mcpRevision ?? result.currentRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: result.changed !== false,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision ?? result.currentRevision,
          statusId: result.statusId,
          statusCreated: result.statusCreated,
        }),
      };
    }

    case 'tasks.assign': {
      const taskId = parseTaskId(args);
      if (!taskId) {
        return { error: invalidParams('Invalid params: "taskId" is required.') };
      }

      const result = assignTaskToPerson(store, {
        taskId,
        assigneeId: args.assigneeId,
        assigneeName: args.assigneeName,
        assigneeKind: args.assigneeKind,
        expectedRevision: args.expectedRevision,
        actor: 'mcp-agent',
      });
      if (!result.ok) {
        recordWriteAttempt(store, req, {
          outcome: 'denied',
          reason: result.error,
          toolName: name,
          taskId,
          assigneeId: args.assigneeId,
          assigneeName: args.assigneeName,
        });
        return { error: invalidParams(result.message, result) };
      }
      const audit = recordWriteAttempt(store, req, {
        outcome: 'allowed',
        toolName: name,
        taskId,
        assigneeId: args.assigneeId,
        assigneeName: args.assigneeName,
        nextRevision: result.task?.__mcpRevision ?? result.currentRevision,
      });
      return {
        result: makeWriteToolResult(name, {
          changed: result.changed !== false,
          auditId: audit?.auditId,
          task: result.task,
          revision: result.task?.__mcpRevision ?? result.currentRevision,
        }),
      };
    }

    default:
      return {
        error: invalidParams(`Unknown tool "${name}".`),
      };
  }
}

module.exports = {
  getToolCallPayload,
  handleToolCall,
};
