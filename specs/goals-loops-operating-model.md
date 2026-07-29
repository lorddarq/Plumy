# Goals / Loops operating model

Status: shaping

This document defines the current operating model for Goals / Loops. It is the product contract to refine before implementation work is considered complete.

## Purpose

Goals / Loops is a durable planning-and-orchestration surface exposed through MCP. It is not only a visual workflow diagram and not only a planning document. A goal describes an intended outcome, the work required to reach it, the agents or personas responsible for that work, and the boundaries that govern execution.

Omvra is the durable system of record. The orchestrator is the overseer: it reads the goal, decomposes and delegates work, records evidence and decisions, and advances the workflow when its configured gates are satisfied.

## Agreed Goals / Loops workspace-shell decisions

The workspace shell uses a dedicated `GoalsService` boundary backed by Electron-store. `workspaceStore` owns UI-only state and preferences; it is not a competing workspace authority. The renderer and MCP use the canonical Goals service boundary for Goal graph and execution data.

MCP-originated Goal writes publish an Electron IPC invalidation event. The renderer then reloads the canonical Goals read model rather than merging the remote change into stale local state. Revision-checked writes provide conflict detection; stale renderer edits must be rejected or reconciled instead of overwriting newer MCP changes.

Execution state is overseer-managed and separate from editable Goal graph definitions:

- Active nodes are not ordinary canvas-editable objects. A running node shows a progress overlay and spinner; completed execution history remains immutable, but the Goal graph itself is reusable.
- While active, a node's structure, assigned agent, inputs, conditions, upstream dependencies, accepted evidence, and committed execution data are locked.
- Unlocking active work requires pause, cancellation, rollback, or a lifecycle amendment. Completion unlocks the Goal for future runs.
- Downstream nodes that have not started remain editable. Safe future edits, such as renaming, future instructions, future assignment, adding future nodes, and layout changes, apply to the future plan.
- Future edits that affect the contract, such as evidence requirements, conditions consuming active output, handoff requirements, or future budgets, require explicit **Apply workflow change** confirmation and overseer recalculation.
- Unsafe active edits, including changing a running agent, deleting the current subgoal, changing active inputs, editing evaluated conditions, editing accepted evidence, or rewiring upstream dependencies, are never ordinary canvas edits.

The first slice preserves missing dependency and persona references. A missing agent remains traceable as a degraded reference rather than being silently reassigned or deleted from workflow data. Available agent UI metadata may provide role context, but missing skills and instructions are shown explicitly and are not implied. Deleting an available agent requires confirmation that explains which workflows reference the agent and what degraded behavior will result.

Agent nodes are executable delegation points. They carry task-specific instructions independently from the selected agent's persona and operational profile. The agent-node inspector exposes an `existing` or `ephemeral` mode, canonical agent selection for existing agents, requested capability/name/type for ephemeral recruitment, task-specific instructions, an explicit `workAsSubagent` toggle, and an explicit `spawnIfUnavailable` fallback. The toggle is the only signal that turns an agent node into a worker-owned subagent request.

When configured for an existing agent, the overseer resolves the canonical person and combines that person's behavior/persona guidance and operational instructions with the node's task-specific instructions. When configured for an ephemeral agent, the overseer must not attach a persona profile or invent behavior/operational instructions; it passes the requested capability and node instructions to the working agent. If `workAsSubagent` is enabled, the working agent owns subagent creation and management through its available runtime and must report a typed blocked result if that runtime cannot create a requested subagent. Omvra does not spawn subagents. If a requested existing agent cannot be resolved and fallback is enabled, the working agent may create a temporary subagent rather than silently assigning a different canonical person.

Templates must not use agent-node bodies as a substitute for dispatch instructions or hard-code canonical assignee IDs that may not exist in another workspace. `instructions` nodes remain separate shared/scoped guidance and do not replace the agent node's delegation contract.

## Confirmed execution flow

When a user asks an orchestrator to execute a goal by ID:

1. The orchestrator connects to Omvra through MCP and retrieves the goal, subgoals, typed connectors, instructions, conditions, approval gates, agent references, handoffs, permissions, interdictions, and current state.
2. It validates that the goal is executable: the graph is structurally valid, required agents and personas are available, contracts are complete, and no required approval is missing.
3. It maps each subgoal to an existing canonical agent/persona. It may recruit or create an agent only when no suitable existing agent is available and the goal policy permits it.
4. It uses the project-management capabilities to materialize tracked tasks, todos, milestones, and sequence dependencies for the subgoals.
5. It issues a versioned contract packet to the agent responsible for the first eligible subgoal.
6. The agent acknowledges the contract revision/hash through MCP before work begins.
7. The orchestrator monitors the subgoal state, evidence, conditions, and handoff. It may delegate, wake, query, dismiss, sleep, request rework, pause, or escalate according to the goal policy and the competency/instruction fit of the destination agent.
8. Once the subgoal's completion evidence and handoff satisfy the configured acceptance boundary, the orchestrator records completion and activates the next eligible subgoal.
9. The cycle continues until the goal reaches human acceptance, completion, failure, or an explicitly blocked state.

The graph's spatial arrangement should communicate the user's intended workflow. Execution meaning must remain explicit in typed connectors and scoped relationships; coordinates must never be the sole source of ordering or authority.

## Resolved control-flow node contract

Goals / Loops includes executable control-flow nodes in addition to agent work and planning nodes. The first two are `human-input` and `retry`. They are visible on the canvas, persisted in Goal graphs, exposed through MCP, represented in inspectors and execution logs, and interpreted by the overseer/lifecycle layer.

The canvas toolbar exposes them through an extensible **Control flow** selector, parallel to the agent selector. Only `human-input` and `retry` are in the initial implementation slice.

### `human-input`

`human-input` is an overseer-mediated pause primitive. The overseer prompts the user when execution reaches the node; the workflow becomes paused/blocked; the first version collects free text; and the durable response becomes reusable Goal execution context. Execution resumes only after the response is persisted. A new response appends to prior context rather than replacing it.

### `retry`

`retry` is a control-flow command that re-enters an earlier completed node. A regular persisted connector configures the target relationship and remains its source of truth. The lifecycle interprets that connector as a return route because its source is a `retry` node. Retry has a dedicated `maxAttempts` or `maxRetries` value scoped to the current execution, preserves previous findings/evidence/context, and renders its return path distinctly from ordinary dependencies.

When the limit is reached, the node follows an explicit exhaustion policy: `human-review` pauses and asks whether to continue or fail, while `fail-goal` marks the Goal execution failed.

Normal connectors remain DAG dependencies. Retry return routes are validated by control-flow rules rather than weakening ordinary cycle protection. The renderer edits and visualizes the graph; lifecycle/orchestration owns pause, resume, retry counting, context accumulation, exhaustion, and execution events. MCP read models expose the semantic node fields and retry target rather than flattening these nodes into generic sequences.

The initial workflow shape is:

```text
Research competitors → Compare findings → Enough coverage?
                                      ├─ yes → Synthesize recommendation
                                      └─ no  → Ask for more competitors
                                                    ↓
                                              Retry research ──↺ Research competitors
```

## Agreed scheduled Goal execution contract

Scheduled Goal execution is a governed lifecycle capability. It is not an arbitrary canvas-side cron runner and must not bypass the GoalLifecycleService, contract validation, evidence, acceptance, budget, or audit boundaries.

The following behavior is agreed:

- Schedules use the local computer timezone as their initial timezone authority. Detailed timezone and DST behavior remains an implementation decision.
- Each scheduled occurrence is a new execution attempt/job. A failed or blocked occurrence does not fail the parent Goal or future occurrences.
- Every occurrence stores an immutable `scheduledFor`/run anchor so retries preserve the original occurrence context.
- Historical-data jobs use anchored semantics by default: retries query the original requested data window rather than silently moving the window forward.
- Jobs that explicitly opt into `latest` semantics may rebase to current data when retried.
- If MCP or the assigned agentic connection is unavailable, the occurrence is blocked rather than treated as successful or as a parent-Goal failure.
- An occurrence may retry until the next scheduled occurrence. After that boundary it is recorded as `missed` or `expired`, and the next occurrence remains independent.
- Schedule edits are safe outside an active execution window. In-progress work remains locked; future scheduled work may be edited subject to the contract-impact rules.

Schedules are stored as separate durable `omvra.goalSchedules.v1` records in a one-to-many relationship with Goals. Each record uses typed weekly, monthly, or one-time rule fields and explicitly stores enabled state, start/end boundaries, projectless scope, and the IANA timezone captured from the local computer when the schedule is created. The captured timezone remains authoritative if the user later travels; its IANA rules govern DST behavior.

