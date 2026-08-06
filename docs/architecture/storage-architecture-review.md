# Omvra Storage Architecture Review

## Bottom line

SQLite is a strong direction for operational and event-heavy data, while JSON should remain for settings, flexible payloads, import/export, and backups.

The proposal correctly identifies a real amplification problem, but attributes too much of it to JSON. SQLite will improve persistence and querying; it will not automatically fix renderer-wide re-renders or IPC churn.

## What the current code does

The current system is not one monolithic JSON document. It uses multiple `electron-store` keys, but several hot keys contain large arrays:

- `omvra.tasks.v1`
- `omvra.goals.v1`
- `omvra.goalRuntimeEvents.v1`
- ACP session and event arrays
- context and audit arrays

Task persistence rewrites the entire tasks array whenever React state changes, and runtime events read and rewrite the retained event array. The renderer also writes localStorage and mirrors to `electron-store`, creating duplicate serialization paths.

One proposal detail needs correction: current main-process store-change IPC sends only a timestamp, not the full store payload. Expensive payload crossing happens mainly on writes and subsequent hydration/querying, not necessarily on every notification.

## Where SQLite is justified

SQLite is a good fit for:

- tasks, goals, milestones, people, and relationships;
- agent runs and execution attempts;
- append-only agent, session, and runtime events;
- task context checkpoints and audit history;
- filtering, pagination, sorting, and time-window queries;
- optimistic concurrency using the existing `__mcpRevision` contract.

The highest immediate return is likely moving append-heavy arrays such as runtime events, session events, audit entries, and context history into indexed tables. These currently use repeated read-modify-write operations.

## Pushback on the proposal

### SQLite does not provide concurrent writers automatically

WAL improves reader/writer concurrency, but SQLite still serializes writes. Multiple agents will compete for one write lane rather than write simultaneously.

The design should therefore include:

- one main-process database owner;
- short transactions;
- a bounded write queue;
- retry/backoff for `SQLITE_BUSY`;
- explicit transaction boundaries;
- optimistic revision checks for conflicting entity updates.

SQLite does not replace the application-level `__mcpRevision` conflict contract.

### SQLite does not fix React rendering

Moving storage to SQLite will not stop unrelated components from re-rendering if the provider still replaces large arrays.

This should be treated as a separate decision. First consider splitting high-churn runtime state from stable workspace state, memoizing selectors, subscribing to runtime channels separately, and avoiding replacement of the entire task collection for event-only updates. A custom entity store should be added only if profiling proves it is necessary.

### Persisting every event may create a new bottleneck

SQLite is faster than JSON rewriting, but thousands of tiny synchronous transactions can still block Electron's main process.

Use in-memory buffering for transient streaming output, batched inserts, transactions around event bursts, durable checkpoints for meaningful lifecycle events, and explicit retention or archival rules. Not every UI progress event needs durable storage.

### Avoid indefinite dual writes

Writing to SQLite while retaining JSON as an active second source of truth creates failure modes:

- SQLite succeeds while JSON fails;
- JSON succeeds while SQLite fails;
- one writer updates a stale copy;
- migration and export semantics become ambiguous.

Prefer this sequence:

1. Back up the existing `electron-store` data.
2. Import it into SQLite with a versioned schema migration.
3. Make SQLite canonical for selected domains.
4. Keep JSON for settings, compatibility import, export, and backup.
5. Use shadow reads or consistency checks temporarily, without long-term dual writes.

### Native SQLite adds release-engineering cost

`better-sqlite3` is a native Electron dependency. It introduces ABI, `electron-rebuild`, packaging, signing, notarization, and cross-platform build concerns.

Before committing, validate Electron 39 compatibility, macOS arm64/x64 packaging, Windows and Linux packaging, CI builds, upgrade behavior, and database backup/restore behavior.

## Recommended storage classes

| Data | Storage |
| --- | --- |
| Settings, preferences, and feature flags | JSON / electron-store |
| Tasks, goals, milestones, and relationships | SQLite rows |
| Agent, session, runtime, and context history | SQLite append-only tables |
| Flexible agent configuration or snapshots | JSON columns |
| Import, export, and backup | Generated JSON |
| Large files and attachments | Filesystem, referenced by SQLite |

For goals, avoid over-normalizing immediately. Store stable graph entities and edges relationally while allowing bounded JSON for flexible node configuration.

## Recommended rollout

1. Instrument the current system: write duration, serialized byte size, event rate, IPC latency, React commit time, and dropped frames.
2. Add a persistence repository boundary without changing UI behavior.
3. Move runtime, session, and context event collections to SQLite.
4. Preserve existing keys, MCP envelopes, import/export, hydration order, and `__mcpRevision`.
5. Move tasks and goals after the event path proves stable.
6. Add delta notifications only where profiling shows they matter.
7. Test with synthetic workloads: 1, 5, and 10 concurrent agent runs; 1,000 and 10,000 historical events.
8. Remove the one-ACP-job cap only after measuring write latency, main-process responsiveness, and renderer frame time.

## Recommendation

Approve the concept, but narrow the first implementation to SQLite-backed operational and event data plus a repository boundary. Treat delta IPC and per-entity subscriptions as separate follow-up decisions validated by profiling rather than bundling them automatically with the database migration.

