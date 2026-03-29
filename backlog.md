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

### Performance

### Correctness & Safety

### Accessibility

### Maintainability

- [!] ExportPanel live preview re-runs all format generators on every settings change without debounce — changing a single toggle (e.g., "include descriptions") synchronously rebuilds the full ZIP and all preview strings; for large token sets this causes visible jank; debounce the preview rebuild by 250ms, matching the pattern already used in search inputs across the app (ExportPanel.tsx ~L500-1000)
- [!] ResolverPanel is undiscoverable — it only appears inside ThemeManager behind an "Advanced" toggle; users who create themes and later want to configure DTCG resolvers have no indication this panel exists from any navigation path; either surface Resolvers as a dedicated sub-tab under Define (alongside Themes, Generators) or add a visible "Resolvers" link in the ThemeManager header that doesn't require toggling Advanced mode first (ResolverPanel.tsx, App.tsx tab structure)

- [!] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click, matching standard tree-view selection behavior (TokenTreeNode.tsx group context menu ~L626-793)

- [x] Generators can't be duplicated — creating a second color ramp that's similar to an existing one requires configuring from scratch or starting from a generic template; add a "Duplicate" action on generator cards in GraphPanel so users can clone an existing generator's config as a starting point (GraphPanel.tsx)
- [x] Generator templates use jargon-heavy descriptions with no guidance — titles like "11-step perceptual color ramp with semantic action map" assume prior knowledge; add a subtitle or tooltip to each template card explaining when to use it (e.g., "Use this for brand primary/secondary colors with semantic aliases like action.hover") (GraphPanel.tsx GRAPH_TEMPLATES)
- [x] Import failed tokens have no recovery action — when some tokens fail to import, failedImportPaths is tracked but the UI only shows a count with no "Retry failed" or "Copy failed paths" button; users must manually identify and re-import the failures with no tooling support (ImportPanel.tsx ~L870-874)
- [x] Command palette token browse is capped at 100 with no way to see more — when searching tokens and 100+ results exist, the UI shows "100 of 542 shown — refine your search" but provides no "Load more" or pagination; users with large token systems must keep narrowing their query even when they need to browse (CommandPalette.tsx ~L530-534)
- [x] Command palette qualifier hint chips disappear after any input is entered — chips showing available qualifiers (type:, set:, alias:) vanish once the user starts typing, making it impossible to discover additional qualifiers mid-query; render the chips persistently as a scrollable reference row below the input (CommandPalette.tsx ~L395)
- [x] [HIGH] AnalyticsPanel color analytics silently broken for all nested DTCG tokens — `load()` iterates `Object.entries(data.tokens)` one level deep, treating the nested DTCG tree as a flat map; only root-level entries are analyzed so `allColors`, `allFlatBySet`, `unifiedFlat`, and `allColorTokens` are empty for any real token file organized into groups (the common case), making the color palette, contrast matrix, and all color analytics show nothing; additionally `load().catch` only calls `setLoading(false)` without setting error state, so any token set fetch failure renders an empty panel with no explanation; fix: call `flattenTokenGroup` from `@tokenmanager/core` before building `allFlatBySet`, and add an error state in the catch (packages/figma-plugin/src/ui/components/AnalyticsPanel.tsx ~L211-265)
- [x] [HIGH] generator-service.ts saveGenerators() writes non-atomically, risking config corruption on crash — `saveGenerators()` calls `fs.writeFile` directly on `$generators.json`, unlike `token-store.ts` and `resolver-store.ts` which both use the `.tmp`+`rename` atomic pattern; a server crash mid-write leaves truncated JSON that blocks all future server starts until the file is manually deleted or repaired, silently destroying all generator configurations (packages/server/src/services/generator-service.ts:117)
- [x] Generator templates that require a source token give no upfront signal — templates like "colorRamp" need the user to have a base color token, but this constraint is only surfaced after the user tries to proceed; show a "Requires a color token" badge on template cards at selection time so users know what they need before clicking (GraphPanel.tsx requiresSource property)

