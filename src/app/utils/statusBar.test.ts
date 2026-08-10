import test from 'node:test';
import assert from 'node:assert/strict';
import type { Person } from '../types.ts';
import {
  deriveAgentStatuses,
  getRecentMcpActivitySignal,
  getMcpStatusSummary,
  rollupActiveAgentProvenance,
  rollupAgentStatuses,
} from './statusBar.ts';

type AgentWatchRuntimeState = Record<string, unknown>;
const agentWatchConfigs: never[] = [];

const people: Person[] = [
  { id: 'agent-1', name: 'Codex', role: 'Agent', kind: 'agentic' },
  { id: 'agent-2', name: 'Edgar', role: 'Agent', kind: 'agentic' },
  { id: 'person-1', name: 'Ada', role: 'Engineer', kind: 'human' },
];

test.skip('removed agent watcher activity signals', () => {
  const now = Date.parse('2026-07-01T18:45:00.000Z');
  const runtime: Record<string, AgentWatchRuntimeState> = {
    'agent-1': {
      personId: 'agent-1',
      lastCheckedAt: '2026-07-01T18:44:30.000Z',
      newTaskCount: 1,
      updatedTaskCount: 0,
      removedTaskCount: 0,
      latestTaskTitles: ['Tighten status copy'],
    },
  };

  const statuses = deriveAgentStatuses({
    people,
    tasks: [],
    agentWatchConfigs,
    agentWatchRuntime: runtime,
    mcpAuditLog: [
      {
        auditId: 'audit-1',
        timestamp: '2026-07-01T18:44:40.000Z',
        outcome: 'allowed',
        toolName: 'tasks.update',
        assigneeId: 'agent-1',
        userAgent: 'GitHub-Copilot/1.0',
      },
    ],
    now,
  });

  assert.equal(statuses.find(status => status.personId === 'agent-1')?.state, 'writing');
  assert.equal(statuses.find(status => status.personId === 'agent-1')?.provenance.id, 'copilot');
});

test.skip('removed agent watcher freshness signals', () => {
  const now = Date.parse('2026-07-01T18:45:00.000Z');
  const runtime: Record<string, AgentWatchRuntimeState> = {
    'agent-1': {
      personId: 'agent-1',
      lastCheckedAt: '2026-07-01T18:44:30.000Z',
      newTaskCount: 1,
      updatedTaskCount: 0,
      removedTaskCount: 0,
      latestTaskTitles: ['Draft task summary'],
    },
    'agent-2': {
      personId: 'agent-2',
      lastCheckedAt: '2026-07-01T18:40:30.000Z',
      newTaskCount: 0,
      updatedTaskCount: 0,
      removedTaskCount: 0,
      latestTaskTitles: [],
    },
  };

  const statuses = deriveAgentStatuses({
    people,
    tasks: [],
    agentWatchConfigs,
    agentWatchRuntime: runtime,
    mcpAuditLog: [],
    now,
  });

  assert.equal(statuses.find(status => status.personId === 'agent-1')?.state, 'working');
  assert.equal(statuses.find(status => status.personId === 'agent-2')?.state, 'idle');

  const staleStatuses = deriveAgentStatuses({
    people,
    tasks: [],
    agentWatchConfigs,
    agentWatchRuntime: {
      'agent-1': {
        ...runtime['agent-1'],
        lastCheckedAt: '2026-07-01T18:20:00.000Z',
      },
    },
    mcpAuditLog: [],
    now,
  });

  assert.equal(staleStatuses.find(status => status.personId === 'agent-1')?.state, 'unavailable');
  assert.equal(staleStatuses.find(status => status.personId === 'agent-2')?.state, 'unavailable');
});

test('deriveAgentStatuses falls back to recent generic MCP task activity when one agent exists', () => {
  const now = Date.parse('2026-07-01T21:22:17.927Z');
  const singleAgentPeople: Person[] = [
    { id: 'agent-1', name: 'Goko', role: 'Agent', kind: 'agentic' },
  ];

  const statuses = deriveAgentStatuses({
    people: singleAgentPeople,
    tasks: [
      {
        id: 'task-1',
        title: 'MCP comms test task',
        status: 'open',
        mcpLastActor: 'mcp-agent',
        mcpUpdatedAt: '2026-07-01T21:21:27.805Z',
      },
    ],
    mcpAuditLog: [],
    now,
  });

  assert.equal(statuses[0]?.state, 'working');
  assert.equal(statuses[0]?.provenance.id, 'unknown');
});

