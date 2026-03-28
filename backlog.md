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

- [~] TokenList has no "recently edited" or "recently created" view — after creating tokens across multiple groups, there's no way to see what you just touched without remembering paths; useful during long editing sessions
- [~] PasteTokensModal doesn't validate token path segments — pasted paths with spaces, special characters, or reserved `$` prefixes pass through parsing without error and fail silently on the server
- [~] No quickstart wizard that chains token generation → semantic mapping → theme setup — EmptyState offers these as separate actions; a guided flow ("Step 1: generate primitives, Step 2: create semantics, Step 3: set up themes") would reduce the learning curve for new users
- [ ] Circular alias references are not prevented at token creation time — the server accepts `{a}` pointing to `{b}` pointing to `{a}`; only detected later by the resolver or lint rules, by which point the user may have built more tokens on top of the broken chain
- [ ] No server-side token search endpoint — the client must fetch all tokens across all sets and filter in-memory; with 1000+ tokens across 10+ sets, initial load is slow and search can't leverage indexes
