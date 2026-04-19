# UX Review: Token Library, Token Editor, Generator Editor

> Critical implementation-grounded review of the current token authoring surfaces.
> Validated against current code and bundled screenshots on 2026-04-19.
> Scope: `packages/figma-plugin/src/ui/**` plus `screenshot-main-view.png`, `screenshot-token-editor-open.png`, `screenshot-editor-open.png`, and `screenshot-wide-view.png`.

---

## Executive Summary

This UI does not mainly have a polish problem. It has an information architecture problem.

The product says the canonical model is simple: collections are primary, modes belong to collections, and tokens belong to collections. The UI does not consistently reinforce that model. Instead, the current implementation exposes multiple parallel browsing models, multiple value lenses, multiple editing modes, and multiple utility workflows inside the same surfaces.

The result is a tool that feels powerful but not calm. Advanced capability is visible everywhere, but primary authoring is not protected from it.

### Overall Assessment

| Surface | Assessment |
| --- | --- |
| Token Library | Powerful, but defaults users into too much complexity and too much row noise. |
| Token Editor | Technically capable, but overloaded. It mixes authoring, diagnostics, governance, and internal representation in one panel. |
| Generator Editor | Strongest structural base, but still hides required identity and destination choices behind nested disclosure and does not present itself as a clear step flow. |

### Core Conclusion

The current UI is strongest when it helps a designer make one focused decision at a time.

It is weakest when it tries to make browsing, editing, inspection, generation, sync, and maintenance all equally visible at once.

---

## What This Review Is Based On

This review is based on the current implementation, not on intent or older screenshots.

Primary files reviewed:

- `packages/figma-plugin/src/ui/components/TokenList.tsx`
- `packages/figma-plugin/src/ui/components/TokenListToolbar.tsx`
- `packages/figma-plugin/src/ui/components/SelectModeToolbar.tsx`
- `packages/figma-plugin/src/ui/components/token-list/useToolbarStateChips.ts`
- `packages/figma-plugin/src/ui/hooks/useTokenListViewState.ts`
- `packages/figma-plugin/src/ui/components/token-tree/TokenLeafNode.tsx`
- `packages/figma-plugin/src/ui/components/token-tree/TokenGroupNode.tsx`
- `packages/figma-plugin/src/ui/components/TokenEditor.tsx`
- `packages/figma-plugin/src/ui/components/token-editor/TokenEditorInfoSection.tsx`
- `packages/figma-plugin/src/ui/components/GeneratedGroupEditor.tsx`
- `packages/figma-plugin/src/ui/components/generated-group-editor/StepSource.tsx`
- `packages/figma-plugin/src/ui/components/generated-group-editor/StepWhere.tsx`
- `packages/figma-plugin/src/ui/components/generated-group-editor/StepSave.tsx`

---

## Critical Findings

### 1. The Default Library Experience Is Too Advanced

This is the most important issue in the product right now.

The library does not open in a calm, obvious default state. It opens with advanced view concepts already active or immediately adjacent:

- `multiModeEnabled` auto-enables when collections exist in `useTokenListViewState.ts`.
- The library supports both `modeLensEnabled` and `showResolvedValues`, which are separate concepts implemented separately.
- The toolbar also exposes `tree/json`, condensed rows, preview split, flat search results, cross-collection search, selection-related filtering, and recently touched filtering.

This is not just “a lot of options.” It creates multiple competing answers to a basic question:

What value am I looking at right now?

Current value interpretations include:

- base authored value
- resolved alias value
- active-mode value
- multi-mode column values
- JSON representation

That is too many mental layers for a default browse surface aimed at designers.

#### Why This Matters

The canonical domain model is being obscured by view mechanics.

A designer should first understand:

- which collection they are in
- which token they are looking at
- what its current authored value is
- whether it needs attention

The current library often asks them to understand view state first.

#### Recommendation

Choose one default library mode and treat everything else as an explicit alternate view.

The default library should emphasize:

- collection
- token path
- primary displayed value
- one compact status signal when needed

Everything else should be secondary or opt-in.

---

### 2. The Library Is Carrying Too Many Jobs At Once

The token library is doing too much work as one surface.

Today it is simultaneously:

- the main browse surface
- the token creation launch point
- the group creation launch point
- the generator launch point
- the import launch point
- the sync launch point
- the compare workflow entry
- the batch selection workflow entry
- the find/replace workflow entry
- the token table workflow entry