Users manage schedules. Edits outside an active execution window apply immediately. In-progress execution remains locked. Contract-impacting edits require explicit **Apply workflow change** confirmation and overseer recalculation.

The Goal UI must provide a dedicated scheduling area during Goal setup and in the Goal inspector. It must clearly distinguish one-time and recurring Goals and expose the applicable rule, captured timezone, enabled state, start/end boundaries, and schedule status. Scheduling controls are not hidden inside general canvas layout controls.

These choices are agreed. Implementation remains separately tracked from the workspace shell and must preserve the lifecycle, temporal-mode, retry, and missed/expired behavior above.

### Scheduled occurrence resilience decision

The scheduler owns a small occurrence-level retry envelope around the existing lifecycle boundary. It does not create a second workflow runtime.

| Option | Benefit | Cost or risk | Decision |
| --- | --- | --- | --- |
| Retry the same durable occurrence and lifecycle `commandId` | Idempotent, restart-safe, and keeps schedule failures separate from Goal rework | Requires a durable scheduler checkpoint and typed occurrence outcomes | Selected |
| Consume the Goal lifecycle retry budget | Reuses an existing budget | Conflates transport recovery with accepted workflow rework and can alter the Goal contract | Rejected |
| Add an external queue/background service | Can execute while the desktop app is closed | Adds deployment and reconciliation ownership without a demonstrated need | Deferred |

The selected behavior is:

- The occurrence is persisted before lifecycle start. Connection failures can therefore retry the same occurrence and deterministic `schedule:{scheduleId}:{scheduledFor}` command without duplicating an execution.
- Transport or assigned-agent availability failures are retryable. Each occurrence has three scheduler-owned start attempts; these attempts do not consume the Goal loop or rework budget because they repeat one idempotent lifecycle command.
- A recurring occurrence remains blocked after its attempt budget is exhausted and becomes `missed` when the next occurrence boundary arrives. A one-time occurrence becomes `expired` when its attempt budget is exhausted. Non-transient lifecycle rejections remain `blocked` for inspection rather than being retried blindly.
- The scheduler stores its last successful evaluation time. On restart it reconciles every due anchor since that checkpoint: older anchors are durably `missed`, while only the newest eligible occurrence starts. The captured IANA timezone continues to define calendar dates and DST behavior.
- Every occurrence keeps its immutable `scheduledFor` and temporal mode. A later occurrence receives a distinct occurrence id and lifecycle command, so one missed or blocked run cannot consume it.
- Occurrence state, attempt count, failure code, and timestamps are exposed in the renderer runtime projection, Goal MCP read model, and typed runtime audit events.

This design recovers missed work when Omvra restarts; it does not claim to execute while the desktop app is closed. A continuously available external adapter remains optional if that operating requirement appears.

## Durable state and contracts

The following must survive application restarts and workspace backup/restore:

- goal and subgoal definitions;
- node positions and typed connectors;
- overseer assignment and canonical agent references;
- instructions and their scope;
- conditions, approval gates, permissions, and interdictions;
- generated contract packets and their revisions/hashes;
- agent acknowledgements;
- task, todo, milestone, and dependency projections;
- execution state, attempts, evidence, handoffs, decisions, and audit history.

Instructions are authoritative only when explicitly scoped and included in the generated contract packet. An agent must acknowledge the packet revision before work begins. A contract change invalidates affected acknowledgements, pauses affected work, preserves existing evidence, and requires overseer reconciliation before execution resumes.

### Proposed minimum contract packet

The following is the minimum proposed packet sent to a worker agent. It is intentionally a reference-rich contract: large instructions and evidence should remain in Omvra and be addressed by stable ids or URIs rather than copied into every dispatch.

| Field | Purpose |
| --- | --- |
| `goalId`, `goalRevision` | Identify the governing goal version |
| `executionAttemptId`, `subgoalId` | Identify the current run and work unit |
| `contractId`, `contractRevision`, `contractHash` | Bind work and acknowledgement to one immutable packet |
| `agentId`, `personaId`, `overseerId` | Identify the worker, competency, and coordinator |
| `objective` and `scope` | State the outcome and boundaries of the assignment |
| `inputs` and `instructionRefs` | Identify required source material and explicitly scoped instructions |
| `outputs` and `deliverables` | Define what the worker must produce |
| `constraints`, `permissions`, and `interdictions` | Define what the worker may and may not do |
| `acceptanceCriteria` and `evidenceRequirements` | Define how completion is evaluated |
| `handoff` | Define recipient, format, context, and stop condition for transfer |
| `sequencePredecessors` and `nextEligibleStates` | Define dependency and activation boundaries |
| `allocatedAutonomyBudget` | Bound retries, loops, and resource consumption for this work unit |
| `contextRefs` | Point to the current `project.md`, `roster.md`, task, and relevant evidence |

The minimum acknowledgement is sent by the worker agent and means only: “I received and parsed this exact contract revision.” It should include `agentId`, `executionAttemptId`, `contractId`, `contractRevision`, `contractHash`, `receivedAt`, and an explicit `acknowledged` or `rejected` result. A rejection must include a reason or missing-information list.

Acknowledgement does not mean that the worker accepts authority to redefine the goal, alter the workflow, waive an interdiction, or declare the contract safe to execute. Execution eligibility is a separate overseer-controlled decision. The lifecycle is:

`dispatched` → `received` → `acknowledged` → `worker assessed` → `overseer validated` → `eligible to work`

After acknowledgement, the worker may submit a separate typed assessment: `ready`, `needs-clarification`, `needs-rescope`, or `blocked`. If it detects a conflict, missing input, infeasible instruction, or risk to the stated objective, it should acknowledge receipt and report the issue rather than silently adapting the work.

The overseer evaluates any proposed rescope against the goal, subgoal, acceptance gate, permissions, interdictions, dependencies, and remaining budget. A non-breaking rescope may be authorized automatically when the applicable policy permits it and sufficient budget is available. A breaking change, unavailable budget, or policy conflict enters the impact and estimation gate. Any authorized semantic change creates a new contract revision and requires the worker to acknowledge the revised packet before continuing. The worker cannot unilaterally modify the contract or sequence.

### Negotiated rescoping

`needs-rescope` is a request to investigate, not permission to change execution. The overseer should negotiate with the worker and, when relevant, the user to understand the underlying business need before accepting a proposed change.

The negotiation record should capture typed fields for:

- triggering observation or constraint;
- suspected underlying business need;
- current objective and assumption at risk;
- proposed scope change;
- alternatives considered, including continuing with the current scope;
- impact on the goal outcome, architecture, downstream subgoals, acceptance criteria, and evidence;
- budget impact by dimension and available budget;
- recommended decision and required approver.

The overseer should distinguish a symptom from a changed business outcome. It may authorize a bounded adjustment when the underlying outcome, acceptance contract, architecture boundary, and dependency chain remain intact, the applicable policy permits the change, and budget is available. It must route the change through the impact and estimation gate when the outcome, product scope, architecture, acceptance criteria, or downstream sequence could be compromised. User approval is required when the change alters the end goal, approved product direction, human acceptance requirements, or a protected policy boundary.

The negotiation must preserve the original request, the worker's rationale, the alternatives, the decision, and the resulting contract revision in `project.md` and the durable execution history. The overseer must not use negotiation to consume unbounded budget while deferring a decision.

Workers have proposal authority, not governing-contract authority. They may report contradictions, missing inputs, infeasible requirements, implementation realities, and proposed changes through the typed assessment and negotiation record. The overseer owns the default decision and evaluates the proposal against the ultimate goal, not only the local subgoal.

If a proposal could endanger the goal or subgoal, change the approved outcome, invalidate downstream work, or consume material unapproved budget, the overseer should prefer user input over inference and continuation. A goal may explicitly delegate a defined class of decisions to the overseer through operational policy, such as “resolve implementation-level tradeoffs without interrupting the user when acceptance criteria and architecture remain unchanged.” Delegation must be typed, scoped, and visible in the contract; it must not be inferred from ordinary prose.

## Skill distribution and resolution

Goals may require skills for business framing, product analysis, design, implementation, QA, or other specialized work. Skill availability is part of goal setup and agent preflight, not an implicit assumption in free-hand instructions.

