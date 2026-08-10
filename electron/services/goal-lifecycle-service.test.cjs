const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createGoalLifecycleService, EVENTS_KEY, EXECUTIONS_KEY, EVIDENCE_KEY, HANDOFFS_KEY } = require('./goal-lifecycle-service.cjs');

function makeStore() {
  const values = new Map([
    ['omvra.goals.v1', [{ id: 'goal-1', title: 'Ship it' }]],
  ]);
  return {
    get(key) { return values.get(key); },
    set(key, value) { values.set(key, value); },
  };
}

function makeClock() {
  let tick = 0;
  return () => `2026-07-18T00:00:0${tick++}.000Z`;
}

test('lifecycle transitions require evidence, acceptance, and revisions', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });

  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start-1' });
  assert.equal(started.ok, true);
  assert.equal(started.execution.state, 'ready');
  assert.equal(lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 1, commandId: 'start-2' }).error, 'EXECUTION_EXISTS');
  lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'ack-1', payload: { contractRevision: 0 } });

  const dispatched = lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch-1' });
  assert.equal(dispatched.execution.state, 'working');

  const missingEvidence = lifecycle.execute({ goalId: 'goal-1', command: 'request-handoff', expectedRevision: 3, commandId: 'handoff-1' });
  assert.equal(missingEvidence.error, 'EVIDENCE_REQUIRED');

  const evidence = lifecycle.execute({ goalId: 'goal-1', command: 'submit-evidence', expectedRevision: 3, commandId: 'evidence-1', payload: { evidenceRefs: ['evidence-1'] } });
  assert.equal(evidence.execution.state, 'evidence-required');
  assert.equal(store.get(EVIDENCE_KEY).length, 1);
  assert.match(store.get(EVIDENCE_KEY)[0].id, /^evidence_/);

  const handoff = lifecycle.execute({ goalId: 'goal-1', command: 'request-handoff', expectedRevision: 4, commandId: 'handoff-2' });
  assert.equal(handoff.execution.state, 'handoff-pending');
  assert.equal(store.get(HANDOFFS_KEY).length, 1);

  const accepted = lifecycle.execute({ goalId: 'goal-1', command: 'accept', expectedRevision: 5, commandId: 'accept-1', payload: { finalEvidenceVerified: true, acceptedBy: 'human-1' } });
  assert.equal(accepted.execution.state, 'handoff-pending');
  assert.equal(accepted.execution.acceptanceSatisfied, true);

  const blocked = lifecycle.execute({ goalId: 'goal-1', command: 'complete', expectedRevision: 6, commandId: 'complete-1', payload: { finalEvidenceVerified: false } });
  assert.equal(blocked.error, 'EVIDENCE_REQUIRED');

  const completed = lifecycle.execute({ goalId: 'goal-1', command: 'complete', expectedRevision: 6, commandId: 'complete-2', payload: { finalEvidenceVerified: true } });
  assert.equal(completed.execution.state, 'complete');
  assert.equal(completed.cleanup.status, 'skipped');
  assert.equal(store.get(EXECUTIONS_KEY)[0].state, 'complete');
});

test('lifecycle execution and event state share one Electron-store write', () => {
  const values = new Map([
    ['omvra.goals.v1', [{ id: 'goal-1', title: 'Ship it' }]],
  ]);
  let snapshotWrites = 0;
  const store = {
    get: key => values.get(key),
    set: (key, value) => values.set(key, value),
  };
  Object.defineProperty(store, 'store', {
    get: () => Object.fromEntries(values),
    set: next => {
      snapshotWrites += 1;
      values.clear();
      Object.entries(next).forEach(([key, value]) => values.set(key, value));
    },
    configurable: true,
  });

  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'batch-start' });

  assert.equal(started.ok, true);
  assert.equal(snapshotWrites, 1);
  assert.equal(values.get(EXECUTIONS_KEY).length, 1);
  assert.equal(values.get(EVENTS_KEY).length, 1);
});

