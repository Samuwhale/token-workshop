# Automation Redesign Spec

Status: Draft  
Surface: Figma plugin  
Audience: Product, design, and implementation teams  
Last updated: 2026-04-18

## Summary

Automation should feel like a core part of token authoring, not a hidden expert feature.

Today the experience is fragmented across token actions, group actions, health states, and a side-panel editor. It asks designers to understand too much UI structure before they can understand what an automation will actually do. The result is low discoverability, low confidence, and a weak sense of control.

This redesign repositions automation as a visible, trustworthy, designer-native capability inside the main token workflow. The goal is to help Figma designers create, review, and maintain token systems faster, with less guesswork and less fear of breaking managed outputs.

This document focuses on the user problem, product goals, and desired experience. It does not define technical implementation.

## Why This Matters Now

TokenManager is still in active development and has not shipped. This is the right moment to fix the mental model instead of layering more UI onto a confusing foundation.

Automation has high leverage for the target user:

- It can save substantial time when generating scales, semantic aliases, and repeated token structures.
- It can reduce manual drift across collections and modes.
- It can make token systems easier to maintain over time.

If automation continues to feel hidden or risky, one of the product's most powerful capabilities will remain underused.

## Users

Primary users:

- Figma UI designers
- Figma UX designers
- Design system creators and maintainers

User characteristics:

- They are sophisticated and already understand design tokens conceptually.
- They think in design-system terms, not engineering-system terms.
- They expect plugin UI to feel native to Figma: quiet, dense, and direct.
- They value speed, predictability, and clear visual consequences over flexible but abstract systems.

## Problem Statement

Creating and managing automations currently feels tucked away, confusing, and unreliable.

The experience breaks down in five ways:

1. Automation is hard to find.

- There is no obvious home for automations in the main navigation.
- Generic automation creation is not surfaced clearly from the primary token workspace.
- Entry points are scattered across menus and contextual actions.

2. The product model is fragmented.

- Users encounter multiple overlapping labels: automation, recipe, semantic aliases, generate scale, maintain this group.
- The UI does not teach one clear concept that designers can build confidence around.

3. The creation flow hides important decisions.

- Required output decisions are not always visible when users need them.
- Advanced behavior is tucked behind layered disclosure.
- The flow makes users configure the mechanism before they fully understand the outcome.

4. Management is weak.

- There is no clear, first-class place to review all automations.
- Users cannot easily scan status, ownership, source, outputs, or recent failures in one place.
- Health states call attention to automation issues without giving them a natural management surface.

5. Trust is low.

- Users need stronger visibility into what an automation controls, what will change, and what needs attention.
- Managed tokens can feel fragile or surprising rather than clearly owned and predictable.

## Product Goal

Make automation feel like a core, empowering design-system tool that helps designers create and maintain tokens with confidence.

## Design Goals

1. Make automation discoverable from the main token authoring workflow.
2. Give automation one clear user-facing concept and vocabulary.
3. Make common creation paths fast, guided, and outcome-first.
4. Provide a clear management surface for reviewing and maintaining all automations.
5. Increase confidence by making ownership, impact, and status obvious.
6. Keep the experience dense, calm, and native to Figma rather than turning it into a secondary admin tool.

## Non-Goals

This redesign does not aim to:

- Introduce new automation engine capabilities just for the sake of the redesign
- Turn automation into the primary way all tokens are created
- Expand into a complex workflow builder or developer-style pipeline editor
- Rework publishing, exporting, or code integration unless needed for automation comprehension
- Preserve current terminology if that terminology harms clarity

## Product Principles

### 1. Automation is part of authoring, not a separate system

Automations should extend the token workflow. They should not feel like a parallel product hidden behind specialist UI.

### 2. Outcome first, mechanism second

Designers should start with what they want to produce, not with internal configuration concepts.

### 3. One concept, one name

The user-facing term should be consistent across creation, management, issues, and ownership. Internal product language should not leak into the UI.

### 4. Contextual when needed, central when managing

A designer should be able to start an automation from a token or group, but also have a dedicated place to review all automations together.

### 5. Trust comes from visibility

Users should be able to see:

- what an automation depends on
- what it owns
- what will change
- whether it is healthy
- what action to take next

### 6. Quiet power over chrome

