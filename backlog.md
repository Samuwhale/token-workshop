# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: anything that makes this the best plugin — from atomic fixes to full overhauls. No users yet, no backwards compat needed. -->
<!-- Completed items: see scripts/backlog/progress.txt -->
<!-- Organization: by functional area, not by screen — resilient to UI restructuring -->
<!-- Inbox: backlog-inbox.md — drained into this file by the TypeScript backlog runner -->

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

- [x] Replace the current search / filter discoverability model with a progressive filter builder that still supports power-user qualifiers, but no longer expects users to infer syntax like `type:` and `has:` from placeholder text alone
- [x] [HIGH] Make `/api/data` a real clean-slate reset in `packages/server/src/routes/sets.ts` and `packages/server/src/services/token-store.ts` — the current wipe only deletes token-set files and `$themes.json`, so generators, resolvers, operation history, and manual snapshots survive and keep pointing at deleted sets.
- [x] [HIGH] Make theme-dimension duplication atomic in `packages/figma-plugin/src/ui/hooks/useThemeDimensionsCrud.ts` and `packages/server/src/routes/themes.ts`, because the current create-dimension-then-copy-options loop can leave a half-copied axis behind if any follow-up option write fails.
- [x] [HIGH] Make set metadata edits rollbackable and visible in `packages/server/src/routes/sets.ts`, `packages/server/src/services/operation-log.ts`, and `packages/figma-plugin/src/ui/components/HistoryPanel.tsx`, because changing a set's Figma collection or mode mapping currently has no recovery path even though it can silently redirect later publish operations.
- [ ] [HIGH] Add dependency-aware preflight to the set delete / merge / split flows in `packages/figma-plugin/src/ui/components/SetSwitcher.tsx`, `packages/figma-plugin/src/ui/hooks/useSetMergeSplit.ts`, and `packages/server/src/routes/sets.ts` so users can see affected theme options, resolver refs, Figma collection metadata, and generated token ownership before a structural set change runs.
- [ ] [HIGH] Make manual snapshot restore in `packages/figma-plugin/src/ui/components/HistoryPanel.tsx`, `packages/server/src/routes/snapshots.ts`, and `packages/server/src/services/manual-snapshot.ts` a true workspace restore, because the current flow can leave sets created after the snapshot behind even though the UI frames restore as returning to a saved checkpoint.
- [ ] [HIGH] Replace the slug-only save preview in `packages/figma-plugin/src/ui/hooks/useFigmaVariables.ts` with per-destination mapping and merge choices, because the current flow can only create or overwrite whole sets and gives no diff, skip, or append path before writing Figma variables into an existing token library.
- [ ] Rework token creation entry points so “new token”, “new group”, quick generators, inline creation, and manual start flows all feel like one product model instead of several unrelated creation patterns
- [ ] Define a cleaner split between browsing, previewing, and editing tokens so users are not forced to interpret drawers, preview splits, inline popovers, and modal editors as separate editing paradigms

---

## Theme Management

### Bugs

### QoL

### UX

- [ ] Redesign the set-role assignment UI so source, override, and excluded states are obvious at a glance and can be edited without scanning dense toggle rows and helper text
- [ ] Improve theme option navigation for multi-axis systems by making the current focus, option context, and unresolved gaps visible without forcing users to parse chips, badges, and side controls scattered across the page
- [ ] Create a clearer path from theme gaps to fixes: when coverage or missing overrides are detected, the UI should explain what is missing, what set will be affected, and the safest next action from that exact context

---

## Sync

### Bugs

### QoL

### UX

- [ ] Rework the Figma Variables and Figma Styles compare/apply flow so “compare”, “review differences”, and “apply” form one guided sequence rather than several accordions and banners that the user must mentally stitch together
- [ ] Redesign Export as a dedicated handoff surface with a narrower control set, clearer preset behavior, and more obvious output expectations, rather than an advanced sub-view bolted onto the sync workspace
- [ ] Write `docs/redesign/repo-handoff-decision.md` to decide whether the Git-based handoff workflow remains inside the plugin or moves out of the primary UX, documenting the target user, rationale, and chosen product direction
- [ ] If the repo handoff workflow stays in the plugin, collapse it behind a clearly advanced expert-only entry point with its own framing, success states, and no presence in the default designer publishing flow

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

