# Tokens / Themes / Recipes IA Redesign — Plan Review & Tracker

## Phase 1: IA Restructure
> Move Recipes under Tokens, reduce top tabs from 5 to 4.

- [ ] Remove `recipes` as a top-level workspace in `navigationTypes.ts`
- [ ] Add `library` and `recipes` as sections within Tokens workspace
- [ ] Update `PanelRouter.tsx` routing
- [ ] Update `NavigationContext.tsx` state management
- [ ] Update shell tab bar in `App.tsx`
- [ ] Unify search: Tokens search bar searches both tokens and recipes
- [ ] Update command palette entries and keyboard shortcuts
- [ ] Ensure active set persists when switching between Library and Recipes sections
- [ ] Update localStorage keys and defaults
- [ ] Design empty states for Tokens > Library and Tokens > Recipes (first-run)
- [ ] Handle narrow width: define how section switcher renders at minimum width

## Phase 2: Shell Chrome Reduction
> Compact theme bar, remove redundant banners, reclaim vertical space.

- [ ] Replace persistent expanded theme bar with compact active-theme summary
- [ ] Add on-demand theme switcher (expands from compact summary)
- [ ] Remove post-import success banner (or make it a toast)
- [ ] Audit and remove redundant state chips / pills that restate nearby content
- [ ] Simplify handoff breadcrumb: origin name + back action only, no "reason" text
- [ ] Ensure no header overflow at minimum plugin width

## Phase 3: Token Row Improvements
> Requires clear problem definition before implementation.

- [ ] Audit current token row: identify what's hard to scan and why
- [ ] Differentiate visual hierarchy: primitives vs. aliases vs. recipe-generated tokens
- [ ] Improve value previews by type (color swatch, spacing, typography stack)
- [ ] Improve group/folder visual differentiation
- [ ] Define which row-level affordances to promote based on frequency: scan, compare, quick-edit, check resolved value, see references
- [ ] Keep hover-reveal for secondary actions; don't over-promote

## Phase 4: Theme Stage Simplification
> Requires "minimum viable theme flow" analysis before implementation.

- [ ] Audit: which theme tasks actually require separate screens?
- [ ] Define minimum viable theme flow (likely: authoring + preview, with compare/resolver as secondary)
- [ ] Collapse stages where possible — a dark mode theme shouldn't need 4 steps
- [ ] Move rename/autofill/advanced controls into secondary menus or collapsible sections
- [ ] Keep resolver as opt-in advanced flow, not a required stage

## Phase 5: Recipe Editor Polish
> Current 2-step flow is adequate. Only add friction where conflicts exist.

- [ ] Keep current 2-step flow (intent + configure)
- [ ] Add conflict/overwrite review only when recipe would overwrite existing tokens
- [ ] Remove any redundant helper copy/chrome in editor steps
- [ ] Collapse secondary options until needed

---

## Decisions to preserve

| Decision | Rationale |
|---|---|
| Recipes under Tokens, not top-level | Recipes are a means of creating tokens, not a separate mental model |
| Compact on-demand theme access | Persistent theme bar wastes vertical space in constrained Figma window |
| 4 top-level tabs (Tokens, Themes, Inspect, Sync) | Fewer tabs = faster orientation |
| Simple back-button handoffs | Designers remember why they navigated; don't restate it in chrome |
| No 4-step recipe wizard | Wizards help first-time flows but punish repeat use |

## Risks to watch

| Risk | Mitigation |
|---|---|
| "View" mega-menu hides features | Keep most-used toggle (theme lens) as direct affordance; only group rarely-combined options |
| Theme stages still too many | Validate with minimum viable flow analysis before building |
| Doing all 5 phases simultaneously | Ship in order; don't start phase N+1 until N is stable |
| Losing set context on section switch | Explicitly persist active set across Library/Recipes |
