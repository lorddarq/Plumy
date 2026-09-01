# Controlled Timeline performance comparison

Task: `task-97d963b9-a5b6-4f88-ba4f-31f5891a5ebb`

## Verdict

The windowed candidate is a material improvement at 5,000 and 10,000 tasks for readiness, first-contentful-paint milestone, live DOM volume, scripting, total main-thread task time, long-task duration, heap, horizontal scroll response, and resize preview latency. The improvement is present in both cold and warm phases and across both weekend and month-width modes.

It is not an across-the-board win. Scripted vertical-jump p95 settles near 26.7 ms at 5,000 and 10,000 tasks, versus a control that is often near 13.4–14.4 ms. Virtualization also raises layout counts by about 55% and style-recalculation counts by about 100%, although total layout duration is lower. At 1,000 tasks, resize preview is about 4–5 ms slower at the median, with overlapping ranges; treat that as noise or a small-scale tradeoff until a larger interaction sample proves otherwise.

All claims below come from the machine-readable [comparison summary](task-97d963b9-summary.json), which lists every raw control and candidate artifact and includes count, median, p95, minimum, maximum, and median percentage change for every metric.

## Controlled inputs

- Control: unchanged `814a33659374171ae4f5d149e60f08aab80e6002` renderer in a detached local clone.
- Candidate: `codex/timeline-rendering-experiment` working tree, renderer diff SHA-256 prefix `1f5ee1b9`.
- Five samples per side, alternating order: candidate/control, control/candidate, candidate/control, control/candidate, candidate/control.
- Twelve scenarios per sample: 1,000, 5,000, and 10,000 tasks × weekends visible/hidden × default/resized month widths.
- Each scenario has phase-local cold and warm captures in fresh renderer processes sharing the same Electron session and resource cache.
- Each table row below contains 20 observations per side and phase: five samples × four display configurations.
- macOS arm64; Electron 43.3.0; Chromium 150.0.7871.212; Node 22.23.1; 1440×900 at zoom 1; Vite production build; fixed seed `1330468434`.
- Standalone fixture only: no workspace hydration, preload, persistence, or provider data.

## Cold medians

| Tasks | Ready ms | FCP ms | Live DOM elements | Script ms | Heap MiB | Horizontal p95 ms | Vertical p95 ms | Resize ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 182 → 95 (-48%) | 284 → 200 (-30%) | 11,600 → 1,498 (-87%) | 2,477 → 1,046 (-58%) | 100 → 19 (-81%) | 53.7 → 13.6 (-75%) | 13.4 → 13.4 | 22.6 → 27.4 (+21%) |
| 5,000 | 530 → 95 (-82%) | 556 → 224 (-60%) | 56,661 → 3,096 (-95%) | 13,291 → 1,934 (-85%) | 428 → 38 (-91%) | 253 → 26.7 (-90%) | 13.6 → 26.7 (+96%) | 86.3 → 25.9 (-70%) |
| 10,000 | 1,045 → 126 (-88%) | 950 → 260 (-73%) | 113,363 → 3,195 (-97%) | 29,066 → 3,018 (-90%) | 817 → 201 (-75%) | 674 → 26.7 (-96%) | 20.5 → 26.7 (+31%) | 164 → 25.2 (-85%) |

The 1,000-task readiness and FCP ranges overlap, so those smaller-profile improvements are less certain than the non-overlapping, order-of-magnitude differences at 5,000 and 10,000 tasks. DOM volume is deterministic by display mode and remains bounded in all candidate samples.

## Warm medians

| Tasks | Ready ms | Script ms | Heap MiB | Horizontal p95 ms |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 165 → 79 (-52%) | 2,467 → 1,027 (-58%) | 108 → 23 (-78%) | 66.6 → 13.7 (-79%) |
| 5,000 | 608 → 95 (-84%) | 13,301 → 1,987 (-85%) | 443 → 48 (-89%) | 273 → 26.7 (-90%) |
| 10,000 | 1,070 → 130 (-88%) | 29,022 → 3,019 (-90%) | 870 → 199 (-77%) | 633 → 26.7 (-96%) |

