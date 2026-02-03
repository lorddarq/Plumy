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

## Sign-Off (Original Plan)

This plan is comprehensive and actionable. Implementation should follow phases sequentially, with testing and validation at each phase.

**Next step:** User review and feedback. Once approved, create feature branch and begin Phase 1.

---

---

# CONSOLIDATED MASTER PLAN ✅ (Updated 2026-02-03)

**Author:** GitHub Copilot  
**Date:** 2026-02-03  
**Status:** In Progress  
**Confidence:** 0.85

## Executive Summary

This **consolidated master plan** merges three previous planning documents and incorporates three new feature requirements:

1. **IMPROVEMENTS.md** — Timeline interaction refinements (out-of-range drops, auto-scroll, snapping)
2. **Timeline-Infinite-Scroll-Plan.md** — Virtualization design (windowed date extension)
3. **Architecture-Refactor-Plan.md** — Modular refactor (5 phases, component extraction)
4. **NEW: Dynamic Swimlane Tracks** — Tasks stack vertically within swimlanes (no visual overlap), swimlane height grows dynamically
5. **NEW: Separate Kanban View** — Full-page kanban board with independent scroll, toggled via segmented control
6. **NEW: View State Preservation** — Separate scroll position + UI state per view; instant restoration on switch (virtual rendering principle applied to view switching)

**Total Estimated Effort:** 14–16 days (single developer, includes testing & polish)  
**Phases:** 8 (Foundation → Modularize → Virtualization → Tracks → Kanban → View Toggle → Mode Toggle → Polish)

---

## Key Insights

### Dynamic Swimlane Tracks (Visual)
- Tasks on same swimlane but different date ranges: **no overlap**
- Each task assigned to a track slot (0, 1, 2, ...) within swimlane
- Swimlane height: `baseHeight + (trackCount - 1) * trackHeight`
- Track allocation: first-fit algorithm (simple, O(n×m), memoized to avoid thrash)

### Separate Kanban View
- TimelineView + KanbanView are **separate full-page views**, not vertically stacked
- Users toggle between them via segmented control in top bar
- Kanban scrolls **independently** (horizontal for cards, not synced with timeline calendar days)
- Responsive flex layout: kanban columns flex to fill or overflow-scroll

### View State Preservation (Virtual Rendering Principle)
- Apply virtual rendering principle from Upscalix article to view switching:
  - **Only render the active view** (saves DOM/memory)
  - **Preserve previous view's state in memory** (context/App state)
  - **Instant restoration on switch** (no re-fetch, no lag)
- Store per-view session data: `viewState = { timeline: {...}, kanban: {...} }`
- On switch: unmount current view, restore previous view's scroll/UI state

---

## Implementation Phases

### Phase 1: Foundation & Shared State (Days 1–2)
**Effort:** 2 days | **ROI:** Very High | **Blockers:** None

✅ **Tasks:**
- Add `TIMELINE_CONFIG` constant with `DAY_SLOT_WIDTH = 60px`, `HEADER_HEIGHT`, `ROW_HEIGHT`, `EPOCH_DATE`
- Implement `useSharedHorizontalScroll()` hook (scroll sync placeholder)
- Implement `useVirtualizedTimeline()` hook (window state, `dateToIndex`, `indexToDate`, `indexToOffset`)
- Implement `useViewHeights()` hook (for future vertical resize)
- Implement `useTimelineMode()` hook (projects vs people mode)
- Implement `useViewState()` hook (preserve scroll/UI state per view)
- Update [App.tsx](App.tsx) to use new hooks and render view toggle
- Create `ViewToggle` segmented control component

**Deliverable:** App renders top-level view toggle (buttons visible), hooks functional, shared state ready

**Testing:** No errors on mount, view toggle renders without crash

---

### Phase 2: Extract & Modularize TimelineView (Days 3–5)
**Effort:** 3 days | **ROI:** High | **Blockers:** Phase 1

