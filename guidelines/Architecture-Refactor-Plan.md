# Plumy: Architecture Refactor & Infinite Scroll Plan

**Date:** 2026-01-31
**Status:** Draft
**Confidence:** 0.85

---

## Executive Summary

This plan refactors Plumy's TimelineView from a 984-line monolith into a modular, performant architecture supporting:
- **Fixed day slot grid** (60px/day) for pixel-perfect task positioning
- **Infinite horizontal scroll** with virtualized date window
- **Modular components** (timeline, kanban, people) with shared scroll state
- **TimelineView mode toggle** (Projects ↔ People) with content swapping
- **Vertical resizing** between timeline and kanban board
- **Future PeopleView** (grouped by person, showing project swimlanes)

**Estimated Total Effort:** 7–10 days
**Phases:** 5 (Foundation → Refactor → Virtualization → Views → Polish)

---

## Current State Issues

### Architecture Problems
- TimelineView is 984 lines with mixed concerns (layout, state, rendering, interaction)
- Complex interdependent state: `dates` → `datesByMonth` → `monthWidths` → `dayWidths`
- 11+ useState calls, 8+ useEffect hooks with cascading updates
- Manual measurements with getBoundingClientRect scattered throughout
- Auto-sizing logic incompatible with infinite scroll concept

### Performance Issues
- All tasks rendered every update (no virtualization)
- All swimlanes rendered every update
- Cascading re-renders from state interdependencies
- Variable day widths require prefix-sum calculations for every task

### Layout Issues
- Left and right columns require complex scroll sync
- No resizing between timeline and kanban views
- Kanban board not responsive (columns have fixed width or awkward scaling)
- No mode switching (Projects ↔ People)

---

## Design Decisions

### 1. Fixed Day Slot Width
```ts
// Constants
const DAY_SLOT_WIDTH = 60; // px, universal constant
const HEADER_HEIGHT = 72;  // px (month + day row)
const ROW_HEIGHT = 48;     // px (swimlane row)

// Task positioning (simple)
taskPosition = taskStartDateIndex * DAY_SLOT_WIDTH;
taskWidth = (taskEndDateIndex - taskStartDateIndex) * DAY_SLOT_WIDTH;

// Window calculation (simple)
visibleDayCount = Math.ceil(viewportWidth / DAY_SLOT_WIDTH);
windowStartIndex = Math.floor(scrollLeft / DAY_SLOT_WIDTH);
```

**Benefits:**
- No dynamic dayWidths arrays to maintain
- Positioning is O(1) per task (single multiply)
- Virtualization becomes trivial (day indices instead of date calculations)
- All three views (timeline, kanban, people) use same scroll position

**Trade-off:** Fixed day width; if users need zoom, add it as separate feature (30px, 60px, 90px levels)

### 2. Modular Component Structure

**Current (monolithic):**
```
TimelineView (984 lines)
├─ Layout logic
├─ State management
├─ Task rendering
├─ Interaction handlers
└─ Swimlane management
```

**Proposed (modular):**
```
TimelineView (150 lines, orchestrator)
├─ useSharedHorizontalScroll() hook
├─ useVirtualizedTimeline() hook
├─ useViewHeights() hook
├─ useTimelineResize() hook
├─ useTimelineMode() hook
│
├─ TimelineHeader (month/day labels)
├─ SwimlaneRowsView (projects mode)
│  └─ DraggableSwimlaneRow (swimlane + tasks)
├─ PeopleRowsView (people mode, future)
│  └─ PersonGroup (person + project swimlanes)
└─ ResizeHandle (vertical divider)
```

### 3. Shared Scroll State

All views share one scroll position (managed at App level):
```ts
// App.tsx
const scroll = useSharedHorizontalScroll();

<TimelineView scrollLeft={scroll.scrollLeft} onScroll={scroll.handleScroll} />
<KanbanView scrollLeft={scroll.scrollLeft} onScroll={scroll.handleScroll} />
```

