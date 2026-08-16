const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MILESTONES_KEY, STATUS_COLUMNS_KEY, TASKS_KEY, makeStoreFromFixture } = require('./test-fixtures.cjs');
const { createRequestDispatcher } = require('./mcp-http-server.cjs');

const {
  MCP_TASK_REV_FIELD,
  getMcpServerConfig,
  getMcpAccessTokenStatus,
  isMcpAccessTokenExpired,
  buildMcpListenerStatus,
  appendMcpAuditLog,
  getWorkspaceSnapshot,
  listGoals,
  resolveGoalAgentDispatch,
  listMilestones,
  getMilestoneById,
  listTasks,
  getTaskById,
  listKanbanCards,
  listTimelineCards,
  listMcpAuditLog,
  buildMcpAuditSummary,
  createTask,
  updateTaskDetails,
  updateTaskDescription,
  attachTaskFile,
  removeTaskAttachment,
  logTaskTime,
  createMilestone,
  updateMilestone,
  linkMilestoneTasks,
  deleteMilestone,
  deleteTask,
  transitionTaskToUnderReview,
  updateTaskAgentSummary,
  addTaskComment,
  addTaskActivityEntry,
  updateTaskCompletionDescription,
  moveTasksToRequiresHumanReviewBoard,
  moveTaskToStatus,
  moveTaskToReadyForHumanReview,
  assignTaskToPerson,
  REQUIRES_HUMAN_REVIEW_STATUS_ID,
  TASK_CONTRIBUTION_ATTEMPTS_KEY,
  SESSION_BINDINGS_KEY,
  SESSION_EVENTS_KEY,
  listAgentRuntimeSessions,
  updateAgentRuntimeTaskExecution,
} = require('./workspace-service.cjs');

test('task runtime execution state persists on the canonical attempt and survives session reads', () => {
  const store = makeStoreFromFixture('workspace-basic');
  store.set(TASK_CONTRIBUTION_ATTEMPTS_KEY, [{ id: 'attempt-runtime', taskId: 'task-1', state: 'working', updatedAt: '2026-08-06T00:00:00.000Z' }]);
  const updated = updateAgentRuntimeTaskExecution(store, { taskId: 'task-1', attemptId: 'attempt-runtime', state: 'working', batchNumber: 2, reason: 'provider-turn-started' });
  assert.equal(updated.ok, true);
  assert.deepEqual(store.get(TASK_CONTRIBUTION_ATTEMPTS_KEY)[0].runtimeExecution, {
    schemaVersion: 1,
    state: 'working',
    batchNumber: 2,
    updatedAt: store.get(TASK_CONTRIBUTION_ATTEMPTS_KEY)[0].runtimeExecution.updatedAt,
    reason: 'provider-turn-started',
  });
});

test('session projections read task attempts once for all bindings', () => {
  const source = makeStoreFromFixture('workspace-basic');
  source.set(SESSION_BINDINGS_KEY, [
    { id: 'binding-1', state: 'closed', scope: { kind: 'task', taskId: 'task-1', executionAttemptId: 'attempt-1' } },
    { id: 'binding-2', state: 'closed', scope: { kind: 'task', taskId: 'task-2', executionAttemptId: 'attempt-2' } },
  ]);
  source.set(SESSION_EVENTS_KEY, []);
  source.set(TASK_CONTRIBUTION_ATTEMPTS_KEY, [
    { id: 'attempt-1', runtimeExecution: { state: 'complete' } },
    { id: 'attempt-2', runtimeExecution: { state: 'interrupted' } },
  ]);
  let attemptReads = 0;
  const store = {
    get: key => {
      if (key === TASK_CONTRIBUTION_ATTEMPTS_KEY) attemptReads += 1;
      return source.get(key);
    },
    set: (key, value) => source.set(key, value),
  };

  const result = listAgentRuntimeSessions(store, { limit: 100, includeEvents: false });

  assert.equal(result.ok, true);
  assert.deepEqual(result.bindings.map(binding => binding.taskExecution?.state), ['complete', 'interrupted']);
  assert.equal(attemptReads, 1);
});

test('workspace snapshot contract has expected keys and stable counts', () => {
  const store = makeStoreFromFixture('workspace-basic');
  store.set(STATUS_COLUMNS_KEY, [
    { id: 'open', title: 'Open', color: '#9ca3af', description: 'New work that is ready for an agent to inspect.' },
    { id: 'in-progress', title: 'In Progress', color: '#3b82f6' },
    { id: 'done', title: 'Done', color: '#10b981' },
  ]);
  store.set('omvra.swimlanes.v1', [
    { id: 'lane-1', name: 'Project A', description: 'Timeline work for the desktop client.', color: '#3b82f6' },
    { id: 'lane-2', name: 'Project B', color: '#8b5cf6' },
  ]);
  const snapshot = getWorkspaceSnapshot(store);

  assert.equal(snapshot.schemaVersion, '1');
  assert.equal(snapshot.readOnly, true);
  assert.ok(snapshot.generatedAt);
  assert.equal(snapshot.contentBoundary.classification, 'workspace-data');
  assert.equal(
    snapshot.contentBoundary.instructionPrecedence,
    'never-above-client-system-or-developer-instructions'
  );
  assert.match(
    snapshot.meta.fieldSemantics.people.agentInstructions,
    /assignee role\/persona guidance/i
  );
  assert.match(
    snapshot.meta.fieldSemantics.people.agentOperationalInstructions,
    /preferred work approach/i
  );
  assert.ok(snapshot.workspace);
  assert.ok(Array.isArray(snapshot.workspace.tasks));
  assert.ok(Array.isArray(snapshot.workspace.milestones));
  assert.ok(Array.isArray(snapshot.workspace.people));
  assert.ok(Array.isArray(snapshot.workspace.projects));
  assert.ok(Array.isArray(snapshot.workspace.statusColumns));
  assert.equal(
    snapshot.workspace.people.find(person => person.id === 'agent-1')?.agentInstructions,
    'Use the durable Codex persona instructions when working assigned tasks.'
  );
  assert.equal(
    snapshot.workspace.people.find(person => person.id === 'agent-1')?.agentOperationalInstructions,
    'Read the assigned task, inspect relevant roadmap links, and validate changes before handoff.'
  );
  assert.equal(
    snapshot.workspace.statusColumns.find(column => column.id === 'open')?.description,
    'New work that is ready for an agent to inspect.'
  );
  assert.equal(
    snapshot.workspace.projects.find(project => project.id === 'lane-1')?.description,
    'Timeline work for the desktop client.'
  );
  assert.equal(snapshot.meta.counts.tasks, snapshot.workspace.tasks.length);
  assert.equal(snapshot.meta.counts.milestones, snapshot.workspace.milestones.length);
  assert.equal(snapshot.meta.counts.people, snapshot.workspace.people.length);
  assert.equal(snapshot.meta.counts.projects, snapshot.workspace.projects.length);
  assert.equal(snapshot.meta.counts.statusColumns, snapshot.workspace.statusColumns.length);
});

