# Generated Token Groups UX Spec

## Product Goal

TokenManager should help Figma designers generate and maintain token groups from the same places they already author tokens.

The experience must feel like faster token authoring, not like configuring or supervising a workflow engine.

## Problem To Solve

The current generation UX appears to leak too much system behavior into the main authoring experience.

Designers should not need to translate between:

- tokens
- collections
- modes
- recipes or automations
- run states
- overrides
- detached outputs

The redesign should solve five concrete problems:

1. It is not obvious where generated tokens belong.
2. It is not obvious which collection mode is being previewed or affected.
3. Too many decisions happen before the user sees a useful preview.
4. Maintenance chrome is competing with design work.
5. Editing a generated token can create confusing drift from the generator.

## Canonical Model

This spec stays aligned with the product's canonical model:

- collections are the primary container
- modes belong to collections
- token groups belong to collections
- tokens belong to collections
- a generated token group is still a token group
- generator settings are attached to that group
- selected mode and preview mode are view state
- recipes remain an implementation detail, not a primary UX concept

Validation-only features do not belong here. They live in Audit.

## Core Decisions

### 1. No Top-Level Automation Object In Primary UX

Users create and maintain generated token groups from token and collection surfaces.

Do not make a separate automation object the main thing the user navigates to, names, or manages.

### 2. The Primary Object Is The Token Group

The thing a designer is making is a token group inside one collection.

Generation behavior is secondary metadata attached to that group.

### 3. Collection Ownership Is Fixed And Visible

Every generated token group belongs to exactly one collection.

The collection should be known before configuration starts and remain visible throughout the flow.

### 4. Creation Is Outcome-First

Do not start from product taxonomy.

Start from what the designer wants to make:

- Palette
- Type scale
- Spacing scale
- Radius scale
- Opacity scale
- Shadow scale
- Layer order scale
- Dark mode variant
- Accessible pair
- Custom

### 5. Review Is Conditional, Not Mandatory

Inline preview is the default safety mechanism.

Explicit review is required only when the change is destructive, wide-reaching, or hard to infer safely.

### 6. Exceptions Are Explicit, Not Automatic

A direct manual edit to a generated token must not silently become an exception.

The user must choose whether to:

- edit the generator
- make a manual exception
- detach the token from the generator

### 7. Operational Controls Stay Secondary

If the system supports background maintenance, expose it as a secondary setting such as `Keep updated`.

Do not center the experience on run state, pause state, or job-style controls.

## Primary Flows

### 1. Generate From Token

This is the primary flow.

Entry points:

- token row
- token context menu
- token detail surface

Behavior:

- when one action is obvious, show the direct action, for example `Generate palette…`
- when several actions are plausible, show a compact outcome picker
- the destination collection is fixed from the source token
- the user sees a live preview immediately
- advanced controls stay collapsed unless needed

The editor should prioritize:

- the source token
- the destination collection
- the generated result preview
- a small set of domain-specific controls

Secondary controls can stay collapsed:

- group name
- aliases
- keep updated
- advanced mode behavior

### 2. Generate From Collection

This is the secondary flow for designers who know they want to generate a group before selecting a source token.

Entry points:

- collection header
- collection empty state
- add menu inside a collection

Flow:

1. Choose the collection first if it is not already known.
2. Choose the desired outcome.
3. Choose a source only if that generator needs one.
4. Configure with live preview.
5. Save directly or enter review if the change is high impact.

This flow should still feel like collection authoring, not like creating a standalone object.

### 3. Maintain A Generated Group

Maintenance should happen from the generated token group itself.

Entry points:

- token group header
- generated token detail
- contextual open from a generated token

The default maintenance view should focus on:

- what this group generates
- which collection it belongs to
- which modes are being previewed
- current preview
- whether any manual exceptions exist

Secondary actions:

- rerun now
- duplicate
- delete
- keep updated on or off

These are advanced controls, not the primary content of the screen.

### 4. Edit A Generated Token Directly

Direct editing of a generated token is a critical moment and should be explicit.

When a user edits a generated token, the product should interrupt with a clear choice:

- `Edit generator`
- `Make manual exception`
- `Detach from generator`

Recommended default:

- lead with `Edit generator`
- make `Make manual exception` secondary
- keep `Detach from generator` destructive and clearly explained

Do not silently create an exception as a side effect of ordinary editing.

### 5. Find Generated Work

Generated groups should be easy to find without creating a separate management mindset.

Recommended discovery model:

- show generated groups inline in collection and token group surfaces
- allow filtering a collection view to generated groups
- allow search for generated groups across the library if needed

If a global overview exists, its job is to find generated groups quickly and surface items that need attention. It should not be the primary creation flow or feel like a scheduler.

## Safety And Clarity Rules

`Review changes` appears only for destructive or ambiguous saves, not for routine tuning. Trigger it when a save would:

- overwrite existing manual tokens
- remove tokens
- rename or replace existing outputs
- create or preserve manual exceptions
- change outputs across multiple modes in a non-obvious way
- change a large number of existing tokens at once

The review step should show tokens to create, update, and remove, plus affected modes, destination collection and group, and any manual exceptions being created, preserved, or invalidated.

Modes must be explicit whenever they materially affect preview or output:

- always show the working collection
- if the collection has modes, show the current preview mode
- do not split source mode and destination mode unless a generator truly requires it
- explain mode effects in collection language, not system language

Manual exceptions are allowed, but never by accident:

- exceptions must be created intentionally
- exceptions stay local to the generated group
- exception count must be visible whenever it is non-zero
- the group editor must make exceptions easy to inspect and remove
- if exceptions accumulate, the UI should nudge the user back toward editing the generator or detaching the group

The product should encourage system maintenance, not exception creep.

## Copy Direction

Prefer:

- `Generate palette…`
- `Generate type scale…`
- `Generate spacing scale…`
- `Generated`
- `Edit generator`
- `Review changes`
- `Collection`
- `Mode`
- `Alias`
- `Manual exception`
- `Keep updated`

Avoid:

- `Automation`
- `Recipe`
- `Run state`
- `Paused`
- `Detached outputs`
- `Output path`
- `Target collection template`

`Generated` is a state, not a top-level product area. `Exception` is the recommended user-facing term; `override` can remain internal.

## Non-Goals

This spec does not try to solve:

- multi-collection generation from one group
- validation and health workflows
- graph-based dependency browsing
- backend architecture
- persistence strategy
- migration strategy
- final visual styling

## Questions Answered

- Dedicated `Automated tokens` tab: No in the primary IA. Generated groups belong in collection and token authoring surfaces. A global view is optional later for search and attention, not for primary work.
- Every save ends in `Review changes`: No. Only destructive, large, or ambiguous changes should require review.
- Manual edits automatically become overrides: No. The user must explicitly choose to edit the generator, create a manual exception, or detach the token.
- Creation begins with a domain taxonomy: No. Start with concrete outcomes and contextual suggestions.
- Primary managed object: the token group inside a collection. Generation settings are attached to that group and remain secondary.
- Validation-only work such as contrast checks: Audit, not generation authoring.
- Run and pause: secondary controls inside group settings, using language such as `Keep updated` and `Rerun now`.

## Standard

Does this make generated token groups feel like easy, trustworthy token authoring for Figma designers rather than a smaller but still technical automation console?
