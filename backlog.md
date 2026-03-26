# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: no new features — only improve what already exists -->
<!-- Completed items: see scripts/backlog/progress.txt -->

# Backlog Inbox

Add items here while backlog.sh is running. They will be appended to the relevant Screen section at the end of each iteration.

<!-- Format: add under the appropriate Screen heading with [ ] status and file reference -->

---

## Screen A: App Shell

### Bugs
- [x] **Deleting the active set leaves a stale set name in the UI** — After delete the token list briefly shows the old set name before `refreshTokens` resolves. Immediately switch to the first remaining set on delete. `App.tsx` delete flow
- [x] **`setTabsOverflow` ResizeObserver may accumulate on rapid `sets` changes** — Confirm only one observer is alive at a time; verify cleanup on each effect re-run. `App.tsx` ~L283

### QoL
- [x] **Overflow menu closes on any outside click before an action is taken** — A slight mis-click dismisses the menu. Consider keeping open until Escape is pressed or an action is taken. `App.tsx` ~L227

### UX
- [x] **Group scope editor is a bottom sheet** — All other modals are centered. Convert to standard centered modal. `App.tsx` ~L955

### UI
- [x] **Set tab ⋯ inconsistently visible** — Inactive tabs show the button only on hover; active always shows it. Ensure no layout shift between states. `App.tsx` ~L654
- [x] **Set tab rename input clips text before the allowed max length** — The inline `<input>` is narrower than the tab. Set `min-width` to match the tab's measured width. `App.tsx` ~L350

---

## Screen B: Token List

### Bugs
- [x] **`syncSnapshot` comparison produces false positives for object-valued tokens** — `JSON.stringify` key order is non-deterministic; a dimension token can stringify differently on two runs, showing a spurious changed-dot. Use a stable key-sorted serialiser or deep-equal. `TokenList.tsx` sync snapshot logic
- [x] **Group hover delete causes accidental deletes** — Delete is the only hover action on group rows. Replace with a `⋯` menu; delete becomes a menu item. `TokenList.tsx` ~L1715
- [x] **Token hover actions flicker at the cursor gap** — When moving the mouse from the token name into the action button area, the cursor briefly exits the group boundary, resetting hover state and hiding buttons. Reserve the hover zone to include the full row. `TokenList.tsx` ~L1953
- [x] **Group rename confirms on blur** — No way to cancel by clicking outside. Restore original on empty/unchanged input; don't confirm-on-blur if Escape was pressed. `TokenList.tsx` ~L1702
- [x] **Find & Replace preview shows identical before/after when the segment is absent** — The preview renders both rows even when old === new. Hide the row or show "no match". `TokenList.tsx` ~L1326
- [x] **Find & Replace preview doesn't highlight the changed segment** — Old path (strikethrough) and new path are shown side by side, but neither highlights which segment mutated. For long paths this requires manual character-by-character comparison. `TokenList.tsx` ~L1326
- [x] **Multi-select "Select all" count mismatches when filters are active** — `selectAll` iterates `displayedTokens` but the badge reads from the full set. Scope both to `displayedTokens` consistently. `TokenList.tsx` multi-select
- [x] **Convert-to-aliases: confirm button enabled with zero aliases selected** — Clicking fires a mutation with an empty map; spinner clears with no feedback. Disable when nothing is selected. `TokenList.tsx` ~L1399
- [x] **Deleting the last token in a group leaves the group header until next refresh** — Force an immediate refresh or local splice after delete. `TokenList.tsx` delete handler
- [x] **Token paths with a literal dot in a segment are visually indistinguishable from nested groups** — Add escaping or quoted-segment display. `TokenList.tsx` path render
- [x] **Find & Replace: empty "replace" field silently deletes path segments** — Require non-empty replace value or confirm before truncating. `TokenList.tsx` ~L1326

### QoL
- [x] **Filter state resets when switching sets** — Persist active type/group filters per-set in `localStorage`. `TokenList.tsx` filter state
- [x] **Sort order resets to Default when switching sets** — Persist sort choice per-set in `localStorage`. `TokenList.tsx` ~L832
- [x] **No way to jump from a token row to its parent group** — Add a clickable group path breadcrumb in the token row or editor header. `TokenList.tsx` row render
- [x] **"Create sibling" only discoverable via right-click** — The action is in the token context menu but absent from the hover action bar. `TokenList.tsx` ~L2040
- [x] **No way to duplicate a single token** — "Duplicate group" exists in the group context menu, but individual token duplication is absent from hover actions and context menu. `TokenList.tsx` ~L1700

