# Timeline rendering baseline protocol

## Purpose and control

This protocol makes Timeline rendering comparisons reproducible without loading or mutating an Omvra workspace. The checked-in control artifacts were captured on `codex/timeline-rendering-experiment` while the renderer source was unchanged from `main`.

- `main`: `814a33659374171ae4f5d149e60f08aab80e6002`
- experimental branch base and merge-base: `814a33659374171ae4f5d149e60f08aab80e6002`
- control `TimelineView.tsx` blob: `e516d2b5b657a1d9b44dcc283acdc90f1db0dfc6`
- raw measurements: [control-814a336.json](timeline-rendering-baseline/control-814a336.json)
- machine/runtime metadata: [environment.json](timeline-rendering-baseline/environment.json)
- deterministic fixture generator: `scripts/timeline-performance/fixture.ts`

The runner refuses to capture a control result if any file under `src/app` differs from `main`. It production-builds only the standalone benchmark entry, opens each scenario in a new hidden Electron window, uses a temporary Electron `userData` directory, mounts no workspace provider or preload, then deletes the temporary profile and build output.

The vertical-window capture for `task-756fcdf5` is the first artifact with an explicitly height-constrained `#root`. Earlier artifacts still establish full-mount DOM/listener counts, but their vertical-scroll timing and direct timing comparison are not valid controls for the constrained viewport. Recapture an alternating control before making causal performance claims.

## Workload assumptions

The fixed seed is decimal `1330468434` (`0x4f4d5652`). Each profile has exactly ten tasks per swimlane:

| Profile | Swimlanes | Tasks |
| --- | ---: | ---: |
| Small | 100 | 1,000 |
| Medium | 500 | 5,000 |
| Large | 1,000 | 10,000 |

Every profile includes:

- three deliberately overlapping tasks per row;
- additional tasks distributed across the full date surface;
- a fixed historical/future span from 2019-01-07 through 2033-12-15;
- open, in-progress, and under-review tasks so completed-task filtering does not change fixture counts;
- stable projects, assignees, priorities, identifiers, and colors.

The display matrix is the Cartesian product of all three profiles, weekends visible/hidden, and default/resized month widths: 12 scenarios. Resized months cycle through 1,320, 1,860, and 2,280 pixels for every month in the fixture span.

## Reproduce the automated baseline

From the repository root:

```bash
npm run test:timeline-performance-fixture
npm run benchmark:timeline:baseline
```

The second command requires permission to launch the local Electron binary. It overwrites the two JSON artifacts linked above. Do not compare results collected with different viewport, Electron/Chromium versions, hardware, power modes, or fixture seeds without labelling those differences.

On an experimental renderer working tree, capture the same matrix without overwriting the control:

```bash
npm run benchmark:timeline:candidate
```

Candidate filenames include the renderer working-tree diff hash and have separate environment metadata.
Use `npm run benchmark:timeline:candidate -- --candidate-label=<task-id>` to keep artifacts from successive experimental tasks separate.

For optimization comparisons, run at least five fresh captures of the control commit and five of the candidate commit on the same machine, alternate control/candidate order, and report median plus p95/range. The checked-in artifact is one control capture that establishes the schema and first observation; it is not a capacity threshold.

Give repeated captures a stable sample number so raw files do not overwrite one another:

```bash
npm run benchmark:timeline:baseline -- --sample=1
npm run benchmark:timeline:candidate -- --candidate-label=<task-id> --sample=1
```

Each scenario is loaded twice with fresh `BrowserWindow` renderer processes in the same Electron session. `cold` is the first load; `warm` is the second load of the same production-built page after the shared resource cache has been exercised. Separate renderer processes keep Chromium counters and heap gauges phase-local. Both phases execute the identical scroll and resize workload.

## Measurements

### Initial render and scenario readiness

`initialRenderMs` starts immediately before React root creation and ends after all logical `.swimlane-row-timeline` elements exist plus one animation frame. Because the unchanged Timeline always initializes in seven-day mode, hidden-weekend scenarios also report `scenarioReadyMs`, which includes toggling to five-day mode and two settling frames. Do not compare a hidden scenario's `scenarioReadyMs` to a visible scenario's `initialRenderMs` as if they were the same operation.

Paint observations report the browser's `first-paint` and `first-contentful-paint` milestones relative to navigation start. They are milestones, not accumulated paint duration; the comparison report must keep that limitation explicit.

### DOM and memory