Benefits:
- TimelineView and KanbanBoard always in sync
- Future PeopleView automatic sync
- No complex event forwarding

### 4. Virtualized Date Window

Instead of fixed `dates` array, maintain a dynamic window:
```ts
// State
windowStartIndex: number   // day index of first visible day
windowDayCount: number     // how many days in window (e.g., 240 = ~8 months)

// Helpers
dateToIndex(date) → number // distance from epoch day
indexToDate(index) → Date  // convert back
indexToOffset(index) → number // pixel offset = index * DAY_SLOT_WIDTH

// Scroll handler
onScroll(scrollLeft) {
  const visibleDayCount = Math.ceil(viewportWidth / DAY_SLOT_WIDTH);
  const newStartIndex = Math.floor(scrollLeft / DAY_SLOT_WIDTH);

  // Extend left
  if (newStartIndex < BUFFER_DAYS) {
    prependDays(CHUNK_SIZE); // extend window left
    scrollLeft += addedPixels; // seamless transition
  }
  // Extend right
  else if (newStartIndex + visibleDayCount > windowDayCount - BUFFER_DAYS) {
    appendDays(CHUNK_SIZE); // extend window right
  }
}
```

### 5. TimelineView Mode Toggle

TimelineView supports two content modes:
```ts
type TimelineMode = 'projects' | 'people';

// State
const [mode, setMode] = useState<TimelineMode>('projects');

// Rendering
{mode === 'projects' && <SwimlaneRowsView {...props} />}
{mode === 'people' && <PeopleRowsView {...props} />}
```

Both modes:
- Share the same calendar header
- Use same horizontal scroll
- Use same day slots
- Support drag/reorder within mode

### 6. Vertical Resizing (Timeline ↔ Kanban)

```tsx
// App.tsx state
const [viewHeights, setViewHeights] = useState({
  timeline: 350,
  kanban: 400,
});

// User drags resize handle
handleTimelineResize = (delta) => {
  setViewHeights(v => ({
    timeline: Math.max(100, v.timeline + delta),
    kanban: Math.max(100, v.kanban - delta),
  }));
};

// Layout
<div style={{ height: `${viewHeights.timeline}px` }}>
  <TimelineView {...props} />
</div>
<ResizeHandle onResize={handleTimelineResize} />
<div style={{ height: `${viewHeights.kanban}px` }}>
  <KanbanView {...props} />
</div>
```

### 7. Kanban Responsiveness

```tsx
// Simple flex layout
<div className="kanban-view flex overflow-x-auto">
  {statusColumns.map(col => (
    <div
      className="kanban-column"
      style={{
        flex: '1 1 auto',     // Flex to fill
        minWidth: '200px',    // But not smaller
      }}
    >
      {/* Cards */}
    </div>
  ))}
</div>
```

If total min-width > viewport, columns naturally overflow with scroll.

---

## Data Model Changes

### Core Types (No changes to Task/TaskStatus)

```ts
// src/app/types.ts - existing, no changes
export type TaskStatus = 'open' | 'in-progress' | 'under-review' | 'done';
export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  notes?: string;
  startDate?: string;  // ISO string, no precision loss
  endDate?: string;
  color?: string;
  swimlaneOnly?: boolean;
  swimlaneId?: string;
}
export interface TimelineSwimlane {
  id: string;
  name: string;
  color?: string;
}
```

### New: Timeline Configuration

```ts
// src/app/constants/timeline.ts
export const TIMELINE_CONFIG = {
  DAY_SLOT_WIDTH: 60,        // px per day (universal)
  HEADER_HEIGHT: 72,         // px
  ROW_HEIGHT: 48,            // px
  WINDOW_BUFFER_DAYS: 60,    // days before extending window
  WINDOW_CHUNK_SIZE: 60,     // days to add when extending
  EPOCH_DATE: new Date(2020, 0, 1), // origin for day indices
} as const;
```

