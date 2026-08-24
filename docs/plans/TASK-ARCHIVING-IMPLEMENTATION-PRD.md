# Task Archiving Implementation PRD

Status: Draft for product and architecture review  
Date: 2026-08-19  
Owner: Product + Engineering  
Scope: Task archiving, archived-task retrieval, restoration, retention boundaries, and backup inclusion

Related authoritative contracts:

- `docs/architecture/acp-runtime-session-lifecycle-contract.md`
- `docs/architecture/task-context-ledger.md`
- `docs/architecture/task-orchestration-and-multi-agent-collaboration.md`
- `docs/architecture/storage-architecture-review.md`

## 1. Executive decision

Omvra must treat task completion, visual hiding, archiving, backup, restoration, and permanent deletion as separate concerns.

Task archiving will move eligible completed tasks and their task-owned durable history out of globally hydrated active workspace storage into local task archive storage under Electron `userData`. Archived tasks remain canonical Omvra records, retain their stable task IDs, remain retrievable on demand, and are read-only until explicitly restored.

The task archive is not Git or a version-control system. It has no branches, commits, diffs, merges, or retained file revision graph. An archive bundle is a durable representation of one task at the moment it leaves active storage. Existing optimistic task revisions remain concurrency guards only.

A full workspace backup must include active and archived information. The backup is a portable copy of those canonical stores; it is never the only place archived tasks exist.

## 2. Problem

Omvra currently keeps completed tasks in the same active task collection as current work. The `Show completed tasks` preference reduces Timeline clutter, but it does not reduce:

- active workspace hydration;
- active task-array serialization and rewriting;
- backup size;
- context, collaboration, attempt, and runtime-history retention in active stores;
- the cost of querying and projecting long-lived workspaces.

The codebase contains partial archive assumptions but no complete archive implementation:

- runtime preflight blocks a task carrying `archived: true`;
- task-context reads preserve bounded access for an archived task;
- provider-session archive preparation can remove resumability without changing task state;
- the public `Task` type, task mutation service, MCP task tools, renderer store, and backup flow do not define a complete task archive transition;
- `tasks.delete` permanently removes a task and cleans dependencies and milestone links, which is not acceptable archive behavior.

Without a distinct archive tier, completed work either grows indefinitely inside active state or must be destructively deleted. Neither outcome meets Omvra's durability, auditability, performance, or recovery goals.

## 3. Product outcome

For people managing long-lived Omvra workspaces, task archiving keeps current work responsive and uncluttered while preserving completed work for search, audit, dependency resolution, backup, and later restoration.

The successful outcome is:

1. A user completes and accepts a task.
2. The task remains visible as recently completed work until manually or automatically archived.
3. Archiving safely moves the task out of active hydration.
4. Ordinary work views stop loading or rendering it.
5. Exact lookup, archive search, dependency resolution, and historical milestone calculations can still find it.
6. The user may restore it without silently resuming an old provider session.
7. A full backup contains both the active workspace and task archive.

## 4. Terminology

| Term | Definition |
| --- | --- |
| Completed | A workflow state determined by the configured status column's `roadmapStage: complete` semantics. |
| Hidden | A renderer preference that omits completed tasks from a view. It does not change persistence or task lifecycle. |
| Active storage | Canonical mutable workspace data included in normal hydration and ordinary task queries. |
| Task archive storage | Canonical local, durable, read-only task bundles excluded from normal hydration and loaded on demand. |
| Cold storage | The policy tier applied to task archive storage: indexed, locally available, read-only, non-executable, and fetched only when requested. It does not mean offline or remote storage. |
| Archive index | Rebuildable summary metadata used to list, filter, and resolve archived task IDs without opening every archive bundle. It is not canonical. |
| Archive bundle | The canonical files representing one archived task and its task-owned durable history. |
| Restore | An explicit transition that recreates active task records from a validated archive bundle. It does not automatically reopen the task or resume an old agent session. |
| Purge | Explicit permanent removal of an archive bundle after policy and reference checks. Purge is not part of the first implementation slice. |
| Full backup | A portable recovery package containing active workspace data and archived task data. |
| Active workspace export | A portable export that may omit archived history. It must not be labelled a full backup. |

## 5. Goals

- Remove archived task bodies and task-owned history from global workspace hydration.
- Preserve stable task identity and historical relationships after archival.
- Make archived tasks discoverable through bounded, explicit reads.
- Keep archived tasks immutable and non-executable until restored.
- Preserve context, collaboration, attempts, normalized runtime metadata, and evidence references required to understand the completed work.
- Make archive and restore operations revision-protected, idempotent, crash-safe, and visible.
- Include archived data in full backup and restore.
- Keep completion, hiding, archiving, restoration, and deletion semantically independent.
- Reuse Electron `userData`, existing task revisions, existing provider-session archive preparation, and existing redaction contracts.

## 6. Non-goals

