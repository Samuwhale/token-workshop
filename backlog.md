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
- [x] [HIGH] Operation-log rollback writes $themes.json directly (writeThemesFile at operation-log.ts:294) bypassing the withThemeLock used by all theme routes (themes.ts:113) — concurrent rollback + theme edit can corrupt the themes file; readThemesFile (L232) also reads without the lock, so computeInverseSteps captures a stale snapshot if a theme mutation is in-flight
- [x] Smart type inference when creating tokens — entering a path like `color.brand.primary` should default the type dropdown to `color`, `spacing.md` to `dimension`, `font.body` to `fontFamily`; currently the type dropdown always starts at the first option regardless of path, adding an unnecessary manual step to every token creation
- [x] Batch token upsert API endpoint — there is `POST /api/tokens/:set/batch-delete` but no batch create or update; every token creation or value edit is a separate HTTP request, which causes visible latency when importing or generating dozens of tokens and makes it impossible to do atomic multi-token updates
- [x] [HIGH] Revert sync has no confirmation dialog — SyncSubPanel.tsx line 180 fires `onRevert` directly when user clicks "Revert last sync", instantly restoring all Figma variables or styles to pre-sync state with no safety prompt; a single misclick can undo a carefully reviewed publish
- [x] Token set diff/comparison view — there is no way to compare two token sets side-by-side to see which tokens exist in one but not the other, or which have different values; the existing CompareView only compares theme options, not arbitrary sets; a set diff would help users audit overrides and catch unintended divergence between foundation and semantic sets
- [x] No variable scope editing in the publish flow — the plugin sandbox supports writing `$extensions['com.figma.scopes']` to Figma variables (variableSync.ts), and tokens can store scope metadata, but the PublishPanel UI never surfaces scope configuration; users who need variables scoped to specific properties (e.g., color variable only available for fills) must edit scopes manually in Figma after every sync
- [x] Generator dependency graph visualization — GraphPanel shows individual generator pipeline cards but has no view of how generators relate to each other (e.g., a color ramp generator feeds a semantic alias generator which feeds a dark mode inversion generator); adding a dependency flow diagram would help users understand cascading effects before running generators
- [x] No token search within alias fields in the editor — when editing a composite token (typography, shadow) and needing to reference another token as an alias for a sub-property, users must close the editor, search the tree, note the path, reopen the editor, and type it; an inline token search/picker within alias fields would eliminate this context switch
- [x] Consolidate the three analysis panel scan scope selectors into a shared component — Health, Consistency, and Heatmap panels each independently implement selection/page/all-pages scope UI with separate state management; extract a shared `ScanScope` component and hook to reduce duplication and ensure consistent scope behavior
- [!] `export-all-variables` message handler in plugin sandbox is dead code — controller.ts registers a handler for this message type but no UI component ever sends it; the export flow uses server API routes instead; remove the dead handler to reduce sandbox bundle size and avoid confusion
- [x] No progress feedback during large ZIP export — ExportPanel builds ZIP files synchronously with no per-file progress indicator; for projects with hundreds of tokens across multiple platforms, the UI freezes with no feedback; add a progress callback to the ZIP builder or move it to a Web Worker
- [x] Token path auto-complete should suggest sibling tokens when creating — when creating a new token under `color.brand`, PathAutocomplete only suggests existing group paths; it should also show existing sibling names at that level (e.g., `color.brand.primary`, `color.brand.secondary`) so users can see what already exists and maintain naming consistency
- [x] Git-sync conflict marker parsing is duplicated between parseConflictMarkers (git-sync.ts:108-145) and resolveConflictContent (git-sync.ts:151-195) — both iterate lines looking for <<<<<<<, =======, >>>>>>> with identical loop structure; extract a shared parseConflictRegions iterator that yields (regionIndex, oursLines, theirsLines) and have both functions consume it
- [x] TokenList.tsx is a 4400-line component with 86 useState/useRef calls and 40 useCallbacks — this monolithic state surface makes every change risky, causes expensive re-renders, and is the root cause of multiple stale-closure and TDZ bugs; extract domain-specific custom hooks (useTokenSearch, useTokenSelection, useTokenExpansion, useTokenVirtualScroll, useTokenContextMenu) and move their callbacks out of the orchestrator
- [x] Git-sync applyDiffChoices (git-sync.ts:775-784) continues after partial checkout failures — if checkout fails for file N, files 1..N-1 are already checked out from remote but the function proceeds to commit and push the partial state; should either roll back successful checkouts on any failure or clearly surface which files were pulled vs skipped so the caller can decide
- [x] Resolver-store delete (resolver-store.ts:156-169) catches all unlink errors silently including permission-denied and disk-full, then removes the resolver from memory anyway — this creates disk/memory inconsistency where the resolver appears deleted but the file persists; should only ignore ENOENT and re-throw other errors
- [x] Operation-log rollback swallows revert failures silently (operation-log.ts:391-396) — when a rollback's structural steps fail mid-way, the catch block attempts to revert via inverseSteps but discards any error from that revert, then re-throws the original error; the caller has no way to know the system is in an inconsistent state; should log the revert failure and include it in the thrown error or response
- [x] No generator duplicate/clone action — GraphPanel has delete and edit but no way to clone a generator to create a similar one with a different target group or source token; users must manually reconfigure all settings from scratch each time
- [x] Generator stale indicators are aggregate-only — only a global "Re-run stale (N)" button appears at the top of GraphPanel; individual generator cards in the list don't show which ones are stale, forcing users to run all or guess which source tokens changed
- [x] No dry-run preview for generators — running a generator immediately writes tokens to the set; there's no way to preview what tokens would be created or which existing values would change before committing, making it risky to experiment with generator configs
- [x] No batch find-and-replace for token names — BatchEditor supports bulk delete, move, type change, description edit, and value adjustments, but has no find-and-replace operation for renaming patterns across selected tokens (e.g., replacing "old" with "new" in all paths)
- [x] Command palette qualifier syntax is undiscoverable — powerful structured queries (type:, has:, value:, path:, name:, generator:, group:) exist but have no inline help text, cheatsheet, or onboarding hint visible to new users who don't know the syntax exists
- [x] Merge conflict resolver in GitSubPanel lacks diff highlighting — "Your version" and "Server version" columns show raw JSON values side-by-side but don't highlight the specific properties or lines that differ, making it hard to evaluate conflict choices in large token objects
- [x] No lint suppression management UI — server has `/api/lint/suppressions` GET/PUT endpoints and HealthPanel acknowledges the gap (line 442: "suppression is still available in the full validation view" but it isn't), so users can't suppress known-good violations without calling the API directly
- [x] Tab bar icon buttons have no labels — 8+ action buttons (issues filter, preview split, command palette, expand window, canvas analysis, notifications, connection status, overflow menu) render as unlabelled icons competing for ~200px of horizontal space with no text labels or visible keyboard hints
- [x] Export "changes only" mode unavailable without Git — ExportPanel's changes-only scoping requires an initialized Git repo; non-Git projects have no alternative way to export only recently modified tokens, and the error message offers no recovery path or workaround

- [x] Dual notification channels create inconsistent feedback — ExportPanel, PublishPanel, CompareView, PropertyRow, and TokenTreeNode use Figma-native `postMessage notify` (appears outside the plugin window, ephemeral, no history), while App.tsx token operations use the in-plugin ToastStack with NotificationHistory; users performing similar actions (copy, save, sync) see feedback in two different locations depending on which panel initiated it, and Figma-native notifications are invisible in the standalone UI harness (violates: consistency, visibility of system status)
- [x] Export preset deletion has no confirmation — ExportPanel.tsx `handleDeletePreset` (L725) immediately removes the preset with no ConfirmModal, no undo, and no toast; every other delete action in the app (tokens, theme dimensions, theme options, generators, resolvers) uses a ConfirmModal with a named "Delete" button; the delete button is also hover-only (`opacity-0 group-hover:opacity-100`) making accidental clicks likely, and presets can contain complex multi-platform configurations that are tedious to recreate (violates: error prevention, consistency)
- [x] ExportPanel save-to-server preview renders inline instead of as a modal — the save preview (savePhase === 'preview', ExportPanel.tsx:1661) renders inline within the scrollable panel content rather than as a ConfirmModal; it has Cancel/Confirm buttons but no focus trap, no Escape key to cancel, no backdrop click to dismiss, and users can scroll away and interact with other controls while the preview is active; all other confirmation flows in the app (token delete, theme delete, sync apply, git push/pull/commit) use ConfirmModal with focus trap, Escape support, and backdrop dismiss (violates: consistency, error prevention)
- [x] Settings import "Apply & reload" triggers an immediate page reload with no undo path — SettingsPanel.tsx `handleApplyImport` (L375-386) writes all settings to localStorage then calls `window.location.reload()` after 800ms; once clicked, the user cannot cancel the reload, and any unsaved state elsewhere in the plugin (draft token edits, in-progress theme configuration, expanded panel state) is lost without warning; the pre-apply diff preview is good, but the irreversible reload deserves a stronger warning about side effects (violates: error prevention, user control and freedom)
- [x] ThemeManager set-row status toggle buttons have no keyboard-accessible labels — the three-button group (Excluded/Base/Override) in `renderSetRow` (ThemeManager.tsx:330-348) uses `aria-pressed` but each button's only text content is the short label ("Excl.", "Base", "Ovr.") with the full description only in a `title` attribute; screen readers get "Excl." with no indication of what is being toggled or which token set it applies to, and the entire set row's right-click context menu for bulk status changes has no keyboard equivalent beyond the context menu itself (violates: accessibility)
- [~] ExportPanel "Save to Token Server" shows no in-plugin success state after saving — after `handleConfirmSave` (ExportPanel.tsx:564) completes, `savePhase` returns to 'idle' and `savePreviewItems` are cleared; the only success indicator is a Figma-native notification outside the plugin window; within the plugin, the save preview simply disappears, which is visually identical to clicking Cancel; a brief success state or in-plugin toast would confirm the operation completed (violates: visibility of system status)
