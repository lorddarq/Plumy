// electron-store nests dotted keys by default (store.set('omvra.tasks.v1', x)
// is stored as store.store.omvra.tasks.v1, via the underlying `conf`
// package's dot-notation support). A flat store.store['omvra.tasks.v1']
// lookup, or a top-level Object.keys(store.store) diff, only ever sees the
// single namespace key 'omvra' -- never the dotted keys the rest of the app
// (renderer hydration, checkpoint capture, preferences sync) checks for.
// These helpers walk the real nested shape and reconstruct the dotted paths
// every other consumer expects.

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getAtPath(root, dottedKey) {
  return String(dottedKey).split('.').reduce((node, segment) => (
    node && typeof node === 'object' ? node[segment] : undefined
  ), root);
}

// Recursively diffs two nested store snapshots and returns every dotted path
// (at every level, not just leaves) whose subtree differs, via `isEqual`
// (injectable so callers can supply node:util's isDeepStrictEqual without
// this module taking a hard dependency on it). A change to a field inside
// e.g. `omvra.preferences.v1` still reports 'omvra.preferences.v1' -- an
// ancestor of the exact field that changed -- as changed, which is the
// granularity a `changedKeys.has('omvra.preferences.v1')`-style check needs.
function diffStoreSnapshots(previousNode, nextNode, isEqual, pathPrefix = '', changedKeys = new Set()) {
  if (isEqual(previousNode, nextNode)) return changedKeys;
  if (pathPrefix) changedKeys.add(pathPrefix);
  // Recurse whenever EITHER side is a plain object, not only when both are.
  // electron-store creates a whole dotted path atomically on the first
  // .set() call, so a brand-new key nested several levels deep can appear
  // with no corresponding branch on the previous side at all (previousNode
  // is undefined, not {}) -- requiring both sides to be objects would stop
  // the walk right there and never discover the real leaf path.
  const previousIsObject = isPlainObject(previousNode);
  const nextIsObject = isPlainObject(nextNode);
  if (!previousIsObject && !nextIsObject) return changedKeys;
  const previousObject = previousIsObject ? previousNode : {};
  const nextObject = nextIsObject ? nextNode : {};
  const keys = new Set([...Object.keys(previousObject), ...Object.keys(nextObject)]);
  for (const key of keys) {
    diffStoreSnapshots(previousObject[key], nextObject[key], isEqual, pathPrefix ? `${pathPrefix}.${key}` : key, changedKeys);
  }
  return changedKeys;
}

// diffStoreSnapshots deliberately includes every ancestor of a changed path.
// Some callers (e.g. deciding whether a change is confined to a known set of
// keys) instead want just the most specific changed paths, so coarser
// ancestor entries (whose set also contains a more specific descendant, e.g.
// 'omvra' when 'omvra.tasks.v1' is also present) are filtered out here.
function leafPathsOf(paths) {
  const all = [...paths];
  return all.filter(path => !all.some(other => other !== path && other.startsWith(`${path}.`)));
}

module.exports = { isPlainObject, getAtPath, diffStoreSnapshots, leafPathsOf };