The experience should feel precise and efficient. It should not rely on extra decoration, explanatory clutter, or dashboard theatrics.

## Vision

Automation becomes a first-class section of the Tokens workspace.

From that section, a designer can:

- create a new automation from scratch
- create one from a token or group context
- review all automations in one list
- understand which automations are healthy, stale, paused, or failing
- edit outputs and source relationships without hunting through nested UI
- move from an issue to the relevant automation immediately

The experience should feel less like "configuring recipes" and more like "setting up and maintaining token systems."

## Proposed Experience

### 1. A first-class Automation home

Automation needs a visible home in the Tokens workspace.

This home should function as the primary place to:

- review all automations
- search and filter automations
- create new automations
- run, pause, and resume automations
- inspect failures or stale states
- understand ownership and scope

This should not live only inside Health, because automation is not just an error state. It is an authoring tool.

### 2. Clear entry points

Automation should be reachable from three obvious places:

- a visible `New automation` action in the main token workspace
- token-level contextual actions for creating from a source token
- group-level contextual actions for maintaining an existing token group

These entry points should all feed into the same core experience, with different context prefilled.

The product should support three mental starting points:

- "I want to automate this token"
- "I want to automate this group"
- "I want to create a new automation"

### 3. Outcome-led creation

The creation flow should start from the result the designer wants.

Examples:

- Create a color ramp
- Create a spacing scale
- Create a type scale
- Create semantic aliases
- Maintain a generated group

The user should understand the intended output before dealing with detailed settings.

The flow should make these decisions explicit and easy to review:

- what the automation uses as its source
- where the outputs will be written
- what naming/path structure it creates
- what token sets or collections it affects
- what will be created, updated, overwritten, or removed

Required decisions should stay visible. They should not be hidden behind extra layers of disclosure.

### 4. A dedicated management list

The management list is the heart of the redesign.

Each automation row should answer, at a glance:

- What is this automation for?
- What kind of output does it create?
- What is its source?
- Where does it write?
- What is its current status?
- When did it last run?
- Does it need attention?

Primary actions from the list should feel direct and lightweight:

- open
- run
- pause or resume
- inspect issues
- jump to managed outputs

This list should let designers move from "something seems wrong" to "I know exactly which automation needs attention" without using Health as an intermediary.

### 5. Strong ownership visibility

Automation-owned output should feel legible, not magical.

Wherever a managed token or group appears, the UI should clearly communicate:

- this token or group is maintained by an automation
- which automation owns it
- whether it is healthy or out of date
- what happens if the user edits it manually
- how to detach it if they want to take manual control

Ownership should reduce ambiguity, not create warnings that feel punitive.

### 6. Issue handling that leads somewhere useful

Stale, failed, blocked, and paused states should all map into the same automation management model.

The redesign should avoid issue states that merely announce a problem without giving the user a clear next step.

Issue handling should support two common needs:

- "Fix this one automation"
- "Review everything that needs attention"

Health can still summarize automation issues, but it should hand users back to the automation management surface rather than acting as a substitute for it.

### 7. Consistent naming

User-facing language should standardize on `Automation`.

Supporting terms should also become more consistent:

- `New automation`
- `Automation source`
- `Automation outputs`
- `Managed by automation`
- `Pause automation`
- `Run automation`

Language should avoid forcing users to translate between multiple overlapping concepts.

If "recipe" remains necessary internally, it should not shape the primary UX vocabulary.

## Key User Flows

### Flow A: Create from a source token

Goal: Turn a single source token into a useful generated system.

Expected experience:

1. The designer selects a token.
2. They choose `Create automation`.
3. The source is already understood.
4. The flow suggests the most relevant outcomes.
5. The designer confirms outputs and previews impact.
6. They save with confidence.

Success condition:

The user does not need to hunt for where outputs go or what will be generated.

### Flow B: Create from a group

Goal: Turn a manually maintained token group into a managed system.

Expected experience:

1. The designer opens a group action.
2. They choose `Maintain with automation`.
3. The current group structure helps frame the setup.
4. The designer can see whether the automation will preserve, update, or replace current outputs.
5. The resulting relationship between group and automation feels obvious.

Success condition:

The designer understands that they are moving from manual maintenance to managed maintenance, not creating a disconnected side artifact.

