import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoalPolicyBackupPayload,
  buildWorkspaceBackupPayload,
  buildWorkspaceBackupFileName,
  createDefaultWorkspacePreferences,
  getPortableElectronStoreSnapshotFromExport,
  getPortableStorageSnapshotFromEntries,
  repairGoalPolicyBackupPayload,
  repairWorkspaceBackupPayload,
} from './workspaceBackup.ts';
import { createDefaultGoalPolicy } from '../utils/goalPolicy.ts';

const fallbackStatusColumns = [
  { id: 'open', title: 'Open Tasks', color: '#999999' },
  { id: 'in-progress', title: 'In Progress', color: '#2563eb' },
];

test('policy-only backup round-trips the Goal policy and reports repaired fields', () => {
  const policy = createDefaultGoalPolicy('2026-07-19T00:00:00.000Z');
  policy.currency = 'EUR';
  const payload = buildGoalPolicyBackupPayload(policy, '2026-07-19T01:00:00.000Z');
  const repaired = repairGoalPolicyBackupPayload(payload, createDefaultGoalPolicy());

  assert.equal(repaired.ok, true);
  assert.equal(repaired.policy.currency, 'EUR');
  assert.equal(repaired.warnings.length, 0);

  const malformed = repairGoalPolicyBackupPayload({
    ...payload,
    goalPolicy: { ...policy, dimensions: { tokens: { constrained: true, value: -1 } } },
  }, createDefaultGoalPolicy());
  assert.equal(malformed.ok, true);
  assert.equal(malformed.policy.dimensions.tokens.value, 100000);
  assert.ok(malformed.warnings.length > 0);
});

test('full workspace backups keep Goal policy separate from general preferences', () => {
  const policy = createDefaultGoalPolicy('2026-07-19T00:00:00.000Z');
  const payload = buildWorkspaceBackupPayload({
    tasks: [],
    milestones: [],
    projects: [],
    people: [],
    statusColumns: fallbackStatusColumns,
    preferences: createDefaultWorkspacePreferences(fallbackStatusColumns),
    goalPolicy: policy,
  });

  assert.deepEqual(payload.goalPolicy, policy);
  assert.notEqual(payload.preferences, payload.goalPolicy);
});

test('workspace backup preserves versioned Goal agent configuration through electron-store round trips', () => {
  const goal = {
    id: 'goal-agent-backup',
    title: 'Backup delegation',
    projectBindings: [{ id: 'binding-1', projectId: 'project-1', role: 'primary' }],
    inputs: [{ id: 'brief', kind: 'file', valueRef: 'vault://brief', sensitive: true }],
    capabilities: [{ id: 'read-files', capabilityId: 'files.read', source: 'local', version: '1.0.0', trust: 'trusted' }],
    elements: [{
      id: 'agent-node',
      type: 'agent',
      title: 'Temporary researcher',
      x: 0,
      y: 0,
      agentConfiguration: { version: 1, mode: 'ephemeral', autoGenerateName: true, requestedType: 'researcher', instructions: 'Find evidence.' },
    }],
  };
  const payload = buildWorkspaceBackupPayload({
    tasks: [], milestones: [], projects: [], people: [], statusColumns: fallbackStatusColumns,
    preferences: createDefaultWorkspacePreferences(fallbackStatusColumns),
    electronStore: { 'omvra.goals.v1': [goal] },
  });
  const repaired = repairWorkspaceBackupPayload(payload, {
    fallbackStatusColumns,
    fallbackPreferences: createDefaultWorkspacePreferences(fallbackStatusColumns),
  });

  assert.equal(repaired.ok, true);
  assert.deepEqual(repaired.electronStoreSnapshot['omvra.goals.v1'], [goal]);
});

test('workspace backup preserves immutable task context ledger records and unknown fields', () => {
  const entry = {
    schemaVersion: 1,
    id: 'task-context-1',
    taskId: 'task-1',
    kind: 'decision',
    fromRevision: 2,
    toRevision: 3,
    summary: 'Keep context separate from the task projection.',
    markers: ['architecture'],
    changedFields: ['notes'],
    provenance: 'agent-authored',
    actor: 'agent-edgar',
    sourceRefs: [{ type: 'attachment', id: 'architecture-doc', extension: { retained: true } }],
    createdAt: '2026-07-29T20:00:00.000Z',
    extension: { retained: true },
  };
  const payload = buildWorkspaceBackupPayload({
    tasks: [], milestones: [], projects: [], people: [], statusColumns: fallbackStatusColumns,
    preferences: createDefaultWorkspacePreferences(fallbackStatusColumns),
    electronStore: { 'omvra.taskContextEntries.v1': [entry] },
  });
  const repaired = repairWorkspaceBackupPayload(payload, {
    fallbackStatusColumns,
    fallbackPreferences: createDefaultWorkspacePreferences(fallbackStatusColumns),
  });

  assert.equal(repaired.ok, true);
  assert.deepEqual(repaired.electronStoreSnapshot['omvra.taskContextEntries.v1'], [entry]);
});

