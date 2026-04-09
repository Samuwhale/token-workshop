import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { summarizeCommandOutput } from './command-output.js';
import { ensureConfigReady, resolveRunOptions } from './config.js';
import { inspectBacklogState } from './context.js';
import { PLANNER_RESULT_SCHEMA, PLANNER_SCHEMA_SMOKE_PROMPT } from './planner.js';
import { createCommandRunner } from './process.js';
import { validateProvider } from './providers/index.js';
import { lintBacklogQueue } from './queue-lint.js';
import type { BacklogRunnerConfig, CommandRunner, RunOverrides, ToolValidationResult } from './types.js';

const VALIDATION_COMMAND_TIMEOUT_MS = 20 * 60 * 1000;
const GIT_READINESS_TIMEOUT_MS = 2 * 60 * 1000;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export type ValidateDependencies = {
  commandRunner?: CommandRunner;
};

export async function validateCommandReadiness(
  config: BacklogRunnerConfig,
  commandRunner: CommandRunner = createCommandRunner(),
): Promise<{ ok: boolean; message: string }> {
  const bashScriptMatch = config.validationCommand.match(/^\s*bash\s+([^\s]+)\s*$/);
  if (bashScriptMatch) {
    const scriptPath = bashScriptMatch[1]!;
    const absoluteScriptPath = scriptPath.startsWith('/')
      ? scriptPath
      : path.resolve(config.projectRoot, scriptPath);

    if (!(await fileExists(absoluteScriptPath))) {
      return { ok: false, message: '  ✗ validation command script not found' };
    }

    const syntaxCheck = await commandRunner.run('bash', ['-n', absoluteScriptPath], { ignoreFailure: true });
    if (syntaxCheck.code !== 0) {
      return { ok: false, message: '  ✗ validation command failed bash syntax check' };
    }

    return { ok: true, message: '  ✓ validation command script is present and syntactically valid' };
  }

  const firstToken = config.validationCommand.trim().split(/\s+/)[0];
  if (!firstToken) {
    return { ok: false, message: '  ✗ validation command is empty' };
  }

  const check = await commandRunner.runShell(`command -v ${shellEscape(firstToken)}`, {
    cwd: config.projectRoot,
    ignoreFailure: true,
  });
  if (check.code !== 0) {
    return { ok: false, message: `  ✗ validation command executable '${firstToken}' not found` };
  }

  return { ok: true, message: `  ✓ validation command executable '${firstToken}' is available` };
}

export async function executeValidationCommand(
  config: BacklogRunnerConfig,
  commandRunner: CommandRunner = createCommandRunner(),
): Promise<{ ok: boolean; message: string }> {
  const startedAt = Date.now();
  const result = await commandRunner.runShell(config.validationCommand, {
    cwd: config.projectRoot,
    timeoutMs: VALIDATION_COMMAND_TIMEOUT_MS,
    ignoreFailure: true,
  });
  const durationSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
  if (result.code === 0) {
    return { ok: true, message: `  ✓ validation command executed successfully (${durationSeconds}s)` };
  }

  return {
    ok: false,
    message: `  ✗ validation command failed at runtime (${durationSeconds}s): ${summarizeCommandOutput(result.stdout, result.stderr)}`,
  };
}

export async function validateGitReadiness(
  config: BacklogRunnerConfig,
  worktreesEnabled: boolean,
  commandRunner: CommandRunner = createCommandRunner(),
): Promise<{ ok: boolean; messages: string[] }> {
  const messages: string[] = [];

  const git = await commandRunner.which('git');
  if (!git) {
    return { ok: false, messages: ['  ✗ git CLI not found'] };
  }
  messages.push('  ✓ git CLI found');

  const repoCheck = await commandRunner.run('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: config.projectRoot,
    timeoutMs: GIT_READINESS_TIMEOUT_MS,
    ignoreFailure: true,
  });
  if (repoCheck.code !== 0 || repoCheck.stdout.trim() !== 'true') {
    messages.push('  ✗ project root is not a git worktree');
    return { ok: false, messages };
  }
  messages.push('  ✓ project root is a git worktree');

  if (!worktreesEnabled) {
    return { ok: true, messages };
  }

  const worktreeDir = await mkdtemp(path.join(tmpdir(), 'backlog-validate-worktree-'));
  try {
    const add = await commandRunner.run('git', ['worktree', 'add', '--detach', worktreeDir, 'HEAD', '--quiet'], {
      cwd: config.projectRoot,
      timeoutMs: GIT_READINESS_TIMEOUT_MS,
      ignoreFailure: true,
    });
    if (add.code !== 0) {
      messages.push('  ✗ git worktree add failed');
      return { ok: false, messages };
    }
    messages.push('  ✓ git worktree add/remove succeeded');

    const remove = await commandRunner.run('git', ['worktree', 'remove', worktreeDir, '--force'], {
      cwd: config.projectRoot,
      timeoutMs: GIT_READINESS_TIMEOUT_MS,
      ignoreFailure: true,
    });
    if (remove.code !== 0) {
      messages.push('  ✗ git worktree remove failed');
      return { ok: false, messages };
    }

    await commandRunner.run('git', ['worktree', 'prune'], {
      cwd: config.projectRoot,
      timeoutMs: GIT_READINESS_TIMEOUT_MS,
      ignoreFailure: true,
    });
    return { ok: true, messages };
  } finally {
    await rm(worktreeDir, { recursive: true, force: true });
  }
}