### Flow C: Create from scratch

Goal: Start a new automation without needing an existing source selection.

Expected experience:

1. The designer uses `New automation` from the main Tokens workspace.
2. They choose the intended outcome.
3. They define source, outputs, and preview in one coherent flow.
4. They save and immediately understand where the new outputs live.

Success condition:

The flow feels like a normal authoring action, not a hidden expert mode.

### Flow D: Review and maintain automations

Goal: See the current automation system as a whole.

Expected experience:

1. The designer opens the Automations section.
2. They can scan all automations by status, source, and output scope.
3. They can quickly filter to stale, failed, paused, or recently changed automations.
4. They can act immediately from the list.

Success condition:

The user no longer needs to remember where a given automation lives or which token it came from in order to maintain it.

### Flow E: Resolve an automation issue

Goal: Move from warning to resolution without confusion.

Expected experience:

1. The product surfaces that an automation needs attention.
2. The user can jump directly into the relevant automation.
3. They can understand the issue in terms of source, outputs, and impact.
4. They can fix, rerun, pause, or intentionally leave it alone.

Success condition:

Issue states feel actionable and contained, not scattered or alarming.

## Information Architecture Direction

Recommended product structure:

- Tokens
- Library
- Automations
- Canvas
- Publish

Within `Tokens`, the relationship should be clear:

- `Library` is where designers browse and edit authored tokens.
- `Automations` is where designers create and maintain systems that generate or manage tokens.

This keeps automation close to authoring without making it compete with health, export, or publish tools.

## UX Requirements

The redesign should satisfy these product requirements:

1. A designer can find automation from the Tokens workspace without relying on hidden overflow menus.
2. A designer can create an automation from token context, group context, or a generic entry point.
3. A designer can review all automations in one place.
4. A designer can understand source, outputs, and status without opening every automation.
5. A designer can see impact before saving.
6. A designer can understand which tokens are automation-managed.
7. A designer can move from stale or failed state to the relevant automation in one step.
8. Required output decisions are always visible during setup.
9. The language remains consistent across the entire experience.
10. The UI feels native to Figma: dense, calm, and low-noise.

## Success Criteria

The redesign is successful when the following statements are true:

- Designers describe automation as easy to find.
- Designers understand what an automation controls before saving it.
- Designers can explain the difference between authored tokens and automation-managed tokens.
- Designers can find every automation that needs attention from one place.
- Designers can maintain an existing automation without hunting through multiple panels.
- Designers no longer need to learn separate mental models for "recipe", "semantic aliases", and "generated scale" behavior.

Launch-readiness acceptance criteria:

- A first-time user can discover `New automation` from the main Tokens workspace.
- A designer can create a common automation without encountering hidden required settings.
- A designer can identify stale, failed, paused, and healthy automations from the management list.
- A designer can navigate from a managed token to its owning automation and back.
- A designer can understand exactly where outputs will be written before saving.

## Risks To Avoid

1. Turning automation into a second dashboard product

The experience should remain tightly connected to token authoring, not become a detached operations center.

2. Over-explaining simple workflows

The target user is sophisticated. The UI should clarify consequences, not narrate every concept.

3. Preserving broken terminology for continuity

Because the product has not shipped, clarity matters more than compatibility.

4. Hiding complexity behind too many collapses

Progressive disclosure is useful, but required setup and critical impact information should stay visible.

5. Treating Health as the primary automation interface

Health should summarize and triage. It should not become the only place where automation feels manageable.

## Open Product Questions

1. Should `Automations` appear as a full section within `Tokens`, or as a persistent split mode alongside the library?
2. Should semantic aliases remain a highlighted quick-start path within automation creation, or simply one automation type among peers?
3. What is the clearest designer-facing language for multi-brand output so it reads as a design-system pattern rather than a technical configuration mode?
4. What summary fields matter most in the automation list: source token, target path, collection, last run, managed token count, or issue state?

## Final Direction

The redesign should reposition automation from a buried expert feature into a clear, reliable design-system capability.

The experience should help designers feel:

- "I know where automation lives."
- "I understand what this automation will do."
- "I can see what it owns."
- "I can fix or adjust it without fear."

That is the standard for an empowering automation experience in TokenManager.