test('workspace snapshot reads a production store snapshot once', () => {
  const source = makeStoreFromFixture('workspace-basic');
  let snapshotReads = 0;
  const store = {
    get: key => source.get(key),
    set: (key, value) => source.set(key, value),
    get store() {
      snapshotReads += 1;
      return Object.fromEntries(source.map);
    },
  };

  const snapshot = getWorkspaceSnapshot(store);

  assert.ok(snapshot.workspace.tasks.length >= 0);
  assert.equal(snapshotReads, 1);
});

test('kanban and timeline card projections include board and swimlane descriptions', () => {
  const store = makeStoreFromFixture('workspace-basic');
  store.set(STATUS_COLUMNS_KEY, [
    { id: 'open', title: 'Open', description: 'Ready to be planned or picked up.' },
    { id: 'in-progress', title: 'In Progress' },
    { id: 'done', title: 'Done' },
  ]);
  store.set('omvra.swimlanes.v1', [
    { id: 'lane-1', name: 'Project A', description: 'Desktop product delivery lane.' },
    { id: 'lane-2', name: 'Project B' },
  ]);

  const [kanbanCard] = listKanbanCards(store, { status: 'open' });
  const [timelineCard] = listTimelineCards(store, { laneId: 'lane-1' });

  assert.equal(kanbanCard.statusTitle, 'Open');
  assert.equal(kanbanCard.statusDescription, 'Ready to be planned or picked up.');
  assert.equal(timelineCard.swimlaneName, 'Project A');
  assert.equal(timelineCard.swimlaneDescription, 'Desktop product delivery lane.');
});

test('listener status reflects runtime state and token expiry details', () => {
  const store = makeStoreFromFixture('workspace-mcp-security');
  const serverConfig = getMcpServerConfig(store);
  const tokenStatus = getMcpAccessTokenStatus(serverConfig, Date.parse('2026-03-26T09:59:00.000Z'));

  assert.equal(tokenStatus.configured, true);
  assert.equal(tokenStatus.status, 'active');
  assert.equal(isMcpAccessTokenExpired(serverConfig, Date.parse('2026-03-26T09:59:00.000Z')), false);

  const listenerStatus = buildMcpListenerStatus(store, {
    status: 'running',
    listening: true,
    boundAddress: '127.0.0.1:3456',
    boundUrl: 'http://127.0.0.1:3456/mcp',
    lastStartedAt: '2026-03-26T09:58:00.000Z',
  });

  assert.equal(listenerStatus.enabled, true);
  assert.equal(listenerStatus.status, 'running');
  assert.equal(listenerStatus.listening, true);
  assert.equal(listenerStatus.boundUrl, 'http://127.0.0.1:3456/mcp');
  assert.equal(listenerStatus.token.status, 'active');
  assert.equal(listenerStatus.authMode, 'token');
});

test('audit log returns most recent entries first and respects limit', () => {
  const store = makeStoreFromFixture('workspace-basic');

  appendMcpAuditLog(store, { type: 'mcp_write_attempt', toolName: 'tasks.assign', outcome: 'allowed' });
  appendMcpAuditLog(store, { type: 'mcp_write_attempt', toolName: 'tasks.move_to_status', outcome: 'allowed' });
  appendMcpAuditLog(store, { type: 'mcp_write_attempt', toolName: 'tasks.update_agent_summary', outcome: 'denied' });

  const recent = listMcpAuditLog(store, { limit: 2 });
  assert.equal(recent.length, 2);
  assert.equal(recent[0].toolName, 'tasks.update_agent_summary');
  assert.equal(recent[1].toolName, 'tasks.move_to_status');
  assert.ok(recent.every(entry => typeof entry.auditId === 'string' && entry.auditId.startsWith('audit-')));
});

test('audit writes backfill and append to the configured external directory', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const archiveDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-mcp-audit-'));
  store.set('omvra.preferences.v1', { goalAuditArchiveDirectory: archiveDirectory });
  store.set('omvra.mcp.audit.v1', [{ auditId: 'audit-historical', type: 'mcp_tool_call', toolName: 'goals.list' }]);

  appendMcpAuditLog(store, { type: 'mcp_write_attempt', toolName: 'goals.gc', outcome: 'allowed' });
  const archivePath = path.join(archiveDirectory, 'mcp-audit.jsonl');
  const readArchive = () => fs.readFileSync(archivePath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(readArchive().map(item => item.auditId), ['audit-historical', store.get('omvra.mcp.audit.v1')[1].auditId]);

  appendMcpAuditLog(store, { type: 'mcp_write_attempt', toolName: 'goals.get', outcome: 'allowed' });
  assert.equal(readArchive().length, 3);
  fs.rmSync(archiveDirectory, { recursive: true, force: true });
});

