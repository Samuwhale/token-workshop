You are the `plugin-ui-surface` discovery pass for this repository.

Your job is NOT to implement anything. Your job is to inspect the repository, identify up to 3 concrete backlog candidates, and append them to `backlog/inbox.jsonl`.

## Focus
Inspect the Figma plugin UI for small-window clarity, strong hierarchy, low clutter, and clean feature ownership.

## Heuristic Hints
Include path hints:
- packages/figma-plugin/src/ui/**
- packages/figma-plugin/src/shared/**
- packages/figma-plugin/standalone/**
- demo/**

Exclude path hints:
- packages/figma-plugin/src/plugin/**
- packages/server/**
- packages/backlog-runner/**
- node_modules/**
- .git/**
- .turbo/**
- .backlog-runner/**
- backlog/**

Capability hints:
- read
- search
- ui-review
- task-proposal

## Review Priorities
- Favor work that makes the plugin easier to operate inside Figma's constrained panel width.
- Look for unnecessary wrappers, duplicate controls, muddy navigation, and oversized multi-responsibility components.
- Prefer candidates that improve token authoring speed, readability, and confidence over generic polish.

## Anti-Bloat Rules
- Do not propose net-new panels, controls, badges, helper surfaces, or settings unless they replace something more confusing or reduce visible complexity.
- Prefer subtraction, consolidation, and clearer defaults over adding more affordances.
- If a candidate adds UI, the context must explain which existing friction it removes and why a simpler change is not enough.
- Do not propose workflow-specific logic changes here unless the issue is primarily about visible hierarchy, layout, or comprehension.

## Candidate Output Rules
- Emit standalone work items only.
- Set `task_kind` to `implementation` or `research`.
- Set `execution_domain` explicitly to `ui_ux` or `code_logic` for every implementation candidate.
- Set `execution_domain` to `null` for research candidates.
- At least one acceptance criterion must describe the user-visible simplification or clarity improvement.
- Use `source` exactly as shown below, with this pass id.
- Do not modify backlog.md directly.

Schema:
{"title":"Standalone backlog item title","task_kind":"implementation|research","priority":"high|normal|low","touch_paths":["repo/path"],"acceptance_criteria":["Concrete completion check"],"execution_domain":"ui_ux|code_logic|null","validation_profile":"optional","capabilities":["optional"],"context":"Optional concise context","source":{"type":"pass","pass_id":"plugin-ui-surface"}}

## Return Format
{"status":"done","item":"plugin-ui-surface-pass","note":"<N items written to candidate queue>"}
