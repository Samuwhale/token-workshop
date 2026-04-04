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

- [!] Manual snapshot restore has no concurrency guard and leaks journal on error — `manual-snapshot.ts:restore()` (L204-237) writes a restore journal then iterates sets, but two concurrent restore calls can interleave journal writes and corrupt state; additionally, if `tokenStore.restoreSnapshot()` throws mid-loop, the journal is left on disk and startup recovery will re-replay partially-applied sets; needs a mutex (same promise-chain pattern as TokenStore/GitSync) and a try/finally around the loop to clean up the journal on error
- [~] [HIGH] Remap bindings operation has no rollback — `remapBindings()` in selectionHandling.ts (line 589-636) mutates plugin data on Figma nodes without capturing a pre-operation snapshot; if the operation fails mid-way through a large selection, partially remapped bindings cannot be reverted; add before-snapshot capture matching the pattern used in `syncBindings()` (line 784) and `applyToSelection()` (line 173)
- [ ] Several server GET routes call async services without try/catch and will return unstructured 500 errors on failure — `GET /api/snapshots` (snapshots.ts:29), `GET /api/operations` (operations.ts), and `GET /api/tokens/:set` resolved-token path (tokens.ts:46) all await service calls with no error boundary; wrap in try/catch with `handleRouteError` matching the pattern used by all mutation routes in the same files
- [ ] Focus trapping missing in all modals — ConfirmModal, CommandPalette, PasteTokensModal, KeyboardShortcutsModal all have `role="dialog" aria-modal="true"` but no focus trap implementation; keyboard users can Tab outside dialogs into the background, and focus is not restored to the triggering element on close; add a lightweight focus-trap utility (trap Tab/Shift+Tab, auto-focus first focusable element, restore focus on unmount) and apply it to every component rendering `role="dialog"` (ConfirmModal.tsx, CommandPalette.tsx, PasteTokensModal.tsx, KeyboardShortcutsModal.tsx, PublishModals)
- [ ] Generator and resolver delete actions have no confirmation dialog — deleting a generator in GraphPanel or a resolver in ResolverPanel takes effect immediately with no ConfirmModal; generators can produce hundreds of tokens and resolvers affect alias resolution across sets, so accidental deletion is high-impact; add ConfirmModal with danger styling before executing delete, matching the pattern used for token/group deletion in TokenList.tsx
- [ ] ArrowLeft/Right do not expand/collapse groups in the token tree — shortcutRegistry.ts documents arrow-left/right for collapse/expand but the keyboard handler in TokenList.tsx only implements ArrowUp/Down for row navigation; keyboard-only users must use Cmd+Left/Right (expand/collapse all) or mouse click; implement per-node ArrowLeft (collapse if expanded, else move to parent) and ArrowRight (expand if collapsed, else move to first child) matching the WAI-ARIA TreeView keyboard interaction pattern
- [ ] No empty state in GraphPanel, ResolverPanel, or ThemeManager — when no generators, resolvers, or theme dimensions exist, these panels render blank or minimal UI with no guidance; add an EmptyState component with a description of the feature and a primary CTA to create the first item (e.g., "Create your first generator" in GraphPanel, "Add a theme dimension" in ThemeManager, "Create a resolver" in ResolverPanel)
- [ ] Multi-select mode disables Tab navigation with no visual hint — pressing M to enter select mode sets all token rows to `tabIndex={-1}` (TokenTreeNode.tsx line 1130), making them unreachable via Tab key; keyboard-only users lose standard navigation without any indicator; either keep rows tabbable in select mode (using Space to toggle selection) or show a visible mode banner explaining arrow-key navigation
- [ ] No loading indicators in GraphPanel, ResolverPanel, or TokenFlowPanel — these panels fetch data from the server on mount but show no spinner or skeleton while loading; on slow connections the user sees a blank panel with no way to distinguish "loading" from "empty"; add Spinner component matching the pattern used in ImportPanel and PublishPanel
- [ ] Inconsistent focus-visible styles across interactive elements — some inputs use `focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]` (TokenTreeNode) while others only change border color with `focus:border-[var(--color-figma-accent)]` and `outline-none`; the border-only approach is insufficient for low-vision users and fails WCAG 2.4.7; standardize all focusable elements to use the focus ring pattern
- [ ] ThemeManager dimension delete uses undo-toast instead of pre-confirmation — deleting a theme dimension takes effect immediately and shows an undo toast; dimensions can contain many options affecting token resolution across multiple sets, so accidental deletion is high-impact and time-sensitive to undo; add a ConfirmModal before execution for dimension deletion, matching the pattern used for token group deletion
- [ ] No "show theme gaps" view for missing overrides — ThemeManager shows coverage percentages but there is no way to list which specific tokens are missing in a given theme option; add a "Show missing tokens" action per theme option that displays tokens present in source sets but absent from enabled/override sets, with a bulk-create action to fill them with base values; CrossThemeComparePanel does this for single tokens but not at group/set level
- [ ] Validation issues have no "jump to token" action — the AnalyticsPanel validation list shows issue details (path, rule, message) but has no button to navigate to the offending token in the editor; users must manually switch to the Tokens tab and search for the path; add a clickable token path or "Edit" button per validation issue that calls `navigateTo('define', 'tokens')` and selects the token, matching the pattern already used by HealthPanel's "Go to generators" CTA buttons
