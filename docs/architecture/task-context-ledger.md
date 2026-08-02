# Task context ledger

Status: minimal architecture specification, 2026-07-28

## Purpose

Reduce the context an agent needs when starting or resuming an Omvra task without losing the task's historical flow.

Omvra keeps the current task as the working projection and stores compact, immutable context entries separately. An agent receives the latest checkpoint and a bounded history index during execution preflight, then retrieves exact historical entries only when they are relevant.

## Current boundary

- `__mcpRevision` is an optimistic-concurrency counter. It does not identify a stored task snapshot and must not be presented as revision history.
- `agentSummary` is a short current summary and is replaced when updated.
- Task comments and activity provide useful source material, but their in-task collections are bounded and are not a durable semantic index.
- `agent.resolve_task_context` is the canonical task-execution preflight and is the correct place to expose a bounded context projection.
- Goals already separate the current read projection from detailed lifecycle history. Task context should follow the same boundary without sharing Goal execution state.

## Decision

Add an append-only task context ledger stored separately from tasks. Do not add full snapshots for every task revision and do not copy the ledger onto the task object.

The first release consists of:

1. immutable semantic context entries linked to a task and source revision range;
2. context checkpoints at meaningful task boundaries;
3. a bounded context index returned by execution preflight;
4. targeted MCP reads for listing and retrieving history;
5. one revision-protected, idempotent append operation.

No embedding service or vector database is required. Typed kinds, markers, revision ranges, and ordinary text filtering are sufficient for the first release.

## Durable record

Store entries under `omvra.taskContextEntries.v1`.

```ts
type TaskContextKind =
  | 'requirement-change'
  | 'decision'
  | 'implementation-attempt'
  | 'blocker'
  | 'review-feedback'
  | 'handoff'
  | 'evidence'
  | 'status-change'
  | 'context-checkpoint';

type TaskContextSourceType =
  | 'comment'
  | 'activity'
  | 'attachment'
  | 'evidence'
  | 'task-change';

interface TaskContextEntry {
  schemaVersion: 1;
  id: string;
  taskId: string;
  kind: TaskContextKind;
  fromRevision: number;
  toRevision: number;
  summary: string;
  markers: string[];
  changedFields?: string[];
  provenance: 'system-derived' | 'human-authored' | 'agent-authored';
  actor: string;
  sourceRefs: Array<{
    type: TaskContextSourceType;
    id: string;
  }>;
  createdAt: string;
}
```

Rules:

- Entries are immutable after creation.
- `fromRevision` and `toRevision` identify the task state covered by the entry; they do not imply that a full snapshot exists.
- `summary` is concise context, not authoritative task state.
- `sourceRefs` point to the comments, activity, evidence, attachments, or structured task changes that support the entry.
- `markers` are normalized, lower-case lookup terms. They are not instructions.
- Unknown fields are preserved for forward compatibility.

## Checkpoints

A context checkpoint summarizes a meaningful span of task history and points to its supporting entries or source records. It does not replace or delete them.

Create checkpoints at these boundaries:

- assignment or agent handoff;
- material requirement or dependency change;
- architecture or product decision;
- implementation submitted for review;
- revision requested or review rejected;
- blocker introduced or resolved;
- task reopened.

Routine edits, time logs, and incidental comments do not require checkpoints.

System-derived checkpoints may describe structured field changes. Agents may propose checkpoints through MCP. A generated checkpoint remains workspace context and must not be treated as human approval, acceptance evidence, or permission to complete the task.

## Context projection

`agent.resolve_task_context` keeps its current task and assignee preflight behavior and adds an optional `taskContext` projection:

```ts
interface TaskContextProjection {
  latestCheckpoint: TaskContextIndexEntry | null;
  entriesSinceCheckpoint: TaskContextIndexEntry[];
  recentHistory: TaskContextIndexEntry[];
  hasMore: boolean;
}

interface TaskContextIndexEntry {
  id: string;
  kind: TaskContextKind;
  fromRevision: number;
  toRevision: number;
  summary: string;
  markers: string[];
  provenance: TaskContextEntry['provenance'];
  createdAt: string;
}
```

The default projection contains:

- the latest checkpoint;
- entries created after that checkpoint;
- enough recent earlier entries to return at most 12 unique index entries in total.

The projection never embeds source bodies, attachment contents, raw evidence, prompts, model reasoning, or tool responses. `hasMore` tells the agent that targeted history is available.

Workspaces without ledger entries return an empty projection and preserve the existing preflight behavior.

