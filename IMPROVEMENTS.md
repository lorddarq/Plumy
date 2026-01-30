# Timeline & Interaction Improvements

_Last updated: 2026-01-30_

This file captures actionable improvements discovered while debugging timeline scrolling, dragging, resizing and drop behaviors.

## High-priority items ✅

- [ ] **Refine extrapolation for out-of-range drops** 🔧
  - Use per-day widths at the timeline edges (instead of a single average) so drops far left/right snap more precisely to the actual day boundaries.
  - Owner: frontend
  - Files: `src/app/components/DraggableSwimlaneRow.tsx`, `src/app/components/TimelineView.tsx`

- [ ] **Auto-scroll / reveal newly created out-of-range task** 💡
  - After a drop that falls outside the current visible date range, scroll the timeline to show the newly created task and temporarily flash/highlight it.
  - Owner: frontend
  - Files: `src/app/components/DraggableSwimlaneRow.tsx`, `src/app/components/TimelineView.tsx`

- [ ] **Add unit & interaction tests for out-of-range drops and snapping** 🧪
  - Include tests for drop-to-past, drop-to-future, and snapping-to-nearest-day center behavior; add visual QA test(s) for the redraw/resize artifacts.
  - Owner: frontend / testing
  - Files: tests covering `DraggableSwimlaneRow`, `TimelineView`, and any helper utilities

## Medium-priority items ⚙️

- [ ] **Remove debug overlays/logs added during investigations** 🧹
  - Remove temporary outlines, console.debug messages, and capture-phase diagnostics once validated.
  - Owner: frontend
  - Files: `src/app/components/TimelineView.tsx`, `src/styles/index.css`

- [ ] **Add optional visual drop placeholder while dragging** ✨
  - Show a ghost indicator where a task would land while dragging (with snap preview to nearest day).
  - Owner: frontend
  - Files: `src/app/components/DraggableSwimlaneRow.tsx`, `src/app/components/DraggableTimelineTask.tsx`

- [ ] **Pass headerRef explicitly to row components** 🔗
  - Make the header scroller an explicit prop on rows to avoid DOM querying during drops and increase determinism.
  - Owner: frontend
  - Files: `src/app/components/TimelineView.tsx`, `src/app/components/DraggableSwimlaneRow.tsx`

## Low-priority / Nice-to-have 📝

- [ ] **Improve precision when extrapolating far outside the rendered timeline**
  - Consider bounding extrapolation to a configured number of days, or display a confirmation when the drop is extremely far out (safety guard).

- [ ] **Auto-expand timeline range on intentional drag near edges**
  - While dragging, if the pointer nears the left/right edge, progressively extend the timeline range (or enable keyboard modifiers for this behavior).

- [ ] **Performance: micro-benchmarks for rAF throttling & paint hints**
  - Confirm improvements and measure any regressions across typical macOS trackpad usage and large swimlane counts.

---

If you'd like, I can:
- refine the extrapolation implementation in-place (use per-edge day widths and tests) ✅
- implement auto-scroll + highlight for out-of-range drops ✅
- add tests and a visual QA harness for the timeline behavior ✅

---

Meta:
- Last updated: 2026-01-30
- Author: GitHub Copilot (Raptor mini (Preview))


---

Confidence: 0.87
Key caveat: extrapolation currently uses heuristics and should be precisely defined for edge cases (extremely far past/future drops).
