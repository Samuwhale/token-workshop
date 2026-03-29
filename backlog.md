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

- [x] No generator configuration comparison — can't preview two ratios or two configurations side by side before committing; useful for A/B-ing e.g. Minor Third vs Major Third type scales
- [x] No skeleton/loading state during 300ms preview debounce — currently shows stale data while new preview loads; add a subtle loading indicator so the designer knows a refresh is pending (useGeneratorPreview.ts)

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

- [x] getErrorMessage() duplicated in server/src/utils.ts and server/src/errors.ts — utils.ts is never imported anywhere; the entire file is dead code (packages/server/src/utils.ts, packages/server/src/errors.ts:56-58)
- [x] resolvers.ts uses `reply.code()` (13 occurrences) while every other route file uses `reply.status()` — functionally identical Fastify aliases but inconsistent across the codebase (packages/server/src/routes/resolvers.ts)
- [x] `components/editorStyles.ts` is dead code — `inputClass` and `labelClass` were migrated to `shared/editorClasses.ts`; the old file at `packages/figma-plugin/src/ui/components/editorStyles.ts` has no importers and can be deleted
- [x] `overwritePaths` useMemo is shadowed and unused in the confirmation branch of TokenGeneratorDialog — the memo at line 216 produces a Set used in the main render (lines 617-630), but the `showConfirmation` branch at line 241 creates an identical `new Set(overwrittenEntries.map(...))` that shadows it; the memo is dead in that branch (packages/figma-plugin/src/ui/components/TokenGeneratorDialog.tsx:216,241)
- [x] Generator config types have inconsistent unit unions — TypeScaleConfig, SpacingScaleConfig, BorderRadiusScaleConfig allow `'px' | 'rem'`; CustomScaleConfig allows `'px' | 'rem' | 'em' | '%'`; none use the shared `DimensionUnit` type from core/constants (packages/core/src/generator-types.ts)
- [x] Orphaned validate.sh duplicate — identical copy of scripts/backlog/validate.sh exists at packages/server/scripts/backlog/validate.sh (packages/server/scripts/backlog/validate.sh)
- [x] [HIGH] Figma Variables export can get permanently stuck in loading state — handleExportFigmaVariables sends a postMessage and sets figmaLoading=true, but if the plugin never responds (e.g., no active Figma document, wrong context) the spinner never clears and the panel is unusable until the plugin is reloaded; add a timeout (10s) that resets state and shows an error toast (ExportPanel.tsx ~L260-265)
- [x] package-lock.json coexists with pnpm-lock.yaml — project declares `"packageManager": "pnpm@9.15.0"` but an npm lock file exists and is newer; should be deleted to prevent dependency drift (root package-lock.json)

### Performance

### Correctness & Safety

- [x] DimensionValue type uses hardcoded 4-unit union instead of the DimensionUnit type that defines 20 units — runtime constants support `vw`, `vh`, `ch`, `cap`, `dvw`, etc. but the type rejects them; DimensionValue should use `DimensionUnit` from constants.ts (packages/core/src/types.ts:20, packages/core/src/constants.ts:56-58)
- [x] Three plugin message types handled in controller.ts are missing from the PluginMessage union — `SearchLayersMessage` is defined at types.ts:343 but not in the union; `ScanTokenVariableBindingsMessage` and `RemoveBindingFromNodeMessage` have no interface at all; all three are dispatched from UI and handled in the switch but bypass compile-time type checking (packages/figma-plugin/src/shared/types.ts:409-441, src/plugin/controller.ts:298,319,332)
- [x] ScanCanvasHeatmapMessage type definition missing optional `scope` property — handler reads `msg.scope ?? 'page'` but the interface has no scope field, so the property access is untyped (packages/figma-plugin/src/shared/types.ts, src/plugin/controller.ts:272)
- [x] PUT /api/sets/reorder has no try/catch — every other set mutation endpoint wraps logic in error handling; this one lets unhandled exceptions propagate as 500s with no structured error response (packages/server/src/routes/sets.ts:145-165)
- [x] useGeneratorSave overwrite-check failure silently proceeds to commit — when POST /api/generators/:id/check-overwrites errors, line 168 logs a warning and calls commitSave() without notifying the user; if the server is unavailable during the pre-save check, tokens that were manually edited after generation will be silently overwritten with no warning (packages/figma-plugin/src/ui/hooks/useGeneratorSave.ts:167-169)
- [x] ImportPanel conflict-detection failure is invisible — when fetchExistingTokenMap errors, line 224 calls setExistingTokenMap(null) with no user-visible message; the import panel shows missing conflict counts but gives no indication that the server fetch failed and conflict detection is down (packages/figma-plugin/src/ui/components/ImportPanel.tsx:224)
- [x] Generator PATCH route casts body.inputTable to InputTable after shallow validation — only checks for `inputKey` string and `rows` array existence, doesn't validate row structure; malformed rows pass type assertion (packages/server/src/routes/generators.ts:405-408)
- [x] dtcg-resolver loadSource silently returns empty Map for invalid internal pointers — no warning logged when a source reference doesn't resolve to a set, making misconfigured resolvers hard to debug (packages/core/src/dtcg-resolver.ts:248-249)

