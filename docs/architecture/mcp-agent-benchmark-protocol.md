# Omvra MCP agent benchmark protocol

Status: rollout protocol for `milestone-73f74e74-be2f-4620-8370-45e3389ad1cf` and the multi-agent orchestration milestone.

This protocol evaluates changes within each agent product. It must not be used to rank Codex, Claude, and Copilot against one another.

## Comparison design

Run three controlled arms independently for each product. The simple-versus-instructed comparison is primary; the instructed-versus-multi-agent comparison isolates orchestration uplift.

- **Simple:** one agent executes the fixed task using the normal product workflow and workspace context. No benchmark-specific operating instructions or delegation contract is added.
- **Instructed:** the same single-agent execution receives the bounded operational instructions and acceptance contract. It does not receive an orchestrator or contributors.
- **Multi-agent:** the instructed contract is retained, with one orchestrator and a flat list of eligible agentic contributors. Contributors have explicit scopes, produce evidence-backed handoffs, and are reviewed/integrated by the orchestrator. Humans may review or directly own a task, but are never contributors in this arm.

The arms must hold product, client version, model/settings, workspace fixture, task family, task wording, tool availability, budget, and task order constant. Use blocked randomization or paired assignment by fixture and complexity band. Do not mix products in one score or treat a product label as a quality ranking.

Use three task-complexity bands:

- **Low:** one read or simple single-field write, no dependency or revision choice.
- **Medium:** multi-step task with one target and ordinary validation or handoff.
- **High:** multi-step roadmap, revision/conflict, dependency, review, or collaboration workflow.

### What counts as uplift

- **Instruction uplift:** `instructed - simple` within the same product, fixture, task family, complexity, and settings cell.
- **Orchestration uplift:** `multi-agent - instructed` on the same blocked cell. Report this separately from instruction uplift; a multi-agent result is not evidence that orchestration alone caused an outcome unless the cell is controlled.

Use directional language such as “median duration decreased in the instructed arm.” Do not claim causality from an uncontrolled run, and do not compare absolute scores between agent products.

## Episode, cell, and validity rules

An **episode** is one attempt to execute one fixed fixture task in one arm, with one opaque run identity and a bounded terminal outcome. A valid episode must have:

1. a manifest join key and exactly one assigned arm;
2. a recorded start and terminal outcome (accepted, rejected, failed, denied, or excluded);
3. the required task fixture and complexity metadata;
4. enough lifecycle/audit evidence to calculate the metrics claimed for that episode; and
5. no contamination from another arm, task wording, model/settings cell, or unrelated retry.

A **cell** is `product × client/model/settings cell × arm × task family × complexity band`. The minimum reportable cell is **10 valid episodes**. Fewer than 10 is reported as underpowered, never as zero; 30 valid episodes per cell is the preferred follow-up target. Report the valid count and exclusion count for every cell, and keep arm counts balanced where paired comparisons are claimed.

Exclude initialization and health checks, duplicate audit IDs, malformed events, retries without a distinct episode identity, contaminated runs, and episodes missing the manifest join key. Do not silently discard exclusions.

## Objective measures

The benchmark report must preserve the metric definition, source fields, denominator, and missingness for every result. The following measures are primary:

| Measure | Operational definition | Evidence/provenance |
| --- | --- | --- |
| Acceptance coverage | Required acceptance checks satisfied at terminal review ÷ checks applicable to the fixture. A missing check is not satisfied. | Fixture acceptance rubric plus task/lifecycle terminal evidence. |
| Rework | Count of revision-requested transitions and additional execution attempts after the first submission; also report whether rework was resolved. | `tasks.transition_contribution` lifecycle events (`revision-requested`, `submission`, `accepted`) and attempt history. |
| Duration | Start-to-terminal accepted/rejected/failed duration; report median and p95. For multi-agent runs also report critical-path duration from delegation to aggregate acceptance when available. | `startedAt`, `finishedAt`, non-negative `durationMs`; lifecycle timestamps for the critical path. |
| Tool calls | Total audited MCP tool calls per episode and median logical calls when a logical-call identity is available. Retries remain visible. | Bounded `diagnostics.audit_summary`/`mcp/get-audit-summary` projection, grouped by tool and outcome. |
| Cost/tokens | Provider-reported input/output tokens or cost, only when supplied by the runtime and explicitly marked available. | Runtime usage projection; never infer tokens from text or payload size. |
| Scope adherence | Binary pass plus rubric score: every accepted contribution stays within its declared scope and does not perform an unassigned aggregate mutation. | Persisted contribution scope, contributor evidence, lifecycle actor/command, and blinded evaluator rubric. |
| Handoff evidence | Required handoff fields present and linked to a bounded evidence reference before submission; report completeness and invalid/missing evidence counts. | `handoff`, `acknowledge`, `submission`, and evidence-bearing lifecycle records. |
| Delegation quality | Rubric score for valid eligible agent, clear role-derived/task-specific scope, explicit handoff, oversight, and recovery behavior. | Assignment/contribution projection plus delegation and lifecycle events. |
| Revision detection | Correctly identifies a requested revision, blocks acceptance of stale work, and records the follow-up attempt. | `revision-requested`, revision-protected transition result, attempt state, and final acceptance. |
| Integration quality | All accepted contributions are represented in the orchestrator’s final deliverable, with no contradictory or duplicate work. | Accepted contribution set, aggregate submission/acceptance evidence, and fixture rubric. |
| Premature completion errors | Count aggregate completion/review transitions attempted or persisted before required contributions are accepted or evidence is present. | Negative-path lifecycle events, aggregate task status/revision history, and audit outcome. |

