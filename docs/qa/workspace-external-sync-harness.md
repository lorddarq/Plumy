# Workspace external-sync harness

`src/app/store/workspaceExternalSync.test.ts` is an integration-style renderer test for task changes made outside the renderer. Its reusable host lives in `src/app/store/workspaceExternalSyncTestHost.ts`. The main deterministic scenarios reproduce the race between an agent's MCP task write and a human edit that the renderer is still persisting; a later live Codex test can mount the same production renderer hooks without copying the bridge and teardown machinery.

The harness uses the same MCP task dispatcher and task-domain write logic as production. It does not start an ACP runtime session. In production, an ACP-supervised agent can reach these MCP tools through its scoped MCP grant; this test begins at the MCP tool-call boundary and focuses on what happens after that write reaches the workspace store.

## Run it

From the repository root:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/app/store/workspaceExternalSync.test.ts
```

It is also included in:

```bash
npm run test:workspace-contracts
```

Last focused verification on 2026-08-19: 4 tests passed, 0 failed.

**2026-08-18 revision**: an earlier version of this harness used a flat-keyed `MemoryStore` test double and manually emitted `{keys: ['omvra.tasks.v1']}` on every MCP mutation. That could not reproduce (and briefly masked) a real production bug: `electron-store` nests dotted keys by default (`store.set('omvra.tasks.v1', x)` is stored as `store.store.omvra.tasks.v1`), so `electron/main.cjs`'s `store.onDidAnyChange` handler, which used to diff `Object.keys(nextStore)` directly, only ever saw the single top-level key `'omvra'` — never `'omvra.tasks.v1'` — for any externally-originated write (every MCP write; anything not hinted by the renderer's own IPC calls). The renderer's exact-match key filter silently discarded that notification. Restart-triggered hydration was unaffected (it does a full fetch, not a keyed one), which is why a live MCP write appeared invisible until the app was restarted. Fixed in `electron/domain/store-diff.cjs` (`diffStoreSnapshots`, `getAtPath`, `leafPathsOf`; see its test file for the real-`electron-store`-backed regression coverage) and wired into `electron/main.cjs`. `electron/services/workspace-service.cjs`'s `getWorkspaceSnapshot` had a related bug (a flat-key lookup into the same nested `store.store` snapshot, producing an always-empty Diagnostics panel), fixed by reading through `store.get(key)` directly instead. This harness now uses a real `electron-store` instance (not `MemoryStore`) and derives every broadcast via `diffStoreSnapshots` — the exact function `main.cjs` uses — instead of assuming the correct key, closing the gap that let the original bug through undetected.

## Production code exercised

The harness intentionally uses production code on both sides of the synchronization boundary:

- `electron/services/mcp-handlers.cjs`: `handleToolCall` parses and dispatches `task_write`, `tasks_get`, and `tasks_update_description`.
- `electron/domain/task-service.cjs`: the task description update is checked against the task's current `__mcpRevision`.
- `electron/domain/store-diff.cjs`: `diffStoreSnapshots` derives the real changed dotted keys from a nested electron-store snapshot pair, the same function `electron/main.cjs`'s `store.onDidAnyChange` handler uses.
- `src/app/store/workspacePersistence.ts`: `useWorkspacePersistence` batches renderer changes and tracks writes in flight.
- `src/app/store/workspaceHydration.ts`: `useCanonicalWorkspaceHydration` reads changed canonical keys, applies external values, suppresses echo writes, and retries synchronization blocked by a local write.
- `electron/services/fixtures/workspace-basic.json`: supplies the initial task and a `task_write` MCP capability profile.

`react-test-renderer` mounts the real hooks in the host's small `Probe` component, so state transitions and effects run without mounting the full application.

## Test bridge

`createWorkspaceExternalSyncTestHost` gives the MCP handler and renderer hooks one shared, real `electron-store` instance (seeded from the fixture JSON, on a uniquely named temp-dir-backed store file) -- not a flat-keyed test double. It replaces only the Electron IPC transport itself:

```text
MCP handleToolCall
        |
        v
