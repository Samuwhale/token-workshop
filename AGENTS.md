# TokenManager

## Target user

The target user of this app are mainly Figma UI designers, Figma UX designers, Figma Design System Creators/maintainers. These designers might work in conjunction with developers.

## Development Status

This project is in **rapid, active development** and has not shipped to any users. There is no existing userbase to consider.

- Write clean code that is easy for future agents to read, modify, and maintain.
- Backwards compatibility is NOT required
- Legacy code patterns are NOT required — remove or replace them freely
- Dead code is NOT required — delete it instead of leaving it behind
- Breaking changes are welcome and expected
- Design and implementation decisions should optimize for correctness and quality, not migration paths
- Do not add shims, re-exports, deprecation warnings, or compatibility layers
- Do not write hacks or shortcut implementations

## Canonical Domain Model

Keep one canonical authoring model aligned to the Figma mental model: collections are the primary container, modes belong to collections, and tokens belong to collections and vary only by their own collection's modes. Do not reintroduce overlapping `set`, `theme`, or mixed view-state concepts into the domain model; selected modes and hover preview are view state only, and generators are advanced automation layered on top of authored tokens.

## Modes

Modes follow Figma's mental model: every token value IS a mode value. There is no "base value plus optional overrides."

- When a collection has 2+ modes, the UI shows all modes equally (stacked list in editor, columns in token list). The first mode's value maps to `$value` (DTCG requirement); other modes store in `$extensions.tokenmanager.modes`. This is a storage detail — never expose it in UI.
- Do not reintroduce a "base value" concept, a global alias toggle for multi-mode tokens, or a mode-selection dropdown that picks which single mode to view. All modes are visible simultaneously.
- Mode management (add, rename, reorder, delete) lives in the token list column headers — not in a settings panel.
- Each mode field independently accepts literal values or alias references (`{token.path}`).

## Tests

- Do NOT write, expand, or refactor tests unless explicitly asked
- When tests are needed: test behavior not internals, parameterize with `test.each()`, skip trivial logic

## UI Guidance

- Optimize UX and information architecture for how Figma designers already think about their work
- Keep generation inside the normal token-authoring model: a generated group is just a token group inside one collection, not a separate automation workspace or scheduler. Favor quiet, outcome-first flows with immediate preview, inline generated state in the library, and explicit interruption for manual drift (`Edit generator`, `Make manual exception`, `Detach from generator`).
- Prefer mental models, naming, grouping, and flows that feel native to Figma and design-system workflows
- Make primary concepts, actions, and consequences obvious without requiring users to translate from developer-centric terminology
- Keep interaction patterns predictable and easy to learn so designers can build confidence quickly
- Reduce ambiguity: users should be able to understand what something is, why it matters, and what will happen next at a glance
- Favor simple, legible task flows over flexible but abstract or overloaded interfaces
- Never use eyebrow text, overlines, or similar pre-heading label treatments
- Be extremely wary of chrome and UI clutter
- Remove or avoid any decorative controls, wrappers, labels, or helper surfaces that do not materially improve comprehension or task flow
- Prefer fewer visible elements, clearer hierarchy, and more whitespace over dense control-heavy layouts
- Do not add informational pills, chips, or badges just to restate nearby content
- Only use pills or badges when they carry meaningful status, filtering, or interaction value that would otherwise be unclear