✅ **Tasks:**
- Extract [TimelineHeader.tsx](src/app/components/TimelineHeader.tsx) (month/day labels, fixed positioning)
- Extract [SwimlaneRowsView.tsx](src/app/components/SwimlaneRowsView.tsx) (swimlane rows, Projects mode)
- Extract [ResizeHandle.tsx](src/app/components/ResizeHandle.tsx) (vertical divider, future use)
- Refactor [DraggableSwimlaneRow.tsx](src/app/components/DraggableSwimlaneRow.tsx):
  - Replace `dayWidths` calculations with `indexToOffset()`
  - Add track allocation logic (compute overlapping tasks)
  - Update task positioning: `top = trackIndex * trackHeight`, `left = indexToOffset(startIdx)`
  - Snap drag/resize to 60px grid
  - Add memoization: `React.memo` + `useCallback` to prevent cascading re-renders
- Reduce [TimelineView.tsx](src/app/components/TimelineView.tsx) to ~150 lines (orchestrator only)
- Remove `dates`, `monthWidths`, `dayWidths` state; use `useVirtualizedTimeline()` instead
- Remove auto-sizing logic and cascading updates

**Deliverable:** TimelineView modularized, tasks render at correct positions, grid snap works, swimlane rows memoized

**Testing:** Tasks positioned correctly, drag/resize snaps to 60px grid, no visual glitches, memoization prevents unnecessary re-renders

---

### Phase 3: Virtualization & Infinite Scroll (Days 6–7)
**Effort:** 2 days | **ROI:** Very High | **Blockers:** Phase 2

✅ **Tasks:**
- Implement scroll handler in `useVirtualizedTimeline()`:
  - Detect edge proximity (< 20% of viewport width)
  - Extend window left/right by chunks (60 days)
  - Compute pixel delta and adjust `scrollLeft` for seamless transition
- Render only visible days + 1-day buffer (compute from `scrollLeft` + viewport width)
- Benchmark `WINDOW_CHUNK_SIZE` and `WINDOW_BUFFER_DAYS` for optimal performance
- Test with empty timeline, tasks far in past/future

**Deliverable:** Infinite horizontal scroll working, seamless window extension, no visual gaps

**Testing:** Scroll left/right → window extends, rapid scroll chains work, performance benchmarked (target: 60fps)

---

### Phase 4: Dynamic Swimlane Tracks (Days 7–8)
**Effort:** 2 days | **ROI:** High | **Blockers:** Phase 2

✅ **Tasks:**
- Implement track allocation algorithm in `DraggableSwimlaneRow`:
  - For each task in swimlane, compute overlapping ranges
  - Assign to first available track using first-fit strategy
  - Memoize computation: `useCallback([tasks, dates])`
- Update swimlane row height: `containerStyle = { height: (trackCount) * trackHeight + padding }`
- Update task drag/drop to preserve/reassign track after drop
- Throttle re-renders via `rAF` during drag operations (prevent layout thrash)
- Add unit test: track allocation algorithm correctness

**Deliverable:** Swimlanes dynamically size based on overlapping tasks, no visual overlap, drag/drop works across tracks

**Testing:** Multiple overlapping tasks → auto-stack into tracks, swimlane height grows/shrinks, drag/drop preserves track assignment

---

### Phase 5: Separate Kanban View (Days 8–9)
**Effort:** 2 days | **ROI:** High | **Blockers:** Phase 1

✅ **Tasks:**
- Move [KanbanView.tsx](src/app/components/KanbanView.tsx) to full-page layout (remove vertical split)
- Kanban scrolls **independently** (horizontal for cards, no sync with timeline)
- Responsive flex layout: kanban columns flex to fill or overflow-scroll if total width > viewport
- Update [App.tsx](App.tsx) to render TimelineView or KanbanView based on `currentView` state
- Preserve kanban scroll position in `useViewState()` context

**Deliverable:** KanbanView renders full-page when selected, scrolls independently, responsive columns

