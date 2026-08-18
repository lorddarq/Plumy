# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Omvra is an Electron desktop app for coordinating durable planning work (tasks, projects, milestones, Goals) between people **and AI coding agents** (Claude, Codex, and other ACP-conforming runtimes). It combines:

- **Timeline View**: A Gantt-chart-like calendar timeline for visualizing task schedules
- **Swimlanes View**: A kanban board for task status management
- **Goals / Roadmap**: A governed multi-step execution graph (dispatch, retry, evidence, human acceptance) that agents work against
- **Agent runtime supervision**: Launches and supervises local agent sessions (native ACP, Codex app-server, Claude stream-json) and exposes an MCP HTTP endpoint so those agents can read/write the workspace under policy

The app uses React, TypeScript, Tailwind CSS, and Vite for the frontend, with Electron for the desktop wrapper. See `docs/architecture/` for the authoritative design contracts referenced throughout this file — read those before making structural changes to runtime/session, Goal, or MCP behavior.

## Key Commands

### Development

```bash
npm install              # Install dependencies
npm run dev              # Start dev server (Vite on port 5173) + Electron with hot reload
npm run dev:vite         # Start Vite dev server only
npm run dev:electron     # Start Electron (requires Vite server running)
npm run dev:pages        # Marketing/pages site dev server (pages/vite.config.ts)
```

### Building

```bash
npm run build            # Build renderer only
npm run build:renderer   # Build with Vite
npm run build:electron   # Build with electron-builder
npm run build:pages      # Build the marketing/pages site
npm run dist             # Full production build (generate icons + build + electron-builder)
npm run generate:icons   # Generate app icons from source
npm start                # Run packaged Electron app
```

### Testing

There is no single `npm test`; run the suite that matches what you touched:

```bash
npm run test:mcp                 # electron/ main-process domain, service, and IPC .cjs tests (node --test)
npm run test:hooks               # src/app/hooks/*.test.ts (React hooks, TS via --experimental-strip-types)
npm run test:workspace-contracts # test:mcp + renderer store/hydration/selectors/mutations + backup + hooks + supervisor tests
npm run mcp:smoke                # scripts/mcp-smoke-test.mjs — end-to-end MCP HTTP smoke check
```

Electron-side tests are plain Node `.cjs` files colocated with their source (`*.test.cjs`), run via `node --test`, not a test framework — check an existing test file for the pattern before adding one. Renderer-side tests are `.test.ts`/`.test.tsx` run with `node --experimental-strip-types`.

### Diagnostics

```bash
npm run workspace:diagnostics         # Inspect the current on-disk workspace store
npm run workspace:export-diagnostics  # Export diagnostics to /tmp
npm run workspace:export-store        # Export the raw electron-store contents
npm run mcp:stdio                     # Run the MCP server over stdio (for local agent testing outside Electron)
```

## Architecture Overview

### Data Model

**Core types** (`src/app/types.ts`) — the file is large; key groups:

- `Task` / `TaskStatus` (`'open' | 'in-progress' | 'under-review' | 'done'`) / `TaskContributionV1` / `TaskCollaborationV1`: a task and its agent/human contribution attempts. Contributions carry their own lifecycle (`pending → working → submitted → accepted`, or `revision-requested` / `blocked`) independent of the parent task's status.
- `GoalRecord` / `GoalElement` (`goal | subgoal | agent | connector | instructions | condition | approval-gate | human-input | retry | artifact | deliverable`) / `GoalPolicy` / `GoalSchedule`: the governed multi-step execution graph agents are dispatched against, with budget/policy dimensions (`financial | tokens | concurrency | attempts | retries`) and scheduled recurrence.
- `Person` (`PersonKind`: `human | agentic`), `ProjectMilestone`, `StatusColumn` / `Swimlane`, `TimelineSwimlane`.
- Agent runtime types live in `src/electron.d.ts` (`AgentRuntimeProfile`, session/binding shapes) since they cross the IPC boundary rather than being pure app data.

**Data flow — this is not plain `useState` + localStorage.** The renderer keeps a structured store under `src/app/store/`:

- `workspaceStore.tsx` — the store/provider itself
- `workspaceHydration.ts` — loads persisted state into memory
- `workspaceSelectors.ts` — derived/read views over state
- `workspaceMutations.ts` — the only place state is written
- `workspaceActions.ts`, `workspacePersistence.ts`, `workspaceSubscriptionStore.ts`, `uiLayoutStore.tsx`, `stateInventory.ts`

Each of the above (except the provider/action glue) has a colocated `*.test.ts`. Treat this store as the source of truth for workspace state in the renderer; `App.tsx` composes hooks (`src/app/hooks/use*.ts`, one per concern — tasks, people, projects, status columns, MCP diagnostics, etc.) on top of it rather than owning raw state itself.

Persistence is **electron-store**, not raw browser `localStorage`, and it goes through the main process (`electron/services/workspace-service.cjs`) via IPC (`electron/ipc/store.cjs`), not directly from the renderer. Storage keys keep the version-suffix convention:

