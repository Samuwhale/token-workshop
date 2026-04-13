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
    planner: './scripts/backlog/planner.md',
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
  },
  defaults: {
    workers: 2,
    passes: true,
    worktrees: true,
  },
  passes: {
    'product-pass': {
      kind: 'discovery',
      promptFile: './scripts/backlog/passes/product-pass.md',
      runner: {
        tool: 'codex',
        model: 'gpt-5.4',
      },
    },
    'interface-pass': {
      kind: 'discovery',
      promptFile: './scripts/backlog/passes/interface-pass.md',
      runner: {
        tool: 'claude',
        model: 'claude-opus-4-6',
      },
    },
    'ux-pass': {
      kind: 'discovery',
      promptFile: './scripts/backlog/passes/ux-pass.md',
      runner: {
        tool: 'claude',
        model: 'claude-opus-4-6',
      },
    },
    'code-pass': {
      kind: 'discovery',
      promptFile: './scripts/backlog/passes/code-pass.md',
      runner: {
        tool: 'codex',
        model: 'gpt-5.4',
      },
    },
  },
};