For the MVP, Omvra should ship a read-only bundled skills catalog and use those skills directly from their installed folder. A goal, workflow, subgoal, or agent node references a skill by typed `skillId`, optional version/source constraint, and required stage/persona. The orchestrator checks availability before dispatch and includes the resolved skill reference in the contract packet.

Settings owns an ordered list of user-designated skill roots. These roots are the explicit extension surface for workflows and agents: users may point Omvra at workspace, repository, team, or personal folders without copying their contents into Omvra. Each root has enabled/disabled, validation, trust/integrity, and precedence metadata.

Skill resolution should follow this contract:

1. If one or more valid settings-designated roots are enabled, resolve the requested `skillId` from those roots in the user's configured order. A valid, trusted configured skill may intentionally override a bundled or fallback skill when the version/source constraint permits it.
2. If the settings-designated root list is empty, use the fallback chain: Omvra-bundled skills → skills made available by the assigned agent/runtime → codebase/workspace-local skills.

A failure to read the bundled catalog is diagnostic, not an automatic Goal blocker. If a required skill resolves from a valid configured root, assigned agent/runtime capability, or workspace-local source, setup proceeds and records the bundled-source issue for inspection. A Goal blocks only when the required skill itself cannot be resolved, is incompatible, fails integrity/trust checks, or otherwise violates its contract.
3. If configured roots exist but do not contain the requested skill, apply the declared fallback policy and record that fallback; do not silently substitute a different skill or prose.

The resolved source, root identifier, version, integrity hash, and fallback reason must be visible before dispatch and durable in execution history. External sources must not be downloaded, installed, or executed implicitly during goal setup. A required skill that is unavailable, ambiguous, invalid, or incompatible pauses setup with a typed missing-skill result.

The settings surface should live under an Agents & Skills section, alongside agent/persona configuration. It should show the bundled read-only location, the ordered settings-designated roots, the empty-settings fallback chain, discovered skill versions, integrity/trust status, and refresh/validation actions. Goal setup and agent preflight should show which skill source will be used, which are missing, whether a local override is taking precedence, and why a fallback was selected.

The skill manifest should be small and typed at minimum: `skillId`, `version`, `name`, `summary`, `supportedStages`, `supportedPersonas`, `entrypoint`, `source`, `integrityHash`, and `trustStatus`. Skill prose remains advisory content inside the generated contract; it cannot override system, safety, goal policy, or acceptance rules.

Only semantic contract changes invalidate an acknowledgement. Examples include changes to objective, scope, inputs, instructions, outputs, constraints, permissions, interdictions, acceptance criteria, evidence requirements, handoff, dependency, or budget. Cosmetic labels, layout, and non-authoritative notes should not force a restart.

### Policy authority and typed fields

Policies that govern execution should be represented as strongly typed, versioned fields wherever possible. Typed policy is executable authority; free-hand text is contextual guidance unless it is explicitly marked, scoped, and compiled into the contract as an authoritative instruction.

The effective policy is resolved in this order:

1. Platform safety and system-level interdictions.
2. Goal-level permissions, interdictions, budgets, and acceptance policy.
3. Subgoal policy, when it narrows or specifies behavior for that subgoal.
4. Acceptance-gate policy, when it governs the gate's actor, evidence, approval, or release behavior.
5. Contract-level fields generated from the resolved policy.
6. Scoped authoritative instructions linked to the relevant node, handoff, or transition.
7. Free-hand descriptions and notes as non-authoritative context.

Lower-level policy may narrow higher-level authority but may not silently weaken a higher-level interdiction or safety rule. A conflict, missing required field, or ambiguous promotion from prose to policy pauses execution and enters `approval required`.

Acceptance gates should support an explicit actor mode: `human`, `agentic`, or `both`. `agentic` requires the overseer's evidence checks; `human` requires the designated human decision; `both` requires both checks to pass. Gate-specific policy may define evidence, approvers, budget behavior, and failure handling without overriding goal-level safety rules. The user configures the default acceptance boundary in settings; a goal may inherit that setting or override it, and an individual gate may narrow it further. A gate may not silently weaken a goal-level human-confirmation requirement.

Free-hand text can be promoted into an authoritative contract instruction only through an explicit user action or a shaping decision that records its scope, owner, effective revision, and acceptance impact. The overseer must not infer binding policy from ordinary prose.

## Resolved configurable Goals / Loops policy

The workspace policy is a dedicated, versioned record under `omvra.goalPolicy.v1`. It is separate from general workspace preferences and must have independent **Back up Policies** and **Restore Policies** actions. Policy backup and restore use the workspace backup envelope when included in a full backup, and may also be exported or imported as a policy-only file.

The policy dimensions are intentionally limited to:

- financial cost;
- token count;
- concurrent loops;
- total loop attempts; and
- retries/rework cycles.

Time budgets are not part of the policy. Runtime/model response latency is not treated as a Goal or subgoal execution budget because it would make strict policies unreliable for commercial model providers. A loop means one complete execution cycle for a Goal or subgoal: dispatch, work, evidence, review, and any resulting retry or rework decision. `maxLoopAttempts` limits complete cycles; retries are tracked separately for failed or blocked cycles.

Every dimension uses the same discriminated representation:

```ts
type GoalBudgetDimension =
  | { constrained: false }
  | {
      constrained: true;
      mode: 'hard-cap' | 'goal-pool' | 'approval-required';
      value: number;
      unit: 'USD' | 'tokens' | 'loops' | 'attempts' | 'retries';
  };
```

The persisted workspace record has the following v1 shape. `schemaVersion` governs migrations; `policyRevision` increments for every accepted settings change and is copied into active Goal contract history for forensic reconstruction.

```ts
type GoalPolicyV1 = {
  schemaVersion: 1;
  policyRevision: number;
  currency: string; // defaults to 'USD'
  dimensions: {
    financial: GoalBudgetDimension;
    tokens: GoalBudgetDimension;
    concurrency: GoalBudgetDimension;
    attempts: GoalBudgetDimension;
    retries: GoalBudgetDimension;
  };
  acceptance: { actor: 'human' | 'agentic' | 'both' };
  agentMutationConfirmation: 'required' | 'allowed';
  rollover: 'dynamic';
  updatedAt: string;
};
```

Budget modes are selected independently per dimension. The safe reset defaults are: financial `10 USD`, tokens `100000`, concurrency `1 loop`, attempts `10`, retries `2`; all are constrained with `hard-cap` except consumable dimensions may use dynamic Goal-pool rollover when explicitly selected. Agent-originated graph mutation requires confirmation, and acceptance defaults to human review.

`constrained: false` is the explicit unbounded representation. An unconstrained dimension must not contain `mode`, `value`, or `unit`. A constrained dimension must contain a supported mode, a positive value, and its dimension-specific unit. Zero, negative, fractional count values, missing values, and incompatible mode/value combinations are invalid. Financial settings use whole units for now; supplier metering may still report fractional actual usage, but the configured constraint does not.

The default currency is USD. Settings may offer a supported currency list, and the effective budget is evaluated by the responsible AI agent against the supplier account's currency. The Workflows UI should recommend using the same currency as the account operating the selected model; Omvra does not add a second hidden currency-conversion policy.

The effective policy resolves as:

`workspace default → Goal override → subgoal override → acceptance-gate narrowing`

Missing fields inherit. A lower scope may narrow a limit or strengthen an acceptance requirement but may not widen a parent limit, remove a required human confirmation, or weaken a safety/interdiction rule. Widening a policy means increasing a budget, increasing concurrency/retries/attempts, or changing a constrained dimension to unbounded. If an existing policy blocks Goal accomplishment, widening it requires user confirmation through the impact gate.

The overseer owns allocation across subgoals. The default allocation strategy is dynamic with rollover: each subgoal receives an overseer-assigned allocation for the current cycle, unused budget returns to the parent Goal pool when that cycle completes, and the overseer may redistribute it before the next cycle. The receiving subgoal may receive all remaining budget when it is the last active subgoal; no artificial hoarding ceiling applies by default. The total Goal budget remains the absolute upper bound, and redistribution cannot enlarge an already-running cycle retroactively. User settings may override the overseer's allocation choices.

Policy changes are enforced immediately for active Goals. Every accepted change increments the workspace `policyRevision`; affected active Goal contract revisions record the prior and effective policy revisions. A stricter or otherwise blocking change pauses affected work and enters the contract-change impact gate. A widening change does not silently alter active work; when it is needed to unblock completion, it requires user confirmation. Effective policy, allocation decisions, transfers, balances, and the resulting contract revision must be visible in execution state and durable history.

