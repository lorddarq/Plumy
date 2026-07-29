const test = require('node:test');
const assert = require('node:assert/strict');
const { createDependencyRules } = require('./dependency-rules.cjs');

function normalizeTaskIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => typeof item === 'string' ? item.trim() : '').filter(Boolean))];
}

function makeRules(tasks) {
  return createDependencyRules({
    listTasks: () => tasks,
    normalizeTaskIdList,
  });
}

test('dependency rules normalize and accept valid task references', () => {
  const rules = makeRules([{ id: 'task-a' }, { id: 'task-b' }]);

  assert.deepEqual(rules.validateTaskReferences(null, [' task-a ', 'task-a', 'task-b']), {
    ok: true,
    taskIds: ['task-a', 'task-b'],
  });
});

test('dependency rules reject unknown and self references', () => {
  const rules = makeRules([{ id: 'task-a' }]);

  assert.equal(rules.validateTaskReferences(null, ['missing']).error, 'TASK_REFERENCE_NOT_FOUND');
  assert.equal(
    rules.validateTaskReferences(null, ['task-a'], { excludeTaskId: 'task-a' }).error,
    'INVALID_TASK_REFERENCE'
  );
});

test('dependency rules reject cycles across an atomic update set', () => {
  const rules = makeRules([
    { id: 'task-a', dependencyIds: [] },
    { id: 'task-b', dependencyIds: [] },
    { id: 'task-c', dependencyIds: [] },
  ]);

  const result = rules.validateRoadmapDependencyUpdates(null, [
    { taskId: 'task-a', dependencyIds: ['task-b'] },
    { taskId: 'task-b', dependencyIds: ['task-c'] },
    { taskId: 'task-c', dependencyIds: ['task-a'] },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'DEPENDENCY_CYCLE');
});
