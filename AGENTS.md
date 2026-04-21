# TokenManager

## Target user

The primary users are Figma UI designers, UX designers, and design system creators/maintainers. They use the plugin to create, edit, and manage design tokens, as well as to use those tokens in Figma to design and prototype interfaces. Developers are a secondary but important audience — designers and developers use this tool together for design-token handoff, collaboration, and shared governance. Design the UI primarily for designers (Figma-native mental models, minimal jargon), but don't cut or hide developer-facing features like audit reports, git history, or export formats. Instead, give developer features a clear home that doesn't clutter the designer's primary workflow.

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
- Each mode field independently accepts literal values or alias references (`{token.path}`).

## Tests

- Do NOT write, expand, or refactor tests unless explicitly asked
- When tests are needed: test behavior not internals, parameterize with `test.each()`, skip trivial logic

## UI Guidance

- Optimize UX and information architecture for how Figma designers already think about their work
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
