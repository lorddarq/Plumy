# Omvra Architecture Audit

Original audit: 2026-08-18
Post-ACP reconciliation: 2026-08-26
Method: evidence-led module, interface, seam, adapter, ownership, and deletion-test review against `docs/architecture/*` and executable contracts.

This is a reconciled snapshot, not a backlog. The final decisions, retained exceptions, and regression matrix are authoritative in `docs/architecture/post-acp-consolidation-audit-and-execution-record.md`.

## Summary

The intended modular-monolith structure is now present: one Electron deployment and canonical desktop store, one renderer provider, thin IPC registrars, separate MCP and ACP adapters, and shared domain services. The Post-ACP pass removed unsupported facade exports, centralized renderer session projection, clarified persistence ownership, and added explicit runtime disposal and bounded-retention evidence.

The 2026-08-18 findings for duplicated renderer session projection, missing MCP handler/registry tests, stale MCP auth/write TODOs, missing shutdown disposal, unverified audit allow-list enforcement, and the live Codex watcher proposal are resolved. Remaining risks are explicitly retained below; none is an undocumented prerequisite for closing this milestone.

## Reconciled findings

| Original finding | Current disposition | Evidence |
| --- | --- | --- |
| Renderer session state was derived twice | Resolved | `projectAgentRuntimeSession` is consumed by `AgentSessionSupervisor.tsx` and `TaskExecutionAction.tsx`; focused renderer contracts lock the shared seam |
| Workspace persistence had unclear dual ownership | Resolved as ownership; fallback retained | `workspacePersistence.ts` owns renderer writes through `persistJSONBatchWithElectronMirror`; Electron-store is canonical on desktop and localStorage is the documented browser/failure mirror |
| Workspace facade carried transitional exports | Partially removed; bounded facade retained | 21 unsupported constants/helpers were removed; the exact supported facade and five compatibility constants are contract-tested |
| MCP/ACP shared ownership was unclear | Resolved | Protocol adapters remain independent; task/context/preflight/session rules and bounded failure/audit projection have named owners |
| `mcp-handlers.cjs` and `mcp-registry.cjs` lacked focused tests | Resolved | Both now have colocated tests and are included in `npm run test:mcp` |
| MCP auth/write TODO comments described unfinished work | Resolved | Stale comments are absent; bearer auth, scoped grants and capability profiles are tested |
| Renderer persistence TODO described localStorage as canonical | Resolved | The stale TODO was replaced with the current electron-store canonical/fallback boundary |
| Runtime shutdown/resource disposal was unverified | Resolved | `before-quit` calls idempotent runner disposal; client, subscription, timer, pending-request and binding reconciliation are tested |
| Runtime-event and MCP-audit growth/privacy were unverified | Resolved | Sustained storage retains 2,000 events; audit adapter exact-key negative control and dispatcher path pass |
| Codex watcher handoff doc described removed code as current | Resolved | The document is now an archived proposal and explicitly carries no implementation or compatibility authority |

## Current boundaries

### Agent runtime and sessions

`agent-runtime-session-service.cjs` owns provider-neutral durable bindings/events; `agent-runtime-session-runner.cjs` owns live provider clients and lifecycle; `agent-runtime-protocol-client.cjs` owns transport-specific protocol behavior. Renderer display state is centralized in `agentRuntimeActivity.ts`.

MCP and ACP modules have no cross-imports. The shared seam is the domain layer and bounded projection helpers, not either protocol transport.

`TaskExecutionAction.tsx` remains a large component. This is a maintainability risk, not duplicated session ownership after the projection extraction. Revisit only when another behavior change reveals a reusable owner.

### MCP

`mcp-registry.cjs` owns public names/aliases and capability classification; `mcp-handlers.cjs` owns tool translation; `mcp-http-server.cjs` owns HTTP/stdio dispatch and authorization; `mcp-audit-adapter.cjs` owns the persisted allow-list. Focused and integration tests cover each boundary.

### Workspace and persistence

`workspaceStore.tsx` is the renderer composition provider. Hydration, persistence, actions, selectors, and subscription publication are split into focused modules. In Electron, electron-store is canonical; localStorage is a portable/failure mirror. Canonical-first hydration, restart, backup, external synchronization, and shutdown-sensitive writes are tested.

The same-key concurrent local/external write path is still last-writer-wins, and hot array keys still use full read-modify-write. Both are documented exceptions. They require measured conflict/performance evidence and a separately approved storage decision, not an opportunistic cleanup migration.

### IPC and Electron composition

All invoke channels route through dedicated registrars with preload parity. `electron/main.cjs` owns dependency wiring, startup, store-change broadcasting, and shutdown. Its one raw `renderer/diagnostic` listener is intentionally retained until a second diagnostic channel or domain behavior justifies a registrar.

### Testing

`milestone-service.cjs` remains the largest domain module without a colocated focused test. Its behavior is exercised through workspace and MCP product-flow tests; add a direct test with the next milestone-domain behavior change or first uncovered regression.

The two skipped `useAgentWatchRuntime` hook tests are tombstones for removed behavior. They must not be counted as missing coverage for a current feature.

## Remaining architecture decisions outside this milestone

- Indexed/append-only storage for hot keys: revisit only with measured size or latency evidence.
- Multi-writer conflict resolution: revisit on a reproduced data conflict or an approved synchronization requirement.
- Browser/server runtime and host-capability abstractions: no current product requirement.
- Task relationship schema simplification: preserve compatibility until a migration is explicitly approved.
- Generic plugin system: still rejected; existing contract seams come first if a real extension requirement appears.
- Renderer-wide performance: profile render and IPC churn independently of any storage-engine proposal.

## Verification status

The final Post-ACP record reports the passing protected-contract, MCP, ACP, renderer product-flow, persistence/restart, IPC, cancellation, privacy, bounded-growth, lifecycle, build, syntax, and diff-hygiene gates. No stale architecture document now presents the removed watcher runtime as current functionality.
