import assert from 'node:assert/strict';
import test from 'node:test';
import type { Person } from '../types.ts';
import { buildTaskAssignmentValue, getDefaultTaskContributionScope, getEffectiveTaskOrchestratorId, getTaskAssignmentSummary, isEligibleTaskContributor } from './taskAssignment.ts';

const people: Person[] = [
  { id: 'orchestrator', name: 'Pericles', role: 'Product manager', kind: 'agentic' },
  { id: 'contributor', name: 'Edgar', role: 'Engineer', kind: 'agentic', availableForSubagentDelegation: true },
];

test('direct assignment preserves the legacy assignee-only shape', () => {
  const value = buildTaskAssignmentValue('orchestrator', []);

  assert.deepEqual(value, { assigneeId: 'orchestrator', collaboration: undefined });
  assert.equal(getEffectiveTaskOrchestratorId(value), 'orchestrator');
  assert.equal(getTaskAssignmentSummary(value, people).label, 'Pericles');
});

test('collaborative assignment mirrors the orchestrator and trims contributor scope', () => {
  const value = buildTaskAssignmentValue('orchestrator', [{
    id: 'contribution-1',
    personId: 'contributor',
    role: 'subagent',
    scope: '  Verify the interaction  ',
    state: 'pending',
  }]);

  assert.equal(value.assigneeId, 'orchestrator');
  assert.equal(value.collaboration?.orchestratorId, 'orchestrator');
  assert.equal(value.collaboration?.contributions[0].scope, 'Verify the interaction');
  assert.equal(getTaskAssignmentSummary(value, people).accessibleLabel, 'Pericles, orchestrator, plus 1 contributor');
});

test('missing people remain visible in assignment summaries', () => {
  const summary = getTaskAssignmentSummary({ assigneeId: 'missing-person' }, people);
  assert.equal(summary.label, 'Unavailable person');
});

test('only explicitly eligible agents can contribute', () => {
  const human: Person = { id: 'human', name: 'Sorin', role: 'Product designer', kind: 'human' };
  const eligibleAgent: Person = { id: 'agent-eligible', name: 'Ted', role: 'Engineer', kind: 'agentic', availableForSubagentDelegation: true };
  const ineligibleAgent: Person = { ...eligibleAgent, id: 'agent-ineligible', availableForSubagentDelegation: false };

  assert.equal(isEligibleTaskContributor(human), false);
  assert.equal(isEligibleTaskContributor(eligibleAgent), true);
  assert.equal(isEligibleTaskContributor(ineligibleAgent), false);
});

test('agent roles provide the default subagent scope while human roles do not', () => {
  const agent: Person = { id: 'agent', name: 'Ted', role: '  Frontend implementation  ', kind: 'agentic' };

  assert.equal(getDefaultTaskContributionScope(agent), 'Frontend implementation');
  assert.equal(getDefaultTaskContributionScope({ id: 'human', name: 'Sorin', role: 'Product designer', kind: 'human' }), '');
});
