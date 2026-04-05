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
- [x] [HIGH] Resolver mutation routes bypass the server-wide `withLock()` mutex and resolver-store.ts has no lock at all — all 4 resolver mutations in `packages/server/src/routes/resolvers.ts` (create L47, update L125, delete L149, from-themes L74) write to disk without serialization, while every other mutation route (tokens, sets, snapshots, generators, themes) goes through `tokenLock.withLock()`; concurrent resolver edits can produce lost writes to `*.resolver.json` files
- [x] Batch editor has no preview of which tokens will be affected before applying — BatchEditor.tsx applies transforms (numeric, color, find-replace) to the selection and only shows "N tokens skipped" after the fact; add a pre-apply preview showing each token's current value and proposed new value so users can verify before committing
- [x] Generator edit reopens full 3-step dialog for minor tweaks — clicking edit on a GeneratorPipelineCard opens the complete Where/What/Review stepper even when the user just wants to adjust a single config value (e.g. a color stop or ratio); add an "Edit config" shortcut that opens directly to Step 2 (What) with the existing config pre-loaded, skipping target selection
- [x] Command palette qualifier autocomplete is static — CommandPalette.tsx shows qualifier chip buttons (type:, has:, value:, etc.) but typing a qualifier like "type:" doesn't offer completions for available values (e.g. "color", "dimension"); add dynamic suggestions after the colon that enumerate actual values from the current token data
- [x] No batch delete endpoint on server — tokens.ts supports batch-move, batch-copy, batch-rename, batch-update but has no batch-delete route; clients must loop individual DELETE requests; add POST /api/tokens/:set/batch-delete accepting an array of paths
- [x] Import preview has no side-by-side diff for conflicts — ImportPanelContext handles conflicts with a per-token cycle-through (skip/overwrite/rename) but never shows the existing token value alongside the incoming value; add a two-column diff view so users can compare current vs imported values before choosing a resolution strategy
- [x] CSS and Tailwind imports silently skip dynamic values — ImportPanelContext processes CSS custom properties and Tailwind configs but expressions like calc(), var() compositions, and JS functions are silently dropped with no feedback; log skipped entries and show a "N values skipped (unsupported)" summary with the list of skipped property names
- [x] PanelHelpHint is missing from several complex panels — PublishPanel, ExportPanel, BatchEditor, and ConsistencyPanel have no contextual help hint; these panels have non-obvious workflows (readiness gates, export platform options, batch transform modes, snap-to-token) that would benefit from the same dismissible help banner pattern used in GraphPanel and ThemeManager
- [x] No "recent tokens" or "frequently edited" quick access — users managing hundreds of tokens must search or scroll to find tokens they edit repeatedly; add a "Recent" section at the top of the token list or a "Recent tokens" command palette category that tracks the last 10-15 edited tokens with one-click navigation
- [x] Resolver store load errors are not exposed to the UI — resolver-store.ts tracks loadErrors internally but no API endpoint exposes them; when a resolver JSON file has syntax errors or invalid structure, the UI shows no indication that a resolver failed to load; add errors to the GET /api/resolvers response and surface them as warnings in the ThemeManager resolver section
- [x] Search input behavior is fragmented across three systems — in-tree search (TokenList "/" key), command palette (Cmd+K with ">" prefix), and set switcher each have different fuzzy matching algorithms, different qualifier support, and different keyboard behaviors; consolidate the search UX so the command palette serves as the single advanced search surface and in-tree search delegates to it for structured queries
- [x] PublishPanel.tsx is a 2128-line monolith with 15+ useState hooks, 3 sync entity hooks, and inline async workflows — readiness checks (~80 lines at L259-338), orphan deletion state (L226-228), publish-all flow (L234-237), and confirmation modals are all tangled in one component; extract `useReadinessChecks`, `usePublishAll`, and `useOrphanCleanup` hooks following the `useSyncEntity` decomposition pattern
- [x] Context providers bundle 20–27 unrelated properties per context, causing cascade re-renders in all consumers — TokenDataContext (27 props, L114-139) mixes token set state with generator state; ThemeContext (23 props) mixes theme switching with resolver config; InspectContext (20 props) mixes heatmap, consistency, and usage scans; any single state change triggers re-render of every consumer regardless of which property it reads
- [x] useThemeDimensions is a 520-line hook returning 54 properties including 10+ raw setState dispatchers — mixes dimension CRUD (create/rename/delete/duplicate), coverage computation, and transient UI form state (newDimName, renameDim, renameValue, showCreateDim, createDimError) in a single hook; split into `useThemeDimensionsCrud` and keep coverage as a separate concern, encapsulate form state behind action callbacks instead of exposing raw setters
- [x] Docs routes have no try-catch — `GET /docs` (L206) and `GET /docs/:set` (L218) in `packages/server/src/routes/docs.ts` call `getSets()`, `getFlatTokensForSet()`, and `resolveTokens()` without error handling; if any throw, the request crashes with an unhandled exception; every other route file wraps token store calls in try-catch with `handleRouteError`

