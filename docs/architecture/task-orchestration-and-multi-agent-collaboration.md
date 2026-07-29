# Task orchestration and multi-agent collaboration

Status: proposed architecture for human acceptance
Decision date: 2026-07-29
Projects: Omvra, Omvra Web

## Summary

Extend a task with one optional, versioned collaboration record. The record keeps one accountable orchestrator and a flat list of scoped contributions. Runtime attempts and lifecycle events are stored separately so task reads stay bounded and provider/runtime concerns do not leak into agent identity.

Legacy `assigneeId` remains supported. When collaboration exists, `collaboration.orchestratorId` is authoritative and `assigneeId` is its compatibility mirror. Contributor submission, runtime completion, and aggregate task completion remain separate events.

This architecture can ship without ACP. ACP may later attach an opaque session reference to a stable execution-attempt ID, but it cannot change accountability, evidence, revision, or acceptance rules.

## Decision scope and drivers

The first release must:

- preserve existing single-assignee tasks, reads, writes, import/export, and direct execution;
- support one accountable orchestrator and multiple non-recursive contributions;
- make assignment, handoff, acknowledgement, submission, revision, acceptance, blocking, and aggregate completion distinct;
- use stable person, contribution, attempt, and event identities;
- keep task status authoritative for aggregate state;
- expose bounded, revision-safe persistence, MCP, UI, and audit contracts;
- avoid storing provider credentials, raw prompts, raw responses, transcripts, or private evidence bodies;
- remain implementable in the existing Electron modular monolith after the prerequisite domain/protocol modularization gate.

## Verified current contracts

Verified in the 2026-07-29 checkout:

- `Task` has one optional `assigneeId`; it has no collaboration, participant, or orchestration fields.
- Tasks persist under `omvra.tasks.v1`, and `__mcpRevision` is the optimistic-concurrency token for task writes.
- Task domain behavior is reached through the workspace compatibility facade and the extracted task/person/milestone domain services. MCP remains an adapter over those contracts.
- Current task list, card, assignment, and assignee-preflight contracts resolve `assigneeId` only.
- `Person` stores identity, kind, behaviour instructions, and operational instructions; it has no delegation-eligibility field.
- Goal execution already separates execution attempts, evidence, handoffs, acceptance, and aggregate completion. Those records are useful contract precedents but are Goal-owned and must not become task collaboration state.
- MCP audit records are bounded and redacted. They currently include task, assignee, revision, execution, outcome, and timing identifiers, but no collaboration identifiers.
- The task-context ledger is a separate planned history projection. Collaboration events may be referenced by it later, but neither store owns the other.

The prerequisite `docs/architecture/domain-service-protocol-modularization-plan.md` allows this architecture and the UX contract to proceed now. Collaboration persistence and downstream implementation remain gated on that milestone's integration/QA task.

## Product and accountability model

### Roles

- **Orchestrator**: exactly one accountable person on a collaborative task. The orchestrator plans, delegates, steers, integrates, and requests aggregate review/completion.
- **Contributor**: a human or agent responsible for one explicit scope.
- **Subagent**: an agentic contributor selected through delegation and subject to delegation eligibility.
- **Human reviewer**: the person who performs human acceptance when existing task policy requires it.

Humans may contribute in v1. Only an agentic person may use the `subagent` role, and that person must be eligible for delegation. Eligibility permits selection only; it never starts a runtime, assigns work, or changes ownership.

### Aggregate ownership rules

1. Task `status` remains the aggregate state.
2. A contribution or execution attempt cannot write aggregate task status.
3. `submitted` means contributor evidence is ready for orchestrator review; it is not acceptance.
4. `accepted` means the orchestrator accepted that contribution; it is not aggregate completion.
5. Only the orchestrator may request ordinary aggregate completion or review. Existing human-review requirements remain authoritative.
6. Changing the orchestrator is a revision-protected, audited transfer. If any contribution is active, explicit human confirmation is required; no agent or runtime may transfer ownership automatically.

## Durable contract

### Task projection