**Testing:** Toggle between timeline/kanban, scroll position preserved, columns flex responsively

---

### Phase 6: View State Preservation (Days 9–10)
**Effort:** 2 days | **ROI:** Very High | **Blockers:** Phase 5

✅ **Tasks:**
- Enhance `useViewState()` hook:
  - Store per-view session data: `viewState = { timeline: { scrollLeft, collapsedSwimlanes, selectedTaskId }, kanban: { scrollLeft, selectedTaskId } }`
  - On view switch: save current state to context, restore previous view's state
  - Optionally persist to localStorage after 2s debounce for session recovery
- Update [App.tsx](App.tsx) to restore state on view remount
- Add unit test: state preservation and restoration

**Deliverable:** Switching views restores previous view's state instantly (scroll, selections, etc.)

**Testing:** Switch views repeatedly → scroll positions and selections preserved, instant restoration

---

### Phase 7: Mode Toggle & High-Priority Improvements (Days 10–11)
**Effort:** 2 days | **ROI:** Medium-High | **Blockers:** Phase 2

✅ **Tasks:**
- Implement Projects mode (refactored current swimlanes with dynamic tracks)
- Scaffold PeopleView (placeholder, person groups)
- Projects/People toggle is **within TimelineView** only (not global view toggle)
- Implement high-priority IMPROVEMENTS from IMPROVEMENTS.md:
  - Refine out-of-range drop extrapolation: use per-day widths at timeline edges
  - Auto-scroll + highlight newly created out-of-range tasks
  - Add visual drop hints (ghost placeholder during drag)
- Add unit tests: snapping behavior, out-of-range drop logic

**Deliverable:** Projects mode fully functional, People mode scaffolded, out-of-range drops handled gracefully

**Testing:** Toggle Projects/People, drag tasks out of range → auto-scroll + highlight, visual feedback clear

---

### Phase 8: Testing, Polish & Validation (Days 12–14)
**Effort:** 3 days | **ROI:** High | **Blockers:** All prior phases

✅ **Tasks:**
- Unit tests: `dateToIndex()`, `indexToDate()`, `indexToOffset()`, track allocation, swimlane height calc, view state preservation
- E2E tests: scroll extension chains, drag/resize across window boundaries, rapid view switching, multi-track drag, out-of-range drops
- Performance profiling:
  - Apply article recommendations: lazy-load kanban detail, memoize swimlane rows, `React.memo` on task cards
  - Measure: 60fps scrolling (timeline) + 60fps card scroll (kanban) with 500+ tasks, 50 swimlanes
  - Measure: fast view switching (< 100ms mount + state restore)
- Pixel-perfect positioning audits (window extension edge cases)
- Accessibility audit (keyboard nav, ARIA labels)
- Cross-browser testing (Chrome, Firefox, Safari)
- Update [CLAUDE.md](CLAUDE.md) with new patterns and architecture
- Code cleanup, comments, remove debug overlays

**Deliverable:** Production-ready, well-tested, documented, performant

**Testing:** All unit + E2E tests passing, performance benchmarks met, accessibility compliant

---

## Technical Details

### Track Allocation Algorithm (Swimlane Row)
```ts
// Pseudo-code
function computeTracks(tasks: Task[]): TrackAssignment[] {
  const tracks: Task[][] = [[]];
  
  for (const task of sortedByStartDate(tasks)) {
    for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
      if (!hasOverlap(task, tracks[trackIdx])) {
        tracks[trackIdx].push(task);
        assignment[task.id] = trackIdx;
        break;
      }
    }
    if (!assigned) {
      tracks.push([task]);
      assignment[task.id] = tracks.length - 1;
    }
  }
  
  return assignment; // memoized, recompute only on task/date change
}
```

### Swimlane Height Calculation
```ts
const trackCount = Math.max(...Object.values(trackAssignment)) + 1;
const swimlaneHeight = BASE_ROW_HEIGHT + (trackCount - 1) * TRACK_HEIGHT;

// CSS
<div style={{ height: `${swimlaneHeight}px` }}>
  {/* tasks positioned by track */}
</div>
```

