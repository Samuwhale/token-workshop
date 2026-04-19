# Generated Groups UX Review

This document reframes the open UX problems around generated groups based on the current implementation and product direction.

The key conclusion is:

- the product should stay collection-first and token-first
- generated work should remain embedded in token authoring surfaces
- the next UX improvements should make generated work easier to discover, scan, and operate inside the library
- the wrong move would be to reintroduce a top-level automation or scheduler-style workspace

The target user is still a Figma designer managing token collections, groups, and modes, not an operator supervising background jobs.

---

## Product Position

The redesign direction is correct:

- generated groups should not become a primary workspace
- collections remain the primary container
- generated groups are still token groups
- modes remain view state
- generator behavior is secondary metadata

The current implementation already reflects this in important ways:

- creation and editing are routed contextually through the token library
- generated groups are represented inline in group and token surfaces
- direct edits to generated tokens are interruptive and explicit
- review is conditional instead of mandatory

The next pass should therefore focus on:

- discovery
- scanability
- calmer information hierarchy
- more outcome-specific copy
- reducing density in token browsing and generation surfaces

---

## What Is Already Working

The current implementation is not starting from a broken baseline. Several important UX decisions are already correct:

- value previews are strong and help designers scan tokens quickly
- the token row structure itself is fundamentally sound: name first, value second, metadata after
- generated-token edit handling is appropriately interruptive and protective
- conditional review gating is correct and keeps safe changes lightweight
- the create menu is more scannable than a flat list because actions are grouped, even though the grouping still needs to be more intent-shaped
- the quick generation path from token context (right-click, Generate palette...) with automatic type detection is directionally correct

The remaining work is mostly about reducing noise, tightening hierarchy, and improving discoverability — not changing the core model.

---

## Updated Assessment

## P1: Generated work is hard to discover before first use and hard to filter after

**Status: Valid — strongest remaining problem**

This is the strongest remaining generated-group UX problem.

The issue is not that generated groups are impossible to find once they exist. Inline summaries and badges already provide persistent signals in the token tree. The issue is twofold:

1. There is no collection-level affordance that says "this collection contains generated work — show me those groups"
2. The search and filter system has no `Generated` filter at all — no qualifier, no toggle, no preset

The filter menu supports issues-only, recently-touched, pinned-only, reference type, and duplicates — but not generated status. The structured query system supports `type:`, `has:`, `value:`, `path:`, and other qualifiers but has no `generated:` or `generator:` qualifier. A designer who has not already learned to visually scan for generated badges has no way to scope the view to generated work.

### Why this matters

Without a collection-level shortcut or filter, generated groups feel like a feature you discover accidentally rather than a first-class authoring capability. This is especially problematic because the generation feature is one of the product's strongest differentiators.

### Recommended fix

Add generated-work discovery inside the library at two levels:

**Filtering:**

- add a `Generated` toggle to the filter menu alongside the existing issues/recent/pinned toggles
- add a `generated:` qualifier to the structured query system
- add a one-click generated-count chip in the token toolbar when count > 0 (acts as a filter shortcut)

**Collection-level signals:**

- optional collection-header prompt when no generated groups exist yet ("This collection has no generated groups — generate a palette, type scale, or spacing scale to get started")

This should be a filtering affordance, not a dashboard.

---

## P2: Generated tokens need calmer, clearer provenance — not stronger automation identity

**Status: Partially valid**

The original criticism that generated tokens are indistinguishable from manual tokens is overstated. The implementation already shows persistent generated markers and inline generated-group summaries.

What is still true is that provenance is not yet as effortless to scan as it should be. The metadata segment system uses middle-dot separated badges with multiple tones (accent, warning, danger, default), each independently clickable and with hover behavior. Even with a segment count cap, the visual grammar is dense because each segment competes for attention at the same level.

### Why this matters

Designers need to understand at a glance:

- what is manual
- what is generated
- what is stale
- what has exceptions

If provenance is technically present but visually busy, the user still experiences uncertainty.

### Recommended fix

Do not add more chrome. Instead:

- keep the persistent generated marker
- keep the `Generated by` identity metadata visible at rest for healthy generated tokens
- cap resting metadata to two segments total
- use the first segment for identity: `Generated by`, `Alias of`, or `Extends`
- use the second segment for the most actionable status: stale state, missing-mode count, or lifecycle state
- make the second segment visually quieter than the first — secondary text weight, no interactive styling at rest
- move scopes, reference counts, origin, and mode-override indicators to hover, popover, or detail surfaces

