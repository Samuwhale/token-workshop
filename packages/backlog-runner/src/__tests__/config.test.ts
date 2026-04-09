import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeBacklogRunnerConfig, resolveRunOptions } from '../config.js';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'backlog-config-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => import('node:fs/promises').then(fs => fs.rm(dir, { recursive: true, force: true }))));
});

describe('config', () => {
  it('normalizes relative paths against the config file location', async () => {
    const root = await makeTempDir();
    const config = normalizeBacklogRunnerConfig(
      {
        projectRoot: '.',
        files: {
          backlog: './backlog.md',
          candidateQueue: './backlog/inbox.jsonl',
          stop: './backlog-stop',
          runtimeReport: './.backlog-runner/runtime-report.md',
          patterns: './scripts/backlog/patterns.md',
          progress: './scripts/backlog/progress.txt',
        },
        prompts: {
          agent: './scripts/backlog/agent.md',
          planner: './scripts/backlog/planner.md',
          product: './scripts/backlog/product.md',
          ux: './scripts/backlog/ux.md',
          code: './scripts/backlog/code.md',
        },
        validationCommand: 'bash scripts/backlog/validate.sh',
      },
      path.join(root, 'backlog.config.mjs'),
    );

    expect(config.projectRoot).toBe(root);
    expect(config.files.progress).toBe(path.join(root, 'scripts/backlog/progress.txt'));
    expect(config.files.candidateQueue).toBe(path.join(root, 'backlog', 'inbox.jsonl'));
    expect(config.files.taskSpecsDir).toBe(path.join(root, 'backlog', 'tasks'));
    expect(config.files.runtimeReport).toBe(path.join(root, '.backlog-runner', 'runtime-report.md'));
    expect(config.files.stateDb).toBe(path.join(root, '.backlog-runner', 'state.sqlite'));
    expect(config.prompts.agent).toBe(path.join(root, 'scripts/backlog/agent.md'));
    expect(config.prompts.planner).toBe(path.join(root, 'scripts/backlog/planner.md'));
    expect(config.validationProfiles.repo).toBe('bash scripts/backlog/validate.sh');
  });

  it('resolves models from models.json and applies CLI overrides', async () => {
    const root = await makeTempDir();
    await mkdir(path.join(root, 'scripts/backlog'), { recursive: true });
    await writeFile(
      path.join(root, 'scripts/backlog/models.json'),
      JSON.stringify({
        aliases: {
          default: { codex: 'gpt-5.4' },
          sonnet: { codex: 'gpt-5.5' },
        },
      }),
      'utf8',
    );

    const config = normalizeBacklogRunnerConfig(
      {
        files: {
          backlog: './backlog.md',
          candidateQueue: './backlog/inbox.jsonl',
          stop: './backlog-stop',
          runtimeReport: './.backlog-runner/runtime-report.md',
          patterns: './scripts/backlog/patterns.md',
          progress: './scripts/backlog/progress.txt',
          models: './scripts/backlog/models.json',
        },
        prompts: {
          agent: './scripts/backlog/agent.md',
          planner: './scripts/backlog/planner.md',
          product: './scripts/backlog/product.md',
          ux: './scripts/backlog/ux.md',
          code: './scripts/backlog/code.md',
        },
        validationCommand: 'bash scripts/backlog/validate.sh',
        defaults: {
          tool: 'codex',
          model: 'default',
          passModel: 'sonnet',
          passes: true,
          worktrees: true,
        },
      },
      path.join(root, 'backlog.config.mjs'),
    );

    const options = await resolveRunOptions(config, {
      model: 'sonnet',
      worktrees: false,
    });

    expect(options.model).toBe('gpt-5.5');
    expect(options.passModel).toBe('gpt-5.5');
    expect(options.worktrees).toBe(false);
  });

  it('pins explicit model aliases when no model is configured', async () => {
    const root = await makeTempDir();
    const config = normalizeBacklogRunnerConfig(
      {
        files: {
          backlog: './backlog.md',
          candidateQueue: './backlog/inbox.jsonl',
          stop: './backlog-stop',
          runtimeReport: './.backlog-runner/runtime-report.md',
          patterns: './scripts/backlog/patterns.md',
          progress: './scripts/backlog/progress.txt',
        },
        prompts: {
          agent: './scripts/backlog/agent.md',
          planner: './scripts/backlog/planner.md',
          product: './scripts/backlog/product.md',
          ux: './scripts/backlog/ux.md',
          code: './scripts/backlog/code.md',
        },
        validationCommand: 'bash scripts/backlog/validate.sh',
        defaults: {
          tool: 'codex',
          model: 'default',
          passModel: 'sonnet',
          passes: true,
          worktrees: true,
        },
      },
      path.join(root, 'backlog.config.mjs'),
    );

    const options = await resolveRunOptions(config);

    expect(options.model).toBe('gpt-5.4');
    expect(options.passModel).toBe('gpt-5.4');
  });
});
