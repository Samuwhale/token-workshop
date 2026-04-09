import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeBacklogRunnerConfig } from '../config.js';
import { createCommandRunner } from '../process.js';
import type { CommandResult, CommandRunner } from '../types.js';
import { GitWorktreeWorkspaceStrategy } from '../workspace/git-worktree.js';
import { gitCommitAndPush } from '../workspace/in-place.js';

const tempDirs: string[] = [];

async function makeRepo() {
  const root = await mkdtemp(path.join(tmpdir(), 'backlog-worktree-test-'));
  tempDirs.push(root);
  await mkdir(path.join(root, 'scripts/backlog'), { recursive: true });
  await mkdir(path.join(root, 'backlog'), { recursive: true });
  await mkdir(path.join(root, 'packages/core/src'), { recursive: true });
  await mkdir(path.join(root, 'packages/core/node_modules/.bin'), { recursive: true });
  await mkdir(path.join(root, 'node_modules'), { recursive: true });
  await writeFile(path.join(root, 'backlog.md'), '- [ ] item\n', 'utf8');
  await writeFile(path.join(root, 'backlog/inbox.jsonl'), '', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/patterns.md'), '# Patterns\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/progress.txt'), '# Backlog Progress Log\nStarted: today\n---\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/archive.md'), '# Backlog Archive\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/agent.md'), 'agent', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/planner.md'), 'planner', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/product.md'), 'product', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/ux.md'), 'ux', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/code.md'), 'code', 'utf8');
  await writeFile(path.join(root, 'packages/core/src/index.ts'), 'export const example = true;\n', 'utf8');
  await writeFile(path.join(root, 'feature.txt'), 'before\n', 'utf8');

  const runner = createCommandRunner();
  await runner.run('git', ['init'], { cwd: root });
  await runner.run('git', ['config', 'user.email', 'backlog@test.local'], { cwd: root });
  await runner.run('git', ['config', 'user.name', 'Backlog Runner'], { cwd: root });
  await runner.run('git', ['add', '-A'], { cwd: root });
  await runner.run('git', ['commit', '-m', 'initial'], { cwd: root });

  const config = normalizeBacklogRunnerConfig(
    {
      files: {
        backlog: './backlog.md',
        candidateQueue: './backlog/inbox.jsonl',
        stop: './backlog-stop',
        patterns: './scripts/backlog/patterns.md',
        progress: './scripts/backlog/progress.txt',
        runnerLogDir: './scripts/backlog',
        runtimeDir: './.backlog-runner',
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

  return { root, config, runner };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('git worktree strategy', () => {
  it('merges worktree changes back to the main repo', async () => {
    const { root, config, runner } = await makeRepo();
    const strategy = new GitWorktreeWorkspaceStrategy(runner, config);
    const session = await strategy.setup();

    const packageNodeModules = path.join(session.cwd, 'packages/core/node_modules');
    expect((await lstat(packageNodeModules)).isSymbolicLink()).toBe(true);

    await writeFile(path.join(session.cwd, 'feature.txt'), 'after\n', 'utf8');
    await writeFile(
      path.join(session.cwd, 'scripts/backlog/progress.txt'),
      '# Backlog Progress Log\nStarted: today\n---\n## entry\nbody\n---\n',
      'utf8',
    );

    const merge = await session.merge();
    await session.teardown();
    const status = await runner.run('git', ['status', '--porcelain'], { cwd: root });

    expect(merge.ok).toBe(true);
    expect(await readFile(path.join(root, 'feature.txt'), 'utf8')).toBe('after\n');
    expect(await readFile(path.join(root, 'scripts/backlog/progress.txt'), 'utf8')).toContain('## entry');
    expect(status.stdout).not.toContain('node_modules');
  }, 15000);

  it('fails cleanly on merge conflicts without overwriting main repo changes', async () => {
    const { root, config, runner } = await makeRepo();
    const strategy = new GitWorktreeWorkspaceStrategy(runner, config);
    const session = await strategy.setup();

    await writeFile(path.join(session.cwd, 'feature.txt'), 'worktree change\n', 'utf8');
    await writeFile(path.join(root, 'feature.txt'), 'main change\n', 'utf8');
    await runner.run('git', ['add', 'feature.txt'], { cwd: root });
    await runner.run('git', ['commit', '-m', 'main repo change'], { cwd: root });

    const merge = await session.merge();
    await session.teardown();

    expect(merge.ok).toBe(false);
    expect(merge.reason).toBe('Cherry-pick conflict');
    expect(await readFile(path.join(root, 'feature.txt'), 'utf8')).toBe('main change\n');
  }, 15000);

  it('does not push on a clean tree unless the runner explicitly retries a pending push', async () => {
    const { root, config } = await makeRepo();
    const calls: string[] = [];
    const runner: CommandRunner = {
      async run(command: string, args: string[]): Promise<CommandResult> {
        calls.push(`run:${command} ${args.join(' ')}`.trim());
        if (command === 'git' && args[0] === 'status') {
          return { code: 0, stdout: '', stderr: '' };
        }
        if (command === 'git' && args[0] === 'remote') {
          return { code: 0, stdout: 'origin', stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      },
      async runShell(): Promise<CommandResult> {
        return { code: 0, stdout: '', stderr: '' };
      },
      async which(): Promise<string | null> {
        return '/usr/bin/mock';
      },
    };

    const result = await gitCommitAndPush(runner, config, root, 'chore(backlog): done – test item', ['feature.txt']);

    expect(result.ok).toBe(true);
    expect(calls).not.toContain('run:git push');
  });
});
