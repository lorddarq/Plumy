import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import TestRenderer from 'react-test-renderer';
import { toast } from 'sonner';
import type { Task, Person } from '../types.ts';
import { usePeopleActions } from './usePeopleActions.ts';
import { useStatusColumnActions } from './useStatusColumnActions.ts';
import { createDuplicatedTask, useTaskActions } from './useTaskActions.ts';
import { useMcpPanelState } from './useMcpPanelState.ts';
import { useViewState, type AllViewStates } from './useViewState.ts';
import { useTaskContextHistory } from './useTaskContextHistory.ts';
import {
  useAgentWatchRuntime,
  getAgentWatchPollingInterval,
} from './useAgentWatchRuntime.ts';
import type { McpPreferencesShape } from '../utils/mcpPreferences.ts';
import type { AgentWatchConfig } from '../utils/workspaceSanitizers.ts';
import mcpHttpServer from '../../../electron/services/mcp-http-server.cjs';
import testFixtures from '../../../electron/services/test-fixtures.cjs';

const { createRequestDispatcher } = mcpHttpServer;
const { makeStoreFromFixture } = testFixtures;

const { act, create } = TestRenderer as any;

type RenderHookHarness<TProps, TResult> = {
  result: () => TResult;
  rerender: (nextProps?: TProps) => Promise<void>;
  unmount: () => Promise<void>;
};

async function renderHook<TProps, TResult>(
  hook: (props: TProps) => TResult,
  initialProps: TProps
): Promise<RenderHookHarness<TProps, TResult>> {
  let currentResult: TResult | undefined;

  function Probe(props: TProps) {
    currentResult = hook(props);
    return null;
  }

  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(Probe, initialProps));
  });

  return {
    result: () => {
      if (currentResult === undefined) {
        throw new Error('Hook result is not available yet.');
      }
      return currentResult;
    },
    rerender: async (nextProps: TProps = initialProps) => {
      await act(async () => {
        renderer.update(React.createElement(Probe, nextProps));
      });
    },
    unmount: async () => {
      await act(async () => {
        renderer.unmount();
      });
    },
  };
}

function setWindowMock(mock: Record<string, unknown>) {
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = mock;
  return () => {
    if (previousWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = previousWindow;
    }
  };
}

