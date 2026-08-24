# Cross-surface visual and accessibility QA matrix

Date: 2026-08-16; updated 2026-08-24
Checkout: `/Users/sorin.jurcut/Documents/GitHub/Plumy`  
Scope: P0.4 in `docs/plans/OMVRA-POLISH-TASK-LIST.md`  
Disposition: **in progress; desktop browser sweep, narrow-width/reduced-height sweep, and a refined keyboard pass are complete. Packaged Electron/live-provider execution states and the pre-existing Goals execution-route gap (F2) remain the explicit outstanding items.**

This matrix separates source/test evidence from manual rendered evidence. A build or source inspection is not recorded as a manual visual pass.

## Environment and evidence limits

- 2026-08-16 session: rendered Omvra Vite renderer at `http://127.0.0.1:5173/` in the Codex in-app browser at a fixed 1280×720 (no viewport resize or media-feature emulation available). Screenshots `01`–`22` and DOM snapshots from that run are stored outside the repository at `/private/tmp/omvra-cross-surface-qa-2026-08-16/` (ephemeral; not preserved between sessions).
- 2026-08-24 session: rendered the same Vite renderer in the Claude Code Browser pane, which **does** support viewport resize (`resize_window`, including sub-768px which switches to full mobile-device emulation — Android Chrome UA, touch, higher DPR — so only the 768–1280px range is representative of a resized **desktop** Electron window) and real keyboard/mouse input dispatch. It does **not** expose `prefers-reduced-motion` (or any other media-feature) emulation, so M1 remains verified at the source level only, not at runtime.
- Production renderer build: `npm run build` passed on 2026-08-24 after the fixes below; Vite transformed 2309 modules, 590ms.
- Automated workspace contracts (2026-08-24): `npm run test:workspace-contracts` — 49 pass, 2 fail, 2 skip (53 total). The 2 failures are the **pre-existing, unrelated** stale assertions in `agentSessionSupervisor.test.ts` already tracked as a separate follow-up (`task_e2d4fbe3`, from the O.3 regression-coverage task) — confirmed via `git status` that this session touched only `src/styles/components.css` and `src/app/components/AnchoredPanel.tsx`, neither of which that test file exercises. The 6 targeted regression-coverage test files added under O.3 (25 assertions covering task execution, Timeline, Roadmap, Goals runtime, Settings feedback, and shared empty/error/blocked primitives) plus `goalCanvas.test.ts` and `onboarding.test.ts` all pass (25/25) after today's fixes.
- The 2026-08-16 in-app browser did not expose viewport resizing or reduced-motion emulation, leaving N1 (narrow-width/reduced-height) fully unverified and K1 (keyboard) only partially verified. The 2026-08-24 session closed N1 (see below) and refined K1, but reduced-motion (M1) and packaged-Electron execution states remain blocked by tooling, not by product behavior.

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
| N1 | Narrow width + reduced height | Repeat T1–T9 at a narrow desktop width (768–1280px) and reduced window height (as low as 420–480px); check clipping, overflow, overlap, unreachable actions, and scroll traps. | 2026-08-24: swept Timeline, Kanban, Roadmap, Goals (canvas + inspector), Task Details/Edit, Settings, and the agent-execution preflight sheet at 700/768/820/900/960/1024/1280 width and 420/480/650/720 height, using measured `getBoundingClientRect`/`elementFromPoint` checks alongside screenshots. Found and fixed two real defects (F6, F7 below). No BrowserWindow `minWidth`/`minHeight` is set in `electron/main.cjs:393-395`, so a real user can resize below any of the tested floors — see F8. | F6/F7 High, fixed; F8 Medium, accepted | Frontend QA | Pass (with F8 accepted) |
| K1 | Keyboard | Repeat primary flows with Tab/Shift+Tab/Enter/Space/Escape; verify order, visible focus, dialogs, menus, popovers, forms, canvas controls. | 2026-08-24: confirmed onboarding's custom Tab-trap (boundary wraparound), Escape-to-dismiss with correct focus return, and ArrowLeft/ArrowRight slide navigation all work correctly end-to-end via real dispatched key events (verified with a page-level keydown logger, not just visual inspection). Two apparent failures — Enter/Space not activating the focused "Next" button, and a Shift+Tab that behaved like a plain Tab — were root-caused to the Browser pane tool itself: its synthetic key dispatch for `Return`/`Right` produces `KeyboardEvent.key === ''` (fixed by using the exact key names `Enter`/`ArrowRight`), and its `modifiers: "Shift"` parameter did not set `event.shiftKey` at all in any key press tested. With `key: "Enter"` correctly set, the standard browser default action (native Enter/Space activates a focused `<button>`) still did not fire — this is standard, unmodified HTML button behavior with no app-level code involved, so it reads as a tool/environment limitation (synthetic input not reaching the native activation path) rather than a product defect, but it means this tool **cannot** confirm native Enter/Space button activation or Shift+Tab reverse traversal for any surface. A human should spot-check Enter/Space and Shift+Tab with a real keyboard as a final confirmation. | — | Frontend QA | Partial pass; 2 tool-limitation caveats documented |
| M1 | Reduced motion | Enable `prefers-reduced-motion: reduce`; open/close dialogs, change views, expand menus, and start/stop work; verify state remains understandable. | 2026-08-24: neither available browser tool exposes `prefers-reduced-motion` emulation, so runtime behavior is still unverified. Expanded the source audit: `src/styles/design-tokens.css:75-82` defines a global catch-all (`*, *::before, *::after { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; ... }`) under the media query, plus four more targeted blocks in `components.css`, `onboarding.css`, and `timeline.css`. No JS animation library (Framer Motion, GSAP, etc.) is a dependency (checked `package.json`), so there is no JS-driven animation path that could bypass the CSS override — the global rule should cover effectively all motion in the app. This is stronger, more complete source evidence than the prior pass, but is still not a substitute for a real emulated-media runtime check. | — | Frontend QA | Unverified at runtime; source coverage confirmed comprehensive |
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