Workflows settings must expose workspace defaults, the supported currency, each dimension's constrained/unbounded state, value, unit, allocation mode, dynamic rollover behavior, validation warnings, reset-to-safe-default behavior, and policy-only backup/restore. Goal and subgoal inspectors must show inherited values distinctly from explicit overrides and must identify when an active Goal is affected by a policy change.

Malformed or incompatible imported policy data fails closed to safe defaults and presents a validation warning. Safe defaults must remain bounded, require human acceptance where applicable, and never silently turn an invalid constraint into unbounded execution.

## Contract-change impact gate

Contract changes use impact-aware invalidation. The system must not restart the whole workflow merely because text or instructions changed.

After new user input or an approved change request arrives, the overseer creates a change proposal and evaluates it before mutating execution:

1. Classify the change as operational, local corrective, scope-changing, or goal-defining.
2. Identify the earliest affected subgoal and all downstream sequence dependents.
3. Estimate the rework, time/token/cost budget, affected agents, approval gates, and expected evidence that remains reusable.
4. Present the impact summary and proposed restart boundary to the user when the change would invalidate active work or materially consume budget.
5. On approval, create a new goal/contract revision and execution attempt from the earliest affected stage. Preserve superseded work as historical evidence; do not silently use it as completion evidence for the new revision.

Operational changes may continue in place. Local corrective changes pause and re-acknowledge only the affected scope. Scope-changing changes invalidate the affected subgoal and downstream dependents. Goal-defining changes, such as a new product outcome, architecture, or acceptance criteria, normally restart from Shaping.

The impact gate must be recorded in the durable execution history and summarized in `project.md`, including the change classification, rationale, invalidation boundary, reusable evidence, estimated cost, approval decision, and new execution attempt identifier.

## Overseer state model

The overseer is the record keeper for state transitions. The user may configure the policy and acceptance boundary, but subgoal status is derived from execution state rather than being freely user-set.

Normal states:

`waiting for input` → `ready` → `working` → `evidence required` → `handoff pending` → `complete`

Interruption states:

`blocked`, `approval required`, and `failed`

The overseer must not advance a sequence dependency while its predecessor is incomplete, its required evidence is missing, its acknowledgement is stale, or a configured approval gate has not passed.

## Budgeted autonomy

The overseer is autonomous for starting, pausing, retrying, delegating, waking, and reassigning work when those actions are permitted by the goal's rules. Human approval is required only when an explicit approval gate, permission boundary, interdiction, or execution-budget limit requires it.

Every executable goal must have a bounded autonomy budget. At minimum, the budget must cover:

- maximum concurrently running loops;
- maximum total loop attempts for the goal;
- maximum retries or rework cycles per subgoal;
- token and financial-cost limits when configured.

Budget defaults are settings, not hard-coded product assumptions. The Workflows settings expose each dimension independently—tokens, financial cost, concurrency, total attempts, and retries/rework—using the resolved policy schema above. New goals inherit the configured workspace defaults and may override them explicitly; subgoals and acceptance gates may only narrow or allocate from an explicitly permitted goal budget.

Starting a loop, retrying a failed handoff, requesting rework, or reassigning an active subgoal consumes budget. A reassignment must not reset the attempt count. When a limit is reached, the overseer must stop dispatching work, preserve the current evidence and state, and transition the goal to `approval required` or `blocked` with a human-readable reason. The human may extend the budget, change the policy, or abandon the goal; the overseer must not silently continue.

The budget is a safety boundary, not a target. The overseer should stop earlier when it detects a repeated failure signature, no meaningful evidence delta, an unsatisfied prerequisite, or a contract/policy conflict.

Budget reallocation is a configurable policy, not a universal overseer behavior. The goal settings must define the policy for each budget dimension—financial cost, tokens, concurrent loops, total attempts, and retries/rework—and may provide tighter subgoal-level overrides.

For each dimension, the user may choose a policy such as:

- **Hard cap:** do not exceed the current cycle allocation; unused budget may roll back to the parent pool for overseer redistribution at the next cycle.
- **Goal pool:** allow the overseer to move unused budget from another subgoal within the explicit goal-level pool.
- **Approval to reallocate:** allow the overseer to propose a transfer, but require user approval before consuming it.
- **Unbounded by this dimension:** represent the dimension with `constrained: false`; no numeric value or mode is permitted, subject to other budgets and stop conditions.

The policy must record who authorized it, when it was set, which subgoals may donate or receive budget, and whether the rule applies to the current execution attempt or future attempts. Financial authorization is independent from token authorization: a user may permit a large token budget while retaining a hard monetary cap, or explicitly permit both. The overseer dynamically assigns current-cycle allocations, returns unused budget to the parent pool after the cycle, and may give all remaining budget to the final active subgoal. User settings may override those allocations.

When a transfer is permitted, the overseer records the donor, recipient, dimension, amount, reason, policy setting, and resulting balances before dispatching more work. If no applicable policy permits the transfer, the subgoal pauses in `approval required` rather than assuming permission.

## Working context and stage transitions

Each active goal should maintain an ephemeral Markdown working-context file, initially named `project.md`. It is a transition artifact, not the source of truth. The overseer owns its structure and updates it after meaningful decisions, handoffs, failures, reassignments, and stage changes.

The working context must be granular enough for a newly activated agent to resume without replaying the entire conversation. At minimum it should contain:

- current goal and subgoal, stage, status, and next decision;
- the accepted objective and current contract revision/hash;
- decisions made, rejected alternatives, and unresolved questions;
- relevant inputs, constraints, permissions, and interdictions;
- completed work and evidence locations;
- failed attempts, issue summaries, retry count, and why the next attempt is different;
- active agents, their competency rationale, last known state, and pending requests;
- handoff requirements and the exact condition for advancing;
- the next recommended action and the stop/escalation reason, when applicable.

The file should be scoped per goal or execution context, versioned with the goal revision, and updated atomically with a handoff where possible. Completed goals retain `project.md` and `roster.md` by default as an inspectable final decision and recruitment log. The user can enable the `Cleanup goal artefacts` workflow setting to remove them after durable execution records and final evidence are verified; cleanup must never remove those durable records or evidence.

Markdown is for resumability and inspection. Metrics must come from durable structured events and execution records, including task and subgoal attempts, failures, elapsed time, agent transitions, issue counts, evidence submissions, retries, and approval/blocked periods. The system must not depend on parsing `project.md` to calculate metrics.

The goal should also maintain an ephemeral `roster.md` for temporary agent recruitment. It should record the recruited agent type/persona, why the existing pool was insufficient, the competencies and skills requested, relevant instruction sources, the subgoals served, and whether the agent was dismissed or retained at completion. This helps inspect overseer recruitment rationale and discover recurring competency gaps. The durable agent assignment, recruitment, and dismissal events remain the authoritative audit and metrics source. Retention is the default; cleanup is controlled by the `Cleanup goal artefacts` workflow setting.

### Completion cleanup hook

Cleanup is a post-completion side effect, never part of the state transition that establishes completion. The completion transition must first persist the final goal state, durable execution events, final evidence references, and any required human acceptance. Only then may it invoke the cleanup hook.

Electron owns the canonical artifact root at `<userData>/goal-artifacts`, where `<userData>` is `app.getPath('userData')`. Each goal uses a child directory named by its validated goal id. This keeps the files recoverable from the app's Library/Application Support data location while keeping them outside the project workspace. The hook receives `{ goalId, artifactRoot, cleanupEnabled, durableRecordsVerified, finalEvidenceVerified }`, with the Electron owner deriving `artifactRoot` from that user-data root, and is fail-closed:

- `cleanupEnabled: false` returns `skipped` and leaves both working-context files untouched;
- either verification flag being false returns `blocked` and leaves both files untouched;
- a missing goal id, unsafe artifact path, or unknown artifact location returns `invalid` and performs no deletion;
- when all preconditions pass, the runner may delete only the goal-scoped `project.md` and `roster.md` files, never the artifact directory, durable records, evidence, or unrelated files;
- deletion is idempotent: missing target files count as already-cleaned, while individual failures are returned as `partial-failure` with the error and any successful deletions;
- cleanup emits a structured `goal.artifacts.cleanup` event containing the goal id, setting state, verification outcome, requested files, removed files, and result. The event is written before or alongside the cleanup attempt by the durable execution owner, and is never stored in either Markdown artifact.

The first implementation exposes this hook as a side-effect service. The goal-completion orchestrator must call it only after its durable commit succeeds and must treat `blocked`, `invalid`, and `partial-failure` as observable cleanup outcomes rather than as completion failures. Until that orchestrator boundary exists, the default remains retention and no cleanup is attempted automatically.

