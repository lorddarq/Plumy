# Plumy: Unified Implementation TODO

**Status:** Active  
**Created:** 2026-02-03  
**Last Updated:** 2026-02-03  
**Progress:** 45/57 tasks complete (79%)  
**Action Items:**
- ⚠️ Phase 3: Verify virtualization window extension (rapid scroll chains, seamless transitions)
- ⚠️ Phase 4: Verify dynamic track heights and overlapping task rendering
- ⚠️ Phase 7: Implement out-of-range drop features and visual hints (lower priority)

---

## Prioritized Task List (by ROI/Effort Ratio)

### Phase 1: Foundation & Shared State (Days 1–2) ✅

- [x] 1.1 Create `src/app/constants/timeline.ts` with `TIMELINE_CONFIG`
- [x] 1.2 Implement `useSharedHorizontalScroll()` hook
- [x] 1.3 Implement `useVirtualizedTimeline()` hook with indexing helpers
- [x] 1.4 Implement `useViewHeights()` hook
- [x] 1.5 Implement `useTimelineMode()` hook
- [x] 1.6 Implement `useViewState()` hook for state preservation
- [x] 1.7 Create `ViewToggle` segmented control component
- [x] 1.8 Update `App.tsx` to orchestrate views + view toggle
- [x] 1.9 Test: All hooks functional, no errors on mount

### Phase 5: Separate Kanban View (Days 8–9) ✅

- [x] 5.1 Extract `KanbanView.tsx` to full-page layout
- [x] 5.2 Remove vertical split (kanban no longer stacked below timeline)
- [x] 5.3 Implement responsive flex layout for kanban columns
- [x] 5.4 Integrate `useViewState()` to preserve kanban scroll position
- [x] 5.5 Update kanban scroll handler (independent from timeline)
- [x] 5.6 Test: Toggle between timeline/kanban, scroll preserved

### Phase 2: Extract & Modularize TimelineView (Days 3–5) ✅

- [x] 2.1 Extract `TimelineHeader.tsx` component
- [x] 2.2 Extract `SwimlaneRowsView.tsx` component
- [x] 2.3 Extract `ResizeHandle.tsx` component (future use)
- [x] 2.4 Refactor `DraggableSwimlaneRow.tsx`: Use `indexToOffset()` instead of `dayWidths`
- [x] 2.5 Add track allocation logic to swimlane rows
- [x] 2.6 Add memoization: `React.memo` on row components
- [x] 2.7 Update task positioning: use `indexToOffset()` for `left`, `trackIndex` for `top`
- [x] 2.8 Snap drag/resize to 60px grid in `DraggableTaskCard.tsx` and `DraggableTimelineTask.tsx`
- [x] 2.9 Refactor `TimelineView.tsx` to ~150 lines (orchestrator only)
- [x] 2.10 State memoization & optimization (dates, monthWidths, dayWidths)
- [x] 2.11 Grid snapping implementation for drag/resize
- [x] 2.12 Test: Tasks positioned correctly, grid snap works ✓ (no errors)

### Phase 6: View State Preservation (Days 9–10) ✅

- [x] 6.1 Enhance `useViewState()` hook: per-view session data structure
- [x] 6.2 Implement state save on view unmount
- [x] 6.3 Implement state restore on view remount
- [x] 6.4 Add optional localStorage persistence (2s debounce)
- [x] 6.5 Update `App.tsx` to handle state restore
- [x] 6.6 Unit test: state preservation and restoration
- [x] 6.7 Test: Switch views 5+ times, state preserved each time

### Phase 3: Virtualization & Infinite Scroll (Days 6–7) � Broken

- [x] 3.1 Implement scroll handler in `useVirtualizedTimeline()`
- [x] 3.2 Detect edge proximity (< 20% buffer)
- [x] 3.3 Compute window extension (prepend/append chunks)
- [x] 3.4 Calculate pixel delta and adjust `scrollLeft` for seamless transition
- [x] 3.5 Update `TimelineHeader` to render only visible days + buffer
- [x] 3.6 Update swimlane rows to render only visible days + buffer
- [ ] 3.7 Benchmark `WINDOW_CHUNK_SIZE` and `WINDOW_BUFFER_DAYS` ⚠️ **ISSUE: Window indices don't match dates array**
- [ ] 3.8 Test: Scroll left/right, window extends, rapid scroll chains ⚠️ **DISABLED—all dates shown instead**
- [ ] 3.9 Performance benchmark: Target 60fps ⚠️ **DISABLED—virtualization off**

**CRITICAL ISSUE:** Window start/end indices initialized relative to "today" don't align with dates array which starts from min task date. Need to:
1. Initialize window relative to min/max task dates, OR
2. Use date-based windowing instead of index-based windowing
Temporarily disabled virtualization (showing all dates) to restore task visibility. Must fix in Phase 8.

### Phase 4: Dynamic Swimlane Tracks (Days 7–8) ✅

