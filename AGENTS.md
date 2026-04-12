# TokenManager

## Repository Rules

- Write clean code that is easy to read, maintain, and modify by LLMs and agents.
- Do not take shortcuts or ship hacks.
- This repo is in active development. Favor the simplest clean design over compatibility.
- Do not keep backwards-compatible layers, shims, re-exports, or migration scaffolding.
- Do not keep dead code, legacy code, or unused files around.
- Prefer direct replacements over parallel old/new implementations.
## Tests

- Do NOT write, expand, or refactor tests unless explicitly asked.
- When tests are needed: test behavior not internals, parameterize with `test.each()`, skip trivial logic.