- `omvra.tasks.v1`, `omvra.swimlanes.v1`, `omvra.people.v1`, `omvra.milestones.v1`, `omvra.statusColumns.v1`, `omvra.preferences.v1`
- `omvra.taskContributionAttempts.v1`, `omvra.taskCollaborationEvents.v1`, `omvra.taskContextEntries.v1`
- `omvra.goals.v1`, `omvra.goalExecutions.v1`, `omvra.goalEvidence.v1`, `omvra.goalReconciliations.v1`, `omvra.goalScheduleOccurrences.v1`, `omvra.goalMutationCommands.v1`, `omvra.goalArtifactAudit.v1`, `omvra.goalProjectBindingAudit.v1`
- `omvra.agentRuntimeProfiles.v1`, `omvra.acpSessionBindings.v1` (agent runtime profiles and live session bindings)
- `omvra.mcp.audit.v1` (bounded, redacted MCP audit log)

A `__mcpRevision` field on governed records enforces optimistic concurrency for MCP-driven writes — do not bypass it.

### View Architecture

**TimelineView** (`src/app/components/TimelineView.tsx`):
- Calendar-based timeline with months displayed horizontally
- Tasks rendered as draggable blocks positioned by start/end dates; drag-to-resize changes dates
- Swimlanes are rows representing different project areas
- Uses `MonthsScrollerFixed` for horizontal month scrolling and `useVirtualizedTimeline` for large task counts
- Uses `react-dnd` for drag-and-drop

**SwimlanesView** (`src/app/components/SwimlanesView.tsx`):
- Kanban board with columns representing task statuses
- Supports drag-to-move between columns, reordering, and column reorder/rename/recolor
- Uses `react-dnd` with `HTML5Backend`

**Roadmap / Goals** (`src/app/domain/roadmap.ts`, `RoadmapToolbar.tsx`, `RoadmapMilestoneSidebar.tsx`, `MilestoneExecutionAction.tsx`): the milestone/Goal-oriented view where agent execution against a Goal graph is launched and supervised.

### Agent Runtime & Task Execution UI

- **`TaskExecutionAction.tsx`** is the central component for starting/supervising an agent session against a task: preflight checks (agent connection, working directory, model resolution), session lifecycle (start / resume / steer / cancel / close), a live activity feed, and permission-request handling.
- **`AgentSessionSupervisor.tsx`** is the app-level, singleton session supervisor (see `docs/architecture/agent-session-supervisor-and-concurrency.md`). Launch surfaces (Kanban, Roadmap, Timeline, Task Details, Goals) send an open/start *request*; they do not own the session's lifecycle, and closing a launch surface must not kill the session. Only one active agent session is allowed workspace-wide in the current release, enforced in the main process.
- **`RuntimePermissionCard.tsx`** / **`runtimePermissionResponse.ts`**: renders and answers structured permission/elicitation requests from a running agent (Codex-style `{decision}` vs ACP-style `{action, content}` responses differ — see `buildPermissionResponse`).
- Runtime profiles (`AgentRuntimeSettings.tsx`) configure exact executable path, fixed args, integration mode (`acp-local-stdio | codex-app-server-stdio | claude-stream-json-stdio | external-handoff`), and per-runtime options (Codex `approvalPolicy`, Claude `permissionMode`).

### shadcn/ui and Styling

- **shadcn/ui components**: `src/app/components/ui/` (Dialog, Button, Select, Sheet, etc.)
- **Styling**: Tailwind CSS v4 via the Vite plugin
- `src/app/utils/contrast.ts`: `getReadableTextClassFor(bgColorClass)` picks readable text color for a given Tailwind background class; always pair custom background colors with this.

### Electron Integration

**Main process** (`electron/main.cjs`) composes registrars from `electron/ipc/`, each owning one IPC surface:

- `store.cjs` — electron-store get/set/export
- `attachments.cjs` — file attachment pick/verify/embed
- `documents.cjs` — document handling
- `external-links.cjs` — `open-external` with protocol validation
- `agent-runtime.cjs` — agent runtime profiles, resolution, preflight, session start/resume/steer/cancel/close/respond, session listing/events
- `goals.cjs` — Goal lifecycle commands
- `mcp.cjs` — MCP server lifecycle/capabilities
- `task-context.cjs` — task-context ledger entries
- `runtime.cjs`, `performance.cjs` — misc runtime/perf endpoints

Business logic behind these registrars lives in `electron/domain/` (pure, heavily unit-tested: task-service, dependency-rules, agent-runtime-profile-service, agent-runtime-session-service, task-collaboration-*, task-context-*, milestone-service, protocol-error) and `electron/services/` (I/O adapters: agent-runtime-protocol-client — the native ACP/Codex/Claude stdio clients, agent-runtime-session-runner — the live session state machine, agent-runtime-environment, agent-runtime-mcp-grant, mcp-http-server / mcp-handlers / mcp-registry, goal-*-service, workspace-service, update-service, skill-service, performance-log).

