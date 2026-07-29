const test = require('node:test');
const assert = require('node:assert/strict');
const { createPersonContextService } = require('./person-context-service.cjs');

function makeService({ people = [], tasks = [] } = {}) {
  const normalizeString = value => typeof value === 'string' ? value : '';
  const service = createPersonContextService({
    agentInstructionsBoundaryNote: 'workspace agent context',
    buildAgentInstructionsFieldSemantics: () => ({ people: {} }),
    buildContentBoundary: (classification, note) => ({ classification, note }),
    getTaskById: (_store, taskId) => tasks.find(task => task.id === taskId) || null,
    listTasks: (_store, filters) => tasks.filter(task => !filters.assigneeId || task.assigneeId === filters.assigneeId),
    normalizeName: value => normalizeString(value).trim().toLowerCase(),
    normalizeString,
    readPeople: () => people,
  });
  return service;
}

test('person context resolves the exact agentic assignee and instructions', () => {
  const person = {
    id: 'agent-1',
    name: 'Edgar',
    kind: 'agentic',
    agentInstructions: 'Build carefully.',
    agentOperationalInstructions: 'Run focused tests.',
  };
  const service = makeService({ people: [person], tasks: [{ id: 'task-1', assigneeId: person.id }] });

  const result = service.resolveTaskExecutionContext(null, 'task-1');

  assert.equal(result.ok, true);
  assert.equal(result.canStart, true);
  assert.equal(result.mode, 'assigned-persona');
  assert.equal(result.assignee.id, person.id);
});

test('person context blocks missing tasks and allows the documented unassigned fallback', () => {
  const service = makeService({ tasks: [{ id: 'task-unassigned' }] });

  const missing = service.resolveTaskExecutionContext(null, 'missing');
  assert.equal(missing.ok, false);
  assert.equal(missing.canStart, false);
  assert.equal(missing.error, 'TASK_NOT_FOUND');

  const unassigned = service.resolveTaskExecutionContext(null, 'task-unassigned');
  assert.equal(unassigned.ok, false);
  assert.equal(unassigned.canStart, true);
  assert.equal(unassigned.error, 'TASK_UNASSIGNED');
});