### New: Timeline Window State

```ts
// Internal to useVirtualizedTimeline hook
interface TimelineWindowState {
  windowStartIndex: number;  // day index of first day in window
  windowDayCount: number;    // how many days in window
}

interface TimelineHelpers {
  dateToIndex(date: Date): number;
  indexToDate(index: number): Date;
  indexToOffset(index: number): number; // pixel offset
  getVisibleDayIndices(scrollLeft: number, viewportWidth: number): [number, number];
  extendWindowLeft(days: number): void;
  extendWindowRight(days: number): void;
}
```

---

## Component Architecture

### New Hooks

#### `useSharedHorizontalScroll()`
```ts
// src/app/hooks/useSharedHorizontalScroll.ts
export function useSharedHorizontalScroll() {
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollerRefs = useRef<HTMLDivElement[]>([]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollLeft = e.currentTarget.scrollLeft;
    setScrollLeft(newScrollLeft);
    syncAllScrollers(newScrollLeft, scrollerRefs.current);
  }, []);

  const registerScroller = useCallback((ref: HTMLDivElement | null) => {
    if (ref && !scrollerRefs.current.includes(ref)) {
      scrollerRefs.current.push(ref);
    }
  }, []);

  return { scrollLeft, handleScroll, registerScroller };
}
```

#### `useVirtualizedTimeline(referenceDate?: Date)`
```ts
// src/app/hooks/useVirtualizedTimeline.ts
export function useVirtualizedTimeline(referenceDate = new Date()) {
  const [windowStartIndex, setWindowStartIndex] = useState(() => {
    return dateToIndex(referenceDate);
  });
  const [windowDayCount, setWindowDayCount] = useState(240);

  const dateToIndex = (date: Date): number => {
    const diff = date.getTime() - EPOCH_DATE.getTime();
    return Math.floor(diff / MS_PER_DAY);
  };

  const indexToDate = (index: number): Date => {
    const ms = EPOCH_DATE.getTime() + index * MS_PER_DAY;
    return new Date(ms);
  };

  const indexToOffset = (index: number): number => {
    return index * DAY_SLOT_WIDTH;
  };

  const handleScroll = (scrollLeft: number, viewportWidth: number) => {
    const visibleDayCount = Math.ceil(viewportWidth / DAY_SLOT_WIDTH) + 1;
    const newStartIndex = Math.floor(scrollLeft / DAY_SLOT_WIDTH);

    // Extend left
    if (newStartIndex < WINDOW_BUFFER_DAYS) {
      setWindowStartIndex(prev => Math.max(0, prev - WINDOW_CHUNK_SIZE));
    }
    // Extend right
    else if (newStartIndex + visibleDayCount > windowDayCount - WINDOW_BUFFER_DAYS) {
      setWindowDayCount(prev => prev + WINDOW_CHUNK_SIZE);
    }
  };

  return {
    windowStartIndex,
    windowDayCount,
    dateToIndex,
    indexToDate,
    indexToOffset,
    handleScroll,
  };
}
```

#### `useViewHeights()`
```ts
// src/app/hooks/useViewHeights.ts
export function useViewHeights() {
  const [heights, setHeights] = useState({
    timeline: 350,
    kanban: 400,
  });

  const handleResize = useCallback((delta: number) => {
    setHeights(prev => ({
      timeline: Math.max(100, prev.timeline + delta),
      kanban: Math.max(100, prev.kanban - delta),
    }));
  }, []);

  return { heights, handleResize };
}
```

#### `useTimelineMode()`
```ts
// src/app/hooks/useTimelineMode.ts
export type TimelineMode = 'projects' | 'people';

export function useTimelineMode() {
  const [mode, setMode] = useState<TimelineMode>('projects');

  return { mode, setMode };
}
```

### New/Updated Components