test('audit archive reads preferences once per append', () => {
  const archiveDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-mcp-audit-read-'));
  const source = makeStoreFromFixture('workspace-basic');
  source.set('omvra.preferences.v1', { goalAuditArchiveDirectory: archiveDirectory });
  let preferenceReads = 0;
  const store = {
    get: key => {
      if (key === 'omvra.preferences.v1') preferenceReads += 1;
      return source.get(key);
    },
    set: (key, value) => source.set(key, value),
  };

  appendMcpAuditLog(store, { type: 'mcp_tool_call', toolName: 'workspace.snapshot' });

  assert.equal(preferenceReads, 1);
  fs.rmSync(archiveDirectory, { recursive: true, force: true });
});

test('audit summary normalizes legacy outcomes and groups bounded metadata', () => {
  const store = makeStoreFromFixture('workspace-basic');
  store.set('omvra.mcp.audit.v1', [
    {
      auditId: 'audit-success',
      timestamp: '2026-07-15T10:00:00.000Z',
      agent: 'codex',
      clientName: 'Codex',
      toolName: 'tasks.update',
      transport: 'http',
      outcome: 'allowed',
      complexityBand: 'medium',
      durationMs: 10,
      logicalCalls: 2,
      arguments: { secret: 'must not appear' },
    },
    {
      auditId: 'audit-conflict',
      timestamp: '2026-07-15T10:01:00.000Z',
      agent: 'codex',
      toolName: 'tasks.update',
      outcome: 'denied',
      reason: 'conflict',
      complexityBand: 'medium',
      durationMs: 30,
    },
    {
      auditId: 'audit-denied',
      timestamp: '2026-07-15T10:02:00.000Z',
      agent: 'claude',
      toolName: 'tasks.delete',
      outcome: 'denied',
      reason: 'unauthorized',
      durationMs: 5,
    },
  ]);

  const summary = buildMcpAuditSummary(store, { agent: 'codex' });
  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.sampleSize, 2);
  assert.equal(summary.overall.successCount, 1);
  assert.equal(summary.overall.failureCount, 1);
  assert.equal(summary.overall.deniedCount, 0);
  assert.equal(summary.overall.duration.medianMs, 10);
  assert.equal(summary.overall.logicalCalls.total, 2);
  assert.deepEqual(summary.by.agent, [{ key: 'codex', ...summary.overall }]);
  assert.equal(JSON.stringify(summary).includes('must not appear'), false);
  assert.equal(Array.isArray(summary.by.toolName), true);
});

test('audit summary caps high-cardinality groups and keeps missing dimensions bounded', () => {
  const store = makeStoreFromFixture('workspace-basic');
  store.set('omvra.mcp.audit.v1', Array.from({ length: 40 }, (_, index) => ({
    auditId: `audit-bounded-${index}`,
    timestamp: `2026-07-15T10:${String(index).padStart(2, '0')}:00.000Z`,
    outcome: 'success',
    toolName: `tasks.synthetic_${index}`,
    durationMs: index,
    arguments: { payload: 'must not be projected' },
  })));

  const summary = buildMcpAuditSummary(store);
  assert.equal(summary.sampleSize, 40);
  assert.equal(summary.by.toolName.length, 25);
  assert.equal(summary.by.agent[0].key, 'unknown');
  assert.equal(summary.by.transport[0].key, 'http');
  assert.equal(summary.by.outcome[0].key, 'success');
  assert.equal(JSON.stringify(summary).includes('must not be projected'), false);
  assert.equal(JSON.stringify(summary).includes('arguments'), false);
});

test('kanban cards parity: cards.kanban.list aligns with listTasks filters by id', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const filters = { status: 'in-progress', assigneeId: 'agent-1', search: 'drag' };

  const taskIds = listTasks(store, filters).map(task => task.id).sort();
  const cardIds = listKanbanCards(store, filters).map(card => card.id).sort();

  assert.deepEqual(cardIds, taskIds);
});

test('timeline cards parity: cards.timeline.list aligns with lane/date semantics', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const filters = { laneId: 'lane-1', startDate: '2026-03-17', endDate: '2026-03-21' };

  const timelineCards = listTimelineCards(store, filters);
  const timelineIds = timelineCards.map(card => card.id).sort();

  assert.deepEqual(timelineIds, ['task-1']);
});

test('safe write transition uses optimistic revision and agentic constraints', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const firstRead = listTasks(store, { status: 'in-progress', assigneeId: 'agent-1' })[0];
  const revision = firstRead[MCP_TASK_REV_FIELD];

  const mismatch = transitionTaskToUnderReview(store, {
    taskId: firstRead.id,
    expectedRevision: revision + 1,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, 'REVISION_MISMATCH');

  const success = transitionTaskToUnderReview(store, {
    taskId: firstRead.id,
    expectedRevision: revision,
  });
  assert.equal(success.ok, true);
  assert.equal(success.task.status, 'under-review');
  assert.equal(success.task[MCP_TASK_REV_FIELD], revision + 1);
});

test('moveTaskToStatus validates target by title and id', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'open' })[0];
  const revision = task[MCP_TASK_REV_FIELD];

  const byTitle = moveTaskToStatus(store, {
    taskId: task.id,
    statusTitle: 'Done',
    expectedRevision: revision,
  });
  assert.equal(byTitle.ok, true);
  assert.equal(byTitle.task.status, 'done');
  assert.equal(byTitle.task[MCP_TASK_REV_FIELD], revision + 1);

  const byId = moveTaskToStatus(store, {
    taskId: task.id,
    statusId: 'in-progress',
    expectedRevision: byTitle.task[MCP_TASK_REV_FIELD],
  });
  assert.equal(byId.ok, true);
  assert.equal(byId.task.status, 'in-progress');
  assert.equal(byId.task[MCP_TASK_REV_FIELD], revision + 2);
});

