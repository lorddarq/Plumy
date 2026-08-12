# Cross-surface visual and accessibility QA matrix

Date: 2026-08-11  
Checkout: `/Users/sorin.jurcut/Documents/GitHub/Plumy`  
Scope: P0.4 in `docs/plans/OMVRA-POLISH-TASK-LIST.md`  
Disposition: **partial; human rendered inspection required before review**

This matrix separates source/test evidence from manual rendered evidence. A build or source inspection is not recorded as a manual visual pass.

## Environment and evidence limits

- Production renderer build: `npm run build` passed after fixing the malformed shared equality condition in `src/app/store/workspaceSelectors.ts`; Vite transformed 2306 modules. Existing large-chunk warning remains for the main index chunk.
- Automated workspace contracts: `npm run test:workspace-contracts` passed: 260 MCP/main-process tests and 44 renderer/workspace tests passed, 2 skipped, 0 failed.
- Manual renderer launch was blocked in this environment: Vite could not bind to `127.0.0.1:5173` or `::1:5173` (`listen EPERM`), and browser policy rejected `file://` navigation to the built renderer.
- No screenshots, DOM snapshots, console logs, or live provider/Electron interaction evidence were collected. Those cases remain **unverified**.

## Coverage matrix

| ID | Surface / pass | Expected observation and reproduction | Actual / evidence | Severity | Owner | Result |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Timeline visual + interaction | Open Timeline; inspect first viewport, month/day headers, task blocks, lane controls; scroll horizontally; open and edit a task. | Renderer source and focused contracts exist (`TimelineView.tsx`, `TimelineToolbar.tsx`, timeline tests). Rendered layout, clipping, and interaction are unverified because the app could not launch. | — | Frontend | Unverified |
| T2 | Kanban visual + interaction | Open Kanban; inspect columns/cards, filters, sorting, drag targets; move a task and open details. | Renderer/workspace tests cover task and status behavior. Rendered board density, drag feedback, and narrow-width behavior are unverified. | — | Frontend | Unverified |
| T3 | Roadmap visual + interaction | Open Roadmap; inspect milestone rows, progress/status labels, task buttons, dependency affordances; open a task. | Source provides accessible task labels and visible attention labels (`RoadmapView.tsx:537-564`). Rendered overlap, scrolling, and keyboard path are unverified. | — | Frontend | Unverified |
| T4 | Goals visual + interaction | Open Goals; create/select a node, pan/zoom, open inspector, edit a form, trigger an error/status state. | Source exposes `role=status`/`role=alert`, labels, and focusable connector controls (`GoalsView.tsx`, `GoalsConnectorLayer.tsx`). Canvas ergonomics and narrow/reduced-height behavior are unverified. Existing ACP Goals launch-route gap remains tracked in `docs/qa/acp-session-supervision-cross-surface-matrix.md`. | P1 follow-up | Frontend / runtime | Unverified |
| T5 | Task Details | Open details from Timeline, Kanban, and Roadmap; use action menu, comments, dependencies, attachments, and Start work. | Existing renderer contracts cover request routing and app-level supervision ownership. Dialog focus, scroll reachability, and visual hierarchy are unverified. | — | Frontend | Unverified |
| T6 | Task Edit | Open edit from each task entry point; tab through fields; submit valid and invalid values; inspect disabled/save feedback. | Shared task form classes provide focus-visible styling; automated task creation/update contracts pass. Rendered field wrapping, validation feedback, and keyboard order are unverified. | — | Frontend | Unverified |
| T7 | Settings | Open Settings at default and anchored sections; scroll, toggle runtime/MCP controls, inspect backup/update/help feedback. | Settings components and workspace tests are present. Narrow panel scrolling, focus return, and visual separation are unverified. | — | Frontend | Unverified |
| T8 | Onboarding | Replay onboarding; use close, Back, Next, Done, Escape, ArrowLeft/ArrowRight, and Tab; test narrow and reduced-height windows. | Source implements dialog semantics, focus return, a tab loop, keyboard slide navigation, narrow/reduced-height CSS, and reduced-motion CSS (`OnboardingDialog.tsx:27-62`, `onboarding.css:29-31`). Rendered clipping and focus visibility are unverified. | — | Frontend | Unverified |
| T9 | Agent execution | From Task Details, start work; inspect preflight, working, needs-input, failed/interrupted, resume, minimize/reopen, cancel, and review states. | 260 main-process/MCP and 46 renderer/workspace tests pass; task supervision routing is covered. Live provider, Electron sheet, persistence/reopen, and visual state evidence are unverified. | P1 pending live run | Runtime / frontend | Unverified |
| N1 | Narrow width + reduced height | Repeat T1–T9 at a narrow desktop width and reduced window height; check clipping, overflow, overlap, unreachable actions, and scroll traps. | No rendered run possible. Static onboarding breakpoints and `min-h-0`/overflow patterns were inspected only. | — | Frontend QA | Unverified |
| K1 | Keyboard | Repeat primary flows with Tab/Shift+Tab/Enter/Space/Escape; verify order, visible focus, dialogs, menus, popovers, forms, canvas controls. | Source shows focus-visible rules and explicit onboarding/canvas keyboard handlers; no live focus trace was captured. | — | Frontend QA | Unverified |
| M1 | Reduced motion | Enable `prefers-reduced-motion: reduce`; open/close dialogs, change views, expand menus, and start/stop work; verify state remains understandable. | Global token rules reduce transitions/animations; Timeline, components, and onboarding have additional reduced-motion rules. Runtime behavior is unverified. | — | Frontend QA | Unverified |
| C1 | Contrast + visual states | Inspect normal, selected, disabled, focus, error, warning, active, review, and status indicators; verify meaning is not color-only. | Static evidence supports semantic labels/symbols in Roadmap, Goals, status bar, and attention utilities. Pixel contrast and every state combination are unverified. | — | Design system / frontend | Unverified |

