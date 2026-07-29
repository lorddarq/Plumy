const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoalRuntimeService, RUNTIME_EVENTS_KEY } = require('./goal-runtime-service.cjs');

function store(seed = {}) { const data = new Map(Object.entries(seed)); return { get: key => data.get(key), set: (key, value) => data.set(key, value) }; }

test('runtime changes are typed, durable, and scoped to a joined read model', () => {
  const db = store({ 'omvra.goals.v1': [{ id: 'goal-1', revision: 4 }], 'omvra.goalExecutions.v1': [{ goalId: 'goal-1', revision: 2, effectivePolicy: { policyRevision: 7 } }] });
  const runtime = createGoalRuntimeService({ store: db, now: () => '2026-07-20T00:00:00.000Z' });
  let received;
  runtime.onChanged(event => { received = event; });
  const event = runtime.emit({ scope: 'graph', goalId: 'goal-1', revision: 5, actor: 'renderer', changeType: 'graph.updated' });
  assert.equal(event.eventId, received.eventId);
  assert.equal(event.occurredAt, '2026-07-20T00:00:00.000Z');
  assert.equal(db.get(RUNTIME_EVENTS_KEY).length, 1);
  assert.equal(runtime.get('goal-1').execution.effectivePolicy.policyRevision, 7);
});

test('reset executions remain historical but disappear from the current runtime projection', () => {
  const db = store({
    'omvra.goals.v1': [{ id: 'goal-1', revision: 1 }],
    'omvra.goalExecutions.v1': [{ id: 'execution-1', goalId: 'goal-1', state: 'abandoned', resetAt: '2026-07-20T00:00:00.000Z' }],
  });
  const runtime = createGoalRuntimeService({ store: db });
  assert.equal(runtime.get('goal-1').execution, null);
});

test('runtime projection exposes durable schedule occurrence outcomes', () => {
  const db = store({
    'omvra.goals.v1': [{ id: 'goal-1', revision: 1 }],
    'omvra.goalScheduleOccurrences.v1': [{ id: 'occurrence-1', goalId: 'goal-1', scheduleId: 'schedule-1', state: 'missed', attempts: 3 }],
  });
  const projection = createGoalRuntimeService({ store: db }).get('goal-1');
  assert.equal(projection.scheduleOccurrences[0].state, 'missed');
  assert.equal(projection.scheduleOccurrences[0].attempts, 3);
});
