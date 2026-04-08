import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeBacklogRunnerConfig } from '../config.js';
import { runBacklogRunner } from '../scheduler.js';
import type { CommandResult, CommandRunner, LogSink } from '../types.js';

const tempDirs: string[] = [];

class MemoryLogSink implements LogSink {
  readonly lines: string[] = [];

  write(line: string): void {
    this.lines.push(line);
  }

  async close(): Promise<void> {
    // no-op
  }
}

function createFakeCommandRunner(root: string): CommandRunner {
  return {
    async run(command: string): Promise<CommandResult> {
      if (command === 'claude') {
        await writeFile(
          path.join(root, 'scripts/backlog/progress.txt'),
          '# Backlog Progress Log\nStarted: today\n---\n## run\nbody\n---\n',
          'utf8',
        );
        return {
          code: 0,
          stdout: JSON.stringify({
            structured_output: { status: 'done', item: 'test item', note: 'implemented' },
          }),
          stderr: '',
        };
      }

      if (command === 'git') {
        return { code: 0, stdout: '', stderr: '' };
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
}

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'backlog-e2e-test-'));
  tempDirs.push(root);
  await mkdir(path.join(root, 'scripts/backlog'), { recursive: true });
  await writeFile(path.join(root, 'backlog.md'), '- [ ] test item\n', 'utf8');
  await writeFile(path.join(root, 'backlog-inbox.md'), '', 'utf8');
  await writeFile(path.join(root, 'backlog-stop'), 'stop\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/patterns.md'), '# Patterns\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/progress.txt'), '# Backlog Progress Log\nStarted: today\n---\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/archive.md'), '# Backlog Archive\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/agent.md'), 'agent prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/product.md'), 'product prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/ux.md'), 'ux prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/code.md'), 'code prompt', 'utf8');

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
      defaults: {
        tool: 'claude',
        model: 'default',
        passModel: '',
        passes: false,
        passFrequency: 10,
        worktrees: false,
      },
    },
    path.join(root, 'backlog.config.mjs'),
  );

  return { root, config };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('runner e2e', () => {
  it('claims one item, runs the agent, and marks it done', async () => {
    const { root, config } = await makeFixture();
    const logSink = new MemoryLogSink();

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(await readFile(path.join(root, 'backlog.md'), 'utf8')).toContain('- [x] test item');
    expect(await readFile(path.join(root, 'scripts/backlog/progress.txt'), 'utf8')).toContain('## run');
    expect(logSink.lines.join('')).toContain('Committed and marked done');
  });
});
