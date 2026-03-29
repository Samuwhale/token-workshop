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

- [~] No generator configuration comparison — can't preview two ratios or two configurations side by side before committing; useful for A/B-ing e.g. Minor Third vs Major Third type scales
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
- [~] resolvers.ts uses `reply.code()` (13 occurrences) while every other route file uses `reply.status()` — functionally identical Fastify aliases but inconsistent across the codebase (packages/server/src/routes/resolvers.ts)
- [~] `components/editorStyles.ts` is dead code — `inputClass` and `labelClass` were migrated to `shared/editorClasses.ts`; the old file at `packages/figma-plugin/src/ui/components/editorStyles.ts` has no importers and can be deleted
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
- [!] ResolverPanel is undiscoverable — it only appears inside ThemeManager behind an "Advanced" toggle; users who create themes and later want to configure DTCG resolvers have no indication this panel exists from any navigation path; either surface Resolvers as a dedicated sub-tab under Define (alongside Themes, Generators) or add a visible "Resolvers" link in the ThemeManager header that doesn't require toggling Advanced mode first (ResolverPanel.tsx, App.tsx tab structure)

- [!] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click, matching standard tree-view selection behavior (TokenTreeNode.tsx group context menu ~L626-793)

- [ ] PublishPanel is a 2316-line monolith mixing three unrelated workflows — Variable sync, Style sync, and Git operations serve different user goals but are crammed into one scrollable panel with collapsible sections; decompose into three focused sub-panels (or sub-tabs within Ship > Publish) so users don't scroll past Git conflict resolution to find Figma sync (PublishPanel.tsx)
- [ ] No shared loading spinner component — each component (TokenList, ConfirmModal, PublishPanel, HeatmapPanel) implements its own spinner with different markup, sizes, and animation styles; extract a shared Spinner component for visual consistency across the plugin (scattered across 6+ components)