```ts
type TaskContributionState =
  | 'pending'
  | 'working'
  | 'submitted'
  | 'revision-requested'
  | 'accepted'
  | 'blocked';

interface TaskContributionV1 {
  id: string;
  personId: string;
  role: 'contributor' | 'subagent';
  scope: string;
  state: TaskContributionState;
  latestAttemptId?: string;
  evidenceRefs?: string[];
  createdAt: string;
  updatedAt: string;
}

interface TaskCollaborationV1 {
  schemaVersion: 1;
  orchestratorId: string;
  contributions: TaskContributionV1[];
}

interface Task {
  assigneeId?: string;
  collaboration?: TaskCollaborationV1;
}
```

Rules:

- Absence of `collaboration` means the task is a legacy/direct-assignment task and behaves exactly as it does today.
- When `collaboration` exists, `orchestratorId` is required and `assigneeId` must equal it. Reads derive the compatibility mirror if old stored data omitted it; the next collaboration write persists both.
- `contribution.id` is stable and is not derived from `personId`, array position, child task, or runtime session.
- One person may appear only once in a task's contribution list, and the orchestrator cannot also be a contributor.
- `scope` is required plain text in v1. Child-task and Goal-node scope links are deferred; they may be added later as optional references without replacing the stable contribution ID.
- Unknown fields on versioned collaboration, contribution, attempt, and event records survive load, export/import, backup/restore, and no-op writes.

### Execution attempts

Execution attempts live separately under `omvra.taskContributionAttempts.v1` so repeated runtime activity does not inflate the task record.

```ts
type TaskContributionAttemptState =
  | 'handed-off'
  | 'acknowledged'
  | 'working'
  | 'submitted'
  | 'completed'
  | 'stopped'
  | 'failed';

interface TaskContributionAttemptV1 {
  schemaVersion: 1;
  id: string;
  taskId: string;
  contributionId: string;
  ordinal: number;
  state: TaskContributionAttemptState;
  sessionBinding?: {
    runtimeProfileId: string;
    opaqueSessionRef: string;
  };
  createdAt: string;
  updatedAt: string;
}
```

`sessionBinding` is an optional downstream ACP extension. Omvra treats `opaqueSessionRef` only as a correlation token owned by the selected runtime adapter. It is not an agent identity, credential, provider account, transcript locator, or authority signal. Missing session data leaves direct task execution unchanged.

An attempt reaching `completed` means the external process ended normally. It does not imply durable submission, accepted contribution, or completed task unless those distinct transitions have also succeeded.

### Lifecycle events

Append redacted events under `omvra.taskCollaborationEvents.v1`. Every event has a stable ID, idempotency key, task ID, base/next task revisions, actor, type, timestamp, outcome, and optional contribution/attempt IDs.

Required event types are assignment, delegation, external handoff, runtime acknowledgement, work started, submission, revision requested, accepted, blocked, unblocked, stopped, failed, orchestrator transferred, and aggregate handoff requested. Events store identifiers and transition facts only. They do not copy scope text, prompt/response bodies, transcripts, credentials, or evidence bodies.

## Lifecycle contract

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> working: acknowledged or manual start
  working --> submitted: durable submission plus evidence refs
  working --> blocked: blocker recorded
  blocked --> working: blocker resolved
  submitted --> revision-requested: orchestrator requests revision
  revision-requested --> working: new attempt acknowledged
  submitted --> accepted: orchestrator accepts evidence
  accepted --> [*]
