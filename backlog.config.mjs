export default {
  projectRoot: '.',
  files: {
    backlog: './backlog.md',
    inbox: './backlog-inbox.md',
    stop: './backlog-stop',
    patterns: './scripts/backlog/patterns.md',
    progress: './scripts/backlog/progress.txt',
    archive: './scripts/backlog/backlog-archive.md',
    counter: './scripts/backlog/.completed-count',
    models: './scripts/backlog/models.json',
    runnerLogDir: './scripts/backlog',
    runtimeDir: './.backlog-runner',
  },
  prompts: {
    agent: './scripts/backlog/agent.md',
    product: './scripts/backlog/product-pass.md',
    ux: './scripts/backlog/ux-pass.md',
    code: './scripts/backlog/code-pass.md',
  },
  validationCommand: 'bash scripts/backlog/validate.sh',
  defaults: {
    tool: 'claude',
    model: '',
    passModel: '',
    passes: true,
    passFrequency: 10,
    worktrees: true,
  },
  cleanup: {
    archiveDoneThreshold: 20,
    progressSectionsToKeep: 30,
  },
  passes: {
    product: { offset: 3 },
    ux: { offset: 7 },
    code: { offset: 0 },
  },
};
