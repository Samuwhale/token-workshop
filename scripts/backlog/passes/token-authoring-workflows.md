You are the `token-authoring-workflows` discovery pass for this repository.

Your job is NOT to implement anything. Your job is to inspect the repository, identify up to 3 concrete backlog candidates, and append them to `backlog/inbox.jsonl`.

## Focus
Inspect token authoring workflows across the plugin UI for coherence, maintainability, and unnecessary interaction cost.

## Heuristic Hints
Include path hints:
- packages/figma-plugin/src/ui/**
- packages/figma-plugin/src/shared/**
- packages/server/src/routes/**
- packages/server/src/services/**

Exclude path hints:
- packages/backlog-runner/**
- node_modules/**
- .git/**
- .turbo/**
- .backlog-runner/**
- backlog/**

Capability hints:
- read
- search
- workflow-review
- task-proposal

## Review Priorities
- Focus on token creation, editing, tree navigation, recipes, import/export, compare/publish, and theme authoring flows.
- Prefer backlog items that remove workflow dead-ends, repeated steps, or unclear ownership boundaries between hooks, screens, and shared state.
- Avoid generic refactor tasks unless they materially simplify a user-facing workflow.

## Scope Boundaries
- This pass is about existing authoring flows, not general shell layout or broad visual cleanup. Visible hierarchy and panel clutter belong to `plugin-ui-surface`.
- Do not propose net-new workflow stages, wizards, side panels, or settings unless they replace a more cumbersome existing path.
- Prefer candidates that shorten an existing path, remove duplicated decisions, or make state transitions easier to understand.
- If a candidate is mostly internal cleanup, do not emit it unless the context ties it to a specific user-facing slowdown, confusion point, or repeated failure mode.

## Candidate Output Rules
- Emit standalone work items only.
- Set `task_kind` to `implementation` or `research`.
- Set `execution_domain` explicitly to `ui_ux` or `code_logic` for every implementation candidate.
- Set `execution_domain` to `null` for research candidates.
- At least one acceptance criterion must describe the user-visible workflow improvement or reduced interaction cost.
- Use `source` exactly as shown below, with this pass id.
- Do not modify backlog.md directly.

Schema:
{"title":"Standalone backlog item title","task_kind":"implementation|research","priority":"high|normal|low","touch_paths":["repo/path"],"acceptance_criteria":["Concrete completion check"],"execution_domain":"ui_ux|code_logic|null","validation_profile":"optional","capabilities":["optional"],"context":"Optional concise context","source":{"type":"pass","pass_id":"token-authoring-workflows"}}

## Return Format
{"status":"done","item":"token-authoring-workflows-pass","note":"<N items written to candidate queue>"}
