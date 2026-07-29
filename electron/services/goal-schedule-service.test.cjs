const test = require('node:test');
const assert = require('node:assert/strict');
const { OCCURRENCES_KEY, RUNTIME_KEY, MAX_OCCURRENCE_ATTEMPTS, isDue, runDueSchedules } = require('./goal-schedule-service.cjs');

function makeStore(values) {
  return {
    get(key) { return values[key]; },
    set(key, value) { values[key] = value; },
  };
}

test('scheduler detects one-time and recurring occurrences in the captured timezone', () => {
  const now = new Date('2026-07-20T07:30:00.000Z');
  assert.equal(isDue({ enabled: true, timezone: 'Europe/Bucharest', rule: { mode: 'one-time', date: '2026-07-20', time: '10:00' } }, now), true);
  assert.equal(isDue({ enabled: true, timezone: 'Europe/Bucharest', rule: { mode: 'recurring', frequency: 'weekly', dayOfWeek: 1, time: '10:00' } }, now), true);
  assert.equal(isDue({ enabled: true, timezone: 'Europe/Bucharest', rule: { mode: 'recurring', frequency: 'monthly', dayOfMonth: 19, time: '10:00' } }, now), false);
});

test('scheduler uses the captured timezone across a DST transition', () => {
  const duringNewYorkDaylightTime = new Date('2026-03-08T14:30:00.000Z');
  assert.equal(isDue({ enabled: true, timezone: 'America/New_York', rule: { mode: 'recurring', frequency: 'weekly', dayOfWeek: 0, time: '10:00' } }, duringNewYorkDaylightTime), true);
});

test('restart catch-up preserves local anchors across a DST boundary', () => {
  const values = {
    'omvra.goalSchedules.v1': [{ id: 'schedule-1', goalId: 'goal-1', enabled: true, timezone: 'America/New_York', temporalMode: 'anchored', rule: { mode: 'recurring', frequency: 'weekly', dayOfWeek: 0, time: '10:00' } }],
    'omvra.goalScheduleOccurrences.v1': [],
    [RUNTIME_KEY]: { lastCheckedAt: '2026-03-01T14:00:00.000Z' },
  };
  const result = runDueSchedules({
    store: makeStore(values),
    lifecycle: { execute() { return { ok: true, execution: { id: 'execution-latest' } }; } },
    now: new Date('2026-03-15T15:00:00.000Z'),
  });
  assert.deepEqual(result.allOccurrences.map(item => item.scheduledFor), [
    '2026-03-01T10:00@America/New_York',
    '2026-03-08T10:00@America/New_York',
    '2026-03-15T10:00@America/New_York',
  ]);
  assert.deepEqual(result.allOccurrences.map(item => item.state), ['missed', 'missed', 'started']);
});

test('scheduler creates an immutable anchored occurrence and invokes lifecycle once', () => {
  const values = {
    'omvra.goalSchedules.v1': [{ id: 'schedule-1', goalId: 'goal-1', enabled: true, timezone: 'UTC', temporalMode: 'anchored', rule: { mode: 'one-time', date: '2026-07-20', time: '07:30' } }],
    'omvra.goalScheduleOccurrences.v1': [],
  };
  const calls = [];
  const result = runDueSchedules({
    store: makeStore(values),
    lifecycle: { execute(input) { calls.push(input); return { ok: true, execution: { id: 'execution-1' } }; } },
    now: new Date('2026-07-20T07:31:00.000Z'),
  });
  assert.equal(result.occurrences[0].state, 'started');
  assert.equal(result.occurrences[0].temporalMode, 'anchored');
  assert.equal(calls[0].command, 'start');
  assert.equal(calls[0].payload.scheduledFor, '2026-07-20T07:30@UTC');
  assert.equal(values[OCCURRENCES_KEY].length, 1);

  const duplicate = runDueSchedules({ store: makeStore(values), lifecycle: { execute() { throw new Error('should not execute twice'); } }, now: new Date('2026-07-20T07:31:00.000Z') });
  assert.equal(duplicate.occurrences.length, 0);
});

test('blocked schedule occurrences are recorded without failing the schedule loop', () => {
  const values = {
    'omvra.goalSchedules.v1': [{ id: 'schedule-1', goalId: 'missing-goal', enabled: true, timezone: 'UTC', rule: { mode: 'one-time', date: '2026-07-20', time: '07:30' } }],
    'omvra.goalScheduleOccurrences.v1': [],
  };
  const result = runDueSchedules({ store: makeStore(values), lifecycle: { execute() { return { ok: false, error: 'GOAL_NOT_FOUND' }; } }, now: new Date('2026-07-20T07:31:00.000Z') });
  assert.equal(result.occurrences[0].state, 'blocked');
  assert.equal(result.occurrences[0].error, 'GOAL_NOT_FOUND');
});

