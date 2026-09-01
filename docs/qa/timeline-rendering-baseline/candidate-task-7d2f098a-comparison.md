# Timeline viewport consolidation comparison

Task: `task-7d2f098a-2fc0-4679-b2ed-0f151ab067bb`

## Inputs

- Control: `control-814a336.json`, unchanged `main` commit `814a33659374171ae4f5d149e60f08aab80e6002`.
- Candidate: `candidate-task-7d2f098a-c0f5b111.json`.
- Candidate renderer diff SHA-256: `c0f5b1119fd6b6672577954b6f79d7e8b05a5ddd366fbb34fd3333e46c77d8aa`.
- Fixture, viewport, Electron/Chromium version, and twelve-case display matrix are identical.

## Behavioral comparison

All twelve candidate scenarios completed with no renderer error. Every scenario matched the control's:

- logical swimlane row count;
- mounted DOM element count;
- currently rendered task-fragment count;
- weekend-visible/hidden mode;
- default/resized month-width mode;
- successful resize-preview interaction.

The exact mounted element counts remained:

| Tasks | Weekends visible | Weekends hidden |
| ---: | ---: | ---: |
| 1,000 | 12,925 | 10,273 |
| 5,000 | 63,186 | 50,134 |
| 10,000 | 126,388 | 100,336 |

Focused viewport tests additionally cover visible month range, leading/trailing spacers, preserved scroll metrics, month-width overrides, day widths/offsets, total width, weekend-gap date lookup, and Today/reveal marker geometry. Existing tests still cover prepend compensation and reveal-date window expansion.

## Performance observations

This was one control capture followed later by one candidate capture after several consecutive Electron benchmark runs. Small and medium candidate cases were materially slower, while the large cases were broadly similar or faster on several metrics. The inconsistent scale pattern and run order make the pair unsuitable for an improvement or regression claim.

For the 10,000-task cases, candidate initial render ranged from 564–620 ms versus control 576–644 ms. Candidate horizontal p95 ranged from 439–640 ms versus control 507–679 ms. These are observations only; the protocol requires at least five alternating control/candidate runs before using performance as a decision.

The comparison is sufficient for this consolidation task's behavioral gate: the authoritative viewport produces the same mounted surface across every baseline fixture. Performance optimization remains a later experimental task.
