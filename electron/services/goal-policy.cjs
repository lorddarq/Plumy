const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getGoalScopedRequirements } = require('./goal-state-service.cjs');

const GOAL_POLICY_KEY = 'omvra.goalPolicy.v1';
const GOAL_POLICY_IMPACTS_KEY = 'omvra.goalPolicyImpacts.v1';

const ACTOR_RANK = { agentic: 1, human: 2, both: 3 };
const DIMENSIONS = ['financial', 'tokens', 'concurrency', 'attempts', 'retries'];

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function toLegacyDimension(policy, dimension) {
  const map = {
    financial: ['financialBudgetMode', 'maxFinancialCost', 'USD'],
    tokens: ['tokenBudgetMode', 'maxTokens', 'tokens'],
    concurrency: ['concurrencyBudgetMode', 'maxConcurrentLoops', 'loops'],
    attempts: ['loopAttemptsBudgetMode', 'maxLoopAttempts', 'attempts'],
    retries: ['retryBudgetMode', 'maxRetries', 'retries'],
  };
  const [modeKey, valueKey, unit] = map[dimension];
  if (!policy || typeof policy !== 'object') return undefined;
  const mode = policy[modeKey];
  const value = numberOrNull(policy[valueKey]);
  if (mode === 'unbounded') return { constrained: false };
  if (typeof mode === 'string' && value) return { constrained: true, mode, value, unit };
  return undefined;
}

function copyDimension(base, override, dimension) {
  if (!isRecord(override)) return base;
  if (override.constrained === false) return base.constrained === false ? base : base;
  if (override.constrained !== true) return base;
  if (!base.constrained) return { ...override };
  const value = numberOrNull(override.value);
  if (!value || value > base.value || override.unit !== base.unit) return base;
  return { ...base, ...override, constrained: true };
}

function applyPolicy(base, override) {
  if (!isRecord(override)) return base;
  const next = { ...base, dimensions: { ...base.dimensions } };
  const overrideDimensions = isRecord(override.dimensions) ? override.dimensions : {};
  for (const dimension of DIMENSIONS) {
    const explicit = overrideDimensions[dimension] ?? toLegacyDimension(override, dimension);
    next.dimensions[dimension] = copyDimension(next.dimensions[dimension], explicit, dimension);
  }
  const actor = override.acceptance?.actor ?? override.acceptanceActor;
  if (typeof actor === 'string' && ACTOR_RANK[actor]) {
    const current = next.acceptance.actor;
    next.acceptance = { ...next.acceptance, actor: ACTOR_RANK[actor] > ACTOR_RANK[current] ? actor : current };
  }
  if (override.agentMutationConfirmation === 'required') next.agentMutationConfirmation = 'required';
  if (override.rollover === 'dynamic') next.rollover = 'dynamic';
  return next;
}

function defaultPolicy() {
  return {
    schemaVersion: 1,
    policyRevision: 0,
    currency: 'USD',
    dimensions: {
      financial: { constrained: true, mode: 'hard-cap', value: 10, unit: 'USD' },
      tokens: { constrained: true, mode: 'hard-cap', value: 100000, unit: 'tokens' },
      concurrency: { constrained: true, mode: 'hard-cap', value: 1, unit: 'loops' },
      attempts: { constrained: true, mode: 'hard-cap', value: 10, unit: 'attempts' },
      retries: { constrained: true, mode: 'hard-cap', value: 2, unit: 'retries' },
    },
    acceptance: { actor: 'human' },
    agentMutationConfirmation: 'required',
    rollover: 'dynamic',
  };
}

function upstreamSubgoals(goal, targetElementId) {
  if (!goal || !targetElementId || !Array.isArray(goal.elements)) return [];
  const incoming = new Map();
  goal.elements.filter(element => element?.type === 'connector' && element.sourceId && element.targetId).forEach(connection => {
    const parents = incoming.get(connection.targetId) || [];
    parents.push(connection.sourceId);
    incoming.set(connection.targetId, parents);
  });
  const result = [];
  const visited = new Set([targetElementId]);
  const pending = [...(incoming.get(targetElementId) || [])];
  while (pending.length) {
    const id = pending.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const element = goal.elements.find(item => item?.id === id);
    if (element?.type === 'subgoal') result.unshift(element);
    pending.push(...(incoming.get(id) || []));
  }
  return result;
}

