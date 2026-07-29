const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');

const RUNTIME_EVENTS_KEY = 'omvra.goalRuntimeEvents.v1';
const GOALS_KEY = 'omvra.goals.v1';
const EXECUTIONS_KEY = 'omvra.goalExecutions.v1';
const POLICY_KEY = 'omvra.goalPolicy.v1';
const POLICY_IMPACTS_KEY = 'omvra.goalPolicyImpacts.v1';
const RECONCILIATIONS_KEY = 'omvra.goalReconciliations.v1';
const HANDOFFS_KEY = 'omvra.goalHandoffs.v1';
const SCHEDULE_OCCURRENCES_KEY = 'omvra.goalScheduleOccurrences.v1';
const PEOPLE_KEY = 'omvra.people.v1';
const RUNTIME_SCOPES = new Set(['graph', 'execution', 'policy', 'conflict', 'reconciliation', 'schedule']);

function readArray(store, key) {
  const value = store.get(key);
  return Array.isArray(value) ? value : [];
}

function revision(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function normalizeRuntimeChange(input = {}) {
  const scope = RUNTIME_SCOPES.has(input.scope) ? input.scope : 'reconciliation';
  const goalId = typeof input.goalId === 'string' ? input.goalId.trim() : '';
  if (!goalId) throw new TypeError('goalId is required for a Goal runtime event.');
  if (typeof input.changeType !== 'string' || !input.changeType.trim()) throw new TypeError('changeType is required for a Goal runtime event.');
  return {
    eventId: typeof input.eventId === 'string' && input.eventId.trim() ? input.eventId : `goal-runtime_${randomUUID()}`,
    scope,
    goalId,
    revision: revision(input.revision),
    actor: typeof input.actor === 'string' && input.actor.trim() ? input.actor.trim() : 'runtime',
    changeType: input.changeType.trim(),
    occurredAt: typeof input.occurredAt === 'string' && input.occurredAt.trim() ? input.occurredAt : new Date().toISOString(),
    ...(typeof input.errorCode === 'string' && input.errorCode.trim() ? { errorCode: input.errorCode.trim() } : {}),
    ...(input.details && typeof input.details === 'object' && !Array.isArray(input.details) ? { details: { ...input.details } } : {}),
  };
}

function createGoalRuntimeService({ store, now = () => new Date().toISOString() } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') throw new TypeError('A synchronous store with get/set methods is required.');
  const emitter = new EventEmitter();

  function emit(change) {
    const event = normalizeRuntimeChange({ ...change, occurredAt: change.occurredAt || now() });
    const events = readArray(store, RUNTIME_EVENTS_KEY);
    store.set(RUNTIME_EVENTS_KEY, events.concat(event).slice(-500));
    emitter.emit('changed', event);
    return event;
  }

  function get(goalId) {
    const goal = readArray(store, GOALS_KEY).find(item => item?.id === goalId) || null;
    const latestExecution = readArray(store, EXECUTIONS_KEY).findLast(item => item?.goalId === goalId) || null;
    const execution = latestExecution?.resetAt ? null : latestExecution;
    const people = readArray(store, PEOPLE_KEY);
    const agentAvailability = (goal?.elements || [])
      .filter(element => element?.type === 'agent')
      .map(element => {
        const assigneeId = element.agentConfiguration?.assigneeId || element.assigneeId;
        const available = element.agentConfiguration?.mode === 'ephemeral'
          ? Boolean(element.agentConfiguration?.requestedName || element.agentConfiguration?.autoGenerateName)
          : people.some(person => person?.id === assigneeId && person.kind === 'agentic');
        return { elementId: element.id, assigneeId: assigneeId || null, available, errorCode: available ? null : 'AGENT_UNAVAILABLE' };
      });
    return {
      goal,
      execution,
      effectivePolicy: execution?.effectivePolicy || store.get(POLICY_KEY) || null,
      policyRevision: execution?.policyRevision || execution?.effectivePolicy?.sourceRevision || 0,
      executionAttempt: execution?.attempt || execution?.contractPacket?.executionAttempt || null,
      executionAttemptId: execution?.executionAttemptId || execution?.id || null,
      agentAvailability,
      policyImpacts: readArray(store, POLICY_IMPACTS_KEY).filter(item => item?.goalId === goalId),
      reconciliations: readArray(store, RECONCILIATIONS_KEY).filter(item => item?.goalId === goalId),
      handoffs: readArray(store, HANDOFFS_KEY).filter(item => item?.goalId === goalId),
      scheduleOccurrences: readArray(store, SCHEDULE_OCCURRENCES_KEY).filter(item => item?.goalId === goalId),
      lastChange: readArray(store, RUNTIME_EVENTS_KEY).filter(item => item?.goalId === goalId).at(-1) || null,
    };
  }

  return {
    emit,
    get,
    onChanged(listener) {
      if (typeof listener !== 'function') return () => {};
      emitter.on('changed', listener);
      return () => emitter.off('changed', listener);
    },
    keys: { RUNTIME_EVENTS_KEY, GOALS_KEY, EXECUTIONS_KEY, POLICY_KEY, POLICY_IMPACTS_KEY, RECONCILIATIONS_KEY, HANDOFFS_KEY, SCHEDULE_OCCURRENCES_KEY },
  };
}

module.exports = { RUNTIME_EVENTS_KEY, HANDOFFS_KEY, RUNTIME_SCOPES: [...RUNTIME_SCOPES], normalizeRuntimeChange, createGoalRuntimeService };
