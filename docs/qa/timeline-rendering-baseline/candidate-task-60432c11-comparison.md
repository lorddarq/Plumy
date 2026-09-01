# Timeline task indexing and track-plan comparison

Task: `task-60432c11-ef9e-4c53-839c-409fba5ed786`

## Inputs

- Original control: `control-814a336.json`, unchanged `main` commit `814a33659374171ae4f5d149e60f08aab80e6002`.
- Consolidated viewport candidate: `candidate-task-7d2f098a-c0f5b111.json`.
- Indexed track-plan candidate: `candidate-task-60432c11-5ba3da55.json`.
- Indexed candidate renderer diff SHA-256: `5ba3da553405807df927f7b904b791f2ba48a1c8395c7a541564ea8bea350f32`.
- Fixture, viewport, Electron/Chromium version, and twelve-case display matrix are identical.

## Behavioral comparison

All twelve indexed candidate scenarios completed without a renderer error and matched the original control's logical row count, mounted DOM element count, rendered task-fragment count, weekend mode, month-width mode, and measured resize-preview interaction.

The track plan is built from all filtered authored-row tasks before horizontal viewport selection. Inclusive start/end overlap, tasks outside the mounted date window, empty rows, project reassignment, committed date resizing, completed-task filtering, and People-mode indexing have focused checks. Horizontal pan and month-width changes are absent from the plan inputs, so they cannot change assignment, row height, track spacing, or row prefix offsets.

## Single-run observations

| Tasks | Original initial render | Indexed initial render | Original horizontal p95 | Indexed horizontal p95 | Indexed resize preview |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 98–140 ms | 89–98 ms | 53–67 ms | 40–53 ms | 23–29 ms |
| 5,000 | 304–317 ms | 274–279 ms | 213–293 ms | 174–239 ms | 76–97 ms |
| 10,000 | 576–644 ms | 537–543 ms | 507–679 ms | 373–493 ms | 136–226 ms |

The indexed capture is lower across every initial-render and horizontal-p95 range than the original control, and it avoids the anomalous small/medium slowdown seen in the earlier viewport-only capture. This is encouraging but remains a single non-alternating candidate capture, not a defensible performance claim. Use at least five alternating control/candidate runs before treating the difference as causal.

Mounted DOM volume is unchanged, so this task removes avoidable task grouping and duplicate track-planning work without solving the later row/task virtualization problem.
