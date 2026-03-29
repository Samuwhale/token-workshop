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

- [~] No "find usages" for tokens — there is no way to discover which other tokens alias a given token, which Figma variables bind to it, or which generators produce it; add a "References" section to the token editor panel showing incoming aliases, variable bindings, and generator sources so users understand the impact of changes before making them

- [~] BatchEditor has no bulk metadata operations — BatchEditor.tsx supports type change, value scaling, move, rename, and delete, but cannot bulk-set description, Figma scopes, or extensions across selected tokens; adding bulk description and scope editing would save significant manual work for teams preparing tokens for Figma variable publishing
- [~] PreviewPanel elements don't link back to token definitions — clicking a color swatch or type scale item in PreviewPanel.tsx copies the CSS variable value but doesn't offer navigation to the source token in the token list; add a "Go to token" action on preview elements so users can quickly edit the token they're previewing
- [~] ComparePanel feature is undiscoverable — the multi-token comparison view (ComparePanel.tsx) only appears when 2+ tokens are selected, with no UI hint that this capability exists; add a "Compare" button to the token context menu or batch actions toolbar so users can discover side-by-side token comparison
- [x] HistoryPanel and PublishPanel duplicate Section component, formatRelativeTime, ColorSwatch, statusColor/statusLabel/summarizeChanges helpers, and ChangeSummaryBadges — HistoryPanel.tsx L21-103 and PublishPanel.tsx L43-77 contain near-identical implementations of Section (collapsible wrapper) and formatRelativeTime (date formatting), plus HistoryPanel has statusColor, statusLabel, summarizeChanges, formatTokenValue, ColorSwatch, ChangeSummaryBadges that are also used/duplicated in PublishPanel's SyncDiffSummary and GitPreviewModal; extract these into a shared UI utility module (e.g., `shared/changeHelpers.tsx`) to eliminate ~150 lines of duplication
- [~] 95 bare `catch {}` blocks across 33 UI files silently swallow errors — TokenList.tsx alone has 14 empty catch blocks (localStorage reads, API calls, JSON parsing); hooks like useGitConflicts.ts L47, useGitStatus.ts L58, useLintConfig.ts (3 instances), and useSetTabs.ts (2 instances) catch and discard errors with no logging or user feedback; audit all 95 `catch {}` occurrences and add at minimum console.warn for debugging, and toast/inline error state for user-facing operations like API calls and sync actions
- [ ] useVariableSync and useStyleSync share ~80% identical sync logic — both hooks implement the same pattern: fetch flat tokens, build local/figma maps, compute diff rows, filter push/pull, execute batch sync with progress tracking, and handle errors; the core diff-compute and batch-execute logic (~150 lines each) is nearly identical between useVariableSync.ts L77-183 and useStyleSync.ts L96-207; extract a shared `useTokenSyncBase` hook or utility that handles diff computation, push/pull separation, and progress tracking, with type-specific callbacks for the actual Figma API calls
