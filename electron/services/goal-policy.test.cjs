const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildGoalContractPacket,
  isAgentMutationAllowed,
  getPendingGoalPolicyImpact,
  recordGoalPolicyChangeImpact,
  resolveGoalPolicyImpact,
  resolveGoalPolicy,
} = require('./goal-policy.cjs');

test('fresh policy resolution starts from safe defaults and records no override sources', () => {
  const policy = resolveGoalPolicy({});

  assert.equal(policy.policyRevision, 0);
  assert.equal(policy.dimensions.financial.value, 10);
  assert.equal(policy.dimensions.tokens.value, 100000);
  assert.equal(policy.acceptance.actor, 'human');
  assert.equal(policy.sources.workspace, 'safe-default');
  assert.equal(policy.sources.goal, 'inherited');
  assert.equal(policy.sources.target, 'inherited');
});

test('effective policy inherits and only narrows workspace, goal, subgoal, and gate scopes', () => {
  const goal = {
    id: 'goal-1',
    title: 'Ship it',
    revision: 4,
    policy: { dimensions: { tokens: { constrained: true, mode: 'hard-cap', value: 5000, unit: 'tokens' } } },
    elements: [
      { id: 'subgoal-1', type: 'subgoal', policy: { dimensions: { tokens: { constrained: true, mode: 'goal-pool', value: 1000, unit: 'tokens' } }, acceptance: { actor: 'human' } } },
      { id: 'gate-1', type: 'approval-gate', policy: { acceptance: { actor: 'both' }, dimensions: { tokens: { constrained: true, mode: 'hard-cap', value: 250, unit: 'tokens' } } } },
      { id: 'to-subgoal', type: 'connector', sourceId: 'goal-root', targetId: 'subgoal-1' },
      { id: 'to-gate', type: 'connector', sourceId: 'subgoal-1', targetId: 'gate-1' },
    ],
  };
  const policy = resolveGoalPolicy({
    workspacePolicy: { policyRevision: 8, dimensions: { tokens: { constrained: true, mode: 'hard-cap', value: 10000, unit: 'tokens' } }, acceptance: { actor: 'human' } },
    goal,
    targetElementId: 'gate-1',
  });

  assert.equal(policy.dimensions.tokens.value, 250);
  assert.equal(policy.acceptance.actor, 'both');
  assert.equal(policy.sourceRevision, 8);
  assert.equal(policy.sources.target, 'explicit');

  const attemptedWiden = resolveGoalPolicy({
    workspacePolicy: { dimensions: { tokens: { constrained: true, mode: 'hard-cap', value: 1000, unit: 'tokens' } }, acceptance: { actor: 'human' } },
    goal: { ...goal, policy: { dimensions: { tokens: { constrained: false } }, acceptance: { actor: 'agentic' } } },
  });
  assert.equal(attemptedWiden.dimensions.tokens.value, 1000);
  assert.equal(attemptedWiden.acceptance.actor, 'human');
});

test('contract packets carry the effective policy and revision', () => {
  const packet = buildGoalContractPacket({ goal: { id: 'goal-1', title: 'Ship it', revision: 3 }, effectivePolicy: { sourceRevision: 9, acceptance: { actor: 'human' } }, executionAttempt: 2, now: () => '2026-07-19T00:00:00.000Z' });
  assert.equal(packet.contractRevision, 3);
  assert.equal(packet.policyRevision, 9);
  assert.equal(packet.effectivePolicy.acceptance.actor, 'human');
  assert.deepEqual(Object.keys(packet.references), ['objective', 'scope', 'instructions', 'outputs', 'artifactContributions', 'inputs', 'capabilities', 'inputResolution', 'capabilityResolution', 'constraints', 'permissions', 'acceptance', 'evidence', 'handoff', 'sequence', 'budget', 'project', 'roster']);
  assert.match(packet.contractHash, /^sha256-/);
});

test('semantic contract changes invalidate the stable packet hash', () => {
  const base = { id: 'goal-1', title: 'Ship it', revision: 3, scope: 'repo' };
  const first = buildGoalContractPacket({ goal: base, effectivePolicy: { sourceRevision: 9 }, executionAttempt: 1 });
  const changed = buildGoalContractPacket({ goal: { ...base, scope: 'repo and release' }, effectivePolicy: { sourceRevision: 9 }, executionAttempt: 1 });
  const cosmetic = buildGoalContractPacket({ goal: { ...base, label: 'A different label' }, effectivePolicy: { sourceRevision: 9 }, executionAttempt: 1 });
  assert.notEqual(first.contractHash, changed.contractHash);
  assert.equal(first.contractHash, cosmetic.contractHash);
});