test('workspace backup preserves runtime profiles, defaults, and observations separately', () => {
  const electronStore = {
    'omvra.agentRuntimeProfiles.v1': { schemaVersion: 1, profiles: [{
      schemaVersion: 1, id: 'local', name: 'Local ACP', integrationMode: 'acp-local-stdio', executablePath: '/usr/bin/agent', fixedArgs: ['--acp'], enabled: true,
    }] },
    'omvra.agentRuntimeDefaults.v1': { schemaVersion: 1, globalProfileId: 'local', projectProfileIds: { 'project-1': 'local' } },
    'omvra.agentRuntimeObservations.v1': { schemaVersion: 1, observations: { local: { availability: 'available', observedAt: '2026-07-29T20:00:00.000Z' } } },
  };
  const payload = buildWorkspaceBackupPayload({
    tasks: [], milestones: [], projects: [], people: [], statusColumns: fallbackStatusColumns,
    preferences: createDefaultWorkspacePreferences(fallbackStatusColumns), electronStore,
  });
  const repaired = repairWorkspaceBackupPayload(payload, {
    fallbackStatusColumns,
    fallbackPreferences: createDefaultWorkspacePreferences(fallbackStatusColumns),
  });

  assert.equal(repaired.ok, true);
  assert.deepEqual(repaired.electronStoreSnapshot['omvra.agentRuntimeProfiles.v1'], electronStore['omvra.agentRuntimeProfiles.v1']);
  assert.deepEqual(repaired.electronStoreSnapshot['omvra.agentRuntimeDefaults.v1'], electronStore['omvra.agentRuntimeDefaults.v1']);
  assert.deepEqual(repaired.electronStoreSnapshot['omvra.agentRuntimeObservations.v1'], electronStore['omvra.agentRuntimeObservations.v1']);
});

test('workspace backup preserves valid collaboration extensions and omits invalid delegation', () => {
  const people = [
    { id: 'orchestrator', name: 'Arc', role: 'Lead', kind: 'agentic' as const },
    { id: 'delegate', name: 'Edgar', role: 'Engineer', kind: 'agentic' as const, availableForSubagentDelegation: true },
  ];
  const baseTask = {
    id: 'task-collaboration', title: 'Persist collaboration', status: 'open' as const, assigneeId: 'orchestrator',
    collaboration: {
      schemaVersion: 1 as const,
      orchestratorId: 'orchestrator',
      extension: { retained: true },
      contributions: [{ id: 'contribution-1', personId: 'delegate', role: 'subagent' as const, scope: 'Persistence', state: 'pending' as const }],
    },
  };
  const options = { fallbackStatusColumns, fallbackPreferences: createDefaultWorkspacePreferences(fallbackStatusColumns) };
  const repaired = repairWorkspaceBackupPayload({
    version: 2, tasks: [baseTask], milestones: [], projects: [], people, statusColumns: fallbackStatusColumns, preferences: {},
  }, options);

  assert.equal(repaired.tasks[0].collaboration?.extension && (repaired.tasks[0].collaboration.extension as { retained: boolean }).retained, true);
  assert.equal(repaired.tasks[0].collaboration?.contributions[0].id, 'contribution-1');

  const invalid = repairWorkspaceBackupPayload({
    version: 2,
    tasks: [{ ...baseTask, collaboration: { ...baseTask.collaboration, contributions: [baseTask.collaboration.contributions[0], { ...baseTask.collaboration.contributions[0], id: 'contribution-2' }] } }],
    milestones: [], projects: [], people, statusColumns: fallbackStatusColumns, preferences: {},
  }, options);
  assert.equal(invalid.tasks[0].collaboration, undefined);
});

test('legacy Plumy backup storage keys are restored under the Omvra namespace', () => {
  const tasksJson = JSON.stringify([{ id: 'task-1', title: 'Legacy task', status: 'open' }]);
  const snapshot = getPortableStorageSnapshotFromEntries({
    'plumy.tasks.v1': tasksJson,
    'plumy_viewstate_timeline': '{"zoom":1}',
    'other.key': 'ignored',
  });

  assert.deepEqual(snapshot, {
    'omvra.tasks.v1': tasksJson,
    'omvra_viewstate_timeline': '{"zoom":1}',
  });
});

