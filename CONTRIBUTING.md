# Contributing to Token Workshop

Token Workshop is an open-source Figma token authoring tool. Contributions are welcome when they keep the product simple, maintainable, and aligned with Figma designers' mental models.

## Development

Use Node.js 20 or newer and pnpm 9.

```bash
pnpm install
pnpm preview
```

Useful checks:

```bash
pnpm build
pnpm lint
pnpm preview:validate
```

## Pull Requests

- Keep changes focused and explain the user-facing outcome.
- Preserve the canonical model: collections contain modes, and tokens vary by their own collection's modes.
- Do not add compatibility shims, deprecated aliases, or dead code.
- Do not add or expand tests unless the behavior is release-critical or a maintainer asks for it.
- Include screenshots or a short recording for UI changes.

Maintainers review PRs before merge. There is no formal governance process yet.