## Proposed goal lifecycle owner and transition protocol

The lifecycle owner should be a dedicated `GoalLifecycleService` in the Omvra durable-state boundary. It owns validation, state transitions, revision checks, durable lifecycle events, and the post-commit cleanup invocation. It must not be the cleanup runner itself: cleanup is a narrow side effect of a successful completion transition.

### Identity, ownership, and revision scope

All durable Goal entities use locally generated, prefixed opaque UUIDs. The prefix makes logs and MCP payloads identifiable without making the identifier semantically meaningful:

```ts
type GoalId = `goal_${string}`;
type GoalElementId = `element_${string}`;
type GoalConnectorId = `connector_${string}`;
type GoalExecutionId = `execution_${string}`;
type GoalEvidenceId = `evidence_${string}`;
```

Goals own their editable graph subtree: elements and connectors are deleted with the Goal. Tasks and milestones remain owned by their existing project records; Goal links are references and are not source-record copies. Execution records, lifecycle events, and evidence references are separate durable records and survive Goal deletion for now. A running Goal requires confirmation before deletion. Once confirmed, the overseer is notified to kill all agents and actions for that Goal; this is an immediate stop, not a graceful recovery or handoff flow.

Revision scope is intentionally aggregate at the current product scale:

- The Goal revision covers the Goal definition, graph elements, connectors, goal-level instructions, policy, and relationship references.
- The execution revision covers runtime state, commands, evidence verification, handoffs, and lifecycle events for one execution attempt.
- Evidence references are immutable append-only records. Their source content remains owned by the source system; content snapshots are not required yet.
- The canonical evidence records remain in Omvra's durable store. Users may optionally configure a separate evidence archive location for analysis and export. The archive is additive, append-oriented, and never the authority for lifecycle decisions; archive write failures must not erase or invalidate canonical records.
- A semantic change is reviewed at the immediate affected subgoal. Goal-level working instructions remain unchanged unless the change explicitly targets them. Completed subgoals are immutable and cannot be edited in place.
- If the immediate subgoal's output contract, dependency, or acceptance boundary invalidates downstream work, the overseer must stop at the affected boundary and request a new decision rather than silently re-estimating or rewriting completed work.

Goal deletion is a subtree deletion for editable graph state, but not a destructive purge of execution history. The deletion event must retain the deleted Goal id, execution ids, actor, confirmation, and forced-stop outcome so the historical record remains inspectable.

Backup/import processing must preserve unknown fields for forward compatibility while treating them as inert data when the current application does not understand them. Unknown fields must not cause validation exceptions or block an otherwise valid import; only known fields participate in current runtime behavior. Backup format compatibility and execution-history portability across workspaces remain separate policy decisions.

Omvra is a packaged Electron application, so Electron-store is the sole source of truth for workspace, Goal, execution, event, and evidence data. localStorage is not a workspace fallback, mirror, migration source, or conflict participant in the packaged app. It may be used for disposable UI-only state such as view layout or filters. Renderer state must hydrate from Electron-store and write through the main-process store boundary; stale renderer state loses to the canonical store rather than being merged automatically.

The ownership boundary is:

| Actor | Authority |
| --- | --- |
| Goals UI | Edit the goal graph and shaping fields; it may request lifecycle commands but may not directly set execution state or emit completion evidence. |
| Orchestrator/overseer | Propose dispatch, pause, retry, handoff, acceptance, and completion commands with evidence and policy context. |
| Worker agent | Submit acknowledgement, assessment, evidence, and handoff proposals; it cannot promote its own work to complete. |
| `GoalLifecycleService` | Validate and atomically commit allowed transitions, increment revisions, append durable events, and invoke post-commit effects. |
| Cleanup runner | Delete only verified goal-scoped working-context files and return an observable cleanup result. |

The current `GoalRecord` shape is sufficient for graph editing but is not sufficient as the execution record. Execution state should be stored beside the goal definition rather than overloaded into `GoalElement.status`:

```ts
type GoalExecutionStatus =
  | 'draft'
  | 'ready'
  | 'working'
  | 'evidence-required'
  | 'handoff-pending'
  | 'awaiting-acceptance'
  | 'complete'
  | 'blocked'
  | 'approval-required'
  | 'failed'
  | 'abandoned';

interface GoalExecutionRecord {
  goalId: string;
  goalRevision: number;
  executionAttemptId: string;
  status: GoalExecutionStatus;
  overseerAgentId?: string;
  contractRevision?: number;
  contractHash?: string;
  requiredAcceptanceActor: GoalAcceptanceActor;
  durableEvidenceRefs: string[];
  finalEvidenceVerified: boolean;
  durableRecordsVerified: boolean;
  cleanupStatus?: 'not-requested' | 'skipped' | 'blocked' | 'cleaned' | 'invalid' | 'partial-failure';
  updatedAt: string;
}
```

### Allowed transitions

Every command includes `commandId`, `goalId`, `expectedGoalRevision`, `executionAttemptId`, `actorId`, `requestedAt`, typed payload, and an idempotency key; commands that act on a contract also include its revision/hash. The service rejects stale revisions before evaluating the command. It returns the current revision and conflict reason; callers must re-read and reconcile rather than overwrite.

| From | Command | Preconditions | To |
| --- | --- | --- | --- |
| `draft` | `start` | Graph valid, required agents/skills resolved, policy and budget present | `ready` |
| `ready` | `dispatch` | Predecessors complete, contract acknowledged, no gate or budget block | `working` |
| `working` | `submit-evidence` | Evidence references are durable and scoped to the attempt | `evidence-required` |
| `evidence-required` | `request-handoff` | Acceptance criteria and evidence checks pass | `handoff-pending` |
| `handoff-pending` | `accept` | Required actor has accepted; for `both`, both checks pass | acceptance recorded; remains `handoff-pending` |
| `handoff-pending` | `complete` | Acceptance recorded, final evidence verified, and all completion checks pass | `complete` |
| `working` / `evidence-required` / `handoff-pending` | `pause` | Actor is authorized or a policy stop condition exists | `blocked` or `approval-required` |
| `blocked` / `approval-required` | `resume` | Blocking reason resolved, revision revalidated, contract still current | `ready` or prior active state |
| `working` / `evidence-required` / `handoff-pending` | `fail` | Failure reason and preserved evidence recorded | `failed` |
| `working` / `evidence-required` / `handoff-pending` / `failed` | `retry` | Retry budget and policy permit another attempt | `ready` |
| `ready` / `working` / `evidence-required` / `handoff-pending` / `paused` / `blocked` / `approval-required` / `interrupted` | `abandon` | Explicit human confirmation or confirmed stale-execution GC | `abandoned` |

`complete`, `failed`, and `abandoned` are terminal for an execution attempt, not for the Goal definition. Every Goal is re-runnable: starting a Goal whose latest execution is terminal creates a new execution record with a new `executionAttemptId`, preserves the prior execution and evidence as immutable history, and never reopens the completed attempt in place. A changed objective, acceptance boundary, or semantic contract additionally creates a new Goal revision and contract snapshot for that attempt. Only one execution may be active for a Goal by default. Abandonment is an explicit, auditable terminal decision; stale-execution garbage collection may discover candidates and may mark them abandoned only with explicit human confirmation. It never deletes the Goal graph, evidence, or execution history. A newly discovered cleanup failure does not downgrade completion. It updates the cleanup outcome and emits an operational event for retry or inspection.

The Goals inspector provides **Reset execution** as a single governed recovery action. Reset never deletes or reopens the current attempt: it records a human-confirmed reset, marks an active attempt abandoned when necessary, and clears the current runtime projection back to the Goal's initial not-started state. The prior execution, contract snapshot, evidence, handoffs, and audit events remain available for inspection. The next explicit `start` creates a new attempt and remains subject to all setup and contract gates.

### Completion transaction

`complete` is a two-phase application operation with one durable commit boundary:

1. Validate the expected goal revision, execution attempt, current contract, predecessor states, evidence references, acceptance actor, budget, and all required gates.
2. Write the final execution record, completion decision, evidence references, handoff result, and `goal.lifecycle.completed` event through one durable lifecycle commit/journal boundary. Set `durableRecordsVerified` and `finalEvidenceVerified` from the commit result, not caller claims.
3. After the durable commit succeeds, invoke `cleanupGoalArtifacts` with the resolved user-data artifact root and the persisted verification results.
4. Persist `goal.artifacts.cleanup` as a follow-up event and update `cleanupStatus`. A `skipped`, `blocked`, `invalid`, or `partial-failure` result is observable but does not undo the completed state.

