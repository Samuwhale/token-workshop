import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeBacklogRunnerConfig } from '../config.js';
import { createCommandRunner } from '../process.js';
import { GitWorktreeWorkspaceStrategy } from '../workspace/git-worktree.js';

const tempDirs: string[] = [];

async function makeRepo() {
  const root = await mkdtemp(path.join(tmpdir(), 'backlog-worktree-test-'));
  tempDirs.push(root);
  await mkdir(path.join(root, 'scripts/backlog'), { recursive: true });
  await mkdir(path.join(root, 'node_modules'), { recursive: true });
  await writeFile(path.join(root, 'backlog.md'), '- [ ] item\n', 'utf8');
  await writeFile(path.join(root, 'backlog-inbox.md'), '', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/patterns.md'), '# Patterns\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/progress.txt'), '# Backlog Progress Log\nStarted: today\n---\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/archive.md'), '# Backlog Archive\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/agent.md'), 'agent', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/product.md'), 'product', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/ux.md'), 'ux', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/code.md'), 'code', 'utf8');
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
        inbox: './backlog-inbox.md',
        stop: './backlog-stop',
        patterns: './scripts/backlog/patterns.md',
        progress: './scripts/backlog/progress.txt',
        archive: './scripts/backlog/archive.md',
        counter: './scripts/backlog/.completed-count',
        runnerLogDir: './scripts/backlog',
        runtimeDir: './.backlog-runner',
      },
      prompts: {
        agent: './scripts/backlog/agent.md',
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

    await writeFile(path.join(session.cwd, 'feature.txt'), 'after\n', 'utf8');
    await writeFile(
      path.join(session.cwd, 'scripts/backlog/progress.txt'),
      '# Backlog Progress Log\nStarted: today\n---\n## entry\nbody\n---\n',
      'utf8',
    );

    const merge = await session.merge('chore(backlog): done – item');
    await session.teardown();

    expect(merge.ok).toBe(true);
    expect(await readFile(path.join(root, 'feature.txt'), 'utf8')).toBe('after\n');
    expect(await readFile(path.join(root, 'scripts/backlog/progress.txt'), 'utf8')).toContain('## entry');
  }, 15000);
});