## Findings and disposition

### F0 — Shared selector syntax regression (fixed and re-tested)

- Surface: workspace hydration/subscription consumers, indirectly affecting every renderer surface.
- Reproduction: run `npm run build` or `npm run test:workspace-contracts` with the malformed `else if` condition in `src/app/store/workspaceSelectors.ts`.
- Severity: High; the renderer could not build and three renderer/workspace test files could not parse.
- Evidence: initial build/test output; fixed condition at `src/app/store/workspaceSelectors.ts:29-35`; second build passed and workspace contracts passed with 260/260 and 44/44 tests green (2 skipped).
- Owner: Frontend / workspace state.
- Decision: fixed; no known remaining parser/build failure.

### F1 — Manual rendered sweep blocked by environment

- Surface: all listed surfaces.
- Reproduction: run `npm run dev:vite -- --host 127.0.0.1`; the server exits with `listen EPERM`. Attempting to inspect `dist/index.html` through the available browser is rejected by the browser URL policy.
- Severity: release-blocking verification gap, not a confirmed product defect.
- Evidence: command output from this run; no rendered screenshot/DOM/console evidence exists.
- Owner: QA/release environment owner.
- Decision: not accepted as complete. A human or permitted renderer environment must run N1/K1/M1/C1 and T1–T9.

### F2 — Existing Goals agent-execution route gap

- Surface: Goals and agent execution.
- Reproduction: open Goals and attempt to start/reopen Goal-node supervision through the same app-level flow used by task execution.
- Severity: P1 follow-up, already documented as an explicit release blocker in `docs/qa/acp-session-supervision-cross-surface-matrix.md`.
- Evidence: `GoalsView.tsx`, `GoalsRuntimeStatus.tsx`, and the existing ACP matrix; backend Goal-node lifecycle tests pass but do not prove a renderer route.
- Owner: frontend/runtime.
- Decision: unresolved; do not request review as if cross-surface execution coverage were complete.

## Verification commands

```text
npm run build
npm run test:workspace-contracts
npm run dev:vite -- --host 127.0.0.1  # blocked: listen EPERM in this environment
```

## Handoff

Automated contracts and production build are green. Static inspection found no confirmed critical/high visual defect and confirms several accessibility safeguards, but the required manual visual, narrow-width, keyboard, reduced-motion, contrast, and live agent-execution passes remain unverified. Before review, inspect the app in a permitted Electron/browser environment, capture screenshots/DOM or equivalent evidence for every matrix row, resolve or explicitly accept F2, then rerun the build and focused tests.