test('projectless Goals carry typed requirements into the contract packet', () => {
  const store = makeStore();
  store.set('omvra.goals.v1', [{
    id: 'goal-1',
    title: 'Typed contract',
    inputs: [{ id: 'brief', kind: 'inline', value: 'Use the supplied brief.' }],
    capabilities: [{ id: 'read', capabilityId: 'files.read', source: 'local', version: '1.0.0' }],
  }]);
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  const started = lifecycle.execute({
    goalId: 'goal-1',
    command: 'start',
    expectedRevision: 0,
    commandId: 'typed-start',
    payload: { availableCapabilities: [{ capabilityId: 'files.read', version: '1.0.0', source: 'local' }] },
  });
  assert.equal(started.ok, true);
  assert.equal(started.execution.contractPacket.references.inputs[0].id, 'brief');
  assert.equal(started.execution.contractPacket.references.capabilities[0].capabilityId, 'files.read');
  assert.equal(started.execution.contractPacket.inputResolution.ok, true);
  assert.equal(started.execution.contractPacket.capabilityResolution.ok, true);
});

test('required typed requirements block setup before an execution is persisted', () => {
  const store = makeStore();
  store.set('omvra.goals.v1', [{
    id: 'goal-1',
    title: 'Blocked contract',
    inputs: [{ id: 'brief', kind: 'inline', value: 'present' }],
    capabilities: [{ id: 'missing-capability', capabilityId: 'missing.write', source: 'mcp' }],
  }]);
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  const result = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'blocked-start' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'GOAL_CAPABILITY_DENIED');
  assert.deepEqual(store.get(EXECUTIONS_KEY) ?? [], []);
});

test('Goal lifecycle events are backfilled and appended to the configured external audit archive', () => {
  const store = makeStore();
  const archiveDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-goal-lifecycle-audit-'));
  store.set('omvra.preferences.v1', { goalAuditArchiveDirectory: archiveDirectory });
  store.set(EVENTS_KEY, [{ id: 'historical-event', goalId: 'goal-1', type: 'goal.historical', createdAt: '2026-07-18T00:00:00.000Z' }]);

  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'archive-start' });
  const archivePath = path.join(archiveDirectory, 'goal-lifecycle-audit.jsonl');
  const readArchive = () => fs.readFileSync(archivePath, 'utf8').trim().split('\n').map(line => JSON.parse(line));

  assert.equal(started.auditArchive.status, 'written');
  assert.deepEqual(readArchive().map(item => item.eventId), ['historical-event', started.event.id]);

  createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  assert.equal(readArchive().length, 2);
  fs.rmSync(archiveDirectory, { recursive: true, force: true });
});

test('completed Goals can start a new immutable execution attempt', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'run-1-start' });
  lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'run-1-ack', payload: { contractRevision: 0 } });
  lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'run-1-dispatch' });
  lifecycle.execute({ goalId: 'goal-1', command: 'submit-evidence', expectedRevision: 3, commandId: 'run-1-evidence', payload: { evidenceRefs: ['run-1-evidence'] } });
  lifecycle.execute({ goalId: 'goal-1', command: 'request-handoff', expectedRevision: 4, commandId: 'run-1-handoff' });
  lifecycle.execute({ goalId: 'goal-1', command: 'accept', expectedRevision: 5, commandId: 'run-1-accept', payload: { finalEvidenceVerified: true } });
  const completed = lifecycle.execute({ goalId: 'goal-1', command: 'complete', expectedRevision: 6, commandId: 'run-1-complete', payload: { finalEvidenceVerified: true } });

  const rerun = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'run-2-start' });

  assert.equal(completed.execution.state, 'complete');
  assert.equal(rerun.ok, true);
  assert.equal(rerun.execution.state, 'ready');
  assert.equal(rerun.execution.attempt, 2);
  assert.equal(rerun.execution.supersedesExecutionId, completed.execution.id);
  assert.equal(rerun.execution.id === completed.execution.id, false);
  assert.equal(store.get(EXECUTIONS_KEY).length, 2);
  assert.equal(store.get(EXECUTIONS_KEY)[0].state, 'complete');
  assert.equal(store.get(EXECUTIONS_KEY)[1].id, rerun.execution.id);
});

test('reset preserves the attempt while returning the Goal to not-started runtime state', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'reset-start' });
  const reset = lifecycle.execute({ goalId: 'goal-1', command: 'reset', expectedRevision: 1, commandId: 'reset-command', actor: 'human', payload: { humanConfirmed: true } });

  assert.equal(reset.ok, true);
  assert.equal(reset.execution.id, started.execution.id);
  assert.equal(reset.execution.state, 'abandoned');
  assert.equal(typeof reset.execution.resetAt, 'string');
  assert.equal(store.get(EXECUTIONS_KEY).length, 1);
  assert.equal(lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'reset-next-start' }).execution.attempt, 2);
});