- Implementing Git-like version control for task or archive files.
- Retaining every archive-file version or providing archive diffs and merges.
- Persisting raw provider prompts, responses, transcripts, hidden reasoning, tool payloads, or credentials.
- Automatically treating runtime/session completion as task completion or archive authorization.
- Changing configured task statuses or adding `archived` as a status column.
- Automatically deleting archived tasks in the first release.
- Full-text indexing of every archived history body in the first release.
- Moving task attachments into a new binary object store in this work.
- Selecting the final compressed full-backup container format; this PRD defines archive inclusion and restore semantics only.
- Migrating every active operational collection to SQLite as part of task archiving.

## 7. Product and policy principles

### 7.1 One canonical tier

A task ID is canonical in exactly one tier at steady state:

- active task storage; or
- task archive storage.

Temporary duplication is allowed only during a crash-safe archive or restore transaction. Resolution rules must select the active record while restoration cleanup is pending and the archive record while archive cleanup is pending.

### 7.2 Completion is not archival

Moving a task into a complete status does not archive it. Completion remains a governed task workflow decision. Archive is a separate storage and access transition.

### 7.3 Archive is not deletion

Archiving preserves task identity, history, dependency meaning, milestone history, and restoration. Existing `tasks.delete` behavior must not be reused for archival because deletion removes relationship references.

### 7.4 Backup is not canonical storage

An archived task remains available from Omvra after the backup file is moved, deleted, or unavailable. Full backup copies archive data; it does not stand in for archive storage.

### 7.5 Read does not restore

Reading, listing, linking, or using an archived task as historical context must never restore it or make it executable.

## 8. Actors and authority

| Actor | Archive | Read archive | Restore | Purge |
| --- | --- | --- | --- | --- |
| Human workspace user | Allowed when eligibility checks pass | Allowed | Allowed | Deferred; explicit confirmation required when implemented |
| Retention policy service | Allowed only under an enabled user policy | Index and eligibility reads only | Not allowed | Not allowed in first release |
| Agent with `read_only` MCP access | Not allowed | Bounded reads when task access permits | Not allowed | Not allowed |
| Agent with `task_write` MCP access | Not allowed | Bounded reads when task access permits | Not allowed | Not allowed |
| Agent with `admin` MCP access | Allowed only through an explicit archive command and normal confirmation/governance policy | Allowed | Allowed through an explicit command | Deferred |
| Runtime/session adapter | Not allowed to archive task state | May read required bounded context | Not allowed | Not allowed |

An agent session ending, closing, crashing, or being cancelled never archives a task.

## 9. Lifecycle model

```text
Active, incomplete
      |
      | governed completion and acceptance
      v
Active, completed
      |
      | manual archive or enabled retention policy
      v
Archive preparation
      |------------------------------|
      | validation/write failure     | committed archive bundle
      v                              v
Active, completed                Archived, read-only
                                     |
                                     | explicit restore
                                     v
                                Active, completed
                                     |
                                     | separate user action
                                     v
                                Active, reopened
```

Restoration preserves the completed status by default. Reopening is a separate status transition using existing task mutation rules.

## 10. Archive eligibility

A task is eligible only when all applicable conditions pass:

1. The task exists in active storage.
2. The caller supplies the current `expectedRevision`.
3. The task's configured status column has complete roadmap semantics.
4. Human acceptance and contribution requirements are satisfied.
5. No contribution remains `pending`, `working`, or `revision-requested`.
6. No execution attempt remains non-terminal.
7. No provider session is `starting` and no turn is in flight.
8. An idle `ready` provider session is successfully closed through existing archive preparation before task storage changes.
9. An interrupted attempt has been explicitly resolved according to the runtime lifecycle contract.
10. No pending Goal handoff, approval, cleanup, or other governed operation requires the active task record.
11. The archive destination is writable.
12. Every required task-owned record can be read and validated.
13. The generated archive bundle passes schema and integrity validation before active state is changed.

Archive eligibility does not require removing dependencies or milestone links. Those relationships must remain historically resolvable.

### 10.1 Legacy completed tasks

Automatic archiving requires a trustworthy completion timestamp. A legacy completed task without `completedAt` may be archived manually, but must not be automatically archived based on `createdAt`, an inferred status age, or application startup time.

The task status-transition path must record `completedAt` when a task first enters a status with complete roadmap semantics and clear or preserve it according to an explicitly defined reopen rule. The recommended rule is:

- preserve the historical `completedAt` in activity history;
- clear the current `completedAt` when reopened;
- set a new `completedAt` on later recompletion.

## 11. Storage design

### 11.1 Location

Task archive storage lives under Electron's resolved `userData` directory:

```text
<userData>/task-archive/v1/
  index.json
  tasks/
    <task-id>/
      archive.json
      task.json
      context.jsonl
      attempts.jsonl
      collaboration-events.jsonl
      runtime-events.jsonl
      evidence.json
```

