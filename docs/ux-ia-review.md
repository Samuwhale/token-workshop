# TokenManager Figma Plugin — UX/IA Review

**Date:** 2026-04-21
**Scope:** Full audit of screens, flows, information architecture, and UX quality
**Target users:** Figma UI/UX designers, design system maintainers (primary); developers (secondary)

> **Note:** The memory at `project-ia-overhaul.md` claims Phase 2 (Library / Canvas / Sync / Export, Share eliminated, rail codes Li/Ca/Sy/Ex) shipped 2026-04-20. The code at `packages/figma-plugin/src/ui/shared/navigationTypes.ts:409-488` still has Library / Canvas / **Share** with figma-sync/export/versions sub-tabs. Phase 2 is planned, not shipped. This review is written against the shipped code.

---

## Executive Summary

The plugin is feature-rich to the point of being overwhelming. It has the functionality of a desktop application packed into a Figma plugin panel. The core authoring flow (Library) is solid, the canonical domain model (collections > modes > tokens, modes visible simultaneously) is respected throughout, and no rotten patterns from the old domain model remain.

Three structural problems block it from being excellent:

1. **Too many surfaces competing for one slot.** The Library workspace hosts ~8 contextual surfaces (editor, generator, compare, collection details, color analysis, import, health, history) that all replace each other. Opening one closes the other. This is the architectural root of many UX complaints.
2. **"Share" is the wrong umbrella name**, and Versions is a stub inside it. The workspace label doesn't match the contents.
3. **Jargon and dev-flavored surfaces leak into designer-facing areas** — "lint violations," "scopes," "coverage," dense Figma-sync form, etc.

The underlying functionality is mostly right. Reorganization, targeted consolidation, a small number of kills, and a handful of high-leverage empowerment fixes (copy-to-all-modes, inline alias resolution, rename-with-references) would elevate this from dense to delightful.

---

## Table of Contents