The goal is not just fewer segments — it is a clear visual hierarchy between the segments that remain.

---

## P3: Generated-group creation is not too many screens, but it is still slightly too dense

**Status: Partially valid**

The current critique that creation is a "five-screen journey" no longer matches the actual implementation.

For the common case:

- a token entry point can preselect the obvious outcome
- the editor opens with live preview
- safe creates can save directly

That is already directionally correct.

What still needs improvement is density inside the editor, not step count. Two specific areas:

1. The editor panel itself asks the user to parse more surface area and more settings than necessary for common outcomes
2. The destination settings (group path, collection, label, keep-updated toggle, alias layer editor) require configuration even when sensible defaults could be inferred from the source token and selected outcome

### Why this matters

Even when the flow is technically short, visual density and required decisions can make it feel heavier than it is. A designer generating a palette from a brand color should not need to configure a group path or understand alias layers.

### Recommended fix

Keep the current structure, but simplify the panel:

- emphasize source, destination collection, preview, and a few type-specific controls
- auto-fill destination group path from the source token's group context when possible
- keep advanced settings (alias layer, keep-updated, custom group path) collapsed by default
- reduce explanatory chrome that restates nearby content
- make foundational flows feel even more immediate

The solution is not a new wizard. It is a quieter editor with smarter defaults.

---

## P4: The outcome chooser is too dense, not too flat

**Status: Valid**

The current problem is not primarily that all generator types are presented equally. The real problem is that each intent card asks the user to process too much information.

The cards currently combine:

- icon
- title
- suggested state
- type label
- description
- pipeline/stage visualization
- starter counts

That is more than is needed to choose an outcome.

### Why this matters

This increases cognitive load, especially for first-time users who are trying to answer one simple question:

- what do I want to generate?

### Recommended fix

Simplify the cards before introducing extra grouping:

- remove pipeline stage visualizations
- remove the type badge when it only restates the selected outcome
- remove starter step and semantic counts
- keep icon, title, a short practical description, and suggested state

If the chooser still feels hard to scan after simplification, then add light grouping for foundational versus advanced outcomes. Grouping should follow simplification, not replace it.

---

## P5: User-facing copy is still inconsistent when type-specific language is available

**Status: Valid**

The product is in a better place than before, but the copy is still mixed.

There are places where generic "generated group" language is correct:

- mixed summaries
- pre-selection states
- cross-type filtering

There are also places where the specific outcome is known and the generic label weakens clarity:

- edit titles
- success toasts
- destructive single-item confirmations

### Why this matters

Designers think in outcomes:

- palette
- type scale
- spacing scale

When the type is known, product language should reflect that.

### Recommended fix

Use type-specific labels whenever a single known outcome is in scope.

Examples:

- `Edit palette`
- `Palette created`
- `Delete type scale`

Keep `generated group` only for genuinely mixed or pre-selection contexts.

---

## P6: Quick token-origin generation is mostly addressed but under-discoverable

**Status: Mostly addressed — one gap remains**

The quick token-origin path is already present and aligned with the redesign direction:

- token context menu with type-specific label ("Generate palette...") and keyboard shortcut (G)
- automatic type detection via the source token
- live preview and fast create

This is a core strength and should remain.

The remaining gap is that this path is only accessible via the right-click context menu. There is no visual affordance on the token row itself. Context menus are native to Figma and designers are generally comfortable right-clicking, so this is not a critical gap — but the generation capability is invisible to users who haven't been told it exists.

### Recommended fix

No structural change needed. The context menu path is correct.

Two small improvements:

- ensure onboarding or empty-state guidance mentions the right-click generation path
- consider a subtle hover-revealed generation icon on tokens whose type maps to an obvious generator outcome — but only if it can be done without adding row clutter (this may not be worth the tradeoff)

---

## Broader Token Library UX

The bigger issue is not only generated groups. The whole token library is carrying too many product modes at once.

The viewer is currently trying to support:

- token browsing
- inline editing
- generated-state interpretation
- diagnostics and issues
- compare flows
- selection/apply flows
- sync context
- usage and provenance lookups

This creates a UI that is powerful, but often denser than the target user needs during ordinary authoring.

### What this means in practice

