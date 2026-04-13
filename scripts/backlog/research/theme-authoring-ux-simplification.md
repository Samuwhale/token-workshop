# Theme Authoring UX Simplification Audit

## Scope

- Reviewed the current theme workspace orchestration in `packages/figma-plugin/src/ui/components/ThemeManager.tsx`.
- Reviewed the authoring and review surfaces in `packages/figma-plugin/src/ui/components/theme-manager/ThemeAuthoringScreen.tsx`, `ThemeAxisCard.tsx`, `ThemeOptionWorkspace.tsx`, `ThemeCoverageScreen.tsx`, `ThemeAdvancedScreen.tsx`, and `ThemePreviewScreen.tsx`.
- Reviewed resolver authoring and resolver-to-theme bridging in `packages/figma-plugin/src/ui/components/ResolverPanel.tsx`, `packages/figma-plugin/src/ui/components/theme-manager/themeResolverContext.ts`, and `ThemeResolverContextBanner.tsx`.
- Reviewed theme state ownership in `packages/figma-plugin/src/ui/hooks/useThemeDimensions.ts`, `useThemeDimensionsCrud.ts`, `useThemeOptions.ts`, `useThemeBulkOps.ts`, `useThemeCoverage.ts`, `useThemeAutoFill.ts`, `useThemeDragDrop.ts`, `useThemeCompare.ts`, and `useThemeSwitcher.ts`.
- Declared touch path `packages/figma-plugin/src/ui/components/ThemeOptionCard.tsx` is stale in the current codebase. Its responsibilities now live across `ThemeAxisCard.tsx`, `ThemeOptionRail.tsx`, and `ThemeOptionWorkspace.tsx`.

## Current Concept Hierarchy

### 1. Workspace-level concepts

- `ThemeManager` owns four separate views: `authoring`, `coverage`, `compare`, and `advanced` (`ThemeManager.tsx`).
- The workspace also owns an authoring sub-mode split between `roles` and `preview`, plus independent focus state for dimension, option, role editor target, coverage context, compare context, and modal state.
- The view model is already telling us the product has at least three different jobs:
  - build theme structure
  - diagnose gaps and compare outcomes
  - manage advanced resolver logic

### 2. Authoring concepts shown in the common path

- The empty state starts with a designer-friendly idea of a theme axis such as `Color Mode`, `Brand`, or `Density`, but once an axis exists the UI immediately falls back to the internal dimension/option/set-role model.
- The common authoring path exposes all of these concepts together:
  - axis
  - option
  - set ordering
  - set roles (`Base`, `Override`, `Excluded`)
  - issue cards
  - empty override warnings
  - auto-fill gaps
  - coverage review
  - compare
  - resolver alignment context
- `ThemeOptionWorkspace.tsx` makes the internal structure explicit by grouping sets into `Base`, `Override`, and `Excluded` sections and rendering a three-state row control for every set.

### 3. Diagnostic concepts

- `useThemeCoverage.ts` turns coverage and missing-override data into issue summaries, then `ThemeOptionWorkspace.tsx` decides whether each issue should open role editing or coverage review.
- Coverage review is a separate screen, so the user has to understand both authoring state and diagnostics state before fixing a simple gap.
- Empty overrides, stale sets, and missing coverage are computed as separate concepts even though the designer often just experiences them as “this variant is incomplete”.

### 4. Resolver concepts

- Resolver logic is nominally behind `Advanced`, but resolver context leaks back into standard authoring via `ThemeAuthoringScreen.tsx` and `ThemeResolverContextBanner.tsx`.
- `ResolverPanel.tsx` still frames the model in implementation terms: resolver config, modifier contexts, resolution order, and migration from themes.
- The current boundary is not task-based. Designers are shown resolver mismatch language before they have clearly opted into resolver-style authoring.

## Concepts To Hide, Merge, Or Defer

### Hide for the common case

- Raw set-role terminology:
  - `Base`
  - `Override`
  - `Excluded`