After the scripted workload, record logical row count, currently rendered task bars, total page elements, and Chromium `Nodes`, `JSEventListeners`, `JSHeapUsedSize`, and `JSHeapTotalSize`. Each scenario uses a fresh `BrowserWindow`; the `Documents` metric must equal one. Heap is a point-in-time observation without forced GC and should be compared as a distribution across repeated runs.

Vertical-window candidates additionally record the authored row count, minimum/maximum mounted rows during every scroll sample, blank frames, fixed/calendar pane alignment failures, and selection/focus/resize row retention. A passing candidate retains the authored count while mounted rows remain bounded by viewport plus the documented 640px overscan outside explicitly pinned interactions.

### Scroll responsiveness and long tasks

Move the Timeline scroller through its full vertical range in 60 animation-frame steps, restore its original position, then repeat horizontally. Record total duration, p95/max frame interval, frames over 16.7 ms, and frames over 50 ms. A buffered `PerformanceObserver` records browser long tasks from root creation through the scripted workload. These intervals are workload response measurements, not a claim about display refresh rate.

### Resize latency

On the first visible task, dispatch a left-button press on the right resize grip, wait one frame for Timeline's document listener, move 60 pixels, and measure until a rendered fragment changes width. Release the pointer afterward. The harness callback is in-memory only, so no workspace record is changed.

### Trusted drag latency

React DnD correctly rejects DOM-synthesized HTML5 drag events; the automated result therefore records `taskDrag.status = unavailable` rather than a misleading number. Capture drag latency with a trusted pointer or Chrome DevTools Protocol trace:

1. Start the fixture page with `npm run dev:vite` and open `timeline-benchmark.html?swimlanes=1000&tasks=10000&weekends=visible&widths=default`.
2. In DevTools Performance, enable screenshots and Web Vitals, then start recording.
3. Drag a visible task by its center handle to a different visible swimlane and wait for the task fragment to paint in the destination row.
4. Stop recording. Measure pointer-down to the first destination-row paint, and separately record every main-thread task over 50 ms in that interval.
5. Repeat ten times per display mode. Report median, p95, failures, and the trace filenames alongside the automated JSON.

This gesture remains isolated because the page's reorder callback updates fixture state in memory and never mounts workspace persistence.

## Control observations (single run)

| Tasks | Visible DOM elements | Hidden-weekend DOM elements | Initial render range | Horizontal p95 frame range | Resize-preview range |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 12,925 | 10,273 | 98–140 ms | 53–67 ms | 15–32 ms |
| 5,000 | 63,186 | 50,134 | 304–317 ms | 213–293 ms | 85–102 ms |
| 10,000 | 126,388 | 100,336 | 576–644 ms | 507–679 ms | 193–224 ms |

Measured facts from this capture:

- DOM size grows roughly in proportion to swimlane count in both weekend modes.
- Vertical-scroll p95 remained between 13.4 and 14.3 ms, although the raw results contain slower maximum frames.
- Horizontal scrolling exceeded 50 ms on most scripted frames and degraded sharply with scale.
- The maximum observed long task ranged from 95–137 ms at 1,000 tasks, 392–444 ms at 5,000 tasks, and 1,055–1,165 ms at 10,000 tasks.
- Point-in-time used heap ranged from 70–129 MiB, 285–482 MiB, and 534–991 MiB across the three profile sizes. These are noisy single samples and not memory limits.

## Hotspot hypotheses and next validation

The measurements support investigating row-level rendering before replacing the Timeline. The current surface creates DOM and listeners for every swimlane; horizontal window changes then have work proportional to the full row count. CSS `content-visibility` can reduce offscreen paint work but does not remove those elements or their React/event work.

These are hypotheses, not yet proven causes:

- horizontal window changes may rerender every row even though only a small date slice changes;
- per-row task allocation, date slicing, DnD hooks, and listeners may compound that rerender cost;
- resized month geometry may increase retained layout/heap work, but this one run is too noisy to assign causality.

The cheapest validating experiment is vertical row virtualization with the same fixtures and interaction behavior, followed by profiling row commits during the scripted horizontal scroll. A candidate is an improvement only if repeated measurements reduce horizontal frame intervals, DOM/listener counts, and resize/drag latency without breaking date geometry, weekend modes, scroll restoration, or DnD behavior.

## Risks and trade-offs

- Synthetic fixtures represent dense planning data, not every real workspace distribution.
- Hidden-weekend cold render cannot be isolated without changing the control component, so readiness is reported separately.
- The automated scroll workload is deterministic but not a physical wheel/trackpad trace.
- Drag remains a trusted-input trace by design.
- Machine load, thermal state, Chromium changes, and garbage collection can materially move single-run values.