#### `TimelineView` (Refactored Orchestrator)
```tsx
// src/app/components/TimelineView.tsx
export function TimelineView({
  tasks,
  swimlanes,
  statusColumns,
  onTaskClick,
  onAddTask,
  onUpdateTaskDates,
  onEditSwimlane,
  onAddSwimlane,
  onReorderSwimlanes,
  onReorderTasks,
}: TimelineViewProps) {
  // Shared state
  const scroll = useSharedHorizontalScroll();
  const timeline = useVirtualizedTimeline();
  const { mode, setMode } = useTimelineMode();

  // Render
  return (
    <div className="timeline-view overflow-hidden">
      {/* Calendar header (fixed) */}
      <TimelineHeader
        windowStartIndex={timeline.windowStartIndex}
        windowDayCount={timeline.windowDayCount}
        indexToDate={timeline.indexToDate}
        scrollLeft={scroll.scrollLeft}
      />

      {/* Mode toggle */}
      <div className="flex gap-2 px-4 py-2 border-b">
        <button
          className={mode === 'projects' ? 'font-bold' : ''}
          onClick={() => setMode('projects')}
        >
          Projects
        </button>
        <button
          className={mode === 'people' ? 'font-bold' : ''}
          onClick={() => setMode('people')}
        >
          People
        </button>
      </div>

      {/* Content swap */}
      <div
        ref={(ref) => scroll.registerScroller(ref)}
        style={{ overflowX: 'auto', overflowY: 'hidden' }}
        onScroll={scroll.handleScroll}
      >
        {mode === 'projects' && (
          <SwimlaneRowsView
            tasks={tasks}
            swimlanes={swimlanes}
            windowStartIndex={timeline.windowStartIndex}
            windowDayCount={timeline.windowDayCount}
            indexToOffset={timeline.indexToOffset}
            onTaskClick={onTaskClick}
            {...handlers}
          />
        )}

        {mode === 'people' && (
          <PeopleRowsView
            tasks={tasks}
            people={people}
            windowStartIndex={timeline.windowStartIndex}
            windowDayCount={timeline.windowDayCount}
            indexToOffset={timeline.indexToOffset}
            onTaskClick={onTaskClick}
            {...handlers}
          />
        )}
      </div>
    </div>
  );
}
```

**Size: ~150 lines** (down from 984)

#### `TimelineHeader` (New Component)
```tsx
// src/app/components/TimelineHeader.tsx
export function TimelineHeader({
  windowStartIndex,
  windowDayCount,
  indexToDate,
  scrollLeft,
}) {
  // Compute which months/days are visible given scrollLeft
  const visibleMonths = useMemo(() => {
    // ... calculate months in window ...
  }, [windowStartIndex, windowDayCount]);

  return (
    <div className="timeline-header sticky top-0 z-40 bg-white border-b">
      {/* Month row */}
      <div className="flex">
        {visibleMonths.map(month => (
          <div key={month.key} style={{ width: `${month.width}px` }}>
            {month.label}
          </div>
        ))}
      </div>

      {/* Day row */}
      <div className="flex">
        {/* Render days for visible window */}
      </div>

      {/* Today marker */}
      <div className="today-line" style={{ left: `${getTodayOffset()}px` }} />
    </div>
  );
}
```

#### `SwimlaneRowsView` (New Component)
```tsx
// src/app/components/SwimlaneRowsView.tsx
export function SwimlaneRowsView({
  tasks,
  swimlanes,
  windowStartIndex,
  windowDayCount,
  indexToOffset,
  onTaskClick,
  ...props
}) {
  return (
    <div className="swimlane-rows-view flex flex-col">
      <div className="left-labels w-48 flex-shrink-0">
        {/* Swimlane labels */}
      </div>

      <div style={{ minWidth: `${windowDayCount * DAY_SLOT_WIDTH}px` }}>
        {swimlanes.map((swimlane, idx) => (
          <DraggableSwimlaneRow
            key={swimlane.id}
            swimlane={swimlane}
            tasks={tasksForSwimlane}
            indexToOffset={indexToOffset}
            onTaskClick={onTaskClick}
            {...props}
          />
        ))}
      </div>
    </div>
  );
}
```

