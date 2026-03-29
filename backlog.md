# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: anything that makes this the best plugin — from atomic fixes to full overhauls. No users yet, no backwards compat needed. -->
<!-- Completed items: see scripts/backlog/progress.txt -->
<!-- Organization: by functional area, not by screen — resilient to UI restructuring -->
<!-- Inbox: backlog-inbox.md — drained into this file by backlog.sh each iteration -->

---

## App Shell & Navigation

### Bugs

### QoL

### UX

---

## Token Management

### Bugs

### QoL

### UX

---

## Theme Management

### Bugs

### QoL

### UX

---

## Sync

### Bugs

### QoL

### UX

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

---

## Selection Inspector & Property Binding

### Bugs

### QoL

### UX

---

## Import

### Bugs

### QoL

### UX

---

## Token Generation & Graph Editor

### Bugs

### UX

- [x] [HIGH] Type scale preview is the weakest of all generators — renders "Ag" text clamped to 8–32px so all steps look nearly identical; a type scale's purpose is showing visual hierarchy but the preview actively hides it; replace with a stacked typography specimen rendering actual text ("Heading", "Subheading", "Body text", "Caption") at generated sizes with real line-height, remove the clamp, show computed px alongside token value (e.g. "1.563rem → 25px"), and add a visual scale ruler showing ratio relationships between consecutive steps (TypeScaleGenerator.tsx:89-112)
- [x] Type scale staircase editor only appears when sourceValue exists — if the user enters an inline base value there's no staircase visualization; compute from inline value so the interactive editor is always available (TypeScaleGenerator.tsx:152-158)
- [x] Type scale has no inline step editing — spacing/opacity/z-index let you add/remove/rename steps inline, but type scale only offers 3 fixed presets with no customization; add the same collapsible "Edit steps" pattern so designers can create non-standard scales (e.g. skip 2xl, add "display") with custom exponents (TypeScaleGenerator.tsx:159-168)
- [x] Staircase editor drag affordance is undiscoverable — drag arrows only appear during active drag (opacity: isDragging ? 0.8 : 0), not on hover; designers won't know the bars are interactive until they accidentally drag one (TypeScaleStaircaseEditor.tsx:226)
- [x] Staircase editor has fixed 240px width — doesn't adapt to the plugin panel width; should use viewBox with width="100%" for responsive sizing (TypeScaleStaircaseEditor.tsx:30,134)
- [~] Border radius preview shows bar charts instead of actual rounded corners — reuses SpacingPreview (horizontal bars) but should show a row of rectangles with increasing corner radii, which is instantly legible to a designer (BorderRadiusGenerator.tsx, SpacingScaleGenerator.tsx:70)
- [~] Override row UX is confusing — single click on the lock icon either clears the override or opens edit depending on state; designers expect separate "edit" and "remove" actions; split into a pencil icon for edit and an X for clear (generatorShared.tsx:82-84)
- [~] No generator configuration comparison — can't preview two ratios or two configurations side by side before committing; useful for A/B-ing e.g. Minor Third vs Major Third type scales
- [ ] No skeleton/loading state during 300ms preview debounce — currently shows stale data while new preview loads; add a subtle loading indicator so the designer knows a refresh is pending (useGeneratorPreview.ts)

---

## Token Editor

### Bugs

### QoL

---

## Settings & Data Management

### Bugs

### QoL

### UX

---

## Code Quality

### Redundancy & Duplication

- [ ] getErrorMessage() duplicated in server/src/utils.ts and server/src/errors.ts — utils.ts is never imported anywhere; the entire file is dead code (packages/server/src/utils.ts, packages/server/src/errors.ts:56-58)
- [ ] resolvers.ts uses `reply.code()` (13 occurrences) while every other route file uses `reply.status()` — functionally identical Fastify aliases but inconsistent across the codebase (packages/server/src/routes/resolvers.ts)
- [ ] `components/editorStyles.ts` is dead code — `inputClass` and `labelClass` were migrated to `shared/editorClasses.ts`; the old file at `packages/figma-plugin/src/ui/components/editorStyles.ts` has no importers and can be deleted
- [ ] `overwritePaths` useMemo is shadowed and unused in the confirmation branch of TokenGeneratorDialog — the memo at line 216 produces a Set used in the main render (lines 617-630), but the `showConfirmation` branch at line 241 creates an identical `new Set(overwrittenEntries.map(...))` that shadows it; the memo is dead in that branch (packages/figma-plugin/src/ui/components/TokenGeneratorDialog.tsx:216,241)
- [ ] Generator config types have inconsistent unit unions — TypeScaleConfig, SpacingScaleConfig, BorderRadiusScaleConfig allow `'px' | 'rem'`; CustomScaleConfig allows `'px' | 'rem' | 'em' | '%'`; none use the shared `DimensionUnit` type from core/constants (packages/core/src/generator-types.ts)
- [ ] Orphaned validate.sh duplicate — identical copy of scripts/backlog/validate.sh exists at packages/server/scripts/backlog/validate.sh (packages/server/scripts/backlog/validate.sh)
- [ ] package-lock.json coexists with pnpm-lock.yaml — project declares `"packageManager": "pnpm@9.15.0"` but an npm lock file exists and is newer; should be deleted to prevent dependency drift (root package-lock.json)

