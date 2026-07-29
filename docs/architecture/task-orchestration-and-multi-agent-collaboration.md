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
- **Contributor**: an agent responsible for one explicit delegated scope under the orchestrator.
- **Subagent**: an agentic contributor selected through delegation and subject to delegation eligibility.
- **Human reviewer**: the person who performs human acceptance when existing task policy requires it.

Humans may be direct assignees, orchestrators, and reviewers, but they cannot be contributors. Every contributor is an agentic person using the `subagent` role and must be eligible for delegation. Eligibility permits selection only; it never starts a runtime, assigns work, or changes ownership.

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
- New contributions must reference an agentic person who is available for subagent delegation and persist with role `subagent`. The `contributor` role is retained only for backward-compatible reads of earlier drafts.
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
  sessionBindingId?: string;
  createdAt: string;
  updatedAt: string;
}
```

`sessionBindingId` is an optional downstream ACP extension defined by [`acp-runtime-session-lifecycle-contract.md`](./acp-runtime-session-lifecycle-contract.md). Runtime profile data and the runtime-owned opaque session reference live in that separate versioned binding record, never on the task or collaboration projection. Missing session data leaves direct task execution unchanged.

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
- Writes reject missing people, human contributors, duplicate contributors, orchestrator/contributor conflicts, invalid roles, ineligible subagents, invalid transitions, stale revisions, and mismatched `assigneeId`/`orchestratorId`.
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

## Product UX and acceptance contract

Status: proposed for human acceptance alongside the architecture decision.

### Outcome and existing surface anchors

The smallest useful release extends existing task and agent editing surfaces:

- `TaskDialog` replaces its single **Assignee** select with one **Assignment** popover.
- `TaskDetailsDialog` adds a **Collaboration** section and derives aggregate-review availability from contribution state.
- `TaskCard` adds one compact ownership row; it does not become a lifecycle inspector.
- `PeopleSettingsSections` adds delegation eligibility to the existing agent add/edit content.
- Existing task footer, status, person, checkbox, select, popover, chip/badge, and confirmation primitives remain the interaction foundation.

No collaboration-only page, wizard, second task editor, or recursive agent browser is required.

### Assignment trigger and summary

The task form shows one field labeled **Assignment**. Its button opens the popover and summarizes the current draft:

- **Unassigned** when no accountable person exists;
- the effective orchestrator name for direct assignment or collaboration with no contributors;
- `<orchestrator name> + <count>` when contributions exist, with an accessible label such as “Pericles, orchestrator, plus 2 contributors.”

Opening the popover copies the current parent-form assignment into a local draft. **Apply** validates the draft and returns it to the parent task form; the task form's existing **Save** action persists it with the rest of the task. **Cancel**, Escape, or outside dismissal discards changes made since the popover opened. A standalone use from task details may persist on **Apply**, but it must call the same validated collaboration write and use the current task revision.

### Popover content and selection rules

The popover contains:

1. **Orchestrator** — a single-select list of all people plus **Unassigned**.
2. **Contributors** — a checkbox list of agents eligible for delegated selection.
3. **Selected contributors** — chips/rows with person name, type, removal action, resolved scope, and persisted lifecycle-state badge when one exists. The agent role supplies scope by default; an input is shown only when the role provides no usable scope.
4. Inline validation and **Cancel** / **Apply** actions.

Rules:

- Any human or agent may be selected as orchestrator. Delegation eligibility does not restrict direct assignment.
- Only eligible agents may be selected as contributors, and they persist as role `subagent`. Humans may be direct assignees or reviewers but never contributors.
- The orchestrator is excluded from the contributor checklist. Duplicate people are never added.
- Every selected contributor requires a non-whitespace scope before **Apply** is enabled. The agent's role supplies it automatically when present; otherwise the user enters a task-specific scope.
- Adding the first contributor requires an orchestrator. **Unassigned** is disabled while any contributor is selected.
- A newly added contribution starts as `pending`; the assignment popover cannot choose or change lifecycle state.
- With no contributors, saving preserves the legacy/direct-assignment shape and writes only `assigneeId`. Merely opening or saving the field does not force a collaboration migration.
- With contributors, **Apply** produces exactly the architecture-defined `collaboration` projection and mirrored `assigneeId`; UI-only labels, avatars, and list order are not persisted as new contract fields.

### Direct assignment and delegated participation

Direct assignment means selecting a person as the accountable owner with no contributions. The person appears through the legacy `assigneeId` contract and existing direct execution remains available.

Delegated participation means selecting one or more contributors under an orchestrator. Selection records responsibility and scope only. It does not start a runtime, create an execution attempt, dispatch a watcher, change task status, or represent acceptance.

The UI uses **Orchestrator** and **Contributors** consistently. It may describe an eligible agent as a subagent in supporting copy, but it must not call every assignee a subagent or imply that a checkbox creates a runtime session.

### Removal and ownership transfer

- An unsaved selection or persisted `pending` contribution may be removed through the assignment popover.
- A contribution that has reached `working`, `submitted`, `revision-requested`, `accepted`, or `blocked` cannot be removed from this popover. The control is disabled with guidance to resolve it in **Collaboration**; history is never silently discarded.
- Selecting an existing contributor as orchestrator is blocked until that pending contribution is removed. Active contribution conflicts require lifecycle resolution rather than automatic reassignment.
- Unassigning the orchestrator is allowed only when no contributions exist.
- Changing the orchestrator with no active contributions uses the ordinary revision-protected save. When any contribution is active, the final save requires the architecture-defined human confirmation and names the old/new orchestrators and affected contributions.
- A missing person reference remains visible as **Unavailable person** with its stable record context. Saving cannot silently drop or reassign it.

### Delegation eligibility in agent details

Agent add/edit content includes one native checkbox labeled **Available for subagent delegation** with this explanatory text:

> Allows this agent to be selected for delegated task work. It does not assign work or start the agent.

Behavior:

- Existing or imported agent profiles without the field default to unchecked.
- The control is shown only for agentic people. Humans are never offered in the contributor selector.
- Unchecked agents remain selectable as orchestrators and direct assignees but are excluded from new subagent selection.
- Turning eligibility off does not remove, stop, reassign, or complete existing contributions. Existing references remain visible with an **Unavailable for new delegation** warning.
- Changing an agent with active subagent references into a human is blocked until those references are resolved; the form explains the impacted tasks instead of clearing them.
- Changing eligibility alone never starts ACP, selects a provider/runtime, or dispatches a watcher.

### Task cards, filters, and People mode

- Compact task cards show the effective orchestrator avatar/name and a `+N` contribution badge when `N > 0`.
- The badge accessible label announces the full count. It does not encode contributor state by color alone.
- Cards do not show scopes, attempt state, evidence, blockers, or runtime/session data.
- Timeline **People** mode and existing assignee filters continue to group/filter by the effective orchestrator only. Contributors do not duplicate a task into several lanes.
- Existing clipboard/PDF **Assignee** values resolve to the effective orchestrator. Detailed collaboration export is deferred from v1.

### Task details and lifecycle behavior

Task details add **Collaboration** after **Basic Information** when collaboration exists. It shows:

- orchestrator identity and role;
- each contributor's identity, subagent type, scope, explicit text state, evidence count, and latest attempt summary when present;
- empty copy when an orchestrator has no contributors;
- state-appropriate actions for the current orchestrator, such as accept submitted work, request revision, and inspect or recover blocked work.

Lifecycle actions use the focused domain transitions; editing task metadata cannot imitate them. Plans, progress text, external handoff, runtime acknowledgement, attempt completion, and contributor submission remain visibly distinct.

For a collaborative task, aggregate **Move to review** is available only when every contribution is `accepted`. If any contribution is pending, working, submitted, revision-requested, or blocked, the action remains disabled and the UI lists the blocking people/states. Satisfying the contribution gate never invokes the action automatically. Tasks without collaboration retain current review behavior.

Human review remains separate: agent-authored submission or acceptance cannot represent human approval, and no collaboration action moves a task to **Done** without the existing required review path.

### Empty, loading, conflict, and failure states

- **No people**: show “Add a person or agent before assigning this task” and a route to existing People settings; do not render an empty selector.
- **No eligible agents**: show a contributor-specific empty state with explanatory copy and a route to Agent settings. Humans remain valid direct assignees but cannot be task contributors.
- **Loading**: keep the trigger and actions disabled with a named loading state; do not flash **Unassigned** over a persisted value.
- **Invalid draft**: show field-level messages for missing orchestrator, missing scope, duplicate/self-conflict, unavailable person, and ineligible subagent; preserve all selections.
- **Revision conflict**: keep the draft visible, report that the task changed, and offer **Reload assignment**. Never overwrite newer persisted state.
- **Write failure**: keep the task form open with its draft and an actionable retry message. Do not close on a failed save.
- **Read-only**: render the same ownership and contribution information without checkboxes, removal buttons, or lifecycle actions.

### Permissions and trust boundary

Existing task-edit permission remains the outer UI gate. Collaboration validation and transition authority are enforced again by the task domain service; hiding a button is not authorization.

- Task editors may prepare assignment drafts.
- The current orchestrator may perform contributor review/steering transitions allowed by state.
- A contributor cannot accept its own submission or request aggregate completion through contributor controls.
- Human confirmation and human acceptance can only be recorded by the existing trusted human path.
- Runtime/provider availability never grants task-edit, transition, or review authority.

### Accessibility contract

- The Assignment trigger is a named button with expanded state and a concise summary.
- **Orchestrator** is a labeled single-select. **Contributors** is a fieldset/group with individually named native checkboxes.
- Space toggles a focused checkbox; Arrow keys follow the existing select/list behavior; Tab order follows orchestrator, contributors, selected scopes/removal, validation, then actions.
- Escape closes and discards the popover draft, then returns focus to the trigger.
- Every chip removal button names the person, for example “Remove Edgar from contributors.”
- Validation is associated with the relevant control and announced through the existing live-region/error pattern.
- State and eligibility use text in addition to color/icon treatment. Disabled actions expose a visible reason.
- The popover and selected rows remain usable at the existing task-dialog mobile width without horizontal scrolling.

### Observable acceptance criteria

1. **Legacy preservation** — Given a task with only `assigneeId`, when it is opened and saved without contributors, then the same assignee remains and no collaboration record is created.
2. **Collaborative assignment** — Given an orchestrator and valid scoped contributors, when the user applies and saves, then one orchestrator, mirrored `assigneeId`, stable contributions, roles, scopes, and `pending` states survive reload.
3. **Required ownership** — Given at least one selected contributor, when no orchestrator is selected, then **Apply** is disabled and the missing-orchestrator error is announced.
4. **Required scope** — Given a selected contributor whose agent role and task-specific scope are both blank, when validation runs, then **Apply** is disabled and focus can reach the contributor's scope error.
5. **Direct versus delegated agent** — Given an unchecked agent, when assignment opens, then that agent is available as orchestrator/direct assignee but not as a new subagent.
6. **Eligibility has no side effect** — Given an agent whose eligibility changes, when the profile is saved, then no task, status, attempt, runtime, provider, or watcher state changes automatically.
7. **Conflict prevention** — Given the same person is selected as orchestrator and contributor, when the user applies, then the draft is rejected without changing persisted assignment.
8. **Safe removal** — Given a `pending` contribution, when an authorized editor removes and saves it, then it leaves the current projection; a non-pending contribution cannot be removed through assignment editing.
9. **Revision safety** — Given another write changes the task after the popover opens, when the stale draft saves, then it fails visibly and newer state remains unchanged.
10. **Compact cards** — Given a collaborative task, when it renders on Kanban or Timeline surfaces, then it appears once under the effective orchestrator and shows the correct `+N` count without scopes or lifecycle detail.
11. **Lifecycle separation** — Given an attempt is handed off, acknowledged, stopped, failed, or completed, when task details refresh, then those facts do not appear as contribution acceptance or aggregate completion.
12. **Submission separation** — Given a contributor submits evidence, when the contribution becomes `submitted`, then task status does not change and only the orchestrator review actions become available.
13. **Aggregate gate** — Given any contribution is not `accepted`, when aggregate review is considered, then **Move to review** is disabled with the blocking states; accepting the last contribution does not invoke review automatically.
14. **Human acceptance** — Given all contributions are accepted and the orchestrator requests review, when an agent-authored action completes, then the task awaits the existing required human acceptance and is not marked **Done**.
15. **Missing references** — Given a referenced person is unavailable, when assignment/details render, then the reference remains visible and no save silently drops or replaces it.
16. **Keyboard operation** — Given keyboard-only use, when the user opens, changes, validates, cancels, and reopens assignment, then focus order, announcements, discard behavior, and focus return match the accessibility contract.

### Negative acceptance criteria

- Assignment never creates recursive contributor trees, child tasks, Goal nodes, or runtime sessions.
- Eligibility never implies ownership, dispatch, availability, or successful execution.
- A contributor or runtime cannot mutate aggregate task status through contribution controls.
- No person is duplicated or stored as both orchestrator and contributor.
- No active contribution is silently removed because a person, kind, or eligibility setting changed.
- No raw prompt, response, transcript, credential, evidence body, or opaque session reference appears in assignment UI or general task cards.
- No save, dismissal, revision conflict, or write failure silently loses the user's draft.

### Definition of done for downstream implementation

- The persisted/API contract is accepted or this UX contract is reconciled with any approved architecture changes before implementation merges.
- Task and person forms use existing shared controls and one validated domain write path; no duplicate assignment model exists in renderer state.
- Positive and negative criteria above have focused automated coverage at the domain/MCP boundary and the smallest supported interaction coverage in the renderer.
- Legacy task, missing-person, no-eligible-agent, stale-revision, active-transfer, and all contributor-state fixtures are covered.
- Keyboard, focus return, labels, error announcements, disabled reasons, and narrow-width layout are manually verified.
- Kanban, Timeline People mode, task details, task form, agent settings, reload, import/export, and backup/restore agree on effective ownership.
- Audit output contains bounded identifiers and transition facts only; privacy-negative checks pass.
- Renderer build, focused workspace/MCP tests, and `git diff --check` pass, with any unrelated failure recorded separately.
- A human reviewer accepts the architecture/UX contract before downstream implementation is considered complete.

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

`docs/architecture/mcp-agent-benchmark-protocol.md` remains authoritative. Its controlled arms are **simple**, **instructed**, and **multi-agent**. Simple-versus-instructed measures instruction uplift; instructed-versus-multi-agent measures orchestration uplift. The multi-agent arm uses one orchestrator and a flat list of eligible agentic subagents, each with a declared (or role-derived) scope, lifecycle handoff, evidence, review, and integration step. Humans may review or directly own a task but are never contributors.

Keep product/model/settings, workspace fixture, task wording, and order controlled. Primary measures are acceptance coverage, rework, duration, tool calls, token/cost data where available, scope adherence, handoff evidence, delegation quality, revision detection, integration quality, and premature-completion errors. Subjective quality remains secondary and rubric-based. Benchmark manifests stay metadata-only and never persist prompts, responses, transcripts, or sensitive payloads.

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
- Humans may be direct assignees, orchestrators, and reviewers, but only eligible agentic people may contribute as subagents.
- Contribution scope is required plain text and defaults to the agent role when available.
- Contribution and execution-attempt IDs are stable and independent of people, array order, and runtime sessions.
- Orchestrator transfer with active work requires explicit human confirmation.
- ACP is an optional downstream session binding, not a collaboration dependency.

Deferred:

- Child-task or Goal-node scope references beyond optional future extension fields.
- Recursive delegation and multiple orchestrator layers.
- Cross-task contributor capacity planning.
- Provider-specific session controls, transcript retrieval, usage accounting, and remote runtime transport.
