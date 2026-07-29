const { randomUUID } = require('crypto');

const SCHEDULES_KEY = 'omvra.goalSchedules.v1';
const OCCURRENCES_KEY = 'omvra.goalScheduleOccurrences.v1';
const RUNTIME_KEY = 'omvra.goalScheduleRuntime.v1';
const MAX_OCCURRENCE_ATTEMPTS = 3;
const RETRYABLE_ERRORS = new Set([
  'AGENT_UNAVAILABLE',
  'CONNECTION_LOST',
  'CONNECTION_UNAVAILABLE',
  'MCP_UNAVAILABLE',
  'NETWORK_ERROR',
  'SCHEDULE_CONNECTION_LOST',
]);

function readArray(store, key) {
  const value = store.get(key);
  return Array.isArray(value) ? value : [];
}

function localParts(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`).getUTCDay(),
  };
}

function addLocalDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function matchesDate(schedule, date) {
  const rule = schedule.rule || {};
  if (schedule.endsAt && date > String(schedule.endsAt).slice(0, 10)) return false;
  if (schedule.startsAt && date < String(schedule.startsAt).slice(0, 10)) return false;
  if (rule.mode === 'one-time') return date === rule.date;
  if (rule.frequency === 'monthly') return Number(date.slice(8, 10)) === Number(rule.dayOfMonth);
  return new Date(`${date}T12:00:00Z`).getUTCDay() === Number(rule.dayOfWeek);
}

function occurrenceStampForDate(schedule, date) {
  return `${date}T${schedule.rule?.time || '09:00'}@${schedule.timezone || 'UTC'}`;
}

function occurrenceStamp(schedule, now) {
  return occurrenceStampForDate(schedule, localParts(now, schedule.timezone).date);
}

function isDue(schedule, now) {
  if (!schedule || schedule.enabled === false || !schedule.rule) return false;
  const local = localParts(now, schedule.timezone);
  return matchesDate(schedule, local.date) && local.time >= schedule.rule.time;
}

function dueStampsBetween(schedule, since, now, includeCurrent = false) {
  if (!schedule || schedule.enabled === false || !schedule.rule) return [];
  const from = localParts(since, schedule.timezone);
  const until = localParts(now, schedule.timezone);
  const lowerBound = `${from.date}T${includeCurrent ? '' : from.time}`;
  const upperBound = `${until.date}T${until.time}`;
  const stamps = [];
  for (let date = from.date; date <= until.date; date = addLocalDays(date, 1)) {
    const localStamp = `${date}T${schedule.rule.time}`;
    if (matchesDate(schedule, date) && localStamp > lowerBound && localStamp <= upperBound) {
      stamps.push(occurrenceStampForDate(schedule, date));
    }
  }
  return stamps;
}

function latestDueStamp(schedule, now) {
  if (!schedule?.rule) return null;
  const until = localParts(now, schedule.timezone);
  const oneTimeStart = schedule.rule.mode === 'one-time' ? schedule.rule.date : addLocalDays(until.date, -370);
  if (!oneTimeStart) return null;
  const stamps = dueStampsBetween(schedule, new Date(`${oneTimeStart}T00:00:00Z`), now, true);
  return stamps.at(-1) || null;
}

function retryableError(error) {
  return RETRYABLE_ERRORS.has(String(error || '').toUpperCase());
}

function emitOccurrence(onRuntimeChange, occurrence) {
  if (typeof onRuntimeChange !== 'function') return;
  onRuntimeChange({
    scope: 'schedule',
    goalId: occurrence.goalId,
    revision: occurrence.attempts || 0,
    actor: 'goal-scheduler',
    changeType: `schedule.occurrence.${occurrence.state}`,
    ...(occurrence.error ? { errorCode: occurrence.error } : {}),
    details: {
      occurrenceId: occurrence.id,
      scheduleId: occurrence.scheduleId,
      scheduledFor: occurrence.scheduledFor,
      state: occurrence.state,
      attempts: occurrence.attempts || 0,
    },
  });
}

function runDueSchedules({ store, lifecycle, now = new Date(), actor = 'goal-scheduler', onRuntimeChange } = {}) {
  if (!store || !lifecycle || typeof lifecycle.execute !== 'function') throw new Error('store and lifecycle are required');
  const schedules = readArray(store, SCHEDULES_KEY);
  const occurrences = readArray(store, OCCURRENCES_KEY);
  const runtime = store.get(RUNTIME_KEY);
  const lastCheckedAt = runtime && !Number.isNaN(Date.parse(runtime.lastCheckedAt)) ? new Date(runtime.lastCheckedAt) : now;
  const firstCheck = lastCheckedAt === now;
  const nextOccurrences = [...occurrences];
  const results = [];
  const scheduleById = new Map(schedules.map(schedule => [schedule.id, schedule]));

  function persist() {
    store.set(OCCURRENCES_KEY, nextOccurrences);
  }

  function replace(occurrence) {
    const index = nextOccurrences.findIndex(item => item.id === occurrence.id);
    if (index >= 0) nextOccurrences[index] = occurrence;
    else nextOccurrences.push(occurrence);
    persist();
    results.push(occurrence);
    emitOccurrence(onRuntimeChange, occurrence);
  }

  function attempt(occurrence) {
    const attempts = (occurrence.attempts || 0) + 1;
    const attempting = {
      ...occurrence,
      state: attempts > 1 ? 'retrying' : 'pending',
      attempts,
      lastAttemptAt: now.toISOString(),
    };
    const index = nextOccurrences.findIndex(item => item.id === occurrence.id);
    if (index >= 0) nextOccurrences[index] = attempting;
    else nextOccurrences.push(attempting);
    persist();

    let result;
    try {
      result = lifecycle.execute({
        goalId: occurrence.goalId,
        command: 'start',
        expectedRevision: 0,
        commandId: `schedule:${occurrence.scheduleId}:${occurrence.scheduledFor}`,
        actor,
        payload: {
          scheduledFor: occurrence.scheduledFor,
          temporalMode: occurrence.temporalMode,
          scheduleId: occurrence.scheduleId,
          occurrenceId: occurrence.id,
        },
      });
    } catch (error) {
      result = { ok: false, error: error?.code || 'SCHEDULE_CONNECTION_LOST', message: error?.message || String(error) };
    }
    const completed = result?.ok
      ? { ...attempting, state: 'started', executionId: result.execution?.id, startedAt: now.toISOString(), error: undefined, message: undefined }
      : { ...attempting, state: 'blocked', error: result?.error || 'SCHEDULE_START_FAILED', message: result?.message, retryable: retryableError(result?.error), blockedAt: now.toISOString() };
    replace(completed);
  }

  for (const occurrence of [...nextOccurrences]) {
    if (!['pending', 'retrying', 'blocked'].includes(occurrence?.state)) continue;
    const schedule = scheduleById.get(occurrence.scheduleId);
    if (!schedule) continue;
    const laterDue = latestDueStamp(schedule, now);
    if (laterDue && laterDue > occurrence.scheduledFor) {
      replace({ ...occurrence, state: 'missed', missedAt: now.toISOString(), error: occurrence.error || 'OCCURRENCE_WINDOW_CLOSED' });
      continue;
    }
    if (occurrence.retryable === true && (occurrence.attempts || 0) < MAX_OCCURRENCE_ATTEMPTS) {
      attempt(occurrence);
    } else if (schedule.rule?.mode === 'one-time' && occurrence.retryable === true && (occurrence.attempts || 0) >= MAX_OCCURRENCE_ATTEMPTS) {
      replace({ ...occurrence, state: 'expired', expiredAt: now.toISOString(), error: occurrence.error || 'OCCURRENCE_RETRY_EXHAUSTED' });
    }
  }

  for (const schedule of schedules) {
    const dueStamps = dueStampsBetween(schedule, lastCheckedAt, now, firstCheck);
    for (const [stampIndex, scheduledFor] of dueStamps.entries()) {
      if (nextOccurrences.some(item => item.scheduleId === schedule.id && item.scheduledFor === scheduledFor)) continue;
      const occurrence = {
        id: `occurrence_${randomUUID()}`,
        scheduleId: schedule.id,
        goalId: schedule.goalId,
        scheduledFor,
        temporalMode: schedule.temporalMode === 'latest' ? 'latest' : 'anchored',
        state: 'pending',
        attempts: 0,
        createdAt: now.toISOString(),
      };
      if (stampIndex < dueStamps.length - 1) {
        replace({ ...occurrence, state: 'missed', missedAt: now.toISOString(), error: 'MISSED_WHILE_OFFLINE' });
      } else {
        attempt(occurrence);
      }
    }
  }

  store.set(RUNTIME_KEY, { lastCheckedAt: now.toISOString() });
  return { ok: true, occurrences: results, allOccurrences: nextOccurrences };
}

module.exports = {
  SCHEDULES_KEY,
  OCCURRENCES_KEY,
  RUNTIME_KEY,
  MAX_OCCURRENCE_ATTEMPTS,
  localParts,
  isDue,
  dueStampsBetween,
  runDueSchedules,
};