### View State Preservation
```ts
interface ViewState {
  timeline: {
    scrollLeft: number;
    collapsedSwimlanes: string[];
    selectedTaskId?: string;
    mode: 'projects' | 'people';
  };
  kanban: {
    scrollLeft: number;
    selectedTaskId?: string;
    filterStatus?: TaskStatus;
  };
}

// On view switch
function switchView(newView: 'timeline' | 'kanban') {
  saveViewState(currentView, { scrollLeft: scrollRef.current.scrollLeft, ... });
  setCurrentView(newView);
  restoreViewState(newView); // instant restore
}
```

---

## Risk Assessment

### High Risk
- **Pixel-perfect window extension**: Off-by-one errors on scroll adjustment
  - Mitigation: Unit tests for indexing, E2E tests for drag across boundaries, visual QA
- **Track allocation + overlapping tasks**: Incorrect overlap detection
  - Mitigation: Unit tests with edge cases (same start/end dates, single-day tasks, etc.)
- **View state restoration**: State pollution or stale references on rapid switching
  - Mitigation: Clear state management, test rapid switching (5+ toggles)

### Medium Risk
- **Performance with many tasks + tracks**: Memoization not aggressive enough
  - Mitigation: Benchmark early (Phase 8), profile with React DevTools
- **Kanban column flex layout**: Responsive behavior inconsistent across browsers
  - Mitigation: Simple flex + minWidth, cross-browser testing
- **Scroll sync complexity**: Any remaining legacy sync code interferes with new virtual rendering
  - Mitigation: Complete removal of old scroll sync logic in Phase 2

### Low Risk
- **Track allocation first-fit strategy**: Visual tightness suboptimal
  - Mitigation: Use first-fit initially, best-fit as future UX polish
- **Fixed 60px day slots**: Feels constrained for some UX flows
  - Mitigation: Keep slots reasonable, zoom levels as future feature

---

## Success Criteria (Unified)

### Functionality ✅
- ✅ Infinite horizontal scroll (left & right) @ 60fps with 500+ tasks
- ✅ Dynamic swimlane tracks: tasks stack vertically, no overlap
- ✅ Separate full-page KanbanView with independent scroll + responsive columns
- ✅ View toggle with state preservation (instant restoration on switch)
- ✅ Projects mode fully functional; People mode scaffolded
- ✅ Out-of-range drops refined: precise extrapolation, auto-scroll, visual hints
- ✅ All existing CRUD + drag/reorder features work

### Performance ✅
- ✅ 60fps scrolling (timeline) with 500+ tasks, 50 swimlanes, dynamic tracks
- ✅ 60fps card scroll (kanban) with responsive columns
- ✅ Fast view switching (< 100ms mount + state restore)
- ✅ No memory bloat (virtual rendering + view state preservation)

### Code Quality ✅
- ✅ TimelineView < 200 lines (was 984)
- ✅ Clear separation of concerns (hooks, components, utils)
- ✅ Reusable hooks for virtualization, shared scroll, view state
- ✅ Unit tests: indexing, track allocation, view state
- ✅ E2E tests: scroll chains, drag/resize, view switching, out-of-range drops
- ✅ Updated documentation (CLAUDE.md, code comments)

### User Experience ✅
- ✅ Seamless infinite scroll (no visual discontinuities)
- ✅ Task snapping feels natural (60px grid)
- ✅ Swimlane height grows/shrinks dynamically (no jarring layout shifts)
- ✅ View toggle instant (state restored, no lag)
- ✅ Kanban scrolls smoothly (flex columns, no jank)
- ✅ Keyboard accessible, responsive on small screens

---

## Effort Summary