File names are fixed by the archive schema. Paths are derived from validated task IDs; callers never supply arbitrary filesystem paths.

This is ordinary application file storage. It does not retain a version tree. Re-archiving a task after restoration produces a new archive bundle only after the earlier bundle has been removed from the canonical archive tier.

### 11.2 Canonical and derived files

Canonical per-task files:

- `archive.json`: bundle manifest, lifecycle metadata, relationships, record counts, and file hashes;
- `task.json`: final normalized task snapshot;
- `context.jsonl`: immutable task-context ledger entries owned by the task;
- `attempts.jsonl`: task contribution/execution attempts owned by the task;
- `collaboration-events.jsonl`: task collaboration lifecycle events owned by the task;
- `runtime-events.jsonl`: bounded normalized runtime/session facts required by the runtime archive contract;
- `evidence.json`: evidence references and bounded metadata, never private evidence bodies.

Derived file:

- `index.json`: compact archived-task summaries for lookup and filtering. It can be rebuilt from `archive.json` files and must never be the only source of task data.

Empty history files may be omitted when `archive.json` records a zero count. Consumers must not infer corruption from an intentionally absent zero-count file.

### 11.3 Archive manifest

Minimum `archive.json` shape:

```json
{
  "schemaVersion": 1,
  "archiveId": "archive-uuid",
  "taskId": "task-123",
  "sourceTaskRevision": 14,
  "status": "done",
  "completedAt": "2026-07-20T10:00:00.000Z",
  "archivedAt": "2026-08-19T10:00:00.000Z",
  "archivedBy": {
    "kind": "human",
    "id": "person-1"
  },
  "reason": "manual",
  "relationships": {
    "projectIds": ["project-1"],
    "milestoneId": "milestone-1",
    "dependencyIds": ["task-100"],
    "parentTaskId": null,
    "assigneeId": "agent-1"
  },
  "files": {
    "task.json": {
      "sha256": "...",
      "bytes": 2400,
      "records": 1
    },
    "context.jsonl": {
      "sha256": "...",
      "bytes": 12200,
      "records": 28
    }
  }
}
```

The manifest does not copy the task description, persona instructions, operational instructions, skill bodies, evidence bodies, or runtime transcript.

### 11.4 Archive index entry

Minimum index entry:

```json
{
  "taskId": "task-123",
  "title": "Implement task archiving",
  "status": "done",
  "projectIds": ["project-1"],
  "milestoneId": "milestone-1",
  "assigneeId": "agent-1",
  "completedAt": "2026-07-20T10:00:00.000Z",
  "archivedAt": "2026-08-19T10:00:00.000Z",
  "sourceTaskRevision": 14,
  "archiveId": "archive-uuid"
}
```

The first implementation may use one atomically replaced `index.json` because archive writes are infrequent and entries are summaries only. The index must not be included in renderer startup hydration. If measurement shows archive search or index rewrite cost is material, the storage service may move the derived index to SQLite without changing task archive files or public APIs.

### 11.5 Attachments

The first implementation preserves attachment records and their existing file references. It does not duplicate attachment binaries inside every task archive bundle.

An archived-task read must report missing attachment files explicitly. Full backup behavior for attachment binaries remains governed by the backup specification and must not claim a reference-only backup is self-contained.

## 12. Record ownership during archival

Task-owned records move to the archive bundle:

- the task record;
- task-context entries keyed solely to the task;
- task contribution attempts keyed to the task;
- task collaboration events keyed to the task;
- normalized task-scoped runtime/session metadata required for durable interpretation;
- task-scoped evidence references.

Shared or workspace-owned records remain in their canonical stores:

- people and agent profiles;
- projects and milestones;
- Goal definitions and Goal execution records;
- global MCP audit records;
- shared attachment files;
- workspace preferences and status-column configuration.

Shared records preserve the stable task ID and resolve it through the active task service followed by the archive index. They must not copy the complete archived task body.

## 13. Archive write transaction

The main-process task archive storage service owns the complete operation. Renderer code, MCP handlers, and runtime adapters must not sequence filesystem and store writes themselves.

### 13.1 Command input

```ts
type ArchiveTaskCommand = {
  taskId: string;
  expectedRevision: number;
  idempotencyKey: string;
  actor: {
    kind: 'human' | 'agent' | 'system';
    id?: string;
  };
  reason: 'manual' | 'retention-policy';
};
```

### 13.2 Commit sequence

1. Resolve the active task and current revision.
2. Return the prior result if the idempotency key already completed.
3. Validate archive eligibility.
4. Prepare/close eligible provider sessions through the existing runtime archive seam.
5. Collect task-owned records without mutating them.
6. Create a staging directory under the same archive parent filesystem.
7. Write canonical bundle files to staging.
8. Compute hashes, write `archive.json`, and validate the complete staging bundle.
9. Atomically rename staging to the final task archive directory.
10. In one canonical workspace mutation, remove the active task and moved task-owned records from active collections.
11. Update the derived archive index atomically.
12. Emit one bounded `task.archived` change event and return the archive summary.

