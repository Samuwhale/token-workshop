# Token Library View Review

## Purpose

This document captures the current UI, UX, and layout findings for the token library view, with a focus on how well it serves the product's primary users:

- Figma UI designers
- UX designers
- design system creators and maintainers

It is intentionally written as a product and design review, not a technical implementation review.

## Context

TokenManager is not a generic token dashboard. It is a design tool that lives inside a Figma-centered workflow.

That has a few important implications:

- The primary mental model should feel close to Figma, especially around collections, modes, browsing, editing, and scanning values.
- The UI should help designers work quickly and confidently without translating through developer-centric concepts.
- Advanced developer-facing capabilities are still important, but they should not crowd the main authoring experience.
- Because the product is still in active development and has no legacy user base, this is the right time to simplify aggressively rather than preserve clutter or mixed paradigms.

## Overall Assessment

The current token library view has strong raw capability, but it does not yet feel focused enough around the primary authoring job.

The main issue is not visual style. The issue is information architecture and interface density.

Right now the view behaves like a powerful internal control surface:

- many states are visible at once
- many actions compete for attention
- several workflows sit side by side in the same band of UI
- the table is not always allowed to be the dominant surface

For designers, this creates unnecessary interpretation cost. The user is asked to parse toolbars, strips, banners, counts, chips, and state indicators before they can settle into the actual work of browsing and editing tokens.

## What Good Looks Like

For this product, the strongest reference point is not a generic SaaS admin table. It is a hybrid of:

- Figma's variables experience for the primary authoring mental model
- Tokens Studio's scalable table and library-management ideas for advanced workflows

The ideal outcome is:

- collection-first
- mode-first
- table-centered
- calm by default
- detailed on demand

The user should feel that the library is a clear workspace, not a cockpit.

## Comparison With Figma

Figma gets several things right that are directly relevant here:

- Collections feel like the main container, not one concept among many.
- Modes are treated as first-class values, not as optional layers on top of a base value.
- The variable table is the main event. Surrounding chrome stays restrained.
- The layout makes scanning easy: name on the left, values across, details when needed.
- Secondary actions do not dominate the top of the screen.

This matters because your AGENTS guidance explicitly says to align to the Figma mental model:

- collections are the primary container
- modes belong to collections
- every token value is a mode value
- all modes should be visible simultaneously

The current library already moves in that direction conceptually, but the surrounding UI still dilutes that clarity.

## Comparison With Tokens Studio

Tokens Studio is a useful comparison, but not the model to copy wholesale.

It is strong at:

- handling large token inventories
- exposing advanced filtering and bulk workflows
- supporting power users who think in systems and token operations

But Tokens Studio also leans more heavily into token-management complexity. That makes sense for its product, yet it can also become dense and tool-like.

For TokenManager, the useful lesson is:

- borrow its organizational strength
- do not inherit its complexity as the default surface

The main authoring experience should still feel more like a natural extension of Figma than like a token operations console.

## Core User Needs

The token library view should primarily help users do five things well:

1. Understand where they are

Users should instantly know:

- which collection they are in
- what modes exist
- what values they are looking at

2. Scan quickly

Users should be able to visually skim names and values without decoding extra interface chrome.

3. Edit confidently

The editing model should feel obvious:

- click a token
- inspect or edit it
- see all mode values clearly

4. Move between browsing and detail smoothly

The main table should support broad scanning, while a contextual detail surface handles depth and advanced actions.

5. Access advanced workflows without clutter

Things like health, history, export, git, sync, compare, and generator workflows should be easy to find, but they should not dominate the default browsing state.

## Main Problem Areas

## 1. Too Much Top-Level Chrome

The top area of the library view is carrying too many responsibilities at once.

Instead of one clear header, the user encounters a stack of interface bands and state surfaces. This makes the top of the view feel busy before the user even gets to the tokens.

Why this is a problem:

- it weakens focus on the table
- it increases cognitive load
- it makes the view feel more operational than authoring-oriented

Design consequence:

- the token list no longer reads as the primary surface