test('legacy Plumy backup payload snapshots normalize before restore', () => {
  const repaired = repairWorkspaceBackupPayload(
    {
      version: 2,
      exportedAt: '2026-06-22T00:00:00.000Z',
      tasks: [{ id: 'task-1', title: 'Legacy task', status: 'open' }],
      projects: [{ id: 'project-1', name: 'Legacy Project', color: '#80ffe5' }],
      people: [{ id: 'person-1', name: 'Legacy User', role: 'Designer' }],
      statusColumns: fallbackStatusColumns,
      preferences: {},
      storage: {
        'plumy.tasks.v1': '[{"id":"task-1"}]',
        'plumy_viewstate_kanban': '{"collapsed":[]}',
      },
      electronStore: {
        plumy: {
          preferences: {
            v1: {
              mcpAgentAccessEnabled: true,
            },
          },
        },
        plumy_viewstate_roadmap: '{"scale":"month"}',
      },
    },
    {
      fallbackStatusColumns,
      fallbackPreferences: createDefaultWorkspacePreferences(fallbackStatusColumns),
    }
  );

  assert.equal(repaired.ok, true);
  assert.deepEqual(repaired.storageSnapshot, {
    'omvra.tasks.v1': '[{"id":"task-1"}]',
    'omvra_viewstate_kanban': '{"collapsed":[]}',
  });
  assert.deepEqual(repaired.electronStoreSnapshot, {
    'omvra.preferences.v1.mcpAgentAccessEnabled': true,
    'omvra_viewstate_roadmap': '{"scale":"month"}',
  });
});

test('legacy Plumy electron-store exports normalize under Omvra keys', () => {
  const snapshot = getPortableElectronStoreSnapshotFromExport({
    plumy: {
      tasks: {
        v1: [{ id: 'task-1' }],
      },
    },
    plumy_viewstate_timeline: { scrollLeft: 120 },
  });

  assert.deepEqual(snapshot, {
    'omvra.tasks.v1': [{ id: 'task-1' }],
    'omvra_viewstate_timeline.scrollLeft': 120,
  });
});

test('workspace backup preferences preserve rc update channel and filenames use exported date', () => {
  const repaired = repairWorkspaceBackupPayload(
    {
      version: 2,
      exportedAt: '2026-07-02T12:34:56.000Z',
      tasks: [],
      projects: [],
      people: [],
      milestones: [],
      statusColumns: [],
      preferences: {
        updateChannel: 'rc',
      },
    },
    {
      fallbackStatusColumns,
      fallbackPreferences: createDefaultWorkspacePreferences(fallbackStatusColumns),
      allowFallbackForMissingArrays: true,
    }
  );

  assert.equal(repaired.preferences.updateChannel, 'rc');
  assert.equal(buildWorkspaceBackupFileName('2026-07-02T12:34:56.000Z'), 'omvra-backup-2026-07-02.json');
});

test('workspace backup preserves shared MCP and UI task relationships and agent context', () => {
  const repaired = repairWorkspaceBackupPayload(
    {
      version: 2,
      exportedAt: '2026-08-12T00:00:00.000Z',
      projects: [{ id: 'project-1', name: 'Omvra', color: '#2563eb' }],
      people: [{
        id: 'agent-1',
        name: 'Edgar',
        role: 'Quality agent',
        kind: 'agentic',
        agentInstructions: 'Protect the shared contract.',
        agentOperationalInstructions: 'Run the smallest complete verification.',
      }],
      statusColumns: fallbackStatusColumns,
      milestones: [{
        id: 'milestone-1',
        title: 'Contract release',
        projectIds: ['project-1'],
        endDate: '2026-08-30',
        linkedTaskIds: ['task-1'],
      }],
      tasks: [{
        id: 'task-1',
        title: 'Verify shared writes',
        status: 'in-progress',
        projectIds: ['project-1'],
        swimlaneId: 'project-1',
        assigneeId: 'agent-1',
        milestoneId: 'milestone-1',
        dependencyIds: ['task-2'],
        timeSpentMinutes: 45,
        timeSpentNote: 'Contract pass',
        timeEntries: [{ id: 'time-1', minutes: 45, note: 'Contract pass', loggedAt: '2026-08-12T01:00:00.000Z' }],
        comments: [{ id: 'comment-1', author: 'Edgar', content: 'Ready', createdAt: '2026-08-12T01:00:00.000Z' }],
        activityLog: [{ id: 'activity-1', type: 'activity', message: 'Verified', createdAt: '2026-08-12T01:00:00.000Z' }],
        agentSummary: 'Shared contract verified.',
      }, {
        id: 'task-2',
        title: 'Provide fixture',
        status: 'open',
        projectIds: ['project-1'],
      }],
      preferences: {},
    },
    {
      fallbackStatusColumns,
      fallbackPreferences: createDefaultWorkspacePreferences(fallbackStatusColumns),
    }
  );

  assert.equal(repaired.ok, true);
  assert.deepEqual(repaired.tasks[0].dependencyIds, ['task-2']);
  assert.equal(repaired.tasks[0].milestoneId, 'milestone-1');
  assert.equal(repaired.tasks[0].timeSpentMinutes, 45);
  assert.equal(repaired.tasks[0].timeEntries?.[0].minutes, 45);
  assert.equal(repaired.tasks[0].comments?.[0].content, 'Ready');
  assert.equal(repaired.tasks[0].activityLog?.[0].message, 'Verified');
  assert.equal(repaired.tasks[0].agentSummary, 'Shared contract verified.');
  assert.deepEqual(repaired.milestones[0].linkedTaskIds, ['task-1']);
  assert.equal(repaired.people[0].agentInstructions, 'Protect the shared contract.');
  assert.equal(repaired.people[0].agentOperationalInstructions, 'Run the smallest complete verification.');
});