- [x] Unused token detection has no auto-fix action — HealthPanel.tsx shows unused tokens (zero canvas bindings) with individual delete buttons, but there's no "convert to alias" or "deprecate" action as a softer alternative to deletion; designers often want to mark tokens as deprecated before removing them, and the only options are delete-one or delete-all
- [x] No token dependency impact analysis before destructive operations — deleting or renaming a token shows orphan alias counts, but doesn't show downstream impact through generators, themes, or resolvers; a designer renaming a core color token has no way to see which generators consume it, which theme overrides reference it, or which resolved outputs will change
- [x] Export presets are buried in a collapsible section with no keyboard shortcut — ExportPanel.tsx has a working preset save/load system but it's hidden under a "Presets" collapsible below the main export config; for users who export multiple platforms regularly, presets should be the primary entry point with a command palette action ("Export with preset: iOS") and a keyboard shortcut
- [~] Publish readiness checks don't auto-rerun after fixing issues — PublishPanel.tsx detects when checks are "outdated" after token changes but only shows a manual "Re-check" button; after a user fixes a blocking issue (e.g. broken alias), they must remember to manually re-check before the publish button enables; auto-rerun checks after the fix action completes would eliminate this friction
- [ ] HealthPanel contrast matrix is limited to same-set tokens — the contrast matrix in HealthPanel.tsx only evaluates color pairs within allTokensFlat (single resolved view); designers managing multi-theme systems need to verify contrast across theme options (e.g. does this foreground/background pair pass WCAG in both light and dark themes simultaneously?)
- [ ] No cross-set token search on the server — the /api/tokens/search endpoint searches the resolved flat map but there's no way to search for a token across all sets to find where it's defined vs. overridden; designers working with theme override sets need to answer "which sets define color.primary?" without clicking through each set tab
- [ ] Find-and-replace has no dry-run mode for value replacements — useFindReplace.ts supports find/replace on names (with preview) and values, but value replacement has no preview of what will change before applying; name renames show a diff table but value changes are applied immediately
- [ ] ThemeManager coverage visualization shows only gap counts, not a visual matrix — useThemeCoverage.ts computes "totalFillableGaps" but the UI only shows a count badge and an auto-fill button; a matrix view showing dimensions x token groups with fill status would let maintainers see at a glance where their theme coverage is incomplete
- [ ] No way to duplicate a theme dimension with all its options — useThemeDimensions.ts supports create/rename/delete/reorder for dimensions but has no duplicate action; when adding a new dimension (e.g. "density") that has a similar structure to an existing one (e.g. "size"), users must recreate all options and set assignments from scratch
- [ ] Generator dry-run preview requires opening the full edit dialog — GeneratorPipelineCard.tsx shows a "Preview" button that fetches /api/generators/:id/preview, but the results appear in a tab panel inside the card; there's no way to preview generator output changes when editing config values without going through the 3-step dialog, applying, and checking the token list
- [ ] Consolidate Validation sub-tab into HealthPanel — the "Validation" sub-tab under Ship (ShipSubTab) renders validation issues that are already summarized in HealthPanel's validation section; having both creates confusion about which is the canonical validation view and fragments the user's mental model of "what's wrong with my tokens"
- [ ] No bulk token type change — BatchEditor.tsx supports numeric transforms, color transforms, and find-replace on values, but there's no way to change the $type of multiple tokens at once; migrating a set of "string" tokens to "fontFamily" or converting "number" tokens to "dimension" requires editing each token individually in the token editor

- [ ] Inconsistent inline editing patterns across panels — TokenTreeNode rename uses blur-to-save with no buttons and no inline validation errors, SetSwitcher create uses explicit Save/Cancel buttons with inline validation, ThemeManager rename uses Save/Cancel buttons with inline validation; the same conceptual action (rename an entity) has three different interaction paradigms depending on where you are, making behavior unpredictable (violates: consistency and standards)
- [ ] Context menus and dropdown menus lack arrow-key navigation — all 4 menus (TokenTreeNode group context menu, TokenList filter menu, App.tsx set menu, App.tsx main menu) have `role="menu"` and `role="menuitem"` but none support ArrowUp/ArrowDown to move between items; the group context menu is also only reachable via right-click with no keyboard-accessible trigger, making it unusable for keyboard-only users (violates: keyboard accessibility)
- [ ] SemanticMappingDialog and PasteTokensModal missing standard modal dismiss behaviors — SemanticMappingDialog (post-generator semantic token creation) has no Escape key handler, no backdrop click handler, no focus trap, and no `role="dialog"` ARIA attributes despite every other modal in the codebase using `useFocusTrap` + document keydown + `onMouseDown` backdrop dismiss; PasteTokensModal has focus trap and Escape but no backdrop click dismiss (violates: consistency, error prevention)
- [ ] HealthPanel fix actions silently swallow errors — `applyValidationFix`, `applyLintFix`, `applyIssueFix`, `handleDeleteUnusedToken`, and `handleDeleteAllUnused` all catch errors with `// silently ignore` or `console.warn` only; the user clicks "Fix" or "Delete", the spinner appears and disappears, but if the operation fails the item remains with no error message explaining why — the user cannot distinguish between "still processing" and "failed" (violates: visibility of system status, error recovery)
- [ ] Resolver and set deletion have no undo support unlike other destructive actions — token deletion, dimension deletion, and option deletion all capture before-snapshots and push undo slots, but set deletion (useSetDelete.ts) and resolver deletion (ResolverPanel.tsx) perform permanent DELETE requests with no undo; this creates inconsistent safety behavior where some deletes are recoverable and others are not, with no visual distinction (violates: consistency, error recovery)
- [ ] Token rename in TokenTreeNode shows no inline validation feedback — when renaming a token or group via the inline input, there is no error display if the name is invalid or conflicts; `confirmTokenRename` and `confirmGroupRename` silently abort on empty names or conflicts with no user-visible message, unlike ThemeManager and SetSwitcher which show red error text below the input (violates: visibility of system status, help users recognize errors)