test('stale execution GC reports candidates and abandons only with confirmation', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: () => '2026-07-21T00:00:00.000Z' });
  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'stale-start' });
  store.set(EXECUTIONS_KEY, [{ ...started.execution, updatedAt: '2026-06-01T00:00:00.000Z' }]);

  const candidates = lifecycle.collectStaleExecutions({ maxAgeMs: 7 * 24 * 60 * 60 * 1000, at: '2026-07-21T00:00:00.000Z' });
  assert.equal(candidates.applied, false);
  assert.deepEqual(candidates.candidates.map(item => item.executionId), [started.execution.id]);

  const denied = lifecycle.collectStaleExecutions({ maxAgeMs: 7 * 24 * 60 * 60 * 1000, apply: true, at: '2026-07-21T00:00:00.000Z' });
  assert.equal(denied.error, 'HUMAN_CONFIRMATION_REQUIRED');

  const collected = lifecycle.collectStaleExecutions({ maxAgeMs: 7 * 24 * 60 * 60 * 1000, apply: true, humanConfirmed: true, at: '2026-07-21T00:00:00.000Z' });
  assert.equal(collected.applied, true);
  assert.equal(collected.results[0].execution.state, 'abandoned');
  assert.equal(lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'after-gc-start' }).execution.state, 'ready');
});

test('acknowledgement remains valid for the following dispatch', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'contract-start' });
  const packet = started.execution.contractPacket;
  const acknowledged = lifecycle.execute({
    goalId: 'goal-1',
    command: 'acknowledge',
    expectedRevision: 1,
    commandId: 'contract-ack',
    payload: { contractRevision: packet.contractRevision, contractHash: packet.contractHash },
  });
  assert.equal(acknowledged.ok, true);
  assert.equal(acknowledged.execution.acknowledgedContractHash, packet.contractHash);
  const dispatched = lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'contract-dispatch' });
  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.execution.state, 'working');
});

test('terminal handoff records produced outputs as immutable runtime evidence', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start-handoff' });
  lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'ack-handoff', payload: { contractRevision: 0 } });
  lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch-handoff' });
  lifecycle.execute({ goalId: 'goal-1', command: 'submit-evidence', expectedRevision: 3, commandId: 'evidence-handoff', payload: { evidenceRefs: ['supporting-input'] } });
  const result = lifecycle.execute({ goalId: 'goal-1', command: 'request-handoff', expectedRevision: 4, commandId: 'request-handoff', payload: { deliverableId: 'deliverable-1', producedArtifactReferences: [{ label: 'Final report', locator: 'file:///tmp/report.pdf' }], deliveryFacts: { recipient: 'user' } } });
  assert.equal(result.event.payload.handoffRecord.immutable, true);
  assert.equal(store.get(HANDOFFS_KEY)[0].producedArtifactReferences[0].label, 'Final report');
  assert.equal(store.get(HANDOFFS_KEY)[0].deliveryFacts.recipient, 'user');
  const duplicate = lifecycle.execute({ goalId: 'goal-1', command: 'request-handoff', expectedRevision: 5, commandId: 'request-handoff', payload: { producedArtifactReferences: [{ label: 'Duplicate' }] } });
  assert.equal(duplicate.idempotent, true);
  assert.equal(store.get(HANDOFFS_KEY).length, 1);
});

test('acceptance also requires verified final evidence', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });

  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start' });
  lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'ack', payload: { contractRevision: 0 } });
  lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch' });
  lifecycle.execute({ goalId: 'goal-1', command: 'submit-evidence', expectedRevision: 3, commandId: 'evidence', payload: { evidenceRefs: ['final'] } });
  lifecycle.execute({ goalId: 'goal-1', command: 'request-handoff', expectedRevision: 4, commandId: 'handoff' });

  const blocked = lifecycle.execute({ goalId: 'goal-1', command: 'accept', expectedRevision: 5, commandId: 'accept-1', payload: { finalEvidenceVerified: false } });
  assert.equal(blocked.error, 'EVIDENCE_REQUIRED');
  const accepted = lifecycle.execute({ goalId: 'goal-1', command: 'accept', expectedRevision: 5, commandId: 'accept-2', payload: { finalEvidenceVerified: true } });
  assert.equal(accepted.execution.state, 'handoff-pending');
  const completed = lifecycle.execute({ goalId: 'goal-1', command: 'complete', expectedRevision: 6, commandId: 'complete', payload: { finalEvidenceVerified: true } });
  assert.equal(completed.execution.state, 'complete');
});

