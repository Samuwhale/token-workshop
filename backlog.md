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

- [~] ThemeManager dimension list has no search/filter UI despite the state existing — dimSearch state and a ref are declared in ThemeManager.tsx (~L138-139) but the search input is never rendered; users with many theme dimensions cannot filter by name or coverage status; implement the search input using the existing state and add a "show only dimensions with gaps" toggle

- [x] PreviewPanel Buttons/Forms/Card templates are static CSS demos that don't reflect the user's actual tokens — ButtonsTemplate (PreviewPanel.tsx:582) uses hardcoded `var(--color-primary, #0066ff)` with generic fallbacks; if the user's tokens use different naming conventions the templates render entirely from hardcoded fallbacks; either dynamically map the user's actual tokens to template slots or let users assign tokens to template properties
- [x] ResolverPanel has no edit flow for existing resolvers — users can create and delete resolvers but cannot edit name, description, or modifier configuration after creation; the only path is delete-and-recreate which loses any associated state; add inline editing or an edit mode for resolver properties (ResolverPanel.tsx ~L383-513)
- [x] PreviewPanel dark mode toggle is not persisted — switching between light/dark resets every time the user changes template tabs or re-opens the panel; persist the dark mode preference in localStorage so it survives across sessions (PreviewPanel.tsx ~L287-315)
- [x] No per-token value changelog — users can see set-level git history and operation log but have no way to answer "what were the previous values of this specific token and when did they change"; add a "History" section to the TokenEditor that shows the value timeline for the selected token by filtering git diffs or operation log entries to that path
- [x] Keyboard shortcut definitions are scattered across 5+ files with no single source of truth — handlers live in App.tsx, TokenList.tsx, TokenEditor.tsx, SelectionInspector.tsx, and CommandPalette.tsx while KeyboardShortcutsModal.tsx has its own static display list; adding or changing a shortcut requires updating multiple files and the documentation can easily drift from reality; consolidate into a single shortcut registry that both handlers and the help modal consume
- [x] SettingsPanel import applies immediately with no preview of what will change — importing a settings JSON file (SettingsPanel.tsx ~L242-273) overwrites current lint rules, export defaults, and UI preferences in one shot with no diff/confirmation dialog; show a preview of what settings will be overwritten before applying
- [~] No token reference format picker when copying a token path — the context menu and command palette offer separate "Copy path", "Copy CSS var", and "Copy value" actions but the most common need is switching between dotted path, CSS var `var(--token-path)`, and DTCG alias `{token.path}` formats; add a small format submenu or a "Copy as…" action with format options in the token context menu (TokenTreeNode.tsx context menu, App.tsx clipboard handlers ~L2781-2788)

- [x] [HIGH] Operation-log rollback is not transactional — if `executeSteps()` throws during structural rollback (operation-log.ts:299), the subsequent token snapshot capture (line 303) runs against partially-modified state, recording an inconsistent `currentSnapshot` for the rollback entry; a failed rollback leaves both structural state and tokens in an unpredictable half-rolled-back state with no recovery path; wrap the structural-steps + snapshot-capture + token-restore sequence in a try/catch that reverts structural steps (using the already-computed `inverseSteps`) on failure

- [~] Server services silently swallow errors in 6+ locations via console.warn-and-continue — token-store.ts:148,157 catches watcher reload errors as console.warn (stale cache served silently), generator-service.ts:468-472 catches generator execution failures and stores them in an in-memory map the UI never polls, resolver-store.ts:272-274 skips invalid resolver files during init with no caller notification, style-dict.ts:288-290 converts export failures into fake `error.txt` files instead of returning error status; consolidate around a consistent error propagation strategy (typed error return or event emission) so callers can surface failures to the user
- [x] Plugin sandbox has 3 message handlers without try-catch that can crash the entire message loop — `search-layers` (controller.ts:320), `find-peers-for-property` (controller.ts:322), and `eyedropper`/`sampleSelectionColor` (controller.ts:350) are not wrapped in try-catch unlike all other handlers; if any of these throw, the `figma.ui.onmessage` handler crashes and stops processing all subsequent messages, effectively bricking the plugin until reload
- [~] Plugin sandbox overwrites existing Figma variables and paint styles without confirmation or undo grouping — variableSync.ts:66-95 silently mutates existing variables when names collide (snapshots are captured but never surfaced to UI for review), styleSync.ts:104-116 replaces multi-paint styles with a single solid color, and selectionHandling.ts:768 applies token values to nodes in a loop where partial failures leave earlier nodes modified with no rollback; these should either preview changes before applying or use Figma's `figma.group()` API to make the entire batch undoable as one step
- [ ] Duplicate `extractApplyResult` functions and sync boilerplate across useFigmaSync.ts, useStyleSync.ts, and useVariableSync.ts — all three hooks define identical `{ count, total, failures }` extraction functions (useFigmaSync.ts:8-12, useStyleSync.ts:40-44, useVariableSync.ts:22-26) and share the same response shape; useStyleSync and useVariableSync already use `useTokenSyncBase` but useFigmaSync duplicates that base logic manually with its own state management; consolidate the shared extraction into a single module and migrate useFigmaSync to use useTokenSyncBase
- [ ] Core resolver.ts has unsafe type casts on composite token values in 6+ locations — lines 340, 367, 454, 469, 509, 528 cast token `$value` to `Record<string, unknown>` without runtime type checks; if a token has a primitive $value where an object is expected (e.g., a color token in a shadow group due to user error), the spread/property access silently produces wrong output or throws a confusing runtime error; add type guards before the casts or use a helper like `assertCompositeValue(value, expectedType, path)` that throws a clear resolution error