The task archive directory must not be replaced if a canonical bundle already exists for the task. Duplicate task IDs fail closed unless the same idempotency key and archive ID prove replay.

### 13.3 Crash recovery

- Crash before final archive-directory rename: active task remains canonical; staging is safe to remove.
- Crash after archive-directory rename but before active cleanup: active task remains canonical; the unreferenced archive bundle is treated as an orphan and reconciled or removed after validation.
- Crash after active cleanup but before index update: archive bundle is canonical; startup rebuilds or repairs the derived index.
- Active task missing and archive bundle missing: fail with a visible integrity error; do not fabricate either record.
- Active and archive copies both present after restore interruption: active record wins resolution, archive cleanup is retried, and the condition is reported diagnostically.

Startup reconciliation must be idempotent and must not infer task completion, acceptance, or purge authorization.

## 14. Restore transaction

### 14.1 Command input

```ts
type RestoreArchivedTaskCommand = {
  taskId: string;
  archiveId: string;
  idempotencyKey: string;
  actor: {
    kind: 'human' | 'agent';
    id?: string;
  };
};
```

### 14.2 Restore sequence

1. Resolve and validate the archive bundle, manifest, and file hashes.
2. Reject restoration if an unrelated active task already uses the task ID.
3. Revalidate referenced projects, milestones, people, dependencies, and attachments without silently deleting unresolved references.
4. Restore the task and task-owned durable records in one canonical workspace mutation.
5. Advance the task's optimistic revision from `sourceTaskRevision` so a stale pre-archive client cannot write successfully.
6. Preserve the completed status and set bounded restoration metadata.
7. Remove the archive-index entry.
8. Move the archive bundle out of the canonical archive path and remove it only after active persistence succeeds.
9. Emit one bounded `task.restored` event.

Restore never:

- resumes an opaque provider session reference;
- changes the task to `open` or `in-progress`;
- restarts a Goal execution;
- represents new human acceptance;
- silently repairs missing attachment bodies.

## 15. Retrieval contract

### 15.1 Exact task lookup

`tasks.get` resolves in this order:

1. active task storage;
2. direct archive-storage lookup using the validated task ID;
3. not found.

Exact lookup must not depend on a current derived index entry. The index accelerates listing and filtering, but a committed archive bundle remains retrievable while a failed or interrupted index update is being repaired.

Archived-task responses include:

```json
{
  "storageTier": "archive",
  "readOnly": true,
  "executionAllowed": false,
  "restoreRequiredForExecution": true,
  "archive": {
    "archiveId": "archive-uuid",
    "completedAt": "...",
    "archivedAt": "...",
    "sourceTaskRevision": 14
  }
}
```

An exact archived read opens only the requested archive bundle. It does not hydrate other archives.

### 15.2 Task listing

Existing list behavior remains active-only by default.

The task read API adds an explicit tier selector:

```ts
type TaskStorageTier = 'active' | 'archive' | 'all';
```

Archive and combined lists must be cursor-paginated. Initial requirements:

- default limit: 50;
- maximum limit: 200;
- metadata filters: project, milestone, assignee, completion date, archive date, and exact status;
- title search over index metadata;
- no history-body full-text search in the first release.

Archive list responses return summaries only. The caller uses exact get or bounded context tools for bodies.

### 15.3 Context retrieval

Archived task context remains readable through existing bounded list/get semantics and the same task-access boundary. Reads must never return all context bodies by default.

Appending, editing, or deleting archived context is forbidden. A user must restore the task before creating new task-owned context.

### 15.4 Dependency resolution

Dependency eligibility resolves active tasks first and archived summaries second. An archived task with complete status satisfies the existing completed-dependency rule.

Archived dependencies must not appear as missing. Active dependency queries use indexed summary data and do not open complete archive bundles.

### 15.5 Milestone and project history

Archiving preserves task IDs in milestones, projects, Goals, and related history. Historical milestone completion counts must include archived completed tasks. Ordinary active-work views may omit archived tasks while historical or explicit archive views include them.

## 16. Runtime and persona behavior

- Runtime preflight must return `TASK_ARCHIVED`, not `TASK_NOT_FOUND`, when an archive summary exists.
- An archived task cannot start or resume a managed execution.
- `agent.resolve_task_context` may return bounded archived task information for historical reference, but marks the context non-executable.
- Archived task reads resolve the historical assignee/profile reference without copying persona or operational instruction bodies into the archive.
- If the current referenced agent profile no longer exists, the archived task remains readable and reports the missing reference. It does not fabricate or install anything.
- Restoring a task causes any later execution to resolve the current applicable profile under the execution-context contract; it does not silently reuse an old composed prompt.

## 17. MCP and IPC surface

### 17.1 New operations

