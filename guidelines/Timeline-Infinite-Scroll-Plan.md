# Timeline: Infinite Scroll / Virtualization Plan ✅

**Author:** GitHub Copilot  
**Date:** 2026-01-31

---

## Summary 💡
This document diagnoses why the current `TimelineView` stops at a nearby month and proposes a concrete plan to implement a virtualized timeline that supports effectively infinite horizontal scrolling (both directions) while remaining performant and compatible with the current codebase.

Confidence: 0.78

---

## Findings / Diagnosis 🔍
- The visible timeline `dates` array is strictly derived from existing tasks and a small padding (PAD_DAYS = 7). When tasks are limited to a small range (or none) the date range is correspondingly small and the scrollable width is bounded to the generated months.
- `monthWidths` and `dayWidths` are eagerly computed for the visible `dates` and used to set `minWidth`/`minTotalWidth`. This constrains scrollable area to `totalTimelineWidth + endPadding`.
- The scrollers rely on `overflow:auto` containers (headerRef) and `scrollLeft` positions; there is no logic to extend dates or adjust scroll when the user reaches the edges.
- Because content is actually rendered into a single DOM tree for all months/days, trying to render a huge range would be expensive and memory/paint heavy.

Root cause: The timeline is *bounded by the generated date window* and not dynamically extended or virtualized, so scrolling cannot go beyond it.

---

## High-level options considered ⚖️
1. **Naive extension** - append more months when user reaches the edges. Simple but can grow DOM unboundedly and becomes slow.
2. **Windowed virtualization (recommended)** - keep a fixed-size buffer of dates (e.g., 200–400 days) and dynamically shift/extend the window as the user scrolls, adjusting offsets so the scroll is seamless. Only DOM nodes for visible window are rendered. This supports effectively infinite scroll without large DOM.
3. **Canvas-based rendering** - draw the timeline (headers, tasks) on Canvas for high performance. More complex when you need interactive HTML elements (tooltips, drag handles), and harder to integrate with existing DnD/DOM interactions.

Recommendation: implement Option 2 (Windowed Virtualization). It balances complexity, integrates with current DOM-based drag/resize behavior, and keeps task components intact.

---

## Design (Windowed Virtualization) 🧭
Goals:
- Support seamless horizontal scrolling in either direction.
- Keep memory and DOM nodes bounded by a configurable window size.
- Keep task positioning accurate and robust when the date window shifts.

Core ideas:
- Maintain a **logical center date** (e.g., anchored on `today` or a chosen origin). Represent timeline positions relative to that origin using integer day indices.
- Keep an in-memory window [startIndex, endIndex] that maps to concrete Date objects and day widths. Render only months/days inside it.
- Track a logical `globalOffset` (in pixels) that maps the visible window to the scroller container. Use absolute-positioned task elements placed by pixel offsets relative to the full logical timeline.
- When the user scrolls near the left/right buffer edge (e.g., within 20% of container width), shift the window by appending/prepending more days and incrementally update `startIndex`/`endIndex`. Adjust scroller `scrollLeft` so the transition is visually seamless (i.e., maintain visual continuity by shifting scrollLeft by the added/removed width).
- Debounce/throttle scroll handlers and update via requestAnimationFrame to avoid layout thrash.

Data structures:
- `windowStartDate` (Date) and `windowDays` (number) OR `startIndex` and `numDays` relative to origin day number.
- `dayWidth` mapping for window days (uniform or per-day measured); `prefixWidths` for fast left offset computation.

Performance:
- Keep `numDays` small (configurable, e.g., 240 = ~8 months at 30d/day) and a buffer to allow pre-fetching.
- Only render months/days that intersect visible area + small buffer.
- Virtualize swimlane rows if swimlanes count grows large (use viewport rows rendering only visible ones).

API/Integration concerns:
- Existing `getTaskPosition` already maps dates to left+width by indexing into `dates` / `dayWidths`. Replace with a function that can compute pixel offsets from an arbitrary global day index by using `prefix` sums of `dayWidths` over the current window and maintain a mapping for days outside the window if necessary.
- Drag & resize must work unchanged: provide `getTaskPosition` compatible outputs and implement hit testing within visible window; if the user drags a resize beyond the window edge, dynamically extend the window.

---

## Implementation Plan (step-by-step) 🛠️
Estimated total: 3–6 days depending on test coverage & polishing.

