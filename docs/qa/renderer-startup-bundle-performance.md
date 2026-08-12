# Renderer startup and bundle performance

Task: `task-5e98e643-4371-4a92-a2e2-a3c23b9272b4` (O.1)

## Measurement method

Both measurements use `npm run build:renderer` from the Plumy checkout on macOS arm64 with Node `v22.23.1`, Vite `v8.0.16`, and the same production build configuration. Build duration is the Vite-reported renderer build duration. Startup payload is the minified `dist/assets/index-*.js` artifact and its gzip size reported by Vite. First interaction is the deferred chunk fetched when opening a previously unopened low-frequency surface; its payload is the corresponding Vite artifact and gzip size. This is a reproducible artifact/payload measurement, not a browser CPU trace.

## Baseline before this change

Command: `npm run build:renderer`

- Build duration: `647 ms`
- Initial renderer JS: `744.62 kB` minified / `206.96 kB` gzip (`index-D_UxmMAC.js`)
- Warning: one chunk exceeded the 500 kB warning threshold
- Largest deferred view already present: `GoalsView-DDSnNDuw.js`, `262.98 kB` / `64.26 kB` gzip
- Task and task-details dialogs were already deferred; Preferences, milestone dialogs, and SwimlaneDialog were still statically reachable from `AppPanels`.

## After

Command: `npm run build:renderer`

- Build duration: `608 ms`
- Initial renderer JS: `457.24 kB` minified / `130.84 kB` gzip (`index-CPeRl-Be.js`)
- Initial JS reduction: `287.38 kB` minified (`38.6%`) and `76.12 kB` gzip (`36.8%`)
- Vite emitted no chunk-size warning
- First-interaction payloads are now isolated as follows:
  - Preferences: `111.79 kB` / `30.03 kB` gzip
  - Milestone dialog: `10.16 kB` / `3.71 kB` gzip
  - Milestone details: `14.65 kB` / `5.41 kB` gzip
  - Swimlane dialog: `5.80 kB` / `2.10 kB` gzip

## Implementation and verification

`AppPanels` keeps each surface mounted after its first requested load, so closing and reopening a dialog does not reload it or lose its local state. `DeferredSurface` provides an explicit loading status, an accessible error region, and a `Try again` action for failed dynamic imports. Existing Goals, timeline, kanban, roadmap, task, and task-details loading behavior remains unchanged.

The deferred surfaces do not add providers or move state ownership: all workspace data and callbacks continue to come from `AppPanels` props, while dialog open/selected state remains in `uiLayoutStore`/`useWorkspaceDialogs`. The remaining risk is browser-level focus and interaction validation of the new first-load states; inspect Preferences, milestone details/edit, and swimlane edit in a packaged/dev Electron run before acceptance.

## Commands

- `npm run build:renderer` — passed after the change; warning removed.
- `npm run test:hooks` — passed: 16, skipped: 2.
- `git diff --check` — passed.
- `npx tsc --noEmit --incremental false` — existing repository-wide type errors remain; no new error was isolated to `DeferredSurface` or the changed `AppPanels` import path. The full error list is intentionally not treated as a performance-task pass.

