const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMeaningfulCheckpoint,
  captureMeaningfulTaskCheckpoints,
} = require('./task-context-checkpoint-service.cjs');

const baseTask = {
  id: 'task-1', title: 'Context UI', notes: 'Initial scope', status: 'in-progress',
  assigneeId: 'agent-1', dependencyIds: ['task-0'], blocked: false, __mcpRevision: 4,
};

test('meaningful task boundaries produce one source-linked system checkpoint', () => {
  const checkpoint = buildMeaningfulCheckpoint(baseTask, {
    ...baseTask,
    notes: 'Revised scope',
    dependencyIds: ['task-0', 'task-2'],
    blocked: true,
    status: 'under-review',
    __mcpRevision: 5,
  });

  assert.equal(checkpoint.kind, 'context-checkpoint');
  assert.equal(checkpoint.provenance, 'system-derived');
  assert.equal(checkpoint.expectedRevision, 5);
  assert.deepEqual(checkpoint.sourceRefs, [{ type: 'task-change', id: 'task-1@5' }]);
  assert.deepEqual(checkpoint.changedFields, ['notes', 'dependencyIds', 'blocked', 'status']);
  assert.deepEqual(checkpoint.markers, ['requirement-change', 'dependency-change', 'blocker', 'review-submission']);
  assert.match(checkpoint.summary, /submitted for review/i);
});

test('routine comments, attachments, time, and scheduling changes do not create checkpoints', () => {
  assert.equal(buildMeaningfulCheckpoint(baseTask, {
    ...baseTask,
    comments: [{ id: 'comment-1', content: 'Routine note' }],
    attachments: [{ id: 'attachment-1' }],
    timeSpentMinutes: 30,
    startDate: '2026-09-12',
    endDate: '2026-09-19',
  }), null);
});

test('capture indexes existing tasks only and forwards immutable append options', () => {
  const calls = [];
  const results = captureMeaningfulTaskCheckpoints({}, {
    previousTasks: [baseTask],
    nextTasks: [
      { ...baseTask, assigneeId: 'agent-2' },
      { id: 'task-new', title: 'New task', status: 'open' },
    ],
    appendTaskContextEntry: (_store, options) => { calls.push(options); return { ok: true }; },
  });

  assert.equal(results.length, 1);
  assert.equal(calls[0].markers.includes('handoff'), true);
  assert.equal(calls[0].changedFields.includes('assigneeId'), true);
});