Warm medians are close to cold medians at 5,000 and 10,000 tasks. Shared resource-cache warmth is therefore not the dominant cost in this fixture; React/application main-thread work dominates.

## Dominant remaining cost

At 10,000 tasks, the candidate's cold median accumulated about 3,018 ms of scripting, 188 ms of layout, and 3,935 ms of total Chromium task duration during the complete deterministic workload. Long tasks total 1,676 ms, down from 29,323 ms in the control, but still the largest responsive-work residue. The dominant observed category is scripting, not layout or paint.

Virtualization trades fewer mounted elements for more update cycles: median layout counts rise from 132 to 205 and style recalculations from 137 to about 278. Despite that, layout duration falls by 33% at 10,000 tasks because each pass covers much less live DOM. The next performance investigation should capture a call-stack trace for candidate scripting/long tasks rather than assume every remaining cost belongs to row virtualization.

Chromium's visible-weekend 10,000-task candidate still reports roughly 274,000 nodes and 260,000 event listeners after the scripted scroll, while the live page contains 3,307 elements. This metric is scale- and weekend-sensitive. A heap snapshot or allocation trace is required before calling it a detached-node leak; this run does not assign that cause.

## Interaction and parity observations

- Candidate authored rows remain 100/500/1,000 while final mounted rows remain bounded near the viewport.
- Candidate scroll captures record zero blank frames and zero fixed/calendar alignment failures.
- Resize preview is measured in all 240 scenario-phases.
- The rendered 10,000-task fixture loaded without console warnings/errors or a framework overlay. Switching Projects → People and 7 days → 5 days updated the selected mode and visible controls correctly.
- Trusted React DnD task latency remains unavailable. The harness explicitly records it as unavailable instead of reporting a synthetic drag number.

## Regressions, anomalies, and limits

- Vertical scripted-jump p95 is approximately one frame slower at medium and large scale. Horizontal p95 improves far more, but the vertical regression is real and should not be hidden by aggregate scores.
- FCP is a browser paint milestone relative to navigation start, not accumulated paint duration. No DevTools paint trace was captured.
- Resize uses the existing synthetic pointer preview; trusted drag still requires physical pointer/CDP trace coverage.
- The deterministic 60-step scroll is not a physical wheel or trackpad trace.
- Long-task samples cover the complete fixture workload and do not include call stacks.
- Point-in-time heap varies substantially by weekend mode and garbage-collection timing; use its distribution, not one sample, as evidence.
- Chromium intermittently logged macOS `task_policy_set` warnings without a failed load, missing phase, or parity failure. No sample was removed because of the warning.
- Results apply only to the tested fixture, runtime, viewport, hardware, and build. They are not a capacity guarantee for arbitrary workspaces or machines.

## Evidence and reproduction

Raw artifact names are enumerated under `samples` in [task-97d963b9-summary.json](task-97d963b9-summary.json). Environment metadata sits beside every sample. The control files follow `control-814a336-sample-01..05.json`; candidate files follow `candidate-task-97d963b9-1f5ee1b9-sample-01..05.json`.

```bash
npm run test:timeline-performance-fixture

# Candidate, repeated with sample=1..5
npm run benchmark:timeline:candidate -- --candidate-label=task-97d963b9 --sample=1

# Control: run from a detached 814a336 clone after copying only the current
# benchmark scripts, timeline-benchmark.html, and package scripts into it.
npm run benchmark:timeline:baseline -- --sample=1

node scripts/timeline-performance/analyze-comparison.cjs \
  --candidate-label=task-97d963b9 \
  --output=docs/qa/timeline-rendering-baseline/task-97d963b9-summary.json

node --experimental-strip-types --test \
  scripts/timeline-performance/fixture.test.ts \
  src/app/utils/timelineTaskDrop.test.ts \
  src/app/utils/timelineWindow.test.ts \
  src/app/components/timelineSurfaceRegression.test.ts \
  src/app/store/workspaceHydration.test.ts
npm run build:renderer
git diff --check
```

Final validation: 21/21 focused checks passed; the production renderer build passed; `git diff --check` passed. The experiment remains isolated on `codex/timeline-rendering-experiment` and was not merged to `main`.