### Performance

### Correctness & Safety

- [ ] DimensionValue type uses hardcoded 4-unit union instead of the DimensionUnit type that defines 20 units — runtime constants support `vw`, `vh`, `ch`, `cap`, `dvw`, etc. but the type rejects them; DimensionValue should use `DimensionUnit` from constants.ts (packages/core/src/types.ts:20, packages/core/src/constants.ts:56-58)
- [ ] Three plugin message types handled in controller.ts are missing from the PluginMessage union — `SearchLayersMessage` is defined at types.ts:343 but not in the union; `ScanTokenVariableBindingsMessage` and `RemoveBindingFromNodeMessage` have no interface at all; all three are dispatched from UI and handled in the switch but bypass compile-time type checking (packages/figma-plugin/src/shared/types.ts:409-441, src/plugin/controller.ts:298,319,332)
- [ ] ScanCanvasHeatmapMessage type definition missing optional `scope` property — handler reads `msg.scope ?? 'page'` but the interface has no scope field, so the property access is untyped (packages/figma-plugin/src/shared/types.ts, src/plugin/controller.ts:272)
- [ ] PUT /api/sets/reorder has no try/catch — every other set mutation endpoint wraps logic in error handling; this one lets unhandled exceptions propagate as 500s with no structured error response (packages/server/src/routes/sets.ts:145-165)
- [ ] useGeneratorSave overwrite-check failure silently proceeds to commit — when POST /api/generators/:id/check-overwrites errors, line 168 logs a warning and calls commitSave() without notifying the user; if the server is unavailable during the pre-save check, tokens that were manually edited after generation will be silently overwritten with no warning (packages/figma-plugin/src/ui/hooks/useGeneratorSave.ts:167-169)
- [ ] ImportPanel conflict-detection failure is invisible — when fetchExistingTokenMap errors, line 224 calls setExistingTokenMap(null) with no user-visible message; the import panel shows missing conflict counts but gives no indication that the server fetch failed and conflict detection is down (packages/figma-plugin/src/ui/components/ImportPanel.tsx:224)
- [ ] Generator PATCH route casts body.inputTable to InputTable after shallow validation — only checks for `inputKey` string and `rows` array existence, doesn't validate row structure; malformed rows pass type assertion (packages/server/src/routes/generators.ts:405-408)
- [ ] dtcg-resolver loadSource silently returns empty Map for invalid internal pointers — no warning logged when a source reference doesn't resolve to a set, making misconfigured resolvers hard to debug (packages/core/src/dtcg-resolver.ts:248-249)

### Accessibility

### Maintainability

- [!] ExportPanel live preview re-runs all format generators on every settings change without debounce — changing a single toggle (e.g., "include descriptions") synchronously rebuilds the full ZIP and all preview strings; for large token sets this causes visible jank; debounce the preview rebuild by 250ms, matching the pattern already used in search inputs across the app (ExportPanel.tsx ~L500-1000)
- [x] GraphPanel has no inline output preview before saving a generator — creating a generator requires configuring it, saving, then navigating to TokenList or TokenFlowPanel to see the output; this breaks the authoring feedback loop; add a live "Preview output" section within GraphPanel that renders the first N generated tokens in real time as parameters change, before the generator is saved (GraphPanel.tsx ~L400 lines, no preview section)
- [x] No "Copy resolved value" action on token detail — TokenDetailPreview copies the token path to clipboard, but there is no way to copy the resolved value (e.g. `#FF5733`) without manually reading it from the preview swatch; add a copy-value button alongside the existing copy-path button, especially useful for tokens with deeply-nested alias chains where the resolved value is not immediately obvious (TokenTreeNode.tsx, TokenEditor preview area)
- [!] ResolverPanel is undiscoverable — it only appears inside ThemeManager behind an "Advanced" toggle; users who create themes and later want to configure DTCG resolvers have no indication this panel exists from any navigation path; either surface Resolvers as a dedicated sub-tab under Define (alongside Themes, Generators) or add a visible "Resolvers" link in the ThemeManager header that doesn't require toggling Advanced mode first (ResolverPanel.tsx, App.tsx tab structure)

- [!] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click, matching standard tree-view selection behavior (TokenTreeNode.tsx group context menu ~L626-793)

- [x] Three separate history/undo mental models with no unifying UI — users encounter local undo stack (Cmd+Z, 20-action limit, lost on refresh), server operation log (useRecentOperations fetches data but has no rendered UI), and git history/snapshots (HistoryPanel); there's no explanation of how these relate or when to use which; add a unified "Recent Actions" sidebar or panel that surfaces the operation log and connects it to the undo toast (useRecentOperations.ts, UndoToast.tsx, HistoryPanel.tsx)

