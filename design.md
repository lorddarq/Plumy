# Omvra design language

This is the implementation contract for Omvra's quiet, native-like UI: calm surfaces, deliberate spacing, restrained borders and shadows, legible type, and one consistent action/focus language. The contract is implemented by the primitives in `src/app/components/ui/` and the paired foundation stylesheet in `src/styles/design-tokens.css`.

## Visual principles

Omvra is quiet, native-like, and highly legible. Prefer calm surfaces, deliberate spacing, restrained borders and shadows, clear typography, and one consistent action/focus language. Use visual emphasis to establish hierarchy and intent, not decoration; keep the anchored-panel direction intact and preserve the canonical status, project, milestone-health, and contrast resolvers.

## Mini-kit information architecture

Each kit entry has one reusable core component in `src/app/components/ui/<component>.tsx` and one paired style source: shared semantic foundation rules live in `src/styles/design-tokens.css`, while product-specific layout belongs in `src/styles/components.css` or the owning surface stylesheet. Consumers compose the core component with `className`; they do not copy its interaction or focus contract. `design.md` is the index, the component file is the behavior API, and the paired stylesheet is the visual token implementation.

## Foundations

Use the `--omvra-*` semantic tokens in `src/styles/design-tokens.css` as the source of truth. Canvas, default, subtle, and muted surfaces use `--omvra-color-surface-*`; primary, secondary, muted, disabled, and inverse text use `--omvra-color-text-*`; borders use `--omvra-color-border-subtle` or `--omvra-color-border-default`. Controls use `--omvra-radius-control`; cards and anchored panels use `--omvra-radius-surface`; status chips use `--omvra-radius-pill`. Spacing is based on the 4px scale (`--omvra-space-1`, `2`, `3`, `4`, `6`, `8`). Surface elevation is quiet; floating surfaces use `--omvra-elevation-floating` only when they separate from content. Persistent feedback uses paired `--omvra-color-feedback-{semantic}` foreground and `--omvra-color-feedback-{semantic}-surface` background tokens.

Typography uses the existing Omvra font stack and the `--omvra-font-*` tokens in `design-tokens.css`, alongside the existing Tailwind type scale. Body text is 14–16px, labels are medium weight, supporting text is secondary/muted, and headings use the smallest level that establishes hierarchy. Do not encode meaning in weight or color alone.

## Interaction contract

`Button` is the canonical action primitive. Variants are `primary`/`default` (one main action), `secondary` (soft secondary action), `outline`/`tertiary` (bordered safe alternative or quiet row action), `ghost` (low-emphasis affordance), `link` (inline navigation), and `destructive` (irreversible or dangerous action). Use one primary action per region; put cancel/close before the primary action and keep destructive actions visually and semantically distinct. Every action supports keyboard focus and native disabled behavior; loading labels must communicate the in-progress state and retain the disabled guard while work is active.

`Input`, `Textarea`, and `SelectTrigger` are the canonical field controls. Pair each with `Label`, visible error/help text, and `aria-describedby` where needed. Preserve the native control semantics; do not replace a select with a clickable styled div. `Badge` is for compact, non-interactive metadata. Status/project/milestone-health colors must continue through the existing resolvers (`getStatusVisual`, `getReadableTextClassFor`, and their shared roadmap/status helpers), not a new local mapping.

`Alert` is the canonical notice for persistent feedback (`default` and `destructive` plus documented local semantic treatment). Toasts are transient confirmation only. `Card` and `.omvra-panel-section` are the canonical surface patterns. `.omvra-action-bar` is the canonical footer/action-row layout and wraps on narrow widths.

The component API is intentionally small: `Input` owns field geometry and focus, `SelectTrigger` owns the trigger contract while Radix owns the menu, `Label` owns the accessible label treatment, `Badge` owns compact non-interactive metadata geometry, `Alert` owns persistent notice framing, `Card` owns reusable surface composition, and `.omvra-action-bar` owns action-row layout. Local `className` values may change density or product-specific color only when the audit records why the core contract cannot be used.

## States and accessibility

Documented states are default, hover, pressed, focus-visible, disabled, invalid/error, loading, and (where applicable) open/selected. Focus is always visible: use the shared focus ring and never remove the outline without an equivalent contrast-safe indicator. Keep interactive targets usable by keyboard and screen readers, preserve labels and names, maintain at least 4.5:1 text contrast (3:1 for large text), and pair errors with text, not color alone.

At narrow widths, action bars wrap and controls may become full width; do not hide required actions. Respect `prefers-reduced-motion`; the token stylesheet disables non-essential transitions and animations, while product-specific motion must provide the same reduced-motion override. The `.dark` token mapping is the future-theme compatibility boundary; new components must consume semantic tokens rather than light-only raw colors. Prefer content-sized actions (`w-fit`/`width: max-content`) unless a surface contract explicitly requires equal-width controls.

## Usage

```tsx
<section className="omvra-panel-section">
  <Label htmlFor="workspace-name">Workspace name</Label>
  <Input id="workspace-name" aria-describedby="workspace-name-help" />
  <p id="workspace-name-help" className="text-muted-foreground">Shown in the workspace switcher.</p>
  <div className="omvra-action-bar"><Button variant="outline">Cancel</Button><Button>Save</Button></div>
</section>
```

## Migration and ownership

Update canonical primitives first, then migrate representative consumers. Local styles may remain only when they express a genuinely product-specific treatment or are listed in the [overlap audit](docs/design-language-overlap-audit.md). The [consolidation follow-up](docs/plans/OMVRA-DESIGN-LANGUAGE-CONSOLIDATION.md) owns the remaining inventory-driven migration; it must not change task, board, timeline, persistence, runtime, or agent behavior. Deprecated local controls should point to the canonical primitive and be removed after their consumers migrate.

Source references: [visual token audit](docs/architecture/visual-token-audit.md), [UI 2.0 implementation PRD](docs/plans/UI-2.0-IMPLEMENTATION-PRD.md), [overlap audit](docs/design-language-overlap-audit.md), [consolidation follow-up](docs/plans/OMVRA-DESIGN-LANGUAGE-CONSOLIDATION.md), and task `1782744396593` (Omvra Design Language, current revision 11).