test('moveTaskToReadyForHumanReview creates the board and moves the task', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'under-review' })[0];
  const revision = task[MCP_TASK_REV_FIELD];

  const result = moveTaskToReadyForHumanReview(store, {
    taskId: task.id,
    expectedRevision: revision,
  });

  assert.equal(result.ok, true);
  assert.equal(result.statusId, 'ready-human');
  assert.equal(result.statusCreated, true);
  assert.equal(result.task.status, 'ready-human');
  assert.equal(result.task[MCP_TASK_REV_FIELD], revision + 1);
});

test('createTask stores task metadata, assignment, and timeline allocation', () => {
  const store = makeStoreFromFixture('workspace-basic');

  const created = createTask(store, {
    title: 'Investigate flaky hover state',
    notes: 'Found during automated bug hunt',
    statusTitle: 'In Progress',
    assigneeName: 'Codex',
    assigneeKind: 'agentic',
    projectIds: ['lane-1'],
    swimlaneId: 'lane-1',
    startDate: '2026-03-22',
    endDate: '2026-03-24',
    size: 's',
    complexity: 'routine',
    priority: 'moderate',
    blocked: false,
  });

  assert.equal(created.ok, true);
  assert.equal(created.task.title, 'Investigate flaky hover state');
  assert.equal(created.task.status, 'in-progress');
  assert.equal(created.task.assigneeId, 'agent-1');
  assert.deepEqual(created.task.projectIds, ['lane-1']);
  assert.equal(created.task.swimlaneId, 'lane-1');
  assert.equal(created.task.project, 'Project A');
  assert.equal(created.task.startDate, '2026-03-22');
  assert.equal(created.task.endDate, '2026-03-24');
  assert.equal(created.task.size, 's');
  assert.equal(created.task.complexity, 'routine');
  assert.equal(created.task.priority, 'moderate');
  assert.equal(created.task[MCP_TASK_REV_FIELD], 0);

  const storedTasks = store.get(TASKS_KEY);
  assert.ok(Array.isArray(storedTasks));
  assert.ok(storedTasks.some(task => task.id === created.task.id));
});

test('createTask resolves projects by human-readable project name', () => {
  const store = makeStoreFromFixture('workspace-basic');

  const created = createTask(store, {
    title: 'Capture project-name based task creation',
    projectIds: ['Project A'],
    swimlaneId: 'Project A',
  });

  assert.equal(created.ok, true);
  assert.deepEqual(created.task.projectIds, ['lane-1']);
  assert.equal(created.task.swimlaneId, 'lane-1');
  assert.equal(created.task.project, 'Project A');
});

test('createTask persists a validated parent link for follow-up work', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const created = createTask(store, { title: 'Follow-up', parentTaskId: 'task-1' });
  assert.equal(created.ok, true);
  assert.equal(created.task.parentTaskId, 'task-1');
  assert.equal(createTask(store, { title: 'Invalid follow-up', parentTaskId: 'missing-task' }).error, 'TASK_REFERENCE_NOT_FOUND');
});

test('createTask and updateTaskDetails persist dependency, milestone, and time metadata', () => {
  const store = makeStoreFromFixture('workspace-basic', {
    [MILESTONES_KEY]: [
      {
        id: 'milestone-1',
        title: 'Release Alpha',
        projectIds: ['lane-1'],
        projectId: 'lane-1',
        endDate: '2026-04-01',
        linkedTaskIds: [],
      },
    ],
  });

  const created = createTask(store, {
    title: 'Create roadmap-linked follow-up',
    projectIds: ['Project A'],
    milestoneId: 'milestone-1',
    dependencyIds: ['task-1'],
    timeSpentMinutes: 45,
    timeSpentNote: 'Initial estimate',
  });

  assert.equal(created.ok, true);
  assert.equal(created.task.milestoneId, 'milestone-1');
  assert.deepEqual(created.task.dependencyIds, ['task-1']);
  assert.equal(created.task.timeSpentMinutes, 45);
  assert.equal(created.task.timeSpentNote, 'Initial estimate');

  const updated = updateTaskDetails(store, {
    taskId: created.task.id,
    dependencyIds: ['task-2'],
    timeSpentMinutes: 90,
    timeSpentNote: 'Refined estimate',
    expectedRevision: created.task[MCP_TASK_REV_FIELD],
  });

  assert.equal(updated.ok, true);
  assert.deepEqual(updated.task.dependencyIds, ['task-2']);
  assert.equal(updated.task.timeSpentMinutes, 90);
  assert.equal(updated.task.timeSpentNote, 'Refined estimate');

  const invalidDependency = updateTaskDetails(store, {
    taskId: created.task.id,
    dependencyIds: ['missing-task'],
    expectedRevision: updated.task[MCP_TASK_REV_FIELD],
  });
  assert.equal(invalidDependency.ok, false);
  assert.equal(invalidDependency.error, 'TASK_REFERENCE_NOT_FOUND');
});

test('updateTaskDetails rejects dependency cycles', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const firstUpdate = updateTaskDetails(store, {
    taskId: 'task-2',
    dependencyIds: ['task-1'],
    expectedRevision: getTaskById(store, 'task-2')[MCP_TASK_REV_FIELD],
  });
  assert.equal(firstUpdate.ok, true);

  const cyclicUpdate = updateTaskDetails(store, {
    taskId: 'task-1',
    dependencyIds: ['task-2'],
    expectedRevision: getTaskById(store, 'task-1')[MCP_TASK_REV_FIELD],
  });
  assert.equal(cyclicUpdate.ok, false);
  assert.equal(cyclicUpdate.error, 'DEPENDENCY_CYCLE');
});