```

- External handoff creates or updates an attempt as `handed-off`; contribution state remains `pending`.
- Runtime acknowledgement moves the attempt to `acknowledged` and may move the contribution to `working`.
- Plans and progress messages are non-authoritative. Only a revision-protected durable submission with evidence references may move a contribution to `submitted`.
- Runtime loss or closure moves the attempt to `stopped` or `failed`; it cannot submit, accept, delete, or complete work.
- The orchestrator may request revision, accept submitted evidence, or record/recover a blocker.
- Aggregate review/completion continues through existing task status and human-acceptance paths after contribution integration.

## Persistence, MCP, and write rules

- The task domain service owns collaboration validation, effective-orchestrator resolution, state transitions, and task revision changes.
- The task record owns the bounded current collaboration projection. Attempt and collaboration-event stores own append-only history.
- Every collaboration mutation requires `expectedRevision`. Retryable transition commands also require an idempotency key.
- The current store has no cross-key transaction. A domain command validates the complete change, appends one idempotent event/attempt record, then writes the task projection. Readers apply history only when its recorded next revision exists on the task. A retry or startup reconciliation completes an interrupted projection write without duplicating history.
- Reads return the versioned task projection plus bounded attempt/event summaries; exact historical records use targeted reads.
- Writes reject missing people, duplicate contributors, orchestrator/contributor conflicts, invalid roles, ineligible subagents, invalid transitions, stale revisions, and mismatched `assigneeId`/`orchestratorId`.
- Existing `tasks.assign` remains valid. On a legacy task it updates `assigneeId`. On a collaborative task it performs an orchestrator transfer and atomically mirrors both IDs, subject to the active-contribution confirmation rule.
- A focused collaboration write atomically replaces assignment/scope projection; focused transition writes change one contribution or attempt. Ordinary `tasks.update` must not bypass collaboration validation.
- Successful MCP writes return the persisted task/record and next task revision. Dotted tool names and existing compatibility aliases follow the current MCP adapter pattern.
- Task deletion removes or tombstones its contribution attempts/events through the task domain owner; adapters do not implement cascade rules.
- Backup/restore and import/export include all three versioned stores. Legacy workspaces require no bulk rewrite and receive no fabricated contributions, attempts, or history.

## UI direction

Replace the single-assignee list item with an assignment popover containing:

- one single-select **Orchestrator** control;
- a checkbox-based **Contributors** multi-select;
- selected-person chips with removal actions;
- contributor scope and state in task details;
- an explanatory **Available for subagent delegation** checkbox in agent details.

Task cards stay compact: show the effective orchestrator and a contribution count. Existing single-assignee tasks remain editable without forced migration. Detailed evidence, attempts, revisions, and blockers belong in task details, not on cards.

## Audit and trust boundary

Extend the existing bounded MCP/audit projection with collaboration event type, task ID, contribution ID, attempt ID, actor, previous/next state, task revision, outcome, failure class, and duration where applicable.

Do not persist raw prompts, responses, transcripts, provider credentials, private evidence bodies, or opaque session references in the audit log. Workspace instructions, scopes, comments, summaries, and events remain user-authored workspace data and cannot override system, developer, security, tool, sandbox, or task-acceptance rules. Agent-authored events cannot represent human confirmation or acceptance.

## Architecture options

| Option | Structure | Benefits | Costs and risks | Decision |
| --- | --- | --- | --- | --- |
| Keep `assigneeId` and encode contributors in comments/child tasks | No new task contract | Lowest immediate implementation cost | No stable contribution identity, validation, lifecycle, or reliable MCP/UI projection | Rejected |
| Put collaboration, attempts, and event history inline on `Task` | One persisted object | Simple lookup and export | Unbounded task growth, noisy revisions, runtime history coupled to ordinary task edits | Rejected |
| Optional collaboration projection on `Task`; separate versioned attempts/events | Bounded task state plus append-only correlated records | Backward compatible, stable identities, bounded reads, ACP-ready without ACP ownership leakage | Cross-store writes require idempotent commands and reconciliation | Selected |
| Reuse Goal graphs/lifecycle as the task collaboration model | Represent contributors as Goal nodes | Reuses mature execution concepts | Changes task semantics, forces Goal creation, couples task delivery to a richer workflow model | Rejected for v1 |

## Ownership and milestone handoff

| Concern | Owning task | Boundary |
| --- | --- | --- |
| Architecture and compatibility | `task-44a5c05d-1e66-448d-9e92-975b80ef90e8` | This decision, stable IDs, ownership, lifecycle semantics, migration rules |
| Product/UX acceptance | `task-709ddcca-083f-4899-9b54-e3d501ce8780` | Interaction, permissions, empty/error states, accessibility; no new data semantics |
| Persistence and MCP | `task-fab773be-3020-4c27-aa40-5cb21f22ca44` | Versioned stores, validation, migrations, write/read tools, backup/import/export |
| Delegation eligibility | `task-6e6f53df-3271-4c6b-8282-73942c6163c5` | Person-profile flag and direct-assignment compatibility; no spawning |
| Assignment UI | `task-8337cfbf-9e5e-4978-b213-250c8e68bb9c` | Existing UI primitives over the persisted contract |
| Lifecycle and handoffs | `task-bcb77498-44d3-4190-9586-5780bc0b5e99` | Transition rules, attempts, evidence, audit events, recovery; no aggregate auto-completion |
| Benchmark | `task-2a6e5ecf-bb76-4df4-8231-75ed7f45ca3f` | Controlled simple/instructed/multi-agent arms and privacy-safe measures |
| Integration QA | `task-f6e301e0-9137-4d53-8469-f52536404d18` | Legacy regression, collaboration fixtures, ACP extension compatibility, release evidence |

## Migration sequence

1. Complete the prerequisite modularization integration/QA gate.
2. Add versioned task collaboration normalization plus separate attempt/event stores behind the task domain service.
3. Preserve legacy reads and direct assignment; add collaboration MCP reads/writes and focused contract tests.
4. Add delegation eligibility and assignment UX using existing person/task primitives.
5. Add lifecycle transitions, evidence/handoff behavior, and redacted audit fields.
6. Add controlled benchmark fixtures and metrics.
7. Run reload, backup/restore, import/export, MCP, UI, lifecycle, accessibility, and legacy regression QA.

Rollback is contract-preserving: old clients continue reading `assigneeId`; new fields remain ignored but preserved. A rollback must not delete collaboration, attempt, or event records. Re-enabling the feature restores the same stable IDs and state.

## Risks and mitigations

- **Split ownership between `assigneeId` and `orchestratorId`**: one domain resolver and atomic mirroring; reject conflicting writes.
- **Premature completion**: contribution and attempt transitions cannot mutate aggregate status; test negative paths.
- **Unbounded history**: keep current projection on task and use bounded/targeted reads for append-only records.
- **Stale concurrent updates**: require task revision and idempotency protection for mutations.
- **Runtime coupling**: store only optional provider-neutral correlation; runtime profiles, auth, transport, and usage remain downstream.
- **Cross-store partial writes**: use idempotent event-first writes plus revision-correlated projection and startup/retry reconciliation; adapters never sequence domain writes independently.
- **User confusion between contributor and subagent**: role-aware UI copy and eligibility filtering; direct assignment remains distinct.

## Verification plan

- Contract fixtures: legacy task, collaborative task, malformed/duplicate identities, missing person, ineligible subagent, unknown extension fields.
- Persistence: reload, backup/restore, import/export, rollback preservation, deletion cleanup/tombstone behavior.
- Concurrency: stale revision, idempotent retry, conflicting orchestrator IDs, and crash-point reconciliation before/after each cross-store write.
- Lifecycle: handoff without acknowledgement, runtime loss, submission without evidence, revision/retry, blocker recovery, acceptance, and attempts that complete without task completion.
- MCP/audit: read/write round trips, bounded history, exact IDs, redaction, and compatibility aliases.
- UI: keyboard/focus behavior and legacy/collaborative states across task details, Kanban, Timeline, and Roadmap.
- Integration: existing direct execution and Goal lifecycle remain unchanged; absent ACP fields require no runtime/session setup.

## Benchmarking

`docs/architecture/mcp-agent-benchmark-protocol.md` remains authoritative. This milestone adds a multi-agent arm without replacing the simple-versus-instructed comparison.

Keep product/model/settings, workspace fixture, task wording, and order controlled. Primary measures are acceptance coverage, rework, duration, tool calls, token/cost data where available, scope adherence, handoff evidence, delegation quality, revision detection, integration quality, and premature-completion errors. Subjective quality remains secondary and rubric-based.

## Non-goals for the first release

- Recursive subagent trees or contribution nesting.
- Automatic spawning, runtime selection, watcher dispatch, or ACP startup from eligibility/assignment.
- Replacing task status with contributor state.
- Provider authentication, credential storage, runtime transport, or usage telemetry.
- Raw prompt, response, transcript, or private payload persistence.
- Forcing every task into collaboration or Goal execution.
- A cross-agent-product leaderboard.

## Resolved and deferred decisions

Resolved for v1:

- `collaboration.orchestratorId` is authoritative when present; `assigneeId` remains its compatibility mirror.
- Humans may contribute; only eligible agentic people may be subagents.
- Contribution scope is required plain text.
- Contribution and execution-attempt IDs are stable and independent of people, array order, and runtime sessions.
- Orchestrator transfer with active work requires explicit human confirmation.
- ACP is an optional downstream session binding, not a collaboration dependency.

Deferred:

- Child-task or Goal-node scope references beyond optional future extension fields.
- Recursive delegation and multiple orchestrator layers.
- Cross-task contributor capacity planning.
- Provider-specific session controls, transcript retrieval, usage accounting, and remote runtime transport.
