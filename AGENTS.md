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

## Tests

- Do NOT write, expand, or refactor tests unless explicitly asked
- When tests are needed: test behavior not internals, parameterize with `test.each()`, skip trivial logic

## UI Guidance

- Never use eyebrow text, overlines, or similar pre-heading label treatments
- Be extremely wary of chrome and UI clutter
- Remove or avoid any decorative controls, wrappers, labels, or helper surfaces that do not materially improve comprehension or task flow
- Prefer fewer visible elements, clearer hierarchy, and more whitespace over dense control-heavy layouts
- Do not add informational pills, chips, or badges just to restate nearby content
- Only use pills or badges when they carry meaningful status, filtering, or interaction value that would otherwise be unclear
