# Timeline experiment decision

Task: `task-c0adad1a-ae4a-478f-8e6f-7283569d1198`

## Recommendation

**Revise. Do not merge or discard the experiment yet.**

The candidate materially improves the archive-scale cases that motivated the experiment, but the milestone is not ready for release acceptance. Two existing predecessor tasks still lack trusted React DnD evidence, and the controlled comparison found a repeatable vertical-scroll regression plus scale-sensitive retained-node/listener telemetry that has not been attributed.

`main` remains the production control at `814a33659374171ae4f5d149e60f08aab80e6002`. The experiment remains an uncommitted working tree on `codex/timeline-rendering-experiment`; no merge was performed.

## Decision drivers

1. Preserve Timeline display, interaction, keyboard, accessibility, and persistence contracts.
2. Require comparable, durable evidence before accepting a performance claim.
3. Prefer a bounded implementation whose maintenance cost is justified by archive-scale benefit.
4. Keep the production Timeline recoverable and avoid promoting an experiment automatically.

## Options considered

| Option | Evidence for | Evidence against | Decision |
| --- | --- | --- | --- |
| Merge now | At 10,000 tasks, cold medians improve for readiness (1,045 → 126 ms), live DOM (113,363 → 3,195), scripting (29,066 → 3,018 ms), heap (817 → 201 MiB), horizontal p95 (674 → 26.7 ms), and resize (164 → 25.2 ms). Twenty-one focused checks and the renderer build pass. | Trusted task drag, cross-row movement, edge auto-scroll, reorder, and drag latency remain unverified. Vertical-jump p95 regresses to about 26.7 ms at 5k/10k. Retained node/listener telemetry is unexplained. The candidate has no commit range yet. | Reject for now. |
| Revise | Keeps the material 5k/10k gains and the shared two-pane row window while closing concrete evidence gaps. Existing parity/performance tasks already own the DnD gaps. | Requires one additional trace/threshold investigation and another controlled run. | **Recommend.** |
| Discard | Immediately restores the simplest release posture. | Would abandon order-of-magnitude archive-scale improvements without evidence that the design is unsalvageable. | Reject. |

## Benefit versus maintenance cost

The production renderer delta is 17 files, 1,025 insertions, and 924 deletions. It removes five older Timeline modules and centralizes the visible-row and track-allocation logic in tested utilities, but it also replaces a large portion of `TimelineView` and changes shared drag/header/scrollbar paths. The net line count alone understates the review surface: this is a structural Timeline rewrite, not a small optimization.

That cost is justified only at archive scale. The 5,000- and 10,000-task improvements are large and consistent across cold/warm, weekend, and resized-month modes. At 1,000 tasks the readiness/FCP ranges overlap and resize is about 4–5 ms slower, so the candidate should not be justified as a universal small-workspace speedup.

## Verified milestone state and gaps

- Equivalent fixtures and protocol: verified with five alternating samples per side, twelve scenarios per sample, and cold/warm phases.
- Functional, visual, keyboard, accessibility, and persistence contracts: broadly verified, but native React DnD task movement and swimlane reorder remain unchecked in `task-832ad105-5336-477c-9432-884a87ff2a6b`.
- Initial render, DOM, scripting/layout, long tasks, scroll, memory, and synthetic resize: captured. Trusted drag latency remains unchecked in `task-97d963b9-a5b6-4f88-ba4f-31f5891a5ebb`.
- Remaining candidate behavior risk: vertical-jump p95 is roughly one frame slower at medium/large scale.
- Remaining diagnostic uncertainty: Chromium reports about 274,000 nodes and 260,000 listeners in one visible-weekend 10k case while the live page has about 3,307 elements. This is not evidence of a leak without an allocation or heap trace.

## Revision gates

1. Complete the two existing trusted-DnD parity checks and record ten trusted task-drag samples with median/p95 latency. Do not create a duplicate task; the open parity and performance tasks already own this work.
2. Attribute the candidate vertical-scroll p95 and retained-node/listener telemetry with a Performance trace plus heap/allocation evidence. Either restore vertical p95 to the control range or obtain explicit human acceptance of the measured tradeoff.
3. Re-run the controlled comparison after any candidate change and keep the production renderer build and focused checks green.
4. Only after those gates pass, split the currently uncommitted experiment into reviewable commits and record their exact range. A merge recommendation must include that range; none exists today.

## Recovery, rollout, and retirement

- Recovery now: `main` at `814a33659374171ae4f5d149e60f08aab80e6002` is the untouched control. Switching away from the experiment restores it without reverting production history.
- If later approved: merge only the reviewed commit range, retain the benchmark protocol/report, validate a small workspace and a 10k archive fixture, then expand usage. Roll back by reverting that exact range if parity, responsiveness, or persistence regresses.
- If later rejected: preserve this report, the parity matrix, comparison summary, and raw artifacts; record the final candidate SHA/diff hash; then archive or delete the experimental branch only after confirming those artifacts are reachable from durable history. Do not delete the working tree while the experiment is uncommitted.

## Human approval requested

Approve **revise** to keep the branch isolated while the named gates are completed. Merging now accepts unmeasured native DnD behavior and a known vertical-scroll regression; discarding now abandons demonstrated archive-scale gains.
