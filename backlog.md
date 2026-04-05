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
- [x] [HIGH] Operation-log rollback writes $themes.json directly (writeThemesFile at operation-log.ts:294) bypassing the withThemeLock used by all theme routes (themes.ts:113) — concurrent rollback + theme edit can corrupt the themes file; readThemesFile (L232) also reads without the lock, so computeInverseSteps captures a stale snapshot if a theme mutation is in-flight
- [x] Smart type inference when creating tokens — entering a path like `color.brand.primary` should default the type dropdown to `color`, `spacing.md` to `dimension`, `font.body` to `fontFamily`; currently the type dropdown always starts at the first option regardless of path, adding an unnecessary manual step to every token creation
- [~] Batch token upsert API endpoint — there is `POST /api/tokens/:set/batch-delete` but no batch create or update; every token creation or value edit is a separate HTTP request, which causes visible latency when importing or generating dozens of tokens and makes it impossible to do atomic multi-token updates
- [ ] Token set diff/comparison view — there is no way to compare two token sets side-by-side to see which tokens exist in one but not the other, or which have different values; the existing CompareView only compares theme options, not arbitrary sets; a set diff would help users audit overrides and catch unintended divergence between foundation and semantic sets
- [ ] No variable scope editing in the publish flow — the plugin sandbox supports writing `$extensions['com.figma.scopes']` to Figma variables (variableSync.ts), and tokens can store scope metadata, but the PublishPanel UI never surfaces scope configuration; users who need variables scoped to specific properties (e.g., color variable only available for fills) must edit scopes manually in Figma after every sync
- [ ] Generator dependency graph visualization — GraphPanel shows individual generator pipeline cards but has no view of how generators relate to each other (e.g., a color ramp generator feeds a semantic alias generator which feeds a dark mode inversion generator); adding a dependency flow diagram would help users understand cascading effects before running generators
- [ ] No token search within alias fields in the editor — when editing a composite token (typography, shadow) and needing to reference another token as an alias for a sub-property, users must close the editor, search the tree, note the path, reopen the editor, and type it; an inline token search/picker within alias fields would eliminate this context switch
- [ ] Consolidate the three analysis panel scan scope selectors into a shared component — Health, Consistency, and Heatmap panels each independently implement selection/page/all-pages scope UI with separate state management; extract a shared `ScanScope` component and hook to reduce duplication and ensure consistent scope behavior
- [ ] `export-all-variables` message handler in plugin sandbox is dead code — controller.ts registers a handler for this message type but no UI component ever sends it; the export flow uses server API routes instead; remove the dead handler to reduce sandbox bundle size and avoid confusion
- [ ] No progress feedback during large ZIP export — ExportPanel builds ZIP files synchronously with no per-file progress indicator; for projects with hundreds of tokens across multiple platforms, the UI freezes with no feedback; add a progress callback to the ZIP builder or move it to a Web Worker
- [ ] Token path auto-complete should suggest sibling tokens when creating — when creating a new token under `color.brand`, PathAutocomplete only suggests existing group paths; it should also show existing sibling names at that level (e.g., `color.brand.primary`, `color.brand.secondary`) so users can see what already exists and maintain naming consistency
- [ ] Git-sync conflict marker parsing is duplicated between parseConflictMarkers (git-sync.ts:108-145) and resolveConflictContent (git-sync.ts:151-195) — both iterate lines looking for <<<<<<<, =======, >>>>>>> with identical loop structure; extract a shared parseConflictRegions iterator that yields (regionIndex, oursLines, theirsLines) and have both functions consume it
- [ ] TokenList.tsx is a 4400-line component with 86 useState/useRef calls and 40 useCallbacks — this monolithic state surface makes every change risky, causes expensive re-renders, and is the root cause of multiple stale-closure and TDZ bugs; extract domain-specific custom hooks (useTokenSearch, useTokenSelection, useTokenExpansion, useTokenVirtualScroll, useTokenContextMenu) and move their callbacks out of the orchestrator
- [ ] Git-sync applyDiffChoices (git-sync.ts:775-784) continues after partial checkout failures — if checkout fails for file N, files 1..N-1 are already checked out from remote but the function proceeds to commit and push the partial state; should either roll back successful checkouts on any failure or clearly surface which files were pulled vs skipped so the caller can decide
- [ ] Resolver-store delete (resolver-store.ts:156-169) catches all unlink errors silently including permission-denied and disk-full, then removes the resolver from memory anyway — this creates disk/memory inconsistency where the resolver appears deleted but the file persists; should only ignore ENOENT and re-throw other errors
- [ ] Operation-log rollback swallows revert failures silently (operation-log.ts:391-396) — when a rollback's structural steps fail mid-way, the catch block attempts to revert via inverseSteps but discards any error from that revert, then re-throws the original error; the caller has no way to know the system is in an inconsistent state; should log the revert failure and include it in the thrown error or response