test('rollupAgentStatuses groups counts by derived state', () => {
  const rollup = rollupAgentStatuses([
    {
      personId: 'agent-1',
      name: 'Codex',
      state: 'writing',
      tone: 'warning',
      title: 'Codex is writing',
      provenance: {
        id: 'codex',
        label: 'Codex',
        dotColor: '#7c6ee6',
        badgeBackground: '#eeebff',
        badgeTextColor: '#6558d3',
        cardBackground: '',
      },
    },
    {
      personId: 'agent-2',
      name: 'Edgar',
      state: 'idle',
      tone: 'muted',
      title: 'Edgar is idle',
      provenance: {
        id: 'unknown',
        label: 'Unknown',
        dotColor: '#94a3b8',
        badgeBackground: '#f3f4f6',
        badgeTextColor: '#6b7280',
        cardBackground: '',
      },
    },
    {
      personId: 'agent-3',
      name: 'Pericles',
      state: 'unavailable',
      tone: 'unknown',
      title: 'Pericles is unavailable',
      provenance: {
        id: 'unknown',
        label: 'Unknown',
        dotColor: '#94a3b8',
        badgeBackground: '#f3f4f6',
        badgeTextColor: '#6b7280',
        cardBackground: '',
      },
    },
  ]);

  assert.equal(rollup.total, 3);
  assert.equal(rollup.counts.writing, 1);
  assert.equal(rollup.counts.idle, 1);
  assert.equal(rollup.counts.unavailable, 1);
  assert.deepEqual(rollup.byState.writing.map(agent => agent.name), ['Codex']);
});

test('rollupActiveAgentProvenance groups working and writing agents by provenance', () => {
  const provenance = rollupActiveAgentProvenance([
    {
      personId: 'agent-1',
      name: 'Codex',
      state: 'writing',
      tone: 'warning',
      title: 'Codex is writing',
      provenance: {
        id: 'codex',
        label: 'Codex',
        dotColor: '#7c6ee6',
        badgeBackground: '#eeebff',
        badgeTextColor: '#6558d3',
        cardBackground: '',
      },
    },
    {
      personId: 'agent-2',
      name: 'Copilot',
      state: 'working',
      tone: 'success',
      title: 'Copilot is working',
      provenance: {
        id: 'copilot',
        label: 'Copilot',
        dotColor: '#2563eb',
        badgeBackground: '#e7f0ff',
        badgeTextColor: '#1d4ed8',
        cardBackground: '',
      },
    },
    {
      personId: 'agent-3',
      name: 'Claude',
      state: 'idle',
      tone: 'muted',
      title: 'Claude is idle',
      provenance: {
        id: 'claude',
        label: 'Claude',
        dotColor: '#cd9169',
        badgeBackground: '#f5e7dc',
        badgeTextColor: '#9a6847',
        cardBackground: '',
      },
    },
  ]);

  assert.deepEqual(
    provenance.map(item => [item.id, item.count]),
    [
      ['codex', 1],
      ['copilot', 1],
    ]
  );
});

test('getRecentMcpActivitySignal returns a pulsing signal for recent audit activity', () => {
  const signal = getRecentMcpActivitySignal({
    mcpAuditLog: [
      {
        auditId: 'audit-1',
        timestamp: '2026-07-01T18:44:59.400Z',
        outcome: 'allowed',
        toolName: 'tasks.update',
        userAgent: 'GitHub-Copilot/1.0',
      },
    ],
    tasks: [],
    now: Date.parse('2026-07-01T18:45:00.000Z'),
  });

  assert.equal(signal.isActive, true);
  assert.equal(signal.tone, 'success');
  assert.equal(signal.provenance?.id, 'copilot');
});

test('getRecentMcpActivitySignal falls back to task activity when audit data is absent', () => {
  const signal = getRecentMcpActivitySignal({
    mcpAuditLog: [],
    tasks: [
      {
        id: 'task-1',
        title: 'Created from MCP',
        status: 'open',
        mcpLastActor: 'codex',
        mcpUpdatedAt: '2026-07-01T18:44:59.700Z',
      },
    ],
    now: Date.parse('2026-07-01T18:45:00.000Z'),
  });

  assert.equal(signal.isActive, true);
  assert.equal(signal.provenance?.id, 'codex');
});

test('getMcpStatusSummary preserves the running, restart-needed, and offline states', () => {
  assert.deepEqual(
    getMcpStatusSummary({
      mcpAgentAccessEnabled: true,
      mcpListenerStatus: { status: 'running', listening: true } as McpListenerStatus,
      mcpRestartPending: false,
    }),
    { label: 'MCP running', tone: 'success' }
  );

  assert.deepEqual(
    getMcpStatusSummary({
      mcpAgentAccessEnabled: true,
      mcpListenerStatus: { status: 'running', listening: true, restartRequired: true } as McpListenerStatus,
      mcpRestartPending: false,
    }),
    { label: 'MCP restart needed', tone: 'warning' }
  );

  assert.deepEqual(
    getMcpStatusSummary({
      mcpAgentAccessEnabled: false,
      mcpListenerStatus: null,
      mcpRestartPending: false,
    }),
    { label: 'MCP offline', tone: 'muted' }
  );
});
