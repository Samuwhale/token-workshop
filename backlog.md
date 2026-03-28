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

- [x] Git commit allows submit with empty message — the commit form doesn't disable the button when the message field is blank
- [x] No publish dry-run — no way to preview what a Git push or Figma variable publish will change before executing

### UX

---

## Code Quality

### Redundancy & Duplication

### Performance

### Correctness & Safety

### Accessibility

### Maintainability

- [x] useGeneratorDialog.ts (463 lines, 20+ state vars, 21+ callbacks) and useGitSync.ts (317 lines, 17+ state vars) are oversized hooks mixing unrelated concerns — useGeneratorDialog handles config management, preview fetching with debounce/abort, existing token comparison, overwrite detection, semantic mapping, save logic, and undo; useGitSync handles status polling, conflict detection, merge resolution, diff computation, file selection, and token previews; each should be decomposed into 2-3 focused hooks to reduce re-render blast radius and make individual behaviors testable

- [x] `$extensions.tokenmanager` is typed as `Record<string, unknown>` forcing scattered `as any` casts — the `DTCGToken.$extensions` field in `packages/core/src/dtcg-types.ts` and all token interfaces in `types.ts` type extensions as `Record<string, unknown>`, so every access to `$extensions.tokenmanager.lifecycle`, `.source`, `.extends`, `.colorModifier`, `.tokenSet` etc. requires `(node.$extensions?.tokenmanager as any)?.*` casts; define a `TokenManagerExtensions` interface in core with all documented sub-fields, update `$extensions` to `{ tokenmanager?: TokenManagerExtensions } & Record<string, unknown>`, and add a typed `getTokenManagerExt(token)` helper — this eliminates the `as any` casts in `TokenTreeNode.tsx`, `ImportPanel.tsx`, `App.tsx`, and the resolver
- [x] App.tsx is a 2990-line monolith with 53 useState hooks — `packages/figma-plugin/src/ui/App.tsx` still contains five distinct state domains that should be custom hooks: (1) set-tab management (drag, context menu, overflow, new-set form: `dragSetName`, `dragOverSetName`, `tabMenuOpen`, `tabMenuPos`, `creatingSet`, `newSetName`, `newSetError`, `setTabsOverflow`); (2) modal/overlay visibility flags (8+ separate booleans: `showPasteModal`, `showScaffoldWizard`, `showGuidedSetup`, `showColorScaleGen`, `showCommandPalette`, `showKeyboardShortcuts`, `showQuickApply`, `showClearConfirm`); (3) token data loading (`allTokensFlat`, `pathToSet`, `perSetFlat`, `filteredSetCount`, `syncSnapshot`); (4) recent operations log (`recentOperations`); extracting these into domain hooks would mirror the TokenList refactor already done and make App.tsx reviewable

- [x] [HIGH] Snapshot save/restore bypasses tokenLock — `POST /api/snapshots` and `POST /api/snapshots/:id/restore` in `packages/server/src/routes/snapshots.ts` call `manualSnapshots.save()` and `restore()` on the TokenStore without acquiring the token write lock (`tokenLock`); a concurrent token write from any other route can interleave with a restore, leaving the store in a mixed state; `sync.ts:353` has the same gap for `POST /api/sync/log/:hash/restore`; both should wrap the tokenStore interaction in `withLock`