test('deliverable contract changes invalidate the acknowledged execution contract', () => {
  const store = makeStore();
  store.set('omvra.goals.v1', [{ id: 'goal-1', title: 'Ship it', elements: [{ id: 'deliverable-1', type: 'deliverable', title: 'Report', deliverySpec: { outcomeKind: 'file', instructions: 'Deliver PDF' } }] }]);
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start-deliverable' });
  const packet = started.execution.contractPacket;
  lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'ack-deliverable', payload: { contractRevision: packet.contractRevision, contractHash: packet.contractHash } });
  store.set('omvra.goals.v1', [{ id: 'goal-1', title: 'Ship it', elements: [{ id: 'deliverable-1', type: 'deliverable', title: 'Report', deliverySpec: { outcomeKind: 'summary', instructions: 'Deliver a summary' } }] }]);
  const stale = lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch-deliverable' });
  assert.equal(stale.error, 'CONTRACT_STALE');
});

test('acknowledgement records receipt without completing or changing execution state', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });

  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start' });
  const acknowledged = lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'ack', payload: { contractRevision: started.execution.contractPacket.contractRevision, contractHash: started.execution.contractPacket.contractHash } });
  assert.equal(acknowledged.execution.state, 'ready');
  assert.equal(acknowledged.execution.acknowledged, true);
  assert.equal(acknowledged.execution.acknowledgedContractRevision, started.execution.contractPacket.contractRevision);
});

test('lifecycle execution carries the resolved policy into the contract packet and validation inputs', () => {
  const store = makeStore();
  store.set('omvra.goalPolicy.v1', {
    policyRevision: 6,
    dimensions: { retries: { constrained: true, mode: 'hard-cap', value: 1, unit: 'retries' } },
    acceptance: { actor: 'human' },
  });
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start-policy' });
  assert.equal(started.execution.effectivePolicy.sourceRevision, 6);
  assert.equal(started.execution.contractPacket.policyRevision, 6);
  assert.equal(started.execution.contractPacket.effectivePolicy.acceptance.actor, 'human');
});

test('Goal setup blocks before persistence when a required skill is missing', () => {
  const store = makeStore();
  store.set('omvra.goals.v1', [{ id: 'goal-1', title: 'Needs skill', requiredSkills: [{ skillId: 'does-not-exist', stage: 'implementation', persona: 'backend-engineer' }] }]);
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  const blocked = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start-missing-skill' });
  assert.equal(blocked.error, 'SKILL_PREFLIGHT_BLOCKED');
  assert.equal(blocked.skillResolution.blockingResults[0].code, 'MISSING_SKILL');
  assert.equal(store.get(EXECUTIONS_KEY), undefined);
});

test('Goal skill preflight uses explicitly configured roots from persisted preferences', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-skills-'));
  fs.writeFileSync(path.join(root, 'local.md'), '# Local\n');
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ schemaVersion: 1, skills: [{
    skillId: 'local-skill', version: '1.0.0', entrypoint: 'local.md', supportedStages: ['implementation'], supportedPersonas: ['backend-engineer'], trustStatus: 'trusted',
  }] }));
  const store = makeStore();
  store.set('omvra.preferences.v1', { skillRoots: [{ root }] });
  store.set('omvra.goals.v1', [{ id: 'goal-1', title: 'Configured skill', requiredSkills: [{ skillId: 'local-skill', stage: 'implementation', persona: 'backend-engineer' }] }]);
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start-configured-skill' });
  assert.equal(started.ok, true);
  assert.equal(started.execution.contractPacket.skillReferences[0].source, 'omvra-configured');
  fs.rmSync(root, { recursive: true, force: true });
});

test('acknowledgement carries contract hash, policy revision, and resolved skill references', () => {
  const store = makeStore();
  store.set('omvra.goals.v1', [{ id: 'goal-1', title: 'Use skill', requiredSkills: [{ skillId: 'process-modeler', stage: 'qa', persona: 'qa' }] }]);
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start-skill' });
  const packet = started.execution.contractPacket;
  const acknowledged = lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'ack-skill', payload: { contractRevision: packet.contractRevision, contractHash: packet.contractHash } });
  assert.equal(acknowledged.execution.acknowledgedContractHash, packet.contractHash);
  assert.deepEqual(acknowledged.execution.acknowledgedSkillReferences, packet.skillReferences);
  assert.equal(acknowledged.event.payload.policyRevision, packet.policyRevision);
});