- `tasks.archive`
- `tasks.restore`
- `tasks.list_archived` or an approved `storageTier` extension to `tasks.list`
- renderer IPC equivalents owned by the same main-process storage service

The implementation should choose the smallest compatible public surface. Exact lookup should extend existing `tasks.get` rather than introduce a duplicate get tool.

### 17.2 Compatibility aliases

If canonical dotted MCP names receive underscore aliases, both names must route through the same handler and domain operation.

### 17.3 Write requirements

Archive and restore commands require:

- exact task ID;
- expected task revision for archive;
- archive ID for restore;
- idempotency key;
- authorized actor/capability;
- explicit confirmation when required by workspace policy.

No runtime adapter or context read may call these write operations implicitly.

## 18. UI requirements

### 18.1 Completed-task visibility

`Show completed tasks` continues to control visibility of completed tasks that remain in active storage. It does not include archived tasks and must not be described as an archive control.

### 18.2 Task actions

An eligible completed task exposes `Archive task` with:

- a concise explanation that the task remains searchable and restorable;
- disabled reasons when eligibility fails;
- progress while archive preparation and persistence run;
- success only after the archive command commits;
- a visible error with retry guidance when any stage fails.

### 18.3 Archive browser

Provide a separate archived-task surface with:

- title search;
- project, milestone, assignee, completion-date, and archive-date filters;
- bounded pagination;
- archive date and completion date;
- read-only task detail;
- missing-reference and missing-attachment indicators;
- explicit `Restore task` action;
- no editable controls until restoration completes.

### 18.4 Restoration

Restoration must explain that:

- the task returns as completed;
- no prior agent session resumes;
- the user may reopen it separately;
- unresolved references will be reported rather than removed.

### 18.5 Accessibility

- Archive state must never be conveyed by color alone.
- Disabled archive actions expose a textual reason.
- Async success and failure are announced.
- Focus returns to a meaningful task/archive location after archive or restore.
- Archive browser, filters, pagination, and restore confirmation are keyboard operable.

## 19. Retention policy

### 19.1 First release

The first implementation ships manual archive and restore before background automatic archiving. This validates storage integrity, retrieval, backup, and recovery without silently moving user work.

Default retained behavior:

- completed active tasks: retained until manually archived;
- archived tasks: retained indefinitely;
- automatic permanent deletion: disabled and unavailable;
- purge: deferred.

### 19.2 Follow-up automatic policy

After manual archive/restore and full-backup behavior pass release validation, add:

```text
Automatically archive eligible completed tasks after:
[Off] [30 days] [90 days] [180 days] [1 year]
```

Recommended eventual default: 30 days. This remains a product decision requiring confirmation before implementation.

The automatic policy:

- uses `completedAt`, never inferred age;
- evaluates eligibility immediately before each archive command;
- archives one task per independently recoverable command;
- records actor `system` and reason `retention-policy`;
- never purges;
- surfaces failures without repeatedly retrying a permanently ineligible task in a tight loop.

### 19.3 Purge policy

Permanent archive purge is deliberately excluded from the first release. A later purge specification must decide:

- retention durations;
- explicit confirmation and capability rules;
- backup-before-purge behavior;
- legal/pinned hold behavior;
- attachment cleanup;
- whether a minimal tombstone remains for broken-link diagnosis.

## 20. Backup and restore requirements

### 20.1 Full backup

A full workspace backup includes:

- active workspace records;
- task archive manifests and canonical bundle files;
- the archive schema version;
- active and archived task counts;
- per-file integrity hashes or equivalent container integrity metadata;
- enough information to restore each task to its original storage tier.

The derived archive index may be omitted and rebuilt after restore.

### 20.2 Active export

An export that excludes archived tasks must:

- be labelled `Active workspace export` rather than `Full backup`;
- state that archived history is excluded;
- never be required as the sole recovery artifact before an update or destructive operation.

### 20.3 Restore validation

Before changing live storage, full-backup restore validates:

- backup and archive schema versions;
- duplicate task IDs across active and archive tiers;
- archive manifests and file hashes;
- task and history record shapes;
- unknown-field preservation requirements;
- forbidden credentials, transcripts, and opaque runtime references;
- destination collisions.

Restore is replace-only unless a separate merge specification is approved. No backup merge logic is introduced here.

### 20.4 Shipping gate

Task archiving must not ship if the supported full-backup path omits archived tasks. Otherwise archival would create durable local data that the advertised backup cannot recover.

## 21. Privacy and security

- Validate task IDs before deriving paths and reject traversal, separators, reserved names, and escape outside the archive root.
- Do not accept archive file paths from renderer or MCP callers.
- Use restrictive file permissions consistent with the workspace store.
- Exclude provider credentials, access tokens, raw prompts/responses, transcripts, hidden reasoning, raw tool payloads, private evidence bodies, and opaque provider session references.
- Preserve only normalized runtime metadata and correlation IDs allowed by the runtime lifecycle contract.
- Treat task descriptions, context, comments, persona references, and archive contents as user-authored workspace data.
- Redact archive diagnostics and audit events to identifiers, counts, durations, failure classes, and bounded outcomes.
- Validate all archive data on restore as untrusted input, even when it originated locally.