The `+` menu in `TokenListToolbar.tsx` is better grouped than before, but it still combines five categories and a long list of actions behind a single 24x24 trigger. That is still too much compression for the primary control in the primary screen.

The bigger issue is what happens after entry:

- `selectMode` fully replaces the normal toolbar in `TokenList.tsx`.
- search disappears in selection mode because `SelectModeToolbar` replaces the standard toolbar.
- `BatchEditor` then appears as a separate second surface above the list.
- compare mode is routed through selection mode and the command palette.

This means the user has to understand a mode switch before they can perform routine multi-token work.

#### Why This Matters

The main authoring surface should not feel like a control panel for every capability in the app.

Right now the library is trying to be both:

- the place where designers author tokens
- the place where power users orchestrate utilities

That split is what users feel as clutter.

#### Recommendation

Protect the library as the primary authoring surface.

Move secondary workflows toward explicit utility entry points:

- batch operations
- compare
- find/replace
- token table
- sync

They can still be close. They should not all compete for first-tier attention in the same toolbar model.

---

### 3. Token Rows Carry Too Much Repeated Metadata

The current token rows are too noisy.

`TokenLeafNode.tsx` builds row metadata for many different concerns:

- generated provenance
- alias identity
- extends identity
- Figma scopes
- incoming references
- origin/provenance
- missing mode counts
- lifecycle

This is visible in the screenshots: rows repeatedly show generated provenance and missing-mode warnings, often on nearly every token in a group.

That makes the list feel status-heavy rather than authoring-first.

#### Why This Matters

A token row has one primary job:

Help the user quickly identify the token and understand its current value.

When every row carries multiple secondary labels, the eye stops knowing what to trust as primary.

This is especially harmful in a narrow plugin panel where horizontal room is already scarce.

#### Recommendation

Each row should usually show:

- token name/path
- current visible value
- at most one primary status signal

Additional metadata should move to:

- hover
- selection side panel
- detail pane
- explicit review/filter surfaces

The row should not be the universal home for every useful fact.

---

### 4. The Token Editor Is Overloaded

The token editor is not just slightly crowded. It is carrying too many conceptually different jobs.

Today the editor can contain:

- token identity and type
- main value editing
- mode authoring
- alias authoring
- extends authoring
- generated-token governance
- dependents browsing
- color modifiers
- contrast checking
- description
- lifecycle
- scopes and metadata
- derived groups
- raw JSON preview
- dependency inspection
- usage inspection
- history inspection

All of that is currently routed through one panel in `TokenEditor.tsx`.

The problem is not only that “Details” is a catch-all. It is that the entire editor has no hard boundary between:

- authoring
- inspection
- governance
- implementation detail

#### What The Current Structure Gets Right

- `EditorShell` is solid.
- value editors are generally strong.
- draft recovery is useful.
- generated-token conflict handling is thoughtful.

#### Where The Structure Breaks Down

- Create mode starts with a “Token details” block before value authoring.
- Edit mode still puts a packed header, mode bar, and optional draft banner ahead of the main work.
- “Reference” combines aliasing and extends under one weak label.
- “Details” combines user-facing and system-facing concerns.
- the footer layout still feels like a workaround rather than a clear action hierarchy.

The token editor is acting like the only place a token can ever be understood.

That is the wrong burden for a narrow side panel.

#### Recommendation

Split the editor into clearer mental zones.

At minimum:

- authoring should focus on path, type, value, and mode values
- references should be reframed more clearly than “Reference”
- governance and diagnostics should be secondary, not mixed into the main flow
- raw JSON should not live in the same prominence tier as normal authoring controls

The ideal outcome is that a designer can author a token confidently without being forced to parse system internals.

---

### 5. The Generator Editor Hides Required Decisions Behind Nested Disclosure

The generator editor is the best of the three surfaces, but it still has a serious IA flaw.

It correctly has:

- intent selection
- source input
- config editing
- live preview
- explicit review/save stage

That is good structure.

The problem is that some required identity and destination decisions are still visually treated as optional or advanced.

Current issues:

- the top summary bar is passive context only
- “Collection and group” is collapsible inside `StepSource.tsx`
- within `StepWhere.tsx`, `Group label` is hidden behind “Advanced settings”
- the outcome summary card is low-density and not especially useful once the user is already in the flow

This creates the wrong hierarchy:

config feels central, identity feels secondary

That is backwards. Designers care deeply about what a generated group is called and where it will live.