- [ ] Turn audit and validation signals into actionable product feedback instead of raw counts and badges: each issue type should explain why it matters, where it comes from, and how to fix it from the relevant workflow
- [ ] Define a shared pattern for warnings, lint results, stale state, and informational notices so the app stops mixing neutral pills, danger pills, banners, and inline warnings without a clear severity hierarchy

---

## Selection Inspector & Property Binding

### Bugs

### QoL

### UX

- [ ] Rework the suggestion model so the “Suggested” section is easier to trust and scan: explain why a token is suggested, group the best matches, and reduce the current long undifferentiated action list
- [ ] Simplify advanced tools inside Apply by consolidating layer search, remap, extract, selection sync, deep inspect, and filtering into one secondary tools surface with clearer status and fewer simultaneous toggles
- [ ] Define how Apply should respond as the canvas selection changes, including empty state, multi-layer mixed state, loading state, successful binding feedback, and when to surface sync status versus hide it

---

## Import

### Bugs

### QoL

### UX

- [ ] Redesign the post-import handoff so the user always lands in a sensible next step with a summary of what was created, what needs review, and whether they should go to Tokens, Themes, or Sync next
- [ ] Clarify drag-and-drop import behavior with visible supported formats, drop affordances, validation feedback, and conflict resolution patterns that do not feel like a hidden expert feature

---

## Token Generation & Graph Editor

### Bugs

### UX

- [ ] Reframe generators as a supporting creation tool inside the Tokens workflow instead of a parallel product area; define when generators deserve a full editor, when quick-start templates are enough, and how generated groups communicate their status inline
- [ ] Simplify generator discovery, naming, and editing so users can understand what a generator owns, what will change on save, and how to get back to the generated tokens without using the graph or command palette as a workaround

---

## Token Editor

### Bugs

### QoL

- [ ] Redesign the token editor so it feels like one consistent editor across token types, with shared header structure, clearer field grouping, and better distinction between always-needed fields versus advanced metadata
- [ ] Define when token editing should happen inline, in a side panel, or in a modal drawer so the app stops mixing editing surfaces in ways that make navigation and unsaved-change behavior harder to understand

---

## Settings & Data Management

### Bugs

### QoL

### UX

- [ ] Rework connection settings so server URL management, connection testing, retry behavior, and setup guidance live in one coherent place instead of being split between the top banner, onboarding, and the settings panel
- [ ] Define a better recovery / data management UX for destructive actions like clearing all data, importing settings, and restoring backups so these operations no longer sit visually adjacent to normal preferences without enough separation

---

## Cross-Cutting UX / IA

### UX

- [ ] Define the new plugin-wide visual system for density, typography, spacing, chips, badges, section headers, and CTA hierarchy, raising the baseline readability above the current 9–11px-heavy interface
- [ ] Establish one consistent empty-state system for first run, no sets, no selection, disconnected server, no results, and no issues found, so the app stops solving each zero-data case with a different visual and interaction pattern
- [ ] Establish one consistent loading / progress / success / error feedback model across imports, sync, binding, generator runs, audits, and settings changes so users can predict what is happening after every mutation
- [ ] Define plugin-specific motion and layout-change rules for drawers, accordions, split views, sticky regions, and contextual previews so the app can become calmer and easier to follow while still feeling responsive
- [ ] Audit temporary redesign docs after the new IA and major workspace flows are implemented; remove any document in `docs/redesign/` that no longer adds unique value, and update surviving references so the repo does not keep stale redesign planning artifacts around
- [ ] Promote any redesign guidance that still matters long-term into the correct permanent docs, then delete or archive the temporary planning docs such as `docs/redesign/plugin-ia-blueprint.md` and `docs/redesign/repo-handoff-decision.md` once their decisions are fully reflected in code and stable documentation

---

## Code Quality

### Redundancy & Duplication

### Performance

### Correctness & Safety

### Accessibility

### Maintainability