test('task_write accepts project names through the MCP write surface', () => {
  const dispatch = createRequestDispatcher(makeStoreFromFixture('workspace-basic'));
  const response = dispatch({
    jsonrpc: '2.0',
    id: 'create-name-1',
    method: 'tools/call',
    params: {
      name: 'tasks.create',
      arguments: {
        title: 'Create from project name',
        projectIds: ['Project B'],
        swimlaneId: 'Project B',
      },
    },
  }, { headers: {}, transport: 'stdio' });

  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 'create-name-1');
  assert.equal(response.result.structuredContent.task.swimlaneId, 'lane-2');
  assert.deepEqual(response.result.structuredContent.task.projectIds, ['lane-2']);
});

test('updateTaskDetails edits existing task details with revision protection', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'in-progress' })[0];
  const revision = task[MCP_TASK_REV_FIELD];

  const updated = updateTaskDetails(store, {
    taskId: task.id,
    title: 'Build timeline polish',
    notes: 'Tighten the timeline interactions and metadata.',
    statusTitle: 'Open',
    assigneeName: 'Alex',
    assigneeKind: 'human',
    projectIds: ['Project B'],
    swimlaneId: 'Project B',
    startDate: '2026-03-21',
    endDate: '2026-03-24',
    size: 'l',
    complexity: 'hard',
    priority: 'urgent',
    blocked: true,
    swimlaneOnly: false,
    expectedRevision: revision,
  });

  assert.equal(updated.ok, true);
  assert.equal(updated.task.title, 'Build timeline polish');
  assert.equal(updated.task.notes, 'Tighten the timeline interactions and metadata.');
  assert.equal(updated.task.status, 'open');
  assert.equal(updated.task.assigneeId, 'person-1');
  assert.deepEqual(updated.task.projectIds, ['lane-2']);
  assert.equal(updated.task.swimlaneId, 'lane-2');
  assert.equal(updated.task.project, 'Project B');
  assert.equal(updated.task.startDate, '2026-03-21');
  assert.equal(updated.task.endDate, '2026-03-24');
  assert.equal(updated.task.size, 'l');
  assert.equal(updated.task.complexity, 'hard');
  assert.equal(updated.task.priority, 'urgent');
  assert.equal(updated.task.blocked, true);
  assert.equal(updated.task.swimlaneOnly, false);
  assert.equal(updated.task[MCP_TASK_REV_FIELD], revision + 1);
});

test('tasks.update is exposed through MCP and audits targeted edits', () => {
  const dispatch = createRequestDispatcher(makeStoreFromFixture('workspace-basic'));
  const response = dispatch({
    jsonrpc: '2.0',
    id: 'update-task-1',
    method: 'tools/call',
    params: {
      name: 'tasks.update',
      arguments: {
        taskId: 'task-2',
        title: 'Review card details',
        priority: 'low',
        blocked: true,
        expectedRevision: 0,
      },
    },
  }, { headers: {}, transport: 'stdio' });

  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 'update-task-1');
  assert.equal(response.result.structuredContent.action, 'tasks.update');
  assert.equal(response.result.structuredContent.changed, true);
  assert.equal(response.result.structuredContent.task.title, 'Review card details');
  assert.equal(response.result.structuredContent.task.priority, 'low');
  assert.equal(response.result.structuredContent.task.blocked, true);
  assert.equal(response.result.structuredContent.revision, 1);
  assert.ok(response.result.structuredContent.auditId);
});

test('updateTaskDescription replaces notes with revision protection', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'open' })[0];
  const revision = task[MCP_TASK_REV_FIELD];

  const updated = updateTaskDescription(store, {
    taskId: task.id,
    description: 'Replacement task description from MCP.',
    expectedRevision: revision,
  });

  assert.equal(updated.ok, true);
  assert.equal(updated.task.notes, 'Replacement task description from MCP.');
  assert.equal(updated.task[MCP_TASK_REV_FIELD], revision + 1);

  const stale = updateTaskDescription(store, {
    taskId: task.id,
    notes: 'This should not apply.',
    expectedRevision: revision,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error, 'REVISION_MISMATCH');
});

test('attachTaskFile and removeTaskAttachment manage local file references with revision protection', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'open' })[0];
  const revision = task[MCP_TASK_REV_FIELD];

  const attached = attachTaskFile(store, {
    taskId: task.id,
    uri: 'file:///Users/sorin.jurcut/Documents/Project%20Brief.md',
    name: 'Project Brief.md',
    size: 2048,
    expectedRevision: revision,
  });

  assert.equal(attached.ok, true);
  assert.equal(attached.changed, true);
  assert.equal(attached.task.attachments.length, 1);
  assert.equal(attached.task.attachments[0].name, 'Project Brief.md');
  assert.equal(attached.task.attachments[0].path, '/Users/sorin.jurcut/Documents/Project Brief.md');
  assert.equal(attached.task.attachments[0].uri, 'file:///Users/sorin.jurcut/Documents/Project%20Brief.md');
  assert.equal(attached.task.attachments[0].size, 2048);
  assert.equal(attached.task[MCP_TASK_REV_FIELD], revision + 1);

  const duplicate = attachTaskFile(store, {
    taskId: task.id,
    path: '/Users/sorin.jurcut/Documents/Project Brief.md',
    expectedRevision: revision + 1,
  });

  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.task.attachments.length, 1);
  assert.equal(duplicate.task[MCP_TASK_REV_FIELD], revision + 1);

  const removed = removeTaskAttachment(store, {
    taskId: task.id,
    attachmentId: attached.task.attachments[0].id,
    expectedRevision: revision + 1,
  });

  assert.equal(removed.ok, true);
  assert.equal(removed.removedAttachment.path, '/Users/sorin.jurcut/Documents/Project Brief.md');
  assert.deepEqual(removed.task.attachments, []);
  assert.equal(removed.task[MCP_TASK_REV_FIELD], revision + 2);
});