### UX
- [x] **Group actions invisible** — Group hover only shows delete; rename/move/duplicate/scopes/sync are right-click only with no hint. Add a `⋯` button on group hover that opens the same menu. `TokenList.tsx` ~L1715
- [x] **Token row hover actions shift layout** — 5 buttons appear inline and push content on hover. Reserve fixed-width space with `opacity-0 group-hover:opacity-100` so no layout shift occurs. `TokenList.tsx` ~L1965
- [x] **Table mode renders full bottom action bar redundantly** — In table mode the entire bottom bar (New Token, Use preset, Multi-select, Find & Replace, Apply as Variables, Apply as Styles) stays visible. Collapse to just Apply as Variables/Styles in table mode. `TokenList.tsx` ~L1084
- [x] **"Apply as Variables/Styles" has no post-apply count** — The button disables for 1.5s but there's no "Applied N variables" or in-panel result. The Figma toast is brief and easy to miss. `TokenList.tsx` ~L603
- [!] **"Use preset" dropdown can immediately close on the same click that opens it** — The outside-click handler fires on the same `mousedown`. Distinguish `mousedown` open from `click` close. `TokenList.tsx` preset dropdown
  <!-- stale: "Use preset" was refactored to a ScaffoldingWizard modal; no outside-click race condition exists -->
- [x] **Token row right-click context menu has no keyboard equivalent** — All context actions are mouse-only. Ensure the same menu opens on `Space`/`Enter` when the row is keyboard-focused. `TokenList.tsx` ~L1700
- [x] **Three names for the same concept** — "Extract to alias" (context menu), "Convert to aliases" (select mode), "Promote to Semantic" (internal). Pick one and apply consistently. Suggested: "Link to token" / "Link to tokens".

### UI
- [x] **Mode toggles look identical to action buttons** — "Bound tokens" and "Table" (modes) sit unseparated from "Expand all" and "Collapse all" (actions) in the toolbar. Add a visual separator between the mode group and the action group. `TokenList.tsx` ~L757
- [x] **Group header `top-0` sticky value causes overlap with deeply nested groups** — Compute `top` offset based on nesting depth. `TokenList.tsx` group header render
- [x] **Type badge colour mapping is implicit inline logic** — Codify into a `TOKEN_TYPE_COLORS` constant so all type-badge usages stay in sync. `TokenList.tsx` type badge

---

## Screen C: Token Editor

### Bugs
- [x] **`hex.slice(0, 7)` in shadow/gradient sub-color pickers strips alpha** — Pickers at ~L670, ~L727, ~L1070 use `.slice(0, 7)`. Handle 8-char hex consistently with the main color picker fix. `TokenEditor.tsx`
- [x] **Dimension token can save `{ value: NaN, unit: 'px' }` when number input is cleared** — Validate field is non-empty and finite before enabling Save. `TokenEditor.tsx` dimension input
- [x] **Typography token form doesn't require any sub-fields** — A token with `fontFamily: ''` saves and silently fails in Figma. Require at minimum `fontFamily` and `fontSize`. `TokenEditor.tsx` typography form

### QoL
- [x] **No way to copy the token path from inside the editor** — Add a copy-path icon in the editor header. `TokenEditor.tsx` header
- [x] **Switching alias mode off discards the previous raw value** — Cache the pre-alias value and restore it on toggle-off. `TokenEditor.tsx` ~L185
- [x] **Token type cannot be changed after creation** — The type badge in the editor header is display-only. Wrong-type tokens require delete + recreate. Add a type selector to the editor form. `TokenEditor.tsx` ~L166

### UX
- [x] **Alias mode toggle doesn't communicate token's alias status** — When the token IS an alias, the form doesn't emphasize that. Make the resolved alias chain the primary visual focus when `aliasMode` is true. `TokenEditor.tsx` ~L185
- [x] **Color preview swatch not shown when alias resolves to a color** — Resolve the alias chain and show the swatch in the editor header when `aliasMode` is true. `TokenEditor.tsx` header
- [x] **Save button can be enabled on an untouched form** — If `initialRef` is set late, the button may be enabled before any changes. Disable when `!isDirty`. `TokenEditor.tsx` ~L391
- [x] **Contrast checker uses a `<select>` for background token** — With hundreds of color tokens, a plain native `<select>` is unusable. Replace with the searchable token picker used by alias mode. `TokenEditor.tsx` ~L292

---

## Screen D: Theme Manager

### Bugs
- [x] **Set-state click fires on the label column too** — Restrict the click target to the state control cell only, not the entire row. `ThemeManager.tsx` ~L130
- [x] **"⚠ N uncovered" double-counts tokens whose alias chain crosses a disabled set** — Use the fully resolved value, not the first hop, to determine coverage. `ThemeManager.tsx` ~L194
- [x] **Empty-theme message doesn't hide immediately after adding a set row** — Derive visibility from live `theme.sets.length`, not stale state. `ThemeManager.tsx` ~L177

