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

- [x] `setHexAlpha` does not validate hex input — passing a non-hex string like `"#GGG"` silently produces garbage output; no regex check or error before slicing and concatenating alpha bytes (`color-math.ts` ~L69)
- [x] `inferType` returns CUSTOM for partial composite values — a shadow token missing `offsetX` or a border missing `width` silently infers as `CUSTOM` type instead of reporting a validation error, hiding malformed token data (`resolver.ts` ~L405)
- [x] TokenEditor create mode has no path autocomplete from existing tree structure — typing `color.` doesn't suggest existing groups like `color.brand`, `color.neutral`; users must memorize or look up the hierarchy, leading to typos and inconsistent naming
- [x] TokenEditor create mode doesn't suggest naming based on the token type — creating a color token gives no hint to use `color.*` namespace; creating a dimension gives no hint for `spacing.*` or `sizing.*`; new users build inconsistent hierarchies
- [x] TokenEditor alias resolution chain hops are not clickable — the chain shows `A → B → C → #FF0000` but clicking an intermediate hop doesn't navigate to that token; users must manually search for it
- [x] TokenEditor "toggle alias mode" doesn't preserve the resolved value — switching from alias `{color.brand.500}` (resolves to `#1a73e8`) to direct mode sets value back to the pre-alias raw value instead of offering to keep the resolved `#1a73e8`
- [x] TokenEditor mode/theme override inputs have no alias autocomplete — the per-mode value fields accept `{alias}` syntax but don't trigger the AliasAutocomplete dropdown, forcing users to type alias paths from memory
- [x] TokenEditor typography required-field error doesn't focus the offending field — error says "Font family required" but the cursor stays wherever it was; user must manually find and click into the empty field
- [x] TokenEditor extensions editor is a raw JSON textarea — no structured key-value editor, no syntax highlighting, no auto-formatting; easy to produce invalid JSON, especially for users unfamiliar with the extension schema
- [x] TokenEditor has no Cmd+S / Ctrl+S keyboard shortcut for save — users must click the Save button or tab to it; the most universal save shortcut in any editor is missing
- [x] TokenEditor dependents section doesn't refresh after saving changes — if you edit a color that 10 tokens alias, the "Used by" section still shows stale before/after previews until you close and reopen the editor
- [x] TokenList inline create form is pinned to the bottom of the list — easy to miss on long lists; no scroll-to-form animation or visual pulse to draw attention when "New Token" is clicked
- [x] TokenList inline create form and full TokenEditor both support creation but with different field sets — inline form has path+value+description+type; full editor has those plus aliases, modifiers, scopes, extensions, modes; there's no obvious path from "I need more fields" to "open full editor" during inline creation
- [x] TokenList double-click to edit is undiscoverable — the only visual affordance is a pencil icon on hover; new users don't know double-click opens the editor since there's no tooltip or onboarding hint
- [x] TokenList search doesn't support structured queries — no `type:color`, `set:brand`, `has:alias`, or `modified:today` qualifiers; all filtering requires separate dropdown controls scattered across the toolbar
- [~] TokenList has no "recently edited" or "recently created" view — after creating tokens across multiple groups, there's no way to see what you just touched without remembering paths; useful during long editing sessions
- [x] TokenList hover action buttons (edit, copy, apply) cause subtle layout shift — buttons fade in on hover but take up space, pushing the value column slightly; distracting when scanning a long list
- [x] BatchEditor move-to-set operation has no preview — unlike rename and scale which show before/after for 3 items, move shows no preview of destination paths or conflict detection before executing
- [x] BatchEditor has no progress indicator for large operations — processing 500+ tokens shows no progress bar or count; the UI appears frozen until the operation completes
- [x] BatchEditor type conversion doesn't validate value compatibility — changing tokens from `dimension` to `color` type proceeds without checking if values like `16px` are valid colors; produces invalid tokens silently
- [~] PasteTokensModal doesn't validate token path segments — pasted paths with spaces, special characters, or reserved `$` prefixes pass through parsing without error and fail silently on the server
- [x] PasteTokensModal creates tokens one-at-a-time via individual POST requests — importing 200 tokens makes 200 sequential HTTP calls; no batch endpoint usage despite `/api/tokens/:set/batch` existing
- [~] PasteTokensModal has no progress bar during import — pasting 100+ tokens shows no indication of how many have been processed; the UI appears stuck until all requests complete
- [~] No quickstart wizard that chains token generation → semantic mapping → theme setup — EmptyState offers these as separate actions; a guided flow ("Step 1: generate primitives, Step 2: create semantics, Step 3: set up themes") would reduce the learning curve for new users
- [ ] Circular alias references are not prevented at token creation time — the server accepts `{a}` pointing to `{b}` pointing to `{a}`; only detected later by the resolver or lint rules, by which point the user may have built more tokens on top of the broken chain
- [ ] No server-side token search endpoint — the client must fetch all tokens across all sets and filter in-memory; with 1000+ tokens across 10+ sets, initial load is slow and search can't leverage indexes