#### `PeopleRowsView` (New Component, Future)
```tsx
// src/app/components/PeopleRowsView.tsx
export function PeopleRowsView({
  tasks,
  people,
  windowStartIndex,
  windowDayCount,
  indexToOffset,
  onTaskClick,
  ...props
}) {
  return (
    <div className="people-rows-view flex flex-col">
      {people.map(person => (
        <PersonGroup
          key={person.id}
          person={person}
          personTasks={tasksForPerson}
          indexToOffset={indexToOffset}
          windowDayCount={windowDayCount}
          onTaskClick={onTaskClick}
          {...props}
        />
      ))}
    </div>
  );
}
```

#### `ResizeHandle` (New Component)
```tsx
// src/app/components/ResizeHandle.tsx
export function ResizeHandle({ onResize, disabled = false }) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientY - startY;
      onResize(delta);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className="resize-handle h-1 bg-gray-200 hover:bg-blue-300 cursor-row-resize"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-disabled={disabled}
    />
  );
}
```

#### `DraggableSwimlaneRow` (Refactored)
```tsx
// Update to use indexToOffset instead of dayWidths
// Use DAY_SLOT_WIDTH for snapping

export function DraggableSwimlaneRow({
  swimlane,
  tasks,
  indexToOffset,
  ...props
}) {
  const getTaskStyle = (task: Task) => {
    const startIdx = dateToIndex(task.startDate);
    const endIdx = dateToIndex(task.endDate);

    return {
      left: `${indexToOffset(startIdx)}px`,
      width: `${(endIdx - startIdx) * DAY_SLOT_WIDTH}px`,
    };
  };

  // ... rest of component ...
}
```

---

## Implementation Phases

### Phase 1: Foundation & Hooks (Days 1–2)

**Goal:** Establish fixed slot system, shared scroll, and base hooks

**Tasks:**
- [ ] Add `TIMELINE_CONFIG` constant with `DAY_SLOT_WIDTH = 60`
- [ ] Implement `useSharedHorizontalScroll()` hook
- [ ] Implement `useVirtualizedTimeline()` hook
- [ ] Implement `useViewHeights()` hook
- [ ] Implement `useTimelineMode()` hook
- [ ] Create `ResizeHandle` component
- [ ] Update `App.tsx` to use new hooks and layout structure
- [ ] Update `CLAUDE.md` with new architecture

**Deliverable:** App renders TimelineView + KanbanView with vertical resize handle, but TimelineView still uses old monolithic code internally

**Testing:**
- [ ] Resize handle works smoothly
- [ ] View heights update correctly
- [ ] No console errors

### Phase 2: Refactor TimelineView (Days 3–4)

**Goal:** Break TimelineView into modular pieces

**Tasks:**
- [ ] Extract `TimelineHeader` component
- [ ] Extract `SwimlaneRowsView` component
- [ ] Extract `DraggableSwimlaneRow` logic (reuse existing, just update positioning)
- [ ] Refactor `TimelineView` to ~150 lines orchestrator
- [ ] Remove `dates`, `monthWidths`, `dayWidths` state
- [ ] Remove auto-sizing logic
- [ ] Update `getTaskPosition()` to use `indexToOffset()`
- [ ] Update task resize/drag to snap to `DAY_SLOT_WIDTH`

**Deliverable:** TimelineView modularized, uses fixed slots, inherits scroll state from App

**Testing:**
- [ ] Tasks render at correct pixel positions
- [ ] Drag/resize snaps to day boundaries
- [ ] Left column labels stay in sync with swimlane rows
- [ ] Mode toggle renders placeholder (Projects/People buttons exist)

### Phase 3: Implement Virtualization (Days 5–6)