function resolveGoalPolicy({ workspacePolicy, goal, targetElementId } = {}) {
  const resolved = applyPolicy(defaultPolicy(), workspacePolicy);
  const goalOverride = goal?.policy;
  const target = goal?.elements?.find(element => element?.id === targetElementId);
  const scopes = [...upstreamSubgoals(goal, targetElementId), target].filter(Boolean);
  const effective = scopes.reduce((current, scope) => applyPolicy(current, scope.policy), applyPolicy(resolved, goalOverride));
  return {
    ...effective,
    currency: typeof workspacePolicy?.currency === 'string' ? workspacePolicy.currency : effective.currency,
    sourceRevision: Number.isFinite(Number(workspacePolicy?.policyRevision)) ? Math.floor(Number(workspacePolicy.policyRevision)) : 0,
    sources: {
      workspace: workspacePolicy ? 'explicit' : 'safe-default',
      goal: goalOverride ? 'explicit' : 'inherited',
      target: target?.policy ? 'explicit' : 'inherited',
    },
  };
}

function buildGoalContractPacket({ goal, effectivePolicy, executionAttempt = 1, now = () => new Date().toISOString(), inputResolution, capabilityResolution } = {}) {
  const elements = Array.isArray(goal?.elements) ? goal.elements : [];
  const deliverables = elements
    .filter(item => item?.type === 'deliverable')
    .map(item => ({
      id: item.id,
      title: item.title,
      body: item.body,
      deliverySpec: item.deliverySpec,
      deliverableStatus: item.deliverableStatus,
    }));
  const artifactContributions = elements
    .filter(item => ['goal', 'subgoal'].includes(item?.type))
    .flatMap(item => (Array.isArray(item.artifactReferences) ? item.artifactReferences : []).filter(reference => ['dependency', 'evidence'].includes(reference?.contribution)).map(reference => ({
      ...reference,
      elementId: item.id,
    })));
  const requirements = getGoalScopedRequirements(goal);
  const references = {
    objective: goal?.title,
    scope: goal?.scope ?? goal?.scopedInstructions ?? goal?.description,
    instructions: goal?.instructions ?? elements.filter(item => item?.type === 'instructions').map(item => item.instructions || item.content || item.title).filter(Boolean),
    outputs: goal?.outputs ?? goal?.expectedOutputs ?? deliverables,
    artifactContributions,
    inputs: requirements.inputs,
    capabilities: requirements.capabilities,
    inputResolution,
    capabilityResolution,
    constraints: goal?.constraints,
    permissions: effectivePolicy?.permissions ?? goal?.permissions,
    acceptance: goal?.acceptance ?? effectivePolicy?.acceptance,
    evidence: goal?.evidenceRequirements ?? goal?.evidence,
    handoff: goal?.handoff,
    sequence: goal?.sequence ?? goal?.dependencies,
    budget: goal?.budget ?? effectivePolicy?.dimensions,
    project: goal?.project ?? goal?.projectId,
    roster: goal?.roster ?? goal?.rosterContext ?? elements.filter(item => item?.type === 'agent').map(item => ({ id: item.id, title: item.title, assigneeId: item.assigneeId, agentConfiguration: item.agentConfiguration })),
  };
  const stable = {
    goalId: goal?.id,
    contractRevision: Number(goal?.revision || goal?.__mcpRevision || 0),
    objective: goal?.title,
    references,
    effectivePolicy,
    policyRevision: effectivePolicy?.sourceRevision ?? effectivePolicy?.policyRevision ?? 0,
    executionAttempt,
  };
  const contractHash = `sha256-${crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex')}`;
  return {
    contractId: `contract_${goal?.id || 'unknown'}_${executionAttempt}`,
    contractRevision: stable.contractRevision,
    goalId: goal?.id,
    objective: goal?.title,
    references,
    inputResolution,
    capabilityResolution,
    effectivePolicy,
    policyRevision: stable.policyRevision,
    executionAttempt,
    contractHash,
    generatedAt: now(),
  };
}

function isAgentMutationAllowed(store, confirmed = false) {
  const policy = store?.get?.(GOAL_POLICY_KEY);
  if (policy?.agentMutationConfirmation === 'allowed') return { allowed: true };
  if (confirmed === true) return { allowed: true };
  return { allowed: false, error: 'HUMAN_CONFIRMATION_REQUIRED', message: 'Agent-originated Goal graph mutation requires human confirmation.' };
}

