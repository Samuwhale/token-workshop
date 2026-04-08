# TokenManager

Local design-token tooling split across a Figma plugin UI and a local API server.

## Agent-Friendly Workflow

The repo now has one preview command that launches everything an agent needs:

```bash
pnpm preview
```

That command does four things:

1. Builds the plugin once so the standalone harness has a fresh `ui.html`.
2. Starts the plugin watch build.
3. Starts the local API server against [`demo/tokens`](/Users/samuel/Documents/Projects/TokenManager/demo/tokens).
4. Starts the standalone browser harness with a mocked Figma bridge.

When it is ready, use these URLs:

- Harness UI: [http://localhost:3200](http://localhost:3200)
- Direct plugin UI: [http://localhost:3200/dist/ui.html](http://localhost:3200/dist/ui.html)
- Demo token docs: [http://localhost:9400/docs](http://localhost:9400/docs)
- Health check: [http://localhost:9400/api/health](http://localhost:9400/api/health)

The harness includes a `Mock Selection` button so the UI can exercise selection-dependent flows without a live Figma canvas.

## Useful Commands

```bash
pnpm preview
pnpm preview -- --dir ./tokens
pnpm preview -- --server-port 9410 --ui-port 3205
pnpm preview:validate
pnpm preview:build
pnpm preview:server
pnpm preview:harness
```

## Backlog Runner

Use the autonomous backlog runner with:

```bash
pnpm backlog
pnpm backlog:validate
```

- `pnpm backlog` starts the TypeScript runner that claims one backlog item at a time, validates it, and can replenish the queue with discovery passes.
- `pnpm backlog:validate` verifies the runner toolchain, prompts, and validation command before a longer autonomous run.
- Implementation runs can emit structured follow-ups into the runner queue; discovery passes still write candidate items to `backlog-inbox.md`.

- `pnpm preview` uses the checked-in demo data.
- `pnpm preview -- --dir ./tokens` points the local server at a real token workspace.
- `pnpm preview -- --server-port 9410 --ui-port 3205` is useful when your normal dev ports are already occupied.
- `pnpm preview:validate` runs the standalone headless UI smoke check.

## Notes

- The standalone harness is for local browser validation only. The real plugin still runs inside Figma.
- The watch build now keeps `packages/figma-plugin/dist/ui.html` in sync, so the harness reflects current changes instead of a stale one-off build.