### F6 — Roadmap toolbar's Today/scroll-navigation controls overlapped the filter row, sometimes fully blocking clicks (fixed and re-tested)

- Surface: Roadmap toolbar (`RoadmapToolbar.tsx`), all widths, worst at the standard 1280×720 baseline with an active filter.
- Reproduction: open Roadmap with today's date inside the visible range so the center Today/chevron cluster renders; at 1280×720 select any project filter (so the "Clear" button appears). The Today/chevron cluster becomes completely covered by the filter/actions row.
- Severity: High. Measured with `getBoundingClientRect`: at 1280×720 with a filter active, the center cluster's box (`x:582, width:116`) overlapped the actions row's box (`x:587, width:677`) by 111px. `document.elementFromPoint()` at the center of the Today button's own rect returned the filter's Select trigger, not the Today button — the control was not just visually obscured but **unclickable**. The same overlap reproduced at 1024, 960, and 820px even with no filter active; only the existing ≤760px "stacked" breakpoint (which switches the whole toolbar to a column layout) avoided it.
- Root cause: `.roadmap-toolbar-center` (`src/styles/components.css`) used `position: absolute; left: 50%; transform: translate(-50%, -50%)` to center itself over the *entire* toolbar width, ignoring how much of that space the search box and the right-aligned, `flex-wrap`-ping filter/actions row actually needed. The one existing narrow-width fallback only engaged at ≤760px, far below where the overlap actually began.
- Fix: `src/styles/components.css` — changed `.roadmap-toolbar-center` from absolute/transform-centered to a normal flex participant (`flex: 1 1 auto; justify-content: center; min-width: 0`), removed the now-unnecessary `pointer-events: none`/`.roadmap-toolbar-center > * { pointer-events: auto }` pair, and simplified the ≤760px media query to drop the now-irrelevant `position`/`transform` overrides. This makes the control reserve its own layout space so it can never overlap a sibling, at any width or filter state, while leaving the ≤760px stacked-column layout unchanged.
- Evidence: before/after `getBoundingClientRect` + `elementFromPoint` checks at 1280×720 (no filter and with an active filter), 1024, 960, 820, 768, and 700 (stacked); screenshots taken at each step during the session. `npm run build` and `npm run test:workspace-contracts` pass after the change (see Verification commands).
- Owner: Frontend (Roadmap toolbar).
- Decision: fixed and re-tested across the full measured width range.

### F7 — Settings category navigation clipped and made unreachable at reduced window height (fixed and re-tested)