test('useTaskActions saves, comments, and promotes agentic tasks to review', async () => {
  let tasks: Task[] = [];
  const setTasks = (updater: React.SetStateAction<Task[]>) => {
    tasks = typeof updater === 'function'
      ? (updater as (prev: Task[]) => Task[])(tasks)
      : updater;
  };
  const people: Person[] = [
    { id: 'human-1', name: 'Alex', role: 'Designer', kind: 'human', color: '#ec4899' },
    { id: 'agent-1', name: 'Codex', role: 'Agent', kind: 'agentic', color: '#f97316' },
  ];

  const harness = await renderHook(
    ({ nextPeople }: { nextPeople: Person[] }) => useTaskActions({ people: nextPeople, setTasks }),
    { nextPeople: people }
  );

  const { saveTask, addTaskComment, moveTask, moveAgentTaskToReview } = harness.result();

  saveTask({
    title: 'Draft watcher docs',
    notes: 'Initial notes',
    status: 'in-progress',
    assigneeId: 'agent-1',
    projectIds: ['lane-1'],
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'Draft watcher docs');
  assert.equal(tasks[0].status, 'in-progress');
  assert.equal(tasks[0].assigneeId, 'agent-1');

  saveTask({
    id: tasks[0].id,
    title: 'Draft watcher docs v2',
    projectIds: ['lane-2'],
  });
  assert.equal(tasks[0].title, 'Draft watcher docs v2');
  assert.deepEqual(tasks[0].projectIds, ['lane-2']);

  addTaskComment(tasks[0].id, '   ');
  assert.equal(tasks[0].comments?.length || 0, 0);

  addTaskComment(tasks[0].id, '  Ready for review  ');
  assert.equal(tasks[0].comments?.length, 1);
  assert.equal(tasks[0].comments?.[0].content, 'Ready for review');

  moveTask(tasks[0].id, 'done');
  assert.equal(tasks[0].status, 'done');

  tasks = [
    {
      id: 'task-agent',
      title: 'Watch tasks',
      status: 'in-progress',
      assigneeId: 'agent-1',
    } as Task,
    {
      id: 'task-human',
      title: 'Manual review',
      status: 'in-progress',
      assigneeId: 'human-1',
    } as Task,
  ];

  moveAgentTaskToReview('task-agent');
  moveAgentTaskToReview('task-human');

  assert.equal(tasks[0].status, 'under-review');
  assert.equal(tasks[1].status, 'in-progress');

  await harness.unmount();
});

test('useTaskContextHistory keeps list reads bounded and resolves details on demand', async () => {
  let listLimit = 0;
  let getCalls = 0;
  let appendPayload: Record<string, unknown> | null = null;
  let storeChanged: (() => void) | null = null;
  const restoreWindow = setWindowMock({
    electron: {
      taskContext: {
        list: async ({ limit }: { limit?: number }) => {
          listLimit = limit || 0;
          return {
            ok: true,
            entries: [{
              id: 'entry-1', kind: 'context-checkpoint', fromRevision: 4, toRevision: 4,
              summary: 'Decision captured.', markers: ['decision'], provenance: 'human-authored',
              createdAt: '2026-07-30T08:00:00.000Z',
            }],
            hasMore: true,
          };
        },
        get: async ({ entryId }: { entryId: string }) => {
          getCalls += 1;
          return { ok: true, entry: { id: entryId, sourceRefs: [], actor: 'workspace-user' }, sources: [] };
        },
        appendCheckpoint: async (payload: Record<string, unknown>) => {
          appendPayload = payload;
          return { ok: true };
        },
      },
      onStoreChanged: (listener: () => void) => { storeChanged = listener; return () => { storeChanged = null; }; },
    },
  });

  try {
    const harness = await renderHook(() => useTaskContextHistory('task-1', 4), undefined as never);
    await act(async () => {});
    assert.equal(listLimit, 12);
    assert.equal(harness.result().entries.length, 1);
    assert.equal(getCalls, 0);

    await act(async () => { await harness.result().selectEntry('entry-1'); });
    assert.equal(getCalls, 1);
    assert.equal(harness.result().detail?.entry.id, 'entry-1');

    await act(async () => { assert.equal(await harness.result().appendCheckpoint('Keep this decision.'), true); });
    assert.equal(appendPayload?.taskId, 'task-1');
    assert.equal(appendPayload?.expectedRevision, 4);

    await act(async () => { storeChanged?.(); });
    assert.equal(listLimit, 12);
    await harness.unmount();
    assert.equal(storeChanged, null);
  } finally {
    restoreWindow();
  }
});

test('createDuplicatedTask copies planning fields and resets identity/history links', () => {
  const source: Task = {
    id: 'source-task',
    title: 'Prepare release',
    status: 'in-progress',
    notes: 'Keep the rollout small.',
    startDate: '2026-07-20',
    endDate: '2026-07-22',
    size: 'l',
    complexity: 'hard',
    blocked: true,
    priority: 'urgent',
    swimlaneOnly: false,
    swimlaneId: 'project-1',
    projectIds: ['project-1', 'project-2'],
    assigneeId: 'agent-1',
    project: 'omvra',
    milestoneId: 'milestone-1',
    dependencyIds: ['dependency-1'],
    timeSpentMinutes: 45,
    timeSpentNote: 'Source history',
    timeEntries: [{ id: 'entry-1', minutes: 45, loggedAt: '2026-07-15T10:00:00.000Z' }],
    attachments: [{ id: 'attachment-1', name: 'plan.md', path: '/tmp/plan.md', uri: 'file:///tmp/plan.md', addedAt: '2026-07-15T10:00:00.000Z' }],
    comments: [{ id: 'comment-1', author: 'You', content: 'Source comment', createdAt: '2026-07-15T10:00:00.000Z' }],
    mcpUpdatedAt: '2026-07-15T10:00:00.000Z',
    mcpLastActor: 'mcp-agent',
  };

  const duplicate = createDuplicatedTask(source, 'duplicate-task');

  assert.equal(duplicate.id, 'duplicate-task');
  assert.equal(duplicate.title, 'Prepare release (copy)');
  assert.equal(duplicate.status, source.status);
  assert.equal(duplicate.notes, source.notes);
  assert.equal(duplicate.startDate, source.startDate);
  assert.equal(duplicate.endDate, source.endDate);
  assert.equal(duplicate.assigneeId, source.assigneeId);
  assert.deepEqual(duplicate.projectIds, source.projectIds);
  assert.notStrictEqual(duplicate.projectIds, source.projectIds);
  assert.equal(duplicate.milestoneId, undefined);
  assert.deepEqual(duplicate.dependencyIds, []);
  assert.deepEqual(duplicate.timeEntries, []);
  assert.deepEqual(duplicate.attachments, []);
  assert.deepEqual(duplicate.comments, []);
  assert.equal(duplicate.mcpUpdatedAt, undefined);
  assert.equal(duplicate.mcpLastActor, undefined);
});

test('UI and MCP task creation agree on canonical workspace fields', async () => {
  let tasks: Task[] = [];
  const setTasks = (updater: React.SetStateAction<Task[]>) => {
    tasks = typeof updater === 'function'
      ? (updater as (prev: Task[]) => Task[])(tasks)
      : updater;
  };
  const people: Person[] = [
    { id: 'agent-1', name: 'Codex', role: 'Agent', kind: 'agentic', color: '#f97316' },
  ];
  const taskInput = {
    title: 'Shared contract task',
    notes: 'Created through either workspace surface.',
    status: 'in-progress' as const,
    assigneeId: 'agent-1',
    projectIds: ['lane-1'],
    swimlaneId: 'lane-1',
    startDate: '2026-08-12',
    endDate: '2026-08-14',
    size: 's' as const,
    complexity: 'routine' as const,
    priority: 'moderate' as const,
    blocked: false,
    swimlaneOnly: false,
  };

  const harness = await renderHook(
    () => useTaskActions({ people, setTasks }),
    undefined
  );
  harness.result().saveTask(taskInput);

  const mcpResponse = createRequestDispatcher(makeStoreFromFixture('workspace-basic'))({
    jsonrpc: '2.0',
    id: 'shared-contract-create',
    method: 'tools/call',
    params: {
      name: 'task_write',
      arguments: { ...taskInput, statusId: taskInput.status },
    },
  }, { headers: {}, transport: 'stdio' });
  const mcpTask = mcpResponse.result.structuredContent.task as Task;
  const fields: Array<keyof Task> = [
    'title', 'notes', 'status', 'assigneeId', 'projectIds', 'swimlaneId',
    'startDate', 'endDate', 'size', 'complexity', 'priority', 'blocked', 'swimlaneOnly',
  ];

  assert.deepEqual(
    Object.fromEntries(fields.map(field => [field, mcpTask[field]])),
    Object.fromEntries(fields.map(field => [field, tasks[0][field]]))
  );

  await harness.unmount();
});

test('useViewState exposes hydrated timeline state on first render and preserves it across view switching', async () => {
  const restoreWindow = setWindowMock({
    localStorage: {
      setItem: () => {},
      removeItem: () => {},
      getItem: () => null,
    },
    electron: {
      storeSet: async () => {},
    },
  });

  try {
    const hydratedStates: AllViewStates = {
      timeline: {
        scrollLeft: 320,
        collapsedSwimlanes: ['project-1'],
        mode: 'people',
        selectedSwimlaneId: 'person-1',
      },
      kanban: {
        scrollLeft: 48,
        scrollTop: 96,
      },
      roadmap: {
        scrollLeft: 12,
        scrollTop: 18,
      },
    };

    const harness = await renderHook(
      ({ initialStates }: { initialStates: AllViewStates }) => useViewState('timeline', initialStates),
      { initialStates: hydratedStates }
    );

    const firstRender = harness.result();
    assert.equal(firstRender.currentView, 'timeline');
    assert.equal(firstRender.getViewState('timeline').scrollLeft, 320);
    assert.equal(firstRender.getViewState('timeline').mode, 'people');
    assert.deepEqual(firstRender.getViewState('timeline').collapsedSwimlanes, ['project-1']);

    await act(async () => {
      firstRender.switchView('kanban');
    });
    await act(async () => {
      harness.result().saveViewState('kanban', { scrollLeft: 144, scrollTop: 222 });
    });
    await act(async () => {
      harness.result().switchView('timeline');
    });

    const afterSwitchBack = harness.result();
    assert.equal(afterSwitchBack.currentView, 'timeline');
    assert.equal(afterSwitchBack.getViewState('timeline').scrollLeft, 320);
    assert.equal(afterSwitchBack.getViewState('timeline').mode, 'people');
    assert.deepEqual(afterSwitchBack.getViewState('timeline').collapsedSwimlanes, ['project-1']);
    assert.equal(afterSwitchBack.getViewState('kanban').scrollLeft, 144);
    assert.equal(afterSwitchBack.getViewState('kanban').scrollTop, 222);

    await harness.unmount();
  } finally {
    restoreWindow();
  }
});

test('useStatusColumnActions reorders columns and reassigns tasks when deleting a populated column', async () => {
  let statusColumns = [
    { id: 'open', title: 'Open Tasks', color: '#999999' },
    { id: 'review', title: 'In Review', color: '#2563eb' },
    { id: 'done', title: 'Done', color: '#22c55e' },
  ];
  let tasks: Task[] = [
    { id: 'task-1', title: 'Ship store', status: 'review' as Task['status'] } as Task,
  ];

  const setStatusColumns = (updater: React.SetStateAction<typeof statusColumns>) => {
    statusColumns = typeof updater === 'function'
      ? (updater as (prev: typeof statusColumns) => typeof statusColumns)(statusColumns)
      : updater;
  };
  const setTasks = (updater: React.SetStateAction<Task[]>) => {
    tasks = typeof updater === 'function'
      ? (updater as (prev: Task[]) => Task[])(tasks)
      : updater;
  };

  const harness = await renderHook(
    () => useStatusColumnActions({ statusColumns, tasks, setStatusColumns, setTasks }),
    {}
  );

  harness.result().reorderStatusColumns(2, 0);
  assert.deepEqual(statusColumns.map(column => column.id), ['done', 'open', 'review']);

  await harness.rerender({});
  harness.result().deleteStatusColumn('review');
  assert.deepEqual(statusColumns.map(column => column.id), ['done', 'open']);
  assert.equal(tasks[0].status, 'done');

  await harness.unmount();
});

test('usePeopleActions deletes assignees and clears their agent watch config', async () => {
  let people: Person[] = [
    { id: 'person-1', name: 'Casey', role: 'Engineer', kind: 'human' },
    { id: 'person-2', name: 'Edgar', role: 'Agent', kind: 'agentic', agentInstructions: 'Focus' },
  ];
  let tasks: Task[] = [
    { id: 'task-1', title: 'Store slice', status: 'open', assigneeId: 'person-2' } as Task,
  ];
  let removedWatcherFor: string | null = null;

  const setPeople = (updater: React.SetStateAction<Person[]>) => {
    people = typeof updater === 'function'
      ? (updater as (prev: Person[]) => Person[])(people)
      : updater;
  };
  const setTasks = (updater: React.SetStateAction<Task[]>) => {
    tasks = typeof updater === 'function'
      ? (updater as (prev: Task[]) => Task[])(tasks)
      : updater;
  };

  const harness = await renderHook(
    () => usePeopleActions({
      setPeople,
      setTasks,
      onDeleteAgentWatchConfig: (personId: string) => {
        removedWatcherFor = personId;
      },
    }),
    {}
  );

  harness.result().deletePerson('person-2');
  assert.deepEqual(people.map(person => person.id), ['person-1']);
  assert.equal(tasks[0].assigneeId, undefined);
  assert.equal(removedWatcherFor, 'person-2');

  await harness.unmount();
});

test('usePeopleActions persists delegation eligibility only for agentic profiles', async () => {
  let people: Person[] = [
    { id: 'agent-1', name: 'Ted', role: 'Agent', kind: 'agentic' },
  ];
  const setPeople = (updater: React.SetStateAction<Person[]>) => {
    people = typeof updater === 'function'
      ? (updater as (prev: Person[]) => Person[])(people)
      : updater;
  };
  const harness = await renderHook(
    () => usePeopleActions({
      setPeople,
      setTasks: () => undefined,
      onDeleteAgentWatchConfig: () => undefined,
    }),
    {}
  );

  harness.result().updatePerson('agent-1', {
    name: 'Ted',
    role: 'Agent',
    kind: 'agentic',
    agentInstructions: undefined,
    agentOperationalInstructions: undefined,
    availableForSubagentDelegation: true,
  });
  assert.equal(people[0].availableForSubagentDelegation, true);

  harness.result().updatePerson('agent-1', {
    name: 'Ted',
    role: 'Engineer',
    kind: 'human',
    agentInstructions: undefined,
    agentOperationalInstructions: undefined,
    availableForSubagentDelegation: true,
  });
  assert.equal(people[0].availableForSubagentDelegation, false);

  await harness.unmount();
});

test('useMcpPanelState tracks listener status, audit logs, and restart flow', async () => {
  let storeChangedListener: (() => void) | null = null;
  let auditLogCalls = 0;
  const originalWindow = setWindowMock({
    electron: {
      onStoreChanged: (listener: () => void) => {
        storeChangedListener = listener;
        return () => {
          storeChangedListener = null;
        };
      },
      mcp: {
        getListenerStatus: async () => ({ ok: true, data: { boundHost: '127.0.0.1', boundPort: 3456 } }),
        getAuditLog: async () => {
          auditLogCalls += 1;
          return {
            ok: true,
            data: [{ auditId: `audit-${auditLogCalls}`, timestamp: '2026-03-27T10:00:00.000Z', type: 'test' }],
          };
        },
        restartServer: async () => ({
          success: true,
          listenerStatus: { boundHost: '127.0.0.1', boundPort: 3456 },
        }),
      },
    },
    alert: () => {},
    setInterval: global.setInterval.bind(global),
    clearInterval: global.clearInterval.bind(global),
  });

  try {
    let preferences: McpPreferencesShape = {
      mcpAgentAccessEnabled: true,
      mcpCapabilityProfile: 'task_write',
      mcpBindHost: '127.0.0.1',
      mcpPort: 3456,
      mcpServerAddress: 'http://127.0.0.1:3456/mcp',
      mcpAccessToken: '',
      mcpAccessTokenTtlMinutes: 60,
    };
    const setPreferences = (updater: React.SetStateAction<McpPreferencesShape>) => {
      preferences = typeof updater === 'function'
        ? (updater as (prev: McpPreferencesShape) => McpPreferencesShape)(preferences)
        : updater;
    };
    let healthCheckRuns = 0;
    const runHealthCheck = async () => {
      healthCheckRuns += 1;
    };

    const harness = await renderHook(
      ({ nextPreferences }: { nextPreferences: McpPreferencesShape }) =>
        useMcpPanelState({
          preferences: nextPreferences,
          setPreferences,
          runHealthCheck,
        }),
      { nextPreferences: preferences }
    );

    const initial = harness.result();
    assert.equal(initial.isMcpRestartPending, false);

    await initial.refreshMcpListenerStatus();
    await initial.refreshMcpAuditLog();
    await harness.rerender({ nextPreferences: preferences });

    const refreshed = harness.result();
    assert.deepEqual(refreshed.mcpListenerStatus, { boundHost: '127.0.0.1', boundPort: 3456 });
    assert.equal(refreshed.mcpAuditLog.length, 1);
    assert.equal(refreshed.mcpAuditLog[0].auditId, 'audit-1');

    await act(async () => {
      storeChangedListener?.();
      await Promise.resolve();
    });
    await harness.rerender({ nextPreferences: preferences });
    assert.equal(harness.result().mcpAuditLog[0].auditId, 'audit-2');

    refreshed.handleRotateMcpAccessToken();
    await harness.rerender({ nextPreferences: preferences });
    assert.equal(preferences.mcpAccessToken.length > 0, true);
    assert.equal(harness.result().isMcpRestartPending, true);

    await harness.result().handleRestartMcpServer();
    await harness.rerender({ nextPreferences: preferences });

    const restarted = harness.result();
    assert.equal(healthCheckRuns, 1);
    assert.equal(restarted.isMcpRestartPending, false);

    await harness.unmount();
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('useMcpPanelState refreshes listener status while MCP is starting', async () => {
  const originalWindow = setWindowMock({
    electron: {
      mcp: {
        getListenerStatus: async () => ({
          ok: true,
          data: {
            enabled: true,
            status: 'running',
            listening: true,
            boundUrl: 'http://127.0.0.1:3456/mcp',
          },
        }),
        getAuditLog: async () => ({
          ok: true,
          data: [],
        }),
        restartServer: async () => ({
          success: true,
          listenerStatus: {
            enabled: true,
            status: 'starting',
            listening: false,
          },
        }),
      },
    },
    alert: () => {},
    setInterval: global.setInterval.bind(global),
    clearInterval: global.clearInterval.bind(global),
  });

  try {
    const preferences: McpPreferencesShape = {
      mcpAgentAccessEnabled: true,
      mcpCapabilityProfile: 'task_write',
      mcpBindHost: '127.0.0.1',
      mcpPort: 3456,
      mcpServerAddress: 'http://127.0.0.1:3456/mcp',
      mcpAccessToken: '',
      mcpAccessTokenTtlMinutes: 60,
    };
    const setPreferences: React.Dispatch<React.SetStateAction<McpPreferencesShape>> = () => {};
    const runHealthCheck = async () => {};

    const harness = await renderHook(
      ({ nextPreferences }: { nextPreferences: McpPreferencesShape }) =>
        useMcpPanelState({
          preferences: nextPreferences,
          setPreferences,
          runHealthCheck,
        }),
      { nextPreferences: preferences }
    );

    await harness.result().handleRestartMcpServer();
    await harness.rerender({ nextPreferences: preferences });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 850));
    });
    await harness.rerender({ nextPreferences: preferences });

    assert.equal(harness.result().mcpListenerStatus?.status, 'running');
    assert.equal(harness.result().mcpListenerStatus?.listening, true);

    await harness.unmount();
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('useMcpPanelState keeps restart errors visible in an actionable toast', async t => {
  const restoreWindow = setWindowMock({
    electron: {
      mcp: {
        restartServer: async () => ({ success: false, error: 'Port 3456 is already in use.' }),
      },
    },
  });
  const errorToast = t.mock.method(toast, 'error');

  try {
    const preferences: McpPreferencesShape = {
      mcpAgentAccessEnabled: true,
      mcpCapabilityProfile: 'task_write',
      mcpBindHost: '127.0.0.1',
      mcpPort: 3456,
      mcpServerAddress: 'http://127.0.0.1:3456/mcp',
      mcpAccessToken: '',
      mcpAccessTokenTtlMinutes: 60,
    };
    const harness = await renderHook(
      () => useMcpPanelState({ preferences, setPreferences: () => {}, runHealthCheck: () => {} }),
      undefined
    );

    await harness.result().handleRestartMcpServer();

    assert.deepEqual(errorToast.mock.calls[0].arguments, [
      'Could not restart MCP server',
      { description: 'Port 3456 is already in use.', duration: 10_000, closeButton: true },
    ]);
    await harness.unmount();
  } finally {
    restoreWindow();
  }
});

test('useMcpPanelState adopts a running startup listener after preferences hydrate', async () => {
  const hydratedPreferences: McpPreferencesShape = {
    mcpAgentAccessEnabled: true,
    mcpCapabilityProfile: 'task_write',
    mcpBindHost: '127.0.0.1',
    mcpPort: 3456,
    mcpServerAddress: 'http://127.0.0.1:3456/mcp',
    mcpAccessToken: '',
    mcpAccessTokenTtlMinutes: 60,
  };
  const originalWindow = setWindowMock({
    electron: {
      mcp: {
        getListenerStatus: async () => ({
          ok: true,
          data: {
            enabled: true,
            status: 'running',
            listening: true,
            host: '127.0.0.1',
            port: 3456,
            path: '/mcp',
            expectedAddress: 'http://127.0.0.1:3456/mcp',
            boundAddress: '127.0.0.1:3456',
            boundUrl: 'http://127.0.0.1:3456/mcp',
            capabilityProfile: 'task_write',
            authMode: 'none',
            token: {
              configured: false,
              status: 'none',
              expired: false,
              issuedAt: null,
              expiresAt: null,
              remainingMinutes: null,
              ttlMinutes: 60,
            },
            error: null,
            lastStartedAt: '2026-06-20T09:00:00.000Z',
            lastStoppedAt: null,
            lastUpdatedAt: '2026-06-20T09:00:00.000Z',
            restartRequired: false,
          },
        }),
        getAuditLog: async () => ({
          ok: true,
          data: [],
        }),
      },
    },
    alert: () => {},
    setInterval: global.setInterval.bind(global),
    clearInterval: global.clearInterval.bind(global),
  });

  try {
    const initialPreferences: McpPreferencesShape = {
      mcpAgentAccessEnabled: false,
      mcpCapabilityProfile: 'read_only',
      mcpBindHost: '127.0.0.1',
      mcpPort: 3456,
      mcpServerAddress: 'http://127.0.0.1:3456/mcp',
      mcpAccessToken: '',
      mcpAccessTokenTtlMinutes: 60,
    };
    const setPreferences: React.Dispatch<React.SetStateAction<McpPreferencesShape>> = () => {};
    const runHealthCheck = async () => {};

    const harness = await renderHook(
      ({ nextPreferences }: { nextPreferences: McpPreferencesShape }) =>
        useMcpPanelState({
          preferences: nextPreferences,
          setPreferences,
          runHealthCheck,
        }),
      { nextPreferences: initialPreferences }
    );

    await harness.rerender({ nextPreferences: hydratedPreferences });
    await act(async () => {
      await Promise.resolve();
    });
    await harness.rerender({ nextPreferences: hydratedPreferences });

    assert.equal(harness.result().mcpListenerStatus?.status, 'running');
    assert.equal(harness.result().isMcpRestartPending, false);

    await harness.unmount();
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('useAgentWatchRuntime polls, persists runtime state, and manages watcher configs', async () => {
  const originalWindow = setWindowMock({
    setInterval: global.setInterval.bind(global),
    clearInterval: global.clearInterval.bind(global),
  });

  try {
    const calls: Array<Record<string, unknown>> = [];
    const mcpReadService = {
      pollBoardWatcher: async (filters: Record<string, unknown>) => {
        calls.push(filters);
        return {
          ok: true,
          watcherState: {
            watcherId: String(filters.watcherId || 'agent:agent-1'),
            statusId: String(filters.statusId),
            lastProcessedAt: '2026-03-27T12:00:00.000Z',
            lastSeenTaskIds: ['task-1'],
            lastSeenRevisions: { 'task-1': 1 },
          },
          board: {
            id: String(filters.statusId),
            taskCount: 1,
            currentTaskIds: ['task-1'],
          },
          changes: {
            newTasks: [{ id: 'task-1', title: 'Watcher task' }],
            updatedTasks: [],
            removedTaskIds: [],
          },
        };
      },
    };

    let configs: AgentWatchConfig[] = [{
      personId: 'agent-1',
      enabled: true,
      statusId: 'in-progress',
      action: 'inspect_and_work',
      intervalSeconds: 20,
      projectId: 'lane-1',
      search: 'watch',
    }];
    const setConfigs = (updater: React.SetStateAction<AgentWatchConfig[]>) => {
      configs = typeof updater === 'function'
        ? (updater as (prev: AgentWatchConfig[]) => AgentWatchConfig[])(configs)
        : updater;
    };

    assert.equal(getAgentWatchPollingInterval([]), 0);
    assert.equal(getAgentWatchPollingInterval([{ ...configs[0], intervalSeconds: 5 }]), 15000);
    assert.equal(getAgentWatchPollingInterval(configs), 20000);

    const harness = await renderHook(
      ({ nextEnabled, nextConfigs }: { nextEnabled: boolean; nextConfigs: AgentWatchConfig[] }) =>
        useAgentWatchRuntime({
          mcpReadService: mcpReadService as any,
          enabled: nextEnabled,
          agentWatchConfigs: nextConfigs,
          setAgentWatchConfigs: setConfigs,
        }),
      { nextEnabled: false, nextConfigs: configs }
    );

    const manual = await harness.result().pollAgentWatcher(configs[0]);
    assert.equal(manual?.ok, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      watcherId: 'agent:agent-1',
      statusId: 'in-progress',
      assigneeId: 'agent-1',
      projectId: 'lane-1',
      search: 'watch',
      persist: true,
    });

    await harness.rerender({ nextEnabled: false, nextConfigs: configs });
    let runtime = harness.result().agentWatchRuntime['agent-1'];
    assert.equal(runtime.newTaskCount, 1);
    assert.equal(runtime.updatedTaskCount, 0);
    assert.equal(runtime.removedTaskCount, 0);
    assert.deepEqual(runtime.latestTaskTitles, ['Watcher task']);

    harness.result().upsertAgentWatchConfig({
      personId: 'agent-2',
      enabled: true,
      statusId: 'under-review',
      action: 'inspect_and_work',
      intervalSeconds: 45,
      search: 'docs',
    });
    assert.equal(configs.some(config => config.personId === 'agent-2'), true);

    harness.result().removeAgentWatchConfig('agent-1');
    assert.equal(configs.some(config => config.personId === 'agent-1'), false);

    await harness.unmount();

    const effectHarness = await renderHook(
      ({ nextEnabled, nextConfigs }: { nextEnabled: boolean; nextConfigs: AgentWatchConfig[] }) =>
        useAgentWatchRuntime({
          mcpReadService: mcpReadService as any,
          enabled: nextEnabled,
          agentWatchConfigs: nextConfigs,
          setAgentWatchConfigs: setConfigs,
        }),
      {
        nextEnabled: true,
        nextConfigs: [{
          personId: 'agent-1',
          enabled: true,
          statusId: 'in-progress',
          action: 'inspect_and_work',
          intervalSeconds: 20,
        }],
      }
    );

    assert.equal(calls.length >= 2, true);
    await effectHarness.rerender({
      nextEnabled: true,
      nextConfigs: [{
        personId: 'agent-1',
        enabled: true,
        statusId: 'in-progress',
        action: 'inspect_and_work',
        intervalSeconds: 20,
      }],
    });
    runtime = effectHarness.result().agentWatchRuntime['agent-1'];
    assert.equal(runtime.newTaskCount, 1);
    await effectHarness.unmount();
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('useAgentWatchRuntime applies column-owned AI actions to assigned changed tasks', async () => {
  const originalWindow = setWindowMock({
    setInterval: global.setInterval.bind(global),
    clearInterval: global.clearInterval.bind(global),
  });

  try {
    let tasks: Task[] = [
      { id: 'task-work', title: 'Work task', status: 'open', assigneeId: 'agent-1' },
      { id: 'task-review', title: 'Review task', status: 'in-progress', assigneeId: 'agent-1' },
      { id: 'task-inspect', title: 'Inspect task', status: 'done', assigneeId: 'agent-1' },
      { id: 'task-other', title: 'Other task', status: 'open', assigneeId: 'human-1' },
    ];
    const setTasks = (updater: React.SetStateAction<Task[]>) => {
      tasks = typeof updater === 'function'
        ? (updater as (previous: Task[]) => Task[])(tasks)
        : updater;
    };
    const mcpReadService = {
      pollBoardWatcher: async (filters: Record<string, unknown>) => ({
        ok: true,
        watcherState: { watcherId: String(filters.watcherId), statusId: String(filters.statusId) },
        changes: {
          newTasks: [{
            id: String(filters.statusId === 'open' ? 'task-work' : filters.statusId === 'under-review' ? 'task-review' : 'task-inspect'),
            assigneeId: 'agent-1',
          }],
          updatedTasks: [],
          removedTaskIds: [],
        },
      }),
    };
    const statusColumns = [
      { id: 'open', title: 'Backlog', roadmapStage: 'not-started' as const, aiWatchEnabled: true, aiAction: 'inspect_and_work' as const },
      { id: 'in-progress', title: 'Doing', roadmapStage: 'in-progress' as const },
      { id: 'under-review', title: 'Review', roadmapStage: 'in-review' as const, aiWatchEnabled: true, aiAction: 'move_to_ready_for_human_review' as const },
      { id: 'done', title: 'Done', roadmapStage: 'complete' as const, aiWatchEnabled: true, aiAction: 'inspect_only' as const },
    ];
    const config: AgentWatchConfig = { personId: 'agent-1', enabled: true, intervalSeconds: 60 };
    const setConfigs = (() => undefined) as React.Dispatch<React.SetStateAction<AgentWatchConfig[]>>;
    const harness = await renderHook(
      () => useAgentWatchRuntime({
        mcpReadService: mcpReadService as any,
        enabled: false,
        agentWatchConfigs: [config],
        setAgentWatchConfigs: setConfigs,
        statusColumns,
        setTasks,
      }),
      undefined as never
    );

    await harness.result().pollAgentWatcher(config);
    assert.equal(tasks.find(task => task.id === 'task-work')?.status, 'in-progress');
    assert.equal(tasks.find(task => task.id === 'task-review')?.status, 'under-review');
    assert.equal(tasks.find(task => task.id === 'task-inspect')?.status, 'done');
    assert.equal(tasks.find(task => task.id === 'task-other')?.status, 'open');
    assert.equal(harness.result().agentWatchRuntime['agent-1'].actionedTaskCount, 2);
    await harness.unmount();
  } finally {
    originalWindow();
  }
});
