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
- [!] No publish dry-run — no way to preview what a Git push or Figma variable publish will change before executing

### UX

---

## Code Quality

### Redundancy & Duplication

### Performance

### Correctness & Safety

- [!] Cannot access 'Wr' before initialization — runtime error, likely a circular dependency or hoisting issue with a minified identifier; needs source-map / unminified stack trace to locate the declaration. Once fixed, audit the codebase for similar initialization-order issues (other circular deps, `let`/`const` accessed before declaration across module boundaries).

### Accessibility

### Maintainability

- [~] Deep Inspect mode has no keyboard shortcut — toggling deep inspection requires clicking a small button; a keyboard shortcut would streamline the inspect workflow

- [~] **Token create form: type-specific value field placeholders and hints** — the value field shows no placeholder text that tells the user what format is expected for each type. Add contextual placeholder text per type (e.g., `#hex or oklch(...)` for color, `16px / 1rem` for dimension, `400 / bold` for fontWeight). This is especially valuable for users unfamiliar with DTCG value formats.
- [x] **Token list: "focus group" / zoom-in mode** — clicking a group header in the tree could optionally "zoom into" that group: the path breadcrumb becomes the root, only that group's tokens are shown, and a ← Back button exits the zoom. This makes deep hierarchies navigable without losing context. Currently expanding a group still shows the whole tree, which can be noisy in large sets. Similar to how Figma's left panel lets you "enter" a frame.
- [x] [HIGH] Duplicate `ScanTokenUsageMessage` interface in shared/types.ts — lines 286-288 and 321-324 both define an interface with `type: 'scan-token-usage'` (one without `tokenPath`, one with), creating a type collision in the discriminated union
- [x] **Token list: empty state with scaffolding prompts** — when a token set has no tokens, the list is empty with only a create button. Add a meaningful empty state that offers quick-start options: "Create a color ramp", "Add base spacing scale", "Import from CSS/Tailwind", "Use a preset". These could call the existing scaffold/import flows. This significantly improves the first-use experience.
- [~] **Token list: density toggle (compact vs comfortable)** — currently all rows are 28px. Power users managing thousands of tokens want maximum density; new users or those reviewing tokens want more breathing room with larger swatches. Add a density preference (compact/default/comfortable) that scales row height and preview sizes. Persist per user.
- [x] [HIGH] PublishPanel sync actions have no confirmation step — "Push to Figma" and "Pull to local" execute immediately without a confirmation dialog, despite being destructive operations that overwrite variables/styles; add a confirmation modal showing a summary of changes (N creates, N updates, N deletes) before proceeding
- [x] [HIGH] Server has no request body size limit — Fastify's default `bodyLimit` is not configured, so `PUT /api/tokens/:set` and `POST /api/tokens/:set/batch` accept arbitrarily large payloads; set a reasonable `bodyLimit` (e.g. 5MB) on the Fastify instance to prevent memory exhaustion from malformed or malicious requests
- [x] **Token list: back navigation when jumping to alias** — the "navigate to alias" action (clicking the arrow on an alias token) jumps you to the referenced token and expands its group, but there's no way to go back. Add a "← Back" button or history breadcrumb that appears after an alias navigation, so you can return to where you were.
- [x] **Token list: keyboard shortcut hint on group rows** — the `n` key opens a sibling create form when a group is focused, but there's no visible hint of this. Add a small `n` hint label (similar to how IDE sidebars show `+` shortcut hints) that appears when a group row is focused via keyboard.
- [x] [HIGH] `useFigmaSync.ts` error handlers restore stale closure values — `setSyncGroupPending(syncGroupPending)` at line 39 and `setSyncGroupStylesPending(syncGroupStylesPending)` at line 60 capture the state value at callback creation time, so on error the state gets set to a stale value instead of being properly reset (e.g. to `null`)
- [x] **Token list: name validation as-you-type in create form** — currently path validation only happens on submit. Add inline validation as the user types: flag invalid characters, warn if the path already exists (would overwrite), indicate if the parent group will be auto-created. This makes errors surfaced before the user clicks Create.
- [x] **Token list: "Resolve all" toggle in tree view** — a one-click toggle that shows every token in the tree with its fully resolved value substituted, so you can see what all aliases ultimately evaluate to in the current theme. Currently this information is only available in the table view or by hovering/expanding chains in the tree. Useful for quickly auditing a set before publishing.
- [~] **Token list: visible keyboard shortcut hints in context menus** — the right-click context menus for tokens and groups show actions but no keyboard shortcuts. Show shortcut hints next to each action (e.g., `⌫ Delete`, `R Rename`, `D Duplicate`). Helps discoverability and accelerates power-user workflows.
- [~] **Token list: provenance badge for imported and generated tokens** — generator-derived tokens already show a badge. Extend this to tokens that were imported from Figma variables, imported from JSON, or synced from git, so users understand where each token came from. A subtle icon in the row is enough — just enough to distinguish "mine" from "imported".
- [ ] **Token list: "Promote duplicates" callout** — when the "show duplicates" filter is active, show a persistent banner offering "Promote N duplicate values to primitives and alias them" as a single action, instead of requiring the user to multi-select and find "Link to tokens" in the batch toolbar. The current flow for this is too buried.
- [ ] **Token list: filter state indicator in toolbar** — when multiple filters are active simultaneously (type filter + search query + ref filter + pinned), the toolbar becomes a row of scattered pills. Add a compact "Filters (3) ×" indicator that shows the count of active filters and clears all on click, replacing the individual scattered pills. The individual pills can still appear in an expandable drawer below.
- [ ] **Token list: sticky group breadcrumb as a real interactable header** — the breadcrumb that shows the current group context while scrolling is currently a passive indicator. Make it an interactable sticky row: clicking a segment jumps to that group header, and there's a "↑ Collapse all below" affordance. This gives positional awareness and quick navigation during deep scrolling.
- [ ] **Token creation: sticky active-set label in create form** — the active set name is shown in the main tab area but is easy to lose context of when the create form is open. Show the active set name prominently inside the create form (e.g., "Creating in: primitives") so users know where the token will land before clicking Create.
- [ ] **Token list: "no results" state with smart suggestions** — when a search query returns no results, the current empty state just shows "No tokens found". Add smart suggestions: if the query looks like a path (`colors.brand`), offer "Create a token at this path →"; if the query looks like a type (`shadow`), offer "Filter by type: shadow →". Turns a dead end into a useful fork.
- [ ] **Token creation: multi-token "table create" mode** — a lightweight mode for creating several tokens in a group at once, like a spreadsheet: each row is a token with name / type / value columns, and pressing Tab moves to the next cell. This is faster than creating tokens one-by-one with "Create & New" for scenarios like setting up a spacing scale from scratch.
- [ ] **Token list: group-level "coverage" indicator for themes** — when a token set is part of a multi-dimensional theme, show a small indicator on group rows telling how many of the group's tokens have overrides across all theme dimensions. E.g., "12/15 themed" next to the `colors.brand` group header. This lets you quickly spot where theme coverage is incomplete without going to the ThemeManager panel.

