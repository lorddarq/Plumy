const { createHash } = require('crypto');

function normalizeRevision(task) {
  const revision = Number(task?.__mcpRevision);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

function equalStringArrays(left, right) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function contributionStateById(task) {
  return new Map((Array.isArray(task?.collaboration?.contributions) ? task.collaboration.contributions : [])
    .filter(contribution => contribution?.id)
    .map(contribution => [contribution.id, contribution.state]));
}

function buildMeaningfulCheckpoint(previousTask, nextTask) {
  if (!previousTask || !nextTask || previousTask.id !== nextTask.id) return null;

  const changedFields = [];
  const markers = new Set();
  const summaries = [];
  const record = (field, marker, summary) => {
    if (!changedFields.includes(field)) changedFields.push(field);
    markers.add(marker);
    if (!summaries.includes(summary)) summaries.push(summary);
  };

  if (previousTask.assigneeId !== nextTask.assigneeId) {
    record('assigneeId', 'handoff', 'Task assignment or handoff changed.');
  }
  if (previousTask.title !== nextTask.title || previousTask.notes !== nextTask.notes) {
    if (previousTask.title !== nextTask.title) changedFields.push('title');
    if (previousTask.notes !== nextTask.notes) changedFields.push('notes');
    markers.add('requirement-change');
    summaries.push('Task requirements or scope changed.');
  }
  if (!equalStringArrays(previousTask.dependencyIds, nextTask.dependencyIds)) {
    record('dependencyIds', 'dependency-change', 'Task dependencies changed.');
  }
  if (Boolean(previousTask.blocked) !== Boolean(nextTask.blocked)) {
    record('blocked', 'blocker', nextTask.blocked ? 'A task blocker was introduced.' : 'A task blocker was resolved.');
  }
  if (previousTask.status !== nextTask.status) {
    const marker = nextTask.status === 'under-review'
      ? 'review-submission'
      : previousTask.status === 'under-review'
        ? 'revision-request'
        : previousTask.status === 'done'
          ? 'reopen'
          : 'status-change';
    const summary = marker === 'review-submission'
      ? 'The task was submitted for review.'
      : marker === 'revision-request'
        ? 'The task left review for revision.'
        : marker === 'reopen'
          ? 'The task was reopened.'
          : 'The task status changed.';
    record('status', marker, summary);
  }

  const previousContributions = contributionStateById(previousTask);
  const nextContributions = contributionStateById(nextTask);
  for (const [id, state] of nextContributions) {
    const previousState = previousContributions.get(id);
    if (!previousContributions.has(id)) {
      record('collaboration', 'handoff', 'A task contribution was handed off.');
    } else if (state !== previousState && state === 'revision-requested') {
      record('collaboration', 'revision-request', 'Revision was requested for a task contribution.');
    } else if (state !== previousState && state === 'submitted') {
      record('collaboration', 'review-submission', 'A task contribution was submitted for review.');
    } else if (state !== previousState && state === 'blocked') {
      record('collaboration', 'blocker', 'A task contribution became blocked.');
    }
  }

  if (changedFields.length === 0) return null;
  const revision = normalizeRevision(nextTask);
  const fingerprint = createHash('sha256').update(JSON.stringify({
    taskId: nextTask.id,
    revision,
    changedFields,
    values: changedFields.map(field => nextTask[field]),
  })).digest('hex').slice(0, 20);

  return {
    taskId: nextTask.id,
    expectedRevision: revision,
    idempotencyKey: `system-checkpoint:${fingerprint}`,
    kind: 'context-checkpoint',
    fromRevision: revision,
    toRevision: revision,
    summary: summaries.join(' '),
    markers: Array.from(markers),
    changedFields,
    provenance: 'system-derived',
    actor: 'omvra',
    sourceRefs: [{ type: 'task-change', id: `${nextTask.id}@${revision}` }],
  };
}

function captureMeaningfulTaskCheckpoints(store, {
  previousTasks,
  nextTasks,
  appendTaskContextEntry,
} = {}) {
  if (typeof appendTaskContextEntry !== 'function') {
    throw new TypeError('captureMeaningfulTaskCheckpoints requires appendTaskContextEntry.');
  }
  const previousById = new Map((Array.isArray(previousTasks) ? previousTasks : [])
    .filter(task => task?.id)
    .map(task => [task.id, task]));
  const results = [];
  for (const nextTask of Array.isArray(nextTasks) ? nextTasks : []) {
    const checkpoint = buildMeaningfulCheckpoint(previousById.get(nextTask?.id), nextTask);
    if (!checkpoint) continue;
    results.push(appendTaskContextEntry(store, checkpoint));
  }
  return results;
}

module.exports = {
  buildMeaningfulCheckpoint,
  captureMeaningfulTaskCheckpoints,
};
