# Omvra Architecture Audit

Date: 2026-08-18
Method: `codebase-design` skill vocabulary (module / interface / depth / seam / adapter — deep vs. shallow modules, the deletion test, "two adapters means a real seam") applied against `docs/architecture/*` contracts and the current implementation. Findings are evidence-based (file:line), not stylistic opinion; each is doc-vs-code drift, self-admitted debt, a shallow-module smell, a leaky seam, or a missing test seam.

This is a snapshot audit, not a backlog — treat severities as a starting point for triage, and see "Unverified" at the end for what this pass didn't cover.

## Summary

The two big-ticket refactors the docs set out to do **did land**: the workspace-service/store split (`workspace-service.cjs` 4037→1974 lines, `workspaceStore.tsx` 825→286 lines) and the IPC de-inlining (`main.cjs` now has exactly one raw `ipcMain.on`, everything else routed through 10 thin registrars). MCP and ACP/runtime adapters are cleanly separated at the module-dependency level — no cross-imports either direction.

The open gaps cluster in three places: **duplicated renderer-side session-state derivation** (two components independently reconstructing the same status projection instead of sharing one), **a persistence layer that still writes through two paths** (localStorage + electron-store) despite being flagged for unification twice already, and **stale documentation** — one doc describes a feature (`useAgentWatchRuntime`/Codex watcher handoff) that has been fully removed from the code and stubbed out in tests, but still reads as a live "current evidence" contract.

## Reconciling pre-existing self-identified debt

These items were already flagged in the repo's own architecture docs. Listed here so this audit doesn't re-discover them as if new — current code confirms all of them are **still open**:

