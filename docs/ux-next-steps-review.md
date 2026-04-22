# TokenManager Product Review

## Purpose

This document reviews TokenManager as a product experience inside Figma.

It focuses on:

- product clarity
- authoring confidence
- information architecture
- workflow ranking
- structural trust
- usability for real design system work

The question is not whether the product is capable.

It is.

The question is whether the product makes the right work feel obvious, calm, and trustworthy for the people who actually have to use it.

## Audience And Product Reality

TokenManager is primarily for Figma designers and design system maintainers.

That means the product must feel native to design work first.

It also needs to support governance, review, history, export, and delivery work without making the core design workflow feel administrative.

Those jobs are all real.

But they are not all equally foregrounded at every moment.

The product should feel like one coherent system with clearly ranked areas of work:

- authoring and browsing tokens
- applying and extracting tokens from canvas work
- reviewing system quality and change history
- delivering tokens outward with confidence

The product should not feel like one blended control surface where every concern competes for equal attention.

## Core Product Judgment

The product direction is stronger than this document previously gave it credit for.

The overall structure is no longer the main problem.

The product has already moved toward a more disciplined shape, with clearer distinction between token authoring, canvas work, review, and delivery.

That is the right direction.

The remaining weakness is more local and more important:

the primary work surfaces still carry too much density, too much state, and too many adjacent tools competing with the user’s immediate task.

So the product is no longer mainly failing because everything is mixed together.

It is failing because the surfaces where people spend the most time still do not feel settled enough.

## What The Product Gets Right

Several core decisions are strong and should be protected.

### 1. The canonical authoring model is correct

The product is strongest when it stays anchored to collections, modes, and authored tokens.

Collections are the primary container.

Modes belong to collections.

Tokens belong to collections and vary by the modes of their own collection.

That is the right mental model.

### 2. Modes should remain visible together

The product is right when it treats every token value as a mode value and keeps those values visible together.

The UI should not drift back toward:

- a base value plus overrides model
- a single-mode view that hides the rest
- language that implies one mode is primary and the others are secondary

That would make the product easier to explain only by making it less truthful.

### 3. The token table is still the right center of gravity

A serious token tool needs a scan-friendly center.

Users need to move quickly across names, structure, aliases, and values.

The answer to complexity is not replacing that center with a more decorative or more guided surface.

The answer is to make that center quieter, clearer, and easier to trust.

### 4. Canvas context is one of the product’s strongest advantages

The product becomes much more compelling when token work connects directly to design work inside Figma.

That includes:

- understanding what is already bound
- identifying what is missing
- creating or connecting the right token from current context
- extracting existing design values into the system
- repairing broken or stale token usage

This is one of the clearest reasons for the product to exist inside Figma rather than outside it.

### 5. Governance and delivery belong in the product

Health, history, sync, export, and versioning are legitimate parts of the same system.

They should not be hidden or treated as second-class.

But they do need stronger ranking than they currently have inside the working surfaces.

The requirement is not removal.

It is discipline.

## Where The Product Is Still Failing Users

## 1. The Tokens workspace is still too dense

This is the biggest current problem.

The main token authoring surface still carries too many adjacent states and support layers around the core work.

The issue is not that each individual element is indefensible.

The issue is accumulation.

When too many of these show up around the token table:

- guidance
- status
- selection context
- health nudges
- generation nudges
- search state
- review controls
- batch state

the product stops feeling like a stable authoring surface and starts feeling like a command center.

That is wrong for the target users.

Designers need the token table to feel like the obvious place where token work happens.

It should not feel surrounded by operational framing.

## 2. The Canvas workspace is valuable but still overloaded

Canvas should feel like the most natural bridge between design work and token work.

It already has the right kinds of capabilities.

The problem is that the main selection workflow still tries to do too many things at once:

- inspect
- bind
- create
- extract
- suggest
- repair
- apply
- deep inspect nested layers

Those are all valid tasks.

But they do not yet feel ranked tightly enough inside one working surface.

The result is that the user has to parse the tool before confidently acting through it.

That is exactly the kind of cognitive work the product should be removing.

## 3. The product still has a support-material accumulation problem

The product remains too willing to show helpful information at the same time as primary work.

The standard should be much stricter:

if something does not help the next decision, it should not compete with the current task.

This matters especially in a Figma plugin, where space is constrained and scanning speed matters.

Too much visible support material makes the product feel heavier and more process-oriented than the target users want.

## 4. The distinction between primary and secondary actions is still too weak

The product includes many valid actions:

- create
- import
- extract
- bulk edit
- compare
- generate
- review issues
- apply to Figma

But the product still does not rank those actions firmly enough within the screens where they appear.

Users should not have to decide, by inspection, which actions are primary for the moment and which are optional or advanced.

That ranking should be obvious from the interface itself.

## 5. The product still sounds too much like internal tooling in places

The voice is disciplined, but it is not always grounded enough in design-system work inside Figma.

When the language becomes too infrastructural or too operational:

- design tasks feel heavier than they are
- maintainers have to translate system language into task language
- the product starts sounding organized around machinery instead of user intent

This product should sound precise, calm, and design-literate.

It should not sound like users are operating an internal platform.

## 6. The beginning is recognized, but the landing is not strong enough

The product now recognizes the right ways people begin:

- bring in an existing system
- author a system directly
- start from current file or canvas context

That is good.

The remaining problem is what happens next.

After a user chooses a start, the product should land them in a workflow that feels immediately clear and stable.

Right now, the starts are more correct than the landings.

## Priority Product Direction

## Priority 0: Simplify the primary authoring surface

The main Tokens workspace should become noticeably quieter.

The token table needs to dominate.

Everything around it should justify its presence against one standard:

does this help the next token decision right now?

If not, it should move, collapse, or become more contextual.

## Priority 1: Make Canvas feel like one decisive bridge

Canvas should become a cleaner path from design context to token action.

The product should make the next move obvious with minimal interpretation:

- understand what is bound
- see what is missing
- create or connect the right token
- extract when appropriate
- repair when necessary

This should feel direct rather than tool-heavy.

## Priority 2: Strengthen action ranking inside each workspace

The product does not mainly need another structural reorganization.

It needs stronger local discipline.

Within each workspace, users should immediately understand:

- what this screen is primarily for
- which actions are the main path
- which actions are supportive
- which actions are advanced

That is where the next UX gains are.

## Priority 3: Sharpen the language

The product should use language that matches how designers and design system maintainers think in Figma.

It should be exact without sounding infrastructural.

It should feel calm, confident, and concrete.

## What Not To Do

The response to these problems should not be:

- flattening the domain model to make the product seem simpler
- reintroducing a base-value mental model for multi-mode tokens
- replacing the token table with a more decorative center
- hiding governance and delivery work as if they were unimportant
- reorganizing the whole shell again before improving the core surfaces
- adding more explanatory UI to compensate for overloaded workflows
- making generators feel like the preferred way to create a serious system

## Final Decision

TokenManager no longer mainly suffers from a lack of structure.

It suffers from insufficient restraint inside the places where the real work happens.

The next phase should focus on:

- making the Tokens workspace feel quieter and more authoritative
- making Canvas feel more direct and decisive
- reducing support-material accumulation
- clarifying action ranking inside each screen
- keeping the product rooted in Figma-native mental models

Until that becomes true, the product will continue to feel more capable than calm.