## 2. Too Many Parallel Workflows in the Same Place

The current experience mixes several categories of work into the same immediate area:

- browsing tokens
- filtering/searching
- batch editing
- selection-aware inspection
- health review
- generator maintenance
- collection management
- sync and developer-adjacent workflows

Each of these workflows is valid. The issue is that they are competing for the same visual priority.

Why this is a problem:

- designers have to interpret the system before using it
- advanced features raise the complexity of the default path
- the interface becomes harder to learn and harder to trust

## 3. The Table Is Not Dominant Enough

The core value of this view is the token table itself:

- token names
- group structure
- mode columns
- editable values

That should be the unquestioned center of gravity.

Today, the table shares that role with too much scaffolding. The result is that the user spends more time navigating the interface than reading token information.

Why this is a problem:

- scanning slows down
- hierarchy weakens
- the core job of authoring tokens loses clarity

## 4. The Collection Experience Is Too Instrumented

The collection rail currently communicates a lot:

- counts
- mode information
- issue information
- actions

That creates a rail that feels informationally dense rather than decisively navigational.

What users usually need from the rail:

- quick orientation
- quick switching
- quick creation

What they do not need most of the time:

- a mini dashboard for every collection

Why this is a problem:

- it increases noise on the left side
- it makes selection slower
- it adds metadata before intent is established

## 5. Rows Carry Too Much Secondary Meaning

Token rows are trying to communicate many kinds of state at once:

- identity
- alias behavior
- generated status
- issue status
- reference state
- lifecycle
- favorites
- selection state
- preview state

Any one of these may be useful. In aggregate, they make rows harder to parse.

Why this is a problem:

- the name and values stop being the clearest information
- the user needs to visually negotiate the row before acting
- the interface starts to reward familiarity rather than clarity

## 6. Search and Filtering Lean Too Abstract

Advanced search is powerful, but the primary authoring surface should not assume that users want to think in filtering syntax and system state.

Designers usually want to:

- find a token by name
- narrow by familiar categories
- inspect what is relevant to the current collection or selection

They do not want the interface to lead with a power-query mindset unless they explicitly opt into it.

Why this is a problem:

- it introduces jargon and hidden rules
- it increases recall burden
- it shifts the product voice toward internal tool complexity

## 7. Advanced and Developer-Facing Features Need a Clearer Home

The AGENTS guidance is clear on this point: do not remove developer-facing features, but do give them a clear home that does not clutter the designer's primary workflow.

This is one of the most important strategic UX issues in the current view.

The current experience still exposes too much of that complexity in the main authoring space.

Why this is a problem:

- it muddies the product's center of gravity
- it creates role confusion
- it makes the default surface feel more technical than it should

## 8. Typography and Density Are Working Against Readability

The interface is compact, but it is compact in a way that amplifies the complexity around it.

When the UI carries lots of states and controls, very small text and dense spacing make the experience feel even more compressed.

Why this is a problem:

- scanning becomes more tiring
- secondary content starts competing with primary content
- the overall impression becomes "dense and technical" instead of "clear and confident"

## Design Principles the Overhaul Should Follow

## 1. Make Collections and Modes the Clear Narrative

The whole view should reinforce one story:

- choose a collection
- see its tokens
- see all modes
- edit values

Anything that weakens that story should be reconsidered.

## 2. Keep the Default Surface Calm

The first visible state should support everyday authoring, not edge cases and maintenance.

Calm does not mean minimal capability. It means:

- fewer competing surfaces
- fewer persistent status treatments
- fewer visible decisions at once

## 3. Put Detail on Demand

If information is useful but not needed for every row, every token, or every moment, move it into:

- the right inspector
- hover or context menus
- dedicated panels
- explicit advanced modes

## 4. Prefer Recognition Over Interpretation

Labels, grouping, and interactions should read naturally to Figma users.

The interface should not ask people to decode token-management abstractions before doing basic work.

## 5. Separate Primary and Secondary Jobs

Primary job:

- browse, compare, create, and edit tokens across modes

Secondary jobs:

