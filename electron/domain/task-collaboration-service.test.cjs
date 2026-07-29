const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaskCollaborationService } = require('./task-collaboration-service.cjs');

const people = [
  { id: 'orchestrator', kind: 'agentic' },
  { id: 'agent-eligible', kind: 'agentic', availableForSubagentDelegation: true },
  { id: 'agent-ineligible', kind: 'agentic', availableForSubagentDelegation: false },
  { id: 'human', kind: 'human' },
];
const service = createTaskCollaborationService({
  findPersonById: (_store, personId) => people.find(person => person.id === personId) || null,
  normalizeString: value => typeof value === 'string' ? value.trim() : '',
});

function collaboration(contributions) {
  return { schemaVersion: 1, orchestratorId: 'orchestrator', extension: { retained: true }, contributions };
}

function contribution(overrides = {}) {
  return {
    id: 'contribution-1',
    personId: 'agent-eligible',
    role: 'subagent',
    scope: 'Implement persistence',
    state: 'pending',
    extension: 'retained',
    ...overrides,
  };
}

test('collaboration service preserves versioned extension fields and stable ids', () => {
  const result = service.validate(null, collaboration([contribution()]));
  assert.equal(result.ok, true);
  assert.equal(result.collaboration.schemaVersion, 1);
  assert.equal(result.collaboration.extension.retained, true);
  assert.equal(result.collaboration.contributions[0].id, 'contribution-1');
  assert.equal(result.collaboration.contributions[0].extension, 'retained');
});

test('collaboration service migrates a stored pre-version projection to v1', () => {
  const stored = collaboration([contribution()]);
  delete stored.schemaVersion;
  const result = service.normalizeStored(stored);
  assert.equal(result.ok, true);
  assert.equal(result.collaboration.schemaVersion, 1);
});

test('collaboration service rejects duplicate, missing, self-conflicting, and ineligible contributors', () => {
  assert.equal(service.validate(null, collaboration([
    contribution(),
    contribution({ id: 'contribution-2' }),
  ])).error, 'DUPLICATE_CONTRIBUTOR');
  assert.equal(service.validate(null, collaboration([contribution({ id: '' })])).error, 'INCOMPLETE_CONTRIBUTION');
  assert.equal(service.validate(null, collaboration([contribution({ personId: 'orchestrator' })])).error, 'ORCHESTRATOR_CONTRIBUTOR_CONFLICT');
  assert.equal(service.validate(null, collaboration([contribution({ personId: 'agent-ineligible' })])).error, 'SUBAGENT_NOT_ELIGIBLE');
  assert.equal(service.validate(null, collaboration([contribution({ personId: 'agent-ineligible' })]), {
    allowIneligibleExistingContributionIds: new Set(['contribution-1']),
  }).ok, true);
  assert.equal(service.validate(null, collaboration([contribution({ personId: 'human', role: 'contributor' })])).error, 'CONTRIBUTOR_MUST_BE_AGENTIC');
  assert.equal(service.validate(null, collaboration([contribution({ role: 'contributor' })])).error, 'INVALID_CONTRIBUTION_ROLE');
  assert.equal(service.validate(null, collaboration([contribution({ personId: 'human', role: 'contributor' })]), {
    allowIneligibleExistingContributionIds: new Set(['contribution-1']),
  }).ok, true);
});

test('collaboration service rejects runtime, session, transcript, and credential fields', () => {
  assert.equal(service.validate(null, { ...collaboration([]), sessionBinding: { id: 'secret' } }).error, 'COLLABORATION_RUNTIME_DATA_FORBIDDEN');
  assert.equal(service.validate(null, collaboration([contribution({ transcript: 'hidden' })])).error, 'COLLABORATION_RUNTIME_DATA_FORBIDDEN');
});