## 22. Failure contract

Stable failure classes should include:

- `TASK_NOT_FOUND`
- `TASK_ALREADY_ARCHIVED`
- `TASK_NOT_COMPLETE`
- `TASK_ARCHIVE_INELIGIBLE`
- `TASK_ARCHIVE_SESSION_ACTIVE`
- `TASK_ARCHIVE_PENDING_ACCEPTANCE`
- `TASK_ARCHIVE_PENDING_CONTRIBUTION`
- `TASK_ARCHIVE_PENDING_GOAL_OPERATION`
- `EXPECTED_REVISION_REQUIRED`
- `REVISION_MISMATCH`
- `IDEMPOTENCY_KEY_REQUIRED`
- `TASK_ARCHIVE_EXISTS`
- `TASK_ARCHIVE_WRITE_FAILED`
- `TASK_ARCHIVE_VALIDATION_FAILED`
- `TASK_ARCHIVE_INTEGRITY_FAILED`
- `TASK_ARCHIVE_NOT_FOUND`
- `TASK_ARCHIVE_RESTORE_COLLISION`
- `TASK_ARCHIVE_RESTORE_FAILED`
- `TASK_ARCHIVE_STORAGE_UNAVAILABLE`

Every failure reports whether active data changed. No failure authorizes task deletion, lifecycle advancement, silent fallback, or fabricated history.

## 23. Performance requirements

- Renderer startup hydration reads no archive task bodies.
- Ordinary `tasks.list` reads no archive task bodies.
- Archive index loading occurs only for archive-aware reads or the archive UI.
- Exact archived-task lookup reads one bundle only.
- Archived context reads remain bounded and paginated.
- Archive/restore work runs in the main process without blocking renderer interaction through synchronous renderer IPC loops.
- Archive indexing and history reads must be measured with 100, 1,000, and 10,000 archived-task fixtures.
- Validation must capture archive duration, bytes written, record counts, index bytes, index rebuild duration, exact-read latency, list latency, and renderer commit time.
- No implementation may copy persona bodies, operational instructions, skill contents, or full contract packets into every task archive.

Initial target budgets, subject to measurement on supported hardware:

- active startup cost attributable to archived task bodies: zero;
- exact archived summary lookup from loaded index: under 50 ms at 10,000 entries;
- first 50-entry archive list from loaded index: under 100 ms at 10,000 entries;
- index rebuild must be visible/cancellable or performed outside the critical startup path if it exceeds 500 ms.

These are product performance targets, not claims about the current implementation.

## 24. Observability

Record bounded operational measurements for:

- archive requested, succeeded, or failed;
- restore requested, succeeded, or failed;
- task ID, archive ID, actor kind, and reason;
- source revision;
- bundle bytes and record counts;
- duration by validation, file write, active cleanup, and index update;
- reconciliation outcome;
- failure class.

Do not record archive bodies, task descriptions, comments, evidence bodies, persona instructions, skill contents, or runtime transcripts in observability events.

## 25. Migration and compatibility

### 25.1 Existing tasks

- Existing active tasks remain active.
- No migration automatically archives completed tasks.
- Unknown task fields continue to survive normal reads/writes.
- Legacy `archived: true` tasks are detected and surfaced as requiring migration; they are not silently treated as complete file-backed archives.

### 25.2 Legacy archived flag migration

For each legacy task carrying `archived: true`:

1. Validate that the complete task still exists in active storage.
2. Require manual or explicitly approved migration.
3. Build and validate the file-backed archive bundle.
4. Remove it from active storage only after the normal archive transaction succeeds.

If migration fails, preserve the legacy task and keep runtime preflight blocked.

### 25.3 API compatibility

- Existing `tasks.list` remains active-only by default.
- Existing `tasks.get` keeps its active response compatible and adds archive metadata only for archived results.
- Existing active task IDs and `__mcpRevision` semantics remain stable.
- Existing `tasks.delete` does not become archive and must reject archived-task purge until an explicit purge contract exists.
- Current view preference semantics remain unchanged.

## 26. Implementation boundaries

The smallest coherent implementation requires:

1. archive schemas and validation;
2. a main-process task archive storage service;
3. atomic archive/restore flows and reconciliation;
4. task-service resolution across active and archive tiers;
5. dependency and milestone historical resolution;
6. MCP/IPC operations;
7. archive-aware full backup/restore;
8. manual archive and archive-browser UI;
9. focused domain, storage, MCP, renderer, and backup tests.

Automatic retention and permanent purge are separate follow-ups.

The implementation should reuse existing task normalization, optimistic revision, context-ledger, runtime archive-preparation, IPC registrar, MCP registry/handler, and backup validation patterns. It must not create a second task domain model in renderer code.