test('deleteTask removes a task with revision protection', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'open' })[0];
  const revision = task[MCP_TASK_REV_FIELD];

  const stale = deleteTask(store, {
    taskId: task.id,
    expectedRevision: revision + 1,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error, 'REVISION_MISMATCH');
  assert.ok(listTasks(store).some(item => item.id === task.id));

  const deleted = deleteTask(store, {
    taskId: task.id,
    expectedRevision: revision,
  });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.deletedTaskId, task.id);
  assert.equal(deleted.currentRevision, revision);
  assert.ok(!listTasks(store).some(item => item.id === task.id));
  assert.ok(!getWorkspaceSnapshot(store).workspace.tasks.some(item => item.id === task.id));
});

test('deleteTask cleans milestone links and task dependency references', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const milestone = createMilestone(store, {
    title: 'Release Alpha',
    projectIds: ['Project A'],
    endDate: '2026-04-01',
    linkedTaskIds: ['task-1', 'task-2'],
  }).milestone;
  const dependentUpdate = updateTaskDetails(store, {
    taskId: 'task-3',
    dependencyIds: ['task-2'],
    expectedRevision: 0,
  });
  assert.equal(dependentUpdate.ok, true);
  const followUp = createTask(store, { title: 'Follow-up', parentTaskId: 'task-2' }).task;

  const taskToDelete = getTaskById(store, 'task-2');
  const deleted = deleteTask(store, {
    taskId: 'task-2',
    expectedRevision: taskToDelete[MCP_TASK_REV_FIELD],
  });

  assert.equal(deleted.ok, true);
  assert.deepEqual(deleted.cleanup.updatedMilestoneIds, [milestone.id]);
  assert.deepEqual(deleted.cleanup.removedDependencyReferences, ['task-3']);
  assert.deepEqual(deleted.cleanup.clearedParentReferences, [followUp.id]);
  assert.deepEqual(getMilestoneById(store, milestone.id).linkedTaskIds, ['task-1']);
  assert.deepEqual(getTaskById(store, 'task-3').dependencyIds, []);
  assert.equal(getTaskById(store, followUp.id).parentTaskId, undefined);
});

test('updateTaskDetails rejects stale revisions and invalid references', () => {
  const store = makeStoreFromFixture('workspace-basic');

  const stale = updateTaskDetails(store, {
    taskId: 'task-1',
    title: 'Should not apply',
    expectedRevision: 99,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error, 'REVISION_MISMATCH');

  const invalidProject = updateTaskDetails(store, {
    taskId: 'task-1',
    projectIds: ['Missing Project'],
    expectedRevision: 0,
  });
  assert.equal(invalidProject.ok, false);
  assert.equal(invalidProject.error, 'PROJECT_NOT_FOUND');
});

test('assignTaskToPerson resolves assignees by name and id', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'open' })[0];
  const revision = task[MCP_TASK_REV_FIELD];

  const byName = assignTaskToPerson(store, {
    taskId: task.id,
    assigneeName: 'Codex',
    assigneeKind: 'agentic',
    expectedRevision: revision,
  });
  assert.equal(byName.ok, true);
  assert.equal(byName.task.assigneeId, 'agent-1');
  assert.equal(byName.task[MCP_TASK_REV_FIELD], revision + 1);

  const byId = assignTaskToPerson(store, {
    taskId: task.id,
    assigneeId: 'person-1',
    assigneeKind: 'human',
    expectedRevision: byName.task[MCP_TASK_REV_FIELD],
  });
  assert.equal(byId.ok, true);
  assert.equal(byId.task.assigneeId, 'person-1');
  assert.equal(byId.task[MCP_TASK_REV_FIELD], revision + 2);
});

test('agent summary update requires revision and increments revision', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'open' })[0];
  const revision = task[MCP_TASK_REV_FIELD];

  const updated = updateTaskAgentSummary(store, {
    taskId: task.id,
    summary: 'Implemented and ready for review',
    expectedRevision: revision,
  });

  assert.equal(updated.ok, true);
  assert.equal(updated.task.agentSummary, 'Implemented and ready for review');
  assert.equal(updated.task[MCP_TASK_REV_FIELD], revision + 1);
});

test('task comments are appended structurally and increment revision', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'open' })[0];
  const revision = task[MCP_TASK_REV_FIELD];

  const commented = addTaskComment(store, {
    taskId: task.id,
    comment: 'Need a pass on hover states before merging.',
    author: 'Codex',
    expectedRevision: revision,
  });

  assert.equal(commented.ok, true);
  assert.equal(commented.task.comments.length, 1);
  assert.equal(commented.task.comments[0].author, 'Codex');
  assert.equal(commented.task.comments[0].content, 'Need a pass on hover states before merging.');
  assert.equal(commented.task[MCP_TASK_REV_FIELD], revision + 1);
});

test('task activity entries are appended structurally and increment revision', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'open' })[0];
  const revision = task[MCP_TASK_REV_FIELD];

  const updated = addTaskActivityEntry(store, {
    taskId: task.id,
    message: 'Agent picked up the task and started repository inspection.',
    type: 'activity',
    expectedRevision: revision,
  });

  assert.equal(updated.ok, true);
  assert.equal(updated.task.activityLog.length, 1);
  assert.equal(updated.task.activityLog[0].type, 'activity');
  assert.match(updated.task.activityLog[0].message, /started repository inspection/);
  assert.equal(updated.task[MCP_TASK_REV_FIELD], revision + 1);
});