1. Add new state and helpers
   - Replace `dates` with window state: `windowStart: Date`, `windowDays: number` (e.g., 240), `dayWidths: number[]` (for window days), `prefixWidths`.
   - Provide helpers: `dateToIndex(Date): number`, `indexToDate(index: number): Date`, `indexToOffset(index: number): number`.

2. Render a virtualized months/days header
   - Compute which month columns intersect the visible view from `scrollLeft` + `clientWidth` and render those month elements.
   - Provide `minWidth` for inner timeline container based on `windowDays` and `dayWidths`.

3. Scroll handler to extend/shift window
   - On scroll, detect proximity to left/right edges (e.g., < 20% width). When close, prepend/append `N` days (e.g., a chunk size of 60 days) by updating `windowStart` and `windowDays`.
   - After shifting, compute the pixel delta caused by adding/removing days and adjust `scrollLeft` to keep visible content fixed (so user sees seamless extension).

4. Task mapping & rendering
   - Reimplement `getTaskPosition` to handle tasks outside current window: clamp or compute hypothetical offsets for tasks off-window; render only the visible ones or with overflow-hidden clipped.
   - Make task drag/resize operations trigger window extension when user drags/resizes beyond window edges.

5. Optional: Virtualize swimlane rows
   - If many swimlanes exist, render only visible rows (using container height and row height to compute start/end indices).

6. Testing & edge cases
   - Test with: empty tasks (scroll should still allow moving right/left), tasks far in future/past, resize actions extending beyond window, rapid scroll and chaining shifts, and accessibility (keyboard scrolling). Add unit tests for the indexing helpers.

7. Polish
   - Tune buffer sizes, chunk sizes, throttle/duration parameters for best UX.
   - Add visual indicators during extension if necessary (e.g., subtle loading shimmer while recalculating widths).

---

## Pseudocode (core scroll/extend logic) 🧩
```ts
const BUFFER_PX = 400; // when user scrollLeft < BUFFER_PX or scrollRight < BUFFER_PX
const CHUNK_DAYS = 60; // how many days to add when extending

function onScroll(e) {
  const scroller = headerRef.current;
  const left = scroller.scrollLeft;
  const width = scroller.clientWidth;
  const max = scroller.scrollWidth - width;

  if (left < BUFFER_PX) {
    // prepend days
    prependDays(CHUNK_DAYS);
    const addedWidth = measureWidthOf(CHUNK_DAYS);
    // shift scroll so visual content remains steady
    scroller.scrollLeft = left + addedWidth;
  } else if (max - left < BUFFER_PX) {
    appendDays(CHUNK_DAYS);
    // no need to shift scrollLeft when appending at right
  }
}
```

---

## Risk / Caveats ⚠️
- Precise pixel-perfect placement of tasks requires accurate day widths; if day width distribution changes (e.g., due to dynamic resizing) we must recalc prefix sums and adjust offsets. Use requestAnimationFrame and minimal layout touches.
- The visible scroll container width and left column width influence the available visible range; keep updates decoupled from heavy reflows.
- Dragging across the window edge requires immediate extension, which must be smooth to avoid dropped events.

---

## Migration & Rollout Plan 🧭
- Implement behind a feature flag or controlled build toggle. Ship as an opt-in since it touches layout and scrolling semantics.
- Add unit tests for indexing, and E2E tests for scrolling, dragging, and resizes across the boundary.
- Incrementally enable and monitor performance (paint/CPU/memory) on representative datasets.

---

## Next Actions (concrete) 🔜
- [ ] Create `timeline-virtualization` branch.
- [ ] Implement indexing helpers, window state and a minimal PoC that extends right/left on scroll and updates scrollLeft accordingly.
- [ ] Replace current `dates` usage with windowed helpers and make `getTaskPosition` compatible.
- [ ] Add unit tests and basic E2E tests (integration test of dragging/resizing while extending window).
- [ ] Benchmark and tune chunk / buffer sizes.

---

If you want, I can scaffold the PoC changes now (create the branch and a small pull-request-ready change set). Say "scaffold PoC" and I will implement the initial windowing helpers and a minimal onScroll extension handler in `TimelineView`.

---

**Confidence:** 0.78  
**Key caveats:** Dates-to-offset mapping and accurate day width math are the trickiest parts; tests will be critical to catch off-by-one pixels and edge transitions.
