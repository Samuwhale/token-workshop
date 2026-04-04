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

- [~] Generalize variable/style/scope sync into a parameterized abstraction — useFigmaSync.ts declares multiple useState hooks tripling the same (pending/applying/progress/error) pattern for variables, styles, and scopes; PublishPanel.tsx duplicates near-identical builder functions for var vs style diff rows (buildVarFigmaMap ↔ buildStyleFigmaMap, buildVarLocalOnlyRow ↔ buildStyleLocalOnlyRow, etc., differing only in field names); consolidating into parameterized factories and a single state-per-flow record type would halve the sync code
- [ ] AbortError detection pattern duplicated ~70 times across hooks with inconsistent variants — `if (err instanceof Error && err.name === 'AbortError') return` appears across 33+ files; some use the unsafe `(err as Error).name === 'AbortError'` without instanceof check; extract a shared `isAbortError(err): boolean` utility and replace all call sites

### Performance

- [ ] ExportPanel live preview re-runs all format generators on every settings change without debounce — changing a single toggle synchronously rebuilds the full ZIP and all preview strings; for large token sets this causes visible jank; debounce the preview rebuild by ~250ms (ExportPanel.tsx)

### Correctness & Safety

- [ ] Manual snapshot restore has no concurrency guard — `manual-snapshot.ts:restore()` writes a restore journal then iterates sets, but two concurrent restore calls can interleave journal writes and corrupt state; needs a mutex (same promise-chain pattern as TokenStore/GitSync)
- [ ] Server resolver routes accept unvalidated request bodies and token rename routes skip path validation — POST /resolvers, POST /resolvers/from-themes, and PUT /resolvers/:name cast request.body directly to ResolverFile without validating required fields; token rename-preview endpoints (tokens.ts) check query params for truthiness but skip isValidTokenPath() validation that all other path-accepting endpoints use

### Accessibility

### Maintainability

- [ ] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click (TokenTreeNode.tsx group context menu)