- Role priority explanations and per-set priority semantics.
- Stale-set vs empty-override vs missing-override distinctions as first-class authoring concepts.
- Resolver context banners and modifier mismatch language.
- Compare mode and bulk role assignment tools.

### Merge into simpler designer concepts

- Merge `dimension` plus `option` into:
  - `Theme family`
  - `Variants`
- Merge assigned `source` sets into `Shared tokens`.
- Merge assigned `enabled` sets into `Variant tokens`.
- Merge issue categories into one top-level `Needs review` signal with drill-in buckets only after the user opens review.

### Defer behind explicit actions

- Coverage analysis:
  - only after the user chooses `Review issues`
- Bulk actions and override-set creation:
  - only after the user chooses `Advanced setup`
- Compare:
  - only after the user chooses `Compare variants`
- Resolver configuration:
  - only after the user chooses `Use resolver logic`

## Recommended Common-Case Authoring Model

### Primary job framing

The default workflow should be “create and manage theme variants”, not “edit set-role assignments”.

Recommended default model:

1. Choose a theme family
   - `Color mode`
   - `Brand`
   - `Density`
   - `Custom`
2. Define variants
   - `Light` / `Dark`
   - `Default` / `Premium`
   - designer-named variants
3. Assign tokens by intent
   - `Shared tokens`
   - optional `Variant-specific tokens`
4. Preview the variant summary
   - active variants
   - shared token source
   - variant token source
   - health status

### Mapping to the existing internal model

- `Theme family` maps to one `ThemeDimension`.
- `Variant` maps to one `ThemeOption`.
- `Shared tokens` maps to one or more `source` assignments.
- `Variant-specific tokens` maps to one or more `enabled` assignments.
- Anything not explicitly chosen stays internal and should not be shown as `Excluded` in the common flow.

### Common-case UI rules

- A designer creating `Light / Dark` should never have to see every set in the workspace.
- The default card for a variant should ask:
  - which set is shared across all variants?
  - which set, if any, is specific to this variant?
- Only if the user clicks `Edit advanced setup` should the UI reveal:
  - all sets
  - three-state role controls
  - bulk assignment tools
  - override-set creation from an existing set

## Progressive Disclosure Strategy

### Level 1: Simple variant builder

Visible by default:

- theme family presets
- variant list
- shared set picker
- per-variant set picker
- concise health badge
- preview

Hidden:

- full set matrix
- role labels
- coverage diagnostics
- resolver status

### Level 2: Review issues

Entry point:

- explicit `Review issues` action from a badge or summary row

Visible here:

- grouped issue buckets:
  - missing tokens
  - empty variant sets
  - deleted set links
- the best next action for the selected issue
- jump-back link to the exact variant

Hidden:

- bulk editing
- compare
- resolver authoring

### Level 3: Advanced setup

Entry point:

- explicit `Advanced setup` action on a theme family or variant

Visible here:

- raw set-role matrix
- bulk role assignment
- copy assignments
- create override set
- reorder and structural edits
- compare

### Level 4: Resolver logic

Entry point:

- explicit `Use resolver logic` action from the advanced area

Visible here:

- resolver selection and creation
- modifier contexts
- resolution order
- migration from theme dimensions

This keeps the default path focused on variant creation while preserving power-user tooling.

## Resolver vs Dimensions Boundary

### Present dimensions when

- the theme model is a straightforward cartesian variant system such as:
  - light / dark
  - brand A / brand B
  - density levels
- each variant can be explained as shared tokens plus optional variant-specific tokens
- the user is editing the visual authoring model for designers

### Present resolvers when

- resolution order must be authored directly
- modifier contexts are not a clean one-to-one match with theme options
- the same token set participates in multiple conditional contexts that are not well explained as “shared” plus “variant”
- the team is importing or maintaining a DTCG-native resolver file
- advanced publish logic depends on explicit resolver structure

### Recommendation

