# Task orchestration and multi-agent collaboration

## Purpose

Extend Omvra tasks from single-assignee work items into accountable, inspectable collaboration units. A task may have one orchestrator and several scoped contributors, including subagents, while preserving a clear owner for coordination and final handoff.

This document defines the first implementation boundary. It does not make every task a multi-agent workflow and does not introduce recursive delegation until the flat model is proven useful.

## Product model

### Roles

- **Orchestrator**: one agent responsible for planning, delegation, steering, integration, and the overall task handoff.
- **Contributor**: zero or more humans, agents, or subagents responsible for a scoped piece of work.
- **Human reviewer**: the person who accepts the final result when the task requires human review.

The orchestrator owns the task outcome. Contributors can complete their assigned scope, submit evidence, and request revision, but they do not independently complete the overall task.

### Assignment contract

The existing single-assignee field remains readable for compatibility. New task execution metadata should distinguish accountability from participation:

```ts
orchestratorId?: string;
participants?: Array<{
  personId: string;
  role: 'contributor' | 'subagent';
  scope?: string;
  status?: 'pending' | 'working' | 'submitted' | 'revision-requested' | 'accepted' | 'blocked';
}>;
```

The exact persisted shape is an implementation decision, but it must preserve stable person IDs, scoped instructions, lifecycle state, and backward compatibility with existing `assigneeId` data.

### Agent eligibility

An agent profile may be marked **Available for subagent delegation**. This controls whether the agent can be selected as a delegated worker; it does not automatically spawn the agent and does not change direct task assignment.

An unchecked agent may still be assigned directly as an orchestrator or ordinary task assignee.

### Agent identity and execution runtime

An Omvra agent profile defines accountable identity, persona, instructions, assignment, and delegation eligibility. It is not the installed runtime that executes the work. Codex, Claude Code, Kimi, or another verified ACP adapter is selected separately as an **agent runtime**.

The runtime resolves from an explicit task or Goal-node choice, then a project default, then the Omvra global default. The resolved runtime must be visible before execution and must not silently change when unavailable. Authentication and provider billing remain owned by the selected runtime; Omvra stores no provider credentials.

A user-initiated external handoff may open the task in the selected runtime without creating an ACP session. A handoff records intent only and cannot move contributor or aggregate task state. Structured execution begins only when a runtime session or existing lifecycle acknowledgement is durably correlated with the contribution or execution attempt.

## Lifecycle

1. A task receives an orchestrator and optional contributors.
2. The orchestrator creates or accepts scoped contributor work.
3. Contributors move through pending, working, submitted, revision-requested, accepted, or blocked states.
4. The orchestrator reviews contributor evidence, steers or revises work, and integrates accepted results.
5. The orchestrator submits the overall task for human review or completes it according to the existing task workflow.

The system must not treat contributor submission as overall task completion. A blocked contributor should produce an explicit orchestration state and next action rather than silently disappearing from the task.

## UI direction

Replace the task assignment list item with an assignment popover containing:

- one single-select **Orchestrator** control;
- a checkbox-based **Contributors** multi-select;
- selected-person chips with removal actions;
- contributor scope/status when delegation exists;
- an explanatory **Available for subagent delegation** checkbox in the agent details popover.

Task cards should keep the compact surface: show the orchestrator identity and a participant count when collaboration exists. Detailed scopes, lifecycle state, evidence, and revision requests belong in task details.

## Architecture boundaries

- Task persistence owns the durable orchestrator and participant references.
- MCP task reads and writes expose the collaboration metadata through versioned contracts.
- Orchestration owns delegation, supervision, contributor state, integration, and final handoff.
- Agent profiles own delegation eligibility; eligibility is not execution.
- Runtime settings own the exact executable or adapter and deterministic global/project/task selection; agent profiles remain provider-neutral identities.
- Missing or incompatible runtimes fail explicitly. Omvra does not silently substitute another runtime or manage its provider credentials.
- Existing task status remains the aggregate task state and must not be inferred from one contributor status.
- Audit records should identify assignment, delegation, submission, revision, acceptance, and blocking events without persisting raw prompt or response payloads.

## Benchmarking

The existing `docs/architecture/mcp-agent-benchmark-protocol.md` remains the benchmark source of truth. This milestone adds a multi-agent arm rather than replacing the simple-versus-instructed comparison.

Primary comparison:

- same agent product, model/settings, workspace fixture, task family, and task wording;
- simple agent instructions versus instructed agent instructions;
- objective measures: acceptance coverage, rework, duration, tool calls, token/cost data where available, scope adherence, and handoff evidence;
- subjective quality ratings remain secondary and must use a consistent rubric.

The multi-agent arm should separately measure delegation quality: useful scope definition, supervision, revision detection, integration quality, and whether the orchestrator correctly prevents premature completion.

## Delivery sequence

1. Agree the role, assignment, lifecycle, and compatibility model.
2. Define product acceptance and assignment interaction contracts.
3. Add persistence and MCP contracts.
4. Add agent delegation eligibility and assignment UI.
5. Add orchestration lifecycle and evidence/handoff behavior.
6. Add benchmark instrumentation/fixtures for simple, instructed, and multi-agent arms.
7. Run integration and regression QA.

## Non-goals for the first release

- Recursive subagent trees.
- Automatic spawning based only on profile eligibility.
- Replacing existing task status with a second independent status system.
- A cross-agent-product leaderboard.
- Raw prompt, response, or private payload persistence for benchmarking.

## Acceptance criteria

- A task can retain one accountable orchestrator and multiple scoped contributors.
- Existing single-assignee tasks continue to load and behave correctly.
- Agent profiles expose and persist subagent-delegation eligibility.
- Agent identity remains separate from execution runtime, with a visible deterministic runtime resolution and no silent provider failover.
- External handoff, runtime acknowledgement, contributor submission, and task completion remain distinct lifecycle events.
- Assignment UI supports one orchestrator and multiple contributors with accessible controls.
- Contributor lifecycle states are visible and do not masquerade as aggregate task completion.
- The orchestrator can review, steer, accept, or request revision for contributor work.
- Overall completion remains owned by the orchestrator or required human reviewer.
- MCP and audit surfaces expose collaboration state without raw payload persistence.
- Benchmark documentation distinguishes simple, instructed, and multi-agent arms with objective evidence.
- Focused contract tests, renderer build, and documented integration QA pass.

## Open decisions

- Whether humans can be contributors in the first release or only agents/subagents.
- Whether `assigneeId` becomes an alias for `orchestratorId` permanently or only during migration.
- Whether contributor scope is plain text initially or a link to a child task/goal node.
- Whether an orchestrator may be changed while contributor work is active.