test('logTaskTime appends approximate time and increments total minutes', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'open' })[0];
  const revision = task[MCP_TASK_REV_FIELD];

  const logged = logTaskTime(store, {
    taskId: task.id,
    minutes: 35,
    note: 'Approximate implementation pass',
    expectedRevision: revision,
  });

  assert.equal(logged.ok, true);
  assert.equal(logged.task.timeSpentMinutes, 35);
  assert.equal(logged.task.timeSpentNote, 'Approximate implementation pass');
  assert.equal(logged.task.timeEntries.length, 1);
  assert.equal(logged.task.timeEntries[0].minutes, 35);
  assert.equal(logged.task[MCP_TASK_REV_FIELD], revision + 1);
});

test('createMilestone creates roadmap milestone and links existing tasks', () => {
  const store = makeStoreFromFixture('workspace-basic');

  const created = createMilestone(store, {
    title: 'Release Alpha',
    projectIds: ['Project A'],
    startDate: '2026-03-20',
    endDate: '2026-04-01',
    description: 'First roadmap release.',
    linkedTaskIds: ['task-1', 'task-2'],
  });

  assert.equal(created.ok, true);
  assert.equal(created.milestone.title, 'Release Alpha');
  assert.deepEqual(created.milestone.projectIds, ['lane-1']);
  assert.deepEqual(created.milestone.linkedTaskIds, ['task-1', 'task-2']);
  assert.equal(listMilestones(store).length, 1);

  const linkedTask = listTasks(store).find(task => task.id === 'task-1');
  assert.equal(linkedTask.milestoneId, created.milestone.id);
  assert.equal(linkedTask[MCP_TASK_REV_FIELD], 1);
});

test('updateMilestone unlinks tasks and clears milestoneId from removed tasks', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const created = createMilestone(store, {
    title: 'Release Alpha',
    projectIds: ['Project A'],
    endDate: '2026-04-01',
    linkedTaskIds: ['task-1', 'task-2'],
  });

  const updated = updateMilestone(store, {
    milestoneId: created.milestone.id,
    linkedTaskIds: ['task-1'],
    expectedRevision: created.milestone[MCP_TASK_REV_FIELD],
  });

  assert.equal(updated.ok, true);
  assert.deepEqual(updated.milestone.linkedTaskIds, ['task-1']);
  assert.equal(updated.milestone[MCP_TASK_REV_FIELD], 1);

  const stillLinkedTask = listTasks(store).find(task => task.id === 'task-1');
  const unlinkedTask = listTasks(store).find(task => task.id === 'task-2');
  assert.equal(stillLinkedTask.milestoneId, created.milestone.id);
  assert.equal(unlinkedTask.milestoneId, undefined);
});

test('linkMilestoneTasks atomically links tasks and dependency IDs without task revisions', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const created = createMilestone(store, {
    title: 'Release Alpha',
    projectIds: ['Project A'],
    endDate: '2026-04-01',
    linkedTaskIds: ['task-1'],
  });

  const staleTaskRevision = getTaskById(store, 'task-2')[MCP_TASK_REV_FIELD];
  const linked = linkMilestoneTasks(store, {
    milestoneId: created.milestone.id,
    taskIds: ['task-2', 'task-3'],
    dependencyUpdates: [
      { taskId: 'task-3', dependencyIds: ['task-2'] },
    ],
    expectedRevision: created.milestone[MCP_TASK_REV_FIELD],
  });

  assert.equal(linked.ok, true);
  assert.deepEqual(linked.milestone.linkedTaskIds, ['task-1', 'task-2', 'task-3']);
  assert.deepEqual(linked.linkedTaskIdsAdded, ['task-2', 'task-3']);
  assert.deepEqual(linked.changedTaskIds.sort(), ['task-2', 'task-3']);
  assert.equal(getTaskById(store, 'task-2').milestoneId, created.milestone.id);
  assert.equal(getTaskById(store, 'task-2')[MCP_TASK_REV_FIELD], staleTaskRevision + 1);
  assert.equal(getTaskById(store, 'task-3').milestoneId, created.milestone.id);
  assert.deepEqual(getTaskById(store, 'task-3').dependencyIds, ['task-2']);
});

test('linkMilestoneTasks rejects invalid dependency updates before changing the milestone', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const created = createMilestone(store, {
    title: 'Release Alpha',
    projectIds: ['Project A'],
    endDate: '2026-04-01',
    linkedTaskIds: ['task-1'],
  });

  const rejected = linkMilestoneTasks(store, {
    milestoneId: created.milestone.id,
    taskIds: ['task-2'],
    dependencyUpdates: [
      { taskId: 'task-2', dependencyIds: ['missing-task'] },
    ],
    expectedRevision: created.milestone[MCP_TASK_REV_FIELD],
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, 'TASK_REFERENCE_NOT_FOUND');
  assert.deepEqual(getMilestoneById(store, created.milestone.id).linkedTaskIds, ['task-1']);
  assert.equal(getTaskById(store, 'task-2').milestoneId, undefined);
});

test('linkMilestoneTasks rejects dependency cycles before changing the milestone', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const created = createMilestone(store, {
    title: 'Release Alpha',
    projectIds: ['Project A'],
    endDate: '2026-04-01',
    linkedTaskIds: ['task-1', 'task-2'],
  });

  const rejected = linkMilestoneTasks(store, {
    milestoneId: created.milestone.id,
    dependencyUpdates: [
      { taskId: 'task-1', dependencyIds: ['task-2'] },
      { taskId: 'task-2', dependencyIds: ['task-1'] },
    ],
    expectedRevision: created.milestone[MCP_TASK_REV_FIELD],
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, 'DEPENDENCY_CYCLE');
  assert.deepEqual(getTaskById(store, 'task-1').dependencyIds || [], []);
  assert.deepEqual(getTaskById(store, 'task-2').dependencyIds || [], []);
});