### QoL
- [x] **No drag-to-reorder set rows within a theme** — Set order determines override precedence; users must delete and re-add to reorder. Add drag handles. `ThemeManager.tsx` set rows
- [x] **Theme cards cannot be reordered** — Add drag-to-reorder at the card level. `ThemeManager.tsx` card list
- [x] **No confirmation before deleting a theme** — Delete is immediate with no undo. Show a `ConfirmModal`. `ThemeManager.tsx` ~L186
- [x] **Theme rename is impossible** — Theme cards only have a delete button. Add a rename option to the theme header. `ThemeManager.tsx` ~L186

### UX
- [x] **Theme state cycling invisible** — Click-to-cycle (disabled→enabled→source) has no affordance. Replace with an explicit select/segmented control per row. `ThemeManager.tsx` ~L130

### UI
- [x] **"Source" state is visually identical to "enabled"** — Give "source" a distinct background tint or underline so all three states are perceptually distinct. `ThemeManager.tsx` ~L130

### QA
- [x] **Theme name uniqueness not validated** — Two themes with the same name target the same Figma variable collection mode, causing silent overwrites. Validate uniqueness on create. `ThemeManager.tsx` create handler
- [x] **Deleted token sets still appear in theme rows** — Filter out rows whose set name is absent from the current `sets` list on theme load. `ThemeManager.tsx` data load

---

## Screen E: Sync Panel

### Bugs
- [x] **Git diff "conflicts" array is always empty in the UI** — stale — already done; conflicts included in `allFiles` at L633. `SyncPanel.tsx` ~L67
- [x] **Variable diff "skip" rows may slip into the sync payload if state mutates mid-flight** — Snapshot `varDirs` at the moment the sync call is made, not at response time. `SyncPanel.tsx` varSyncing handler

### QoL
- [x] **No "Push all / Pull all / Skip all" bulk action for variable diff rows** — With 50+ rows, per-row direction selection is tedious. Add bulk-action buttons above the diff table. `SyncPanel.tsx` var diff section
- [x] **Branch list not refreshed after push/pull** — Re-fetch branches after a successful operation. `SyncPanel.tsx` ~L99
- [x] **Non-repo state hides the remote URL field** — Show the remote URL input and an "Initialise repo" button so users can bootstrap from the panel. `SyncPanel.tsx` not-repo state

### UX
- [x] **Readiness checks fire immediately on panel open with no CTA** — Add a "Run checks" button and only auto-run if checks are stale (>30s). `SyncPanel.tsx` readiness checks
- [x] **Variable diff "conflict" meaning is never explained** — Add a tooltip or inline legend. `SyncPanel.tsx` ~L26

### QA
- [x] **`fetchStatus` can race on rapid connect/disconnect** — Use `AbortController` to cancel in-flight requests on re-trigger. `SyncPanel.tsx` ~L87
- [x] **`orphansResolveRef` never rejects on timeout** — Add a 10s rejection timeout so the loading spinner always clears. `SyncPanel.tsx` orphansResolveRef
  <!-- stale: 10s timeout already implemented at L295-296 -->

---

## Screen F: Analytics Panel

### Bugs
- [x] **Coverage scan: `coverageResolveRef` never rejects on timeout** — The loading spinner never clears on sandbox timeout or error. Add a 10s timeout that rejects and surfaces an error message. `AnalyticsPanel.tsx` ~L119
- [x] **`runValidate` fires again if `validateKey` increments while already loading** — Guard with `if (!validateLoading)` in the `useEffect`. `AnalyticsPanel.tsx` ~L88
- [x] **Contrast matrix rows are in insertion order, not sorted by ratio** — Sort ascending by contrast ratio so worst pairs appear first. `AnalyticsPanel.tsx` contrast matrix

### QoL
- [x] **No export for validation report** — Add "Copy as Markdown" or "Download JSON" to the results header. `AnalyticsPanel.tsx` validation results
- [x] **Canonical pick for duplicate deduplication resets on navigation** — Persist `canonicalPick` in `localStorage` keyed by set. `AnalyticsPanel.tsx` ~L58

### UX
- [x] **Validation issue rows have no "jump to token" affordance** — Wire `onNavigateToToken` so clicking an issue row navigates to the token. `AnalyticsPanel.tsx` issue list
  <!-- stale: "Jump" button already wired to onNavigateToToken at L414-419 -->
- [x] **Contrast matrix overflows the panel width** — Add `overflow-x-auto` or cap to the 10 lowest-contrast pairs with a "Show all" toggle. `AnalyticsPanel.tsx` contrast matrix
- [x] **Analytics tab has no issue-count badge** — No indicator on the "Analytics" tab label shows pending validation errors. Users must navigate to the tab and run validation to discover issues.