test('agent delegation contract packets resolve canonical profiles and keep ephemeral agents persona-free', () => {
  const store = makeStore();
  store.set('omvra.people.v1', [{ id: 'canonical-1', kind: 'agentic', agentInstructions: 'Persona', agentOperationalInstructions: 'Method' }]);
  store.set('omvra.goals.v1', [{ id: 'goal-1', title: 'Delegate', elements: [
    { id: 'existing', type: 'agent', title: 'Existing', agentConfiguration: { mode: 'existing', assigneeId: 'canonical-1', instructions: 'Node task' } },
    { id: 'ephemeral', type: 'agent', title: 'Temporary', agentConfiguration: { mode: 'ephemeral', autoGenerateName: true, requestedType: 'researcher', instructions: 'Research task', workAsSubagent: true } },
  ] }]);
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });

  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start-agent-contract' });
  const delegations = started.execution.contractPacket.agentDelegations;
  assert.equal(delegations[0].profileSource, 'canonical');
  assert.equal(delegations[0].personaInstructions, 'Persona');
  assert.equal(delegations[0].instructions, 'Node task');
  assert.equal(delegations[1].status, 'recruitment-requested');
  assert.equal(delegations[1].autoGenerateName, true);
  assert.equal(delegations[1].profileSource, 'none');
  assert.equal('personaInstructions' in delegations[1], false);
  assert.equal(started.execution.contractPacket.recruitmentRequests[0].rationale.includes('explicitly requests'), true);
  assert.equal(started.execution.contractPacket.workerDelegation.owner, 'working-agent');
  assert.equal(started.execution.contractPacket.workerDelegation.omvraSpawnsAgents, false);
  assert.equal(started.execution.contractPacket.workerDelegation.required, true);
  assert.match(started.execution.contractPacket.workerDelegation.instructions, /your own available subagent runtime/i);
});

test('working execution exposes pending worker-owned recruitment until reported', () => {
  const store = makeStore();
  store.set('omvra.goals.v1', [{ id: 'goal-1', title: 'Delegate', elements: [
    { id: 'ephemeral', type: 'agent', title: 'Temporary', agentConfiguration: { mode: 'ephemeral', autoGenerateName: true, requestedType: 'researcher', instructions: 'Research task', workAsSubagent: true } },
  ] }]);
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start-recruitment' });
  lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'ack-recruitment', payload: { contractRevision: 0 } });
  const dispatched = lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch-recruitment' });
  assert.equal(dispatched.execution.state, 'working');
  assert.equal(dispatched.execution.workerDelegationStatus, 'required');
  const reported = lifecycle.execute({
    goalId: 'goal-1', command: 'report-recruitment', expectedRevision: 3, commandId: 'report-recruitment',
    payload: { recruitmentResults: [{ elementId: 'ephemeral', status: 'active', agentId: 'subagent-1' }] },
  });
  assert.equal(reported.execution.state, 'working');
  assert.equal(reported.execution.workerDelegationStatus, 'fulfilled');
  assert.equal(reported.execution.workerDelegationResults[0].agentId, 'subagent-1');
});

test('dispatch rejects unavailable canonical agent references unless fallback is enabled', () => {
  const store = makeStore();
  store.set('omvra.goals.v1', [{ id: 'goal-1', title: 'Unavailable', elements: [{ id: 'agent-node', type: 'agent', title: 'Missing', agentConfiguration: { mode: 'existing', assigneeId: 'gone', instructions: 'Do not reassign' } }] }]);
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start-unavailable' });
  lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'ack-unavailable', payload: { contractRevision: 0 } });
  const blocked = lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch-unavailable', payload: { targetElementId: 'agent-node' } });
  assert.equal(blocked.error, 'AGENT_UNAVAILABLE');

  store.set('omvra.goals.v1', [{ id: 'goal-1', title: 'Fallback', elements: [{ id: 'agent-node', type: 'agent', title: 'Missing', agentConfiguration: { mode: 'existing', assigneeId: 'gone', instructions: 'Recruit if needed', spawnIfUnavailable: true, workAsSubagent: true } }] }]);
  const allowed = lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch-fallback', payload: { targetElementId: 'agent-node' } });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.execution.contractPacket.recruitmentRequests[0].rationale.includes('unavailable'), true);
});