shared real electron-store <---- deferred storeSetMany ---- renderer persistence hook
        |
        v (diffStoreSnapshots, before/after)
derived store/did-change event ----> renderer hydration hook
```

The host implements:

- `storeGetMany(keys)` reads the requested canonical values from the shared store (dot-notation resolved, via `.get(key)`) and counts task reads so retry behavior can be asserted.
- `storeSetMany(values)` records the renderer write but does not apply it immediately. The test releases it explicitly, creating a deterministic concurrent-write window.
- `onStoreChanged(listener)` captures the hydration listener.
- `emitRealStoreChangeAround(mutate)` snapshots the store before and after `mutate()`, runs `diffStoreSnapshots` on the two nested snapshots, and fires the listener with exactly those derived keys -- not a key the test assumes is correct. `realAgentDescriptionWrite`/`realAgentTaskCreate` are both built on this.
- `runInAct` and `flushMicrotasks` keep React updates deterministic for either test layer.
- `releaseStoreSetManyForKey(key)` preserves key-specific control when renderer writes are in flight. `releaseAllStoreSetMany()` is used explicitly when a scenario needs to drain initial-hydration priming writes.
- `cleanup()` unmounts the probe, releases unresolved renderer writes, clears tracked hook timers, restores the previous global `window`, clears the store, and removes its temporary file.

The optional `initialTask` host input changes only fixture state. It can assign a unique task ID, initial description, and starting `__mcpRevision` before hydration. Expected mutations are never written through that input: deterministic tests still use the production MCP dispatcher, while a later live test can use its real transport/provider path.

```ts
const host = await createWorkspaceExternalSyncTestHost({
  initialTask: {
    id: 'unique-task-id',
    description: 'Initial fixture description',
    revision: 7,
  },
});