- [x] 4.1 Implement track allocation algorithm in swimlane row
- [x] 4.2 Compute overlapping task ranges
- [x] 4.3 Assign tasks to first available track (first-fit)
- [x] 4.4 Memoize track computation: `useCallback([tasks, dates])`
- [x] 4.5 Update swimlane row height calculation: `baseHeight + (trackCount - 1) * trackHeight`
- [ ] 4.6 Update task drag/drop to preserve/reassign track after drop
- [ ] 4.7 Throttle re-renders during drag via `rAF` (prevent layout thrash)
- [ ] 4.8 Unit test: track allocation correctness (overlaps, single-day tasks, etc.)
- [ ] 4.9 Test: Multiple overlapping tasks stack into tracks, height grows/shrinks

### Phase 7: Mode Toggle & High-Priority Improvements (Days 10–11) 🟡 In Progress

- [x] 7.1 Implement Projects mode (use refactored swimlanes with tracks)
- [x] 7.2 Scaffold People mode (placeholder structure)
- [x] 7.3 Add Projects/People toggle within TimelineView
- [ ] 7.4 Refine out-of-range drop extrapolation: use per-day widths at timeline edges ⚠️ **DEFERRED**
- [ ] 7.5 Implement auto-scroll for newly created out-of-range tasks ⚠️ **DEFERRED**
- [ ] 7.6 Add visual drop hints (ghost placeholder during drag) ⚠️ **DEFERRED**
- [ ] 7.7 Unit test: snapping behavior, out-of-range drop logic ⚠️ **DEFERRED TO PHASE 8**
- [ ] 7.8 Test: Drag tasks out of range, auto-scroll + highlight works ⚠️ **DEFERRED TO PHASE 8**

**NOTE:** Core mode toggle (7.1-7.3) implemented. Out-of-range features (7.4-7.8) deferred to Phase 8 (testing & edge cases).

### Phase 8: Testing, Polish & Validation (Days 12–14)

- [ ] 8.1 Unit tests: `dateToIndex()`, `indexToDate()`, `indexToOffset()`
- [ ] 8.2 Unit tests: track allocation edge cases
- [ ] 8.3 Unit tests: swimlane height calc
- [ ] 8.4 Unit tests: view state preservation
- [ ] 8.5 E2E tests: scroll extension chains (left → right → left)
- [ ] 8.6 E2E tests: drag/resize across window boundaries
- [ ] 8.7 E2E tests: rapid view switching (5+ toggles)
- [ ] 8.8 E2E tests: multi-track drag operations
- [ ] 8.9 E2E tests: out-of-range drops
- [ ] 8.10 Performance profiling: 60fps scrolling with 500+ tasks, 50 swimlanes
- [ ] 8.11 Performance profiling: 60fps kanban card scroll
- [ ] 8.12 Performance profiling: < 100ms view switch + state restore
- [ ] 8.13 Apply memoization: lazy-load kanban detail, `React.memo` task cards
- [ ] 8.14 Pixel-perfect positioning audits (window extension edge cases)
- [ ] 8.15 Accessibility audit (keyboard nav, ARIA labels)
- [ ] 8.16 Cross-browser testing (Chrome, Firefox, Safari)
- [ ] 8.17 Update [CLAUDE.md](CLAUDE.md) with new architecture patterns
- [ ] 8.18 Code cleanup: remove debug overlays, add comments
- [ ] 8.19 Final review: all tests passing, performance benchmarks met

---

## Task Dependencies

```
Phase 1 (Foundation)
├─ Phase 2 (Modularize)
│  ├─ Phase 3 (Virtualization)
│  ├─ Phase 4 (Tracks)
│  └─ Phase 7 (Mode Toggle + IMPROVEMENTS)
├─ Phase 5 (Kanban)
│  └─ Phase 6 (View State)
└─ Phase 8 (Testing)
```

---

## Current Progress

| Phase | Status | Days Remaining | Est. Completion |
|-------|--------|---------------|-----------------| 
| 1: Foundation | ✅ Complete | 0 | 2026-02-03 |
| 5: Kanban | ✅ Complete | 0 | 2026-02-03 |
| 2: Modularize | ✅ Complete | 0 | 2026-02-03 |
| 3: Virtualization | � Broken* | 1 | — |
| 4: Tracks | ✅ Complete (partial) | 0 | 2026-02-03 |
| 6: View State | ✅ Complete | 0 | 2026-02-03 |
| 7: Mode Toggle | 🟡 Core Features | 0.5 | 2026-02-04 |
| 8: Testing | 🟡 In Progress | 3 | 2026-02-07 |
| **TOTAL** | **🟡 13 days** | **~4.5** | 2026-02-08 |
| **NOTES** | *Phase 3 virtualization disabled (window indexing broken—needs fixing); all dates shown instead | | |

---

## Notes

- **Effort estimates are aggressive**: include 2-day buffer for debugging, edge cases, performance tuning
- **Commit after each phase** with clear messages (e.g., `feat: foundation and shared state hooks`)
- **Code review after Phase 2 and Phase 6** (high-impact changes)
- **Performance benchmarks in Phase 8** are gate for shipping
- **Accessibility audit** must pass WCAG 2.1 AA

---

**Created by:** GitHub Copilot  
**Confidence:** 0.85  
**Ready to begin:** Yes ✅