test('pending policy impact gate blocks continuation until pause and confirmation', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start-impact' });
  store.set('omvra.goalPolicyImpacts.v1', [{ goalId: 'goal-1', executionId: 'execution_1', status: 'pending', decision: 'confirmation-required' }]);
  const blocked = lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 1, commandId: 'dispatch-impact' });
  assert.equal(blocked.error, 'POLICY_IMPACT_GATE_REQUIRED');
  const paused = lifecycle.execute({ goalId: 'goal-1', command: 'pause', expectedRevision: 1, commandId: 'pause-impact' });
  assert.equal(paused.execution.state, 'paused');
  assert.equal(store.get('omvra.goalPolicyImpacts.v1')[0].status, 'paused');
});

test('stale revisions fail and repeated command ids are idempotent', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });

  const first = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'same-command' });
  const stale = lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 0, commandId: 'stale-command' });
  assert.equal(stale.error, 'REVISION_MISMATCH');

  const duplicate = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'same-command' });
  assert.equal(duplicate.idempotent, true);
  assert.equal(duplicate.event.id, first.event.id);
  assert.equal(store.get(EVENTS_KEY).length, 1);
});

test('scheduled dispatch survives a lost response without duplicating lifecycle work', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), cleanup: () => ({ status: 'skipped', ok: true }) });
  const scheduledFor = '2026-07-20T07:30@UTC';
  lifecycle.execute({
    goalId: 'goal-1', command: 'start', expectedRevision: 0,
    commandId: `schedule:schedule-1:${scheduledFor}`,
    payload: { scheduleId: 'schedule-1', occurrenceId: 'occurrence-1', scheduledFor, temporalMode: 'anchored' },
  });
  lifecycle.execute({
    goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1,
    commandId: `schedule:schedule-1:${scheduledFor}:acknowledge`, payload: { contractRevision: 0 },
  });

  const commandId = `schedule:schedule-1:${scheduledFor}:dispatch`;
  const committed = lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId });
  assert.equal(committed.execution.state, 'working');

  const retried = lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId });
  assert.equal(retried.idempotent, true);
  assert.equal(retried.event.id, committed.event.id);
  assert.equal(store.get(EXECUTIONS_KEY).length, 1);
  assert.equal(store.get(EVENTS_KEY).filter(event => event.commandId === commandId).length, 1);
});

test('retry budget blocks further retries and cleanup runs after durable completion', () => {
  const store = makeStore();
  const cleanupCalls = [];
  const lifecycle = createGoalLifecycleService({
    store,
    now: makeClock(),
    cleanup(input) {
      cleanupCalls.push({ stateAtCall: store.get(EXECUTIONS_KEY)[0].state, input });
      return { ok: true, status: 'cleaned', removedFiles: ['project.md'] };
    },
  });

  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start' });
  lifecycle.execute({ goalId: 'goal-1', command: 'fail', expectedRevision: 1, commandId: 'fail', payload: { reason: 'test' } });
  const retry = lifecycle.execute({ goalId: 'goal-1', command: 'retry', expectedRevision: 2, commandId: 'retry', payload: { maxRetries: 1 } });
  assert.equal(retry.execution.retryCount, 1);
  lifecycle.execute({ goalId: 'goal-1', command: 'fail', expectedRevision: 3, commandId: 'fail-2', payload: { reason: 'test again' } });
  const exhausted = lifecycle.execute({ goalId: 'goal-1', command: 'retry', expectedRevision: 4, commandId: 'retry-2', payload: { maxRetries: 1 } });
  assert.equal(exhausted.error, 'BUDGET_EXHAUSTED');

  assert.equal(cleanupCalls.length, 0);
});