| # | Source doc | Open item |
|---|---|---|
| 1 | `modularity-and-plugin-report.md` | No `WorkspaceRepository` seam — persistence responsibility still spread across renderer state, action hooks, storage utilities, and `workspace-service.cjs`. |
| 2 | `modularity-and-plugin-report.md` | No host-capability abstraction (file picking, PDF export, external nav, notifications) — still Electron-specific. |
| 3 | `modularity-and-plugin-report.md` | No browser/server runtime target; Electron is the only product runtime. |
| 4 | `modularity-and-plugin-report.md` | Canonical task schema carries overlapping relationship fields (`swimlaneId`, `projectIds`, `project`) — risk for a future sync/multi-adapter storage layer. |
| 5 | `modularity-and-plugin-report.md` | Explicitly recommends **not** building a plugin system next — contract extraction (repository, host capabilities, canonical schema) comes first. Worth restating so it isn't silently reopened. |
| 6 | `post-acp-consolidation-audit-and-execution-record.md` | `workspace-service.cjs` is still "both a compatibility facade and a composition owner"; export removal gated on "zero supported callers," not yet done. |
| 7 | `post-acp-consolidation-audit-and-execution-record.md` | Duplicate serialization paths: renderer writes localStorage and mirrors to electron-store; hydration mirrors canonical values back to localStorage independently. Flagged as needing "one documented persistence adapter/owner." |
| 8 | `post-acp-consolidation-audit-and-execution-record.md` | MCP/ACP shared domain calls, envelopes, redaction, and audit projection are not yet consolidated behind common contracts (protocol adapters stay separate, but shared-logic duplication between them wasn't resolved). |
| 9 | `storage-architecture-review.md` | Hot `electron-store` keys (`omvra.tasks.v1`, `omvra.goals.v1`, runtime/session/audit arrays) use full read-modify-rewrite on every change — no indexed/append-only storage. SQLite migration recommended, not started. |
| 10 | `storage-architecture-review.md` | Explicit warning that a storage-engine swap alone won't fix renderer-wide re-renders or IPC churn — the render-churn problem is separate from the storage-format problem (see Workspace Store findings below). |

## Findings by area

### Agent Runtime & Sessions

**[HIGH] Session-state derivation is duplicated, not shared, between the two renderer consumers of the runtime bridge.**
`src/app/components/AgentSessionSupervisor.tsx:88-196` and `src/app/components/TaskExecutionAction.tsx:225-308` both subscribe independently to `window.electron.agentRuntime.sessions.onEvent` and both poll (`AgentSessionSupervisor` also runs its own `setInterval(refresh, 10000)`). Each then computes its *own* status projection from the same raw binding/turn data: the supervisor builds a `SessionDockProjection` (`starting/working/needs-input/ready/interrupted/failed/history/blocked`) inline; `TaskExecutionAction` builds a parallel but different set of labels (`taskExecutionLabel` map, `agentStatusTone`, the `executionNotice` ternary chain). They share only low-level primitives (`agentRuntimeTurnState`, `isAgentRuntimeTurnInFlight`) — the actual presentation logic is copy-derived, not centralized.
This is precisely the risk `agent-session-supervisor-and-concurrency.md` names in its own risk register ("Session state duplication: keep the main-process binding/event projection canonical and centralize renderer reads") — confirmed still unresolved. Two independent derivations of the same state machine is a correctness risk (they can drift and disagree about what the user sees) as well as a locality problem (a new session state has to be taught to both places).
*Codebase-design framing*: this is the seam in the wrong place. The seam should be one renderer-side session-projection module with a small interface (`projectSession(binding, events) → DisplayState`); right now the "interface" a maintainer must learn is two files' worth of inline derivation.

**[MEDIUM] `TaskExecutionAction.tsx` (728 lines) is a shallow module for its own concern.**
A single component owns ~15 `useState` slots, preflight orchestration, blocker/warning aggregation, execution-notice tone selection, work-stage derivation, and permission-response wiring, all inline in the function body — no extraction to a hook. By the deletion test, most of this logic (blocker-array construction, `taskExecutionLabel`, `executionNotice` selection) would have to reappear elsewhere if this file were deleted, since nothing else reuses it — except that "elsewhere" is exactly `AgentSessionSupervisor.tsx`, which already reimplements an overlapping slice (see above). The fix for both findings is likely the same: extract a shared `useAgentSessionProjection`-style hook/module that both components consume.

**[NONE — verified, not a gap]** No cross-imports found between `agent-runtime-session-runner.cjs` / `agent-runtime-protocol-client.cjs` and `mcp-http-server.cjs` / `mcp-handlers.cjs` / `mcp-registry.cjs` in either direction. The "runtime protocol and MCP transport stay independent adapters" contract from `acp-runtime-session-lifecycle-contract.md` holds in code as written today.

### MCP

**[NONE — resolved]** The stale MCP authentication and write-access TODOs were removed after their implementations were verified. Bearer-token auth, scoped session grants, and the `task_write` capability profile remain covered by the current MCP contracts.

**[MEDIUM] The two largest MCP modules have no unit-level test seam.**
`mcp-handlers.cjs` (1501 lines) and `mcp-registry.cjs` (1085 lines) — plus `mcp-resource-handlers.cjs`, `mcp-response.cjs`, `mcp-audit-adapter.cjs` — have no colocated `*.test.cjs`. Coverage exists only through `mcp-http-server.test.cjs` (2434 lines, transport-level integration) and `mcp-fixtures.test.cjs`. Defensible for a thin dispatcher, but at 2600+ combined lines these are the actual domain-translation modules for MCP; a regression inside them is only caught by exercising the full HTTP path, which makes failures harder to localize (locality loss).

### Goals

**[UNVERIFIED]** `goals-control-flow-nodes.md` was not cross-checked against `goal-lifecycle-service.cjs` (1050 lines) / `goal-state-service.cjs` (428 lines) / `goal-policy.cjs` (275 lines) in this pass. No size/coverage red flag surfaced in the survey (`goal-lifecycle-service.cjs` has a 597-line colocated test), but this area deserves a dedicated follow-up before being called clean.

### Task Collaboration

**[LOW] `task-orchestration-and-multi-agent-collaboration.md` is marked "proposed architecture for human acceptance" but is already fully implemented.**
`electron/domain/task-collaboration-service.cjs` and `task-collaboration-lifecycle-service.cjs` exist, are tested, `TaskContributionV1`/`TaskCollaborationV1` are live types consumed by `TaskExecutionAction.tsx` (`task.collaboration?.contributions`). This is a documentation-status gap, not a code gap — low risk, but worth fixing so a future reader doesn't assume the feature is still unbuilt and re-propose it.

### Workspace Store / Persistence

**[NONE — target met]** The modularization plan's stated targets (`workspace-service.cjs` and `workspaceStore.tsx` split) landed: `workspace-service.cjs` 4037→1974 lines, `workspaceStore.tsx` 825→286 lines, with a real hydration/persistence/actions/selectors split (`workspaceHydration.ts` 333, `workspacePersistence.ts` 133, `workspaceActions.ts` 251, `workspaceSelectors.ts` 50 lines).

**[MEDIUM] The dual-write persistence path is still live in code, not just flagged in docs.**
`electron/services/workspace-service.cjs:1157` — `// TODO(next-phase): unify storage source of truth. The renderer currently persists...`. This confirms reconciliation item #7 above (localStorage + electron-store dual-write, mirrored back independently on hydration) is a present-tense code fact, not a resolved historical risk.

**[MEDIUM] Most of the store split has no colocated test.**
Of the nine files under `src/app/store/`, only `workspaceHydration.ts`, `workspaceMutations.ts`, and `workspaceSelectors.ts` have tests. `workspaceStore.tsx`, `workspaceActions.ts`, `workspacePersistence.ts`, `workspaceSubscriptionStore.ts`, `stateInventory.ts`, and `uiLayoutStore.tsx` (504 lines — the largest untested file in the store layer) do not. Some of this may be indirectly exercised via `app-hooks.test.ts`; unverified.

**[FLAGGED FROM DOC, NOT RE-VERIFIED] Renderer-wide re-render risk.** `storage-architecture-review.md` states task persistence rewrites the entire tasks array on every React state change, independent of storage backend — i.e. switching to SQLite would not by itself fix this. Not independently profiled in this pass; carried forward as a real, doc-asserted architecture risk.

### IPC Layer

**[NONE — target met]** `domain-service-protocol-contract-baseline.md` flagged `main.cjs` for inlining store/Goal/export/attachment/external-link/MCP-restart IPC directly. Current `main.cjs` (705 lines) has exactly one raw `ipcMain.on` (a renderer-diagnostic channel); everything else routes through 10 `register*IpcHandlers` calls into dedicated `electron/ipc/*.cjs` files, each genuinely thin (8–121 lines; `agent-runtime.cjs` at 121 is the largest). The "IPC registrars are thin" claim now in `AGENTS.md` holds. The remainder of `main.cjs`'s bulk is dependency-injection wiring for the session runner and registrar payloads — plausible composition-root weight rather than a violation, but the file wasn't read end-to-end, so treat as **lightly verified**.

### Cross-cutting / Testing

**[MEDIUM] Largest untested domain module: `electron/domain/milestone-service.cjs` (542 lines, no test).** Full CRUD/membership/scheduling/task-link domain logic with zero colocated coverage — the single biggest test-seam gap in `electron/domain/`. (`protocol-error.cjs`, 25 lines, also untested but low-risk given its size.)

**[HIGH — cleanest finding, doc actively misleading] `docs/architecture/codex-watcher-handoff.md` documents a feature that has been fully removed from the codebase.**
The doc (status: "proposed implementation contract") cites `src/app/hooks/useAgentWatchRuntime.ts` as "current evidence" for its proposal. That file does not exist. Confirmed directly: `src/app/hooks/app-hooks.test.ts:16` stubs it as `const useAgentWatchRuntime = (() => { throw new Error('removed'); }) as any;`, and the two tests that exercise it are `test.skip('removed agent watch runtime', ...)` (line 901) and `test.skip('removed agent watch actions', ...)` (line 1038). A repo-wide grep for `CodexWatcherHandoff`, `dedupeKey`, `agent.handoffs`, `handoffs.claim`, `handoffs.acknowledge` returns zero matches outside this one doc. The entire proposed contract (lease/claim state machine, dedupe key, handoff list/claim/acknowledge/fail IPC surface) has nothing to attach to — the feature it builds on was removed, not merely renamed. Anyone picking up this doc today would be building on a foundation that no longer exists. **Recommend**: either archive/delete this doc or rewrite its "current evidence" section against what actually exists today, before anyone starts implementation work from it.

## Unverified (out of scope for this pass)

- `goals-control-flow-nodes.md` vs. actual goal-node execution code — not cross-checked in depth.
- `visual-token-audit.md` — not read (design-token audit; orthogonal to this structural/vocabulary audit, flagged as skipped rather than silently omitted).
- Whether `mcp-observability-event-contract.md`'s field allow-list is actually enforced in `mcp-audit-adapter.cjs` (i.e., no extra fields leak into `omvra.mcp.audit.v1`) — only the contract doc was read, not verified against the adapter implementation.
- `electron/main.cjs`'s full 705-line body — sampled, not read end-to-end.
- Whether the renderer-wide re-render claim in `storage-architecture-review.md` still reproduces today.

## Suggested triage order

1. **`codex-watcher-handoff.md`** — cheapest fix (archive or rewrite), highest confusion risk if left as-is.
2. **Session-state derivation duplication** (`AgentSessionSupervisor` / `TaskExecutionAction`) — the real structural fix; everything else in this list is either already-flagged-and-tracked debt or a test-coverage gap, but this one is a live correctness/drift risk between two UI surfaces showing the same session to the user.
3. **Dual-write persistence path** — already tracked twice in prior docs; this audit just confirms it's still live in code at `workspace-service.cjs:1157`.
4. Test-seam gaps (`mcp-handlers.cjs`, `mcp-registry.cjs`, `milestone-service.cjs`, most of `src/app/store/`) — lower urgency, but each is a place where a regression currently has no focused signal.