- [ ] Replace the current 50-entry `OperationLog` ring-buffer design in `packages/server/src/services/operation-log.ts` with separate persistence for rollback/history versus rename propagation — `PublishPanel.tsx` and `/api/operations/*` both depend on data that silently disappears once enough unrelated operations have been recorded.
- [ ] Consolidate composite-token equality on `stableStringify` across `packages/server/src/routes/operations.ts`, `packages/server/src/routes/tokens.ts`, `packages/figma-plugin/src/ui/hooks/useSetMergeSplit.ts`, `packages/figma-plugin/src/ui/components/PublishPanel.tsx`, and the token-editor hooks, because the remaining `JSON.stringify` comparisons can invent false diffs, merge conflicts, and overwrite prompts when object key order changes.
- [ ] Break the import flow into one coherent domain controller instead of the current late-bound ref cycle across `packages/figma-plugin/src/ui/components/ImportPanelContext.tsx`, `useImportSource.ts`, `useImportConflicts.ts`, `useImportApply.ts`, and `useTokensImport.ts`, where single-set and multi-set imports still duplicate flattening, conflict detection, cache resets, and success/undo plumbing.
- [ ] Move generator validation and allowed-type ownership into `packages/server/src/services/generator-service.ts` and delete the parallel contract layer in `packages/server/src/routes/generators.ts`, because route-only validation currently drifts from service rules and rollback `restore()` can reintroduce generator configs the service itself never checks.
- [ ] Split the History workspace into task-based recovery surfaces like `Undo recent edits`, `Restore snapshot`, and `Return to git commit` instead of one mixed timeline in `packages/figma-plugin/src/ui/components/HistoryPanel.tsx`, because designers currently have to learn four different recovery systems from a legend before they know which action is safe.
- [ ] Turn `packages/figma-plugin/src/ui/components/NotificationsPanel.tsx` into an actionable inbox with severity filters, deduping, sticky blockers, and deep links back to the affected token or workspace instead of a passive transcript of past toast messages.
- [ ] Add search, alias/type/scope filters, and bulk expand or collapse controls to `packages/figma-plugin/src/ui/components/FigmaVariablesPanel.tsx` so large Figma variable libraries are navigable without opening one collection and one variable row at a time.
- [ ] Merge the `Coverage`, `Suggestions`, and `Components` tabs in `packages/figma-plugin/src/ui/components/CanvasAnalysisPanel.tsx` into one canvas cleanup workflow so users can scan, inspect untokenized nodes, review suggested tokens, and apply fixes without bouncing across separate sub-panels.
- [ ] Rework `packages/figma-plugin/src/ui/components/UnusedTokensPanel.tsx` into a cleanup queue grouped by set and lifecycle with search, filters, and staged bulk actions, because the current flat list plus `Delete all` / `Deprecate all` controls does not scale to large libraries with hundreds of unused tokens.

- [ ] Add first-class folder operations to `packages/figma-plugin/src/ui/components/SetSwitcher.tsx` and `packages/server/src/routes/sets.ts` so set folders can be renamed, reordered, merged, and deleted as units instead of acting as display-only prefixes on individual set names.
- [ ] Add a dedicated collection-and-mode mapping manager in `packages/figma-plugin/src/ui/components/SetSwitcher.tsx`, `packages/figma-plugin/src/ui/hooks/useSetMetadata.ts`, and the Sync workspace so maintainers can review and edit how all sets map into Figma collections and modes without opening one per-set dialog at a time.
- [ ] Redesign duplicate-value cleanup in `packages/figma-plugin/src/ui/components/DuplicateDetectionPanel.tsx`, `packages/figma-plugin/src/ui/components/HealthPanel.tsx`, and `packages/server/src/services/lint.ts` so users can choose the canonical token per group, preview metadata differences, and batch-resolve safely instead of accepting the shortest-path token as canonical by default.
- [ ] Promote bulk token editing in `packages/figma-plugin/src/ui/components/TokenList.tsx` and `packages/figma-plugin/src/ui/components/BatchEditor.tsx` into a first-class workflow with query-backed scopes or saved selections, because the most powerful maintenance tools currently only appear after entering select mode and hand-picking rows.
- [ ] Merge dependency tracing into `packages/figma-plugin/src/ui/components/TokenEditor.tsx`, `packages/figma-plugin/src/ui/components/TokenDetailPreview.tsx`, and `packages/figma-plugin/src/ui/components/TokenFlowPanel.tsx` so alias chains and dependents can be inspected inline, with the standalone Dependencies screen kept as an advanced escape hatch instead of the default place to understand one token.
- [ ] Replace the rule-console feel of `packages/figma-plugin/src/ui/components/LintConfigPanel.tsx` and `packages/server/src/routes/lint.ts` with a guided quality-policy surface that starts from presets and uses set pickers and exception chips rather than free-text path filters and per-rule override names.