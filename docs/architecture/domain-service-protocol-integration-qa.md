# Domain Service and Protocol Integration QA

Status: ready for human review  
QA date: 2026-07-29  
Task: `task-569f7fe7-2a1a-444d-9d4a-59a149463057`  
Milestone: `milestone-534be418-46f2-4b00-be39-df71e49fc3e4`  
Baseline commit: `b694c17`

## Result

The prerequisite modularization gate passes. The extracted Electron domain, MCP, renderer-store, and IPC boundaries retain their characterized public contracts, and the checked CommonJS dependency graph for those boundaries is acyclic. No adapter-owned task, milestone, or dependency validation rule was found.

This gate does not implement Multi-Agent persistence, the task-context ledger, or ACP. It records the seams those features must use and the compatibility facades that remain until the post-ACP consolidation milestone.

## Acceptance and regression matrix

| Protected behavior | Positive evidence | Negative or boundary evidence | Result |
| --- | --- | --- | --- |
| Domain dependency direction | Domain service factory tests and the modularization boundary test | `electron/domain/**` cannot import IPC, MCP services, Electron main, or renderer modules | Pass |
| Dependency graph and rule ownership | Dependency rules reject missing, self, and cyclic references | The modularization boundary test rejects adapter access to core task/milestone/person storage keys and duplicate dependency error ownership | Pass |
| Task and milestone revisions | Domain and workspace service tests cover successful and stale-revision writes | `__mcpRevision` remains the characterized optimistic revision field | Pass |
| MCP names, aliases, envelopes, transport, and audit | Registry, HTTP/stdio, fixture, response, and audit tests | Transport does not own task/milestone mutation rules; audit payloads remain bounded and redacted | Pass |
| Preload and IPC compatibility | Exact preload invoke-channel parity and registrar tests | Invalid Goal, document, attachment, link, and disabled-runtime inputs fail safely | Pass |
| Renderer hydration and persistence | Canonical hydration, persistence, selector, mutation, hook, and full renderer tests | Persistence waits for canonical hydration and suppresses reflected writes | Pass |
| Import/export and restart recovery | Workspace backup tests cover current, legacy, nested-store, Goal, agent configuration, and restart hydration paths | Duplicate Goal/element identifiers remain rejected | Pass |
| Goal and execution lifecycle | Full Electron service suite covers acknowledgement, dispatch, retries, evidence, acceptance, cleanup, scheduling, and runtime events | Missing skills, stale revisions, policy gates, unavailable agents, and unsafe cleanup remain fail-closed | Pass |
| Renderer build and visible behavior | All renderer tests and the production Vite build pass | No UI API, state-store, persistence key, or preload surface was introduced | Pass |

## Extension points

### Multi-Agent collaboration persistence

- Add collaboration record normalization, revision rules, contributor state transitions, and bounded evidence ownership as a focused domain service beside `electron/domain/task-service.cjs`.
- Inject persistence reads/writes at composition time. Reuse task lookup/revision behavior from the task service, dependency validation from `dependency-rules.cjs`, and canonical assignee/preflight behavior from `person-context-service.cjs`.
- Expose the new operations through the existing `workspace-service.cjs` compatibility facade while current MCP and IPC consumers migrate. MCP handlers remain translation/audit code and must not own contributor lifecycle rules.
- Add renderer persistence only through `workspacePersistence.ts`, actions through `workspaceActions.ts`, and derived reads through selectors. Keep one `WorkspaceStoreProvider`.

### Task-context ledger

- Add a focused domain module with injected storage, typed entry normalization, bounded retention, redaction, and task/contribution references.
- Resolve task and assignee context through the existing task/person services. A ledger entry cannot advance task, contributor, Goal, or acceptance state by itself.
- Extend backup/import and canonical hydration for any new versioned key before exposing writes. Do not store provider transcripts as the ledger.

### ACP runtime and adapters

- Compose a stateful ACP subprocess/session runtime from `electron/main.cjs` only when genuine process lifecycle requires it; expose renderer operations through a focused IPC registrar.
- The ACP adapter consumes shared task, person/preflight, collaboration, and ledger domain contracts. It must not call the MCP adapter, and MCP must not call ACP.
- ACP session closure, plans, elicitation, and capability events are adapter/runtime facts. They cannot complete Omvra work without the existing governed domain and human-acceptance transitions.
- Keep provider authentication and credentials inside the selected runtime. Persist only bounded Omvra-owned runtime/session references and normalized events.

## Retained compatibility facades

| Facade | Why it remains now | Post-ACP owner |
| --- | --- | --- |
| `electron/services/workspace-service.cjs` | Preserves the broad production/test export surface while task, milestone, dependency, and person/context rules delegate to domain factories | Remove transitional exports and duplicate logic in `task-d16a719f-76d6-4689-ae49-4c11906e2dc9`; settle domain ownership in `task-b723ba8f-974f-48f2-80e1-f9b7be4a2244` |
| `electron/services/mcp-http-server.cjs` | Preserves `startMcpHttpServer` and `createRequestDispatcher` for Electron and stdio while registry, handlers, envelopes, and audit are separate modules | Consolidate MCP/ACP adapter boundaries in `task-578d0c94-cd8b-4b3b-938a-376f5c034ba2` |
| MCP registry and audit access through `workspace-service.cjs` | Keeps prompt catalog and persisted audit compatibility without changing public MCP behavior during the prerequisite pass | Revisit in `task-578d0c94-cd8b-4b3b-938a-376f5c034ba2` |
| `src/app/store/workspaceStore.tsx` public provider/hook facade | Preserves one provider and the existing consumer contract while hydration, persistence, actions, and selectors remain separate | Slim composition after implemented ACP state is known in `task-f6f1e1f6-565e-4c21-bd05-87b2dda97b90` |

The MCP modules remain under `electron/services/mcp-*.cjs` rather than moving to a new path-only folder. This avoids import churn; the responsibility split, not directory naming, is the protected boundary.

## Command evidence

Executed from `/Users/sorin.jurcut/Documents/GitHub/Plumy` on 2026-07-29:

| Command | Result |
| --- | --- |
| `node --test electron/services/modularization-contract-baseline.test.cjs` | 8 passed, 0 failed |
| `node --test electron/domain/*.test.cjs electron/ipc/*.test.cjs electron/services/*.test.cjs` | 210 passed, 0 failed |
| Full renderer test discovery under `src/app` | 134 passed, 0 failed |
| `npm run test:mcp` | 171 passed, 0 failed |
| `npm run test:workspace-contracts` | 171 MCP/Electron checks plus 28 focused renderer workspace checks passed |
| `npm run build` | Passed; Vite reported the existing large-chunk advisory |

Live Omvra verification also confirmed that prerequisite tasks 2–6 are `done`; the three downstream implementation tasks for Multi-Agent persistence, context-ledger persistence, and ACP runtime profiles each retain this QA task in `dependencyIds`; and every facade owner named above is linked to `milestone-95f08263-5f1e-4fd8-890b-743121576db3`.

## Release readiness and uncertainty

- No dependency, storage, preload, MCP, or UI contract regression was detected.
- No new dependency, storage migration, process, provider SDK, or product behavior was introduced; rollback remains the internal module changes behind stable facades.
- Automated renderer behavior and the production renderer build were verified. A manual packaged-Electron visual pass was not run because this milestone changes architecture without a visible UI contract; human review may perform that optional smoke check.
- The prerequisite gate is ready for human acceptance. Post-ACP facade removal remains explicitly deferred to the tasks above and must not be inferred as complete here.
