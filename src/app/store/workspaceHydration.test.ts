import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasCanonicalWorkspaceData,
  readInitialWorkspaceState,
} from './workspaceHydration.ts';
import {
  STATUS_COLUMNS_KEY,
  SWIMLANES_KEY,
  TASKS_KEY,
} from './workspacePersistence.ts';

function makeLocalStorage(entries: Record<string, string>) {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

test('canonical workspace detection supports nested electron-store exports', () => {
  assert.equal(hasCanonicalWorkspaceData({ omvra: { tasks: { v1: [] } } }), true);
  assert.equal(hasCanonicalWorkspaceData({ unrelated: true }), false);
});

test('restart hydration restores portable local workspace data in dependency order', () => {
  const originalWindow = globalThis.window;
  const project = { id: 'project-1', name: 'Project One', color: '#0ea5e9' };
  const task = { id: 'task-1', title: 'Persisted task', status: 'open', swimlaneId: project.id };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: makeLocalStorage({
        [SWIMLANES_KEY]: JSON.stringify([project]),
        [STATUS_COLUMNS_KEY]: JSON.stringify([{ id: 'open', title: 'Open', color: '#64748b' }]),
        [TASKS_KEY]: JSON.stringify([task]),
      }),
    },
  });

  try {
    const state = readInitialWorkspaceState({
      tasks: [],
      timelineSwimlanes: [],
      people: [],
      milestones: [],
    });
    assert.equal(state.hasHydratedCanonicalWorkspace, true);
    assert.equal(state.timelineSwimlanes[0]?.id, project.id);
    assert.equal(state.tasks[0]?.title, task.title);
    assert.equal(state.tasks[0]?.swimlaneId, project.id);
  } finally {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  }
});
