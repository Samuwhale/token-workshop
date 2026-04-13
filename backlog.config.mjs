export default {
  projectRoot: '.',
  files: {
    backlog: './backlog.md',
    candidateQueue: './backlog/inbox.jsonl',
    candidateRejectLog: './.backlog-runner/candidate-rejections.jsonl',
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
    interface: './scripts/backlog/interface-pass.md',
    ux: './scripts/backlog/ux-pass.md',
    code: './scripts/backlog/code-pass.md',
  },
  validationCommand: 'bash scripts/backlog/validate.sh',
  validationProfiles: {
    repo: 'bash scripts/backlog/validate.sh',
    core: 'pnpm --filter @tokenmanager/core build',
    server: 'pnpm --filter @tokenmanager/server build',
    plugin: 'pnpm preview:build',
    backlog: 'pnpm --filter backlog-runner exec vitest run',
  },
  heuristics: {
    backlogRuntimePaths: [
      'backlog/',
      '.backlog-runner/',
      'scripts/backlog/',
      'packages/backlog-runner/',
    ],
    uiPathPrefixes: [
      'packages/figma-plugin/src/ui',
    ],
    validationProfileRules: [
      { profile: 'core', pathPrefixes: ['packages/core'] },
      { profile: 'server', pathPrefixes: ['packages/server'] },
      { profile: 'plugin', pathPrefixes: ['packages/figma-plugin'] },
      {
        profile: 'backlog',
        pathPrefixes: [
          'packages/backlog-runner',
          'scripts/backlog',
          'backlog.config.mjs',
          'README.md',
        ],
      },
    ],
  },
  workspaceBootstrap: {
    installCommand: 'pnpm install --frozen-lockfile',
    repairCommand: 'pnpm backlog:doctor --repair',
  },
  runners: {
    taskUi: {
      tool: 'claude',
      model: 'claude-opus-4-6',
    },
    taskCode: {
      tool: 'codex',
      model: 'gpt-5.4',
    },
    planner: {
      tool: 'codex',
      model: 'gpt-5.4',
    },
    product: {
      tool: 'codex',
      model: 'gpt-5.4',
    },
    interface: {
      tool: 'claude',
      model: 'claude-opus-4-6',
    },
    ux: {
      tool: 'claude',
      model: 'claude-opus-4-6',
    },
    code: {
      tool: 'codex',
      model: 'gpt-5.4',
    },
  },
  defaults: {
    workers: 2,
    passes: true,
    worktrees: true,
  },
};
