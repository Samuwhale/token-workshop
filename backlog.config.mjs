export default {
  projectRoot: '.',
  files: {
    backlog: './backlog.md',
    candidateQueue: './backlog/inbox.jsonl',
    taskSpecsDir: './backlog/tasks',
    stop: './backlog-stop',
    runtimeReport: './.backlog-runner/runtime-report.md',
    patterns: './scripts/backlog/patterns.md',
    progress: './scripts/backlog/progress.txt',
    stateDb: './.backlog-runner/state.sqlite',
    models: './scripts/backlog/models.json',
    runnerLogDir: './.backlog-runner/logs',
    runtimeDir: './.backlog-runner',
  },
  prompts: {
    agent: './scripts/backlog/agent.md',
    planner: './scripts/backlog/planner-pass.md',
    product: './scripts/backlog/product-pass.md',
    ux: './scripts/backlog/ux-pass.md',
    code: './scripts/backlog/code-pass.md',
  },
  validationCommand: 'bash scripts/backlog/validate.sh',
  validationProfiles: {
    repo: 'bash scripts/backlog/validate.sh',
    core: 'pnpm --filter @tokenmanager/core build',
    server: 'pnpm --filter @tokenmanager/server build',
    plugin: 'pnpm preview:build',
    backlog: 'pnpm --filter @tokenmanager/backlog-runner exec vitest run',
  },
  runners: {
    task: {
      tool: 'codex',
      model: 'default',
    },
    planner: {
      tool: 'claude',
      model: 'opus',
    },
    product: {
      tool: 'claude',
      model: 'sonnet',
    },
    ux: {
      tool: 'claude',
      model: 'opus',
    },
    code: {
      tool: 'codex',
      model: 'default',
    },
  },
  defaults: {
    passes: true,
    worktrees: true,
  },
};
