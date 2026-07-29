const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaskCollaborationLifecycleService } = require('./task-collaboration-lifecycle-service.cjs');

function makeHarness({ failFirstUpdate = false } = {}) {
  const store = new Map([
    ['attempts', []],
    ['events', []],
  ]);
  let task = {
    id: 'task-1',
    status: 'in-progress',
    assigneeId: 'orchestrator',
    __mcpRevision: 0,
    collaboration: {
      schemaVersion: 1,
      orchestratorId: 'orchestrator',
      contributions: [{
        id: 'contribution-1',
        personId: 'contributor',
        role: 'contributor',
        scope: 'Implement lifecycle',
        state: 'pending',
        evidenceRefs: [],
      }],
    },
  };
  let clock = 0;
  let shouldFailUpdate = failFirstUpdate;
  const service = createTaskCollaborationLifecycleService({
    getTaskById: () => task,
    updateTaskCollaboration: (_store, options) => {
      if (shouldFailUpdate) {
        shouldFailUpdate = false;
        return { ok: false, error: 'PROJECTION_WRITE_FAILED', message: 'Simulated interrupted projection write.' };
      }
      if (options.expectedRevision !== task.__mcpRevision) {
        return { ok: false, error: 'REVISION_MISMATCH', message: 'Task revision mismatch.' };
      }
      task = {
        ...task,
        assigneeId: options.collaboration.orchestratorId,
        collaboration: options.collaboration,
        __mcpRevision: task.__mcpRevision + 1,
      };
      return { ok: true, task };
    },
    readAttempts: current => current.get('attempts'),
    writeAttempts: (current, value) => current.set('attempts', value),
    readEvents: current => current.get('events'),
    writeEvents: (current, value) => current.set('events', value),
    normalizeString: value => typeof value === 'string' ? value.trim() : '',
    now: () => `2026-07-29T00:00:${String(clock++).padStart(2, '0')}.000Z`,
  });
  const run = (command, actorPersonId, extra = {}) => service.transition(store, {
    taskId: 'task-1',
    contributionId: 'contribution-1',
    command,
    actorPersonId,
    expectedRevision: task.__mcpRevision,
    idempotencyKey: `${command}-${task.__mcpRevision}`,
    ...extra,
  });
  return { service, store, run, getTask: () => task };
}

test('contribution lifecycle preserves handoff, revision, acceptance, and aggregate status boundaries', () => {
  const harness = makeHarness();
  assert.equal(harness.run('delegate', 'orchestrator').event.type, 'delegation');
  const handedOff = harness.run('handoff', 'orchestrator');
  assert.equal(handedOff.attempt.state, 'handed-off');
  assert.equal(handedOff.contribution.state, 'pending');
  assert.equal(harness.run('acknowledge', 'contributor').contribution.state, 'working');
  assert.equal(harness.run('submit', 'contributor', { evidenceRefs: ['artifact-1'] }).contribution.state, 'submitted');
  assert.equal(harness.run('request-revision', 'orchestrator').contribution.state, 'revision-requested');
  assert.equal(harness.run('handoff', 'orchestrator').attempt.ordinal, 2);
  assert.equal(harness.run('acknowledge', 'contributor').contribution.state, 'working');
  assert.equal(harness.run('submit', 'contributor', { evidenceRefs: ['artifact-2'] }).contribution.state, 'submitted');
  assert.equal(harness.run('accept', 'orchestrator').contribution.state, 'accepted');
  assert.equal(harness.getTask().status, 'in-progress');
  assert.deepEqual(harness.getTask().collaboration.contributions[0].evidenceRefs, ['artifact-1', 'artifact-2']);
});

test('blocked contribution work has explicit recovery and runtime completion stays non-authoritative', () => {
  const harness = makeHarness();
  harness.run('handoff', 'orchestrator');
  harness.run('acknowledge', 'contributor');
  const blocked = harness.run('block', 'contributor', { blockerRef: 'dependency-task-2' });
  assert.equal(blocked.contribution.state, 'blocked');
  assert.equal(blocked.event.blockerRef, 'dependency-task-2');
  assert.equal(harness.run('unblock', 'orchestrator').contribution.state, 'working');
  const completed = harness.run('complete', 'contributor');
  assert.equal(completed.attempt.state, 'completed');
  assert.equal(completed.contribution.state, 'working');
  assert.equal(harness.getTask().status, 'in-progress');
});

test('stopped and failed attempts preserve active contribution and aggregate state', () => {
  for (const command of ['stop', 'fail']) {
    const harness = makeHarness();
    harness.run('handoff', 'orchestrator');
    harness.run('acknowledge', 'contributor');
    const result = harness.run(command, 'contributor');
    assert.equal(result.attempt.state, command === 'stop' ? 'stopped' : 'failed');
    assert.equal(result.contribution.state, 'working');
    assert.equal(harness.getTask().status, 'in-progress');
  }
});

test('lifecycle rejects stale revisions and makes matching retries idempotent', () => {
  const harness = makeHarness();
  const first = harness.service.transition(harness.store, {
    taskId: 'task-1',
    contributionId: 'contribution-1',
    command: 'delegate',
    actorPersonId: 'orchestrator',
    expectedRevision: 0,
    idempotencyKey: 'delegate-once',
  });
  assert.equal(first.ok, true);
  const retry = harness.service.transition(harness.store, {
    taskId: 'task-1',
    contributionId: 'contribution-1',
    command: 'delegate',
    actorPersonId: 'orchestrator',
    expectedRevision: 0,
    idempotencyKey: 'delegate-once',
  });
  assert.equal(retry.idempotent, true);
  assert.equal(harness.store.get('events').length, 1);
  const stale = harness.service.transition(harness.store, {
    taskId: 'task-1',
    contributionId: 'contribution-1',
    command: 'handoff',
    actorPersonId: 'orchestrator',
    expectedRevision: 0,
    idempotencyKey: 'handoff-stale',
  });
  assert.equal(stale.error, 'REVISION_MISMATCH');
});

test('retry reconciles an event-first write without duplicating attempt history', () => {
  const harness = makeHarness({ failFirstUpdate: true });
  const input = {
    taskId: 'task-1',
    contributionId: 'contribution-1',
    command: 'handoff',
    actorPersonId: 'orchestrator',
    expectedRevision: 0,
    idempotencyKey: 'handoff-reconcile',
  };
  assert.equal(harness.service.transition(harness.store, input).error, 'PROJECTION_WRITE_FAILED');
  assert.equal(harness.store.get('events').length, 1);
  assert.equal(harness.store.get('attempts').length, 1);
  const recovered = harness.service.transition(harness.store, input);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.idempotent, true);
  assert.equal(recovered.attempt.ordinal, 1);
  assert.equal(harness.store.get('events').length, 1);
  assert.equal(harness.store.get('attempts').length, 1);
  assert.equal(harness.getTask().__mcpRevision, 1);
});