#### Recommendation

Make required identity and destination choices always visible during the main authoring flow.

The generator editor should behave like a real stepped workflow, even if it remains in a single panel:

- outcome
- source
- destination and naming
- configuration
- preview
- review

The current structure is close. It just still hides too much of the naming/destination model behind disclosure.

---

### 6. Readability Is Below The Bar For The Target User

This is a systemic problem, not a taste issue.

The current codebase contains approximately:

- `1884` uses of `text-[10px]`
- `416` uses of `text-[11px]`
- `153` uses of `text-[8px]`

Those scales appear across the token library, token editor, generator editor, badges, helper text, and metadata rows.

The target user is not an engineer reading dense debug UI. It is a Figma designer authoring a design system in a narrow panel.

That makes this typography choice especially costly.

The worst offenders are the repeated secondary labels and tiny badges in dependency and metadata surfaces.

#### Recommendation

Raise the base type scale across authoring surfaces.

This should be treated as a product-level readability correction, not a local cleanup.

The UI should feel calm and legible before it feels dense and information-rich.

---

### 7. Terminology Quality Is Uneven

The language is not uniformly bad, but it is inconsistent.

There has been real improvement:

- group actions now say “Sync to Figma variables” and “Sync to Figma styles”

But several terms still require a token-engineering mental model:

- “Extract to alias”
- “Edit Figma scopes”
- “Group label”
- “Keep updated”
- “manual exception”
- “Detach from generator”

Some of these concepts are valid and necessary. The issue is that the UI often names the mechanism instead of the user goal.

#### Recommendation

Normalize labels around designer intent:

- what is this
- what will it do
- when should I use it

The tool should sound like a Figma-native authoring environment, not like a thin UI on top of token operations.

---

## Screen-by-Screen Assessment

## 1. Token Library

### What Is Strong

- Collection rail and tree structure are aligned with the domain model.
- Virtualization is the right technical choice.
- Structured search is powerful.
- Multi-mode comparison is valuable when explicitly invoked.

### What Is Weak

- default state is too advanced
- row metadata is too noisy
- creation, utilities, and maintenance are too co-located
- selection and compare workflows are too modal

### Current Verdict

This screen is capable, but not disciplined.

It needs a stronger opinion about what the default experience is for.

---

## 2. Token Editor

### What Is Strong

- Core value editors are generally good.
- Generated-token handling is thoughtful.
- Draft recovery is useful.

### What Is Weak

- too many jobs in one panel
- weak separation between authoring and inspection
- vague grouping labels
- heavy use of secondary chrome ahead of the main task

### Current Verdict

This screen is structurally overgrown.

It should become narrower in responsibility, not broader.

---

## 3. Generator Editor

### What Is Strong

- Best overall flow in the product
- Strong live preview model
- Responsible review step before save
- Good fit for visual token generation workflows

### What Is Weak

- not clearly stepped enough in presentation
- required naming and destination choices are still visually demoted
- some generator-specific editors still vary too much in density and finish

### Current Verdict

This is the closest surface to the right product shape.

It needs hierarchy cleanup more than conceptual reinvention.

---

## Corrections To The Previous Draft

Several claims from the earlier review should not be carried forward as-is.

### The stale generated-group banner is not non-actionable

It already names stale generated groups and links to them.

The real issue is that it still does not explain impact before “Re-run all.”

### Users can rename individual generated outputs in several generators

This is already supported in multiple generator editors through editable step names.

The real issue is inconsistency across generator types and how discoverable that naming control is.

### Terminology has partially improved

Some older developer-centric labels have already been replaced with clearer Figma-facing labels.

The real issue is that terminology quality is still uneven across surfaces.

---

## Redesign Priorities

If only a few things are addressed, they should be these:

1. Simplify the default token library state so it represents one clear browsing model.
2. Reduce row-level metadata noise in the library.
3. Separate token authoring from token inspection/governance in the editor.
4. Make generator naming and destination first-class, always-visible decisions.
5. Raise the typography scale across authoring surfaces.
6. Normalize UI language around Figma designer intent, not internal token mechanics.

---

## Final Assessment

The current product is more mature technically than it is experientially.

The strongest parts already exist:

- a good canonical domain model
- strong core editing controls
- a promising generator workflow

The problem is that the UI keeps exposing too much of the system at once.

The next round of UX work should not be about adding capability.

It should be about protecting the core authoring experience from capability overload.
