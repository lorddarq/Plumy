const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EVIDENCE_KEY,
  migrateGoalRecords,
  normalizeGoal,
  normalizeAgentConfiguration,
  createEvidenceRecord,
  normalizeGoalInputs,
  normalizeGoalCapabilities,
  resolveGoalInputs,
  resolveGoalCapabilities,
  normalizeGoalProjectBindings,
} = require('./goal-state-service.cjs');

test('goal normalization preserves unknown fields and initializes revisions', () => {
  const goal = normalizeGoal({
    id: 'legacy-goal',
    title: 'Legacy goal',
    futureGoalMetadata: { owner: 'next-version' },
    elements: [{ id: 'legacy-node', type: 'subgoal', title: 'Work', futureNodeMetadata: true }],
  });

  assert.equal(goal.schemaVersion, 1);
  assert.equal(goal.revision, 0);
  assert.deepEqual(goal.futureGoalMetadata, { owner: 'next-version' });
  assert.equal(goal.elements[0].futureNodeMetadata, true);
});

test('legacy goal migration preserves ids and only writes when normalization changes data', () => {
  const values = new Map([['omvra.goals.v1', [{ id: 'goal-old', title: 'Goal', elements: [] }]]]);
  const store = { get: key => values.get(key), set: (key, value) => values.set(key, value) };
  const first = migrateGoalRecords(store);
  assert.equal(first.changed, true);
  assert.equal(first.goals[0].id, 'goal-old');
  const second = migrateGoalRecords(store);
  assert.equal(second.changed, false);
});

test('control-flow nodes normalize as supported Goal elements and preserve their configuration', () => {
  const goal = normalizeGoal({
    id: 'goal-control-flow',
    title: 'Control flow',
    elements: [
      { id: 'input-1', type: 'human-input', title: 'Ask user', humanInputPrompt: 'Which competitor should we add?', x: 0, y: 0 },
      { id: 'retry-1', type: 'retry', title: 'Retry research', retryMaxAttempts: 3, retryExhaustionPolicy: 'human-review', x: 100, y: 0 },
    ],
  });

  assert.equal(goal.elements[0].type, 'human-input');
  assert.equal(goal.elements[0].humanInputPrompt, 'Which competitor should we add?');
  assert.equal(goal.elements[1].type, 'retry');
  assert.equal(goal.elements[1].retryMaxAttempts, 3);
  assert.equal(goal.elements[1].retryExhaustionPolicy, 'human-review');
});

test('deliverable nodes keep the delivery contract separate from migrated supporting artifacts', () => {
  const goal = normalizeGoal({
    id: 'goal-deliverable',
    title: 'Deliverable goal',
    elements: [{
      id: 'deliverable-1',
      type: 'deliverable',
      title: 'Final report',
      deliverySpec: {
        outcomeKind: 'file',
        instructions: 'Deliver the report to the research folder.',
        format: 'PDF',
        acceptanceCriteria: ['Contains findings'],
        expectedArtifactCount: 1.8,
      },
      deliverableStatus: 'ready-for-review',
      artifactReferences: [
        { id: 'artifact-1', artifactType: 'user-defined', artifactId: 'report-1', contribution: 'deliverable', label: 'Report', kind: 'document', format: 'PDF', locator: 'file:///tmp/report.pdf' },
        { id: 'artifact-duplicate', artifactType: 'user-defined', artifactId: 'report-1', label: 'Ignored duplicate' },
      ],
      x: 0,
      y: 0,
    }],
  });

  const deliverable = goal.elements.find(element => element.type === 'deliverable');
  assert.equal(deliverable.type, 'deliverable');
  assert.equal(deliverable.deliverableStatus, 'ready-for-review');
  assert.equal(deliverable.deliverySpec.expectedArtifactCount, 1);
  assert.equal(deliverable.artifactReferences, undefined);
  const supporting = goal.elements.find(element => element.type === 'artifact');
  assert.equal(supporting.artifactRole, 'supporting');
  assert.equal(supporting.artifactReferences[0].contribution, 'supporting');
  assert.equal(supporting.artifactReferences[0].locator, 'file:///tmp/report.pdf');
});

test('supporting artifact nodes normalize their role and references', () => {
  const goal = normalizeGoal({ id: 'goal-supporting', title: 'Inputs', elements: [{ id: 'artifact-1', type: 'artifact', title: 'Research notes', artifactReferences: [{ artifactType: 'document', artifactId: 'doc-1', sourceTaskId: 'task-1', sourceAttachmentId: 'attachment-1', copiedContents: 'must-not-persist' }] }] });
  assert.equal(goal.elements[0].artifactRole, 'supporting');
  assert.equal(goal.elements[0].artifactReferences[0].contribution, undefined);
  assert.equal(goal.elements[0].artifactReferences[0].sourceTaskId, 'task-1');
  assert.equal(goal.elements[0].artifactReferences[0].sourceAttachmentId, 'attachment-1');
  assert.equal(goal.elements[0].artifactReferences[0].copiedContents, undefined);
});