- token rows carry too much information and too many interaction states
- the metadata line is the biggest offender because too many low-priority facts compete at the same visual level
- the create menu mixes different mental models
- the search/filter system is powerful but has no approachable entry points for its most useful filters (especially the missing Generated filter)
- generated-group summaries are useful but too verbose and too action-heavy — the summary row currently shows generator name, type, status, source token, keep-updated toggle, last run time, manual exception count, a compact token preview, and 5+ action buttons
- mode context is present but not yet ambient enough across the whole library

---

## Recommended Direction For The Overall UX

## 1. Keep the library collection-first

Do not bring back a top-level automation console.

Instead:

- improve collection-level generated discovery
- improve filtering
- improve scanning inside the token library

Generated work should feel like authored library structure, not job management.

---

## 2. Strengthen filtering as the primary focus-switching mechanism

Do not add separate lenses, tabs, or view modes for generated work and issues. Mutually exclusive lenses introduce mode-switching that fragments the collection view and creates the same "separate workspace" problem described in the opening position. Composable filters are strictly more flexible and align with how the library already works.

Instead, make the existing filter system more approachable:

- add the missing `Generated` filter to the filter menu
- surface the most useful filters as one-click toolbar affordances (generated-count chip, issues-count chip) rather than requiring users to open the filter menu or learn structured query syntax

The user should be able to switch mental focus without leaving the collection context — through filtering, not through modes.

---

## 3. Make token rows calmer

A token row should communicate one primary thing well:

- token identity
- current value
- one provenance/status signal

Everything else should be secondary or moved into:

- contextual panels
- popovers
- menus

In practice, the metadata line should be limited at rest:

- slot one is identity: `Generated by`, `Alias of`, or `Extends`
- slot two is the most actionable status: stale, missing values, or lifecycle state
- slot one should carry normal visual weight; slot two should be visually quieter (secondary text, non-interactive at rest)

Everything else should move behind hover, popover, or detail preview.

The right fix is not adding more markers. It is reducing row competition and creating clear hierarchy between the information that remains.

---

## 4. Rework the create menu around designer intent

The current create surface is more scannable than a flat command list, but it still mixes:

- authoring structure
- generation
- import

This should be split more clearly into intent-shaped groups:

- `New token`
- `New group`
- `Generate…`
- `Import…`

That will scan faster and feel more predictable.

---

## 5. Make mode context more ambient

The generated-group editor already treats mode context more explicitly.

The rest of the token library should do more to keep the active collection/mode pairing visible as persistent context rather than something the user has to remember.

This matters especially when:

- reviewing generated previews
- scanning mode-sensitive tokens
- deciding whether a token edit should affect the generator or stay manual

---

## 6. Reduce generated-group summary verbosity and action density

Generated-group summaries currently carry useful information, but they serve two roles at once: status display and action surface. The summary row shows generator name, type, status, source token, keep-updated toggle, last run time, manual exception count, a compact token preview, and 5+ action buttons (Rerun, Edit, Toggle Keep Updated, Duplicate, Delete, Detach).

This is too much for an inline summary embedded in the token tree.

The summary should prioritize:

- what this generates
- where it belongs
- what source drives it
- whether it is healthy
- how many exceptions it has

Actions should be restructured:

- promote only Edit and Rerun (when stale) as visible buttons
- collapse Toggle Keep Updated, Duplicate, Delete, and Detach into a single overflow menu

That will feel more native to design authoring and less operational.

---

## Priority Recommendations

## Priority 1

Improve generated-work discovery inside the collection view:

- add a `Generated` toggle to the filter menu
- add a `generated:` qualifier to the structured query system
- add a generated-count toolbar chip as a one-click filter shortcut
- strengthen collection-level empty-state guidance

## Priority 2

Simplify the outcome chooser:

- reduce card density
- remove pipeline and starter-detail chrome
- only add grouping if simplification is not enough

## Priority 3

Apply type-specific language consistently where the outcome is known.

## Priority 4

Refine the token library as a calmer browse surface:

- quieter rows with only two metadata segments visible at rest, with clear visual hierarchy between them
- stronger filtering as the focus-switching mechanism (not lenses or tabs)
- cleaner create menu structured around intent
- more ambient mode context
- generated-group summary rows with promoted actions (Edit, Rerun) and overflow for the rest

---

## Final Position

The current generated-group redesign is fundamentally on the right track.

The remaining UX work should not reverse that direction. It should strengthen it by making generated work:

- easier to discover
- easier to scan
- easier to understand in collection context
- more clearly named by outcome

The best next improvements are therefore inside the token library, not outside it.
