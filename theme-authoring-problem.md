# Theme Authoring Problem

## Core Problem

TokenManager does not primarily have a UI-complexity problem. It has a product-model problem.

Today the product still implies more than one answer to a simple user question:

How do I author themed tokens?

That ambiguity shows up everywhere:

- sometimes theming feels like something you configure at the system level
- sometimes it feels like something you edit directly on each token
- sometimes it feels like something you save as a named combination

When the product has multiple overlapping answers to the same job, users do not experience flexibility. They experience uncertainty.

For Figma designers, that uncertainty is especially expensive because theme authoring is not an edge case. It is part of normal work.

## Why This Matters

The target user is a designer working in one of three modes:

- defining a design system
- shaping UI decisions across light/dark, brand, density, or platform variants
- preparing a token system that can survive handoff to developers

These users need a theming model that feels obvious, stable, and close to the way they already think about variables in Figma.

They also need confidence that the system they author can be handed to developers without translation loss, ambiguity, or manual reinterpretation.

They should not have to stop and ask:

- Am I editing a token or a theme?
- Is this value local or inherited from some composition layer?
- Should I change the token itself, a mode selection, or a saved preset?
- Is this workflow for authoring, previewing, or output generation?

If the answer is unclear, the product is pushing internal complexity onto the user.

## What The Existing Plan Gets Right

- It correctly identifies that TokenManager needs one canonical theming model.
- It correctly pushes toward a token-first authoring experience.
- It correctly argues that handoff and output concerns should not dominate the default authoring path.
- It correctly challenges the idea that designers should work through infrastructure concepts just to create normal themed values.

Those are the right instincts.

## Where The Existing Plan Is Still Weak

### 1. It is still a little too abstract

The current draft says the product should be simpler, but it does not define the everyday authoring experience crisply enough.

It needs to describe, in plain product terms, what the user actually does when they want to:

- add a light and dark value
- create a brand variation
- review what is incomplete
- preview a system in a particular state

If the plan cannot describe that cleanly, the product model is still not settled.

### 2. It gives too much weight to presets

Presets are useful, but they are not the center of the problem.

The main problem is authoring ownership:

Where does a designer go to express themed intent?

Presets should be framed as saved viewing or application states, not as a core place where token values are authored.

### 3. It does not go far enough in protecting the default workflow

The real product bar should be stricter:

- routine theme authoring should happen where tokens are authored
- system-level theme tools should support, not compete with, token editing
- advanced concepts should only appear when the user has a genuinely advanced job to do

The current draft gestures in that direction, but it should be more explicit.

### 4. It still leaves room for a split mental model

The biggest risk is not that the UI stays cluttered.

The biggest risk is that the product keeps both of these stories alive at once:

- “themes are authored through a separate composition system”
- “themes are authored directly on tokens”

Even if only one becomes visually dominant, the existence of both as normal concepts will keep the product mentally heavy.

The refined plan should close that door.

## Recommended Product Position

TokenManager should adopt a single clear story:

- tokens are the thing designers author
- collections organize authoring and publishing boundaries
- modes are the normal way a token varies
- groups are just organization
- presets are saved combinations used for preview, review, and handoff
- handoff is a real product outcome, but it is produced from the authored system rather than replacing the authoring model

That is the model.

Everything else should either reinforce that model or get out of the way.

## Outcome UX

The intended experience should feel like this:

### Authoring

A designer opens tokens, chooses the relevant collection, and edits the token directly.

If the token needs themed variation, that variation is visible and editable right there. The user does not have to enter a different conceptual system just to say “this token changes in dark mode.”

### Structure

Collections define the boundaries that matter. Groups keep tokens navigable. Modes define how values vary.

The product should make these roles immediately legible:

- collection = where this token belongs
- group = where this token lives in the hierarchy
- mode = when this token changes

Those concepts should not blur into one another.

### Review

When a system is incomplete, the product should show that in the same places where the user is already working.

The designer should be able to see:

- which tokens are missing values
- which collections are incomplete
- which current preview states expose gaps

This should feel like editing feedback, not like entering a separate troubleshooting mode.

### Preview

When users want to see the system in a specific state, they should apply a saved or temporary combination of modes across collections.

That state should feel like a lens over the system, not like a second authoring layer.

### Handoff

Handoff is not secondary in importance. It is a core outcome.

But it should still feel downstream from authoring.

The product should help designers produce a system that developers can implement with confidence:

- clear mode structure
- predictable token behavior
- explicit preview states
- clean outputs that preserve authored intent

The key rule is that handoff should be generated from the canonical model, not become a parallel model that designers have to author through.

## Recommended Workspace Roles

`Tokens`

- the primary workspace
- where everyday themed authoring happens
- where completeness should be visible

`Themes`

- a secondary workspace for system structure and cross-collection review
- focused on defining modes, reviewing combinations, and checking overall health
- not the primary place for routine value authoring

`Inspect`

- for applying and comparing system states
- for review, not creation

`Sync`

- for publishing, import/export, and developer-facing outputs
- where authored design intent is turned into implementation-ready outputs
- downstream from authoring, but central to product value

This is the important UX line:

The farther a workspace is from normal token authoring, the less it should feel like a required stop in the default workflow.

## Recommended Plan

### Phase 1: Decide the canonical user story

The plan should explicitly answer:

- what object the user authors
- what object owns variation
- what object saves reusable viewing states
- what developers consume as the implementation-facing expression of the authored system
- what belongs to default authoring versus advanced workflows

Without this, every later design decision will stay muddy.

### Phase 2: Rebuild the default workflow around that story

Make the normal path unmistakable:

1. create or organize tokens
2. edit token values and mode values inline
3. review completeness in context
4. preview the system in selected states
5. publish implementation-ready outputs when ready

Users should not need a separate conceptual jump to perform ordinary theme work.

### Phase 3: Push complexity to the edges

Any advanced mechanism should live behind the primary authoring model, not beside it.

The product should resist exposing:

- multiple normal ways to author the same themed intent
- system mechanics that exist only to support output pipelines
- saved structures that duplicate what token editing already expresses

## Success Criteria

This direction is successful if:

- a designer can author light/dark or brand variations without learning a second authoring model
- the difference between authoring, previewing, and handoff feels obvious
- the product reads as Figma-native rather than tool-native
- system incompleteness is visible without sending users into a separate setup flow
- developers can consume the result without guessing at designer intent
- handoff remains robust without becoming the center of the UX

## Bottom Line

The product should not ask designers to think like theme orchestrators.

It should let them think like designers maintaining a token system:

- define tokens
- vary them by mode
- review the system in meaningful states
- publish clean, implementation-ready outputs

The refined plan should optimize for that experience, even if it requires a more drastic simplification of the current theming story.
