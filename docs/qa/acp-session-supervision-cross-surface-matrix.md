# ACP session supervision cross-surface QA matrix

Date: 2026-08-05  
Checkout: `fa83f35`  
Environment: macOS, Node/npm workspace, Electron/Vite renderer; automated checks ran in `/Users/sorin.jurcut/Documents/GitHub/Plumy`. Provider child processes were not launched by this matrix.

This is an evidence report for review, not product acceptance. The source of truth is [Agent Session Supervision, Launch Routing, and Concurrency](../architecture/agent-session-supervisor-and-concurrency.md).

## Matrix

| ID / case | Expected | Actual | Environment | Evidence | Severity |
| --- | --- | --- | --- | --- | --- |
| L1 Kanban start | Request reaches app-level supervisor before Task Details unmounts; supervision opens. | Pass by renderer contract test. | Node renderer source test | `src/app/components/agentSessionSupervisor.test.ts`: “Kanban task details routes before closing its source dialog” | P0 pass |
| L2 Roadmap start | Request reaches supervisor before milestone sheet closes. | Pass by renderer contract test. | Node renderer source test | Same test file: “Roadmap task rows request…” | P0 pass |
| L3 Timeline start | Timeline uses the same request-only supervisor boundary. | Pass by renderer contract test. | Node renderer source test | Same test file: “Timeline uses the same request-only launch boundary” | P0 pass |
| L4 Task Details start | Task Details requests supervision and does not own `TaskExecutionAction`. | Pass by renderer contract test. | Node renderer source test | `TaskDetailsDialog.tsx`, `agentSessionSupervisor.test.ts` | P0 pass |
| L5 Goals start | Goals must issue the same Goal-node supervision request and reopen the app-level supervisor. | **Not implemented in the renderer.** `GoalsRuntimeStatus` exposes execution status/reset only; no ACP start/open request is wired from `GoalsView` or Goal inspector. Backend `startGoalNode` exists and is tested. | Static renderer audit plus Node main-process test | `src/app/components/views/GoalsView.tsx`; `src/app/components/goals/GoalsRuntimeStatus.tsx`; `electron/services/agent-runtime-session-runner.goal.test.cjs` | P1 finding; explicit release blocker |
| V1 Close source dialog/sheet during startup | Parent surface may close without losing or cancelling the session request. | Pass by request-before-close tests; supervisor provider remains mounted in `App.tsx`. | Node renderer source test | `agentSessionSupervisor.test.ts`; `App.tsx` provider placement | P0 pass |
| V2 Hide active supervision | Hide must preserve runtime; cancel/close must not be called. | Pass by implementation inspection: sheet close only changes local visibility; explicit cancel/close are separate controls. | Static renderer audit | `TaskExecutionAction.tsx`: “Minimize supervision”, `runSessionOperation` | P0 pass pending live provider run |
| V3 Reopen hidden active session | Status dock must remain discoverable and reopen the same task binding. | Pass by renderer contract test and implementation inspection. | Node renderer source test | `agentSessionSupervisor.test.ts`; `AgentSessionSupervisor.tsx` registry polling/status dock | P0 pass pending live provider run |
| V4 Pending human input while hidden | Input request remains in main-process state and is visible after reopen. | Pass by runner test: request is persisted/projected, binding becomes `needs-input`, response returns it to active; dock polling remains active while hidden. | Node main-process + static renderer audit | `agent-runtime-session-runner.test.cjs` approval/elicitation case; `AgentSessionSupervisor.tsx` | P0 pass pending live provider run |
| V5 Provider failure/interruption | Child-process/transport loss becomes durable `interrupted` with bounded connection-lost evidence. | Pass by runner test and reconciliation implementation. | Node main-process test | `agent-runtime-session-runner.test.cjs` lines covering lifecycle exit; `reconcileBindingLoss` | P0 pass |
| V6 Resume | Interrupted session resumes only with supported capability and required workspace; task context is resent. | Pass by runner test. | Node main-process test | `agent-runtime-session-runner.test.cjs`: “resuming interrupted task work…” | P0 pass |
| V7 Cancel | Explicit cancel transitions through cancelling/interrupted and does not silently replace the session. | Pass by implementation and lifecycle tests; no live provider process run. | Node main-process/static audit | `agent-runtime-session-runner.cjs` `invoke`; session lifecycle tests | P0 pass pending live provider run |
| V8 Terminal provider completion | Provider completion must not mutate task/Goal acceptance and must release active capacity according to contract. | Pass for completed turn returning session to `ready`; task/Goal acceptance remains separate. A distinct terminal `complete` binding state is not modelled. | Node main-process test | `agent-runtime-session-service.test.cjs`: completed model turn; architecture state-ownership rules | P1 follow-up: clarify terminal-state mapping |
| C1 second task session | Second active task start is rejected with active binding and no second provider process. | Pass by runner and binding-service tests. | Node main-process test | `agent-runtime-session-runner.test.cjs`; `agent-runtime-session-service.test.cjs` | P0 pass |
| C2 task then Goal session | Goal-node start is rejected while task session is active. | Pass at backend contract level. | Node main-process test | `agent-runtime-session-service.test.cjs` cross-scope active binding case; `agent-runtime-session-runner.goal.test.cjs` | P0 pass backend / P1 UI gap |
| C3 Goal then task session | Task start is rejected while Goal-node session is active. | Pass at backend contract level; no Goals UI start path exists to exercise the real route. | Node main-process + static renderer audit | Same cross-scope tests; Goals renderer audit | P1 finding |
| R1 restart/reopen | Persisted interrupted binding is discoverable after app restart; missing in-process client offers explicit recovery. | Pass by runner test and backup persistence test; a real Electron restart was not run in this harness. | Node main-process/renderer contract tests | `agent-runtime-session-runner.test.cjs`; `workspaceBackup.test.ts` | P1 pending manual Electron restart |
| R2 status dock discoverability | Active/needs-input/interrupted/failed task sessions appear separately from configured-agent availability and are keyboard accessible. | Pass for task bindings by implementation/test; Goal bindings cannot be opened because the dock resolves only task IDs. | Static renderer audit | `AgentSessionSupervisor.tsx`; `agentSessionSupervisor.test.ts` | P1 finding for Goal scope |

## Verification commands

- `npm run test:workspace-contracts` — **247 main-process/MCP tests passed; 40 renderer/workspace tests passed; 0 failed**.
- `npm run build` — **production renderer build passed** (Vite transformed 2301 modules). Existing warning: `index` chunk is larger than 500 kB.

## Findings and disposition

1. **P1 — Goals has no renderer launch route.** The backend Goal-node session path is present, but the requested cross-surface lifecycle cannot be manually exercised from Goals and Goal sessions cannot be reopened through the current task-only supervisor dock. This remains an explicit release blocker, not accepted as complete.
2. **P1 — terminal-state naming needs product clarification.** Provider turn completion currently returns a session to `ready`; the architecture lists provider `complete`/finished as non-active. No data-loss behavior was observed, but the mapping should be clarified before claiming terminal-completion coverage.
3. **P1 — live provider/manual matrix remains pending.** This run did not spawn Codex or Claude child processes, close a real Electron dialog during startup, or restart the packaged app. Automated lifecycle evidence is attached; those manual cases remain unverified.

No high-severity data-loss behavior was observed in the executed automated checks. The P1 findings above are explicit and must be resolved or accepted by the product/release owner before task completion.
