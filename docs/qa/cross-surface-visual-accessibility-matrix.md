# Cross-surface visual and accessibility QA matrix

Date: 2026-08-16
Checkout: `/Users/sorin.jurcut/Documents/GitHub/Plumy`  
Scope: P0.4 in `docs/plans/OMVRA-POLISH-TASK-LIST.md`  
Disposition: **in progress; desktop browser sweep completed, constrained viewport and packaged Electron checks remain**

This matrix separates source/test evidence from manual rendered evidence. A build or source inspection is not recorded as a manual visual pass.

## Environment and evidence limits

- Rendered environment: Omvra Vite renderer at `http://127.0.0.1:5173/` in the Codex in-app browser at 1280×720. The dev server required permission to bind localhost, then remained stable for the sweep.
- Current-run evidence: accepted screenshots `01`–`22`, paired DOM snapshots, interaction state, and console checks are stored outside the repository at `/private/tmp/omvra-cross-surface-qa-2026-08-16/`.
- Production renderer build: `npm run build` passed after the fixes below; Vite transformed 2307 modules.
- Automated workspace contracts: `npm run test:workspace-contracts` passed: 264 MCP/main-process tests and 46 renderer/workspace tests passed, 2 skipped, 0 failed. Focused Goal/onboarding/supervision checks also passed 14/14.
- The in-app browser does not expose viewport resizing or reduced-motion emulation. Narrow-width, reduced-height, and reduced-motion behavior therefore remain **unverified**, rather than inferred from source.
- Browser preview cannot provide a live Electron runtime/provider session. The execution preflight failure state was inspected, but working, needs-input, resume, cancel, persistence, and review states still require a packaged Electron run.

## Coverage matrix

| ID | Surface / pass | Expected observation and reproduction | Actual / evidence | Severity | Owner | Result |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Timeline visual + interaction | Open Timeline; inspect first viewport, month/day headers, task blocks, lane controls; scroll horizontally; open and edit a task. | Desktop rendered pass captured in `01`, `05`, `06`, and `20`. Five right-navigation actions advanced `aria-valuenow` from 9060 to 10060 without a freeze; Task Details and Edit opened successfully. Direct gesture/drag and constrained-height coverage remain. | — | Frontend | Partial pass |
| T2 | Kanban visual + interaction | Open Kanban; inspect columns/cards, filters, sorting, drag targets; move a task and open details. | Desktop board captured in `02`; search filtering captured in `21` and correctly reduced the board to one matching card. Drag feedback, task move, and constrained width remain. | — | Frontend | Partial pass |
| T3 | Roadmap visual + interaction | Open Roadmap; inspect milestone rows, progress/status labels, task buttons, dependency affordances; open a task. | Desktop roadmap captured in `03`; task labels expose status and next action, and opening a Roadmap task produced the shared details dialog in `22`. Dependency editing and keyboard navigation remain. | — | Frontend | Partial pass |
| T4 | Goals visual + interaction | Open Goals; create/select a node, pan/zoom, open inspector, edit a form, trigger an error/status state. | Desktop empty state and create form captured in `04` and `15`. Creation exposed F5; fixed Goal and Subgoal placement is captured in `18` and `19`. Pan/zoom, connector error, reduced height, and the existing Goal execution route gap remain. | P1 follow-up | Frontend / runtime | Partial pass; High fixed |
| T5 | Task Details | Open details from Timeline, Kanban, and Roadmap; use action menu, comments, dependencies, attachments, and Start work. | Timeline and Roadmap entry paths rendered correctly in `05` and `22`; action menu routed to Edit and Start work. Sections were present and scrollable. Kanban entry, comment write, attachments, and dependency mutation remain. | — | Frontend | Partial pass |
| T6 | Task Edit | Open edit from each task entry point; tab through fields; submit valid and invalid values; inspect disabled/save feedback. | Shared Edit dialog rendered with visible initial focus and reachable controls in `06`. No data-changing submit was performed; the browser key API did not provide a reliable native Tab trace. | — | Frontend | Partial pass |
| T7 | Settings | Open Settings at default and anchored sections; scroll, toggle runtime/MCP controls, inspect backup/update/help feedback. | General and Help sections rendered in `07`; anchored Help navigation and onboarding replay worked. Runtime/MCP toggles, backup/restore, update behavior, and constrained-height scrolling remain. | — | Frontend | Partial pass |
| T8 | Onboarding | Replay onboarding; use close, Back, Next, Done, Escape, ArrowLeft/ArrowRight, and Tab; test narrow and reduced-height windows. | All five slides rendered (`08`–`10`); ArrowRight advanced to slide 2 and Next/Done completed the flow. Replay focus loss exposed F3; fixed focus visibly returns to Open preferences in `14`. Escape, full Tab loop, and constrained viewport remain. | — | Frontend | Partial pass; fixed |
| T9 | Agent execution | From Task Details, start work; inspect preflight, working, needs-input, failed/interrupted, resume, minimize/reopen, cancel, and review states. | Browser-preview Start work rendered the blocked preflight state in `11`/`12`, exposing F4. The corrected settled state and zero new console warnings are captured in `13`. Live provider/Electron lifecycle states remain. | P1 pending live run | Runtime / frontend | Partial pass; fixed preview state |
| N1 | Narrow width + reduced height | Repeat T1–T9 at a narrow desktop width and reduced window height; check clipping, overflow, overlap, unreachable actions, and scroll traps. | Blocked by the selected in-app browser: viewport resizing is not exposed. No simulated claim was substituted. | — | Frontend QA | Unverified |
| K1 | Keyboard | Repeat primary flows with Tab/Shift+Tab/Enter/Space/Escape; verify order, visible focus, dialogs, menus, popovers, forms, canvas controls. | ArrowRight navigation, initial dialog focus, visible focus rings, and onboarding focus return were verified. The browser key API did not produce a reliable native Tab sequence, so the full pass remains. | — | Frontend QA | Partial pass |
| M1 | Reduced motion | Enable `prefers-reduced-motion: reduce`; open/close dialogs, change views, expand menus, and start/stop work; verify state remains understandable. | The selected browser does not expose media-feature emulation. Source rules remain present, but runtime behavior is unverified. | — | Frontend QA | Unverified |
| C1 | Contrast + visual states | Inspect normal, selected, disabled, focus, error, warning, active, review, and status indicators; verify meaning is not color-only. | Desktop screenshots cover normal, selected, disabled, focused, blocked/error, and active/review labels. Status meaning is paired with text/symbols in the inspected states. Exhaustive pixel contrast and constrained-state coverage remain. | — | Design system / frontend | Partial pass |

