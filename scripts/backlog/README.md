# backlog-runner setup

This folder is the repo-local surface for customizing how `backlog-runner` discovers and executes work.

## Files

- `agent.md`: implementation agent instructions shared by every task run.
- `planner.md`: planner-pass instructions used when vague tasks need to be broken down.
- `passes/*.md`: one prompt file per discovery pass.
- `validate.sh`: starter validation command. Replace this with your real repo checks.
- `models.json`: optional model aliases/crosswalks used by `backlog.config.mjs`.
- `patterns.md`: reusable repo patterns learned during runs.
- `progress.txt`: append-only per-task execution notes.

## How to customize passes

1. Run `backlog-runner setup --agentic` if you want an agent to draft the initial pass set from the current repo.
2. Edit `backlog.config.mjs` to tune validation, workspace settings, provider selection, and discovery passes.
3. Edit `scripts/backlog/passes/<pass-id>.md` to define what each discovery pass should look for and how it should write candidates.
4. Use `backlog-runner pass add <id>` / `remove` / `enable` / `disable` for lightweight pass management.

## Recommended pattern

- Keep the config focused on metadata: runner selection, path hints, and pass lifecycle.
- Keep the prompt files focused on policy and output format.
- Prefer a small number of durable passes that map to real repo surfaces, such as `frontend`, `backend`, `api`, `docs`, `security`, or `deps`.
- Treat agentic setup as a bootstrap aid, not the long-term source of truth. Once generated, the repo-owned config and prompt files should be edited directly.
