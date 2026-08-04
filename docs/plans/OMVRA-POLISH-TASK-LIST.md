# Omvra Product Polish Task List

Date: 2026-08-04
Scope: Omvra desktop application in `/Users/sorin.jurcut/Documents/GitHub/Plumy`

## Purpose

Raise Omvra's perceived quality from a capable collection of advanced surfaces to a calm, coherent product for planning, supervising, and reviewing local AI-assisted work.

This is a polish plan, not a feature expansion. Local-first and local-only execution remain product constraints and are not treated as problems to solve.

## Current diagnosis

- The product is functionally sophisticated, but visual and interaction polish is uneven across Timeline, Kanban, Roadmap, Goals, Task Details, Settings, and agent execution.
- The highest-leverage gap is hierarchy: users need to see what matters, why it matters, and what action is available before seeing implementation or diagnostic detail.
- The visual token audit already unified status, project, and milestone-health resolution. Remaining inconsistency is concentrated in neutral surfaces, typography, control sizing, radii, and one-off feedback patterns.
- Existing UI 2.0 work must be reused and extended, not replaced with a parallel redesign.

## Delivery lanes

### Highest priority

1. Establish one Omvra visual language across core surfaces.
2. Make agent execution feel like a guided workflow rather than a diagnostic console.
3. Make attention-required states obvious and actionable.
4. Complete a cross-surface manual visual and accessibility pass.

### Quick wins

1. Replace native browser alerts with the existing Omvra feedback primitives.
2. Standardize empty-state copy and next actions.
3. Remove obvious microcopy and terminology friction from agent/runtime surfaces.
4. Improve onboarding copy and replace generic illustration rows with product moments where existing assets allow it.

### Open follow-up work

1. Reduce initial renderer bundle weight and improve perceived startup speed.
2. Improve responsive and narrow-width behavior across dense dialogs and inspectors.
3. Add focused visual regression coverage for fragile interactive surfaces.
4. Improve settings information architecture and progressive disclosure.
5. Define and validate a repeatable release-quality visual QA checklist.

## Existing work to reuse

These existing tasks overlap with the plan and should remain the source of truth for their scope:

- `Omvra Design Language` — expand into the shared token and primitive foundation.
- `UI 2.0 - Visual Polish for Empty states` — use for the empty-state pass; do not create a duplicate empty-state implementation task.
- `UI 2.0 - UI Components Refresh` and `UI 2.0 - Redesign UI Components` — use for shared buttons, inputs, selectors, text areas, radios, checkboxes, groups, and chips.
- `UI 2.0 - Visual readiness QA and rollout verification` — reuse its verification intent where applicable; add the missing current-surface audit below only if the existing task does not cover it.

## Full backlog

### P0 — product-defining polish

#### P0.1 Cohesive Omvra visual language

Create one small, reusable visual language for surfaces, text, borders, radii, controls, focus states, and semantic feedback. Apply it to the highest-traffic surfaces first: app shell, task details, task edit, Kanban, Timeline, Roadmap, Goals, and Settings.

Acceptance: no new one-off neutral/radius/control treatment is introduced in the target surfaces; the existing status/project visual resolvers remain canonical; light/dark or future theme behavior is not broken; focused build and visual review pass.

#### P0.2 Guided agent execution flow

Reframe task and milestone execution around a clear sequence: preflight, confirmation, working, needs input/blocker, review, handoff. Keep technical runtime, provider, repository, and capability details available behind progressive disclosure.

Acceptance: a user can understand what will happen, where it will happen, what is blocking it, and what to do next without reading raw diagnostics; interrupted, failed, resumed, external-handoff, and completed states are visually distinct; keyboard and focus behavior remain correct.

#### P0.3 Attention and action hierarchy

Audit the app shell, status bar, task details, Roadmap, Goals, and agent surfaces so blocked work, pending review, active execution, failed execution, and required human input are more prominent than routine metadata.

Acceptance: each attention state has a consistent semantic treatment, an explanatory label, and an available next action or explicit reason why no action is available; state meaning does not rely on color alone.

#### P0.4 Cross-surface polish QA

