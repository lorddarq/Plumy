# Shared vertical swimlane windowing comparison

Task: `task-756fcdf5-5396-4fcc-872b-a17369c682aa`

## Inputs

- Previous indexed candidate: `candidate-task-60432c11-5ba3da55.json`.
- Vertical-window candidate: `candidate-task-756fcdf5-ddd00db9.json`.
- Candidate renderer diff SHA-256: `ddd00db96ebaf1161881b9174bf9b41a58d4ac38c7ffbf763973c6396ac9959a`.
- The twelve-case fixture matrix, viewport size, Electron/Chromium version, task seed, weekend modes, and month-width modes are unchanged.

The standalone benchmark root is explicitly height-constrained for this capture. Earlier artifacts allowed the Timeline root to expand to content height, so their full-mount DOM/listener counts remain useful but their vertical-scroll timings and direct timing comparison are not causal controls.

## Windowing contract

- Authored row counts remain 100, 500, and 1,000.
- Resting mounted rows remain 12 at every scale.
- During 60-frame vertical jumps, mounted rows range from 10 to 18.
- Across all 12 scenarios and both scroll axes: zero blank frames and zero fixed/calendar pane alignment failures.
- Resize preview remains measured in all scenarios.
- Selection, keyboard focus, and active resize rows remain mounted when scrolled away in all scenarios.
- The shared window uses variable track-plan heights, binary-searched bounds, 640px overscan, and identical leading/trailing spacers in both panes.
- Dragged swimlane/task, resizing, selection, and focused row IDs expand the shared range so interaction state remains mounted.

## Single-run observations

| Tasks | Full-mount elements | Windowed elements | Windowed initial render | Windowed vertical p95 | Windowed horizontal p95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 10,273–12,925 | 1,496–1,721 | 55–89 ms | 14 ms | 13–14 ms |
| 5,000 | 50,134–63,186 | 2,912–3,276 | 70–73 ms | 13–14 ms | 13–14 ms |
| 10,000 | 100,336–126,388 | 3,081–3,305 | 92–96 ms | 13–27 ms | 13–27 ms |

At 10,000 tasks, mounted element count falls by roughly 97% while authored row count and total scroll height remain intact. The windowed candidate also keeps row/listener work bounded as authored rows increase. These results satisfy the structural acceptance gate, but at least five alternating captures against a height-constrained non-windowed control are required before claiming a causal timing improvement.

## Remaining manual coverage

The automated harness cannot produce trusted React DnD gestures, so trusted drag plus edge auto-scroll remains a manual/CDP check. A live persisted task edit that changes an above-viewport row height also remains manual, while pure tests cover its anchor-compensation math. The runtime matrix covers large jumps, pane alignment, blanking, selection/focus/resize retention, resize availability, sticky headers, and horizontal behavior.