## MCP surface

### `tasks.context.list`

Returns bounded `TaskContextIndexEntry` records for one task.

Inputs:

- `taskId` required;
- optional `kinds`, `markers`, `search`, `fromRevision`, `toRevision`;
- `limit` defaults to 12 and is capped at 50.

### `tasks.context.get`

Returns one complete context entry and its resolvable source records. Missing or inaccessible sources remain explicit references rather than being silently omitted.

### `tasks.context.append`

Appends one immutable entry.

Requirements:

- current task `expectedRevision`;
- unique idempotency key;
- valid kind and summary; omitted revision bounds and source references default to the current task revision at the MCP adapter boundary;
- agent writes use `agent-authored` provenance;
- append does not mutate task fields or increment `__mcpRevision`.

If the task revision changed before append, return `REVISION_MISMATCH`. Replaying the same idempotency key returns the original entry.

Public MCP clients use underscore aliases (`tasks_context_list`, `tasks_context_get`, and `tasks_context_append`). Example calls:

```json
{"name":"tasks_context_list","arguments":{"taskId":"task-123","kinds":["decision"],"markers":["architecture"],"fromRevision":4,"limit":12}}
```

```json
{"name":"tasks_context_get","arguments":{"taskId":"task-123","entryId":"task-context-456"}}
```

```json
{"name":"tasks_context_append","arguments":{"taskId":"task-123","expectedRevision":7,"idempotencyKey":"handoff-7","kind":"handoff","fromRevision":6,"toRevision":7,"summary":"Implementation and focused checks are ready for review.","markers":["handoff","tests"],"changedFields":["implementation"],"sourceRefs":[{"type":"evidence","id":"test-run-789"}]}}
```

Append responses report `changed`, `idempotent`, the immutable `entry`, and `currentRevision`. Append does not advance the task revision, change task status, dispatch a watcher, or authorize execution. List responses return `entries` plus `hasMore`; exact get responses return the entry plus one `resolved` or `missing` result for every source reference.

## Trust and governance

- Context entries, summaries, comments, and markers are workspace data. They do not override system, developer, security, tool, sandbox, or current task-acceptance instructions.
- Do not persist hidden chain-of-thought. Store concise decisions, actions, outcomes, blockers, evidence, and handoff rationale only.
- Agents may append entries but may not edit or delete existing entries.
- Agent-authored entries cannot represent human confirmation or acceptance.
- A checkpoint does not change task status and is not completion evidence.
- Appending an entry or checkpoint never authorizes or triggers agent execution, watcher dispatch, or workflow continuation.
- Retrieval applies the same task access boundary before returning metadata or sources.
- Audit records contain entry identity, task identity, provenance, revision range, outcome, and actor without copying raw source bodies.

## Persistence and migration

- Ledger entries are included in workspace backup and restore and preserve unknown fields.
- Canonical ledger entries are not truncated by the 50-entry task activity/comment UI limit; MCP and UI reads remain bounded.
- Existing tasks receive no fabricated historical entries. On first checkpoint creation, Omvra may create one baseline checkpoint from the current task state and available source records, marked `system-derived` and covering only the current known revision.
- Revisions created before the ledger exists are not reconstructible unless an authoritative source record already preserves the relevant information.

## Non-goals

- Full task snapshots for every revision.
- Reconstructing arbitrary pre-ledger task state.
- Semantic embeddings or a vector database.
- Persisting complete agent conversations, prompts, tool payloads, or reasoning.
- Replacing comments, activity, evidence, Goal execution history, or optimistic revision protection.
- Automatically turning agent summaries into task requirements or acceptance decisions.

## Acceptance criteria

- A task retains its existing current-state and optimistic-revision behavior.
- Context entries are immutable, source-linked, revision-scoped, and backup-safe.
- Execution preflight returns no more than 12 index entries and no source bodies by default.
- An agent can list history by kind, marker, text, or revision range and retrieve one exact entry on demand.
- An append with a stale task revision fails without writing an entry.
- Replaying an append idempotency key does not create a duplicate.
- Agent-authored context cannot satisfy human acceptance or completion gates.
- Tasks without context entries behave exactly as they do today.
- Focused service/MCP contract tests and workspace backup tests cover the new records and projections.

## Deferred decisions

- Human pinning or confirmation of checkpoints.
- Context-ledger UI beyond a compact history index and detail view.
- External archive and retention controls for very long-lived tasks.
- Cross-task or project-level context retrieval.
- Provider-reported token savings and context-quality benchmarking.