If step 2 fails, no cleanup is attempted. If the process exits between steps 2 and 3, or cleanup returns an ambiguous, timed-out, partial, permission, or verification result, persist a durable `reconciliation-required` marker containing Goal/execution ids, requested/removed/unresolved files, reason, error, attempt count, and timestamps. Completion remains complete; the marker is visible to the overseer and user, and the overseer proposes idempotent retry or reconciliation. The reconciliation pass must never infer completion from the presence or absence of `project.md` or `roster.md`.

### Commands and durable events

The minimum command surface is `start`, `dispatch`, `acknowledge`, `report-recruitment`, `submit-evidence`, `request-handoff`, `accept`, `pause`, `resume`, `retry`, `fail`, `complete`, `abandon`, and `reset`. `acknowledge` is receipt-only; `report-recruitment` records the working agent's subagent identities and outcome without Omvra spawning them; `accept` records acceptance; `complete` and `abandon` perform terminal transitions; `reset` preserves the current attempt as history and clears the current runtime projection without deleting it. `goals.gc` provides a dry-run stale-execution candidate scan and a confirmation-gated application path. Each accepted command appends an event containing `eventId`, `eventType`, `goalId`, `goalRevision`, `executionAttemptId`, `actorId`, `occurredAt`, `previousStatus`, `nextStatus`, `commandId`, and typed reason/evidence fields. Replaying a command with the same idempotency key returns the original result without appending a second transition. Stale acknowledgements are rejected and recorded.

The `GoalLifecycleService` is the sole validator and durable lifecycle committer. An `OverseerAdapter` performs delegation, wake, retry, escalation, and configured approval handling; it returns typed outcomes or intents to the lifecycle service, which validates budget and policy boundaries before reflecting them in durable execution state. It cannot mutate lifecycle state directly.

Synchronous lifecycle checks include revisions, command transitions, predecessor/dependency state, budget availability, evidence-reference existence, already-recorded gate state, and required acceptance actor. Semantic conditions, evidence quality, external checks, budget reallocation, gate bypass or widening, and human acceptance are proposals for overseer or human action. Interrupted executions never resume automatically: budget-caused interruptions require approval, while other interruptions become `interrupted` and are handed to the overseer for a budget-safe continuation decision.

The minimum completion evidence record must identify the acceptance criteria checked, the evidence references used, the verifier, verification time, and whether the evidence belongs to the current contract revision. Evidence may be preserved from earlier attempts only when the impact gate explicitly marks it reusable; otherwise it cannot satisfy completion.

The optional Goal audit archive uses a stable, analysis-friendly append format: `goal-lifecycle-audit.jsonl`, with one immutable lifecycle event per line. When a `goalAuditArchiveDirectory` is configured, existing canonical events are backfilled and new lifecycle events are appended idempotently; cleanup attempts remain available in the separate `goal-cleanup-audit.jsonl` stream. The archive may live outside the app's user-data directory, but its configured path must be validated and its write status must be observable. Exporting or archiving records must not move, delete, or rewrite the canonical lifecycle history.

## MCP goal resources and writes

`goals.get` returns the complete Goal resource: editable graph definition, typed elements and connectors, relationships, policy, and the current execution summary/state. Detailed lifecycle events remain available through a separate goal-scoped resource so normal reads do not need to carry the full event history.

Graph writes support both granular and full-resource operations:

- focused element/connector updates are the normal path for token-efficient edits and finer-grained history;
- full Goal replacement remains available for bulk edits, migrations, backup restore, and administrative repair.

Both paths use the aggregate Goal revision, preserve unknown fields, and require an idempotency key for mutating operations. Lifecycle state is changed only through lifecycle commands, never by ordinary graph writes.

Agent-originated Goal graph mutation is controlled by a user-configurable preference. The default requires human confirmation; users may explicitly relax that policy for their workspace. The preference itself is versioned policy and is included in the effective Goal contract.

MCP audit history keeps a bounded in-app fallback of the most recent 200 metadata-only records. Users may configure a separate local archive directory for longer-term MCP history and analysis. Archive records use an append-oriented format such as JSONL, exclude credentials and raw sensitive payloads, and do not replace the canonical audit state. Lifecycle write records retain the command actor, goal/execution identity, execution state and revision, expected/current revision, attempt, and contract revision/hash so rejected retries, orphan recovery, and dispatch transitions can be reconstructed without copying the contract packet itself.

## Backup and restore compatibility

Backup refers to workspace backup and restore, not an independent content-import workflow. The backup uses a versioned `omvra-backup` JSON envelope, serialized compactly and compressed for storage efficiency. Unknown fields are preserved through round trips and ignored by older runtimes.

Restore replaces the current workspace. The package is fully validated before any write; any ID collision or incompatible record fails the restore without partially applying it. Selective import can be added later as an explicit user-controlled workflow.

Execution history is imported as read-only historical/foreign data. It is never resumable by default because referenced agents, capabilities, artifacts, or external files may no longer exist. If an external history/evidence archive is configured, the backup includes an archive manifest, location metadata, and the selected archive files. Restore extracts the archive to a user-approved destination or re-points to an already available directory, then uses the restored metadata as the archive locator. An absolute source path is only a hint and must not be trusted as a portable destination. If archive files are unavailable or corrupt, the workspace restore may still proceed while the archive is marked unavailable; the default fallback is the most recent 200 canonical executions. File attachment URLs remain references inside the records; the archive location itself is a configured directory, not an attachment URL.

This proposal makes Omvra the owner of lifecycle truth while keeping the current prototype honest: until `GoalLifecycleService` exists, the Goals canvas can continue to edit and persist graph definitions, but it must not claim that those edits constitute an executable completion transition or trigger cleanup automatically.

## Responsibility boundaries

| Responsibility | Owner |
| --- | --- |
| Define outcome, constraints, and acceptance policy | User |
| Interpret the goal graph and coordinate execution | Overseer/orchestrator |
| Produce the assigned deliverables and evidence | Worker agent |
| Persist canonical state and expose it through MCP | Omvra |
| Approve configured human gates | User or designated human reviewer |
| Maintain task, todo, milestone, and dependency projections | Orchestrator through project-management MCP tools |

## Acceptance policy

Acceptance is configured through Workflows settings and resolved per goal. The safe fallback is human acceptance for every completed subgoal, which gives the user a review point at each handoff. The user may configure a workspace default and choose whether a goal inherits it or overrides it with acceptance at every subgoal, selected human-acceptance gates, or final goal completion. Gates may further narrow the inherited policy. The selected policy must be included in the goal contract and visible in the execution state; changing it during active work passes through the contract-change impact gate.

The overseer may perform its own evidence and completion checks regardless of the configured human-acceptance policy. It must not mark a subgoal fully complete when the selected policy still requires human acceptance.

## Agent-pool and temporary recruitment policy

The overseer should first use canonical agents from the existing pool, matching the required competency, persona, instructions, and destination scope. If no sufficiently close match exists, and the goal permissions allow it, the overseer may create a temporary specialized agent for the subgoal. Recruitment must be justified, bounded by the goal autonomy budget, and recorded in `roster.md` plus durable structured events. Temporary agents should be dismissed or put to sleep when no longer needed; retention requires an explicit reason.

## Policy decisions and remaining questions

The following policy and operating-model decisions are resolved:

- **Approval scope:** not every subgoal handoff requires user approval. The overseer may perform bounded execution control, evidence/handoff, and project mutations when authorized by the accepted contract. Human confirmation is required for explicit approval gates, planning/workflow mutation, subgoal redefinition, budget overruns or blocking policy widening, release approval, gate bypass, artifact removal, and project-critical deletion.
- **Autonomy budget defaults:** resolved through the dedicated `omvra.goalPolicy.v1` record and user-configurable Workflows settings. Dimensions are tokens, financial cost, concurrency, total loop attempts, and retries/rework; time budgets are intentionally excluded. Each dimension uses the shared constrained/unbounded schema, positive values only, and supports dynamic rollover allocation.
- **Contract changes:** use the impact gate above. Resume locally after re-acknowledgement when the change is operational or local corrective and the affected contract remains valid; create a new execution attempt from the earliest affected stage when scope, acceptance, architecture, dependencies, or downstream work are invalidated. Full restart is reserved for goal-defining changes.
- **Acceptance boundary:** resolved through user-configurable Workflows settings. The workspace sets the default; goals may inherit or override it, and gates may narrow it but not weaken a higher-level human-confirmation requirement.
- **Agent recruitment:** use canonical agents first. The overseer may create a temporary specialized agent only when no sufficiently close competency/persona match exists, the goal policy permits it, and the recruitment rationale is recorded.
- **Resolved — working-context retention:** completed goals retain `project.md` and `roster.md` by default. The `Cleanup goal artefacts` workflow setting opts into deletion after durable records and final evidence are verified.