**Goal:** Infinite scroll with dynamic window extension

**Tasks:**
- [ ] Implement scroll handler in `useVirtualizedTimeline()`
- [ ] Detect near-edge scrolling (left/right buffers)
- [ ] Extend window when user scrolls near edges
- [ ] Adjust `scrollLeft` on seamless extension (pixel-perfect)
- [ ] Render only visible days (within window + small buffer)
- [ ] Test with empty timeline (no tasks)
- [ ] Test with tasks far in past/future
- [ ] Benchmark and tune `WINDOW_CHUNK_SIZE` and `WINDOW_BUFFER_DAYS`

**Deliverable:** Infinite horizontal scroll working smoothly, window dynamically extends

**Testing:**
- [ ] Scroll left from start → window extends left
- [ ] Scroll right from end → window extends right
- [ ] Scroll rapidly → no visual glitches
- [ ] Drag task across window boundary → window extends
- [ ] Performance: 60fps scrolling with 500+ task cards

### Phase 4: Content Swapping & People View Scaffold (Days 7–8)

**Goal:** Projects ↔ People mode toggle, scaffold future PeopleView

**Tasks:**
- [ ] Implement `SwimlaneRowsView` (refactored current swimlanes)
- [ ] Create `PeopleRowsView` component (scaffold, render empty/placeholder)
- [ ] Implement mode toggle in TimelineView
- [ ] Update swimlane reorder to work within `SwimlaneRowsView`
- [ ] Create `PersonGroup` component (scaffold, render person name + collapsible)
- [ ] Ensure scroll sync works for both modes
- [ ] Add UI to toggle between modes

**Deliverable:** Mode toggle functional, both modes render (People mode is placeholder for future)

**Testing:**
- [ ] Toggle between Projects and People → content swaps
- [ ] Both modes scroll in sync with Kanban
- [ ] Swimlanes can be reordered in Projects mode
- [ ] No state pollution when switching modes

### Phase 5: Polish, Testing & Edge Cases (Days 9–10)

**Goal:** Production-ready implementation

**Tasks:**
- [ ] Fix pixel-perfect positioning edge cases
- [ ] Test resize across window boundaries
- [ ] Test rapid scroll chains
- [ ] Test with many swimlanes (performance)
- [ ] Test with many tasks per swimlane
- [ ] Test accessibility (keyboard nav, ARIA labels)
- [ ] Update CLAUDE.md with new patterns
- [ ] Add unit tests for `dateToIndex()`, `indexToDate()`, `indexToOffset()`
- [ ] Add E2E tests for scroll extension, drag across boundaries
- [ ] Performance profiling (target 60fps)
- [ ] Code cleanup and comments

**Deliverable:** Production-ready, well-tested, documented

**Testing:**
- [ ] Unit tests: 100% coverage of indexing helpers
- [ ] E2E tests: scroll, drag, resize across window boundaries
- [ ] Performance: 60fps with 1000 tasks, 50 swimlanes
- [ ] Accessibility audit
- [ ] Cross-browser testing (Chrome, Firefox, Safari)

---

## Technical Details

### Scroll Extension Logic

```ts
// Smooth, seamless window extension
const handleScroll = (scrollLeft: number, viewportWidth: number) => {
  const BUFFER = 400; // pixels, when to extend
  const max = totalScrollWidth - viewportWidth;

  // Extend left
  if (scrollLeft < BUFFER) {
    const pixelsAdded = CHUNK_SIZE * DAY_SLOT_WIDTH;
    setWindowStartIndex(prev => Math.max(0, prev - CHUNK_SIZE));
    // Adjust scroll to keep visual content steady
    setTimeout(() => {
      scrollerRef.current.scrollLeft = scrollLeft + pixelsAdded;
    }, 0);
  }

  // Extend right
  if (max - scrollLeft < BUFFER) {
    setWindowDayCount(prev => prev + CHUNK_SIZE);
    // No need to adjust scrollLeft when appending right
  }
};
```