- [ ] Context-aware token surfacing: read current Figma selection and surface only the 5-8 most relevant tokens (type-matched, nearby-usage-ranked) instead of the full list — this is the single highest-impact discovery improvement
- [ ] Reduce token-apply friction: select layer → shortcut → contextual picker that infers property + shows short relevant list → pick → done in 2 interactions, not 5
- [ ] Token impact summary on edit: show "affects N layers across M components", list affected component names, option to highlight affected layers on canvas, before/after value diff for aliases/dependents
- [ ] Consistency scanner: scan selection/page for values that are close-to-but-not-exactly a token (colors 2% off, spacing 1px away), surface as suggestions with one-click snap-to-token
- [ ] Visual token list rendering: color tokens show inline swatch, dimension tokens show proportional bar, typography tokens show "Aa" in actual font/size/weight, shadows show shadow, gradients show gradient — make the list look like what the tokens are
- [ ] Token resolution chain debugger: click a bound layer → see full resolution chain (e.g. `color.bg.card` → alias `color.neutral.100` → theme:dark → `#1E1E1E`) in one glance
- [ ] Interactive scale curve editors: draggable bezier for color ramp lightness distribution, visual staircase for type scale with adjustable ratio — make generator output directly manipulable
- [ ] Smart naming suggestions: pattern-match existing token names and suggest paths for new tokens (e.g. if `color.brand.primary/secondary/tertiary` exist, suggest `color.brand.{?}` not a blank field)
- [ ] Before/After snapshots: "Save this state" → experiment → "Compare with saved" → keep or revert — two buttons, zero git concepts, designed for trying things and showing stakeholders
- [ ] Inline theme editing in token editor: when editing a token that participates in themes, show all theme values side-by-side in the editor instead of requiring navigation to a separate Themes panel
- [ ] Toast stacking system: queue multiple toasts vertically instead of overlapping in the same bottom-left position
- [ ] Hover tooltips on truncated token paths: show full path on hover for deep hierarchies that get line-clamped
- [ ] Consistent empty states across sub-panels: Themes, Resolvers, Generators, Heatmap, History all need guidance-oriented empty states (what is this, why use it, how to start) matching the quality of the main EmptyState
- [ ] Contextual help for advanced features: first-time hints or inline descriptions for Resolvers, Token Flow, Heatmap, Generators — no onboarding wizard, just "what is this?" affordances on each panel
- [ ] Set management discoverability: add visible affordance (menu icon, kebab, dropdown) on set tabs instead of relying solely on right-click for create/rename/duplicate/merge/split/reorder
- [ ] Search qualifier discoverability: add autocomplete, placeholder hints, or a filter dropdown for advanced qualifiers (`type:color`, `alias:{path}`, `>has:ref`) in the token search input
- [ ] "Did you mean this token?" nudge: when a designer pastes/eyedrops a raw value that's within a small delta of an existing token, suggest the token inline — make the systemized path easier than the unsystemized path
- [ ] Bulk type-change in batch editor: allow changing the type of multiple tokens at once (e.g. converting `string` tokens to `dimension` during a migration)
- [ ] `creatingSet` state stuck on error in App.tsx `handleCreateSet` — `setCreatingSet(false)` at line 789 only runs on success; if the fetch throws (network error), the catch block at line 794-797 never resets `creatingSet`, leaving the UI in a loading state
- [ ] `SET_NAME_RE` declared twice in App.tsx — imported from `./shared/utils` on line 51 and then redeclared locally on line 57, shadowing the import and making it dead code
- [ ] `useSetMergeSplit` fetch calls missing `.ok` response checks — `handleCheckMergeConflicts` (line 73-78) and `openSplitDialog` parse response JSON without checking HTTP status, so 4xx/5xx errors are silently treated as valid data
- [ ] `useDragDrop` `handleDropReorder` has no error handling on the reorder fetch — line 150-154 of useDragDrop.ts fires a POST to reorder tokens but never checks the response or catches errors; a failed reorder silently proceeds to push undo state and refresh
- [ ] Resolver `invalidate()` comment says "iterative BFS" but uses `queue.pop()` (DFS) — line 122-128 of packages/core/src/resolver.ts; the traversal order doesn't affect correctness for invalidation but the stale comment is misleading
- [ ] Missing ASSET token type validation in core validator.ts — the `ASSET` type is defined in constants.ts but has no validation case in the validator's switch statement, so invalid ASSET token values pass validation silently
- [ ] Unsafe `as unknown as { dir: string }` cast in server resolvers.ts line 44 — bypasses type safety to access the private `dir` property of `ResolverStore`; a public getter or constructor param would be safer and survive refactors
- [ ] VersionHistoryPanel has no revert/restore actions — the panel shows commit diffs with added/modified/removed badges but is purely informational; add a "Restore this version" button per commit and a "Restore this token" action per changed token row, wiring into the existing operation-log rollback API
- [ ] ImportPanel conflict resolution has no search or filter — when importing 50+ tokens with conflicts, users must scroll through every conflict row; add a search field and type/status filter (new/overwrite/skip) to the conflict list so users can quickly find and resolve specific conflicts
- [ ] ExportPanel has no SCSS, LESS, or TypeScript export formats — only CSS, Dart, iOS Swift, Android, and JSON are supported; add SCSS variables (`$token-name`), LESS variables (`@token-name`), and TypeScript const exports (`export const tokenName = ...`) to cover common frontend toolchain needs
- [ ] FontFamily value editor is a plain text input with no font discovery — users must type font names from memory; add a searchable dropdown populated from system/web fonts (or at minimum the fonts used in the current Figma file) with a live text preview rendered in each candidate font
- [ ] Asset token editor has no file upload or preview — the AssetEditor is a bare URL input with no way to upload an image, preview the current URL, or validate that the URL resolves; add an image preview below the input and a drag-and-drop upload area that stores the asset (or encodes as data URI)
- [ ] QuickStart wizard has no skip option for individual steps — experienced users who already have primitives must still click through the "Generate Primitives" step to reach theme setup; add a "Skip" button on each step and a step indicator that allows jumping to any step directly
- [ ] Token binding in SelectionInspector has no undo — binding a token to a Figma property is immediate and irreversible (no undo toast appears), while "Clear all bindings" does support undo; add undo support for individual bind operations so users can experiment with token assignments safely
- [ ] CommandPalette token search mode has no "copy path" action — the token results show "Val" (copy value) and "CSS" (copy CSS variable) buttons but no way to copy the dot-notation token path itself (e.g. `colors.brand.500`); add a "Path" copy button since paths are needed for alias references and documentation
- [ ] ThemeManager dimension/option search — when a theme has many dimensions (e.g. brand × mode × density × viewport), there's no way to search or filter dimensions or their options; add a search/filter input at the top of the ThemeManager panel
- [ ] PublishPanel conflict resolution has no "Accept all" or bulk action — when syncing surfaces many conflicts, each row requires individual Push/Pull/Skip selection; add "Accept all as Push" / "Accept all as Pull" bulk actions similar to ImportPanel's "Accept all" / "Reject all" buttons
- [ ] `BatchEditor.tsx` renamePreview creates `new RegExp(findText)` inside `.filter()` on every element (~line 236) instead of reusing the already-memoized `parsedRegex` — wasteful for large token sets
- [ ] `useStyleSync.ts` pullRows `Promise.all` never checks `res.ok` on individual fetch responses (~line 152) — a 4xx/5xx from a single token PATCH silently succeeds, leaving the UI out of sync with the server
- [ ] `ThemeManager.tsx` set-fetch loop silently swallows all errors (~line 153) — if a set fails to load, coverage calculations are silently incomplete with no user feedback
- [ ] `ThemeCompare.tsx` and `ExportPanel.tsx` clipboard writes are fire-and-forget — `navigator.clipboard.writeText()` is not awaited and has no `.catch()`, so the "Copied!" feedback shows even if clipboard access is denied
- [ ] `fontLoading.ts` font cache is never invalidated — `cachedFonts` is set once on first call and never cleared, so fonts installed during a plugin session are invisible to weight resolution
- [ ] `useFindReplace.ts` bulk-rename fetch has no abort signal or timeout (~line 86) — a slow server response hangs the UI indefinitely with no way to cancel
- [ ] `useSetDuplicate.ts` silently returns on HTTP errors (~lines 32, 42) — if fetching the source set or creating the duplicate fails with 4xx/5xx, the user gets no error feedback and the operation appears to do nothing
- [ ] `TokenEditor.tsx` repeats identical `as any` cast for `baseValue` four times (~lines 882-893) — `extendsPath ? (allTokensFlat[extendsPath]?.$value as any) : undefined` should be extracted to a typed variable to remove the casts and the duplication
- [ ] `PublishPanel.tsx` retry loop catches all errors as timeout retries (~line 198-200) — non-timeout errors (e.g. malformed message, plugin crash) are silently retried instead of surfaced, masking real failures
- [ ] `git-sync.ts` conflict parser skips `>>>>>>>` marker with unchecked `i++` (~line 45) — if the closing marker is the last line in the file and is malformed or missing, the parser silently produces incomplete conflict data
- [ ] `useGeneratorDialog.ts` fetch for existing set tokens silently swallows errors (~line 247) — `.catch(() => {})` means generator sync proceeds with empty existing tokens, potentially overwriting real values
- [ ] `buildTsv` in `ThemeCompare.tsx` has `filteredDiffs` in its useCallback dependency array (~line 175) but never references it in the function body (the data comes via the `rows` parameter) — unnecessary re-creation on every filter change