- [x] manual-snapshot.ts shadows its own import of stableStringify and snapshot diff ignores $type/$description changes — `packages/server/src/services/manual-snapshot.ts` imports `stableStringify` from `./stable-stringify.js` (L7) but immediately redefines a local function with the same name (L10-18) that shadows the import, making the import dead code; separately, the `diff()` method at L181-184 only compares `$value` fields using `stableStringify`, so changes to `$type` or `$description` are silently ignored in snapshot diffs — a token whose type changes from `color` to `string` with the same value will show as unchanged, but restore will overwrite its type
- [x] Set operations (create, rename, delete, reorder) have no operation log entries and cannot be undone — `packages/server/src/routes/sets.ts` never calls `operationLog.record()`, so Ctrl+Z cannot undo a set deletion, rename, or reorder; theme dimension and resolver operations (`themes.ts`, `resolvers.ts`) are also missing from the operation log; add before/after snapshots for these structural changes so they participate in the undo system
- [x] No lint rules configuration UI — lint rules are stored in `$lint.json` and exposed via `GET/PUT /api/lint/config`, but the Figma plugin has no UI to enable/disable rules, change severity, or configure options like `maxDepth` or `pathPattern`; users must manually edit the JSON file; add a lint configuration section (in Settings or AnalyticsPanel) with toggles and option inputs per rule
- [x] Merge Resolvers panel into Theme Manager as an "advanced mode" — Resolvers (`ResolverPanel.tsx`) and Themes (`ThemeManager.tsx`) solve the same problem (selecting which token sets are active for a given context) but live in separate tabs with different mental models; resolvers are a strict superset of themes and the product already has a `themes-to-resolver.ts` converter; unify under one panel with progressive disclosure: simple mode shows the current theme dimension UI, advanced mode exposes full resolver composition — eliminates a concept users must learn without losing capability
- [x] Variable and style sync show no value-level diff before applying — `useVariableSync` and `useStyleSync` categorize tokens as local-only/figma-only/conflict but the confirmation modal only shows counts, not actual value differences; Git sync already has a token-level diff preview ("Preview changes" button); add the same side-by-side value comparison for variable and style sync so users can see exactly what will change before clicking Apply
- [x] Deep inspect child bindings are read-only with no modification path — `DeepInspectSection.tsx` shows bindings on nested layers but provides no remove, remap, or create actions; users must manually select each nested layer in Figma to modify its bindings, defeating the purpose of deep inspection; add inline unbind/rebind actions on deep-inspect rows
- [x] No unified settings panel — UI preferences (density, color format, advanced mode, contrast background, hide deprecated) are scattered across individual components with no single place to review or change them; server connection URL is in a hamburger menu overflow panel; lint config has no UI at all; consolidate into a dedicated Settings tab or modal with sections for UI preferences, server connection, lint rules, and export defaults
- [x] Theme dimensions cannot be reordered — theme options within a dimension can be reordered via up/down buttons, but dimensions themselves have no reorder mechanism; dimension order determines layer priority (higher = overrides lower), so the inability to reorder forces users to delete and recreate dimensions to change priority; add drag-to-reorder or up/down buttons for dimensions in `ThemeManager.tsx`
- [x] "Copy color in format" missing from context menu — token row context menu offers "Copy value" (raw) but no format-specific options for color tokens; `colorUtils.ts` already supports hex/rgb/hsl/oklch/p3 formatting via `formatHexAs()`; add sub-menu items like "Copy as hex", "Copy as rgb()", "Copy as oklch()" when the token type is `color`
- [x] No "create token from clipboard" quick action — PasteTokensModal handles batch JSON paste but there's no single-token quick path: copy a color hex from a design tool, press a shortcut, and get a "name this token" dialog pre-filled with the clipboard value; add a "New from clipboard" command palette entry that reads clipboard, infers type (color for #hex, dimension for Npx, etc.), and opens the create form pre-filled
- [x] Selection inspector "Apply to peers" toast is ephemeral and easy to miss — after binding a token to a property, the inspector detects sibling layers and shows a 3-second toast with an "Apply" button; if the user is looking at the canvas or blinks, the opportunity is lost; either persist the suggestion until dismissed or add a dedicated "Apply to similar layers" button in the inspector toolbar that scans on demand

