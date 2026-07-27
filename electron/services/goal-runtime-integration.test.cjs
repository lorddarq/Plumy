const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequestDispatcher } = require('./mcp-http-server.cjs');
const { createGoalLifecycleService } = require('./goal-lifecycle-service.cjs');
const { createGoalRuntimeService } = require('./goal-runtime-service.cjs');
const { updateGoal } = require('./workspace-service.cjs');
const { EVIDENCE_KEY } = require('./goal-state-service.cjs');
const { makeStoreFromFixture, GOALS_KEY } = require('./test-fixtures.cjs');

function request(name, argumentsValue) {
  return {
    jsonrpc: '2.0',
    id: `integration-${name}`,
    method: 'tools/call',
    params: { name, arguments: argumentsValue },
  };
}

function req() {
  return { headers: {}, transport: 'http', socket: { remoteAddress: '127.0.0.1' } };
}

test('renderer/MCP/lifecycle writes converge and rejected writes do not partially mutate canonical records', () => {
  const store = makeStoreFromFixture('workspace-basic', {
    [GOALS_KEY]: [{ id: 'goal-integration', title: 'Integration goal', revision: 0, elements: [{ id: 'node-1', type: 'subgoal', title: 'First', x: 0, y: 0 }] }],
  });
  store.set('omvra.preferences.v1', { mcpAgentAccessEnabled: true, mcpCapabilityProfile: 'task_write' });
  const runtime = createGoalRuntimeService({ store, now: () => '2026-07-20T10:00:00.000Z' });
  const dispatch = createRequestDispatcher(store, { emitRuntimeChange: runtime.emit });

  const rendererUpdate = updateGoal(store, {
    goalId: 'goal-integration', expectedRevision: 0, actor: 'renderer', title: 'Renderer goal',
    elements: [{ id: 'node-1', type: 'subgoal', title: 'Renderer edit', x: 5, y: 5 }], emitRuntimeChange: runtime.emit,
  });
  assert.equal(rendererUpdate.ok, true);
  assert.equal(store.get(GOALS_KEY)[0].revision, 1);
  assert.equal(store.get('omvra.goalRuntimeEvents.v1').at(-1).changeType, 'graph.updated');

  const graphUpdate = dispatch(request('goals.update', {
    goalId: 'goal-integration', expectedRevision: 1, humanConfirmed: true, title: 'Integration goal',
    elements: [{ id: 'node-1', type: 'subgoal', title: 'Updated', x: 10, y: 20 }],
  }), req());
  assert.equal(graphUpdate.result.structuredContent.revision, 2);
  assert.equal(store.get(GOALS_KEY)[0].elements[0].title, 'Updated');

  const beforeRejected = JSON.parse(JSON.stringify(store.get(GOALS_KEY)));
  const stale = dispatch(request('goals.update', {
    goalId: 'goal-integration', expectedRevision: 0, humanConfirmed: true, title: 'Should not apply',
  }), req());
  assert.equal(stale.error.code, -32602);
  assert.equal(stale.error.data.error, 'REVISION_MISMATCH');
  assert.deepEqual(JSON.parse(JSON.stringify(store.get(GOALS_KEY))), beforeRejected);
  assert.equal(store.get('omvra.goalExecutions.v1'), undefined);
  assert.equal(store.get('omvra.goalPolicy.v1'), undefined);
  assert.equal(runtime.get('goal-integration').goal.elements[0].title, 'Updated');
  assert.equal(store.get('omvra.goalRuntimeEvents.v1').at(-1).scope, 'conflict');

  const lifecycle = createGoalLifecycleService({ store, onRuntimeChange: runtime.emit, now: () => '2026-07-20T10:00:01.000Z' });
  const started = lifecycle.execute({ goalId: 'goal-integration', command: 'start', expectedRevision: 0, commandId: 'integration-start' });
  assert.equal(started.ok, true);
  const projection = runtime.get('goal-integration');
  assert.equal(projection.execution.policyRevision, projection.execution.contractPacket.policyRevision);
  assert.equal(projection.execution.executionAttemptId, projection.execution.id);
  assert.equal(store.get('omvra.goalRuntimeEvents.v1').some(event => event.changeType === 'lifecycle.start'), true);
});

test('runtime projection exposes terminal handoffs without adding canvas nodes', () => {
  const store = makeStoreFromFixture('workspace-basic', {
    [GOALS_KEY]: [{ id: 'goal-handoff-projection', title: 'Delivery', revision: 0, elements: [{ id: 'deliverable-1', type: 'deliverable', title: 'Report', x: 0, y: 0 }] }],
    'omvra.goalHandoffs.v1': [{ id: 'handoff-1', goalId: 'goal-handoff-projection', deliverableId: 'deliverable-1', immutable: true, producedArtifactReferences: [{ label: 'Report.pdf' }] }],
  });
  const runtime = createGoalRuntimeService({ store });
  const projection = runtime.get('goal-handoff-projection');
  assert.equal(projection.handoffs[0].immutable, true);
  assert.equal(projection.handoffs[0].deliverableId, 'deliverable-1');
  assert.equal(projection.goal.elements.some(element => element.type === 'handoff'), false);
});

