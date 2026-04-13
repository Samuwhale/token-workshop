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
pnpm backlog:status
pnpm backlog:sync
pnpm backlog:doctor
```

- `pnpm backlog` starts the backlog orchestrator through the guided `start` command. In a TTY it offers repo defaults first, then lets you customize workspace mode, workers, discovery behavior when no runnable work remains, and either one all-runner tool/model override or a mixed per-role runner setup such as `taskUi = claude opus`, `taskCode = codex gpt`, and `planner = claude opus`.
- `pnpm backlog -- --yes --workers 3` skips the guided prompt and starts immediately with up to three requested task workers. In shared-workspace mode the runner still executes one task at a time.
- `pnpm backlog:status` shows current queue counts, whether the orchestrator is active, and the key runtime file locations. Add `-- --verbose` to include the live lease, reservation, planner, and blockage sections from the runtime report.
- `pnpm backlog:sync` performs the queue-maintenance step only: drain the structured candidate queue into YAML task specs and rebuild the generated `backlog.md` report.
- `pnpm backlog:doctor` verifies the runner toolchain, prompts, validation command, and queue state before a longer autonomous run. It fails fast if backlog state is still in legacy/stale mode, duplicate task IDs exist, or legacy prompt instructions remain.
- These are the only supported backlog entrypoints. Do not use legacy Codex skill wrappers or edit generated backlog state by hand.
- Task specs live in [`backlog/tasks`](/Users/samuel/Documents/Projects/TokenManager/backlog/tasks).
- [`backlog.md`](/Users/samuel/Documents/Projects/TokenManager/backlog.md) is a stable generated report built from persisted task specs.
- [`.backlog-runner/runtime-report.md`](/Users/samuel/Documents/Projects/TokenManager/.backlog-runner/runtime-report.md) is the live runtime status view for leases, reservations, blockers, and queue counts.
- Runtime coordination lives in `.backlog-runner/state.sqlite`, which tracks active leases, blockers, and reservations outside the Git worktree.
- Discovery passes and implementation follow-ups now write structured JSONL candidate records to [`backlog/inbox.jsonl`](/Users/samuel/Documents/Projects/TokenManager/backlog/inbox.jsonl); the planner step converts those into YAML task specs before they become runnable.
- Rejected candidate records are appended to [`.backlog-runner/candidate-rejections.jsonl`](/Users/samuel/Documents/Projects/TokenManager/.backlog-runner/candidate-rejections.jsonl) with the raw line and rejection reason whenever drain-time parsing, materialization, or duplicate checks drop them.
- Broad `planned` tasks are now refined automatically by a planner pass that supersedes vague parents into runnable child tasks instead of leaving them blocked forever.
- The runner now injects compact digests of patterns, recent progress, and backlog state instead of dumping the full journals into every agent run.

- `pnpm preview` uses the checked-in demo data.
- `pnpm preview -- --dir ./tokens` points the local server at a real token workspace.
- `pnpm preview -- --server-port 9410 --ui-port 3205` is useful when your normal dev ports are already occupied.
- `pnpm preview:validate` runs the standalone headless UI smoke check.

## Notes

- The standalone harness is for local browser validation only. The real plugin still runs inside Figma.
- The watch build now keeps `packages/figma-plugin/dist/ui.html` in sync, so the harness reflects current changes instead of a stale one-off build.