## Findings and disposition

### F0 — Shared selector syntax regression (fixed and re-tested)

- Surface: workspace hydration/subscription consumers, indirectly affecting every renderer surface.
- Reproduction: run `npm run build` or `npm run test:workspace-contracts` with the malformed `else if` condition in `src/app/store/workspaceSelectors.ts`.
- Severity: High; the renderer could not build and three renderer/workspace test files could not parse.
- Evidence: initial build/test output; fixed condition at `src/app/store/workspaceSelectors.ts:29-35`; current build passed and workspace contracts passed with 264 MCP/main-process and 46 renderer/workspace tests green (2 skipped).
- Owner: Frontend / workspace state.
- Decision: fixed; no known remaining parser/build failure.

### F1 — Prior manual renderer blocker (resolved for desktop browser)

- Surface: all listed surfaces.
- Reproduction: the sandboxed bind still returns `listen EPERM`; the permitted localhost bind starts Vite successfully.
- Severity: no longer blocks the desktop browser sweep. It still limits constrained viewport and packaged Electron coverage.
- Evidence: current-run screenshots `01`–`22`, DOM snapshots, interaction checks, and build/test output.
- Owner: QA/release environment owner.
- Decision: desktop blocker resolved; N1, M1, and live Electron T9 remain explicit gaps.

### F2 — Existing Goals agent-execution route gap

- Surface: Goals and agent execution.
- Reproduction: open Goals and attempt to start/reopen Goal-node supervision through the same app-level flow used by task execution.
- Severity: P1 follow-up, already documented as an explicit release blocker in `docs/qa/acp-session-supervision-cross-surface-matrix.md`.
- Evidence: `GoalsView.tsx`, `GoalsRuntimeStatus.tsx`, and the existing ACP matrix; backend Goal-node lifecycle tests pass but do not prove a renderer route.
- Owner: frontend/runtime.
- Decision: unresolved; do not request review as if cross-surface execution coverage were complete.

### F3 — Replayed onboarding lost focus after completion (fixed and re-tested)

- Surface: Settings → Help → Restart Onboarding.
- Reproduction: restart onboarding from Settings, navigate to slide 5, choose Done, then inspect the active control.
- Severity: Medium accessibility defect; keyboard users returned to the document body because the original Settings button was removed before onboarding captured focus.
- Evidence: pre-fix active element was `BODY`; post-fix DOM marks `Open preferences` active and screenshot `14` shows its visible focus ring.
- Owner: Frontend accessibility (`OnboardingDialog.tsx`).
- Decision: fixed by restoring focus to the previous connected control or the persistent Open preferences control on the next frame; focused test and rendered retest pass.

### F4 — Browser-preview execution preflight never settled visually (fixed and re-tested)

- Surface: Task Details → Task actions → Start work with no Electron runtime or configured working directory.
- Reproduction: open Start work in the browser preview and wait for preflight to settle.
- Severity: Medium; the sheet announced Action needed while the working-directory card remained at Resolving and emitted a session-refresh warning.
- Evidence: screenshots `11`/`12` before; screenshot `13`, DOM text `Not configured`, and zero new warn/error logs after.
- Owner: Frontend/runtime integration (`TaskExecutionAction.tsx`).
- Decision: fixed by representing the settled unavailable state explicitly and skipping session refresh when the Electron session API does not exist.

### F5 — Newly created Goal nodes were hidden and add-node selection referenced an undefined id (fixed and re-tested)

- Surface: Workflows → New goal and Goal toolbar → Add Subgoal/Add Agent.
- Reproduction: create a Goal; the selected card appeared mostly underneath the right inspector. The shared add-element and add-agent paths then called `setSelectedElementId(id)` even though only `element.id` exists.
- Severity: High; core Goal creation lacked visible confirmation and subsequent node creation could throw instead of selecting the new node.
- Evidence: screenshot `17` before; screenshots `18` and `19` after show the selected Goal/Subgoal centered and fully visible. `goalCanvasPanToCenterElement` unit coverage passes.
- Owner: Frontend Goals canvas (`GoalsView.tsx`, `goalCanvas.ts`).
- Decision: fixed in the shared creation paths; temporary QA Goals were deleted after each retest.

## Verification commands

```text
npm run build
npm run test:workspace-contracts
node --experimental-strip-types --experimental-specifier-resolution=node --test src/app/utils/goalCanvas.test.ts src/app/utils/onboarding.test.ts src/app/components/agentSessionSupervisor.test.ts
npm run dev:vite -- --host 127.0.0.1
```

## Handoff

The production build and automated contracts are green. The desktop browser sweep found and fixed one High and two Medium defects, with rendered before/after evidence. Do not request review yet: run N1 and M1 in a resizable browser or packaged app, finish the full native keyboard trace, and execute T9 through a configured Electron provider. F2 also remains an explicit P1 gap.