- Keep dimensions as the canonical default authoring surface.
- Move resolver entry fully behind `Advanced setup`.
- Remove resolver mismatch signaling from the default authoring cards.
- If a resolver already exists, show only a quiet `Advanced logic configured` badge in the simple flow, not mismatch details.
- Show full resolver alignment diagnostics only inside the resolver area or an advanced review pane.

## Theme Hook Consolidation Audit

### Current hook set

The current theme area is split across nine theme hooks:

1. `useThemeSwitcher`
2. `useThemeDimensions`
3. `useThemeDimensionsCrud`
4. `useThemeOptions`
5. `useThemeBulkOps`
6. `useThemeCoverage`
7. `useThemeAutoFill`
8. `useThemeDragDrop`
9. `useThemeCompare`

### What should be consolidated

- Consolidate `useThemeDimensions`, `useThemeDimensionsCrud`, `useThemeOptions`, and `useThemeDragDrop` into one structural controller.
  - They all mutate the same schema: dimensions, options, ordering, selection, and fetch refresh.
- Consolidate `useThemeBulkOps` into that same structural controller.
  - It mutates the same option-set assignments and maintains its own optimistic mutation chain.
- Consolidate `useThemeCoverage` and `useThemeAutoFill` into one diagnostics controller.
  - Auto-fill is not a separate domain; it is one remediation action derived from diagnostics.
- Keep `useThemeCompare` out of the common authoring state and treat it as an optional tool state.
- Keep `useThemeSwitcher` outside ThemeManager.
  - It is cross-workspace state used by preview and token browsing, not just authoring.

### Target state

Recommended target state management model:

- `ThemeWorkspaceProvider`
  - reducer-owned structural state
  - dimensions
  - variants
  - selection
  - simple-mode assignments
  - advanced-mode visibility
  - mutation status
- `ThemeDiagnosticsProvider`
  - derived issue model
  - review routing
  - auto-fill previews and actions
- `ThemeAdvancedToolsState`
  - compare state
  - resolver entry state
  - any raw matrix editor state

That reduces the authoring surface from nine peer hooks to:

1. cross-workspace theme switcher
2. theme workspace state
3. theme diagnostics state
4. advanced tool state

### Why this matters

- The current hook split mirrors implementation concerns instead of user tasks.
- `ThemeManager.tsx` has to manually stitch together selection, mutations, diagnostics, modals, and handoff targets.
- The current shape encourages prop drilling and separate optimistic rollback behavior per concern.
- A provider-backed reducer would let the UI ask for one coherent question:
  - what theme family is the user editing?
  - what state is it in?
  - what is the recommended next action?

## Proposed Information Architecture

### Primary route: Variants

- theme families
- variants
- shared set
- variant set
- quick preview
- `Review issues`
- `Advanced setup`

### Secondary route: Review

- issue buckets
- affected variants
- recommended fix
- return to variant

### Secondary route: Advanced

- set-role matrix
- bulk actions
- compare
- structural maintenance
- `Use resolver logic`

### Tertiary route: Resolver logic

- resolver configs
- migration
- modifier contexts
- resolution order

## Suggested Implementation Order

1. Replace the default theme authoring card model with a simple variant builder that hides set-role terminology.
2. Move diagnostics into an explicit review route with one summary badge in authoring.
3. Move raw set-role editing, compare, and override-set maintenance into `Advanced setup`.
4. Move resolver alignment details fully behind the advanced resolver entry.
5. Collapse theme workspace state into a provider-backed controller so the UI and mutation model match the new IA.

## Follow-up Seeds

- Build a simple theme variant composer for light/dark and brand flows.
- Split diagnostics into a dedicated review surface instead of mixing issue classes into authoring.
- Move raw set-role tools and compare into an advanced setup route.
- Clarify resolver opt-in and remove resolver mismatch leakage from the default theme authoring path.
- Consolidate ThemeManager state into a small provider/reducer architecture aligned to structural state, diagnostics, and advanced tools.