test('cleanup failure does not downgrade a completed execution', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({
    store,
    now: makeClock(),
    cleanup() { throw new Error('disk unavailable'); },
  });

  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start' });
  lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'ack', payload: { contractRevision: 0 } });
  lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch' });
  lifecycle.execute({ goalId: 'goal-1', command: 'submit-evidence', expectedRevision: 3, commandId: 'evidence', payload: { evidenceRefs: ['final'] } });
  lifecycle.execute({ goalId: 'goal-1', command: 'request-handoff', expectedRevision: 4, commandId: 'handoff' });
  const result = lifecycle.execute({ goalId: 'goal-1', command: 'complete', expectedRevision: 5, commandId: 'complete', payload: { finalEvidenceVerified: true, acceptanceSatisfied: true } });

  assert.equal(result.execution.state, 'complete');
  assert.equal(result.cleanup.status, 'partial-failure');
  assert.equal(store.get(EXECUTIONS_KEY)[0].state, 'complete');
});

test('cleanup failure is pending, explicitly retryable, and archived externally', () => {
  const store = makeStore();
  const archiveDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-goal-audit-'));
  store.set('omvra.preferences.v1', { goalAuditArchiveDirectory: archiveDirectory });
  let cleanupCalls = 0;
  const lifecycle = createGoalLifecycleService({
    store,
    now: makeClock(),
    cleanup() {
      cleanupCalls += 1;
      return cleanupCalls === 1
        ? { ok: false, status: 'partial-failure', reason: 'artifact locked', requestedFiles: ['project.md'], removedFiles: [] }
        : { ok: true, status: 'cleaned', requestedFiles: ['project.md', 'roster.md'], removedFiles: ['project.md', 'roster.md'] };
    },
  });

  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start' });
  lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'ack', payload: { contractRevision: 0 } });
  lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch' });
  lifecycle.execute({ goalId: 'goal-1', command: 'submit-evidence', expectedRevision: 3, commandId: 'evidence', payload: { evidenceRefs: ['final'] } });
  lifecycle.execute({ goalId: 'goal-1', command: 'request-handoff', expectedRevision: 4, commandId: 'handoff' });
  lifecycle.execute({ goalId: 'goal-1', command: 'accept', expectedRevision: 5, commandId: 'accept', payload: { finalEvidenceVerified: true } });
  const completed = lifecycle.execute({ goalId: 'goal-1', command: 'complete', expectedRevision: 6, commandId: 'complete', payload: { finalEvidenceVerified: true } });

  assert.equal(completed.execution.state, 'complete');
  assert.equal(completed.execution.cleanupPending, true);
  assert.equal(store.get('omvra.goalReconciliations.v1').at(-1).kind, 'cleanup');
  assert.equal(lifecycle.reconcilePending().executions[0].cleanupPending, true);
  assert.equal(lifecycle.execute({ goalId: 'goal-1', command: 'retry-cleanup', expectedRevision: completed.execution.revision, commandId: 'retry-without-confirmation' }).error, 'HUMAN_CONFIRMATION_REQUIRED');

  const retried = lifecycle.execute({ goalId: 'goal-1', command: 'retry-cleanup', expectedRevision: completed.execution.revision, commandId: 'retry-cleanup', payload: { humanConfirmed: true } });
  assert.equal(retried.execution.state, 'complete');
  assert.equal(retried.execution.cleanupStatus, 'cleaned');
  assert.equal(retried.execution.cleanupPending, false);
  assert.equal(store.get('omvra.goalReconciliations.v1').some(item => item.status === 'pending'), false);

  const auditLines = fs.readFileSync(path.join(archiveDirectory, 'goal-cleanup-audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(auditLines.length, 2);
  assert.deepEqual(auditLines.map(item => item.attempt), [1, 2]);
});

test('dispatch enforces acknowledgement, conditions, approval gates, and dependencies', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock() });
  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start' });
  assert.equal(lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 1, commandId: 'dispatch-no-ack' }).error, 'ACKNOWLEDGEMENT_REQUIRED');
  lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'ack', payload: { contractRevision: 0 } });
  assert.equal(lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch-blocked', payload: { predecessorStates: ['working'] } }).error, 'DEPENDENCY_BLOCKED');
  assert.equal(lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch-gated', payload: { conditionPending: true } }).error, 'APPROVAL_REQUIRED');
  const dispatched = lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch-ok', payload: { predecessorStates: ['complete'], conditionResult: true, approvalGateStatus: 'passed' } });
  assert.equal(dispatched.execution.state, 'working');
});