test('agent graph mutation is confirmation-gated by default and configurable', () => {
  assert.equal(isAgentMutationAllowed({ get: () => ({ agentMutationConfirmation: 'required' }) }).allowed, false);
  assert.equal(isAgentMutationAllowed({ get: () => ({ agentMutationConfirmation: 'required' }) }, true).allowed, true);
  assert.equal(isAgentMutationAllowed({ get: () => ({ agentMutationConfirmation: 'allowed' }) }).allowed, true);
});

test('active policy changes create durable impact-gate decisions', () => {
  const values = new Map([
    ['omvra.goals.v1', [{ id: 'goal-1', title: 'Ship it', elements: [] }]],
    ['omvra.goalExecutions.v1', [{ id: 'execution-1', goalId: 'goal-1', state: 'working' }]],
  ]);
  const store = { get: key => values.get(key), set: (key, value) => values.set(key, value) };
  const result = recordGoalPolicyChangeImpact(store, {
    previousPolicy: { policyRevision: 2, dimensions: { tokens: { constrained: true, mode: 'hard-cap', value: 100, unit: 'tokens' } } },
    nextPolicy: { policyRevision: 3, dimensions: { tokens: { constrained: true, mode: 'hard-cap', value: 50, unit: 'tokens' } } },
    now: () => '2026-07-19T00:00:00.000Z',
  });
  assert.equal(result.impacts.length, 1);
  assert.equal(result.impacts[0].decision, 'pause-and-review');
  assert.equal(result.impacts[0].priorPolicyRevision, 2);
  assert.equal(values.get('omvra.goalPolicyImpacts.v1')[0].status, 'pending');
});

test('widening an active policy requires explicit confirmation', () => {
  const values = new Map([
    ['omvra.goals.v1', [{ id: 'goal-1', title: 'Ship it', elements: [] }]],
    ['omvra.goalExecutions.v1', [{ id: 'execution-1', goalId: 'goal-1', state: 'working' }]],
  ]);
  const store = { get: key => values.get(key), set: (key, value) => values.set(key, value) };
  const result = recordGoalPolicyChangeImpact(store, {
    previousPolicy: { policyRevision: 2, dimensions: { tokens: { constrained: true, mode: 'hard-cap', value: 50, unit: 'tokens' } }, acceptance: { actor: 'human' }, agentMutationConfirmation: 'required' },
    nextPolicy: { policyRevision: 3, dimensions: { tokens: { constrained: false } }, acceptance: { actor: 'agentic' }, agentMutationConfirmation: 'allowed' },
  });

  assert.equal(result.impacts[0].decision, 'confirmation-required');
  assert.equal(result.impacts[0].requiresUserConfirmation, true);
});

test('policy impact reads each JSON store key once per operation', () => {
  const values = new Map([
    ['omvra.goals.v1', [{ id: 'goal-1', title: 'Ship it', elements: [] }]],
    ['omvra.goalExecutions.v1', [{ id: 'execution-1', goalId: 'goal-1', state: 'working' }]],
    ['omvra.goalPolicyImpacts.v1', [{ goalId: 'goal-1', status: 'pending' }]],
  ]);
  const reads = new Map();
  const store = {
    get: key => {
      reads.set(key, (reads.get(key) || 0) + 1);
      return values.get(key);
    },
    set: (key, value) => values.set(key, value),
  };

  recordGoalPolicyChangeImpact(store, {
    previousPolicy: { policyRevision: 2 },
    nextPolicy: { policyRevision: 3 },
  });
  assert.equal(reads.get('omvra.goals.v1'), 1);
  assert.equal(reads.get('omvra.goalExecutions.v1'), 1);
  assert.equal(reads.get('omvra.goalPolicyImpacts.v1'), 1);

  reads.clear();
  assert.ok(getPendingGoalPolicyImpact(store, 'goal-1'));
  assert.equal(reads.get('omvra.goalPolicyImpacts.v1'), 1);
  reads.clear();
  resolveGoalPolicyImpact(store, 'goal-1', 'paused');
  assert.equal(reads.get('omvra.goalPolicyImpacts.v1'), 1);
});
