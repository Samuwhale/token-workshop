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

- [~] Git commit allows submit with empty message — the commit form doesn't disable the button when the message field is blank
- [~] No publish dry-run — no way to preview what a Git push or Figma variable publish will change before executing

### UX

---

## Code Quality

### Redundancy & Duplication

### Performance

### Correctness & Safety

### Accessibility

### Maintainability

- [~] useGeneratorDialog.ts (463 lines, 20+ state vars, 21+ callbacks) and useGitSync.ts (317 lines, 17+ state vars) are oversized hooks mixing unrelated concerns — useGeneratorDialog handles config management, preview fetching with debounce/abort, existing token comparison, overwrite detection, semantic mapping, save logic, and undo; useGitSync handles status polling, conflict detection, merge resolution, diff computation, file selection, and token previews; each should be decomposed into 2-3 focused hooks to reduce re-render blast radius and make individual behaviors testable

- [ ] `$extensions.tokenmanager` is typed as `Record<string, unknown>` forcing scattered `as any` casts — the `DTCGToken.$extensions` field in `packages/core/src/dtcg-types.ts` and all token interfaces in `types.ts` type extensions as `Record<string, unknown>`, so every access to `$extensions.tokenmanager.lifecycle`, `.source`, `.extends`, `.colorModifier`, `.tokenSet` etc. requires `(node.$extensions?.tokenmanager as any)?.*` casts; define a `TokenManagerExtensions` interface in core with all documented sub-fields, update `$extensions` to `{ tokenmanager?: TokenManagerExtensions } & Record<string, unknown>`, and add a typed `getTokenManagerExt(token)` helper — this eliminates the `as any` casts in `TokenTreeNode.tsx`, `ImportPanel.tsx`, `App.tsx`, and the resolver
- [~] App.tsx is a 2990-line monolith with 53 useState hooks — `packages/figma-plugin/src/ui/App.tsx` still contains five distinct state domains that should be custom hooks: (1) set-tab management (drag, context menu, overflow, new-set form: `dragSetName`, `dragOverSetName`, `tabMenuOpen`, `tabMenuPos`, `creatingSet`, `newSetName`, `newSetError`, `setTabsOverflow`); (2) modal/overlay visibility flags (8+ separate booleans: `showPasteModal`, `showScaffoldWizard`, `showGuidedSetup`, `showColorScaleGen`, `showCommandPalette`, `showKeyboardShortcuts`, `showQuickApply`, `showClearConfirm`); (3) token data loading (`allTokensFlat`, `pathToSet`, `perSetFlat`, `filteredSetCount`, `syncSnapshot`); (4) recent operations log (`recentOperations`); extracting these into domain hooks would mirror the TokenList refactor already done and make App.tsx reviewable

- [x] [HIGH] Snapshot save/restore bypasses tokenLock — `POST /api/snapshots` and `POST /api/snapshots/:id/restore` in `packages/server/src/routes/snapshots.ts` call `manualSnapshots.save()` and `restore()` on the TokenStore without acquiring the token write lock (`tokenLock`); a concurrent token write from any other route can interleave with a restore, leaving the store in a mixed state; `sync.ts:353` has the same gap for `POST /api/sync/log/:hash/restore`; both should wrap the tokenStore interaction in `withLock`

- [x] manual-snapshot.ts shadows its own import of stableStringify and snapshot diff ignores $type/$description changes — `packages/server/src/services/manual-snapshot.ts` imports `stableStringify` from `./stable-stringify.js` (L7) but immediately redefines a local function with the same name (L10-18) that shadows the import, making the import dead code; separately, the `diff()` method at L181-184 only compares `$value` fields using `stableStringify`, so changes to `$type` or `$description` are silently ignored in snapshot diffs — a token whose type changes from `color` to `string` with the same value will show as unchanged, but restore will overwrite its type
- [ ] Set operations (create, rename, delete, reorder) have no operation log entries and cannot be undone — `packages/server/src/routes/sets.ts` never calls `operationLog.record()`, so Ctrl+Z cannot undo a set deletion, rename, or reorder; theme dimension and resolver operations (`themes.ts`, `resolvers.ts`) are also missing from the operation log; add before/after snapshots for these structural changes so they participate in the undo system
- [ ] No lint rules configuration UI — lint rules are stored in `$lint.json` and exposed via `GET/PUT /api/lint/config`, but the Figma plugin has no UI to enable/disable rules, change severity, or configure options like `maxDepth` or `pathPattern`; users must manually edit the JSON file; add a lint configuration section (in Settings or AnalyticsPanel) with toggles and option inputs per rule
- [ ] Merge Resolvers panel into Theme Manager as an "advanced mode" — Resolvers (`ResolverPanel.tsx`) and Themes (`ThemeManager.tsx`) solve the same problem (selecting which token sets are active for a given context) but live in separate tabs with different mental models; resolvers are a strict superset of themes and the product already has a `themes-to-resolver.ts` converter; unify under one panel with progressive disclosure: simple mode shows the current theme dimension UI, advanced mode exposes full resolver composition — eliminates a concept users must learn without losing capability
- [ ] Variable and style sync show no value-level diff before applying — `useVariableSync` and `useStyleSync` categorize tokens as local-only/figma-only/conflict but the confirmation modal only shows counts, not actual value differences; Git sync already has a token-level diff preview ("Preview changes" button); add the same side-by-side value comparison for variable and style sync so users can see exactly what will change before clicking Apply
- [ ] Deep inspect child bindings are read-only with no modification path — `DeepInspectSection.tsx` shows bindings on nested layers but provides no remove, remap, or create actions; users must manually select each nested layer in Figma to modify its bindings, defeating the purpose of deep inspection; add inline unbind/rebind actions on deep-inspect rows
- [ ] No unified settings panel — UI preferences (density, color format, advanced mode, contrast background, hide deprecated) are scattered across individual components with no single place to review or change them; server connection URL is in a hamburger menu overflow panel; lint config has no UI at all; consolidate into a dedicated Settings tab or modal with sections for UI preferences, server connection, lint rules, and export defaults
- [ ] Theme dimensions cannot be reordered — theme options within a dimension can be reordered via up/down buttons, but dimensions themselves have no reorder mechanism; dimension order determines layer priority (higher = overrides lower), so the inability to reorder forces users to delete and recreate dimensions to change priority; add drag-to-reorder or up/down buttons for dimensions in `ThemeManager.tsx`
- [ ] "Copy color in format" missing from context menu — token row context menu offers "Copy value" (raw) but no format-specific options for color tokens; `colorUtils.ts` already supports hex/rgb/hsl/oklch/p3 formatting via `formatHexAs()`; add sub-menu items like "Copy as hex", "Copy as rgb()", "Copy as oklch()" when the token type is `color`
- [ ] No "create token from clipboard" quick action — PasteTokensModal handles batch JSON paste but there's no single-token quick path: copy a color hex from a design tool, press a shortcut, and get a "name this token" dialog pre-filled with the clipboard value; add a "New from clipboard" command palette entry that reads clipboard, infers type (color for #hex, dimension for Npx, etc.), and opens the create form pre-filled
- [ ] Selection inspector "Apply to peers" toast is ephemeral and easy to miss — after binding a token to a property, the inspector detects sibling layers and shows a 3-second toast with an "Apply" button; if the user is looking at the canvas or blinks, the opportunity is lost; either persist the suggestion until dismissed or add a dedicated "Apply to similar layers" button in the inspector toolbar that scans on demand
