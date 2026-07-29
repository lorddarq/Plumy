const crypto = require('node:crypto');

const TERMINAL_ATTEMPT_STATES = new Set(['submitted', 'completed', 'stopped', 'failed']);
const MAX_REQUIRED_CAPABILITIES = 20;

function createAgentExecutionPreflightService({
  getTaskById,
  listTasks,
  readAttempts,
  readObservations,
  resolveRuntimeProfile,
  resolveTaskContext,
  startContributionAttempt,
  normalizeString,
}) {
  const required = { getTaskById, listTasks, readAttempts, readObservations, resolveRuntimeProfile, resolveTaskContext, startContributionAttempt, normalizeString };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== 'function') throw new TypeError(`createAgentExecutionPreflightService requires ${name}.`);
  }

  const issue = (code, message, details = {}) => ({ code, message, ...details });
  const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

  function prepare(store, input = {}) {
    const taskId = normalizeString(input.taskId);
    const contributionId = normalizeString(input.contributionId);
    const blockers = [];
    const warnings = [];
    if (!taskId) return { ok: false, canStart: false, blockers: [issue('TASK_ID_REQUIRED', 'taskId is required.')], warnings };

    const task = getTaskById(store, taskId);
    if (!task) return { ok: false, canStart: false, blockers: [issue('TASK_NOT_FOUND', `Task "${taskId}" was not found.`)], warnings };
    const taskRevision = Number(task.__mcpRevision || 0);
    if (task.archived === true) blockers.push(issue('TASK_ARCHIVED', 'Archived work cannot start a runtime session.'));

    const context = resolveTaskContext(store, taskId);
    if (!context.canStart) blockers.push(issue(context.error || 'TASK_CONTEXT_UNAVAILABLE', context.message || 'Task context is unavailable.'));
    else if (!context.ok) warnings.push(issue(context.error || 'TASK_CONTEXT_FALLBACK', context.message || 'Assigned persona context is unavailable; standard operation will be used.'));

    const allTasks = listTasks(store);
    const taskById = new Map(allTasks.map(item => [item.id, item]));
    const dependencies = (Array.isArray(task.dependencyIds) ? task.dependencyIds : []).map((dependencyId) => {
      const dependency = taskById.get(dependencyId);
      const eligible = dependency?.status === 'done';
      if (!eligible) blockers.push(issue('TASK_DEPENDENCY_INELIGIBLE', `Dependency "${dependencyId}" is not complete.`, { dependencyId }));
      return { taskId: dependencyId, status: dependency?.status || 'missing', eligible };
    });

    let contribution = null;
    if (contributionId) {
      contribution = task.collaboration?.contributions?.find(item => item.id === contributionId) || null;
      if (!contribution) blockers.push(issue('CONTRIBUTION_NOT_FOUND', `Contribution "${contributionId}" was not found on this task.`));
      else if (!['pending', 'revision-requested'].includes(contribution.state)) {
        blockers.push(issue('CONTRIBUTION_NOT_STARTABLE', `Contribution "${contributionId}" is ${contribution.state}.`));
      }
    }

    const activeAttempt = contributionId
      ? readAttempts(store).find(item => item?.taskId === taskId && item.contributionId === contributionId && !TERMINAL_ATTEMPT_STATES.has(item.state))
      : null;
    if (activeAttempt) blockers.push(issue('ACP_EXECUTION_ALREADY_ACTIVE', 'An execution attempt is already active for this contribution.', { executionAttemptId: activeAttempt.id }));

    const projectId = normalizeString(input.projectId)
      || (Array.isArray(task.projectIds) ? normalizeString(task.projectIds[0]) : '')
      || normalizeString(task.swimlaneId);
    const runtime = resolveRuntimeProfile(store, {
      executionProfileId: normalizeString(input.executionProfileId) || undefined,
      projectId: projectId || undefined,
    });
    if (!runtime.ok) blockers.push(issue(
      runtime.state === 'missing' ? 'ACP_RUNTIME_NOT_CONFIGURED' : runtime.state === 'incompatible' ? 'ACP_PROTOCOL_INCOMPATIBLE' : 'ACP_RUNTIME_UNAVAILABLE',
      runtime.error || 'The selected runtime is unavailable.'
    ));

    const profile = runtime.profile || null;
    if (profile?.integrationMode === 'external-handoff') {
      blockers.push(issue('ACP_CAPABILITY_UNSUPPORTED', 'The selected profile supports external handoff, not a managed runtime session.'));
    }
    const observation = profile ? readObservations(store)[profile.id] || null : null;
    if (profile && !observation && input.deferConnection !== true) blockers.push(issue('ACP_RUNTIME_UNVERIFIED', 'Test the selected runtime connection before starting work.'));
    if (observation && observation.availability !== 'available') blockers.push(issue('ACP_RUNTIME_UNAVAILABLE', 'The selected runtime is not currently available.'));
    if (observation?.authentication === 'required') blockers.push(issue('ACP_AUTHENTICATION_REQUIRED', 'The selected runtime requires provider-managed sign-in.'));

    const requiredCapabilities = Array.from(new Set((Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : [])
      .map(normalizeString).filter(Boolean))).slice(0, MAX_REQUIRED_CAPABILITIES);
    for (const capability of requiredCapabilities) {
      if (observation?.agentCapabilities?.[capability] !== true) {
        blockers.push(issue('ACP_CAPABILITY_UNSUPPORTED', `Required capability "${capability}" is not supported.`, { capability }));
      }
    }
    if (input.requireScopedMcp === true && input.scopedMcpAvailable !== true) {
      blockers.push(issue('ACP_MCP_GRANT_FAILED', 'A scoped MCP grant is required but unavailable.'));
    }
    if (input.budgetAllowed === false) blockers.push(issue('ACP_BUDGET_EXCEEDED', 'The applicable execution budget does not permit this start.'));
    if (input.permissionsAllowed === false) blockers.push(issue('ACP_PERMISSION_DENIED', 'The execution permission policy does not permit this start.'));

    const requestedModel = normalizeString(input.requestedModel) || null;
    const personaModel = normalizeString(context.assignee?.modelPreference || context.assignee?.preferredModel) || null;
    const advertisedModels = Array.isArray(observation?.models) ? observation.models : [];
    let effectiveModel = observation?.modelOrMode || null;
    if (requestedModel) {
      const supported = advertisedModels.some(model => [model?.id, model?.model].includes(requestedModel));
      if (advertisedModels.length && !supported) blockers.push(issue('ACP_MODEL_UNSUPPORTED', `Requested model "${requestedModel}" is not advertised by the selected runtime.`));
      else if (!advertisedModels.length) warnings.push(issue('ACP_MODEL_UNVERIFIED', 'The runtime did not advertise a model list; the requested model will be verified at session configuration.'));
      effectiveModel = requestedModel;
    } else if (personaModel) {
      const supported = advertisedModels.some(model => [model?.id, model?.model].includes(personaModel));
      if (supported) effectiveModel = personaModel;
      else warnings.push(issue('ACP_PERSONA_MODEL_UNAVAILABLE', `Persona model preference "${personaModel}" is not advertised; the runtime default remains effective.`));
    }

    const snapshot = {
      schemaVersion: 1,
      taskId,
      taskRevision,
      contributionId: contribution?.id || null,
      contributorPersonId: contribution?.personId || null,
      contributionRole: contribution?.role || (task.collaboration ? 'orchestrator' : 'direct-assignee'),
      contributionScope: contribution?.scope || null,
      assigneeId: task.assigneeId || null,
      projectId: projectId || null,
      dependencyRevisions: dependencies.map(item => ({ taskId: item.taskId, status: item.status })),
      runtimeProfileId: profile?.id || null,
      runtimeResolutionSource: runtime.source || null,
      integrationMode: profile?.integrationMode || null,
      requestedModel,
      personaModelPreference: personaModel,
      effectiveModel,
      requiredCapabilities,
      runtimeObservation: observation ? {
        observedAt: observation.observedAt || null,
        authentication: observation.authentication || 'unknown',
        capabilityIds: Object.entries(observation.agentCapabilities || {}).filter(([, supported]) => supported === true).map(([id]) => id).sort(),
      } : null,
      policyRevision: Number.isFinite(Number(input.policyRevision)) ? Math.max(0, Math.floor(Number(input.policyRevision))) : null,
      requireScopedMcp: input.requireScopedMcp === true,
      scopedMcpAvailable: input.scopedMcpAvailable === true,
      budgetAllowed: input.budgetAllowed !== false,
      permissionsAllowed: input.permissionsAllowed !== false,
      contextEntryIds: [context.taskContext?.latestCheckpoint, ...(context.taskContext?.entriesSinceCheckpoint || []), ...(context.taskContext?.recentHistory || [])]
        .filter(Boolean).map(entry => entry.id).slice(0, 12),
    };
    return {
      ok: blockers.length === 0,
      canStart: blockers.length === 0,
      phases: { preparation: 'complete', connection: observation ? 'observed' : 'required', negotiation: observation ? 'observed' : 'required', firstTurn: 'not-started' },
      blockers,
      warnings,
      runtime: profile ? { profileId: profile.id, name: profile.name, source: runtime.source, integrationMode: profile.integrationMode } : null,
      model: { requested: requestedModel, effective: effectiveModel },
      context,
      contractSnapshot: snapshot,
      contractDigest: hash(snapshot),
    };
  }

  function confirmStart(store, input = {}) {
    if (input.confirmed !== true) {
      return { ok: false, canStart: false, blockers: [issue('ACP_START_CONFIRMATION_REQUIRED', 'Explicit confirmation is required before creating an execution attempt.')], warnings: [] };
    }
    const expectedRevision = Number(input.expectedRevision);
    if (!Number.isFinite(expectedRevision)) {
      return { ok: false, canStart: false, blockers: [issue('EXPECTED_REVISION_REQUIRED', 'expectedRevision is required.')], warnings: [] };
    }
    const prepared = prepare(store, input);
    if (!prepared.canStart) return prepared;
    if (prepared.contractSnapshot.taskRevision !== Math.max(0, Math.floor(expectedRevision))) {
      return { ...prepared, ok: false, canStart: false, blockers: [issue('REVISION_MISMATCH', 'Task changed after execution preparation.')], stale: true };
    }
    if (input.expectedContractDigest && input.expectedContractDigest !== prepared.contractDigest) {
      return { ...prepared, ok: false, canStart: false, blockers: [issue('ACP_PREFLIGHT_STALE', 'Execution conditions changed after preparation.')], stale: true };
    }
    if (!prepared.contractSnapshot.contributionId) {
      return { ...prepared, ok: true, canStart: true, directExecution: true, attempt: null };
    }
    const started = startContributionAttempt(store, {
      taskId: prepared.contractSnapshot.taskId,
      contributionId: prepared.contractSnapshot.contributionId,
      actorPersonId: normalizeString(input.actorPersonId),
      expectedRevision: prepared.contractSnapshot.taskRevision,
      idempotencyKey: normalizeString(input.idempotencyKey),
      command: 'handoff',
      executionContract: prepared.contractSnapshot,
      executionContractDigest: prepared.contractDigest,
    });
    if (!started.ok) return { ...prepared, ok: false, canStart: false, blockers: [issue(started.error, started.message || 'The execution attempt could not be created.')], startResult: started };
    return { ...prepared, ok: true, canStart: true, attempt: started.attempt, task: started.task, idempotent: started.idempotent };
  }

  return { prepare, confirmStart };
}

module.exports = { createAgentExecutionPreflightService };
