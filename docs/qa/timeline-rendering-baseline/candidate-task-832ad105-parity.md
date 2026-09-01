# Timeline display, interaction, and accessibility parity

Task: `task-832ad105-5336-477c-9432-884a87ff2a6b`

## Scope and evidence

- Control: `main` at `814a33659374171ae4f5d149e60f08aab80e6002` and `control-814a336.json`.
- Candidate: `candidate-task-832ad105-318e0f61.json` with matching environment metadata.
- Matrix: 100/1,000, 500/5,000, and 1,000/10,000 swimlane/task fixtures × weekends visible/hidden × default/resized month widths.
- Rendered checks: local standalone fixture in the Codex in-app browser at default, 720px narrow, and 360px effective 200%-zoom layout widths.
- Focused checks: Timeline geometry, row windowing, track allocation, task drop rules, pointer release, swimlane reorder math, accessibility surface contracts, deterministic fixtures, and keyboard date math.

## Parity matrix

| Contract | Control expectation | Candidate evidence | Result |
| --- | --- | --- | --- |
| Weekends visible/hidden | Seven-day and five-day modes preserve date geometry | All 12 benchmark scenarios completed; browser toggle changed `7 days` → `5 days` and mounted zero `.weekend` cells | Pass |
| Independent month/day widths | Per-month resizing and variable day widths remain shared by header and rows | Default/resized modes completed at every scale; trusted resize changed one month from 1,860px to 1,960px; focused geometry checks passed | Pass |
| Drag-across-days creation | Weekday ranges create one dated task; weekend cells reject creation | Trusted weekday drag emitted `2026-08-25` → `2026-08-27`; equivalent weekend drag emitted no event | Pass |
| Task move and resize | Date/snap math, previews, cancellation, update callbacks, and persistence remain intact | Pointer resize committed `2027-01-08` → `2026-09-29`; resize preview measured in all 12 scenarios; Arrow keys move, Alt+Arrow resizes start, Shift+Arrow resizes end; Escape clears preview/state without a commit. In the full Electron app, a keyboard move persisted to canonical `electron-store`, survived an Electron restart, and was then restored | Pass with manual cross-row DnD item |
| Swimlane reorder | Existing React DnD targets and reorder indexes remain intact | Shared window retains original row indexes; focused reorder checks pass; browser pointer synthesis did not activate React DnD | Manual trusted-DnD check required |
| Today, scrubbing, reveal, scrollbar | Existing navigation and horizontal behavior stay on their paths | Header scrub moved scroll `167531` → `167691`; scrollbar Home/Arrow/Today moved `168258` → `3960` → `4060` → `171431`; reveal-window geometry checks passed | Pass |
| Task actions and Start work | Edit, Start work, Delete, and Duplicate remain available | All four actions rendered in the context menu and are protected by a source regression check. Full Electron Start work passed preflight, resolved the Grazy project folder, opened the singleton supervision sheet, and accepted task instructions; the provider then reported an expired OAuth session before doing work | Pass |
| Status/color and text contrast | Existing status visuals retain readable text/outline behavior | Existing contrast utility checks pass; task accessible names now include human-readable status, dates, priority, and keyboard instructions rather than relying only on color/position | Pass |
| Focus and screen-reader wording | Virtual rows must not discard focused/active work | Selection, focus, and resize rows stayed mounted in all 12 scenarios; day headers announce full weekday/month/day/year; task updates use a stable polite status region | Pass |
| Reduced motion, narrow/high zoom | Motion preference and reflow remain usable | Reduced-motion source contract disables animation/transition/smooth scrolling; 720px and 360px effective-zoom layouts had document width equal to viewport, retained toolbar/custom scrollbar, mounted 9 rows, and logged no cold-load errors | Pass |
| Project and People modes | Both row models retain the same window and interactions | Browser switched Projects → People → Projects with the expected selected tab/heading; shared track-plan tests cover both row identity modes | Pass |
| Persistence failure boundary | Rendering optimization must not bypass workspace persistence | Timeline still emits the existing task/reorder callbacks; `useTaskActions.ts` and `workspacePersistence.ts` are unchanged from `main`. A focused forced-failure check verifies that rejection from Electron `storeSetMany` resolves through the existing portable localStorage mirror | Control-equivalent pass |

## Twelve-scenario structural result

- Authored rows remained 100, 500, and 1,000.
- Mounted rows stayed within 10–18 during vertical jumps.
- Blank frames: 0.
- Fixed/calendar alignment failures: 0.
- Resize preview: measured in 12/12 scenarios.
- Selection/focus/resize row retention: true in 12/12 scenarios.
- Task drag measurement: explicitly unavailable because synthetic HTML5 DnD is rejected by React DnD.

## Accepted differences and remaining manual checks

No candidate behavior difference was accepted or silently shipped.

The following require a human or a browser surface capable of trusted HTML5 DnD:

1. Drag one task across dates and then across People rows, including edge auto-scroll; confirm the destination date/assignee persists after restart.
2. Reorder a swimlane through before/after/end targets and confirm left/calendar alignment throughout the gesture.

Browser CUA, macOS Computer Use, and DOM-synthesized HTML5 drag all left React DnD unchanged, so neither trusted gesture is represented as passing. Until those two checks are completed, this task should not be represented as fully ready for human acceptance.