### UI
- [x] **Stats section shows plain-text counts with no visual distribution** — Replace with an inline proportional bar chart per type. `AnalyticsPanel.tsx` stats section

### QA
- [x] **Duplicate detection hashes by raw hex, not normalised hex** — `#F00` and `#FF0000` represent the same colour but are treated as different. Normalise to 6-char uppercase before comparing. `AnalyticsPanel.tsx` duplicate detection

---

## Screen G: Selection Inspector

### Bugs
- [x] **`handleCreateToken` doesn't validate token path format** — Paths like `..foo` or `foo..bar` are accepted. Apply the same regex used for set-name validation. `SelectionInspector.tsx` ~L174

### QoL
- [x] **No "View token →" link after Create & bind** — Show a brief success state with a "View token" link. `SelectionInspector.tsx` ~L188
- [x] **"Remove binding" has no undo** — Push a remove-binding undo slot via the undo system. `SelectionInspector.tsx` ~L160

### UX
- [x] **Multi-selection binding summary doesn't distinguish shared vs mixed** — "3 layers selected / 4 bindings" is opaque. Show "2 shared, 2 mixed". `SelectionInspector.tsx` ~L206
- [x] **"Sync Selection" shows when bindings are already current** — Sync buttons are always visible immediately after a successful sync. Add an "up to date" or freshness indicator. `SelectionInspector.tsx` ~L251
- [x] **Sync controls show below collapsed inspector** — "Sync Page" button is visible when inspector says "Select a layer". Hide sync controls when no layer is selected. `SelectionInspector.tsx` ~L238

### UI
- [x] **Color swatch is 12×12px and hard to see at small sizes** — Increase to 14×14px with a white inner border for transparency support. `SelectionInspector.tsx` ~L321
- [x] **Inspector max-height is hardcoded at 200px** — Use a flex-based or percentage max-height at larger panel sizes. `SelectionInspector.tsx` ~L275
- [x] **Create-token form appends below the inspector body and pushes content off-screen** — The form should replace the body, not append after it. `SelectionInspector.tsx` ~L382

### QA
- [x] **`getTokenTypeForProperty` returns `'string'` as a silent fallback for unknown properties** — New `BindableProperty` values not handled here silently produce string-typed tokens. Add a dev-mode console warning. `SelectionInspector.tsx` ~L67

---

## Screen H: Import Panel

### Bugs
- [x] **Read-variables message never arriving leaves the spinner running forever** — Add a 15s timeout that clears `loading` and shows an error. `ImportPanel.tsx` ~L36
- [x] **Switching source while previous read is in-flight corrupts the token list** — Track the active source request and discard responses from superseded requests. `ImportPanel.tsx` ~L57
- [x] **Import silently overwrites tokens with matching paths** — Preflight-check for conflicts and offer a merge strategy (skip/overwrite) before committing. `ImportPanel.tsx` import handler

### QoL
- [x] **No "Select all / Deselect all" toggle** — With 100+ tokens, individual checkboxes are impractical. Add a header checkbox. `ImportPanel.tsx` ~L23
  <!-- stale: toggleAll() + "Select all / Deselect all" text button already implemented at L110-116 and L243-247 -->
- [x] **No type filter on the token preview list** — Add a type-filter pill row above the list. `ImportPanel.tsx` token list
- [x] **Target set defaults to `'imported'` regardless of existing sets** — Default to the first existing set or last-used import target (persisted in `localStorage`). `ImportPanel.tsx` ~L21

### UX
- [x] **Loading state shows a generic spinner** — Show "Reading variables from Figma…" or "Reading styles from Figma…" based on `source`. `ImportPanel.tsx` loading state
- [x] **Success has no token count** — Show "Imported N tokens" as a toast or inline message. `ImportPanel.tsx` success handler
- [x] **Alias token values show raw `{other.token}` with no resolved preview** — Add a hover tooltip resolving the alias. `ImportPanel.tsx` token preview

### UI
- [x] **Token preview list is ungrouped** — Group by collection (variables) or type (styles) for scanability. `ImportPanel.tsx` token list
- [x] **"Read Variables" and "Read Styles" are equal-weight buttons** — Make the more-common action (Read Variables) a filled primary button. `ImportPanel.tsx` ~L57

### QA
- [x] **`selectedTokens` Set may reference stale tokens if a second `variables-read` arrives** — Re-derive `selectedTokens` from the current `tokens` state in the import handler. `ImportPanel.tsx` ~L43
  <!-- stale: handleImport already does tokens.filter(t => selectedTokens.has(t.path)) at L135, which re-derives from current tokens -->