- Surface: Settings → category sidebar (`AnchoredPanelNav` in `AnchoredPanel.tsx`, used by `SettingsPanel.tsx`).
- Reproduction: open Settings, resize the window to a reduced height (confirmed at 1280×480).
- Severity: High. The nav container had `overflow-y-hidden` unconditionally. Measured `scrollHeight: 635` vs. `clientHeight: 444` — 191px of navigation was clipped with no way to scroll to it (not merely visually cut, since `hidden` blocks scrolling entirely). The clipped categories were **Local data & backup**, **About & updates**, and **Help** — i.e., a user with a shorter window could not reach backup/restore controls, About, or Help from the sidebar at all.
- Root cause: the nav is shared between a narrow-width horizontal "pill" layout (`flex min-w-max`, needs `overflow-x-auto` and intentionally suppresses vertical scroll since content doesn't wrap there) and a wide-viewport vertical list layout (`sm:block`). `overflow-y-hidden` was applied unconditionally, correct for the horizontal mode but actively harmful in the vertical-list mode whenever the list is taller than the available height.
- Fix: `src/app/components/AnchoredPanel.tsx` — changed the nav's class from `overflow-y-hidden` to `overflow-y-hidden sm:overflow-y-auto`, so vertical scrolling is restored at the `sm:` breakpoint and above (where the vertical list layout applies) while the narrow-width horizontal-pill mode is untouched.
- Evidence: pre-fix `scrollTop` stayed at 0 with `overflow-y: hidden`, confirmed via computed style; post-fix `overflow-y: auto`, `scrollTop` reachable to 191 (the full clipped amount), "Help" confirmed reachable via `getBoundingClientRect` after scrolling. Re-checked the 600px-wide horizontal-pill mode still renders its own horizontal scrollbar with no regression. `npm run build` and `npm run test:workspace-contracts` pass after the change.
- Owner: Frontend (Settings / `AnchoredPanel`).
- Decision: fixed and re-tested at both the reduced-height (vertical list) and narrow-width (horizontal pill) layouts.

### F8 — No minimum window size is enforced on the Electron `BrowserWindow` (accepted, not fixed this pass)

- Surface: `electron/main.cjs:393-395` (`new BrowserWindow({ width: 1200, height: 800, ... })`).
- Reproduction: inspect the `BrowserWindow` constructor options — no `minWidth`/`minHeight` is set, so the OS enforces only its own (very small) default floor.
- Severity: Medium. This doesn't itself break any surface, but it means the "narrow-width/reduced-height" floor this and prior QA passes actually tested (roughly 768px width, ~420px height) is not a *guaranteed* floor — a user can resize below it, into a range no one has tested.
- Owner: Frontend / Electron shell.
- Decision: **accepted, not fixed in this pass.** This is a scope decision (window-chrome configuration), not a rendering defect, and out of the surface-by-surface scope of this QA pass; recommend a follow-up task to set an explicit `minWidth`/`minHeight` (e.g. ~960×600) on the main window so the tested floor is an enforced guarantee rather than a convention.

## Verification commands

```text
npm run build
npm run test:workspace-contracts
node --experimental-strip-types --experimental-specifier-resolution=node --test src/app/utils/goalCanvas.test.ts src/app/utils/onboarding.test.ts src/app/components/agentSessionSupervisor.test.ts
node --experimental-strip-types --experimental-specifier-resolution=node --test src/app/components/taskExecutionSurfaceRegression.test.ts src/app/components/timelineSurfaceRegression.test.ts src/app/components/roadmapSurfaceRegression.test.ts src/app/components/goalsRuntimeSurfaceRegression.test.ts src/app/components/settingsFeedbackSurfaceRegression.test.ts src/app/components/emptyErrorBlockedStatesRegression.test.ts
npm run dev:vite -- --port 5173
```

## Handoff

The production build and automated contracts are green (49/53 workspace-contract tests pass; the 2 failures are the pre-existing, unrelated `agentSessionSupervisor.test.ts` drift tracked separately as `task_e2d4fbe3`). This session closed the N1 (narrow-width/reduced-height) gap across Timeline, Kanban, Roadmap, Goals, Task Details/Edit, Settings, and the agent-execution preflight sheet, finding and fixing two real High-severity overlap/clipping defects (F6, F7) with measured before/after evidence, and accepted one Medium window-chrome gap (F8, no enforced minimum window size). The K1 (keyboard) pass confirmed onboarding's custom keyboard handling is correct and precisely root-caused two apparent failures to the browser-automation tool itself rather than the product (documented above) — a human should still spot-check native Enter/Space button activation and Shift+Tab with a real keyboard as a final, low-cost confirmation. M1 (reduced motion) has strong, now more complete source evidence (a global CSS catch-all plus targeted overrides, no JS animation library to bypass it) but remains unverified at runtime because neither available tool exposes media-feature emulation. The pre-existing Goals execution-route gap (F2) and packaged-Electron/live-provider execution states (working, needs-input, resume, cancel, review) remain the explicit, tracked outstanding items — request review with those two named as the remaining known risks, not as silently-closed gaps.