## 27. Acceptance criteria

### 27.1 Archive success

- **Given** an accepted completed task with no active contribution, attempt, Goal operation, or provider turn, **when** an authorized user archives it using the current revision, **then** Omvra writes and validates its archive bundle before removing active records.
- **Given** a committed archive, **when** ordinary workspace hydration runs, **then** the archived task body and task-owned archive history are not hydrated.
- **Given** a committed archive, **when** the user opens ordinary Timeline or Kanban views, **then** the archived task is absent regardless of `Show completed tasks`.
- **Given** a committed archive, **when** the user opens the archive browser, **then** its summary is present without loading every archive body.
- **Given** a committed archive, **when** exact task lookup uses its stable ID, **then** Omvra returns a read-only archived result with archive metadata.

### 27.2 Eligibility and concurrency

- **Given** an incomplete task, **when** archive is requested, **then** Omvra rejects it with `TASK_NOT_COMPLETE` and changes no data.
- **Given** a stale task revision, **when** archive is requested, **then** Omvra rejects it with `REVISION_MISMATCH` and writes no canonical archive.
- **Given** an in-flight provider turn, **when** archive is requested, **then** Omvra rejects it and does not cancel, close, or mutate the session implicitly.
- **Given** an idle provider session eligible for archive preparation, **when** archive is requested, **then** Omvra closes it through the existing runtime contract before removing active task state.
- **Given** a replayed archive command with the same idempotency key, **when** the first command already succeeded, **then** Omvra returns the original result without creating a duplicate archive.

### 27.3 History and relationships

- **Given** a task with context, attempts, collaboration events, and evidence references, **when** it is archived, **then** every task-owned durable record is present once in the validated archive bundle and absent from its active collection after commit.
- **Given** an active task depending on an archived completed task, **when** dependency eligibility is evaluated, **then** the archived task satisfies the completed dependency instead of appearing missing.
- **Given** an archived task linked to a milestone, **when** historical milestone completion is calculated, **then** the archived completed task remains part of the historical total.
- **Given** a missing referenced person, profile, project, milestone, dependency, or attachment, **when** the archive is read or restored, **then** Omvra reports the unresolved reference without silently deleting or fabricating it.

### 27.4 Restore

- **Given** a valid archived task and no active ID collision, **when** an authorized user restores it, **then** the task and its owned durable records return to active storage and the archive is removed from the canonical archive tier only after active persistence succeeds.
- **Given** a restored task, **when** restoration completes, **then** its status remains complete and no provider session or Goal execution resumes.
- **Given** a restored task, **when** a stale pre-archive client attempts a write, **then** the advanced task revision rejects the write.
- **Given** a corrupt or hash-mismatched archive, **when** restore is requested, **then** Omvra fails closed and changes no active records.

### 27.5 Backup

- **Given** active and archived tasks, **when** a full backup is generated, **then** it contains both tiers exactly once and identifies each task's tier.
- **Given** a full backup with archived tasks, **when** restore succeeds, **then** active tasks return to active storage and archived tasks return to archive storage.
- **Given** an export that excludes archived tasks, **when** it is presented to the user, **then** it is labelled as an active workspace export rather than a full backup.
- **Given** an archive implementation whose full backup omits archive bundles, **when** release readiness is assessed, **then** the feature is not ready to ship.

### 27.6 Privacy and negative criteria

- No archive file, index entry, event, diagnostic, or backup contains provider credentials, MCP access tokens, raw prompts/responses, transcripts, hidden reasoning, raw tool payloads, private evidence bodies, or opaque session references.
- No archive command is triggered by session closure, task read, context resolution, view filtering, or application startup.
- No archived-task read restores, mutates, reopens, or starts execution for the task.
- No archive operation removes dependency, milestone, project, Goal, parent, or evidence references as if the task had been deleted.
- No renderer or MCP caller supplies or receives unrestricted local archive filesystem paths.
- No automatic policy archives a legacy completed task without a trustworthy `completedAt`.
- No permanent purge occurs in the first release.

## 28. Ready-for-test checklist

- [ ] Archive schema and path validation have focused tests.
- [ ] Archive and restore success paths have domain/storage tests.
- [ ] Every defined crash boundary has a reconciliation fixture.
- [ ] Revision mismatch and idempotent replay are covered.
- [ ] Active session, active contribution, pending acceptance, and pending Goal gates are covered.
- [ ] Dependency resolution includes archived complete and archived invalid fixtures.
- [ ] Milestone historical counts include archived tasks.
- [ ] Context list/get remains bounded for archived tasks.
- [ ] Exact task lookup distinguishes archived from missing.
- [ ] List pagination and filters are covered at 100, 1,000, and 10,000 archive summaries.
- [ ] Full backup/restore round-trips active and archived tiers.
- [ ] Privacy-negative backup and archive fixtures pass.
- [ ] Legacy `archived: true` behavior is preserved or explicitly migrated.
- [ ] Archive UI keyboard, focus, announcements, disabled reasons, error states, and restore confirmation are manually verified.
- [ ] Existing task completion, delete, Timeline filter, Kanban, Roadmap, MCP, context, runtime, and backup tests remain green.
- [ ] `npm run test:mcp`, `npm run test:workspace-contracts`, renderer build, and `git diff --check` pass.

