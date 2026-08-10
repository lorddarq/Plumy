import test from 'node:test';
import assert from 'node:assert/strict';
import { areSerializedValuesEqual, areShallowValuesEqual, normalizeLoadStatusIds } from './workspaceSelectors.ts';
import { createWorkspaceSubscriptionStore } from './workspaceSubscriptionStore.ts';

test('workspace selectors normalize known status ids without duplicates', () => {
  assert.deepEqual(
    normalizeLoadStatusIds(['open', 'missing', 'open'], ['done'], [{ id: 'open' }, { id: 'done' }]),
    ['open']
  );
  assert.deepEqual(normalizeLoadStatusIds(undefined, ['done'], [{ id: 'done' }]), ['done']);
});

test('serialized equality remains safe for cyclic values', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(areSerializedValuesEqual({ value: 1 }, { value: 1 }), true);
  assert.equal(areSerializedValuesEqual(cyclic, cyclic), false);
});

test('shallow equality preserves selector projections with unchanged references', () => {
  const tasks: unknown[] = [];
  assert.equal(areShallowValuesEqual({ tasks, count: 0 }, { tasks, count: 0 }), true);
  assert.equal(areShallowValuesEqual({ tasks }, { tasks: [] }), false);
});

test('workspace subscription store publishes each completed snapshot once', () => {
  const initial = { tasks: [] } as any;
  const next = { tasks: [{ id: 'task-1' }] } as any;
  const store = createWorkspaceSubscriptionStore(initial);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications += 1; });

  store.publish(initial);
  store.publish(next);
  store.publish(next);

  assert.equal(notifications, 1);
  assert.equal(store.getSnapshot(), next);
  unsubscribe();
});