## Resolved architecture boundary: governor, not runtime

Loops is a planning/orchestration surface with an executable governance boundary, not a first-class workflow runtime or cronjob scheduler. Omvra owns quality, process, direction, contracts, permissions, evidence, acceptance, and durable lifecycle state. Agents own the technical approach and self-regulation while executing accepted work.

Omvra must therefore:

- validate dispatch, pause, retry, handoff, evidence, acceptance, and completion requests;
- enforce contracts, dependencies, conditions, approval gates, budgets, permissions, and interdictions;
- preserve durable state, evidence, decisions, and audit history;
- reject or pause work that violates the governing contract; and
- expose the next eligible action without owning the worker's internal loop, scheduling strategy, model invocation, or technical implementation approach.

Agents may choose their technical methods, regulate their own working loop, and report evidence, rescope proposals, failures, or handoffs. They may not redefine the governing outcome, bypass Omvra's transition boundary, or self-authorize completion.

This boundary intentionally avoids building an n8n-like scheduler inside Omvra. Any future background execution service would be an optional adapter for dispatch and reconciliation, not the owner of workflow meaning or agent technique.

## Resolved action authority policy

The action pool is the set of control-plane actions Omvra can recognize, authorize, audit, or reject. It does not include an agent's internal reasoning or technical implementation choices.

| Action category | Default authority | Boundary |
| --- | --- | --- |
| Observation | Overseer/agent | No confirmation. Read-only inspection of goals, tasks, milestones, evidence, dependencies, skills, and status. |
| Planning | Human | Human confirmation is required. Subgoal redefinition always requires confirmation because it may change the goal's final outcome. |
| Execution control | Overseer | No confirmation within scope. Raise an exception when the action conflicts with the subgoal or end goal, or requires changing operational instructions to finish the goal. |
| Evidence and handoff | Overseer/agent | No confirmation. Record outcomes ephemerally per goal for debugging and resumability, while durable structured events remain authoritative for audit and metrics. |
| Workflow mutation | Human | Human confirmation is required for changes to scope, dependencies, acceptance criteria, contracts, gates, permissions, or interdictions. |
| Project mutations | Overseer/agent | No confirmation by default, but notify the human. Use canonical project-management writes and preserve auditability. |
| Send messages on the user's behalf | Human | Human confirmation is required. |
| Write files, call external MCP tools, modify repositories | Agent configuration | Follow the configured approvals for the responsible agent/runtime. For example, use Codex's configured approval behavior rather than inventing a second Omvra policy. |
| Budget overruns, release approval, gate bypass, artifact removal | Human | Human confirmation is required. |
| Delete data | Human when project-critical | Require confirmation for project-critical data; otherwise follow the applicable agent configuration and project policy. |
| Lifecycle actions | Human or delegated overseer | Require a human decision by default. No confirmation is needed when the human expressly prompted the action or it is an explicitly assigned task within the accepted contract. |

The overseer may execute an action autonomously only when the action category and current contract authorize it. A conflict, missing authority, material scope change, or operational-instruction change pauses the action and creates an exception for human review. This policy governs Omvra's control-plane decisions; it does not constrain an agent's internal technical approach.

### Policy settings surface

The policy settings surface is part of the current Goals / Loops implementation. It belongs under Workflows, uses the dedicated `omvra.goalPolicy.v1` record, supports policy-only backup and restore, and shows inherited versus explicit Goal/subgoal overrides. A future broader operational-policy editor may still be discovered separately, but it must not replace or obscure this concrete policy settings contract.

## Resolved goal/project relationship

A Goal is a workspace-level outcome object and does not require a project. A goal may coordinate work across one or more projects, or may remain projectless when its outcome is personal, recurring, informational, or otherwise not owned by a project—for example, providing the user with a daily summary assembled from several sources.

Projects are optional contributor bindings, not the canonical owner of the Goal:

- tasks and milestones remain owned by their canonical projects;
- a Goal may reference tasks, milestones, evidence, and dependencies from multiple projects;
- a Goal may have no project bindings at all;
- project bindings describe contribution or dependency and must not duplicate source records;
- Goal-level approval, policy, and lifecycle state remain distinct from project-level task state.

The first relationship model should support an optional `primaryProjectId` plus zero or more explicit project bindings. These binding/reference collections are empty for a projectless Goal; they must not contain synthetic project ids.

The implemented Goal binding relation is stored inline as versioned
`projectBindings` on `omvra.goals.v1`. Each binding contains only a stable
`projectId` and one role: `primary`, `contributor`, or `dependency`. A Goal may
have zero bindings or at most one primary; repeated primary declarations are
normalized to contributor references. Replace/remove is an atomic,
revision-protected operation, and an empty replacement returns the Goal to a
projectless state.

Binding reads add a derived projection without copying the source project:
`active` when the canonical project exists, `archived-project` when it is
archived, and `stale-project` when the reference no longer resolves. These
states are descriptive routing metadata only; they do not gate Goal
execution. The source project, task, and milestone records remain unchanged.
MCP and backup surfaces expose the reference and projection, while audit
records capture binding replacement metadata without raw source contents.

```ts
interface GoalRecord {
  id: string;
  title: string;
  primaryProjectId?: string;
  projectBindings: GoalProjectBinding[];
  artifactReferences: GoalArtifactReference[];
  // Inputs, capabilities, and evidence may exist without project ownership.
}

interface GoalProjectBinding {
  goalId: string;
  projectId: string;
  role?: 'primary' | 'contributor' | 'dependency';
  status?: 'active' | 'blocked' | 'complete';
}

interface GoalArtifactReference {
  goalId: string;
  projectId?: string; // Required for project-owned task/milestone artifacts; omitted for projectless Goals.
  artifactType: 'task' | 'milestone' | 'goal' | 'evidence' | 'document' | 'file' | 'url' | 'user-defined';
  artifactId: string;
  contribution?: 'deliverable' | 'dependency' | 'evidence';
  label?: string;
  kind?: string;
  format?: string;
  locator?: string;
  contentHash?: string;
}
```

### Resolved Goal–artifact contract

The Goal–artifact relation is a separate durable relation. It is many-to-many
between Goals/Subgoals and artifacts: links are additive, unlink is explicit,
and a replace operation is scoped to one Goal/Subgoal node rather than
rewriting other relations. Task and milestone records remain authoritative for
their mutable state; Goal state stores references and projection metadata, not
copies of mutable artifact contents.

A Goal may itself be referenced as an artifact by another Goal, including when
the referenced Goal is projectless. Live relations remain editable for future
Goal revisions. Agents may propose links, but assign, start, move, complete,
and delete actions require human confirmation by default; narrower exceptions
must be explicitly authorized by policy.

Evidence is represented by immutable references with metadata and an optional
content hash. Mutable source contents are never copied into Goal state. When a
task, milestone, or Goal revision changes, projections expose stale references
and the affected contract is re-evaluated rather than silently treating the
old source as current.

Dependency and evidence contributions are non-deliverable relation semantics:

- A `dependency` contribution is an eligibility gate. A task dependency is
  satisfied only when the source task is `done`; a milestone dependency is
  satisfied only when all of its linked tasks are `done`; a Goal dependency is
  satisfied only after a source Goal has a completed execution. Missing or
  incomplete sources return a typed blocked result at Goal start/dispatch.
- An `evidence` contribution identifies current supporting proof. It may point
  to a task, milestone, Goal, or immutable evidence record. Native evidence
  records must remain immutable; task/milestone/Goal references must still
  resolve at the recorded source revision. Missing, changed, or unverifiable
  evidence blocks handoff, acceptance, and completion.
- Contribution state is a projection (`satisfied`, `blocked-dependency`,
  `missing-evidence`, `verified-evidence`, or `stale-source`). It is derived
  from canonical source records and never becomes a second status authority.
- Replacing links is scoped to one Goal/Subgoal node; removing a link is
  explicit. Source changes do not mutate or delete the relation or its audit
  history. A later Goal revision or explicit relink is required to update a
  stale contribution.

