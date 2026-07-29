const { randomUUID } = require('crypto');

const COMMANDS = new Set([
  'delegate',
  'handoff',
  'acknowledge',
  'start',
  'submit',
  'request-revision',
  'accept',
  'block',
  'unblock',
  'stop',
  'fail',
  'complete',
]);
const ORCHESTRATOR_ONLY = new Set(['delegate', 'handoff', 'request-revision', 'accept', 'unblock']);
const TERMINAL_ATTEMPT_STATES = new Set(['submitted', 'completed', 'stopped', 'failed']);
const MAX_HISTORY_LIMIT = 100;
const MAX_EVIDENCE_REFS = 50;

function createTaskCollaborationLifecycleService({
  getTaskById,
  updateTaskCollaboration,
  readAttempts,
  writeAttempts,
  readEvents,
  writeEvents,
  normalizeString,
  now = () => new Date().toISOString(),
}) {
  const required = { getTaskById, updateTaskCollaboration, readAttempts, writeAttempts, readEvents, writeEvents, normalizeString };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== 'function') throw new TypeError(`createTaskCollaborationLifecycleService requires ${name}.`);
  }

  function failure(error, message, details = {}) {
    return { ok: false, error, message, ...details };
  }

  function normalizeRefs(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map(item => normalizeString(item).slice(0, 512)).filter(Boolean))).slice(0, MAX_EVIDENCE_REFS);
  }

  function listHistory(store, { taskId, contributionId, limit } = {}) {
    const normalizedTaskId = normalizeString(taskId);
    if (!normalizedTaskId) return failure('TASK_ID_REQUIRED', 'taskId is required.');
    const task = getTaskById(store, normalizedTaskId);
    if (!task) return failure('TASK_NOT_FOUND', `Task "${normalizedTaskId}" not found.`);
    const normalizedContributionId = normalizeString(contributionId);
    const boundedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Math.min(MAX_HISTORY_LIMIT, Math.floor(Number(limit))))
      : 25;
    const matches = record => record?.taskId === normalizedTaskId
      && (!normalizedContributionId || record.contributionId === normalizedContributionId);
    const matchingEvents = readEvents(store).filter(matches);
    const taskRevision = Number(task.__mcpRevision || 0);
    const contributionById = new Map((task.collaboration?.contributions || []).map(item => [item.id, item]));
    const visibleEvents = matchingEvents.filter(event => (
      taskRevision >= Number(event.nextTaskRevision)
      && (
        contributionById.get(event.contributionId)?.lastLifecycleEventId === event.id
        || matchingEvents.some(later => later.contributionId === event.contributionId && later.baseTaskRevision >= event.nextTaskRevision)
      )
    ));
    const visibleAttemptIds = new Set(visibleEvents.map(event => event.attemptId).filter(Boolean));
    return {
      ok: true,
      task,
      attempts: readAttempts(store).filter(record => matches(record) && visibleAttemptIds.has(record.id)).slice(-boundedLimit),
      events: visibleEvents.slice(-boundedLimit),
    };
  }

  function transition(store, options = {}) {
    const taskId = normalizeString(options.taskId);
    const contributionId = normalizeString(options.contributionId);
    const command = normalizeString(options.command);
    const actorPersonId = normalizeString(options.actorPersonId);
    const idempotencyKey = normalizeString(options.idempotencyKey).slice(0, 160);
    if (!taskId) return failure('TASK_ID_REQUIRED', 'taskId is required.');
    if (!contributionId) return failure('CONTRIBUTION_ID_REQUIRED', 'contributionId is required.');
    if (!COMMANDS.has(command)) return failure('INVALID_CONTRIBUTION_COMMAND', `Unsupported contribution command "${command}".`);
    if (!actorPersonId) return failure('ACTOR_PERSON_ID_REQUIRED', 'actorPersonId is required.');
    if (!idempotencyKey) return failure('IDEMPOTENCY_KEY_REQUIRED', 'idempotencyKey is required.');

    const task = getTaskById(store, taskId);
    if (!task) return failure('TASK_NOT_FOUND', `Task "${taskId}" not found.`);
    if (!task.collaboration) return failure('COLLABORATION_NOT_FOUND', 'The task has no collaboration lifecycle.');
    const contribution = task.collaboration.contributions.find(item => item.id === contributionId);
    if (!contribution) return failure('CONTRIBUTION_NOT_FOUND', `Contribution "${contributionId}" not found.`);

    const events = readEvents(store);
    const existingEvent = events.find(event => event?.taskId === taskId && event.idempotencyKey === idempotencyKey);
    if (existingEvent && (
      existingEvent.command !== command
      || existingEvent.contributionId !== contributionId
      || existingEvent.actorPersonId !== actorPersonId
    )) {
      return failure('IDEMPOTENCY_CONFLICT', 'idempotencyKey was already used for a different lifecycle transition.');
    }
    const currentRevision = Number(task.__mcpRevision || 0);
    const supersededByLaterEvent = existingEvent && events.some(event => (
      event?.taskId === taskId
      && event.contributionId === contributionId
      && event.baseTaskRevision >= existingEvent.nextTaskRevision
    ));
    const existingEventApplied = existingEvent && (
      contribution.lastLifecycleEventId === existingEvent.id || supersededByLaterEvent
    );
    if (existingEventApplied) {
      const attempts = readAttempts(store);
      return {
        ok: true,
        idempotent: true,
        task,
        contribution: task.collaboration.contributions.find(item => item.id === contributionId),
        attempt: existingEvent.attemptId ? attempts.find(item => item.id === existingEvent.attemptId) : undefined,
        event: existingEvent,
      };
    }

    const expectedRevision = Number(options.expectedRevision);
    if (!Number.isFinite(expectedRevision)) {
      return failure('EXPECTED_REVISION_REQUIRED', 'expectedRevision is required and must be a finite number.', { currentRevision });
    }
    const expected = Math.max(0, Math.floor(expectedRevision));
    if (existingEvent && expected !== existingEvent.baseTaskRevision) {
      return failure('IDEMPOTENCY_CONFLICT', 'The retry revision does not match the original lifecycle command.');
    }
    if (!existingEvent && expected !== currentRevision) {
      return failure('REVISION_MISMATCH', 'Task revision mismatch.', {
        currentRevision,
        expectedRevision: expected,
      });
    }
    if (existingEvent && contribution.state !== existingEvent.previousState) {
      return failure('RECONCILIATION_CONFLICT', 'Contribution state changed before the interrupted lifecycle projection could be reconciled.');
    }

    const isOrchestrator = actorPersonId === task.collaboration.orchestratorId;
    const isContributor = actorPersonId === contribution.personId;
    if (ORCHESTRATOR_ONLY.has(command) ? !isOrchestrator : (!isOrchestrator && !isContributor)) {
      return failure('CONTRIBUTION_TRANSITION_FORBIDDEN', 'The actor is not allowed to perform this contribution transition.');
    }

    const attempts = readAttempts(store);
    const taskAttempts = attempts.filter(item => item?.taskId === taskId && item.contributionId === contributionId);
    const requestedAttemptId = normalizeString(options.attemptId);
    const attempt = requestedAttemptId
      ? taskAttempts.find(item => item.id === requestedAttemptId)
      : taskAttempts.find(item => item.id === contribution.latestAttemptId) || taskAttempts.at(-1);
    const timestamp = now();
    let nextState = contribution.state;
    let nextAttempt = attempt;
    let eventType;
    const evidenceRefs = normalizeRefs(options.evidenceRefs);

    if (existingEvent) {
      nextAttempt = existingEvent.attemptId
        ? attempts.find(item => item.id === existingEvent.attemptId)
        : undefined;
      const recoveredEvidenceRefs = existingEvent.command === 'submit'
        ? Array.from(new Set([...(contribution.evidenceRefs || []), ...(existingEvent.evidenceRefs || [])])).slice(0, MAX_EVIDENCE_REFS)
        : contribution.evidenceRefs;
      const recoveredContribution = {
        ...contribution,
        state: existingEvent.nextState,
        latestAttemptId: nextAttempt?.id || contribution.latestAttemptId,
        evidenceRefs: recoveredEvidenceRefs,
        lastLifecycleEventId: existingEvent.id,
        updatedAt: timestamp,
      };
      const recovered = updateTaskCollaboration(store, {
        taskId,
        expectedRevision: currentRevision,
        collaboration: {
          ...task.collaboration,
          contributions: task.collaboration.contributions.map(item => item.id === contributionId ? recoveredContribution : item),
        },
        actor: actorPersonId,
        allowIneligibleExistingContributionIds: new Set([contributionId]),
      });
      if (!recovered.ok) return recovered;
      return {
        ok: true,
        idempotent: true,
        task: recovered.task,
        contribution: recovered.task.collaboration.contributions.find(item => item.id === contributionId),
        attempt: nextAttempt,
        event: existingEvent,
      };
    }

    switch (command) {
      case 'delegate':
        if (contribution.state !== 'pending') return failure('INVALID_CONTRIBUTION_TRANSITION', 'Only pending work can be delegated.');
        eventType = 'delegation';
        break;
      case 'handoff': {
        if (!['pending', 'revision-requested'].includes(contribution.state)) {
          return failure('INVALID_CONTRIBUTION_TRANSITION', 'Handoff requires pending or revision-requested work.');
        }
        const attemptId = `attempt-${randomUUID()}`;
        nextAttempt = {
          schemaVersion: 1,
          id: attemptId,
          taskId,
          contributionId,
          ordinal: taskAttempts.length + 1,
          state: 'handed-off',
          idempotencyKey,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        eventType = 'external-handoff';
        break;
      }
      case 'acknowledge':
        if (!attempt || attempt.state !== 'handed-off') return failure('INVALID_ATTEMPT_TRANSITION', 'Acknowledgement requires a handed-off attempt.');
        nextAttempt = { ...attempt, state: 'acknowledged', updatedAt: timestamp };
        nextState = 'working';
        eventType = 'runtime-acknowledgement';
        break;
      case 'start':
        if (!attempt || !['handed-off', 'acknowledged'].includes(attempt.state)) return failure('INVALID_ATTEMPT_TRANSITION', 'Starting work requires a handed-off or acknowledged attempt.');
        nextAttempt = { ...attempt, state: 'working', updatedAt: timestamp };
        nextState = 'working';
        eventType = 'work-started';
        break;
      case 'submit':
        if (contribution.state !== 'working' || !attempt || !['acknowledged', 'working'].includes(attempt.state)) {
          return failure('INVALID_CONTRIBUTION_TRANSITION', 'Submission requires acknowledged working contribution work.');
        }
        if (evidenceRefs.length === 0) return failure('EVIDENCE_REQUIRED', 'Submission requires at least one evidence reference.');
        nextAttempt = { ...attempt, state: 'submitted', updatedAt: timestamp };
        nextState = 'submitted';
        eventType = 'submission';
        break;
      case 'request-revision':
        if (contribution.state !== 'submitted') return failure('INVALID_CONTRIBUTION_TRANSITION', 'Revision can be requested only for submitted work.');
        nextState = 'revision-requested';
        eventType = 'revision-requested';
        break;
      case 'accept':
        if (contribution.state !== 'submitted') return failure('INVALID_CONTRIBUTION_TRANSITION', 'Only submitted work can be accepted.');
        nextState = 'accepted';
        eventType = 'accepted';
        break;
      case 'block':
        if (!['pending', 'working', 'revision-requested'].includes(contribution.state)) {
          return failure('INVALID_CONTRIBUTION_TRANSITION', 'Only pending or active work can be blocked.');
        }
        if (!normalizeString(options.blockerRef)) return failure('BLOCKER_REF_REQUIRED', 'blockerRef is required when blocking contribution work.');
        nextState = 'blocked';
        eventType = 'blocked';
        break;
      case 'unblock':
        if (contribution.state !== 'blocked') return failure('INVALID_CONTRIBUTION_TRANSITION', 'Only blocked work can be recovered.');
        nextState = 'working';
        eventType = 'unblocked';
        break;
      case 'stop':
      case 'fail':
      case 'complete': {
        if (!attempt || TERMINAL_ATTEMPT_STATES.has(attempt.state)) {
          return failure('INVALID_ATTEMPT_TRANSITION', 'Attempt is missing or already terminal.');
        }
        const attemptState = command === 'stop' ? 'stopped' : command === 'fail' ? 'failed' : 'completed';
        nextAttempt = { ...attempt, state: attemptState, updatedAt: timestamp };
        eventType = attemptState;
        break;
      }
      default:
        return failure('INVALID_CONTRIBUTION_COMMAND', `Unsupported contribution command "${command}".`);
    }

    const event = {
      schemaVersion: 1,
      id: `collaboration-event-${randomUUID()}`,
      idempotencyKey,
      taskId,
      contributionId,
      attemptId: nextAttempt?.id,
      actorPersonId,
      command,
      type: eventType,
      previousState: contribution.state,
      nextState,
      baseTaskRevision: currentRevision,
      nextTaskRevision: currentRevision + 1,
      outcome: 'applied',
      evidenceCount: command === 'submit' ? evidenceRefs.length : undefined,
      evidenceRefs: command === 'submit' ? evidenceRefs : undefined,
      blockerRef: command === 'block' ? normalizeString(options.blockerRef).slice(0, 240) : undefined,
      occurredAt: timestamp,
    };
    const nextEvidenceRefs = command === 'submit'
      ? Array.from(new Set([...(contribution.evidenceRefs || []), ...evidenceRefs])).slice(0, MAX_EVIDENCE_REFS)
      : contribution.evidenceRefs;
    const nextContribution = {
      ...contribution,
      state: nextState,
      latestAttemptId: nextAttempt?.id || contribution.latestAttemptId,
      evidenceRefs: nextEvidenceRefs,
      lastLifecycleEventId: event.id,
      updatedAt: timestamp,
    };
    const nextCollaboration = {
      ...task.collaboration,
      contributions: task.collaboration.contributions.map(item => item.id === contributionId ? nextContribution : item),
    };

    if (nextAttempt) {
      const nextAttempts = attempts.filter(item => item.id !== nextAttempt.id).concat(nextAttempt);
      writeAttempts(store, nextAttempts);
    }
    writeEvents(store, events.concat(event));

    const updated = updateTaskCollaboration(store, {
      taskId,
      expectedRevision: currentRevision,
      collaboration: nextCollaboration,
      actor: actorPersonId,
      allowIneligibleExistingContributionIds: new Set([contributionId]),
    });
    if (!updated.ok) return updated;
    return {
      ok: true,
      idempotent: false,
      task: updated.task,
      contribution: updated.task.collaboration.contributions.find(item => item.id === contributionId),
      attempt: nextAttempt,
      event,
    };
  }

  return { listHistory, transition };
}

module.exports = {
  createTaskCollaborationLifecycleService,
};