Run a manual visual, interaction, narrow-width, keyboard, reduced-motion, and contrast pass across Timeline, Kanban, Roadmap, Goals, Task Details, Task Edit, Settings, onboarding, and agent execution.

Acceptance: findings are recorded with surface, reproduction, severity, evidence, and owner; critical and high findings are either fixed or explicitly accepted; the production build and relevant tests pass.

### Quick wins

#### QW.1 Replace browser alerts

Replace remaining `window.alert` or equivalent native browser feedback with the existing Omvra toast, inline alert, or modal patterns.

Acceptance: no user-facing native alert remains in the desktop workflow; errors preserve their actionable message and do not disappear without feedback.

#### QW.2 Standardize empty states

Give empty states a consistent structure: title, cause or explanation, and next action. Apply to tasks, milestones, dependencies, context history, diagnostics, agent activity, and filtered views.

Acceptance: empty states explain whether the user should create, clear a filter, configure a dependency, start work, or retry; existing useful empty-state semantics are preserved.

#### QW.3 Clarify runtime microcopy

Replace implementation-first labels on the primary agent path with plain-language labels while retaining technical detail in secondary sections. Keep “Start work” as the primary action.

Acceptance: primary labels describe user outcomes; ACP, MCP, preflight, binding, and capability terms are explained or moved behind detail affordances; no unsupported capability is implied.

#### QW.4 Improve onboarding communication

Tighten onboarding slide copy around Plan, Delegate, Supervise, and Review. Use real Omvra terminology and existing product imagery or lightweight product moments instead of generic illustrative rows where feasible.

Acceptance: a new user can explain Omvra's core workflow after onboarding; close, back, next, done, progress, focus return, and reduced-motion behavior remain correct.

### Open follow-up work

#### O.1 Renderer startup and bundle polish

Investigate the large initial renderer chunk and code-split heavy or low-frequency surfaces such as Goals, Settings, diagnostics, and large dialogs without causing loading flicker or state loss.

Acceptance: startup and first-interaction measurements are captured before and after; deferred surfaces have intentional loading states; build warnings are reduced or documented with evidence.

#### O.2 Dense layout and narrow-width pass

Audit dense dialogs, inspectors, sidebars, timeline controls, roadmap details, and task execution panels at narrow desktop widths and reduced-height windows.

Acceptance: no clipped primary actions, inaccessible scroll regions, overlapping labels, or unusable horizontal controls; keyboard focus remains visible.

#### O.3 Visual regression coverage

Add targeted automated or fixture-based checks for fragile surfaces and state transitions rather than attempting a screenshot test for every component.

Acceptance: coverage includes at least task edit/details, Timeline, Roadmap, Goals runtime states, Settings feedback, and empty/error/blocked states; failures identify the affected surface.

#### O.4 Settings information architecture

Review Settings grouping and progressive disclosure so local storage, MCP, runtime access, agent profiles, diagnostics, backup, updates, and help have clear user-facing relationships.

Acceptance: a new user can find local data, agent access, runtime access, backup, and diagnostics without knowing internal architecture terms; disabling runtime access remains clearly independent from MCP access.

#### O.5 Release-quality polish checklist

Create a short repeatable checklist covering visual consistency, focus, keyboard operation, reduced motion, empty/loading/error states, persistence, backup/import, local-only boundaries, and production build verification.

Acceptance: checklist is stored with the project docs and used for the next polish release review.

## Suggested sequencing

1. Expand `Omvra Design Language` and finish the existing shared component refresh.
2. Complete empty-state work and the quick feedback/microcopy fixes in parallel.
3. Implement the guided agent execution and attention hierarchy using the shared primitives.
4. Run cross-surface QA and use its findings to split narrow-width, regression, and settings follow-ups.
5. Measure startup before deciding how much bundle splitting is worth the added complexity.

## Definition of done for this polish initiative

- Core surfaces share a recognizable Omvra visual language.
- The agent path is understandable without exposing raw runtime implementation detail by default.
- Empty, loading, error, blocked, review, and success states are consistent and actionable.
- Local-first behavior remains explicit and intact.
- Keyboard, focus, reduced-motion, and color-independent state communication are verified.
- The build and focused tests pass, and remaining visual risks are documented rather than implied away.
