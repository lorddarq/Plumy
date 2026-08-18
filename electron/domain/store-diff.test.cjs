const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { isDeepStrictEqual } = require('node:util');
const { getAtPath, diffStoreSnapshots, leafPathsOf } = require('./store-diff.cjs');

test('getAtPath resolves a dotted path through nested objects', () => {
  const root = { omvra: { tasks: { v1: ['a', 'b'] } } };
  assert.deepEqual(getAtPath(root, 'omvra.tasks.v1'), ['a', 'b']);
});

test('getAtPath returns undefined for a missing path without throwing', () => {
  assert.equal(getAtPath({ omvra: {} }, 'omvra.tasks.v1'), undefined);
  assert.equal(getAtPath(undefined, 'omvra.tasks.v1'), undefined);
  assert.equal(getAtPath({ omvra: { tasks: null } }, 'omvra.tasks.v1'), undefined);
});

test('diffStoreSnapshots finds nothing when two nested snapshots are equal', () => {
  const snapshot = { omvra: { tasks: { v1: [{ id: 'task-1' }] } } };
  const changed = diffStoreSnapshots(snapshot, JSON.parse(JSON.stringify(snapshot)), isDeepStrictEqual);
  assert.deepEqual([...changed], []);
});

test('diffStoreSnapshots reports the exact dotted key and every ancestor when a leaf array changes', () => {
  const previous = { omvra: { tasks: { v1: [{ id: 'task-1', title: 'Original' }] }, preferences: { v1: { mcpPort: 4173 } } } };
  const next = { omvra: { tasks: { v1: [{ id: 'task-1', title: 'Updated' }] }, preferences: { v1: { mcpPort: 4173 } } } };
  const changed = diffStoreSnapshots(previous, next, isDeepStrictEqual);
  assert.ok(changed.has('omvra.tasks.v1'), 'the exact canonical key must be present');
  assert.ok(changed.has('omvra.tasks'), 'ancestors must be present too');
  assert.ok(changed.has('omvra'));
  assert.ok(!changed.has('omvra.preferences.v1'), 'an unrelated sibling must not be reported');
  assert.ok(!changed.has('omvra.preferences'));
});

test('diffStoreSnapshots reports a field change inside a plain-object value as its own path plus every ancestor', () => {
  const previous = { omvra: { preferences: { v1: { mcpPort: 4173, mcpAgentAccessEnabled: false } } } };
  const next = { omvra: { preferences: { v1: { mcpPort: 4174, mcpAgentAccessEnabled: false } } } };
  const changed = diffStoreSnapshots(previous, next, isDeepStrictEqual);
  assert.ok(changed.has('omvra.preferences.v1'), 'the canonical preferences key must be reported, not just the deep field');
  assert.ok(changed.has('omvra.preferences.v1.mcpPort'));
  assert.ok(!changed.has('omvra.preferences.v1.mcpAgentAccessEnabled'), 'an unchanged sibling field must not be reported');
});

test('diffStoreSnapshots handles a key that is entirely new or entirely removed', () => {
  const added = diffStoreSnapshots({ omvra: {} }, { omvra: { tasks: { v1: [] } } }, isDeepStrictEqual);
  assert.ok(added.has('omvra.tasks.v1'));
  const removed = diffStoreSnapshots({ omvra: { tasks: { v1: [] } } }, { omvra: {} }, isDeepStrictEqual);
  assert.ok(removed.has('omvra.tasks.v1'));
});

test('leafPathsOf keeps only the most specific path in each branch', () => {
  assert.deepEqual(
    leafPathsOf(['omvra', 'omvra.tasks', 'omvra.tasks.v1']).sort(),
    ['omvra.tasks.v1'],
  );
});

test('leafPathsOf keeps unrelated siblings and does not conflate separate branches', () => {
  assert.deepEqual(
    leafPathsOf(['omvra', 'omvra.tasks.v1', 'omvra.people.v1']).sort(),
    ['omvra.people.v1', 'omvra.tasks.v1'],
  );
});

// The bug this module fixes only shows up against the real electron-store
// package's nesting behavior -- a flat-keyed test double (as used elsewhere
// in this repo's MCP fixtures) never reproduces it, which is exactly how it
// went unnoticed. This test exercises the actual dependency, not a stand-in.
test('reproduces and fixes the production bug: real electron-store nests dotted keys, and diffStoreSnapshots recovers the dotted key from the nested onDidAnyChange snapshot', async () => {
  const Store = require('electron-store');
  const store = new Store({ name: `store-diff-test-${Date.now()}-${Math.random().toString(36).slice(2)}`, cwd: os.tmpdir() });
  try {
    store.set('omvra.tasks.v1', [{ id: 'task-1', title: 'Original title' }]);

    const observed = await new Promise((resolve) => {
      const unsubscribe = store.onDidAnyChange((nextStore, previousStore) => {
        unsubscribe();
        resolve({ nextStore, previousStore });
      });
      store.set('omvra.tasks.v1', [{ id: 'task-1', title: 'Updated by agent' }]);
    });

    // The bug: naive top-level key inspection only ever sees the namespace.
    assert.deepEqual(Object.keys(observed.nextStore), ['omvra'], 'sanity check: electron-store really does nest dotted keys under one top-level key');

    // The fix: diffStoreSnapshots recovers the real dotted key.
    const changedKeys = diffStoreSnapshots(observed.previousStore, observed.nextStore, isDeepStrictEqual);
    assert.ok(changedKeys.has('omvra.tasks.v1'), 'diffStoreSnapshots must recover the dotted key a naive top-level diff cannot see');

    // And getAtPath resolves the before/after values a flat bracket lookup
    // (previousStore['omvra.tasks.v1']) would silently return undefined for.
    assert.deepEqual(getAtPath(observed.nextStore, 'omvra.tasks.v1'), [{ id: 'task-1', title: 'Updated by agent' }]);
    assert.deepEqual(getAtPath(observed.previousStore, 'omvra.tasks.v1'), [{ id: 'task-1', title: 'Original title' }]);
  } finally {
    store.clear();
  }
});