### Task Positioning (Simple)

```ts
// Before (complex)
const prefix: number[] = [0];
for (let i = 0; i < dayWidths.length; i++) {
  prefix.push(prefix[i] + dayWidths[i]);
}
const startIdx = dates.findIndex(d => isSameDate(d, taskStart));
const left = prefix[startIdx];

// After (simple)
const startIdx = dateToIndex(taskStart);
const left = startIdx * DAY_SLOT_WIDTH;
```

### Responsive Kanban

```tsx
// Simple flex layout
<div className="kanban-board flex overflow-x-auto">
  {statusColumns.map(col => (
    <div
      key={col.id}
      className="kanban-column flex-1"
      style={{ minWidth: '200px' }}
    >
      {/* Tasks */}
    </div>
  ))}
</div>

// CSS handles responsiveness
// If total minWidth > viewport, overflow naturally
// If total minWidth < viewport, flex grows to fill
```

---

## Migration Path

### Not Breaking (Safe to Refactor)
- Task data model (no changes)
- Swimlane data model (no changes)
- Task status column definitions (no changes)
- localStorage persistence (same keys)
- drag-and-drop semantics (react-dnd unchanged)

### Breaking (Requires Testing)
- TimelineView props (simplified)
- Internal state management (complete rewrite)
- Task positioning calculations (replaced)
- Scroll sync mechanism (new)

### Migration Strategy
1. Keep old code in `src/app/old/` for reference
2. Implement new alongside old (feature flag if needed)
3. Test thoroughly before switching
4. One-way migration (no rollback path needed once confident)

---

## Risk Assessment

### High Risk
- **Pixel-perfect task positioning**: Off-by-one errors on window extension
  - Mitigation: Unit tests for indexing, E2E tests for drag across boundaries
- **Seamless scroll extension**: Jumpy scroll when extending window
  - Mitigation: Adjust scrollLeft immediately, test on multiple browsers
- **Performance with many tasks**: Virtualization not aggressive enough
  - Mitigation: Benchmark early, render only visible + 1-day buffer

### Medium Risk
- **Scroll sync between views**: Kanban and Timeline get out of sync
  - Mitigation: Shared scroll state, test mode switching rapidly
- **Mode switching (Projects ↔ People)**: State pollution or re-render glitches
  - Mitigation: Clear separation of mode state, test switching repeatedly
- **Responsive Kanban columns**: Flex layout doesn't work as expected
  - Mitigation: Simple flex + minWidth, test with 2, 4, 8 columns

### Low Risk
- **Vertical resizing**: Smooth resize handle
  - Mitigation: Standard pattern, easy to test
- **Fixed day slots**: UI feels constrained
  - Mitigation: Keep slots reasonable (60px = ~3 tasks visible), feedback loop with design

---

## Success Criteria

### Functionality
- ✅ Infinite horizontal scroll (left & right) without performance degradation
- ✅ Projects mode: render swimlanes as rows
- ✅ People mode: scaffold (render placeholder structure)
- ✅ Mode toggle works seamlessly
- ✅ Vertical resize between timeline and kanban
- ✅ Kanban columns responsive (flex + minWidth)
- ✅ All existing features work (task CRUD, drag/reorder, colors)

### Performance
- ✅ 60fps scrolling with 500+ tasks
- ✅ Smooth window extension (no jank)
- ✅ Responsive UI even with many swimlanes
- ✅ Memory usage bounded (virtualization works)

### Code Quality
- ✅ TimelineView < 200 lines (was 984)
- ✅ Clear separation of concerns
- ✅ Reusable hooks
- ✅ Unit tests for core logic
- ✅ E2E tests for interactions

### User Experience
- ✅ Seamless infinite scroll (no visual discontinuities)
- ✅ Task snapping feels natural (60px grid)
- ✅ Resize handles work smoothly
- ✅ Keyboard accessible
- ✅ Works on mobile (basic support)

