import test from 'node:test';
import assert from 'node:assert/strict';
import { areSerializedValuesEqual, normalizeLoadStatusIds } from './workspaceSelectors.ts';

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
