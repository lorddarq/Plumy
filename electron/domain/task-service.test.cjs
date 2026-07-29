const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaskService } = require('./task-service.cjs');
const { createTaskCollaborationService } = require('./task-collaboration-service.cjs');

function makeService(initialTasks) {
  let tasks = initialTasks;
  const noop = () => null;
  const normalizeString = value => typeof value === 'string' ? value : '';
  const collaborationService = createTaskCollaborationService({ findPersonById: noop, normalizeString });
  const service = createTaskService({
    activityLogMaxEntries: 50,
    dependencyRules: {
      validateTaskReferences: (_store, taskIds) => ({ ok: true, taskIds: taskIds || [] }),
      validateDependencyCycles: () => ({ ok: true }),
    },
    collaborationService,
    findPersonById: noop,
    findPersonByReference: noop,
    hasOwn: (value, key) => Boolean(value) && Object.prototype.hasOwnProperty.call(value, key),
    normalizeBoolean: value => value === true,
    normalizeMilestone: value => value,
    normalizeName: value => normalizeString(value).trim().toLowerCase(),
    normalizeOptionalDate: normalizeString,
    normalizeOptionalEnum: (_value, _allowed, fallback) => fallback,
    normalizePatchDate: value => ({ ok: true, value }),
    normalizePatchEnum: value => ({ ok: true, value }),
    normalizePositiveInteger: value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : null,
    normalizeString,
    normalizeTaskIdList: value => Array.isArray(value) ? value : [],
    readMilestones: () => [],
    readPeople: () => [],
    readProjects: () => [],
    readStatusColumns: () => [],
    readTasks: () => tasks,
    requiresHumanReviewStatusColor: '#f97316',
    requiresHumanReviewStatusId: 'requires-human-review',
    requiresHumanReviewStatusTitle: 'Requires human review',
    resolveMilestoneReference: () => ({ ok: true, milestoneId: undefined }),
    revisionField: '__mcpRevision',
    writeMilestones: noop,
    writeStatusColumns: noop,
    writeTasks: (_store, nextTasks) => { tasks = nextTasks; },
  });
  return { service, readTasks: () => tasks };
}

test('task service preserves optimistic revisions for valid writes', () => {
  const { service, readTasks } = makeService([{ id: 'task-1', title: 'Task', notes: 'Before', __mcpRevision: 2 }]);

  const result = service.updateTaskDescription(null, {
    taskId: 'task-1',
    notes: 'After',
    expectedRevision: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.task.__mcpRevision, 3);
  assert.equal(readTasks()[0].notes, 'After');
});

test('task service rejects invalid input and stale revisions before persistence', () => {
  const { service, readTasks } = makeService([{ id: 'task-1', title: 'Task', notes: 'Before', __mcpRevision: 2 }]);

  assert.equal(service.updateTaskDescription(null, { taskId: 'task-1', expectedRevision: 2 }).error, 'DESCRIPTION_REQUIRED');
  assert.equal(service.updateTaskDescription(null, {
    taskId: 'task-1',
    notes: 'After',
    expectedRevision: 1,
  }).error, 'REVISION_MISMATCH');
  assert.equal(readTasks()[0].notes, 'Before');
});