1. [Current Architecture](#1-current-architecture)
2. [Information Architecture Problems](#2-information-architecture-problems)
3. [Core Workflow Assessment](#3-core-workflow-assessment)
4. [Feature Bloat — Kill, Demote, Keep](#4-feature-bloat--kill-demote-keep)
5. [What's Missing](#5-whats-missing)
6. [Proposed IA Restructuring](#6-proposed-ia-restructuring)
7. [Specific UX Fixes (Quick Wins)](#7-specific-ux-fixes-quick-wins)
8. [Jargon & Naming Audit](#8-jargon--naming-audit)
9. [Code Architecture Observations](#9-code-architecture-observations)

---

## 1. Current Architecture

### Navigation Structure

The plugin uses a two-tier navigation system: three top-level workspaces in a collapsible sidebar, plus contextual surfaces that replace the main body.

| Workspace | Sub-tabs | Contextual Surfaces |
|-----------|----------|-------------------|
| **Library** | (none) | Token editor, Generated group editor, Collection details, Compare, Color analysis, Import, Health, History |
| **Canvas** | Selection inspector | (none) |
| **Share** | Figma Sync, Export, Versions | (none) |

**Secondary surfaces** (full-height overlays): Settings, Keyboard Shortcuts

**Transient overlays** (dialogs): Command Palette, Paste Tokens, Quick Apply, Collection Create, Unsaved Changes, Group Scopes, Confirm modals, Progress overlays

### Sidebar

```
Sidebar (120px expanded / 40px collapsed)
├── Library (Layers icon)
├── Canvas (Frame icon)
├── Share (Share2 icon)
│   ├── Figma Sync      ← only visible when Share is expanded
│   ├── Export
│   └── Versions
├── ─── divider ───
├── Notifications (bell)
├── Settings (gear)
├── Undo / Redo
└── Collapse toggle
```

### Library Workspace Layout

```
┌──────────────┬──────────────────────────────────┐
│ Collection   │ Token List (tree view)            │
│ Rail         │   ├── Search + toolbar            │
│              │   ├── Mode column headers         │
│ • Collection │   ├── Group headers (expandable)  │
│ • Collection │   │   ├── Token row               │
│ • Collection │   │   ├── Token row               │
│              │   │   └── ...                      │
│ [+ Create]   │   └── Stats bar                   │
│              │                                    │
│              │ ──── OR (contextual surface) ───── │
│              │                                    │
│              │ Token Editor (320px side panel)    │
│              │ Compare Panel (full takeover)      │
│              │ Health Panel (full takeover)       │
│              │ Import Panel (full takeover)       │
│              │ History Panel (full takeover)      │
│              │ etc.                               │
└──────────────┴──────────────────────────────────┘
```

Key issue: all 8 contextual surfaces share one slot. Opening one closes the other.

---

## 2. Information Architecture Problems

### The three-workspace split is close to right, but each workspace has a problem

Designers' real workflow has three phases: **define** tokens → **use** tokens → **ship** tokens. The current split reflects this. The friction is *within* each workspace, not in the number of workspaces:

**Library is overloaded.** It contains the token list *plus* ~8 contextual surfaces (compare, collection details, token editor, generated group editor, color analysis, import, health, history). These are accessed through the same slot, so opening one hides the other. A designer editing a token who wants to check health has to close the editor, losing context. Library tries to be authoring tool, import center, audit dashboard, and history viewer simultaneously. This is the single biggest IA problem.

**Canvas is thin on surfaces, not thin on importance.** It currently has just Selection Inspector plus a Coverage/Usage sub-tab. For the target user — a Figma UI designer *using* tokens in design work — Canvas is the moment of truth: selecting a layer and binding a token. Collapsing Canvas into Library (as the original Option A proposed) would bury this moment and make Library's surface-contention problem worse. **Canvas should stay a top-level workspace and gain surfaces** (e.g., quick-apply, extract-from-selection, usage drill-down), not lose its home.

**Share bundles three loosely-related concerns** under a label that describes none of them: Figma Sync (designer-critical publish), Export (developer-facing platform files), Versions (a stub that duplicates History). Ship three fixes: **rename Share → Sync**, **promote or hide Export** (it's developer-facing; it belongs in a menu or as a sibling workspace only if used often), **kill the Versions stub** and fold anything real into History inside Library.

### The sidebar is both too simple and too complex

Three top-level items with Share expanding to show sub-tabs. But Library — the most complex workspace with 8+ sub-surfaces — shows no sub-navigation at all. The complexity is hidden behind contextual surfaces that replace each other. A designer has no persistent way to jump between "token list," "health audit," and "history" without going through the Library body and clicking different toolbar actions.

### Contextual surface contention

The eight contextual surfaces fighting for one slot is the architectural root of many UX problems:

- Editor and Health can't coexist
- Import takes over the entire workspace
- Compare replaces the token list
- No breadcrumb or navigation history within Library
- The designer loses spatial context when switching between surfaces

---

## 3. Core Workflow Assessment

### Token Authoring (Library) — Good, but cluttered

The collection rail + token tree + side-panel editor is a strong pattern. The tree view with type grouping, search, starred tokens, and virtual scrolling are all well-implemented. Mode columns showing all modes simultaneously is exactly right per the Figma mental model.

**Issues:**
- The toolbar has accumulated too many concerns: search, view mode, sort, filter, batch toggle, issues filter, preview split — 7+ controls competing for space in a Figma plugin panel (typically 300-400px wide)
- The contextual surface pattern means constant context-switching
- Batch operations, find-and-replace, table create, and JSON editor are power-user features that most designers will never use but add cognitive load

### Token Creation — Good

Create mode as a full takeover with type selection, path autocomplete, namespace suggestions, and "save & create another" is well thought out. The mode value editor for multi-mode tokens showing all modes inline is correct.

### Generators — Impressive but complex

11 generator types is a lot. The breakdown:

| Generator | Designer value | Assessment |
|-----------|---------------|------------|
| Color Ramp | High | Core feature, well-executed |
| Type Scale | High | Core feature for typography systems |
| Spacing Scale | High | Essential for layout consistency |
| Opacity Scale | Medium | Useful, simple enough |
| Shadow Scale | Medium | Useful for elevation systems |
| Border Radius Scale | Low | Narrow use case |
| Z-Index Scale | None for designers | Pure developer concern |
| Custom Scale | Low | Too abstract for designers |
| Dark Mode Inversion | Low | Niche; explicit mode authoring is better |

The generated group editor is a full-takeover experience with many steps, which is appropriate for the complexity but means it's a big commitment to start.

### Canvas Inspection — Functional but isolated

The Selection Inspector with property rows, suggested tokens, binding, and unbinding works well. But it's stranded on its own workspace tab. A designer working in the Library who selects a Figma layer shouldn't have to navigate to a different workspace to see what's bound. The canvas analysis/heatmap is a nice feature but is rarely needed.

### Figma Sync (Publish) — Overly complex

The publish panel has preflight checks, readiness validation, diff summaries, variable comparison, style comparison, resolver-based publishing, orphan cleanup, and rollback. This is the most technically sophisticated part of the plugin, and it shows — it's dense and hard to parse. A designer who just wants to push their tokens to Figma variables shouldn't need to understand "resolver files," "publish routing," "variable comparison modes," or "orphan cleanup."

**Missing:** A smart-default happy path. Not a "single button that hides everything" — scope/mode-mapping conflicts genuinely require user input and silently guessing will cause data loss. The right shape is:

- **Default view:** plugin auto-resolves what it can, shows a one-line summary ("3 new, 2 updated, 1 conflict"), and only surfaces the *genuine* conflicts.
- **Advanced toggle:** full preflight/diff/resolver view for power users who want fine-grained control.

Current experience surfaces everything always, which is the inverse of progressive disclosure.

### Export — Appropriate

Platform selection, format config, preview, download. Well-scoped for its audience (developers). No major issues.

### Health/Audit — Feature-rich but buried

The health dashboard with 7 views (dashboard, issues, unused, deprecated, consolidate, duplicates, ignored) is comprehensive. But it's buried as one of 8 contextual surfaces inside Library, with no persistent access. A designer who cares about token quality has to remember to manually open this panel. There's no ambient signal in the main token list that says "you have 12 unused tokens."

### History — Adequate

Git commits + snapshots + rollback. Fine for what it is, but serves developers more than designers.

---

## 4. Feature Bloat — Kill, Demote, Keep

Killing a feature is cheap to propose and expensive to get wrong. The test isn't "does this feel developer-y?" — it's "would removing it break a real workflow for the primary user?" Several items in the previous draft of this review failed that test.

### Kill candidates (defensible)

| Feature | Location | Reason |
|---------|----------|--------|
| **JSON Editor view** | `hooks/useJsonEditor.ts` | Developers have their own editors. A JSON editing mode inside a Figma plugin is a novelty for designers and a strictly worse experience for developers. Remove. |
| **Table Create form** | `TableCreateForm.tsx`, `hooks/useTableCreate.ts` | Bulk CSV-like token creation doesn't match how designers create tokens. If needed, fold the underlying logic into Import. |
| **Versions sub-tab (Share)** | `navigationTypes.ts:472-481` | A stub with no real functionality. History contextual panel already covers this. |

### Demote candidates

Keep the feature, move it to secondary access so it doesn't clutter primary surfaces.

| Feature | Current Access | Suggested Access |
|---------|---------------|-----------------|
| **Custom Scale generator** | Generator picker (prominent) | Behind "More generators" — niche but legitimate for advanced users. |
| **Compare panel** | Toolbar action (contextual surface) | Token context menu → "Compare with…" |
| **Batch Editor** | Toolbar toggle | Multi-select context menu — becomes available when 2+ tokens selected, invisible otherwise. |
| **Find & Replace** | Dedicated hook + entry | Rename to **"Rename & update references"** and surface as a context-menu action on tokens. This feature is the answer to a real problem (renaming a token breaks `{path}` aliases); the previous draft proposed killing it while simultaneously asking for the same capability under a different name. Keep the capability, rename the UX. |
| **Window size toggle** | Utility menu action | Setting in Settings panel. |
| **Keyboard Shortcuts panel** | Standalone secondary surface | Section within Settings. |

### Keep — reversals from the previous draft

| Feature | Why it stays |
|---------|--------------|
| **Z-Index Scale generator** | Designers *do* think about stacking (modal over dropdown over tooltip). Low-maintenance generator with clear design-system value. Demote to "More generators" if the picker feels crowded, but don't kill. |
| **Dark Mode Inversion generator** | This *is* explicit mode authoring — automated. It saves real work. Niche ≠ worthless. |
| **Color Analysis panel** | Contrast-in-editor ≠ whole-palette analysis (lightness scale, gamut coverage, palette coherence). Different tool. Verify with usage data before killing; for now, keep and make triggerable from a color token's context menu. |
| **Notifications panel** | The same review asks for "ambient health indicators" in §5. Ambient signals need a backing model — either notifications or something functionally equivalent. Don't kill the infrastructure that powers the feature you're asking for. Simplify (drop the bell icon if noisy), but keep the state. |

### Consolidate (not listed previously)

| Feature | Today | After |
|---------|-------|-------|
| **Health dashboard views** | 5 separate views (Issues, Unused, Deprecated, Duplicates, Consolidation) | One filterable list with chips. Saves code duplication and cognitive load. |
| **Export presets UI** | Manual save/load of preset configs | Auto-remember last export config. Expose "Save as preset" only as overflow. Most users re-export the same thing. |
| **Git state** | Split between `PublishPanel` (sync tab) and `HistoryPanel` (Library contextual) | Single timeline in History (operations + git commits interleaved). |

---

## 5. What's Missing

### Empowerment gaps (every designer hits these in week one)

Ordered by leverage — these are the fixes most likely to move the UX score in a single release.

1. **Copy value to all modes.** Editing a multi-mode token, the designer sets a value in mode A and wants B, C, D to match. Today: edit each mode individually. Fix: one button in `ModeValueEditor`.
2. **Inline alias resolution preview.** Hovering `{color.primary}` in the token list should reveal the resolved swatch or value. Today the user has to click into the editor to trace it. Critical for multi-level alias chains.
3. **Rename with references.** Renaming `color.primary` → `color.primary-blue` silently breaks every `{color.primary}` alias. Today's workaround is Find & Replace (buried, code-flavored). Fix: surface as "Rename & update references" on the token context menu — single action, preview of affected tokens, confirm.
4. **"Create from this token."** Most new tokens are shaped like existing tokens. Duplicate-and-edit from the list context menu would eliminate repeated type+mode setup.
5. **Reorder within the tree.** Tree order is path-alphabetical only. Designers care about semantic order (primary > secondary > tertiary), not alphabetical.
6. **Multi-select + bulk actions in the token list.** Retype, move to group, delete. Today bulk work goes through Find & Replace or Batch Editor — both indirect.

### Ambient health indicators in the token list

The token list should show inline indicators for issues. Lint badges exist but the Health panel's insights ("unused," "deprecated," "consolidate") don't surface in the main list. A small "3 issues" pill on the collection rail with click-to-expand, plus badges on affected tokens, would eliminate the need to explicitly open Health to discover problems.

### Selection-aware context in Library

When a designer selects a Figma layer, Library should subtly indicate which tokens are bound to that selection without a workspace switch. A small "Selection" section at the top of the token list, or a highlight on bound tokens, would bridge Library and Canvas without forcing navigation.

### Quick publish from Library

A designer who just changed a token should be able to sync it to Figma without navigating to a separate workspace. Right-click a collection in the rail → "Sync to Figma." Right-click a group → "Sync group." The most common output action should be one click away from the authoring surface.

### Smart-default Figma Sync (not "just push it")

Per §3: auto-resolve everything resolvable, surface only genuine conflicts in the default view, hide the full preflight behind an Advanced toggle. One-button-that-hides-everything is wrong — conflicts can lose data if silently guessed.

### Visibility for generator "keep updated" mode

Generators can be set to auto-update when their source changes. Today this is silent — the user doesn't know which generators will rerun or have rerun. Either make the behavior default and visible (stale badge + "regenerate" button on affected groups), or remove the toggle. The current invisible opt-in is the worst of both worlds.

### Onboarding beyond WelcomePrompt

The WelcomePrompt handles first-run, but there's no progressive feature introduction. A designer opening this plugin for the first time faces a dense interface with no guidance about what to do after setup. Contextual hints for first-time interactions with key features (generators, modes, publishing) would pay off quickly.

---

## 6. Proposed IA Restructuring

### Recommended: Three workspaces, sub-nav inside Library, Sync promoted, Export demoted

```
Sidebar
├── Library
│   ├── Tokens      (default — tree view)
│   ├── Health
│   └── History
├── Canvas
│   ├── Selection   (default)
│   └── Usage       (was "Coverage")
├── Sync            (was "Share > Figma Sync")
├── ─── divider ───
├── Settings
├── Undo / Redo
└── Collapse toggle
```

**Library** becomes three persistent sub-tabs instead of eight colliding contextual surfaces:

- **Tokens** — token tree, editor (persistent side panel), collection rail, generators, compare, collection details. Compare and collection-details remain contextual surfaces but stop competing with Health and History.
- **Health** — audit dashboard consolidated from today's five views into one filterable list (see §4 "Consolidate"). First-class citizen, not buried behind a toolbar button.
- **History** — undo log + manual checkpoints + git commits, interleaved into one timeline. Kills the split between `PublishPanel` git state and today's `HistoryPanel`.

**Canvas** stays a top-level workspace. The previous recommendation to collapse Canvas into Library was wrong: Canvas is the moment of truth for the primary user (designers *using* tokens in design work). Rename the "Coverage" sub-tab to **Usage** — same heatmap, less jargon. Canvas can gain surfaces over time (quick-apply, extract-from-selection); the workspace is right-sized for its importance, not under-sized.

**Sync** (renamed from Share) becomes a single-view workspace focused on pushing tokens to Figma variables and styles. Ship the smart-default progressive-disclosure experience (§5).

**Export** is demoted out of the sidebar. It's developer-facing and used occasionally — perfect fit for the command palette (⌘K → "Export") or a Tools-menu entry. If telemetry later shows heavy use, promote back to a top-level workspace.

**Versions** is deleted (stub).

**Everything else:**
- **Import** → stays a Library contextual surface, invoked from the create menu.
- **Color Analysis** → context-menu action on color tokens; no longer a full takeover.
- **Notifications** → kept (simplified): the same model that powers ambient health indicators.
- **Compare** → context menu action ("Compare with…") plus contextual surface when chosen.
- **Keyboard Shortcuts** → section within Settings.

**Why this beats the two-workspace alternative previously proposed:**
- Canvas stays first-class for designers who use tokens in design work.
- Library's contextual-surface contention drops from 8 surfaces to ~3 (Tokens/Health/History persistent, Editor persistent side panel, Import/Compare/Collection-details as occasional contextual).
- Persistent sub-nav gives Health and History discoverable homes without elevating them to top-level workspaces they don't deserve.
- Sync gets a clear name and a focused surface instead of being buried one click deep in a vague "Share" umbrella.

---

## 7. Specific UX Fixes (Quick Wins)

These can be implemented independently of the IA restructuring.

### 7.1 Rename "Share" to "Sync"

"Share" is vague — it could mean sharing a link, collaborating, or exporting. "Sync" tells the designer exactly what this workspace does: push tokens into Figma variables/styles. (Don't rename to "Publish" — in design-tool vocabulary "Publish" is adjacent to library publishing; "Sync" is cleaner and more accurate to the actual behavior.)

### 7.2 Collapse the toolbar

The token list toolbar should have three visible controls:
1. **Search** (always visible)
2. **Create Token** button
3. **"..." overflow menu** for everything else (sort, filter, view mode, batch, issues toggle, preview split)

This reduces visual noise from 7+ controls to 3 while keeping all functionality accessible.

### 7.3 Make the token editor a persistent side panel

The editor should coexist with the token list (as it partially does at 320px), but it shouldn't prevent access to other tools. Currently, if the editor is open as a side panel and the designer opens Health, the editor closes. The editor in "edit mode" should persist as a pinned side panel that stays open across surface switches.

The "full takeover" for create mode is fine and should stay as-is.

### 7.4 Add "Sync to Figma" in the token list

Per-collection or per-group sync from the context menu:
- Right-click collection in rail → "Sync to Figma"
- Right-click group header in tree → "Sync group to Figma"

Don't make designers navigate to a separate workspace for the most common output action.

### 7.5 Simplify the generator picker

Show 4 generators prominently:
1. Color Scale
2. Type Scale
3. Spacing Scale
4. Opacity Scale

The rest go behind "More generators" for power users. This matches the 80/20 rule — most designers will only use these four.

### 7.6 Remove the Notifications panel

Kill the bell icon and notification history panel. Toasts + undo/redo provide sufficient feedback. This removes:
- A UI element from the sidebar
- A state management concern (`notificationHistory`, `toggleNotifications`, `closeNotifications`)
- A component (`NotificationsPanel.tsx`)
- Cognitive overhead (designers don't need to check a notification inbox in a design tool)

### 7.7 Make Health ambient

Show a small indicator on the collection rail or token list header:
- "3 issues" pill with click-to-expand
- Inline badges on tokens that have warnings
- A subtle banner at the top of the token list when critical issues exist

Don't require the designer to explicitly open a Health panel to discover problems.

### 7.8 Inline alias resolution preview

Hovering `{color.primary}` in the token list should show the resolved swatch (colors) or value (dimensions, typography) in a small tooltip. For deep alias chains, show each hop. Eliminates the "click in, check, close" cycle designers do dozens of times a session.

### 7.9 "Copy to all modes" button in the mode value editor

One button next to the first mode's input. Applies the current value to every other mode. Matches how designers actually work ("I want blue in all three modes except dark").

### 7.10 Fix jargon in designer-facing surfaces

See §8 for the full audit. Quick wins:
- **"Lint violations"** → **"Issues"** (HealthPanel).
- **"Scopes"** (generator wizard) → **"Conditions"** or **"Applies to."**
- **"Coverage"** (Canvas sub-tab) → **"Usage."**
- **"Extensions"** (TokenEditor section) → **"Advanced"** (same content, less jargon).

### 7.11 Collapse the filter chip stack when >2 active

At plugin-window widths the chip row crowds the search input once four or more filters are active. Collapse to a single "4 filters active" chip with a dropdown to inspect/clear individually.

---

## 8. Jargon & Naming Audit

Developer features live in mostly good homes (Health panel, History panel, Sync, Export), but developer *vocabulary* leaks into designer-facing surfaces. Each rename is cheap and high-impact.

| Today | Change to | Where | Why |
|-------|-----------|-------|-----|
| **Share** (workspace) | **Sync** | Sidebar, top tab | Share implies collaboration/URLs; the actual action is pushing tokens to Figma. |
| **Coverage** (Canvas sub-tab) | **Usage** | Canvas workspace | Designers say "where am I using this?"; "coverage" is a developer/QA term. |
| **Lint violations** | **Issues** | HealthPanel | "Lint" is code-editor vocabulary. |
| **Scopes** | **Conditions** or **Applies to** | Generator wizard, GroupScopesDialog | "Scopes" has both a developer meaning (variable scope) and a Figma meaning (scoping rules); both are wrong for the generator context. |
| **Extensions** | **Advanced** | TokenEditor collapsible section | DTCG $extensions is implementation; the section holds advanced metadata. Label the affordance by purpose, not schema. |
| **Resolver files**, **publish routing**, **orphan cleanup** | Hide behind Advanced toggle | PublishPanel | These are legitimate concepts for power users. Don't rename — just don't surface them in the default view. |

Keep these as-is:
- **Alias** — Figma-native, designers recognize it.
- **Modes** — matches Figma's own Variables terminology exactly.
- **Collections** — DTCG-native; designers adapt quickly.
- **Tokens** — the product name; no better alternative.

---

## 9. Code Architecture Observations

These observations are relevant for implementing the above changes:

### Large orchestrator files

- **App.tsx** (1,955 lines) and **PanelRouter.tsx** (1,595 lines) are too large. They handle prop drilling, state management, event handling, and layout. The `WorkspaceControllerContext` helps but these files are the bottleneck for any IA change.
- Any restructuring should include breaking these files down further.

### High component count

- **211 component files + 91 hooks** is significant surface area.
- Some decomposition is excellent (health/ has 8 focused files).
- Some is fragmented (the token editor touches 7+ files in `token-editor/` plus `TokenEditor.tsx` plus 8 `hooks/useTokenEditor*.ts` files).

### Contextual surface pattern mirrors UX problem

The fact that the code needs `switchContextualSurface()` with a union type of 8 values is a code smell that mirrors the UX problem. Eight things competing for one slot is complicated in both code and UI. Reducing the number of contextual surfaces (by killing some and making others persistent) simplifies both.

### State management sprawl

The plugin has 7 context providers, each with multiple sub-contexts. The `WorkspaceControllerContext` alone has 6 subdivisions (`shell`, `editor`, `tokens`, `apply`, `sync`, `collectionStructure`). This is a consequence of the feature density — simplifying the feature set would naturally reduce state management complexity.

---

## Appendix: Current Feature Inventory

For reference, here is every feature the plugin currently offers:

### Token Authoring
- 24 DTCG token types with dedicated value editors
- Tree view with type grouping, expand/collapse
- Flat view (linear list)
- Search with fuzzy matching and qualifier syntax
- Sort by name, type, usage, recent modification
- Filter by type, collection, generation status
- Starred/pinned tokens
- Recently touched tokens
- Virtual scrolling for large token sets
- Inline rename, move, delete
- Drag-drop reordering
- Right-click context menu
- Lint badges and inline warnings
- Mode value previews (all modes visible simultaneously)
- Preview split (token list + detail preview)
- Path autocomplete with namespace suggestions
- "Save & create another" flow
- Draft auto-save in editor

### Collections & Modes
- Create, rename, duplicate, delete collections
- Collection descriptions
- Add/remove/configure modes
- Merge collections (with conflict resolution)
- Split collections (by group prefix)

### Generators (11 types)
- Color Ramp, Type Scale, Spacing Scale, Opacity Scale
- Shadow Scale, Border Radius Scale, Z-Index Scale
- Custom Scale, Dark Mode Inversion
- Semantic mapping layer
- Auto-cascading (source change triggers regeneration)
- Per-step overrides and detachment

### Import
- Figma variables, Figma styles
- JSON, CSS/SCSS, Tailwind config, Token Studio
- Collection mapping, conflict resolution, result summary

### Export
- CSS, SCSS, JSON, TypeScript, Tailwind
- iOS Swift, Android Kotlin, Dart
- Export presets, diff-only export, ZIP bundling

### Figma Sync (Publish)
- Variable sync with mode mapping
- Style sync
- Preflight readiness checks
- Diff summary
- Resolver-based publishing
- Variable group scoping
- Orphan cleanup
- Rollback support

### Canvas
- Selection inspector with property binding
- Suggested tokens ranked by relevance
- Create token from selection
- Deep inspect for nested properties
- Heatmap/coverage analysis
- Remap bindings, extract tokens

### Health/Audit
- Dashboard with issue counts
- Lint violations, unused tokens, deprecated tokens
- Consolidation opportunities, duplicate detection
- Ignored issues management
- Server-side validation with caching

### History & Versioning
- Git commit history
- Snapshots/checkpoints
- Rollback to previous state
- Undo/redo (operation log)

### Utilities
- Command palette (Cmd+K)
- Quick Apply picker (bind token to selection)
- Paste tokens modal
- Find & Replace
- Batch editor (bulk operations)
- Table create (CSV-like bulk creation)
- JSON editor view
- Keyboard shortcuts reference
- Settings (server connection, display density, color format, copy format, lint config)
- Welcome/onboarding prompt