- [ ] Rename conflict detection: warn when renaming a token that is referenced by aliases — show a list of dependent tokens and offer "Auto-update all aliases" so users don't silently break their token graph when refactoring paths
- [ ] Generator output overwrite warning: highlight tokens that will be overwritten (not newly created) in the generator preview with an "update" badge, so users can see they are about to replace hand-tuned values before confirming
- [ ] Git sync diff preview before push — add a "Preview changes" button that fetches the pending diff and shows before/after values per changed token without committing, so users can catch accidental deletions before they propagate to the repo
- [ ] Variable/style sync dry run — add a "Preview sync" button next to Apply in the variable and style sync sections of PublishPanel that shows adds/updates/deletes without writing to Figma, mirroring how git diff works
- [ ] SelectionInspector "apply to other layers" fast path — after binding a token to one property, show a toast with "Apply to N other selected layers with the same property" so users can bind the same token to a whole multi-selection in one click instead of repeating per layer
- [ ] SelectionInspector binding failure feedback — binding a token currently posts to the plugin sandbox with no response; add a round-trip confirmation so the inspector shows an inline error if the binding fails (invalid token type for the property, node locked, etc.)
- [ ] ThemeManager coverage gap "auto-fill from source" — the coverage view already highlights tokens missing in a theme option; add an "Auto-fill from source" action per uncovered token (and a "Fill all" bulk button) that copies the source-set value into the option as a new override token
- [ ] Analytics panel bulk "promote duplicates to alias" — when the duplicate-values view shows N tokens with the same raw value, add a "Promote to alias" button that creates a single canonical token and converts all duplicates to aliases pointing to it, reducing N tokens to 1+N aliases in one action
- [ ] Batch editor live regex match preview — when the batch rename pattern field contains a valid regex, show a live preview table of "original path → new path" for all matching tokens before the user clicks Apply, so accidental over-broad patterns are caught before they land
- [ ] Interactive generator preview — color ramp and type scale generators currently require changing numeric inputs and re-running to see adjustments; add a draggable curve handle (for color ramp lightness/chroma arc) and a live staircase handle (for type scale ratio) so visual tuning happens without multiple generate-and-inspect cycles
- [ ] ResolverPanel contextual help and starter templates — the empty state explains what resolvers are but offers no "Learn more" link, no example, and no "Create from template" action; add a light/dark-mode preset template and a short inline explanation of when to use resolvers vs. themes
- [ ] CommandPalette structured search qualifiers — token search in the command palette (prefixed with `>`) only does substring matching; bring over the `type:color`, `alias:{path}`, and `has:ref` qualifiers from TokenList search so power users get the same filter expressiveness in the palette
