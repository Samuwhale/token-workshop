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

### Accessibility

### Maintainability

- [~] useGeneratorDialog.ts (463 lines, 20+ state vars, 21+ callbacks) and useGitSync.ts (317 lines, 17+ state vars) are oversized hooks mixing unrelated concerns — useGeneratorDialog handles config management, preview fetching with debounce/abort, existing token comparison, overwrite detection, semantic mapping, save logic, and undo; useGitSync handles status polling, conflict detection, merge resolution, diff computation, file selection, and token previews; each should be decomposed into 2-3 focused hooks to reduce re-render blast radius and make individual behaviors testable

- [~] `$extensions.tokenmanager` is typed as `Record<string, unknown>` forcing scattered `as any` casts — the `DTCGToken.$extensions` field in `packages/core/src/dtcg-types.ts` and all token interfaces in `types.ts` type extensions as `Record<string, unknown>`, so every access to `$extensions.tokenmanager.lifecycle`, `.source`, `.extends`, `.colorModifier`, `.tokenSet` etc. requires `(node.$extensions?.tokenmanager as any)?.*` casts; define a `TokenManagerExtensions` interface in core with all documented sub-fields, update `$extensions` to `{ tokenmanager?: TokenManagerExtensions } & Record<string, unknown>`, and add a typed `getTokenManagerExt(token)` helper — this eliminates the `as any` casts in `TokenTreeNode.tsx`, `ImportPanel.tsx`, `App.tsx`, and the resolver
- [~] App.tsx is a 2990-line monolith with 53 useState hooks — `packages/figma-plugin/src/ui/App.tsx` still contains five distinct state domains that should be custom hooks: (1) set-tab management (drag, context menu, overflow, new-set form: `dragSetName`, `dragOverSetName`, `tabMenuOpen`, `tabMenuPos`, `creatingSet`, `newSetName`, `newSetError`, `setTabsOverflow`); (2) modal/overlay visibility flags (8+ separate booleans: `showPasteModal`, `showScaffoldWizard`, `showGuidedSetup`, `showColorScaleGen`, `showCommandPalette`, `showKeyboardShortcuts`, `showQuickApply`, `showClearConfirm`); (3) token data loading (`allTokensFlat`, `pathToSet`, `perSetFlat`, `filteredSetCount`, `syncSnapshot`); (4) recent operations log (`recentOperations`); extracting these into domain hooks would mirror the TokenList refactor already done and make App.tsx reviewable
