# Omvra design-language consolidation follow-up

Follow-up to task `1782744396593`. See the authoritative [design contract](../../design.md) and [overlap audit](../design-language-overlap-audit.md).

## Scope

Complete the remaining inventory-driven migration of duplicate-intent controls and surfaces. This task must not change task, board, timeline, persistence, runtime, or agent behavior.

## Todos

- [ ] Migrate same-intent local buttons to `ui/button.tsx`; preserve explicitly differentiated execution/timeline actions with a documented reason.
- [ ] Migrate repeated settings and goals field classes to `Input`, `SelectTrigger`, and `Label` contracts.
- [ ] Consolidate generic badges/notices onto `Badge` and `Alert` while retaining status/project/milestone-health resolvers.
- [ ] Migrate same-intent cards/panel sections and footer rows to token-backed primitives.
- [ ] Remove or deprecate superseded local styles with a consumer migration path.
- [ ] Verify keyboard focus, disabled/loading/error states, contrast, narrow widths, reduced motion, and dark/future-theme behavior.
- [ ] Run focused tests and production build; attach evidence and update the overlap audit.

## Completion boundary

Every finding in the audit must be marked migrated, preserved with a reason, or explicitly deferred with an owner. Do not mark complete based on documentation alone.