export async function validateBacklogState(config: BacklogRunnerConfig): Promise<{ ok: boolean; messages: string[] }> {
  const messages: string[] = [];
  const state = await inspectBacklogState(config);
  const legacyInboxPath = path.join(config.projectRoot, 'backlog-inbox.md');
  const legacyInboxExists = await fileExists(legacyInboxPath);

  if (state.taskSpecCount === 0 && state.hasLegacyTasks) {
    messages.push('  ✗ backlog is still in legacy markdown mode; create task specs in backlog/tasks before autonomous runs');
    return { ok: false, messages };
  }

  if (state.taskSpecCount > 0 && !state.generatedReport) {
    messages.push('  ✗ backlog.md is not the generated task report; run `pnpm backlog:sync` to rebuild it from task specs');
    return { ok: false, messages };
  }

  if (state.taskSpecCount === 0) {
    messages.push('  ⚠ no task specs found yet; the queue is empty until you sync or add task YAML files');
  } else {
    messages.push(`  ✓ task spec store is populated (${state.taskSpecCount} task spec${state.taskSpecCount === 1 ? '' : 's'})`);
  }

  if (state.generatedReport) {
    messages.push('  ✓ backlog.md is the generated report');
  }

  if (legacyInboxExists) {
    messages.push('  ✗ legacy backlog-inbox.md still exists; delete it and use backlog/inbox.jsonl only');
    return { ok: false, messages };
  }

  if (!(await fileExists(config.files.candidateQueue))) {
    messages.push('  ✗ candidate queue file not found');
    return { ok: false, messages };
  }

  messages.push('  ✓ candidate queue file found');

  return { ok: true, messages };
}

export async function validatePromptContracts(config: BacklogRunnerConfig): Promise<{ ok: boolean; messages: string[] }> {
  const messages: string[] = [];
  const promptChecks: Array<[string, string]> = [
    ['planner pass prompt', config.prompts.planner],
    ['product pass prompt', config.prompts.product],
    ['ux pass prompt', config.prompts.ux],
    ['code pass prompt', config.prompts.code],
  ];

  let ok = true;
  for (const [label, filePath] of promptChecks) {
    const content = await readFile(filePath, 'utf8');
    if (content.includes('backlog-inbox.md') || content.includes('Every item MUST start with `- [ ] `')) {
      ok = false;
      messages.push(`  ✗ ${label} still references legacy markdown planner output`);
      continue;
    }
    messages.push(label === 'planner pass prompt'
      ? '  ✓ planner pass prompt uses structured refinement instructions'
      : `  ✓ ${label} uses structured candidate queue instructions`);
  }

  const agentPrompt = await readFile(config.prompts.agent, 'utf8');
  if (agentPrompt.includes('Do NOT report success unless that injected validation command exits 0.')) {
    ok = false;
    messages.push('  ✗ agent prompt still requires the final validation command before success');
  } else {
    messages.push('  ✓ agent prompt leaves authoritative final validation to the scheduler');
  }

  return { ok, messages };
}

export async function validateBacklogRunner(
  config: BacklogRunnerConfig,
  overrides: RunOverrides = {},
  deps: ValidateDependencies = {},
): Promise<ToolValidationResult> {
  await ensureConfigReady(config);
  const commandRunner = deps.commandRunner ?? createCommandRunner();
  const runOptions = await resolveRunOptions(config, overrides);
  const providerValidation = await validateProvider(runOptions.tool, commandRunner, {
    model: runOptions.model,
    smokeTests: [
      {
        label: 'planner schema',
        schema: PLANNER_RESULT_SCHEMA,
        prompt: PLANNER_SCHEMA_SMOKE_PROMPT,
        expectedItem: 'planner-smoke',
      },
    ],
  });

  const messages = [...providerValidation.messages];
  messages.push(`  → Model: ${runOptions.model ?? 'CLI default'}`);
  messages.push(`  → Pass model: ${runOptions.passModel ?? 'CLI default'}`);
  messages.push('  → Structured output: strict');

  const requiredFiles = [
    ['backlog.md', config.files.backlog],
    ['candidate queue', config.files.candidateQueue],
    ['task specs dir', config.files.taskSpecsDir],
    ['patterns.md', config.files.patterns],
    ['agent prompt', config.prompts.agent],
    ['planner pass prompt', config.prompts.planner],
    ['product pass prompt', config.prompts.product],
    ['ux pass prompt', config.prompts.ux],
    ['code pass prompt', config.prompts.code],
  ] as const;

  let ok = providerValidation.ok;
  for (const [label, filePath] of requiredFiles) {
    if (await fileExists(filePath)) {
      messages.push(`  ✓ ${label} found`);
    } else {
      ok = false;
      messages.push(`  ✗ ${label} not found`);
    }
  }

  if (config.files.models) {
    messages.push((await fileExists(config.files.models)) ? '  ✓ models.json found' : '  ⚠ models.json not found');
  }

  const backlogState = await validateBacklogState(config);
  if (!backlogState.ok) {
    ok = false;
  }
  messages.push(...backlogState.messages);

  const queueLint = await lintBacklogQueue(config);
  if (!queueLint.ok) {
    ok = false;
  }
  messages.push(...queueLint.messages);

  const promptContracts = await validatePromptContracts(config);
  if (!promptContracts.ok) {
    ok = false;
  }
  messages.push(...promptContracts.messages);

  const gitReadiness = await validateGitReadiness(config, runOptions.worktrees, commandRunner);
  if (!gitReadiness.ok) {
    ok = false;
  }
  messages.push(...gitReadiness.messages);

  const validationCommand = await validateCommandReadiness(config, commandRunner);
  if (!validationCommand.ok) {
    ok = false;
    messages.push(validationCommand.message);
    return { ok, messages };
  }
  messages.push(validationCommand.message);

  const validationExecution = await executeValidationCommand(config, commandRunner);
  if (!validationExecution.ok) {
    ok = false;
  }
  messages.push(validationExecution.message);

  return { ok, messages };
}