---

## Timeline Summary

```
Week 1:
  Mon-Tue   (Days 1-2)   Phase 1: Foundation & Hooks
  Wed-Thu   (Days 3-4)   Phase 2: Refactor TimelineView
  Fri       (Days 5-6)   Phase 3: Implement Virtualization (early)

Week 2:
  Mon-Tue   (Days 7-8)   Phase 4: Content Swapping & People Scaffold
  Wed-Thu   (Days 9-10)  Phase 5: Polish & Testing

Total: 10 days (assumes single developer, no interruptions)
Buffer: 2 days for edge cases / debugging
```

---

## Future Enhancements

### Post-Launch
- [ ] Zoom levels (30px, 60px, 90px per day)
- [ ] PeopleView full implementation (person groups, avatars)
- [ ] Swimlane filtering
- [ ] Task search/filter
- [ ] Custom swimlane colors
- [ ] Task templates

### Optional
- [ ] Keyboard shortcuts (← → to scroll)
- [ ] Snap-to-today button (already exists)
- [ ] Export timeline as image
- [ ] Mobile responsive design
- [ ] Dark mode

---

## Dependencies

### No new dependencies required
- `react-dnd` (existing, works with fixed slots)
- `tailwindcss` (existing, responsive utilities)
- `lucide-react` (existing, icons)

### TypeScript (existing)
- Strict mode for new hooks

---

## Questions & Decisions Still Open

1. **People avatar source?** (gravatar, initials, user image URL)
   - Defer to PeopleView implementation phase
2. **Swimlane grouping in People mode?** (collapsible, always expanded, drag-reorder)
   - Defer to Phase 4
3. **Zoom levels needed?** (or keep 60px fixed)
   - Start with fixed, add zoom later if requested
4. **Performance threshold?** (how many tasks before virtualization matters)
   - Benchmark Phase 5; aim for 1000+ tasks @ 60fps
5. **Kanban column min-width?** (200px, 180px, 250px)
   - Start with 200px, adjust based on content density

---

## Appendix: File Structure Changes

```
src/app/
├── constants/
│   ├── swimlanes.ts (existing, no changes)
│   └── timeline.ts (NEW: TIMELINE_CONFIG)
├── hooks/ (NEW directory)
│   ├── useSharedHorizontalScroll.ts
│   ├── useVirtualizedTimeline.ts
│   ├── useViewHeights.ts
│   ├── useTimelineMode.ts
│   └── useTimelineResize.ts (optional)
├── utils/
│   ├── contrast.ts (existing)
│   └── timeline.ts (NEW: dateToIndex, indexToDate helpers)
├── components/
│   ├── TimelineView.tsx (REFACTORED: ~150 lines)
│   ├── TimelineHeader.tsx (NEW)
│   ├── SwimlaneRowsView.tsx (NEW: extracted from TimelineView)
│   ├── PeopleRowsView.tsx (NEW: scaffold for future)
│   ├── DraggableSwimlaneRow.tsx (REFACTORED: use indexToOffset)
│   ├── DraggableSwimlaneLabel.tsx (existing, no changes)
│   ├── ResizeHandle.tsx (NEW)
│   ├── PersonGroup.tsx (NEW: scaffold for future)
│   ├── KanbanView.tsx (REFACTORED: responsive flex)
│   ├── TaskCard.tsx (existing, minor updates)
│   ├── TaskDialog.tsx (existing, no changes)
│   ├── SwimlaneDialog.tsx (existing, no changes)
│   └── old/ (archive)
│       └── swimlanesView-old.tsx (existing)
└── App.tsx (REFACTORED: orchestrator)
```

---

## Sign-Off

This plan is comprehensive and actionable. Implementation should follow phases sequentially, with testing and validation at each phase.

**Next step:** User review and feedback. Once approved, create feature branch and begin Phase 1.
