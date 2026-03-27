# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: ambitious feature additions + improve what already exists -->
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

- [x] Virtual-scroll row height mismatch — `VIRTUAL_ITEM_HEIGHT` is hardcoded to 28 px, but rows with chain/alias badges render at ~48–56 px, causing misaligned scroll positions

### QoL

- [x] No multi-drag — drag-and-drop works for one token at a time; in select mode dragging is disabled entirely, forcing one-by-one moves
- [x] Inline editing limited to colors — only color tokens get the inline swatch picker; spacing, dimension, and number types require the full editor modal
- [x] Copy token path always uses dot notation — no option to copy as CSS custom property, SCSS variable, or alias reference format
- [x] Cross-set select-all only works within current set — `handleSelectAll` uses `displayedLeafPaths` scoped to the active set even when cross-set search results are shown
- [x] Color picker canvas has no keyboard navigation — the saturation/lightness area is pointer-only with no arrow-key support or ARIA labels

### UX

- [x] ColorPicker hex input silently rejects invalid values — typing "#GGGGGG" shows no error message, no red border, just nothing happening
- [x] BatchEditor opacity allows out-of-range values (e.g. "150") that silently clamp to the slider max — disconnect between typed value and displayed result
- [x] BatchEditor scaling dimension tokens containing aliases (e.g. `{spacing.base} * 2`) fails silently with no feedback about why
- [x] PasteTokensModal format hints don't clearly indicate that JSON and name:value formats are mutually exclusive — mixing formats gives confusing results
- [x] Find-and-replace has no confirmation step — bulk rename applies immediately with no preview-and-confirm modal, making accidental mass renames easy
- [x] Scroll position resets on search — applying or clearing a search filter jumps virtual scroll to top instead of preserving the user's position
- [x] No paste-back for copied token JSON — clipboard copy produces valid DTCG JSON but there's no paste handler to re-import it; one-way operation
- [x] Drop target has no invalid-zone feedback — dragging a token over an invalid target (e.g. its own child group) shows no rejection indicator; the drop just silently fails

---

## Theme Management

### Bugs

- [x] Theme references stale sets — if a token set is deleted externally, theme configurations still reference it with no validation or warning; applying the theme silently skips the missing set

### QoL

- [x] No duplicate-theme action — users must manually recreate themes from scratch; a "Duplicate" option would speed up creating variants
- [x] Coverage gaps don't link to unresolved tokens — the coverage percentage is shown but clicking doesn't navigate to the specific uncovered tokens
- [~] Drag-to-reorder set precedence has no keyboard alternative — reordering relies exclusively on pointer drag; keyboard-only users can't change precedence

### UX

- [x] ThemeManager create-dimension error says "Use letters, numbers, and spaces" but `slugify` silently converts spaces to hyphens — misleading guidance
- [x] ThemeManager coverage gaps per dimension are collapsed by default — users may not notice uncovered tokens without clicking into each option
- [~] No theme preview mode — no way to preview token values with a theme applied before committing it as active
- [~] "Add option" form resets after each addition — creating multiple dimension options requires re-opening the form each time; batch-add would be faster

---

## Sync

### Bugs

- [~] 10-second Figma correlation timeout has no loading indicator — the sync panel waits for a Figma response with no spinner; users see a frozen UI
- [ ] Partial sync failure has no rollback — if sync fails partway through a batch, already-applied changes persist with no way to revert

### QoL

- [ ] SyncPanel variable sync has a 15-second timeout with no user-facing indication of the threshold — for large token sets this feels like a hang before showing an unhelpful error
- [ ] SyncPanel bulk actions (push all / pull all / skip all) apply with no confirmation of how many rows will be affected
- [ ] Sync progress doesn't clarify units — "45 / 120" doesn't say whether the count is layers or individual bindings; label the unit explicitly

### UX

- [ ] SyncPanel Compare button relabels to "Re-check" after first run but provides no visual staleness indicator — users can't tell if the current diff is still valid after making changes
- [ ] No pause/cancel for in-progress sync — once a bulk sync starts there's no way to stop it; a cancel button would prevent wasted time on wrong-set syncs
- [ ] No dry-run mode — no way to preview what a sync will change before it touches Figma objects

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

- [ ] AnalyticsPanel deduplication replaces all duplicate color tokens with aliases in one click — no confirmation dialog or preview of what will change, risky for large token sets
- [ ] No bulk-suppress by rule type — suppressing warnings requires dismissing each individually; a "suppress all of this type" action would declutter the panel
- [ ] Contrast matrix isn't a semantic table — the color contrast grid is rendered without `<table>` markup, making it invisible to screen readers
- [ ] No export validation report — no way to save or share current validation results as JSON or CSV
- [ ] Component coverage analysis has no progress indicator — scanning runs with no feedback until results appear

---

## Selection Inspector & Property Binding

### Bugs

- [ ] SemanticMappingDialog `handleCreate` never calls `setSaving(false)` on the success path — user sees perpetual loading spinner after tokens are created; only errors reset it
- [ ] `useFigmaSync` `handleSyncGroup` and `handleSyncGroupStyles` don't restore pending state on error — if sync fails, the UI is stuck in a loading state with no retry path
- [ ] `useFigmaSync` `handleApplyGroupScopes` has no error tracking — failures log to console only, UI shows no feedback

### QoL

- [ ] Remap operation provides no error feedback — if the server request fails, `remapRunning` toggles off but the user sees no message explaining what went wrong
- [ ] `handleApplyGroupScopes` sends one PATCH request per token in `Promise.all` with no batching — for groups with many tokens this is slow with no progress indicator
- [ ] No "create token from selection" keyboard shortcut — must click through the UI; Cmd+T or similar would speed up design→token workflow
- [ ] New-token form doesn't suggest a path based on the bound property — the path field starts empty instead of pre-filling a convention like `color.fills.{layerName}`
- [ ] Remap panel "from → to" syntax is unexplained — the find/replace-style remap UI has no inline help or example placeholder text