test('dependency and evidence contributions remain typed and discard unknown contribution values', () => {
  const goal = normalizeGoal({
    id: 'goal-contributions',
    title: 'Contribution contract',
    elements: [{
      id: 'subgoal-1',
      type: 'subgoal',
      title: 'Validate sources',
      artifactReferences: [
        { id: 'dependency-1', artifactType: 'task', artifactId: 'task-1', contribution: 'dependency', sourceRevision: 3 },
        { id: 'evidence-1', artifactType: 'evidence', artifactId: 'evidence-1', contribution: 'evidence', contentHash: 'sha256-test' },
        { id: 'unknown-1', artifactType: 'task', artifactId: 'task-2', contribution: 'other' },
      ],
    }],
  });

  const references = goal.elements[0].artifactReferences;
  assert.equal(references.length, 3);
  assert.equal(references[0].contribution, 'dependency');
  assert.equal(references[1].artifactType, 'evidence');
  assert.equal(references[1].contribution, 'evidence');
  assert.equal(references[2].contribution, undefined);
});

test('agent configuration migrates legacy assignees and rejects incomplete ephemeral nodes', () => {
  const goal = normalizeGoal({
    id: 'goal-agent-contract',
    title: 'Agent contract',
    elements: [
      { id: 'legacy-agent', type: 'agent', title: 'Legacy', assigneeId: 'agent-1', body: 'Visible note' },
      { id: 'invalid-agent', type: 'agent', title: 'Invalid', agentConfiguration: { version: 1, mode: 'ephemeral', instructions: 'Do work' } },
      { id: 'ephemeral-agent', type: 'agent', title: 'Temporary', agentConfiguration: { mode: 'ephemeral', requestedName: 'Researcher', requestedType: 'researcher', instructions: 'Find evidence', spawnIfUnavailable: true } },
      { id: 'generated-agent', type: 'agent', title: 'Generated', agentConfiguration: { mode: 'ephemeral', autoGenerateName: true, requestedType: 'researcher', instructions: 'Find evidence' } },
    ],
  });

  assert.deepEqual(goal.elements[0].agentConfiguration, { version: 1, mode: 'existing', assigneeId: 'agent-1', instructions: '' });
  assert.equal(goal.elements[1].agentConfiguration, undefined);
  assert.deepEqual(goal.elements[2].agentConfiguration, { version: 1, mode: 'ephemeral', requestedName: 'Researcher', requestedType: 'researcher', instructions: 'Find evidence', spawnIfUnavailable: true });
  assert.deepEqual(goal.elements[3].agentConfiguration, { version: 1, mode: 'ephemeral', requestedType: 'researcher', instructions: 'Find evidence', autoGenerateName: true });
  assert.equal(normalizeAgentConfiguration({ mode: 'existing', assigneeId: 'agent-2', instructions: 'Ship it' }).version, 1);
});

test('evidence records are immutable, prefixed, and separate from execution state', () => {
  const evidence = createEvidenceRecord({ goalId: 'goal_1', executionId: 'execution_1', ref: 'file:///tmp/result.json' });
  assert.match(evidence.id, /^evidence_/);
  assert.equal(evidence.immutable, true);
  assert.equal(evidence.ref, 'file:///tmp/result.json');
  assert.notEqual(EVIDENCE_KEY, 'omvra.goalExecutions.v1');
});

test('typed Goal inputs normalize references and never persist secret-like content', () => {
  const inputs = normalizeGoalInputs([
    { id: 'source', kind: 'file', locator: '/tmp/source.md', sensitive: true, value: 'secret', token: 'token', content: 'copied' },
    { kind: 'inline', value: { answer: 42 }, valueType: 'json' },
    { kind: 'unknown' },
  ]);
  assert.equal(inputs.length, 2);
  assert.equal(inputs[0].sensitive, true);
  assert.equal(inputs[0].value, undefined);
  assert.equal(inputs[0].token, undefined);
  assert.equal(inputs[0].content, undefined);
  assert.deepEqual(inputs[1].value, { answer: 42 });
  assert.equal(inputs[1].id, 'input-2');
});

test('typed Goal requirements resolve without project ownership and report capability failures', () => {
  const goal = normalizeGoal({
    id: 'projectless-goal',
    title: 'Projectless',
    inputs: [{ id: 'brief', kind: 'inline', value: 'brief' }],
    capabilities: [{ id: 'write', capabilityId: 'files.write', source: 'mcp', version: '^1.0.0', trust: 'trusted' }],
    elements: [],
  });
  const store = { get: key => key === 'omvra.preferences.v1' ? { mcpCapabilityProfile: 'read_only' } : [] };
  assert.equal(resolveGoalInputs(store, goal).ok, true);
  const resolved = resolveGoalCapabilities(store, goal, { availableCapabilities: [{ capabilityId: 'files.write', version: '2.0.0', source: 'mcp', trust: 'trusted' }] });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.results[0].state, 'incompatible');
  const denied = resolveGoalCapabilities(store, goal, { availableCapabilities: [{ capabilityId: 'files.write', version: '1.2.0', source: 'mcp', trust: 'trusted' }] });
  assert.equal(denied.results[0].state, 'available');
});

test('Goal project bindings normalize to one primary reference without copying project data', () => {
  const bindings = normalizeGoalProjectBindings([
    { projectId: 'project-1', role: 'primary', name: 'must not be copied' },
    { projectId: 'project-2', role: 'primary' },
    { projectId: 'project-1', role: 'primary' },
    { projectId: 'project-3', role: 'dependency' },
  ]);
  assert.deepEqual(bindings.map(binding => [binding.projectId, binding.role]), [
    ['project-1', 'primary'],
    ['project-2', 'contributor'],
    ['project-1', 'contributor'],
    ['project-3', 'dependency'],
  ]);
  assert.equal(bindings[0].name, 'must not be copied');
});