- [x] TokenGraph.tsx (512 lines) is dead code superseded by NodeGraphCanvas — it is imported and rendered in TokenList.tsx's `graph` viewMode but GraphPanel now provides the same generator visualization with a more capable node editor; remove TokenGraph.tsx and its `graph` viewMode branch to eliminate 500+ lines of unmaintained duplicate code
- [~] VersionHistoryPanel and SnapshotPanel duplicate helpers and serve overlapping goals — both provide "go back in time" functionality (git commits vs manual snapshots) with nearly identical diff UIs, `formatRelativeTime`/`formatRelative` helpers, status color/label functions, and color swatch components; merge into a single "History" panel with two source tabs (Git Commits, Snapshots) sharing one diff viewer and one set of helpers
- [x] Three separate `edgePath()` bezier-curve implementations across TokenFlowPanel.tsx, TokenGraph.tsx, and NodeGraphCanvas.tsx — extract into a shared `edgePath(x1, y1, x2, y2)` utility in a canvas utils module so all graph visualizations use one tested implementation
- [x] [HIGH] Renaming a token silently breaks all aliases referencing it — there is no "find references" or rename-refactoring; when a token path changes, alias tokens pointing to it via `{old.path}` become broken with no warning at rename time; add a "referenced by" check before rename that shows affected aliases and offers to update them automatically
- [~] No loading/progress indicator for token list operations — TokenList.tsx has no `isLoading` or spinner state; batch operations (move, scale, rename, delete) execute with no visual feedback until completion or error, leaving users uncertain whether the operation is in progress
- [~] Six view modes in TokenList (tree, table, canvas, grid, json, graph) create cognitive overload — `canvas` and `grid` are visual variations of the same "browse tokens spatially" concept, `graph` duplicates GraphPanel's generator view, and `json` is a power-user escape hatch; consolidate to three modes (tree, table, json) and remove canvas/grid/graph to reduce the view-mode toolbar clutter and maintenance surface
- [~] Multi-mode column editing has no undo — `MultiModeCell` in TokenTreeNode.tsx saves directly via `onSave` with no operation log entry or undo toast; editing a token value in the multi-mode column view silently mutates it with no way to revert, unlike the main token editor which records operations
- [~] No token move/copy between sets via context menu — the context menu on a token row offers duplicate, delete, rename, but no "Move to set…" or "Copy to set…" option; users must enter select mode, pick tokens, open batch editor, and choose "Move to set" — a 4-step flow for a single token
- [ ] Export ZIP has a hardcoded `tokens.zip` filename and flat structure — ExportPanel.tsx `buildZipBlob` always names the download `tokens.zip` with all files at root; add a configurable filename (defaulting to the set name or "tokens") and an option to nest files by platform folder (e.g., `css/variables.css`)
- [ ] Command palette token search caps at 100 results with no indication of total — CommandPalette.tsx limits token results to 100 but only shows "Showing first 100 tokens" as static text; for a power user with 500+ tokens this is frustrating; add a count like "100 of 487 shown — refine your search" and consider progressive loading
- [ ] Node graph port wiring has no type validation — useNodeGraph.ts `finishWiring()` connects any output port to any input port without checking type compatibility (e.g., color output to number input); add `isCompatiblePort(from, to)` validation with visual feedback on hover
- [ ] No keyboard shortcut for "New token" — common actions like create-token require clicking the `+` button; add `N` or `Ctrl+N` shortcut that opens the inline create form at the current scroll position, similar to how `E` triggers inline edit
- [ ] Token search qualifier syntax is undiscoverable — qualifiers like `type:color`, `has:alias`, `value:blue` are powerful but users must open the help modal to learn them; add inline placeholder text cycling through examples (e.g., "Search… try type:color") or a small qualifier chip bar below the search input
- [ ] Theme "Compare" view is misleading — it shows a single merged resolution result, not a side-by-side diff between theme options; users expecting to compare "light vs dark" see a flat table of resolved values with no way to see what differs between two options; add a true side-by-side comparison mode that highlights value differences across selected theme options
- [ ] Generator dialog disables preview entirely for multi-brand configurations — `useGeneratorPreview.ts` line 50 skips preview when `isMultiBrand` is true, so users creating multi-brand generators see zero output until after saving; this is a significant blind spot for the most complex generator type; generate preview for at least the first brand as a representative sample
- [ ] Generator overwrite confirmation uses blocking `window.confirm()` — `useGeneratorSave.ts` calls `window.confirm()` with a long unformatted list of file paths when manually-edited tokens are detected; replace with an in-app modal that shows paths in a scrollable monospace list with accept/cancel buttons
- [ ] AnalyticsPanel has no empty state when no tokens exist — when `totalTokens === 0`, the entire analytics view renders blank with no guidance; add an empty state message similar to GraphPanel's (icon + explanation + CTA to create or import tokens)
- [ ] Multi-select mode is undiscoverable — entering token multi-select requires pressing `m` with no visible button or tooltip indicating this capability; add a visible "Select" toggle button in the token list toolbar and show a selection count bar with batch action buttons when tokens are selected
- [ ] 14 of 24 DTCG token types fall back to raw text input — types like `fontWeight`, `strokeStyle`, `boolean`, `percentage`, `fontStyle`, `textDecoration`, and `textTransform` have no dedicated editors despite having well-defined value sets; add dropdown/toggle editors for enumerable types (fontWeight: 100-900, strokeStyle: solid/dashed/dotted, boolean: true/false, textTransform: uppercase/lowercase/capitalize/none) and constrained inputs for numeric types (percentage: slider 0-100)
- [ ] Import conflict resolution shows accept/reject toggles but no side-by-side value comparison — `ImportPanel.tsx` conflict view shows current and incoming values separately with accept/reject buttons, but doesn't render them as a clear before/after diff; adopt the same `SyncDiffSummary` pattern used in variable/style sync for visual consistency and clarity
- [ ] No "find usages" for tokens — there is no way to discover which other tokens alias a given token, which Figma variables bind to it, or which generators produce it; add a "References" section to the token editor panel showing incoming aliases, variable bindings, and generator sources so users understand the impact of changes before making them
- [ ] SSE connection has no event replay on reconnect — if the SSE connection drops and the client reconnects, missed events are lost; the client must do a full data refetch; add a simple event sequence counter so the client can request missed events on reconnect, or at minimum detect staleness and trigger an automatic refresh
- [ ] No batch undo — batch operations (bulk delete, bulk rename, scale values) via BatchEditor execute as individual API calls with no compound undo entry; undoing a batch of 50 token edits requires pressing Ctrl+Z 50 times; record batch operations as a single compound entry in the operation log
- [ ] Alias autocomplete shows no indication when results are truncated — `AliasAutocomplete.tsx` caps results at 24 (MAX_RESULTS) with no message like "24 of 312 tokens shown"; users with large token sets may think matching tokens don't exist when they're just filtered out; show a count and hint to refine the search