test('workspace backup preserves Goal graphs and rejects duplicate Goal or element ids', () => {
  const goal = {
    id: 'goal_1',
    title: 'Preserve graph',
    elements: [{ id: 'element_1', type: 'goal', title: 'Preserve graph', unknownField: { keep: true } }],
  };
  const repaired = repairWorkspaceBackupPayload(
    {
      version: 2,
      projects: [],
      people: [],
      tasks: [],
      milestones: [],
      statusColumns: fallbackStatusColumns,
      preferences: {},
      electronStore: {
        'omvra.goals.v1': [goal],
        'omvra.goalExecutions.v1': [{ id: 'execution_1', goalId: 'goal_1', status: 'completed' }],
        'omvra.goalEvidence.v1': [{ id: 'evidence_1', goalId: 'goal_1', immutable: true }],
      },
    },
    { fallbackStatusColumns, fallbackPreferences: createDefaultWorkspacePreferences(fallbackStatusColumns) }
  );

  assert.equal(repaired.ok, true);
  assert.deepEqual(repaired.electronStoreSnapshot['omvra.goals.v1'], [goal]);
  assert.deepEqual(repaired.electronStoreSnapshot['omvra.goalExecutions.v1'], [{ id: 'execution_1', goalId: 'goal_1', status: 'completed' }]);
  assert.deepEqual(repaired.electronStoreSnapshot['omvra.goalEvidence.v1'], [{ id: 'evidence_1', goalId: 'goal_1', immutable: true }]);

  const invalid = repairWorkspaceBackupPayload(
    {
      version: 2,
      projects: [],
      people: [],
      tasks: [],
      milestones: [],
      statusColumns: fallbackStatusColumns,
      preferences: {},
      electronStore: { 'omvra.goals.v1': [{ ...goal }, { ...goal }] },
    },
    { fallbackStatusColumns, fallbackPreferences: createDefaultWorkspacePreferences(fallbackStatusColumns) }
  );

  assert.equal(invalid.ok, false);
  assert.match(invalid.error || '', /duplicate Goal id/);
});

test('workspace backup preserves deliverable contracts and separate supporting artifact nodes', () => {
  const goal = {
    id: 'goal-deliverable-backup',
    title: 'Preserve deliverable',
    elements: [{
      id: 'deliverable-1',
      type: 'deliverable',
      title: 'Report',
      deliverySpec: { outcomeKind: 'file', instructions: 'Deliver PDF', format: 'PDF', expectedArtifactCount: 1 },
    }, {
      id: 'artifact-1',
      type: 'artifact',
      artifactRole: 'supporting',
      title: 'Research source',
      artifactReferences: [{ id: 'artifact-ref-1', artifactType: 'document', artifactId: 'source', contribution: 'supporting', label: 'Source', locator: 'file:///tmp/source.pdf' }],
    }],
  };
  const repaired = repairWorkspaceBackupPayload({ version: 2, projects: [], people: [], tasks: [], milestones: [], statusColumns: fallbackStatusColumns, preferences: {}, electronStore: { 'omvra.goals.v1': [goal] } }, { fallbackStatusColumns, fallbackPreferences: createDefaultWorkspacePreferences(fallbackStatusColumns) });
  assert.equal(repaired.ok, true);
  assert.deepEqual(repaired.electronStoreSnapshot['omvra.goals.v1'], [goal]);
});