- [x] [HIGH] Operation log has major coverage gaps and dead rollback code — 7 destructive server endpoints (group move/duplicate/reorder/create, group metadata update, single token move/copy) skip operationLog.record() making them impossible to undo; separately, rollbackStructural() and invertMetadata() at operation-log.ts:314-387 reference an undefined OperationMetadata type and non-existent entry.metadata field — dead code from an incomplete refactor that should be completed or removed (packages/server/src/routes/tokens.ts lines 88-159, 178, 488, 508; packages/server/src/services/operation-log.ts lines 314-387)
- [x] [HIGH] CommandPalette keyboard navigation fires wrong command in grouped (no-query) view — flatList used for ArrowDown/Enter is built from filteredCommands, but the section view highlights using sectionFlatItems.indexOf() which prepends Recent commands in different order; pressing Enter activates a different command than the one visually highlighted (packages/figma-plugin/src/ui/components/CommandPalette.tsx lines 263-271, 344-348, 543-544)

- [x] Server token route handlers have TOCTOU races between existence checks and mutations — getToken-then-createToken at tokens.ts:600-616 allows concurrent creates for the same path; snapshot captures (before/after) around group rename, batch move, and delete are taken outside any critical section so concurrent requests interleave between snapshot and mutation; the withLock protects individual store operations but not the multi-step route handler sequences (packages/server/src/routes/tokens.ts)
- [x] variableSync rollback is fragile: sequential failures silently leave partial Figma state and collection cleanup is O(n²) — rollback iterates variableSnapshots sequentially with individual try/catch that logs errors but continues, reporting success to the UI even when partial; collection cleanup at lines 146-154 re-fetches all collections AND all variables per iteration instead of fetching once; should use Promise.allSettled and report partial-rollback status to UI (packages/figma-plugin/src/plugin/variableSync.ts lines 119-154)

- [ ] PublishPanel is a 2316-line monolith mixing three unrelated workflows — Variable sync, Style sync, and Git operations serve different user goals but are crammed into one scrollable panel with collapsible sections; decompose into three focused sub-panels (or sub-tabs within Ship > Publish) so users don't scroll past Git conflict resolution to find Figma sync (PublishPanel.tsx)
- [x] Variable push to Figma is fire-and-forget with no success or failure feedback — useVariableSync sends a postMessage to push variables but never reports whether the operation succeeded or how many were updated, unlike Style sync which returns detailed result metrics; users have no way to know if their push worked (useVariableSync.ts ~L60-70, PublishPanel.tsx)
- [x] SelectionInspector has no property-level filter — users inspecting complex layers with 20+ properties can't filter to "only unbound", "only colors", or search for a specific property name; they must scroll through everything to find what they need (SelectionInspector.tsx, PropertyRow.tsx)
- [x] Snapshot restore doesn't create an undo slot — restoring a git commit returns an operationId and creates a Cmd+Z undo slot, but snapshot restore calls the API directly without creating one, so "Revert to saved" cannot be undone; both should use the same pattern (HistoryPanel.tsx ~L832 vs ~L347-364)
- [x] PublishPanel "Publish all" flow silently skips merge conflicts — the sequential publish-all (Variables → Styles → Git commit) at lines 108-128 doesn't check for or handle merge conflicts before committing; if conflicts exist the git step fails with no clear error, breaking the one-click publish promise (PublishPanel.tsx ~L108-128)
- [x] ImportPanel Figma Variables mode silently overwrites without conflict UI — JSON/CSS/Tailwind imports show a full conflict resolution picker, but importing from Figma Variables uses strategy 'overwrite' directly with no preview or per-token accept/reject; this is inconsistent and risks silently clobbering hand-edited tokens (ImportPanel.tsx ~L592-637)
- [x] OverflowPanel type has 5 dead values — 'heatmap', 'analytics', 'themes', 'theme-compare', and 'export' exist in the OverflowPanel union type but no rendering branch handles them; they're leftover from before these features became sub-tabs; remove from the type and any code that references them (App.tsx L230)
- [ ] No shared loading spinner component — each component (TokenList, ConfirmModal, PublishPanel, HeatmapPanel) implements its own spinner with different markup, sizes, and animation styles; extract a shared Spinner component for visual consistency across the plugin (scattered across 6+ components)
- [x] ThemeManager coverage gap "Manual" items have no action — the coverage panel separates "Fillable" (auto-fill) from "Manual" fixes but Manual items just list missing tokens with no "Create missing token" button; users must leave ThemeManager, navigate to token creation, create the token, come back, and re-check coverage (ThemeManager.tsx ~L1580-1686)
- [x] Style sync value previews are text-only with no color swatches — Variable sync diff rows show inline color swatch previews (DiffSwatch component) but Style sync diff rows only show truncated text like "Inter 18" via summarizeStyleValue(); add swatches for color styles and richer typography previews for consistency between the two sync sections (PublishPanel.tsx, useStyleSync.ts ~L9-23)
- [x] TokenUsages component has no empty state — when a token has zero dependents and zero layer bindings, TokenUsages renders nothing instead of showing a helpful "No usages found" message; this leaves a blank section in TokenEditor that looks like a loading bug (TokenUsages.tsx ~L73-120)