## 29. Rollout plan

### Phase 0: measurement and fixtures

- Add backup and active-store size breakdowns by logical collection.
- Create representative completed-task fixtures with context, collaboration, runtime metadata, evidence, missing references, and attachments.
- Record baseline hydration, task-list, backup, and store-write measurements.

### Phase 1: manual archive foundation

- Add archive schemas and main-process storage service.
- Add archive/restore transactions and startup reconciliation.
- Add archive-aware exact lookup and dependency resolution.
- Add MCP/IPC commands and focused tests.

### Phase 2: archive UX and historical reads

- Add manual task archive action and disabled reasons.
- Add archive browser, filters, pagination, detail, and restore.
- Add historical milestone/project projections.

### Phase 3: full backup and release gate

- Include archives in full backup and restore.
- Validate collision, integrity, privacy, unknown fields, and tier preservation.
- Run synthetic volume and crash-recovery validation.

### Phase 4: optional automatic retention

- Confirm retention options and default.
- Add `completedAt` coverage and legacy protections.
- Add bounded background eligibility evaluation.
- Do not add purge.

## 30. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Partial file/store commit | Task appears missing or duplicated | Stage and validate files first, one active-store mutation, idempotent startup reconciliation |
| Archive mistaken for deletion | Broken dependencies and milestone history | Preserve stable IDs and relationships; separate commands and UI copy |
| Archive mistaken for backup | History becomes unavailable when backup is absent | Keep canonical local archive storage and include copies in full backup |
| Archive index becomes another large hot JSON document | Rewrite or load cost grows | Keep summaries only, exclude from startup hydration, measure, allow derived SQLite index later |
| Shared records are duplicated into every archive | Storage and backup amplification | Define task-owned versus shared ownership; store stable references for shared records |
| Persona/skill content copied into archives | Data amplification and stale execution context | Preserve profile/skill references and resolution receipts only |
| Restoration resumes stale provider state | Unsafe or misleading execution | Clear opaque references and require a new governed execution |
| Automatic archive surprises users | Work disappears from ordinary views | Manual-first rollout, clear archive UI, configurable policy, no inferred completion dates |
| Archive corruption remains unnoticed | Restore failure when history is needed | Per-file hashes, validation on write/read/backup restore, visible diagnostics |
| Missing attachment or entity references | Historical record appears complete when it is not | Preserve references and surface unresolved states explicitly |

## 31. Assumptions

- Omvra remains a local-first Electron application with one main-process owner for canonical writes.
- Archived tasks are accessed substantially less often than active tasks.
- Completed task history has durable user value and should not be discarded by default.
- Existing task IDs remain stable across archive and restore.
- Existing `__mcpRevision` behavior remains the task concurrency mechanism.
- Full backup is expected to recover all durable workspace and archive information.
- The first release can use a derived JSON archive index if measurements remain acceptable; canonical archive files and public contracts do not depend on that choice.

## 32. Open product decisions

These decisions materially affect later phases but do not block drafting the manual archive foundation:

1. Confirm the eventual automatic archive default: `Off` or the recommended `30 days`.
2. Decide whether archived-task search initially needs description/full-text search or metadata/title search only.
3. Decide whether a restored task should offer an optional `Restore and reopen` convenience action while keeping plain restore status-preserving.
4. Decide whether archived tasks may receive new human-only notes without full restoration. Current recommendation: no; keep archives immutable.
5. Define attachment behavior for a self-contained full backup.
6. Define later purge/tombstone/legal-hold behavior in a separate PRD.
7. Confirm whether archive-aware full backup ships in the existing JSON format temporarily or only with the planned segmented backup package.

## 33. Definition of done

The task-archive feature is complete only when:

- the archive storage and lifecycle contract is accepted;
- manual archive and restore are crash-safe, revision-protected, idempotent, and tested;
- archived task bodies and task-owned history are absent from normal hydration;
- exact retrieval, bounded archive listing, context reads, dependencies, and historical milestone projections work;
- agents and runtimes cannot execute archived work or archive tasks implicitly;
- full backup/restore includes archived tasks and preserves storage tiers;
- privacy-negative fixtures prove forbidden data is absent;
- legacy behavior and existing task/Goal/runtime contracts remain compatible;
- volume, startup, lookup, archive, restore, and backup measurements are recorded;
- the archive UI is accessible and clearly distinguishes completed, hidden, archived, restored, and deleted concepts;
- a human reviewer accepts the behavior and recovery evidence.