Once execution begins, the resolved Goal contract/revision snapshot and its
artifact references are immutable for that execution. Future edits create or
target a later revision and cannot rewrite the historical decision basis used
for downstream evaluation.

A projectless Goal must still be executable when its inputs, capabilities, acceptance policy, and evidence requirements are defined. A recurring multi-source briefing may reference sources or MCP capabilities directly without creating project bindings or project-owned artifact references.

### Typed Goal inputs and capabilities

Inputs and capabilities are explicit contract data. They are never inferred
from task or milestone contents, and declaring one never downloads, installs,
executes, or grants access to anything.

- Inputs use one of `inline`, `file`, `task`, `milestone`, `mcp-resource`, or
  `external` kinds. Each reference carries a stable id, `scope`
  (`goal`, `subgoal`, `agent`, or `contract`), required/optional state, and
  only the locator or revision metadata needed to resolve it.
- Capabilities carry a stable `capabilityId`, optional version/source
  constraints, `trust`, and `permission` fields. Availability is derived from
  the runtime capability inventory rather than persisted as an assertion.
- Goal-level requirements are valid without project bindings. A selected
  subgoal or agent may add scoped requirements; the contract packet contains
  the normalized union and its resolution results.
- Resolution is typed as `resolved`, `missing`, `stale`, or `unavailable` for
  inputs, and `available`, `unavailable`, `incompatible`, or `denied` for
  capabilities. Required non-resolved entries block setup before execution
  persistence and dispatch.
- Sensitive inputs retain a reference such as `valueRef`, locator, or resource
  URI but discard inline content and secret-like fields. Contract packets and
  audit records therefore preserve stable references without copying secrets.

Changing these references or their resolution invalidates the contract hash
and acknowledgement. Active execution keeps its captured packet immutable;
later edits apply to a later Goal revision.

### Artifact node roles

Supporting artifacts and deliverables belong to one Artifact node family, but
they have different meanings and lifecycle rules. Sharing a topic or reference
shape does not make them interchangeable.

- A `supporting` artifact node represents execution input or context, such as a
  file, document, URL, or user-defined reference. It is available to the
  execution context and never counts toward delivery acceptance.
- A `deliverable` artifact node represents the expected output contract. It may
  connect directly to a Goal, Subgoal, or Agent; a Subgoal is not required. It
  owns delivery requirements and acceptance, never supporting inputs.
- A terminal handoff is not an Artifact node. It is an immutable runtime record
  containing the produced artifact references, actual delivery facts, hashes,
  timestamps, and acceptance evidence. It may be projected in a deliverable's
  delivery history, but it is not an editable canvas node.

Supporting artifact nodes and deliverable artifact nodes may share reference
metadata, but a supporting reference must not be rendered as a required
deliverable. The UI should expose supporting artifacts in execution context and
show deliverable requirements and produced handoff outputs in delivery context.

Supporting artifact selection has two paths:

- Existing workspace attachments and documents are selectable through a typed
  source picker. The picker differentiates document/file/URL sources and
  supports search by exact or partial human-facing name before linking.
- External or user-defined references remain available through a manual
  declaration fallback with label, kind, format, locator, and optional content
  hash.

Both paths persist only an immutable reference and projection metadata in the
Goal revision; they do not copy mutable document contents into Goal state.
Unavailable or deleted sources remain visible as stale references and require
an explicit relink. A supporting source can never satisfy a deliverable's
acceptance criteria.

### Deliverable node contract

A deliverable is a dedicated typed Artifact node in the Goal graph. The graph
connection expresses workflow ordering and ownership, while the deliverable
node owns the delivery contract only. Supporting inputs are modeled by separate
supporting artifact nodes rather than by links on the deliverable.

The authoritative delivery contract includes an expected outcome kind,
delivery instructions, optional format, destination, recipient, acceptance
criteria, and optional expected artifact count. Freeform notes are contextual
only and cannot override the delivery contract. The terminal handoff records
runtime facts such as produced references, actual location, content hashes,
delivery time, and acceptance evidence; it cannot redefine the requirement.

Deliverables have an independent acceptance state (`planned`, `in-progress`,
`ready-for-review`, `accepted`, or `rejected`). Task and milestone status is
projection-only, and accepting a deliverable never completes or moves its
source artifact automatically.

Artifact references may target Omvra-native records or flexible external and
user-defined artifacts. Labels are human-facing; optional kind and format
metadata make expectations machine-checkable without requiring a visual
artifact builder. A supporting artifact can be linked to execution context,
while produced output references are recorded by terminal handoff. Changes to
the delivery contract require a new Goal revision.

Until the remaining implementation boundaries are available at runtime, the safe default is to pause at ambiguity, approval, stale-contract, missing-evidence, and failed-gate states; preserve evidence; and request a human decision.

## Implementation handoff

## Goal runtime convergence contract

The canonical Electron store remains the durable authority for Goal graph, execution, policy, and reconciliation records. A committed write may emit one scoped runtime envelope through `goals.onRuntimeChanged` and persist it under `omvra.goalRuntimeEvents.v1`:

```ts
interface GoalRuntimeChange {
  eventId: string;
  scope: 'graph' | 'execution' | 'policy' | 'conflict' | 'reconciliation';
  goalId: string;
  revision: number;
  actor: string;
  changeType: string;
  occurredAt: string;
  errorCode?: string;
  details?: Record<string, unknown>;
}
```

Graph revisions protect editable `omvra.goals.v1` state. Execution revisions protect `omvra.goalExecutions.v1`; policy revisions remain attached to the resolved effective policy and contract packet. `goals.getRuntime` joins those records with policy impacts, reconciliation records, and agent availability without allowing graph edits to overwrite overseer-owned execution state. Renderer hydration ignores stale graph revisions and preserves active drag or pending writes; focus refresh is recovery only.

Rejected MCP/lifecycle writes retain their stable typed error and audit record and may emit a `conflict` or `reconciliation` envelope. They must not mutate graph, execution, policy, or event state as part of rejection.

The next deliverable is the implementation of the lifecycle boundary described above, covering:

- the minimum goal/subgoal/contract/acknowledgement schema;
- goal-to-task decomposition and persona recruitment;
- condition, approval, handoff, retry, delegation, wake, and escalation behavior;
- permission and interdiction precedence;
- user-versus-overseer acceptance semantics;
- MCP read/write operations and revision conflict behavior;
- persistence and backup requirements;
- acceptance tests for advancing, pausing, resuming, and failing a goal.
- a durable completion commit followed by idempotent cleanup reconciliation.

## Open tasks from the first live Goal test run

The first live run of `goal_d45c31ef-7f4b-4a71-b3b9-f74b9cd0c950` exposed execution-contract gaps. The workflow graph contained an ephemeral researcher node with `recruitment-requested`, but the working agent was not explicitly instructed to create the subagent through its own runtime, no step-by-step acknowledgement conversation was visible, and no execution record made the skipped stages or active stage explicit. The Goals UI also did not reflect the executing state through the MCP/IPC path.

These are open Omvra tasks in project `omvra`:

| Task | Scope | Priority |
| --- | --- | --- |
| `task-4c05fab3-9f23-454c-998c-6835f6898ee2` | Instruct the working agent to spawn requested subagents and execute ordered workflow steps | Urgent |
| `task-078b0240-6892-437a-875d-973965d0576a` | Persist acknowledgement and explicit workflow stage events | Urgent |
| `task-1c865bd1-182d-4a91-ae7e-e685308b4dba` | Bridge MCP execution progress into the Goals UI | Urgent |
| `task-c00f270f-49e5-4810-8941-fe55ee3d457c` | Add terminal delivery-handoff contract and human preferences | High |
| `task-e653e01c-071f-4c07-bf8d-735995375ae7` | Add the end-to-end execution-contract regression benchmark | High |
| `task-d8208e1b-3986-4c00-9cbd-9c93f22197a4` | Resolve skills from settings-designated folders with agent/codebase fallback | Normal |

The run must make the operating agent's current stage explicit, for example `received → acknowledged → worker assessed → eligible → started → evidence submitted → overseer validated → handoff pending → delivered`. A stage is not complete merely because the agent produced a response; the stage transition and its evidence must be durable.

Delivery handoff is intentionally tracked separately from ordinary connectors. It is a terminal delivery contract that controls recipient, artifact format, channel, attachment/download preference, acceptance, and stop condition. It may be rendered near the end of the workflow, but it is not a normal dependency node. When a produced output has a valid `file://`, `http://`, or `https://` locator, the MCP handoff response must also expose it as a downloadable resource link; durable metadata alone is not delivery.