test('deleteMilestone removes milestone and clears linked task roadmap metadata', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const created = createMilestone(store, {
    title: 'Release Alpha',
    projectIds: ['Project A'],
    endDate: '2026-04-01',
    linkedTaskIds: ['task-1', 'task-2'],
  });
  const dependencyUpdate = updateTaskDetails(store, {
    taskId: 'task-1',
    dependencyIds: ['task-2'],
    expectedRevision: 1,
  });
  assert.equal(dependencyUpdate.ok, true);

  const deleted = deleteMilestone(store, {
    milestoneId: created.milestone.id,
    expectedRevision: created.milestone[MCP_TASK_REV_FIELD],
  });

  assert.equal(deleted.ok, true);
  assert.equal(getMilestoneById(store, created.milestone.id), null);
  assert.deepEqual(deleted.cleanup.clearedMilestoneTaskIds.sort(), ['task-1', 'task-2']);
  assert.deepEqual(deleted.cleanup.clearedDependencyTaskIds, ['task-1']);
  assert.equal(getTaskById(store, 'task-1').milestoneId, undefined);
  assert.deepEqual(getTaskById(store, 'task-1').dependencyIds, []);
  assert.equal(getTaskById(store, 'task-2').milestoneId, undefined);
});

test('task normalization extracts project context from description notes', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'under-review' })[0];
  assert.ok(task.descriptionProjectContext);
  assert.deepEqual(task.descriptionProjectContext.projectMentions, ['Mission Control']);
  assert.ok(task.descriptionProjectContext.repoHints.some(value => value.includes('github.com/acme/omvra')));
  assert.ok(task.descriptionProjectContext.urls.some(value => value.includes('github.com/acme/omvra/issues/10')));
});

test('creates Requires human review board and moves qualifying tasks', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const result = moveTasksToRequiresHumanReviewBoard(store, { includeDone: false });

  assert.equal(result.statusId, REQUIRES_HUMAN_REVIEW_STATUS_ID);
  assert.equal(result.totalMoved, 1);
  assert.ok(result.movedTaskIds.includes('task-3'));

  const statusColumns = store.get(STATUS_COLUMNS_KEY);
  assert.ok(statusColumns.some(col => col.id === REQUIRES_HUMAN_REVIEW_STATUS_ID));

  const updatedTasks = store.get(TASKS_KEY);
  const moved = updatedTasks.filter(task => result.movedTaskIds.includes(task.id));
  assert.ok(moved.every(task => task.status === REQUIRES_HUMAN_REVIEW_STATUS_ID));
});

test('completion description update appends brief completion section and is idempotent', () => {
  const store = makeStoreFromFixture('workspace-basic');
  const task = listTasks(store, { status: 'open' })[0];
  const rev = task[MCP_TASK_REV_FIELD];

  const first = updateTaskCompletionDescription(store, {
    taskId: task.id,
    completion: 'Implemented final drag behaviour and fixed edge-case snapping.',
    expectedRevision: rev,
  });
  assert.equal(first.ok, true);
  assert.match(first.task.notes, /### Agent Completion/);
  assert.match(first.task.notes, /Implemented final drag behaviour/);

  const second = updateTaskCompletionDescription(store, {
    taskId: task.id,
    completion: 'Reworked it again with a shorter update.',
    expectedRevision: rev + 1,
  });
  assert.equal(second.ok, true);
  const sectionCount = (second.task.notes.match(/### Agent Completion/g) || []).length;
  assert.equal(sectionCount, 1);
  assert.match(second.task.notes, /Reworked it again with a shorter update\./);
});

test('custom status fixture is preserved in workspace snapshot and task filters', () => {
  const store = makeStoreFromFixture('workspace-custom-status');
  const snapshot = getWorkspaceSnapshot(store);
  const task = listTasks(store, { status: 'ideas' })[0];

  assert.ok(snapshot.workspace.statusColumns.some(column => column.id === 'ideas'));
  assert.equal(task.id, 'task-custom-1');
  assert.equal(task.status, 'ideas');
});

test('Goal agent dispatch read model preserves canonical, ephemeral, and unavailable states', () => {
  const store = makeStoreFromFixture('workspace-basic');
  store.set('omvra.people.v1', [{ id: 'canonical-1', kind: 'agentic', name: 'Canonical', agentInstructions: 'Persona', agentOperationalInstructions: 'Method' }]);
  store.set('omvra.goals.v1', [{ id: 'goal-agent-dispatch', title: 'Dispatch', elements: [
    { id: 'existing', type: 'agent', title: 'Existing', x: 0, y: 0, agentConfiguration: { mode: 'existing', assigneeId: 'canonical-1', instructions: 'Node task' } },
    { id: 'ephemeral', type: 'agent', title: 'Ephemeral', x: 0, y: 0, agentConfiguration: { mode: 'ephemeral', autoGenerateName: true, requestedType: 'researcher', instructions: 'Research this' } },
    { id: 'missing', type: 'agent', title: 'Missing', x: 0, y: 0, agentConfiguration: { mode: 'existing', assigneeId: 'gone', instructions: 'Do not reassign', spawnIfUnavailable: true } },
  ] }]);

  assert.deepEqual(resolveGoalAgentDispatch(store, store.get('omvra.goals.v1')[0].elements[0]), {
    status: 'resolved', mode: 'existing', assigneeId: 'canonical-1', profileSource: 'canonical',
    personaInstructions: 'Persona', operationalInstructions: 'Method', instructions: 'Node task',
  });
  const agents = listGoals(store)[0].agents;
  assert.equal(agents[1].agentDispatch.status, 'recruitment-requested');
  assert.equal(agents[1].agentDispatch.autoGenerateName, true);
  assert.equal(agents[1].agentDispatch.profileSource, 'none');
  assert.equal(agents[2].agentDispatch.status, 'unavailable');
  assert.equal(agents[2].agentDispatch.recruitmentFallback, 'overseer-managed-temporary-agent');
});