test('connection loss persists the occurrence before retrying with one idempotent command', () => {
  const values = {
    'omvra.goalSchedules.v1': [{ id: 'schedule-1', goalId: 'goal-1', enabled: true, timezone: 'UTC', rule: { mode: 'one-time', date: '2026-07-20', time: '07:30' } }],
    'omvra.goalScheduleOccurrences.v1': [],
  };
  const calls = [];
  const lifecycle = { execute(input) {
    calls.push(input);
    if (calls.length === 1) throw Object.assign(new Error('socket closed'), { code: 'CONNECTION_LOST' });
    return { ok: true, execution: { id: 'execution-1' } };
  } };

  const first = runDueSchedules({ store: makeStore(values), lifecycle, now: new Date('2026-07-20T07:31:00.000Z') });
  assert.equal(first.occurrences.at(-1).state, 'blocked');
  assert.equal(values[OCCURRENCES_KEY][0].attempts, 1);

  const retry = runDueSchedules({ store: makeStore(values), lifecycle, now: new Date('2026-07-20T07:32:00.000Z') });
  assert.equal(retry.occurrences.at(-1).state, 'started');
  assert.equal(values[OCCURRENCES_KEY].length, 1);
  assert.equal(values[OCCURRENCES_KEY][0].attempts, 2);
  assert.equal(calls[0].commandId, calls[1].commandId);
});

test('one-time connection retries are bounded and end in a durable expired outcome', () => {
  const values = {
    'omvra.goalSchedules.v1': [{ id: 'schedule-1', goalId: 'goal-1', enabled: true, timezone: 'UTC', rule: { mode: 'one-time', date: '2026-07-20', time: '07:30' } }],
    'omvra.goalScheduleOccurrences.v1': [],
  };
  let calls = 0;
  const lifecycle = { execute() { calls += 1; return { ok: false, error: 'MCP_UNAVAILABLE' }; } };
  for (let minute = 31; minute <= 34; minute += 1) {
    runDueSchedules({ store: makeStore(values), lifecycle, now: new Date(`2026-07-20T07:${minute}:00.000Z`) });
  }
  assert.equal(calls, MAX_OCCURRENCE_ATTEMPTS);
  assert.equal(values[OCCURRENCES_KEY][0].state, 'expired');
  assert.equal(values[OCCURRENCES_KEY][0].attempts, MAX_OCCURRENCE_ATTEMPTS);
});

test('restart catch-up records older recurring occurrences as missed and starts the newest independently', () => {
  const values = {
    'omvra.goalSchedules.v1': [{ id: 'schedule-1', goalId: 'goal-1', enabled: true, timezone: 'UTC', rule: { mode: 'recurring', frequency: 'weekly', dayOfWeek: 1, time: '07:30' } }],
    'omvra.goalScheduleOccurrences.v1': [],
    [RUNTIME_KEY]: { lastCheckedAt: '2026-07-19T07:00:00.000Z' },
  };
  const calls = [];
  const result = runDueSchedules({
    store: makeStore(values),
    lifecycle: { execute(input) { calls.push(input); return { ok: true, execution: { id: 'execution-newest' } }; } },
    now: new Date('2026-08-04T08:00:00.000Z'),
  });
  assert.deepEqual(result.allOccurrences.map(item => item.state), ['missed', 'missed', 'started']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.scheduledFor, '2026-08-03T07:30@UTC');
});

test('a blocked recurring occurrence becomes missed at the next boundary without consuming it', () => {
  const values = {
    'omvra.goalSchedules.v1': [{ id: 'schedule-1', goalId: 'goal-1', enabled: true, timezone: 'UTC', rule: { mode: 'recurring', frequency: 'weekly', dayOfWeek: 1, time: '07:30' } }],
    'omvra.goalScheduleOccurrences.v1': [{ id: 'occurrence-old', scheduleId: 'schedule-1', goalId: 'goal-1', scheduledFor: '2026-07-20T07:30@UTC', temporalMode: 'anchored', state: 'blocked', attempts: 1, retryable: true }],
    [RUNTIME_KEY]: { lastCheckedAt: '2026-07-26T08:00:00.000Z' },
  };
  const result = runDueSchedules({
    store: makeStore(values),
    lifecycle: { execute() { return { ok: true, execution: { id: 'execution-next' } }; } },
    now: new Date('2026-07-27T08:00:00.000Z'),
  });
  assert.equal(result.allOccurrences.find(item => item.id === 'occurrence-old').state, 'missed');
  assert.equal(result.allOccurrences.find(item => item.scheduledFor === '2026-07-27T07:30@UTC').state, 'started');
});

test('schedule outcomes emit typed runtime audit changes', () => {
  const values = {
    'omvra.goalSchedules.v1': [{ id: 'schedule-1', goalId: 'missing-goal', enabled: true, timezone: 'UTC', rule: { mode: 'one-time', date: '2026-07-20', time: '07:30' } }],
    'omvra.goalScheduleOccurrences.v1': [],
  };
  const events = [];
  runDueSchedules({
    store: makeStore(values),
    lifecycle: { execute() { return { ok: false, error: 'GOAL_NOT_FOUND' }; } },
    onRuntimeChange(event) { events.push(event); },
    now: new Date('2026-07-20T07:31:00.000Z'),
  });
  assert.equal(events.at(-1).scope, 'schedule');
  assert.equal(events.at(-1).changeType, 'schedule.occurrence.blocked');
  assert.equal(events.at(-1).errorCode, 'GOAL_NOT_FOUND');
});