test('coordination commands persist delegation, retry, escalation, approval, and handoff events', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock() });
  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start' });
  const delegated = lifecycle.execute({ goalId: 'goal-1', command: 'delegate', expectedRevision: 1, commandId: 'delegate', payload: { assigneeId: 'agent-2' } });
  assert.equal(delegated.execution.delegatedTo, 'agent-2');
  lifecycle.execute({ goalId: 'goal-1', command: 'escalate', expectedRevision: 2, commandId: 'escalate', payload: { reason: 'needs-review' } });
  const approved = lifecycle.execute({ goalId: 'goal-1', command: 'approve', expectedRevision: 3, commandId: 'approve', payload: { approvalGranted: true, approvedBy: 'human-1' } });
  assert.equal(approved.execution.state, 'ready');
  const eventTypes = store.get('omvra.goalExecutionEvents.v1').map(event => event.type);
  assert.ok(eventTypes.includes('goal.delegated'));
  assert.ok(eventTypes.includes('goal.failure') === false);
  assert.ok(eventTypes.includes('goal.approval.granted'));
});

test('human acceptance mode stops completion until the required actor accepts', () => {
  const store = makeStore();
  store.set('omvra.goalPolicy.v1', { acceptance: { actor: 'both' } });
  const lifecycle = createGoalLifecycleService({ store, now: makeClock() });
  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start' });
  lifecycle.execute({ goalId: 'goal-1', command: 'acknowledge', expectedRevision: 1, commandId: 'ack', payload: { contractRevision: 0 } });
  lifecycle.execute({ goalId: 'goal-1', command: 'dispatch', expectedRevision: 2, commandId: 'dispatch' });
  lifecycle.execute({ goalId: 'goal-1', command: 'submit-evidence', expectedRevision: 3, commandId: 'evidence', payload: { evidenceRefs: ['final'] } });
  lifecycle.execute({ goalId: 'goal-1', command: 'request-handoff', expectedRevision: 4, commandId: 'handoff' });
  lifecycle.execute({ goalId: 'goal-1', command: 'accept', expectedRevision: 5, commandId: 'agent-accept', payload: { finalEvidenceVerified: true, acceptanceActor: 'agentic' } });
  assert.equal(lifecycle.execute({ goalId: 'goal-1', command: 'complete', expectedRevision: 6, commandId: 'complete-blocked', payload: { finalEvidenceVerified: true } }).error, 'ACCEPTANCE_REQUIRED');
  lifecycle.execute({ goalId: 'goal-1', command: 'accept', expectedRevision: 6, commandId: 'human-accept', payload: { finalEvidenceVerified: true, acceptanceActor: 'human' } });
  const completed = lifecycle.execute({ goalId: 'goal-1', command: 'complete', expectedRevision: 7, commandId: 'complete', payload: { finalEvidenceVerified: true } });
  assert.equal(completed.execution.state, 'complete');
});

test('pending commands reconcile after restart without inferring completion from Markdown', () => {
  const store = makeStore();
  const lifecycle = createGoalLifecycleService({ store, now: makeClock() });
  lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'start' });
  lifecycle.markPendingCommand({ goalId: 'goal-1', command: 'dispatch', commandId: 'pending-dispatch' });
  const result = lifecycle.reconcilePending();
  assert.equal(result.executions[0].state, 'approval-required');
  assert.equal(result.executions[0].reconciliationRequired, true);
  assert.equal(result.reconciliations.at(-1).markdownCompletionIgnored, true);
  assert.ok(store.get('omvra.goalExecutionEvents.v1').some(event => event.type === 'goal.reconciled'));
});

test('lifecycle persists policy and attempt metadata and emits scoped runtime changes', () => {
  const store = makeStore();
  store.set('omvra.goalPolicy.v1', { policyRevision: 9, acceptance: { actor: 'human' } });
  const changes = [];
  const lifecycle = createGoalLifecycleService({ store, now: makeClock(), onRuntimeChange: change => changes.push(change) });
  const started = lifecycle.execute({ goalId: 'goal-1', command: 'start', expectedRevision: 0, commandId: 'runtime-start' });
  assert.equal(started.execution.policyRevision, 9);
  assert.equal(started.execution.executionAttemptId, started.execution.id);
  assert.equal(started.execution.contractPacket.executionAttempt, 1);
  assert.deepEqual(changes[0], {
    scope: 'execution',
    goalId: 'goal-1',
    revision: 1,
    actor: 'overseer',
    changeType: 'lifecycle.start',
  });
});
