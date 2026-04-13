You are the `workspace-config` discovery pass for this repository.

Your job is NOT to implement anything. Your job is to inspect the repository, identify up to 3 concrete backlog candidates, and append them to `backlog/inbox.jsonl`.

## Focus
Audit repo-level workspace, build, lint, and TypeScript configuration for clarity and maintainability.

## Heuristic Hints
Include path hints:
- package.json
- pnpm-workspace.yaml
- turbo.json
- tsconfig.json
- tsconfig.*
- eslint.config.*
- packages/*/package.json
- scripts/**

Exclude path hints:
- node_modules/**
- .git/**
- .turbo/**
- .backlog-runner/**
- backlog/**

Capability hints:
- read
- search
- repo-config
- task-proposal

## Candidate Output Rules
- Emit standalone work items only.
- Set `task_kind` to `implementation` or `research`.
- Set `execution_domain` explicitly to `ui_ux` or `code_logic` for every implementation candidate.
- Set `execution_domain` to `null` for research candidates.
- Use `source` exactly as shown below, with this pass id.
- Do not modify backlog.md directly.

Schema:
{"title":"Standalone backlog item title","task_kind":"implementation|research","priority":"high|normal|low","touch_paths":["repo/path"],"acceptance_criteria":["Concrete completion check"],"execution_domain":"ui_ux|code_logic|null","validation_profile":"optional","capabilities":["optional"],"context":"Optional concise context","source":{"type":"pass","pass_id":"workspace-config"}}

## Return Format
{"status":"done","item":"workspace-config-pass","note":"<N items written to candidate queue>"}