**Preload** (`electron/preload.cjs`): bridges renderer → main IPC with context isolation enabled; typed on the renderer side in `src/electron.d.ts` under `window.electron`.

### Agent Runtime & MCP (read the architecture docs before touching this)

Two protocols are deliberately kept independent — do not couple them:

1. **Runtime/session protocol** (ACP, Codex app-server, Claude stream-json): local stdio child processes Omvra launches directly and supervises (`electron/services/agent-runtime-protocol-client.cjs`, `agent-runtime-session-runner.cjs`). Carries live turn state, prompts, permission requests, cancellation. A session ending/closing/crashing **never** submits, accepts, or completes task/Goal work — only explicit governed commands do.
2. **MCP** (`electron/services/mcp-*.cjs`): an HTTP endpoint Omvra exposes so an agent can read/write the workspace under policy (`read_only | task_write | admin` capability profiles). The selected runtime owns its own MCP registry/credentials; Omvra never injects `mcp_servers`/`--mcp-config` beyond exposing its one endpoint, and issues scoped bearer grants per session (`agent-runtime-mcp-grant.cjs`).

Authoritative contracts:
- `docs/architecture/acp-runtime-session-lifecycle-contract.md` — runtime profiles, session binding state machine, recovery/crash/cancel rules, MCP ownership boundary
- `docs/architecture/agent-session-supervisor-and-concurrency.md` — single-supervisor UI policy, launch routing, one-active-session concurrency rule
- `docs/architecture/task-orchestration-and-multi-agent-collaboration.md` — contribution attempts, evidence, revisions, dependencies, acceptance
- `docs/architecture/task-context-ledger.md`, `docs/architecture/mcp-observability-event-contract.md`, `docs/architecture/goals-control-flow-nodes.md`

## Development Patterns

### State Management

- Renderer: structured store (`src/app/store/`) with hydration/selectors/mutations split, consumed through per-concern hooks (`src/app/hooks/`) — not raw component state and not an external library like Redux/Zustand.
- Persistence: `electron-store` in the main process via IPC, versioned storage keys, `__mcpRevision`-guarded optimistic concurrency on governed records.
- Main process: domain (`electron/domain/`) vs. service/adapter (`electron/services/`) split; IPC registrars (`electron/ipc/`) are thin.

### Drag and Drop

- `react-dnd` for both Timeline and Swimlanes views; Swimlanes uses `HTML5Backend`.
- Task reordering updates the underlying array order.

### Dialog/Modal Patterns

- `TaskDialog`/task detail surfaces and `SwimlaneDialog` are controlled by open/close state; `selectedTask`/`selectedSwimlane` determines edit vs. create mode.
- Agent session panels use a Sheet (`ui/sheet`) and follow the supervisor pattern above — a launch surface requests a session, it does not own its lifecycle.

### Tailwind + Contrast

- Background colors for tasks/swimlanes are Tailwind classes (`bg-*`); pair with `getReadableTextClassFor()` for readable text.

## Build and Deployment

- **Vite**: path alias `@` → `src/`
- **Tailwind CSS v4 Vite Plugin**
- **Electron Builder**: macOS (dmg, pkg), Windows (nsis), Linux (AppImage)
- **Icons**: generated via `npm run generate:icons` before `dist`
- App ID: `com.omvra.app`, Product Name: `Omvra`

## Important Implementation Notes

1. **Storage keys**: always version-suffixed (`omvra.<name>.v1`); bump the suffix for schema migrations, don't mutate shape in place.
2. **Task IDs / revisions**: governed records carry `__mcpRevision`; every MCP-driven write must supply the current revision and respect rejection on mismatch.
3. **Runtime/session vs. task/Goal state are separate authorities**: never infer task completion, contribution acceptance, or Goal completion from ACP session/turn state alone — see the session lifecycle contract.
4. **One active agent session workspace-wide** in the current release; enforce and surface this, don't silently allow a second concurrent start.
5. **MCP configuration is provider-owned**: never inject `mcp_servers`/`--mcp-config`/credentials into a runtime launch beyond Omvra's own scoped endpoint grant.
6. **No provider credentials, raw prompts/responses, transcripts, or hidden reasoning** persist anywhere in workspace records, audit, or backup — only bounded, redacted summaries.
7. **Task visibility**: `swimlaneOnly` controls whether a task appears only in Swimlanes or in both views; `swimlaneId` optionally links a task to a timeline swimlane.
8. **Status colors**: Tailwind classes defined in constants; always pair with `getReadableTextClassFor()`.
9. **Error handling**: `electron/main.cjs` catches renderer crashes/load failures and surfaces them via dialog boxes.

## Recent Focus

Active development area (see `git log` for specifics) is the agent runtime/session layer: Claude stream-json integration hardening (MCP auth grants, `HOME` resolution for packaged launches, `--permission-mode` support), the `RuntimePermissionCard` UI for answering agent permission/elicitation requests, and `TaskExecutionAction` supervision polish. When working in this area, read `docs/architecture/acp-runtime-session-lifecycle-contract.md` and `docs/architecture/agent-session-supervisor-and-concurrency.md` first.
