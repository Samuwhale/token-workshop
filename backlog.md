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

### UX

---

## Token Generation & Graph Editor

### Bugs

### UX

---

## Token Editor

### QoL

- [x] No Cmd+S / Ctrl+S to save — the editor requires clicking the save button; a keyboard shortcut is the most basic expectation
- [x] No conflict detection for concurrent edits — if a token is modified on the server while the editor is open, saving silently overwrites the server version
- [~] Circular-reference error doesn't identify the cycle — the error says "circular reference detected" but doesn't name which tokens form the loop
- [~] Type change has no impact warning — changing a token's type could break downstream references but the confirmation doesn't indicate how many dependents will be affected

---

## Settings & Data Management

### QoL

- [~] DELETE /data endpoint has no server-side confirmation gate — a single accidental API call permanently deletes all token sets and themes
- [~] SyncPanel.tsx is dead code (1167 lines) — exported but never imported; appears superseded by PublishPanel; should be removed
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