| Phase | Tasks | Days | ROI | Blocker |
|-------|-------|------|-----|---------|
| 1: Foundation | Hooks, config, App state | 2 | Very High | None |
| 2: Modularize | Extract components, refactor rows, memoize | 3 | High | Phase 1 |
| 3: Virtualization | Scroll handler, window extension | 2 | Very High | Phase 2 |
| 4: Tracks | Overlap detection, height calc, memoize | 2 | High | Phase 2 |
| 5: Kanban | Full-page view, flex layout | 2 | High | Phase 1 |
| 6: View State | Preserve/restore scroll + UI | 2 | Very High | Phase 5 |
| 7: Mode Toggle | Projects/People, IMPROVEMENTS | 2 | Medium-High | Phase 2 |
| 8: Testing | Unit + E2E + perf + polish | 3 | High | All |
| **TOTAL** | | **14–16 days** | | |

---

## Priorities (Ordered by ROI / Effort)

1. **Phase 1: Foundation** — Unblocks everything, quick wins, immediate value
2. **Phase 5: Kanban View** — Visible feature, independent from timeline work, enables parallel development
3. **Phase 2: Modularize** — Foundation for all timeline improvements
4. **Phase 6: View State** — Smooth UX, small effort, high perceived quality
5. **Phase 3: Virtualization** — Performance critical, enables large datasets
6. **Phase 4: Tracks** — Core feature, medium effort, high UX impact
7. **Phase 7: Mode Toggle** — Future-proofing, lower immediate ROI
8. **Phase 8: Testing** — Validates all phases, ensures quality

---

## Next Actions

- [ ] Create feature branch: `feat/unified-refactor-2026`
- [ ] Begin Phase 1: Foundation & Shared State (Days 1–2)
- [ ] Track progress via consolidated TODO list (in CLAUDE.md or separate file)
- [ ] Commit after each phase with descriptive messages
- [ ] Code review after Phase 2 and Phase 6 (high-impact changes)

---

**Confidence:** 0.85  
**Last Updated:** 2026-02-03  
**Status:** In Progress (Phases 1, 5 Complete; Phase 2 in Progress)

---

## Implementation Progress 📊

### Completed ✅
- **Phase 1: Foundation & Shared State** (2 days) — All tasks complete
  - Timeline config constants
  - All shared hooks (useSharedHorizontalScroll, useVirtualizedTimeline, useViewHeights, useTimelineMode, useViewState)
  - ViewToggle component
  - App.tsx updated with view orchestration
  - Type-checked and error-free

- **Phase 5: Separate Kanban View** (2 days) — All tasks complete
  - KanbanView full-page component created
  - Integrated with SwimlanesView for rendering
  - View state preservation implemented (scroll position + UI state saved/restored on switch)
  - Responsive flex layout for kanban columns
  - Integrated with DndProvider for drag/drop

- **Phase 2 (Partial): Modularization** (~1 day completed)
  - TimelineHeader component created (month/day headers, visual indicators)
  - SwimlaneRowsView component created (swimlane rows container)
  - Track allocation utility created (first-fit algorithm for task overlap avoidance)
  - All components type-checked and error-free

### In Progress 🔄
- Remaining Phase 2 tasks:
  - Complete refactoring of DraggableSwimlaneRow to use fixed 60px slots
  - Grid snapping for task drag/resize
  - Full refactor of TimelineView to ~150 lines (currently 984 lines)
  - Testing modularization phase

### Next Priority
- Complete remaining Phase 2 tasks (hours 1-3)
- Begin Phase 3: Virtualization & Infinite Scroll (days 6-7)
- Phase 4: Dynamic Track Height Calculation (days 7-8)
- Phase 6: View State Restoration & Edge Cases (days 9-10)
- Phase 7: Mode Toggle & High-Priority Improvements (days 10-11)
- Phase 8: Testing, Polish & Validation (days 12-14)

**Current Total Days Used:** ~5 days (Phases 1, 5, partial 2)  
**Estimated Remaining:** ~9-11 days to production-ready state