try {
  // Drive the deterministic MCP dispatcher or a live external writer here.
} finally {
  await host.cleanup();
}
```

The deferred `storeSetMany` is important: using real timing would make the human-write/agent-write ordering nondeterministic and the race test flaky.

## How the agent write is modeled

`realAgentTaskCreate` performs a real `task_write` call with a project, Timeline lane, status, and one-day schedule. `realAgentDescriptionWrite` performs two real MCP tool calls:

1. `tasks_get` reads the task and its current `__mcpRevision`.
2. `tasks_update_description` submits that revision with the new description.

This verifies the production tool alias normalization, capability gate, dispatcher, and revision-checked task update. It is more representative than directly replacing the task JSON in the fixture store.

## Scenarios

### External task creation

The first test creates a new one-day task through `task_write`, then emits the same task-key change notification used by Electron. It verifies that the task is absent before synchronization, appears in renderer state afterward with its Timeline lane intact, and does not cause the renderer to echo the full task array back to storage.

### Idle renderer

The second test hydrates `task-1`, applies an MCP description update, and signals that the task key changed. It verifies that:

- the renderer receives the MCP-written description;
- applying the external value does not leave the local-write guard raised; and
- the externally hydrated value is not intentionally persisted back to the same store.

The last behavior is implemented through `suppressNextPersistRef`: hydration marks the changed key immediately before updating React state, and the matching persistence effect consumes that marker once.

The regression checks are the unchanged `storeSetMany` call count across synchronization and the zero task write-guard count afterward.

### MCP write during a local write

The third test explicitly calls `releaseAllStoreSetMany()` to drain unrelated writes produced by initial hydration. It then:

1. changes the task description in renderer state;
2. holds the renderer's `storeSetMany` write open;
3. applies a revision-checked MCP description update to the shared store;
4. emits the task change event while the renderer write guard is raised;
5. verifies that hydration does not overwrite the in-flight human edit;
6. releases the renderer write; and
7. waits for the bounded external-sync retry to read the task key again.

This proves that a store event blocked by a local write is retried instead of being silently discarded.

It also reproduces a remaining data-integrity gap: renderer persistence writes the entire task collection without an expected revision. When that delayed write is released, it overwrites the MCP update already present in the shared store. The later hydration retry correctly reads the store again, but it cannot recover the agent value after it has been overwritten.

## What this harness does not cover

This is not an end-to-end ACP test. It does not exercise:

- runtime profile resolution or ACP process launch;
- ACP `initialize`, session, prompt, cancellation, permission, or usage events;
- the MCP HTTP/JSON-RPC transport;
- bearer-token validation or runtime-scoped MCP grants;
- the real Electron IPC channel plumbing itself (`ipcMain.handle`/`ipcRenderer.invoke`, `webContents.send`) -- the store instance and the changed-key derivation (`diffStoreSnapshots`) are real, only the IPC hop is faked;
- multiple renderer windows; or
- conflict resolution for the renderer's revision-blind whole-collection writes.

Those boundaries have separate service and protocol tests. A true ACP-to-renderer test would need to launch a configured runtime, issue a prompt that causes an MCP task mutation, observe the HTTP tool call and automatic store broadcast, and then assert the renderer state. That would be slower and dependent on an installed provider, so it should complement this deterministic harness rather than replace it.

## Extending the harness

Use the extracted host and production handler instead of assigning expected fixture JSON directly.

- Add task shapes to an existing MCP fixture only when the fixture remains coherent for its other consumers; otherwise add a focused fixture.
- Use `initialTask` only to establish initial state when a test needs a unique task ID, description, or starting revision.
- Read the task with `tasks_get` before every write and pass its current revision.
- Release pending writes by canonical key with `releaseStoreSetManyForKey`; initial hydration can queue unrelated keys.
- Keep initial-hydration priming explicit with `releaseAllStoreSetMany`; setup never drains it implicitly.
- Wrap React updates, listener calls, and timer advancement with `runInAct`; always call `cleanup` in `finally`.
- Assert both renderer state and shared-store state. They can intentionally diverge while a write is in flight.
- For retry scenarios, assert an additional `storeGetMany` call rather than depending only on elapsed time.

Keep transport, authentication, and ACP lifecycle claims out of this file unless the harness is expanded to execute those layers.

## Production safety and bundle parity

This harness runs the current checkout, not necessarily the code installed in `/Applications/Omvra.app`. Before using a live Omvra workspace as an external-sync target, verify that the packaged renderer contains the tested synchronization behavior (both the `electron/main.cjs`/`store-diff.cjs` broadcast fix and the hydration echo-suppression/retry fix described above).

A renderer built **before** the `store-diff.cjs` fix will silently discard every live MCP-write notification (it only ever receives the top-level key `'omvra'`, which never matches its canonical-key filter), so a task an agent updates will not appear until the app is restarted -- restart-triggered hydration does a full fetch and is unaffected. A renderer built **before** the hydration echo-suppression/retry fix (but after the broadcast fix) can additionally observe the first MCP mutation, persist its newly hydrated whole-task snapshot back to storage, and overwrite later MCP mutations created in the same burst, or discard a store-change notification that arrives while its own task write is in flight. In either state, do not batch-create production tasks while the app is open. Upgrade/rebuild the app first, or close it before the batch and reopen it afterward so initial hydration reads the final canonical snapshot.

Independent of both fixes, the renderer's own local edits still write the whole task collection back with no revision check (`electron/ipc/store.cjs`'s `store/set-many` is a raw overwrite) -- a human editing a task at the same moment an agent writes to it can still lose the agent's change. That gap is reproduced honestly by this harness's third test and is not fixed by either change above. It is not yet scoped or documented as a contract change; extending the same `expectedRevision`/`__mcpRevision` guard MCP writes already use to renderer-originated writes is the direction discussed but not started.
