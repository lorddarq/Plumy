# Timeline replacement candidates: upstream findings

Research date: 2026-08-29

Upstreams reviewed:

- [`namespace-ee/react-calendar-timeline`](https://github.com/namespace-ee/react-calendar-timeline) at commit [`5190e5e`](https://github.com/namespace-ee/react-calendar-timeline/commit/5190e5e) (`v0.30.0-beta.19`)
- [`mogiyoon/react-stable-timeline`](https://github.com/mogiyoon/react-stable-timeline) at commit [`7af06bb`](https://github.com/mogiyoon/react-stable-timeline/commit/7af06bbd9c7e21753b3f1b7fd93fec201132759c); its source tree is identical to tag [`v0.5.0`](https://github.com/mogiyoon/react-stable-timeline/tree/v0.5.0) (`ab02d5e`)

Scope: upstream facts and an architecture comparison against Omvra's current Timeline. This investigation does not change application code.

## Candidate 1: `react-calendar-timeline`

### Bottom line

**Inference:** this package is not a drop-in way to remove Omvra's rendering complexity. It can own much of the horizontal calendar math, buffered time canvas, item layout, mouse/touch dragging, resizing, and header rendering. However, the current implementation does **not** vertically virtualize groups: it creates every sidebar row and every horizontal row, while only filtering items by the buffered **time** range. If Omvra's main scaling problem is the number of task/swimlane rows, replacing its custom renderer with this package would discard or require rebuilding the most relevant optimization.

The safer candidate for an experiment is the TypeScript/React 18–19 `0.30.0` beta, but it is still explicitly prerelease software. The stable line is `0.28.0`, uses Moment, and does not represent the current API described by the main README. Accessibility also cannot be delegated to the package: its default interactive surface is pointer-driven generic `div` markup with no built-in keyboard model or semantic grid/list structure visible in the current source.

## Findings matrix

| Concern | Upstream fact | Replacement implication (inference) |
| --- | --- | --- |
| Maintenance | The latest release is [`v0.30.0-beta.19`](https://github.com/namespace-ee/react-calendar-timeline/releases/tag/v0.30.0-beta.19), released 2026-07-24. The README still calls `0.28.0` the latest stable and asks users to try the beta. A maintainer stated in February 2026 that more resources would be dedicated to the library. npm's current dist-tags are inconsistent with those instructions: `latest` points to beta.4 while `beta` points to beta.19. | Maintenance has revived, but adopting the modern React/TypeScript line means accepting and pinning a beta; neither a bare install nor the README's stable-install guidance is a safe version-selection strategy today. |
| React/tooling | Beta `package.json` declares React and React DOM `^18 || ^19`, Day.js and `interactjs` as peers, bundled TypeScript declarations, Vite output, and CJS/ESM exports. | Compatible with a modern React renderer in principle. Adoption adds Day.js and Interact.js as runtime peers and brings library CSS into Omvra's styling boundary. |
| Horizontal rendering | A configurable `buffer` defaults to 3. The package renders a canvas wider than the viewport, translates it during scrolling, and recenters/recalculates it at a boundary. It calls `onBoundsChange` when canvas bounds change. | This can replace custom horizontal time-window math if its recentering behavior and controlled time contract match Omvra's interactions. It is buffered rendering, not DOM virtualization. |
| Vertical rendering | `GroupRows` loops through `lineCount`; `Sidebar` maps all groups. There is no visible-row window in either path. `Items` time-filters against canvas bounds, not vertical viewport bounds. | A large number of swimlanes/tasks will still create all row DOM. Retaining vertical virtualization would require a custom integration/fork and reintroduce synchronization complexity across sidebar, rows, items, heights, and scrolling. |
| Row/item sizing | Groups accept an explicit pixel `height`; otherwise height is derived from `lineHeight`, item height, and optional stacking. Beta items can provide a pixel `height`; `itemVerticalGap` controls spacing. Collision stacking can be global or per group. | It supports variable computed row heights, but those heights are calculated across the time-visible items and all groups. This is not the same as measuring and virtualizing arbitrary React row content. Omvra would need to validate height stability when the horizontal canvas changes. |
| Sidebar/header behavior | Left and optional right sidebars are built in. Calendar and sidebar headers are composable render-prop components, and header horizontal position is synchronized with the canvas transform. The README says a vertically sticky timeline header must be added by the consumer. | Basic fixed columns and custom calendar headings are available. Omvra must still own vertical sticky behavior and CSS/z-index integration. The package does not provide a sticky first body row. |
| Drag/resize | Items can move in time, change group, resize left/right/both, snap to a time interval, expose live/final callbacks, and pass proposed times through `moveResizeValidator`. External drop coordinates are exposed by the component ref. | Most basic schedule manipulation is covered. Omvra would still need adapters for its task mutation rules, date inclusivity, dependency rules, optimistic persistence, selection, and React DnD behavior elsewhere in the app. `moveResizeValidator` only returns a corrected timestamp, so cross-field or asynchronous validation remains application-owned. |
| Custom rendering | `itemRenderer`, `groupRenderer`, custom headers, interval renderers, and marker renderers are supported. Required positioning/event props must be retained through supplied prop getters. | Visual parity is plausible, but custom task cards will still live inside the library's absolute-positioning/event contract. Replacing the built-ins extensively reduces the amount of complexity actually removed. |
| Accessibility | Default item props expose mouse/touch, double-click, and context-menu handlers. Current item and scroll sources do not provide built-in `role`, `tabIndex`, keyboard handlers, focus movement, or keyboard move/resize. The README only demonstrates arbitrary HTML attributes via `itemProps`; its example includes `aria-hidden`. | Omvra must design and test semantic structure, focus management, keyboard navigation, and keyboard drag/resize itself. A custom `itemRenderer` can add semantics, but the package does not provide an accessible interaction model to inherit. |
| SSR | The README and package metadata make no SSR/Next.js support claim. DOM/window interaction is mostly attached in `componentDidMount` or pointer handlers, while the resize detector includes an SSR/jsdom fallback comment. No dedicated SSR contract or SSR test was found in the current upstream tree. | Do not treat SSR support as guaranteed. Omvra is Electron-rendered, so this is low risk for the desktop app, but any shared web/marketing use should get a `renderToString`/hydration spike before adoption. |

## Detailed upstream facts

### 1. Release and maintenance state

- GitHub marks [`v0.30.0-beta.19`](https://github.com/namespace-ee/react-calendar-timeline/releases/tag/v0.30.0-beta.19) as the latest release. It shipped on 2026-07-24 and fixed a pinch-zoom crash.
- The [main README](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#for-02x-stable-users) says `0.28.0` remains the latest **stable** version and that the rest of the README documents the `0.30.0` beta API.
- npm's authoritative [package registry metadata](https://registry.npmjs.org/react-calendar-timeline) currently reports `latest: 0.30.0-beta.4` and `beta: 0.30.0-beta.19`. Therefore a bare `npm install react-calendar-timeline` does not install either README-designated stable `0.28.0` or the newest beta. An evaluation must pin `0.30.0-beta.19` explicitly.
- The beta is a [TypeScript rewrite with Day.js, Vite, React 18/19 support, dynamic item sizing, and buffered canvas changes](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#react-calendar-timeline).
- In [maintainer discussion #991](https://github.com/namespace-ee/react-calendar-timeline/discussions/991), an upstream user reported rough areas in beta.3 and a need to render only a visible vertical window for a possible 28,000 rows. On 2026-02-05, `lnagel` answered that their team would dedicate more resources and named a maintainer who could assist.
- Current `main` has [CI running lint, coverage tests, and build](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/.github/workflows/ci.yml), and the [tag-release workflow](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/.github/workflows/release.yml) repeats lint/test/build before publishing. This is stronger evidence than the earlier beta.12 release note that said legacy tests were temporarily skipped.

**Inference:** upstream is active again and has substantially improved its engineering baseline, but the long prerelease period, incorrect dist-tag state, and documentation drift described below still make a full replacement higher-risk than adopting a mature stable API.

### 2. React compatibility and package surface

The current beta [declares](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/package.json#L90-L100):

- `react: ^18 || ^19`
- `react-dom: ^18 || ^19`
- `dayjs: ^1.11.10`
- `interactjs: 1.10.27`

It provides bundled declarations and both import/require entry points in the same [`package.json`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/package.json#L15-L34). The beta migration guide says React 18+ is required, plain arrays replace Immutable.js support, and consumers must import the new stylesheet path.

**Inference:** the React contract is suitable for a current Omvra renderer, but `interactjs` becomes a second interaction system beside any React DnD still used in other views. That boundary should be tested for pointer-event conflicts rather than assumed harmless.

### 3. Rendering and virtualization model

#### Horizontal/time axis

The README's ["Behind the scenes" section](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#behind-the-scenes) describes a 3×-wide scrolling canvas. When the view approaches the invisible edge, the package repositions time-based elements and resets the canvas. The factor is configurable through `buffer`; [`getCanvasWidth`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/utility/calendar.tsx#L582-L585) is simply viewport width multiplied by that buffer.

The implementation uses a clipped container and transforms the full buffered canvas by `scrollOffset` in [`ScrollElement`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/scroll/ScrollElement.tsx#L250-L276). Wheel and pointer updates are batched through `requestAnimationFrame`; horizontal trackpad movement, shift-wheel panning, modifier-wheel zoom, mouse dragging, and touch/pinch gestures are handled in that component.

The controlled API requires consumers that pass `visibleTimeStart`/`visibleTimeEnd` to orchestrate scrolling through [`onTimeChange`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#ontimechangevisibletimestart-visibletimeend-updatescrollcanvas-unit). `onBoundsChange` exposes buffered canvas changes for loading data.

#### Vertical/groups axis

The package is not vertically virtualized in the current source:

- [`GroupRows.render`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/row/GroupRows.tsx#L32-L62) creates one `GroupRow` for every `lineCount` entry.
- [`Sidebar.render`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/layout/Sidebar.tsx#L44-L82) maps every group to a sidebar row.
- [`Items.render`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/items/Items.tsx#L86-L135) renders items returned by `getVisibleItems`; that helper filters only by overlap with `canvasTimeStart`/`canvasTimeEnd`, as shown in [`calendar.tsx`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/utility/calendar.tsx#L305-L320).
- [`Timeline.render`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/Timeline.tsx#L971-L1091) gives the outer body the full calculated height and renders the complete sidebar/row structures; it does not accept a vertical-scroll viewport or overscan range.

**Inference:** the library can reduce horizontal calendar complexity, but it does not solve a two-dimensional virtualization problem. Wrapping its body in a virtual list would not be a shallow customization because item `top`, group height/tops, sidebar rows, background rows, drag group targeting, and marker canvas all share one full-height coordinate system.

### 4. Row height, item height, and stacking

The beta's base types allow [`group.height`, `group.stackItems`, and item.height`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/types/main.ts#L7-L37). The layout code:

- filters to time-visible items;
- computes item dimensions;
- groups them by row;
- optionally stacks collisions;
- derives every group top/height; and
- sums group heights into the total body height.

This flow is visible in [`stackTimelineItems` and `stackAll`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/utility/calendar.tsx#L405-L579). An explicit group height overrides the calculated group height. `lineHeight` defaults to 30, `itemHeightRatio` to 0.65, and `itemVerticalGap` can replace the ratio-derived spacing model; the public descriptions are in the [README sizing props](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#lineheight).

**Inference:** horizontal recentering can change which items participate in layout, so stacked/derived row height may change as the buffered time window changes. Omvra should treat stable row heights and scroll-position preservation as acceptance criteria for any spike.

### 5. Headers and sidebars

The package supports a left sidebar and optional right sidebar, with group content customizable through `groupRenderer`. It provides composable `TimelineHeaders`, `SidebarHeader`, `DateHeader`, and `CustomHeader` components; see the [header documentation](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#timeline-headers).

The current [`TimelineHeaders`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/headers/TimelineHeaders.tsx#L20-L89) lays out sidebar headers alongside a clipped calendar header and translates the calendar portion by the same horizontal offset as the body.

The library does not make the entire header vertically sticky by default. Its [FAQ](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#the-timeline-header-doesnt-fix-to-the-top-of-the-container-when-i-scroll-down) tells the consumer to add sticky behavior. The default CSS does make **item label content** sticky within a long item, which is a different feature ([`Timeline.scss`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/Timeline.scss#L42-L57)).

### 6. Drag, resize, selection, and external drop

The [documented interaction props](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#canmove) include:

- global/per-item `canMove`, `canChangeGroup`, and resize-edge control;
- `dragSnap` and a minimum resize width;
- live `onItemDrag` and committed `onItemMove`/`onItemResize` callbacks;
- controlled item selection;
- canvas click/double-click/context-menu callbacks; and
- `moveResizeValidator` to replace a proposed timestamp synchronously.

The component ref exposes [`calculateDropCoordinatesToTimeAndGroup`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/Timeline.tsx#L34-L40), which maps external coordinates to a snapped timestamp and group index.

**Inference:** this covers low-level geometry and pointer manipulation, not Omvra's domain rules. In particular, the validator returns only a time and is synchronous; dependency enforcement, mutation rejection, persistence, and user feedback must remain outside the library.

### 7. Custom rendering

The package exposes:

- [`itemRenderer`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#itemrenderer), including layout/interaction context and prop getters;
- [`groupRenderer`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#grouprenderer);
- custom date/header interval renderers in the [header API](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#timeline-headers); and
- custom timeline [markers](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#timeline-markers).

For custom items, consumers must apply `getItemProps` and resize-handle props so the library can retain required refs, handlers, and positioning. The implementation places each item absolutely using computed `left`, `top`, `width`, and `height` in [`Item.getItemStyle`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/items/Item.tsx#L641-L679).

**Inference:** there is enough rendering control to reproduce a bespoke task card, but every overridden layer is integration code that offsets the hoped-for complexity reduction. A spike should count deleted Omvra code, not only visual parity.

### 8. Accessibility

No accessibility claim or keyboard interaction contract is documented in the current README. In current source:

- [`Item.getItemProps`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/items/Item.tsx#L602-L629) composes mouse, touch, double-click, and context-menu handlers on a `div`.
- [`ScrollElement`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/lib/scroll/ScrollElement.tsx#L250-L276) renders a `div` with pointer/wheel listeners attached after mount.
- The public item model permits arbitrary HTML attributes through `itemProps`, so a consumer can add some roles/labels, but the package does not supply focus order, arrow navigation, keyboard move/resize, live announcements, or equivalent behavior.

**Inference:** Omvra cannot count adoption as an accessibility improvement. Keyboard parity would require a separate design and implementation that cooperates with, or bypasses, Interact.js's pointer model.

### 9. SSR and documentation drift

The upstream README and package metadata do not promise SSR compatibility. The current resize detector checks for `ResizeObserver` and otherwise uses `window` in [`window.ts`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/src/resize-detector/window.ts); registration happens from `Timeline.componentDidMount`, so that path is not invoked during a normal server render. Other `window` access occurs in mounted pointer handlers. This is encouraging but not an explicit SSR contract.

There is also visible documentation drift: the README still documents an optional [`resizeDetector`](https://github.com/namespace-ee/react-calendar-timeline/blob/5190e5e/README.md#resizedetector) import from a `lib/resize-detector/container` path, but the current `Timeline` prop type does not expose that prop and the source now registers its own native `ResizeObserver`-based detector. The README's title still announces beta.17 while `package.json` and the latest release are beta.19.

**Inference:** API choices for a proof of concept should be confirmed against exported beta.19 types/source rather than copied from README sections indiscriminately.

## Recommended proof-of-concept gates

These are inferences from the facts above, not upstream promises.

Do not start with a full replacement. Build a disposable, data-realistic spike around the beta and accept it only if it demonstrates all of the following:

1. Equivalent horizontal navigation and controlled date-range behavior without scroll jumps at canvas recentering boundaries.
2. Stable row heights and scroll position while the buffered time range changes.
3. Acceptable performance at Omvra's actual high-percentile group/task counts. Test DOM node count and scripting/layout time; do not infer performance from the upstream 3× canvas claim.
4. A credible vertical-windowing strategy, or evidence that Omvra's real row counts do not require one. If vertical virtualization is required, treat that as a likely stop condition.
5. Full drag/resize/date semantics, including task visibility, cross-swimlane moves, mutation validation, cancellation, and persistence failures.
6. Visual parity using supported renderers without forking package internals.
7. Keyboard selection/navigation and keyboard-accessible move/resize, plus screen-reader semantics and announcements.
8. Clean coexistence with React DnD elsewhere in the app and no pointer/scroll gesture regressions in Electron.
9. A measured reduction in maintained code and complexity. Replacing one custom renderer with an equally large adapter/fork does not meet the goal.

## Candidate 2: `@mogiyoon/react-stable-timeline`

### Bottom line

**Inference:** `react-stable-timeline` is technically stronger than `react-calendar-timeline` on the narrow issues of DOM virtualization, accessibility, SSR, bundle footprint, and headless extensibility. It culls rendered items on both axes, implements keyboard move/resize, tests server rendering, and has no runtime dependencies beyond React peers.

It is nevertheless a worse semantic match for Omvra's current Timeline. It is a flat chronological event visualizer whose rows are automatically created collision-packing lanes. It has no concept of project/swimlane groups, assigned group rows, group headers/sidebar, cross-group item movement, group reorder, drag-to-create range selection, hidden weekends, or independently sized calendar months. Its one bottom axis uses continuous epoch milliseconds and approximate fixed-duration month/year tick steps. Recreating Omvra's grouped calendar through the headless hook would mean retaining most of Omvra's structural and geometry code.

The package is also exceptionally young: the repository was created in May 2026, has one maintainer/collaborator signal and negligible adoption, and lacks visible CI. Its implementation is promising enough to study or benchmark, but not mature enough to make the architectural mismatch worth accepting.

### Findings matrix

| Concern | Upstream fact | Replacement implication (inference) |
| --- | --- | --- |
| Maintenance | GitHub reports the repository was created 2026-05-10. npm and Git tags reach stable `0.5.0` in August 2026. The repository currently has one star, no forks, no open issues, and no visible workflow configuration. GitHub Releases stop at `v0.4.4`; `v0.5.0` exists as a tag/npm publish but not a GitHub Release entry. | Active development is recent, but there is not yet enough project age, maintainer redundancy, downstream usage, or release discipline to establish operational maturity. |
| React/package | `react >=18` and `react-dom >=18` are peers; React 19 is used for development. The package ships ESM, CJS, TypeScript declarations, `sideEffects: false`, and requires Node 18+. | React compatibility and bundler fit are good for Omvra. The broad unbounded peer range should still be validated on every future React major rather than read as proven compatibility. |
| Horizontal rendering | Positions use a linear `pxPerMs` transform over controlled/uncontrolled `viewportStart`/`viewportEnd`. Items outside the horizontal viewport plus pixel overscan are not returned for rendering. | This is actual DOM culling rather than a 3× recentering canvas, but it cannot represent Omvra's discontinuous weekday-only or variable-month geometry. |
| Vertical rendering | Automatically packed item rows outside the measured vertical scroll window are culled. Packing still covers the full item dataset, and the visibility pass scans all items before omitting offscreen results. | It solves DOM-node scaling for its own auto-packed lanes. It does not virtualize Omvra swimlanes because the package has no assigned-group row model. Per-pan work remains at least a full item scan and needs measurement at Omvra scale. |
| Row/item sizing | The built-in UI uses a global 26 px row height and 8 px gap. The headless hook allows global `rowHeight`/`rowGap`; items have no height and rows have no per-row model. Label width participates in packing. | Variable swimlane heights and task tracks are not expressible through the styled component. Custom item dimensions can diverge from the engine's label-aware packing/culling assumptions. |
| Header/sidebar | The styled component provides a toolbar and one bottom axis. There is no sidebar, group header, multi-level calendar header, or sticky header API. | Omvra would build its fixed pane and month/day headers around the headless engine, preserving a major source of synchronization complexity. |
| Drag/resize | Controlled callbacks move an item horizontally and resize both edges of range items, with optional snapping and keyboard parity. There is no group move because there are no groups. | Useful low-level time manipulation, but cross-swimlane moves, domain validation, async persistence failure, and group reorder remain Omvra-owned. |
| Range selection/reorder | `start`/`end` define range **items**, but the public API has no canvas range-selection/create callback and no row/group reorder API. | Omvra's drag-across-days task creation and swimlane reorder would not be replaced. |
| Extensibility | `renderItem` replaces item markup; `useTimeline` exposes viewport, ticks, packing, culling, geometry, and drag prop getters. `packIntoRows` is exported. | The headless API is the strongest reason to experiment, but using it to add Omvra group semantics and calendar geometry turns adoption into a custom-engine integration rather than deletion of complexity. |
| Accessibility | Default items are focusable buttons with date-bearing labels; Enter/Space selects; arrows move; modifier-arrows resize; focus is visible. The item area announces the total count and decorative axis/grid/cursor elements are hidden from assistive technology. | Stronger baseline than `react-calendar-timeline`. Custom `renderItem` or a headless implementation must recreate these semantics because the custom renderer context does not supply an accessibility prop getter. No independent WCAG audit is published. |
| SSR/Electron | `renderToString` tests cover the full component, empty state, virtualization, headless hook, and custom renderer. Canvas text measurement has a no-document fallback and output receives a `"use client"` banner. No Electron-specific test or support claim exists. | SSR is supported by evidence. In Electron, browser APIs run in the renderer and should be compatible in principle, but Pointer Events, `ResizeObserver`, touch-action ownership, and global cursor/listener cleanup still need validation in Omvra's Chromium/runtime surface. |
| Dependencies/license | The npm artifact declares no runtime dependencies, only React peers; registry metadata reports 159,066 bytes unpacked. The repository uses the MIT license. | Low dependency and licensing friction. Preserve the MIT notice; there is no identified license blocker. |

### 1. Maintenance and release state

- GitHub's [repository metadata](https://api.github.com/repos/mogiyoon/react-stable-timeline) reports creation on 2026-05-10, last push on 2026-08-18, one star, zero forks, and zero open issues as of this review.
- npm's [registry metadata](https://registry.npmjs.org/@mogiyoon%2Freact-stable-timeline) records eleven published versions, ending at `0.5.0`. The tag [`v0.5.0`](https://github.com/mogiyoon/react-stable-timeline/tree/v0.5.0) points to `ab02d5e`; current main commit [`7af06bb`](https://github.com/mogiyoon/react-stable-timeline/commit/7af06bbd9c7e21753b3f1b7fd93fec201132759c) has an identical source tree.
- Release bookkeeping is incomplete: the [GitHub Releases list](https://github.com/mogiyoon/react-stable-timeline/releases) stops at `v0.4.4`, while the [tags list](https://github.com/mogiyoon/react-stable-timeline/tags) and npm include `v0.5.0`. Some npm versions also lack matching Git tags.
- The reviewed tree contains a Vitest suite and package scripts for test/typecheck/build, but no `.github/workflows` or equivalent visible CI configuration.
- Local verification of the reviewed tree passed all 85 upstream tests, typecheck, and build. The pan suite emitted repeated React `act(...)` warnings while still passing; this is test-harness noise but weakens the cleanliness of its gesture regression signal.

**Inference:** a version number without a prerelease suffix should not be confused with ecosystem maturity. This is a roughly three-month-old, effectively single-maintainer package with minimal external usage evidence and no visible automated merge gate.

### 2. React compatibility, dependency footprint, and license

The [`v0.5.0` package manifest](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/package.json) declares React/React DOM `>=18` peers, uses React 19 in development, targets Node 18+, and publishes ESM, CJS, and declarations with `sideEffects: false`. It declares no runtime `dependencies`. npm's exact [`0.5.0` artifact metadata](https://registry.npmjs.org/%40mogiyoon%2Freact-stable-timeline/0.5.0) reports eight files and 159,066 unpacked bytes; the README describes the ESM bundle as approximately 9 KB gzip.

The repository's [MIT license](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/LICENSE) permits commercial use, modification, distribution, sublicensing, and sale subject to retaining the copyright/license notice and warranty disclaimer.

**Inference:** dependency and license risk are low. Maintenance concentration and API stability are the larger supply-chain concerns.

### 3. Rendering, virtualization, and packing

The package uses a direct linear mapping:

- `pxPerMs = canvasPx / (viewportEnd - viewportStart)`;
- `timeToPx(ms) = (ms - viewportStart) * pxPerMs`; and
- `pxToTime` performs the inverse.

That geometry is implemented in [`useTimeline`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/useTimeline.ts#L184-L197). Controlled and uncontrolled viewport behavior is in [`useViewport`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/hooks/useViewport.ts).

Row assignment is a deterministic first-fit interval partition over the **full dataset**, implemented with a min-segment tree in [`packing.ts`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/packing.ts). Packing sorts items by `(start, label)`, accounts for the range bar and measured label footprint, and assigns the lowest row whose previous end does not overlap. It is `O(n log n)` and is tested differentially against a naive first-fit implementation in [`packing.test.ts`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/tests/packing.test.ts).

DOM culling happens afterward in [`useVisibleItems`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/hooks/useVisibleItems.ts). For every item, it calculates the packed row and current pixel extent, then skips it if its row is outside the measured vertical window or its rendered horizontal extent is outside the viewport plus `overscanPx`. [`useScrollWindow`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/hooks/useScrollWindow.ts) tracks scroll top and viewport height with a scroll listener and `ResizeObserver`.

Important boundary:

- Both-axis **DOM culling is real**.
- Packing still processes the full dataset when its memoization inputs change.
- The visibility pass loops over the full item array for each relevant viewport/layout recomputation, so culling does not make per-frame computation sublinear in item count.
- "Rows" are collision lanes generated by the algorithm; they are not caller-defined projects or swimlanes.

**Inference:** compared with `react-calendar-timeline`, this candidate better controls DOM count, but the benefit cannot be transferred directly to Omvra's grouped rows. A realistic benchmark must include the full-item arithmetic, React update cadence, and custom group rendering rather than count only mounted item nodes.

### 4. Time geometry and axis behavior

The default fit window spans the earliest start to latest end plus five percent padding on each side, as shown in [`useFitWindow`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/hooks/useFitWindow.ts). Zoom is expressed as a percentage of that fit window; defaults are 100% to 5000%. Panning may extend outside the data, while uncontrolled zoom is clamped to that range.

Tick choice is deliberately lightweight, not a calendar engine. [`ticks.ts`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/ticks.ts) uses fixed durations for years (`365.25` days), months (`30` days), weeks, days, and hours. [`useTimelineTicks`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/hooks/useTimelineTicks.ts) aligns ticks by flooring epoch milliseconds to the selected fixed step, then formats them with the host's local `Date` getters. The public API provides no timezone, locale, calendar-unit, weekend, or tick-renderer option.

**Inference:** exact item positions remain continuous epoch-time positions, but month/year grid lines are approximate duration markers rather than true calendar boundaries. This is a decisive mismatch for Omvra's month/day planning grid, especially around unequal month lengths, daylight-saving changes, omitted weekends, and independently resized months. `react-calendar-timeline` has a richer calendar-unit header model even though it lacks vertical virtualization.

### 5. Rows, items, headers, and sidebars

The public [`TimelineItem`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/types.ts#L7-L21) contains only `id`, `label`, start/end milliseconds, color, and arbitrary data. It has no group/row identifier or height. The built-in geometry uses a 26 px row height and 8 px gap from [`constants.ts`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/constants.ts); only the headless `useTimeline` options expose global `rowHeight` and `rowGap`.

The styled [`Timeline`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/Timeline.tsx) contains a toolbar, vertically scrolling item canvas, grid/cursor layers, and one bottom axis. [`Axis.tsx`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/components/Axis.tsx) renders a single absolute bottom axis. There is no sidebar, multi-level header, group renderer, variable per-row height, or sticky group/header contract.

**Inference:** this is closer to a dense event chronology than a grouped Gantt. Omvra cannot adapt task `swimlaneId` into the model because there is no public assigned-row input; it would have to partition data into multiple engines or replace packing/layout ownership.

### 6. Drag, resize, selection, and reorder

The [public props](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/types.ts#L81-L181) provide:

- controlled horizontal item move and range-edge resize callbacks;
- optional absolute-time snapping;
- click/keyboard item selection; and
- controlled/uncontrolled viewport changes.

The default item implements pointer and keyboard manipulation in [`TimelineItemView.tsx`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/components/TimelineItemView.tsx). Arrow keys move; Alt+arrows resize the start; Shift+arrows resize the end. Pointer callbacks fire once on drop with proposed times, and the caller must update its data.

Source/API audit found no:

- move between caller-defined groups;
- group or row reorder;
- canvas click-to-time callback;
- drag-to-select or drag-to-create time range;
- external item drop; or
- move/resize validation hook comparable to `react-calendar-timeline`'s synchronous validator.

**Inference:** strong keyboard parity does not compensate for the absent task-creation and swimlane operations. Domain validation would need to reject or correct the proposed update after the callback, with Omvra responsible for preview rollback and user feedback.

### 7. Extensibility

The README documents three levels of use:

1. the styled `Timeline`;
2. [`renderItem`](https://github.com/mogiyoon/react-stable-timeline#custom-item-rendering) for custom item markup; and
3. the headless [`useTimeline`](https://github.com/mogiyoon/react-stable-timeline#headless-usetimeline) hook for custom DOM while retaining viewport, gestures, packing, virtualization, ticks, and drag.

The hook returns positioned/visible items, row assignments, total height, conversion functions, ticks, actions, drag state, and pointer prop getters. `packIntoRows` and tick selection are also exported from [`index.ts`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/index.ts).

Boundaries matter:

- `renderItem` receives item gesture props and keyboard movement functions, but no ready-made semantic/focus props.
- Packing and culling assume the engine's measured `item.label` footprint plus global row geometry; a visually larger custom renderer can overlap or be culled incorrectly unless the consumer preserves those assumptions.
- The headless hook does not accept a caller-supplied row map, calendar geometry, tick renderer, or grouping strategy.

**Inference:** the headless surface is well designed for custom flat timelines. It is not an escape hatch for every missing Omvra feature without forking or duplicating core layout logic.

### 8. Accessibility

Accessibility is implemented and covered by source tests:

- Default items are focusable `role="button"` elements with date-bearing `aria-label`s, Enter/Space selection, arrow-key movement, modifier-arrow resizing, and a visible accent-colored focus outline in [`TimelineItemView.tsx`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/components/TimelineItemView.tsx).
- The item region is a labelled `role="group"` containing the full item count even when virtualization mounts only a subset, in [`Timeline.tsx`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/Timeline.tsx#L140-L164).
- Grid lines, ticks, cursor, visual labels, and resize handles are hidden from assistive technology where appropriate.
- [`render.test.tsx`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/tests/render.test.tsx) asserts count and date-bearing labels during server rendering.

There is no published third-party accessibility audit, WCAG conformance statement, roving-focus model, or live announcement of resulting dates after keyboard movement. Every currently rendered item is independently tabbable, and virtualized offscreen items are absent from the accessibility tree.

**Inference:** this is a meaningful baseline and clearly better than candidate 1, but Omvra still needs product-level keyboard navigation, status/relationship semantics, date-change announcements, and custom-renderer regression testing.

### 9. SSR and Electron

SSR support is explicit and tested. [`packing.ts`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/src/packing.ts#L96-L109) falls back to an eight-pixels-per-character estimate when `document` is unavailable. [`render.test.tsx`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/tests/render.test.tsx) uses `renderToString` for the full component, empty state, accessibility markup, horizontal culling, disabled virtualization, custom rendering, and the headless hook. The build adds a `"use client"` banner through [`scripts/use-client-banner.mjs`](https://github.com/mogiyoon/react-stable-timeline/blob/v0.5.0/scripts/use-client-banner.mjs).

**Inference:** hydration can still remeasure the actual container/font and repack rows after the 800 px/estimated-text server fallback, so SSR-safe does not necessarily mean layout-stable hydration. This is not important to Omvra's Electron renderer.

There is no upstream Electron-specific statement or test. Browser-only APIs (`ResizeObserver`, Pointer Events, Canvas2D, `window`, `document`, global cursor mutation, and global gesture listeners) are confined to client effects/interaction paths and belong in an Electron renderer, not the main process.

**Inference:** basic Electron compatibility is plausible, but Omvra must test touch/trackpad behavior, scroll chaining, global listener cleanup, window blur/cancel, renderer teardown, and coexistence with React DnD against its bundled Chromium.

### Candidate comparison

| Dimension | `react-calendar-timeline` beta.19 | `react-stable-timeline` 0.5.0 |
| --- | --- | --- |
| Project maturity | Older, widely observed repository; modern line is a long-running beta | Stable version label, but only about three months old with negligible ecosystem signal |
| Group/swimlane model | Built-in groups and left/right sidebars | None; rows are automatic collision lanes |
| Horizontal item DOM culling | Buffered time canvas filters items by canvas range | Direct viewport-plus-overscan culling |
| Vertical DOM culling | None for groups/sidebar rows | Yes for auto-packed item lanes, but not caller-defined groups |
| Calendar header/units | Rich, composable Day.js calendar headers | One bottom axis using approximate fixed-duration steps |
| Variable rows/items | Per-group and per-item height; stacking | Global row height/gap only; no item height |
| Move/resize | Time move, cross-group move, edge resize, synchronous time validator | Time move and edge resize only; keyboard parity; no groups/validator |
| Range creation/group reorder | Still application-owned | Still application-owned; no relevant callbacks/model |
| Accessibility | Primarily pointer interaction; consumer-owned keyboard semantics | Useful built-in semantics and keyboard move/resize |
| Extensibility | Custom items/groups/headers/markers | Custom items plus a clean headless hook |
| SSR | Not promised/tested as a contract | Explicit and tested |
| Runtime footprint | Day.js, Interact.js, lodash/classnames/memoize dependencies/peers | React peers only; no declared runtime dependencies |
| Omvra geometry fit | Poor for omitted weekends and variable month widths | Worse: same linear-time conflict plus approximate calendar ticks and no group model |

## Omvra architecture comparison

### Decision drivers

1. Reduce rendering cost at archive-scale row and task counts, not merely reduce source lines.
2. Preserve the Timeline's current interaction contract: project/people grouping, overlapping-task tracks, task movement between dates and groups, resize, drag-to-create ranges, group reorder, Today/reveal navigation, and a fixed label pane synchronized with the calendar.
3. Preserve Omvra's non-linear geometry: weekends can be omitted entirely, and each month can be resized independently.
4. Keep one authoritative viewport and coordinate model so headers, rows, drag targets, task fragments, and prepend scroll compensation cannot drift apart.
5. Avoid replacing owned code with a fork or a large adapter around a prerelease dependency.

### Current implementation evidence

- [`TimelineView.tsx`](../../src/app/components/views/TimelineView.tsx#L294-L453) already maintains a task-independent date window and horizontally windows months with leading/trailing spacers. Its day widths are derived from independently persisted month widths.
- [`timelineWindow.ts`](../../src/app/utils/timelineWindow.ts#L38-L108) can remove weekends from the rendered axis and owns past/future extension plus prepend-scroll compensation. This is a discontinuous time-to-pixel mapping; upstream's calendar utility uses a single linear time-range-to-canvas-width ratio.
- [`DraggableSwimlaneRow.tsx`](../../src/app/components/DraggableSwimlaneRow.tsx#L519-L667) renders selectable day cells, blocks weekend creation, fragments tasks at mounted month boundaries, and positions overlapping tasks on tracks.
- The existing responsiveness proposal already identifies the actual asymmetry: [months are windowed, rows are not](../architecture/ui-responsiveness-deepening-proposal.html#L142-L176). It recommends one viewport owner for visible rows/months, indexed tasks/tracks, geometry, and scroll compensation.
- The active custom path is large—about 2,800 lines across the main view, row, task, header, timeline-window, and track-allocation files—but line count overstates replacement savings. Task UI, domain adapters, range creation, non-linear date geometry, group reorder, persistence, and accessibility remain Omvra-owned under either architecture.
- There is also confirmed dead or disconnected code: the 203-line `useVirtualizedTimeline` hook has no caller; `MonthsScrollerFixed`/`MonthColumn` are not used by the active Timeline; and `calculateSwimlaneHeight` is imported by `TimelineView` but not called. Removing these is a low-risk complexity reduction independent of any library decision.

### Fit by Omvra capability

| Omvra capability | Library fit | Consequence |
| --- | --- | --- |
| Endless horizontal navigation | Good | The buffered 3× canvas can replace much of the current horizontal extension/recentering machinery. |
| Basic item stacking, move, resize, custom cards | Good/partial | Core mechanics exist, but Omvra's domain validation, mutation lifecycle, card actions, and date inclusivity remain adapters. |
| Many vertically scrolling swimlanes | Poor | Every library group/sidebar row mounts. This does not solve the rendering gap already identified in Omvra. |
| Hide weekends from the axis | Poor | Upstream assumes a continuous linear time scale. True weekday-only geometry would require changing the feature, distorting time, or forking core coordinate math. |
| Independently resizable month widths | Poor | Upstream uses one uniform time-to-pixel scale for the canvas. Omvra's per-month/day prefix geometry cannot be expressed through the public API. |
| Drag across empty days to create a range | Poor/partial | Canvas click events exist, but the current continuous multi-cell selection interaction would remain custom. |
| Swimlane reorder and React DnD coexistence | Partial | Reorder remains custom, while item interaction moves to Interact.js; two drag systems must coexist and be regression-tested. |
| Fixed pane, sticky header, synchronized variable-height rows | Partial | Sidebars and composable headers help, but sticky behavior and any vertical-window synchronization stay application-owned. |
| Keyboard-accessible scheduling | Poor | No upstream keyboard interaction model is provided; Omvra would still own semantics, focus, move/resize controls, and announcements. |

## Architecture options

| Option | Complexity reduction | Rendering impact | Feature/migration risk | Assessment |
| --- | --- | --- | --- | --- |
| A. Keep the current code unchanged | None | Months remain windowed; all rows remain mounted | Low immediate risk, ongoing complexity and scale risk | Not recommended. |
| B. Deepen Omvra's existing viewport model | Deletes dead paths and centralizes visible rows/months, indexing, tracks, geometry, and compensation | Directly adds the missing vertical row window while retaining horizontal month windowing | Moderate, localized migration; custom interactions stay on their existing coordinate model | **Recommended.** |
| C. Use a vertical-list primitive only | Some row-windowing machinery becomes dependency-owned | Can solve the missing axis if variable row heights and paired left/right panes stay synchronized | Moderate; still needs a Timeline-specific viewport adapter | Worth comparing with a small custom prefix-sum window after measurement; `react-calendar-timeline` is not the useful dependency for this option. |
| D. Replace the Timeline with `react-calendar-timeline` | Superficially removes horizontal calendar and basic item interaction code | Improves horizontal buffering but still mounts all rows | High: weekday-only axis and month resizing conflict with core geometry; range creation, reorder, accessibility, domain rules, and DnD integration remain; modern version is beta | Not recommended. |
| E. Replace the Timeline with `react-stable-timeline` | Could delegate linear viewport math, item DOM culling, packing, gestures, and accessible item manipulation | Culls flat auto-packed event lanes on both axes | Very high: no swimlane/group model, sidebar, calendar headers, group moves/reorder, range creation, weekday geometry, or variable months/rows; extremely young dependency | Not recommended as a replacement. Its headless/culling design is useful reference material. |

## Recommendation

Do **not** replace Omvra's Timeline with `react-calendar-timeline` as the production architecture. It is a good conventional scheduler component, but Omvra would be adopting it precisely where the current implementation is already strongest (horizontal windowing) while retaining or rebuilding the difficult parts. The two current geometry features—omitted weekends and independently resizable months—conflict with the library's linear canvas model. Most importantly, the library does not vertically virtualize groups, so it does not address the known rendering bottleneck.

Do **not** replace it with `react-stable-timeline` either. That package corrects candidate 1's DOM-culling and keyboard-accessibility gaps, but it solves a different product shape: one flat chronology automatically packed into visual lanes. Omvra's authored swimlanes, fixed pane, month/day grid, task creation, cross-group movement, and reorder are absent at the data-model level. Its headless hook would be a good small reference or isolated benchmark for item culling and gesture behavior, not a production foundation for the existing Timeline contract.

The shortest root-cause path is Option B:

1. Establish an archive-heavy benchmark with representative rows, overlapping tasks, and long date ranges; capture initial render, DOM nodes, scroll long tasks/frame behavior, and drag/resize latency.
2. Remove the confirmed unused Timeline hook/components/import after a focused build and interaction check.
3. Give one Timeline viewport module ownership of a shared vertical visible range for both the label pane and calendar pane, plus the existing horizontal month range, task index, track plan, geometry, and prepend compensation.
4. Re-run the same benchmark before making a performance claim.

A disposable `react-calendar-timeline@0.30.0-beta.19` spike is only justified if product is willing to drop or redesign weekday-only rendering and per-month resizing. A `react-stable-timeline@0.5.0` replacement spike has an even earlier stop gate: product would have to drop authored swimlanes/groups and accept auto-packed event lanes. Otherwise either spike would mostly prove known incompatibilities.

## Evidence versus assumptions

Verified here:

- Current Omvra months are windowed and rows are not.
- Omvra supports omitted weekends and independently variable month/day widths.
- Current upstream renders every group and sidebar row, filters items only by horizontal canvas bounds, and uses linear time-to-pixel geometry.
- `react-stable-timeline` culls flat items on both axes but has no caller-defined group/swimlane model, and its default ticks use approximate fixed-duration calendar units.
- The modern upstream line supports React 18/19 and is still `0.30.0-beta.19`; npm tags require an explicit pin.
- `react-stable-timeline` 0.5.0 supports React 18+, has no declared runtime dependencies, and passed its 85 upstream tests/typecheck/build locally; it remains a very young, single-maintainer project without visible CI.
- The named Omvra hook/components are disconnected from the active Timeline path.

Not yet verified:

- Which row/task percentile causes unacceptable performance in real restored workspaces.
- Whether vertical DOM count, task indexing/track allocation, React updates, layout, or paint is the dominant cost at that percentile.
- Quantified before/after performance for Option B or a library spike.

The next recommended activity is a focused renderer-performance benchmark and vertical-window design, not a production dependency migration.

## Evidence boundary

Upstream factual claims come from the candidates' repositories, release/tag pages, current source, tests, workflows where present, registry metadata, or maintainer discussion. Omvra factual claims come from the linked local implementation and architecture proposal. Candidate 2's own tests/typecheck/build were run, but no representative performance benchmark or Omvra integration was implemented, so performance outcomes remain explicitly unclaimed.