test('Goal artifact links project canonical task and milestone state without mutating source records', () => {
  const store = makeStoreFromFixture('workspace-basic', {
    [GOALS_KEY]: [
      { id: 'goal-artifacts', title: 'Artifact goal', revision: 0, elements: [{ id: 'subgoal-1', type: 'subgoal', title: 'Ship', x: 0, y: 0 }] },
      { id: 'goal-source', title: 'Source goal', revision: 3, elements: [] },
    ],
    'omvra.tasks.v1': [{ id: 'task-1', title: 'Build', status: 'in-progress', assigneeId: 'agent-1', dependencyIds: ['task-0'], __mcpRevision: 4 }],
    'omvra.milestones.v1': [{ id: 'milestone-1', title: 'Release', endDate: '2026-08-01', linkedTaskIds: ['task-1'], __mcpRevision: 2 }],
  });
  store.set('omvra.preferences.v1', { mcpAgentAccessEnabled: true, mcpCapabilityProfile: 'task_write', agentMutationConfirmation: 'allowed' });
  const dispatch = createGoalRuntimeService ? createRequestDispatcher(store) : null;
  const linked = dispatch(request('goals.update_artifacts', {
    goalId: 'goal-artifacts', elementId: 'subgoal-1', expectedRevision: 0, idempotencyKey: 'artifact-link-1', humanConfirmed: true,
    artifactReferences: [{ id: 'link-task', artifactType: 'task', artifactId: 'task-1' }, { id: 'link-milestone', artifactType: 'milestone', artifactId: 'milestone-1' }, { id: 'link-goal', artifactType: 'goal', artifactId: 'goal-source' }],
  }), req());
  assert.equal(linked.result.structuredContent.revision, 1);
  const projected = dispatch(request('goals.get', { goalId: 'goal-artifacts' }), req()).result.structuredContent;
  const links = projected.elements.find(element => element.id === 'subgoal-1').artifactReferences;
  assert.equal(links[0].projection.title, 'Build');
  assert.deepEqual(links[0].projection.dependencyIds, ['task-0']);
  assert.equal(links[1].projection.title, 'Release');
  assert.equal(links[2].projection.title, 'Source goal');
  assert.equal(store.get('omvra.tasks.v1')[0].__mcpRevision, 4);
  assert.equal(store.get('omvra.milestones.v1')[0].__mcpRevision, 2);

  const duplicate = dispatch(request('goals.update_artifacts', {
    goalId: 'goal-artifacts', elementId: 'subgoal-1', expectedRevision: 0, idempotencyKey: 'artifact-link-1', humanConfirmed: true,
    artifactReferences: [],
  }), req());
  assert.equal(duplicate.result.structuredContent.idempotent, true);
  assert.equal(store.get('omvra.goalArtifactAudit.v1').length, 1);

  const stale = dispatch(request('goals.update_artifacts', {
    goalId: 'goal-artifacts', elementId: 'subgoal-1', expectedRevision: 0, idempotencyKey: 'artifact-link-stale', artifactReferences: [], humanConfirmed: true,
  }), req());
  assert.equal(stale.error.data.error, 'REVISION_MISMATCH');
  assert.equal(store.get('omvra.goalArtifactAudit.v1').length, 1);
});

test('dependency and evidence contributions expose typed projection state and gate lifecycle operations', () => {
  const store = makeStoreFromFixture('workspace-basic', {
    [GOALS_KEY]: [{
      id: 'goal-contribution-gates',
      title: 'Contribution gates',
      revision: 0,
      elements: [{
        id: 'subgoal-1',
        type: 'subgoal',
        title: 'Validate sources',
        x: 0,
        y: 0,
        artifactReferences: [
          { id: 'dependency-1', artifactType: 'task', artifactId: 'task-1', contribution: 'dependency', sourceRevision: 2 },
          { id: 'evidence-1', artifactType: 'evidence', artifactId: 'evidence-1', contribution: 'evidence', contentHash: 'sha256-proof' },
        ],
      }],
    }],
    'omvra.tasks.v1': [{ id: 'task-1', title: 'Prepare source', status: 'open', __mcpRevision: 2 }],
    [EVIDENCE_KEY]: [{ id: 'evidence-1', goalId: 'goal-contribution-gates', executionId: 'source-execution', ref: 'proof-1', immutable: true, metadata: { contentHash: 'sha256-proof', contractRevision: 1 } }],
  });
  const dispatch = createRequestDispatcher(store);
  const projected = dispatch(request('goals.get', { goalId: 'goal-contribution-gates' }), req()).result.structuredContent;
  const references = projected.elements[0].artifactReferences;
  assert.equal(references[0].projection.contributionState, 'blocked-dependency');
  assert.equal(references[1].projection.contributionState, 'verified-evidence');

  const lifecycle = createGoalLifecycleService({ store, now: () => '2026-07-27T10:00:00.000Z' });
  const blocked = lifecycle.execute({ goalId: 'goal-contribution-gates', command: 'start', expectedRevision: 0, commandId: 'contribution-start-blocked' });
  assert.equal(blocked.error, 'DEPENDENCY_CONTRIBUTION_BLOCKED');
  assert.equal(store.get('omvra.tasks.v1')[0].status, 'open');
});