### Accessibility

### Maintainability

- [!] ExportPanel live preview re-runs all format generators on every settings change without debounce — changing a single toggle (e.g., "include descriptions") synchronously rebuilds the full ZIP and all preview strings; for large token sets this causes visible jank; debounce the preview rebuild by 250ms, matching the pattern already used in search inputs across the app (ExportPanel.tsx ~L500-1000)
- [!] ResolverPanel is undiscoverable — it only appears inside ThemeManager behind an "Advanced" toggle; users who create themes and later want to configure DTCG resolvers have no indication this panel exists from any navigation path; either surface Resolvers as a dedicated sub-tab under Define (alongside Themes, Generators) or add a visible "Resolvers" link in the ThemeManager header that doesn't require toggling Advanced mode first (ResolverPanel.tsx, App.tsx tab structure)

- [!] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click, matching standard tree-view selection behavior (TokenTreeNode.tsx group context menu ~L626-793)

- [x] PublishPanel is a 2316-line monolith mixing three unrelated workflows — Variable sync, Style sync, and Git operations serve different user goals but are crammed into one scrollable panel with collapsible sections; decompose into three focused sub-panels (or sub-tabs within Ship > Publish) so users don't scroll past Git conflict resolution to find Figma sync (PublishPanel.tsx)
- [~] No shared loading spinner component — each component (TokenList, ConfirmModal, PublishPanel, HeatmapPanel) implements its own spinner with different markup, sizes, and animation styles; extract a shared Spinner component for visual consistency across the plugin (scattered across 6+ components)
- [x] Multi-selected tokens can't be batch-moved to a different group — selecting 5 tokens and relocating them all requires 5 individual move operations; add a "Move to group…" action in the multi-select toolbar that accepts a target path and moves all selected tokens in a single server call (TokenList.tsx multi-select toolbar, PUT /api/tokens/:path)
- [x] Token sets have no description or annotation field — designers managing 10+ sets (light, dark, brand, platform overrides) have no way to record why a set exists or what it covers; add an optional description shown as a tooltip in the set picker and editable from the sets management view (sets.ts, SetsPicker component)
- [~] Theme options have no side-by-side resolved value comparison — verifying a light/dark theme requires switching active option, memorizing values, switching again, and comparing mentally; add a "Compare two options" view in ThemeManager that resolves both options and shows token path / option-A value / option-B value in a diff table (ThemeManager.tsx)
- [~] Color ramp generator has no per-step WCAG contrast preview — after generating a ramp, users can't see which step pairs pass AA (4.5:1) or AAA (7:1) against white/black without leaving the generator and using the contrast matrix; show a compact contrast grid or pass/fail badges on each step within the generator's preview area (ColorRampGenerator.tsx)
- [ ] Bezier curve generator has no standard easing preset library — configuring a cubic-bezier requires dragging raw control points with no shortcuts for common curves; add a row of preset buttons ("linear", "ease-in", "ease-out", "ease-in-out", "spring") that snap control points to well-known values, matching how browser DevTools presents bezier editors (BezierCurveEditor.tsx, BezierCurveGenerator.tsx)
- [ ] Generators can't be duplicated — creating a second color ramp that's similar to an existing one requires configuring from scratch or starting from a generic template; add a "Duplicate" action on generator cards in GraphPanel so users can clone an existing generator's config as a starting point (GraphPanel.tsx)
- [ ] Generator templates use jargon-heavy descriptions with no guidance — titles like "11-step perceptual color ramp with semantic action map" assume prior knowledge; add a subtitle or tooltip to each template card explaining when to use it (e.g., "Use this for brand primary/secondary colors with semantic aliases like action.hover") (GraphPanel.tsx GRAPH_TEMPLATES)
- [ ] Import failed tokens have no recovery action — when some tokens fail to import, failedImportPaths is tracked but the UI only shows a count with no "Retry failed" or "Copy failed paths" button; users must manually identify and re-import the failures with no tooling support (ImportPanel.tsx ~L870-874)
- [ ] Command palette token browse is capped at 100 with no way to see more — when searching tokens and 100+ results exist, the UI shows "100 of 542 shown — refine your search" but provides no "Load more" or pagination; users with large token systems must keep narrowing their query even when they need to browse (CommandPalette.tsx ~L530-534)
- [ ] Command palette qualifier hint chips disappear after any input is entered — chips showing available qualifiers (type:, set:, alias:) vanish once the user starts typing, making it impossible to discover additional qualifiers mid-query; render the chips persistently as a scrollable reference row below the input (CommandPalette.tsx ~L395)
- [ ] Generator templates that require a source token give no upfront signal — templates like "colorRamp" need the user to have a base color token, but this constraint is only surfaced after the user tries to proceed; show a "Requires a color token" badge on template cards at selection time so users know what they need before clicking (GraphPanel.tsx requiresSource property)