Acceptance coverage, scope adherence, handoff evidence, delegation quality, revision detection, integration quality, and premature-completion errors are evaluated against pre-registered fixture rubrics. Subjective/perceptual quality is secondary: use a blinded, rubric-based evaluator and report it separately from objective outcomes.

### Metric semantics

- `0` means the metric was measured and the count/rate is zero.
- `null`, `n/a`, or an absent dimension means no usable measurement; never coerce it to zero.
- `unknown` is a real reported dimension for missing or unsupported provenance; exclude unknown-dimension rows from arm comparisons unless the report explicitly studies missingness.
- Success/acceptance rates use all eligible episodes. Denied, failed, rejected, and premature-completion errors remain visible in their own rates.
- Duration is calculated only from valid non-negative timing. Denied/authentication failures that do not complete the requested action are reported separately.
- A metric may be “not applicable” for simple or instructed arms (for example, delegation quality); retain that distinction instead of treating it as a failed score.

## Privacy-safe manifest and reporting boundary

The benchmark manifest may contain only bounded metadata: schema/protocol version, opaque `runId`, opaque `taskId`, opaque cell identity, arm, agent/provenance label, client name/version, complexity band, task-family allow-list key, fixture/version, and timestamps. It must not contain raw prompts, instructions, arguments, response bodies, task titles, descriptions, comments, transcripts, tokens, cost payloads, headers, access tokens, or private artifact contents.

The manifest is separate from `omvra.mcp.audit.v1`. Current audit records already provide normalized `agent`, `clientName`, `clientVersion`, `transport`, `origin`, `toolName`, `outcome`, `failureClass`, `target`, `startedAt`, `finishedAt`, and `durationMs`, while lifecycle records provide bounded state transitions and revision/evidence references. Do not add raw benchmark context to those records. If productized experiments later need durable joins, add an explicit versioned run/arm field rather than copying the manifest into every event.

See [`examples/mcp-agent-benchmark-manifest.v2.json`](examples/mcp-agent-benchmark-manifest.v2.json) for a redacted fixture manifest. It is intentionally metadata-only and can be used as the input shape for a runner; the runner must obtain task prompts and fixture payloads from a local, separately controlled fixture store.

## Reproducible verification procedure

1. Start the local app or use the repository fixtures.
2. Run equivalent HTTP and stdio actions for each selected task family and complexity band, preserving the arm’s controlled inputs.
3. Export only the bounded `mcp/get-audit-summary` projection or `diagnostics.audit_summary`; never export raw audit events for a benchmark report.
4. Join summaries to the redacted manifest by opaque task/run identity and join lifecycle projections by opaque task identity.
5. Validate required dimensions, arm balance, sample counts, exclusions, missing-versus-zero semantics, and privacy assertions before calculating arm deltas.
6. Store the report beside the manifest with fixture/version, commands, date, evaluator rubric version, and known gaps.

The repository verification commands for this rollout are:

```bash
npm run build
npm run test:mcp
npm run test:workspace-contracts
git diff --check
```

The UI acceptance path is Preferences → MCP Activity. The empty state must remain accessible when the listener is disabled or no activity exists; a populated run must show bounded sample size, success/failure/denied rates, median duration, and provenance grouping without payloads.

## Implementation handoff and known gaps

1. Event contract/privacy boundary — `task-683e8f59-6fa1-457a-b98e-242fef5066d3`
2. Runtime provenance/timing/target capture — `task-acffaa27-3f9b-4a31-a43a-b7fd02f9016b`, depends on 1
3. Summary aggregation — `task-28c8f720-7e3e-40d1-bd14-29dccdbddc9a`, depends on 2
4. Diagnostics/activity projection — `task-bb6592fb-e434-4be7-8b97-e3932f96e7ab`, depends on 3
5. Contract, fixture, and privacy regression coverage — `task-787ac6f0-c563-445f-89f1-d8e459fe8b39`, depends on 2, 3, and 4
6. Benchmark protocol and rollout handoff — `task-2bc7d1d7-b7e2-420e-bf90-e02e2ba58442`, depends on 5

Current audit summaries do not attach a benchmark arm, run ID, complexity band, logical-call count, contribution scope, or lifecycle evidence to every event. The separate redacted manifest and lifecycle projection are therefore required for this rollout. Populated UI metrics still require live MCP traffic; local empty-state QA does not replace a populated run. Legacy events use compatibility defaults and must be labeled as legacy coverage rather than mixed invisibly with new events.