function policyChanged(previous, next) {
  return !isDeepStrictEqual(previous || {}, next || {});
}

function isWidening(previous, next) {
  return DIMENSIONS.some(dimension => {
    const before = previous?.dimensions?.[dimension];
    const after = next?.dimensions?.[dimension];
    if (!before || !after) return false;
    if (before.constrained && !after.constrained) return true;
    return before.constrained && after.constrained && Number(after.value) > Number(before.value);
  }) || ACTOR_RANK[next?.acceptance?.actor] < ACTOR_RANK[previous?.acceptance?.actor]
    || (previous?.agentMutationConfirmation === 'required' && next?.agentMutationConfirmation === 'allowed');
}

function recordGoalPolicyChangeImpact(store, { previousPolicy, nextPolicy, actor = 'workspace-settings', now = () => new Date().toISOString() } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
    return { ok: false, error: 'STORE_REQUIRED', message: 'A synchronous store with get/set methods is required.' };
  }
  if (!policyChanged(previousPolicy, nextPolicy)) return { ok: true, changed: false, impacts: [] };
  const goals = Array.isArray(store.get('omvra.goals.v1')) ? store.get('omvra.goals.v1') : [];
  const executions = Array.isArray(store.get('omvra.goalExecutions.v1')) ? store.get('omvra.goalExecutions.v1') : [];
  const activeStates = new Set(['ready', 'working', 'evidence-required', 'handoff-pending', 'paused', 'approval-required', 'blocked']);
  const impacts = executions.filter(execution => activeStates.has(execution?.state)).map(execution => {
    const goal = goals.find(item => item?.id === execution.goalId);
    const before = resolveGoalPolicy({ workspacePolicy: previousPolicy, goal, targetElementId: execution.targetElementId });
    const after = resolveGoalPolicy({ workspacePolicy: nextPolicy, goal, targetElementId: execution.targetElementId });
    const widening = isWidening(before, after);
    return {
      impactId: `policy-impact_${execution.goalId}_${nextPolicy?.policyRevision ?? 0}`,
      goalId: execution.goalId,
      executionId: execution.id,
      priorPolicyRevision: previousPolicy?.policyRevision ?? 0,
      effectivePolicyRevision: nextPolicy?.policyRevision ?? 0,
      decision: widening ? 'confirmation-required' : 'pause-and-review',
      status: 'pending',
      requiresUserConfirmation: widening,
      previousPolicy: before,
      effectivePolicy: after,
      actor,
      createdAt: now(),
    };
  });
  const records = Array.isArray(store.get(GOAL_POLICY_IMPACTS_KEY)) ? store.get(GOAL_POLICY_IMPACTS_KEY) : [];
  store.set(GOAL_POLICY_IMPACTS_KEY, records.concat(impacts).slice(-200));
  return { ok: true, changed: true, impacts };
}

function getPendingGoalPolicyImpact(store, goalId) {
  const impacts = Array.isArray(store?.get?.(GOAL_POLICY_IMPACTS_KEY)) ? store.get(GOAL_POLICY_IMPACTS_KEY) : [];
  return impacts.find(impact => impact?.goalId === goalId && impact.status === 'pending') || null;
}

function resolveGoalPolicyImpact(store, goalId, decision, now = () => new Date().toISOString()) {
  const impacts = Array.isArray(store?.get?.(GOAL_POLICY_IMPACTS_KEY)) ? store.get(GOAL_POLICY_IMPACTS_KEY) : [];
  let changed = false;
  const next = impacts.map(impact => {
    if (impact?.goalId !== goalId || impact.status !== 'pending') return impact;
    changed = true;
    return { ...impact, status: decision, resolvedAt: now() };
  });
  if (changed) store.set(GOAL_POLICY_IMPACTS_KEY, next);
  return changed;
}

module.exports = {
  GOAL_POLICY_KEY,
  GOAL_POLICY_IMPACTS_KEY,
  DIMENSIONS,
  buildGoalContractPacket,
  defaultPolicy,
  isAgentMutationAllowed,
  getPendingGoalPolicyImpact,
  recordGoalPolicyChangeImpact,
  resolveGoalPolicyImpact,
  resolveGoalPolicy,
};