- [ ] PUT /api/themes/dimensions-order bypasses withThemeLock() and records no rollbackSteps — every other theme mutation route uses the withThemeLock helper which automatically adds `rollbackSteps: [{ action: 'write-themes', dimensions: capturedBefore }]`, but the reorder endpoint calls store.withLock() directly and passes no rollbackSteps; undoing a dimension reorder via the operations panel is a no-op (packages/server/src/routes/themes.ts:197-233)
- [ ] useFigmaSync handleSyncGroup and handleSyncGroupStyles fail silently — when fetchAllTokensFlat throws, the catch block restores syncGroupPending to its previous value but shows no error message; the UI displays a perpetually pending sync indicator with no feedback about why the sync failed (packages/figma-plugin/src/ui/hooks/useFigmaSync.ts:38-85)
- [ ] ExtractTokensPanel has no timeout for plugin response — on mount it sends 'extract-tokens-from-selection' and sets loading=true, but if the plugin never responds (wrong selection, plugin crash, no context) the panel stays in a loading spinner indefinitely with no recovery path; add a timeout like HeatmapPanel's SCAN_TIMEOUT_MS (packages/figma-plugin/src/ui/components/ExtractTokensPanel.tsx:56-86)
- [ ] ContrastCheckGenerator is the only generator without per-step override support — every other generator preview (SpacingPreview, TypeScalePreview, OpacityPreview, BorderRadiusPreview) accepts overrides/onOverrideChange/onOverrideClear props and lets users pin individual step values; ContrastCheckPreview has no such parameters and is read-only; add override support to match the pattern (packages/figma-plugin/src/ui/components/generators/ContrastCheckGenerator.tsx:26)
- [ ] Generator config validation skips formula syntax and step name uniqueness — customScale accepts any formula string with no parse-time check, so syntax errors only surface during execution; all multi-step generators (typeScale, spacingScale, opacityScale, borderRadiusScale, zIndexScale, customScale) allow duplicate step names, making override application ambiguous when two steps share a name (packages/server/src/routes/generators.ts:86-197)
- [ ] Override-cleaning logic duplicated between executeSingleBrand and executeGeneratorMultiBrand — the ~10-line block that removes non-locked overrides and updates the generator is copied almost verbatim at lines 519-531 and 608-620 of generator-service.ts; extract to a private helper to fix both at once (packages/server/src/services/generator-service.ts:519-531, 608-620)
