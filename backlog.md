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

- [x] handleNavigateToAlias silently does nothing when alias target is not in pathToSet — `useTokenNavigation.ts` ~L35 checks `if (pathToSet[aliasPath])` but provides no user feedback when the alias target token doesn't exist or lives in an unloaded set
- [x] Generator config steps accept arbitrary names without validating they form valid token path segments — `generator-types.ts` step name fields are plain strings with no check for spaces, slashes, or special characters that would produce invalid DTCG token paths
- [x] ImportPanel has no rollback after import — if a user imports tokens and realizes they're wrong, there's no undo; they must manually delete each imported token one by one
- [x] TokenEditor has no "save and create another" action — after saving a new token the user is dropped back to the list and must re-navigate to create the next one, breaking flow when adding a batch of related tokens
- [x] TokenEditor path field has no real-time duplicate detection — creating a token with a path that already exists only fails on save with a cryptic conflict error; the field should warn inline as the user types
- [x] PreviewPanel has no copy-to-clipboard for token values or CSS variables — users see a rendered preview of their tokens but can't copy the CSS variable name or resolved value without switching panels
- [x] PreviewPanel silently caps color swatches at 16 tokens — sets with more than 16 colors only show the first 16 with no indication that tokens were omitted or any way to paginate
- [x] AnalyticsPanel "deduplicate" action is destructive with no confirmation — clicking deduplicate immediately rewrites all duplicate tokens to reference the canonical one with no preview, confirmation dialog, or undo
- [x] ThemeManager has no bulk set-status assignment — toggling a set from "disabled" to "enabled" across all options in a dimension requires clicking each option individually; no "apply to all" action
- [x] ThemeManager options cannot be reordered within a dimension — options are displayed in creation order with no drag-to-reorder or move up/down; users must delete and recreate to change order
- [x] PublishPanel git diff view has no search or filter — when a push/pull involves 50+ changed files, users must scroll through the entire list with no way to filter by path or file type
- [x] BatchEditor silently skips alias tokens when scaling — applying a scale factor to dimension tokens quietly ignores any token whose value is an alias reference, with no report of which tokens were skipped or why
- [x] TokenEditor Cmd+L shortcut for alias mode is not discoverable — the keyboard shortcut exists but has no tooltip, hint text, or mention in the editor UI; users must already know about it or find it in the shortcuts modal
- [x] `evalExpr` parseUnary does not recurse — calls `parsePrimary()` instead of `parseUnary()` so double-negation expressions like `--5` fail with "Unexpected token" instead of returning 5; affects custom scale generator formulas (`eval-expr.ts` ~L73)
- [x] `substituteVars` silently replaces unknown variable names with zero — a typo like `"base * multipler"` (missing 'i') becomes `"base * 0"` producing all-zero generated tokens with no error feedback (`eval-expr.ts` ~L111)
- [x] Generator Math.pow results are not validated for Infinity/NaN — `Math.pow(ratio, exponent)` in type scale and custom scale generators can produce `Infinity` (e.g. ratio=0 with negative exponent) or `NaN` (negative ratio with fractional exponent), which flow into token values unchecked (`generator-engine.ts` ~L88, ~L245)
- [x] Theme dimension/option routes accept whitespace-only names — `!name` check passes for `"   "`, then `name.trim()` produces empty string that gets saved to `$themes.json` (`themes.ts` ~L72, ~L92, ~L149, ~L172)
- [x] `applyDiffChoices` continues to `git push` after commit failure — if the push-direction `git commit` fails (caught with `.catch(warn)`), execution continues to `git.push()` on line 141, pushing whatever was previously committed instead of the intended changes (`git-sync.ts` ~L140)
- [x] ColorPicker canvas ref uses non-null assertion without guard — `ref.current!.getBoundingClientRect()` in `getPos()` will crash if the canvas element unmounts during a pointer drag event (`ColorPicker.tsx` ~L115)
- [~] Plugin `applyVariables` silently swallows rollback errors — if the rollback itself throws, the catch block discards the error and returns `rolledBack: false` with no logging, leaving Figma in a partially applied state with no debugging information (`controller.ts` ~L229)
- [x] Opacity scale generator does not validate value range — step values above 100 produce opacity values >1.0 (e.g. 150 → 1.5) which are outside the valid CSS/Figma [0,1] range (`generator-engine.ts`)
- [~] `setHexAlpha` does not validate hex input — passing a non-hex string like `"#GGG"` silently produces garbage output; no regex check or error before slicing and concatenating alpha bytes (`color-math.ts` ~L69)
- [~] `inferType` returns CUSTOM for partial composite values — a shadow token missing `offsetX` or a border missing `width` silently infers as `CUSTOM` type instead of reporting a validation error, hiding malformed token data (`resolver.ts` ~L405)
- [~] TokenEditor create mode has no path autocomplete from existing tree structure — typing `color.` doesn't suggest existing groups like `color.brand`, `color.neutral`; users must memorize or look up the hierarchy, leading to typos and inconsistent naming
- [ ] TokenEditor create mode doesn't suggest naming based on the token type — creating a color token gives no hint to use `color.*` namespace; creating a dimension gives no hint for `spacing.*` or `sizing.*`; new users build inconsistent hierarchies
- [ ] TokenEditor alias resolution chain hops are not clickable — the chain shows `A → B → C → #FF0000` but clicking an intermediate hop doesn't navigate to that token; users must manually search for it
- [ ] TokenEditor "toggle alias mode" doesn't preserve the resolved value — switching from alias `{color.brand.500}` (resolves to `#1a73e8`) to direct mode sets value back to the pre-alias raw value instead of offering to keep the resolved `#1a73e8`
- [ ] TokenEditor mode/theme override inputs have no alias autocomplete — the per-mode value fields accept `{alias}` syntax but don't trigger the AliasAutocomplete dropdown, forcing users to type alias paths from memory
- [ ] TokenEditor typography required-field error doesn't focus the offending field — error says "Font family required" but the cursor stays wherever it was; user must manually find and click into the empty field
- [ ] TokenEditor extensions editor is a raw JSON textarea — no structured key-value editor, no syntax highlighting, no auto-formatting; easy to produce invalid JSON, especially for users unfamiliar with the extension schema
- [ ] TokenEditor has no Cmd+S / Ctrl+S keyboard shortcut for save — users must click the Save button or tab to it; the most universal save shortcut in any editor is missing
- [ ] TokenEditor dependents section doesn't refresh after saving changes — if you edit a color that 10 tokens alias, the "Used by" section still shows stale before/after previews until you close and reopen the editor
- [ ] TokenList inline create form is pinned to the bottom of the list — easy to miss on long lists; no scroll-to-form animation or visual pulse to draw attention when "New Token" is clicked
- [ ] TokenList inline create form and full TokenEditor both support creation but with different field sets — inline form has path+value+description+type; full editor has those plus aliases, modifiers, scopes, extensions, modes; there's no obvious path from "I need more fields" to "open full editor" during inline creation
- [ ] TokenList double-click to edit is undiscoverable — the only visual affordance is a pencil icon on hover; new users don't know double-click opens the editor since there's no tooltip or onboarding hint
- [ ] TokenList search doesn't support structured queries — no `type:color`, `set:brand`, `has:alias`, or `modified:today` qualifiers; all filtering requires separate dropdown controls scattered across the toolbar
- [ ] TokenList has no "recently edited" or "recently created" view — after creating tokens across multiple groups, there's no way to see what you just touched without remembering paths; useful during long editing sessions
- [ ] TokenList hover action buttons (edit, copy, apply) cause subtle layout shift — buttons fade in on hover but take up space, pushing the value column slightly; distracting when scanning a long list
- [ ] BatchEditor move-to-set operation has no preview — unlike rename and scale which show before/after for 3 items, move shows no preview of destination paths or conflict detection before executing
- [ ] BatchEditor has no progress indicator for large operations — processing 500+ tokens shows no progress bar or count; the UI appears frozen until the operation completes
- [ ] BatchEditor type conversion doesn't validate value compatibility — changing tokens from `dimension` to `color` type proceeds without checking if values like `16px` are valid colors; produces invalid tokens silently
- [ ] PasteTokensModal doesn't validate token path segments — pasted paths with spaces, special characters, or reserved `$` prefixes pass through parsing without error and fail silently on the server
- [ ] PasteTokensModal creates tokens one-at-a-time via individual POST requests — importing 200 tokens makes 200 sequential HTTP calls; no batch endpoint usage despite `/api/tokens/:set/batch` existing
- [ ] PasteTokensModal has no progress bar during import — pasting 100+ tokens shows no indication of how many have been processed; the UI appears stuck until all requests complete
- [ ] No quickstart wizard that chains token generation → semantic mapping → theme setup — EmptyState offers these as separate actions; a guided flow ("Step 1: generate primitives, Step 2: create semantics, Step 3: set up themes") would reduce the learning curve for new users
- [ ] Circular alias references are not prevented at token creation time — the server accepts `{a}` pointing to `{b}` pointing to `{a}`; only detected later by the resolver or lint rules, by which point the user may have built more tokens on top of the broken chain
- [ ] No server-side token search endpoint — the client must fetch all tokens across all sets and filter in-memory; with 1000+ tokens across 10+ sets, initial load is slow and search can't leverage indexes