### UX

- [ ] No "clear all bindings" action — removing all bindings from a selection requires unbinding each property one-by-one

---

## Import

### Bugs

- [ ] ImportPanel `readTimeoutRef` is never cleared when the message handler successfully receives data — if the response is slow but arrives after timeout fires, user sees a stale error message overlaid on the actual result
- [ ] ImportPanel partial import failure reports all failed paths but doesn't indicate which tokens actually succeeded — unclear what was partially imported
- [ ] Figma Variables read timeout fails silently — the 5-second timeout for reading variables produces no user-facing error; the import appears to do nothing

### UX

- [ ] ImportPanel JSON parse failure shows generic "Could not parse JSON file" with no detail about the syntax error location or what went wrong
- [ ] ImportPanel "Import from Figma Variables" gives no guidance about prerequisites — the only feedback is a 15-second timeout error if the plugin isn't set up correctly
- [ ] No import preview — users can't review what will be created/overwritten before committing
- [ ] No conflict-resolution UI — import shows conflicting path counts but doesn't offer merge, skip, or rename-on-conflict options
- [ ] No drag-and-drop file upload — the file input is click-only with no dropzone affordance

---

## Token Generation & Graph Editor

### Bugs

- [ ] GraphPanel "Apply template" button doesn't disable during in-flight request — rapid clicks can trigger duplicate applications
- [ ] Generator save button disabled with no actionable feedback — tooltip doesn't explain which required field (group, name, source, preview) is missing
- [ ] Multi-brand duplicate brand names silently overwrite tokens — entering the same brand name twice produces overlapping token paths with no validation

### UX

- [ ] GraphPanel semantic layer creation silently ignores 409 conflicts — if some semantic aliases already exist, they're skipped with no user feedback about what was and wasn't created
- [ ] Graph panel has no zoom controls — navigation is mouse-wheel only; no +/− buttons, fit-to-view, or zoom-to-selection
- [ ] No search/filter in graph view — large dependency graphs have no way to locate a specific token node
- [ ] No graph export — no option to save the rendered graph as SVG or PNG for documentation
- [ ] Generator step presets use cryptic labels — labels like "Tailwind (11)" or "Minor Second" lack explanatory tooltips
- [ ] Lightness/chroma sliders have no visual preview — numeric L* and chroma values shown without a color swatch of what the setting produces
- [ ] No before/after diff in override mode — when a generator overwrites existing tokens there's no side-by-side comparison of old vs. new values

---

## Token Editor

### QoL

- [ ] TokenEditor alias resolution errors don't identify which specific alias path failed to resolve — user must manually debug the reference chain
- [ ] No Cmd+S / Ctrl+S to save — the editor requires clicking the save button; a keyboard shortcut is the most basic expectation
- [ ] No conflict detection for concurrent edits — if a token is modified on the server while the editor is open, saving silently overwrites the server version
- [ ] Circular-reference error doesn't identify the cycle — the error says "circular reference detected" but doesn't name which tokens form the loop
- [ ] Type change has no impact warning — changing a token's type could break downstream references but the confirmation doesn't indicate how many dependents will be affected

---

## Settings & Data Management

### QoL

- [ ] DELETE /data endpoint has no server-side confirmation gate — a single accidental API call permanently deletes all token sets and themes
- [ ] SyncPanel.tsx is dead code (1167 lines) — exported but never imported; appears superseded by PublishPanel; should be removed
- [ ] Git commit allows submit with empty message — the commit form doesn't disable the button when the message field is blank
- [ ] No publish dry-run — no way to preview what a Git push or Figma variable publish will change before executing

---

## Code Quality

### Redundancy & Duplication

- [ ] Identical fetch-and-error pattern duplicated across 10+ call sites — the `fetch → check res.ok → catch → show error` sequence is copy-pasted; extract a shared `apiFetch` utility
- [ ] `err instanceof Error ? err.message : 'An unexpected error occurred'` repeated 20+ times — extract to a `getErrorMessage(err)` helper

### Performance

- [ ] Generator auto-run errors (triggered on token updates via SSE) are swallowed with `console.warn` — users have no way to discover why a generator didn't re-execute after editing a source token
- [ ] `flattenLeafNodes` recomputed multiple times per render without memoization — recursive O(n) walk called at 4+ sites in TokenList on every render cycle
- [ ] Duplicate-value detection rebuilds via JSON.stringify on every token change — O(n²) with no debounce; significant for sets above ~5 k tokens

### Correctness & Safety

- [ ] DELETE /api/sets/:name does not check if generators reference this set as `targetSet` before allowing deletion — leaves orphaned generators that error on next run
- [ ] Token rename operations don't update theme dimension sets that reference the old token path — can silently break theme configurations
- [ ] ValuePreview renders an empty 5×5 div for unresolved aliases instead of a warning icon or placeholder — users don't know the token failed to resolve
- [ ] ValuePreview shadow preview only renders a single shadow even if the token value is an array — multi-shadow tokens are visually misrepresented
- [ ] PreviewPanel color palette skips alias tokens entirely — only raw hex values are shown, so derived/aliased colors are invisible in the palette view

- [!] Cannot access 'Wr' before initialization — runtime error, likely a circular dependency or hoisting issue with a minified identifier; needs source-map / unminified stack trace to locate the declaration. Once fixed, audit the codebase for similar initialization-order issues (other circular deps, `let`/`const` accessed before declaration across module boundaries).

- [~] Deep Inspect mode has no keyboard shortcut — toggling deep inspection requires clicking a small button; a keyboard shortcut would streamline the inspect workflow