- [x] PUT /api/themes/dimensions-order bypasses withThemeLock() and records no rollbackSteps — every other theme mutation route uses the withThemeLock helper which automatically adds `rollbackSteps: [{ action: 'write-themes', dimensions: capturedBefore }]`, but the reorder endpoint calls store.withLock() directly and passes no rollbackSteps; undoing a dimension reorder via the operations panel is a no-op (packages/server/src/routes/themes.ts:197-233)
- [x] useFigmaSync handleSyncGroup and handleSyncGroupStyles fail silently — when fetchAllTokensFlat throws, the catch block restores syncGroupPending to its previous value but shows no error message; the UI displays a perpetually pending sync indicator with no feedback about why the sync failed (packages/figma-plugin/src/ui/hooks/useFigmaSync.ts:38-85)
- [x] ExtractTokensPanel has no timeout for plugin response — on mount it sends 'extract-tokens-from-selection' and sets loading=true, but if the plugin never responds (wrong selection, plugin crash, no context) the panel stays in a loading spinner indefinitely with no recovery path; add a timeout like HeatmapPanel's SCAN_TIMEOUT_MS (packages/figma-plugin/src/ui/components/ExtractTokensPanel.tsx:56-86)
- [x] ContrastCheckGenerator is the only generator without per-step override support — every other generator preview (SpacingPreview, TypeScalePreview, OpacityPreview, BorderRadiusPreview) accepts overrides/onOverrideChange/onOverrideClear props and lets users pin individual step values; ContrastCheckPreview has no such parameters and is read-only; add override support to match the pattern (packages/figma-plugin/src/ui/components/generators/ContrastCheckGenerator.tsx:26)
- [x] Generator config validation skips formula syntax and step name uniqueness — customScale accepts any formula string with no parse-time check, so syntax errors only surface during execution; all multi-step generators (typeScale, spacingScale, opacityScale, borderRadiusScale, zIndexScale, customScale) allow duplicate step names, making override application ambiguous when two steps share a name (packages/server/src/routes/generators.ts:86-197)
- [x] Override-cleaning logic duplicated between executeSingleBrand and executeGeneratorMultiBrand — the ~10-line block that removes non-locked overrides and updates the generator is copied almost verbatim at lines 519-531 and 608-620 of generator-service.ts; extract to a private helper to fix both at once (packages/server/src/services/generator-service.ts:519-531, 608-620)
- [x] Three GET routes in tokens.ts have no try/catch — `GET /tokens/search` (line 29), `GET /tokens/:set` (line 48), and `GET /tokens/:set/raw` (line 602) have no error handling; if `tokenStore.getSet()` or `tokenStore.searchTokens()` throws, Fastify's generic handler returns a plain 500 with no structured error body, inconsistent with every other route in the file which uses `handleRouteError`; this is the same pattern fixed for `PUT /api/sets/reorder` in sets.ts (packages/server/src/routes/tokens.ts:29,48,602)
- [x] ThemeManager handleAutoFillSingle builds token URL path without encodeURIComponent — `const tokenPath = item.missingRef.split('.').join('/')` creates the URL path segment without encoding, so tokens with special characters in segment names (spaces, `#`, `%`, etc.) produce malformed fetch URLs and silently fail; every other URL path builder in the codebase uses `.split('.').map(encodeURIComponent).join('/')` (packages/figma-plugin/src/ui/components/ThemeManager.tsx ~L653)

- [x] [HIGH] Generator CRUD operations silently discard structural state on rollback — `generator-create`, `generator-delete`, and `generator-update` routes record before/after token snapshots but add no `rollbackSteps`; the `RollbackStep` union type has no generator actions and `RollbackContext.generatorService` only exposes `updateSetName()`; rolling back a `generator-delete` restores the generated tokens but permanently destroys the generator config (users lose the source settings and can never re-run it), while rolling back a `generator-create` leaves an orphaned generator record whose target tokens have been removed; fix: add `delete-generator` and `create-generator` to `RollbackStep`, expose `delete`/`create` on `RollbackContext.generatorService`, and add the inverse rollbackStep to each of the three routes (packages/server/src/routes/generators.ts ~L348, ~L473, ~L520; packages/server/src/services/operation-log.ts)

- [~] GraphPanel GeneratorPipelineCard uses raw `fetch()` for all three generator actions — `handleRerun`, `handleDuplicate`, and `handleDelete` call raw `fetch()` instead of `apiFetch()`; raw fetch does not throw on 4xx/5xx responses so server errors (rate limits, 404, 500) are silently swallowed and only console.error'd; users get no feedback when generator operations fail (e.g. re-run fails because the generator was externally deleted, or duplicate fails because the target group already exists); replace all three with `apiFetch` and surface errors via an error state shown in the card (packages/figma-plugin/src/ui/components/GraphPanel.tsx ~L776, ~L798, ~L814)