- audit
- publish
- export
- inspect history
- review health
- manage sync
- run advanced batch operations

The primary job should own the default surface.

## Recommended Overhaul Direction

## A. Reframe the Library as a Four-Part Workspace

The library should feel like one clear workspace with four regions:

1. Collections rail

- simple
- fast to scan
- clearly navigational

2. Compact library header

- current collection
- primary create action
- search
- filter entrypoint
- overflow menu

3. Token table

- main focal area
- token and group hierarchy on the left
- all modes visible as equal columns
- values easy to scan and edit

4. Contextual inspector

- detailed token or group information
- advanced actions
- health, metadata, history, and system-facing detail

This structure would immediately improve focus.

## B. Reduce the Number of Persistent Bands Above the Table

The top of the screen should not behave like a stack of stacked toolbars and system notices.

Suggested direction:

- keep one primary header
- show contextual notices only when truly necessary
- collapse optional surfaces into explicit entry points

The table should sit closer to the top and take visual ownership of the view.

## C. Simplify the Collections Rail

The rail should primarily answer:

- what collections exist?
- which one is selected?
- how do I switch or add one?

Suggested direction:

- prioritize names over counts and status detail
- keep per-row metadata minimal
- move advanced collection actions into collection setup/details
- treat the rail as navigation, not inspection

## D. Make the Table More Obviously Figma-Like

The table should lean harder into the variables-style mental model:

- one clear identity column
- one visible column per mode
- all mode values visible together
- mode creation and management anchored around the header area

This should feel natural enough that designers do not need explanation.

## E. Simplify Row Presentation

Every row should prioritize:

- token or group name
- core value information
- one or two essential signals at most

Suggested direction:

- keep identity and value information persistent
- reduce always-visible metadata
- move richer state into the inspector or hover
- avoid rows that read like compressed status summaries

## F. Make Search Feel Plain First, Advanced Second

Suggested direction:

- default to simple text search
- add a clearer advanced filter builder as an explicit step
- keep advanced query behavior available without making it the dominant UX pattern

This supports both newcomers and power users without forcing everyone into the same interaction style.

## G. Give Developer Features a Deliberate Secondary Home

Suggested direction:

- keep health, export, history, git, sync, compare, and audit visible in the product architecture
- do not keep them in the main authoring band by default
- surface them in the right inspector, dedicated sections, or explicit maintenance views

This respects both audiences without forcing one audience's needs into the other's daily path.

## H. Improve Readability Through Hierarchy, Not Decoration

The view does not need more decorative treatments. It needs better hierarchy.

Suggested direction:

- slightly larger, calmer text
- stronger emphasis on names and values
- lighter treatment of secondary state
- fewer chips, counters, and inline status fragments

The goal is confidence and legibility, not ornament.

## What Should Stay

Not everything needs to change. Several underlying directions are already right:

- the product is already centered on collections and modes conceptually
- showing all modes simultaneously is the right model
- the table-based authoring approach is correct
- advanced workflows should remain in the product
- contextual detail surfaces are the right place for depth

The overhaul should preserve those strengths while reducing clutter and clarifying priority.

## Strategic Recommendation

Do not treat this as a visual polish task.

This should be treated as an information architecture and workflow simplification task.

If the redesign only adjusts styling while preserving the same number of competing surfaces and visible concerns, the result will still feel dense.

The real opportunity is to make TokenManager feel like:

- a designer-first token workspace
- grounded in Figma's mental model
- powerful without being noisy
- capable without being intimidating

## Desired Outcome

A successful overhaul should make the token library feel:

- clearer on first glance
- faster to scan
- easier to learn
- calmer during everyday work
- more aligned with how designers already think in Figma
- better separated between primary authoring and advanced maintenance

The end state should not feel like "more features, better organized."

It should feel like "the right features, in the right place, with the main job finally obvious."

## Reference Notes

The review direction in this document was informed by:

- the product guidance in `AGENTS.md`
- Figma's variables and modes documentation
- Tokens Studio's documentation around token and theme workflows

These references are useful not as templates to copy, but as signals for what your users are already trained to expect.
