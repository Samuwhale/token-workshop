import { access, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lockPath, withLock } from '../locks.js';
import { gitCommitAndPush } from './in-place.js';
import type {
  BacklogRunnerConfig,
  CommandRunner,
  WorkspaceApplyResult,
  WorkspaceSession,
  WorkspaceStrategy,
} from '../types.js';

async function lineCount(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, 'utf8');
    const normalized = content.replace(/\r\n/g, '\n').replace(/\n$/, '');
    return normalized ? normalized.split('\n').length : 0;
  } catch {
    return 0;
  }
}

async function readAppendedLines(filePath: string, baseline: number): Promise<string> {
  try {
    const content = await readFile(filePath, 'utf8');
    const normalized = content.replace(/\r\n/g, '\n').replace(/\n$/, '');
    const lines = normalized ? normalized.split('\n') : [];
    return lines.slice(baseline).join('\n').trim();
  } catch {
    return '';
  }
}

async function appendIfPresent(target: string, content: string): Promise<void> {
  if (!content) return;
  await writeFile(target, `${(await readFile(target, 'utf8').catch(() => ''))}${content}\n`, 'utf8');
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function bootstrapWorkspaceNodeModules(projectRoot: string, worktreeDir: string): Promise<void> {
  const rootNodeModules = path.join(projectRoot, 'node_modules');
  if (await pathExists(rootNodeModules)) {
    try {
      await symlink(rootNodeModules, path.join(worktreeDir, 'node_modules'));
    } catch {
      // ignore
    }
  }

  const packagesDir = path.join(projectRoot, 'packages');
  let packageNames: string[] = [];
  try {
    packageNames = await readdir(packagesDir);
  } catch {
    return;
  }

  for (const packageName of packageNames) {
    const sourceNodeModules = path.join(packagesDir, packageName, 'node_modules');
    if (!(await pathExists(sourceNodeModules))) {
      continue;
    }

    const targetNodeModules = path.join(worktreeDir, 'packages', packageName, 'node_modules');
    if (await pathExists(targetNodeModules)) {
      continue;
    }

    try {
      await symlink(sourceNodeModules, targetNodeModules);
    } catch {
      // ignore
    }
  }
}

class GitWorktreeSession implements WorkspaceSession {
  constructor(
    readonly cwd: string,
    private readonly commandRunner: CommandRunner,
    private readonly config: BacklogRunnerConfig,
    private readonly worktreeBaseSha: string,
    private readonly progressBaseline: number,
    private readonly patternsBaseline: number,
  ) {}

  async merge(): Promise<WorkspaceApplyResult> {
    const worktreeProgress = path.join(this.cwd, path.relative(this.config.projectRoot, this.config.files.progress));
    const worktreePatterns = path.join(this.cwd, path.relative(this.config.projectRoot, this.config.files.patterns));
    const progressNew = await readAppendedLines(worktreeProgress, this.progressBaseline);
    const patternsNew = await readAppendedLines(worktreePatterns, this.patternsBaseline);

    await this.commandRunner.run('git', ['checkout', 'HEAD', '--', path.relative(this.cwd, worktreeProgress)], {
      cwd: this.cwd,
      ignoreFailure: true,
    });
    await this.commandRunner.run('git', ['checkout', 'HEAD', '--', path.relative(this.cwd, worktreePatterns)], {
      cwd: this.cwd,
      ignoreFailure: true,
    });

    await rm(path.join(this.cwd, 'node_modules'), { force: true });
    const status = await this.commandRunner.run('git', ['status', '--porcelain'], {
      cwd: this.cwd,
      ignoreFailure: true,
    });

    let commitSha = '';
    if (status.stdout.trim()) {
      await this.commandRunner.run('git', ['add', '-A'], { cwd: this.cwd });
      await this.commandRunner.run('git', ['commit', '-m', 'backlog agent work'], {
        cwd: this.cwd,
        ignoreFailure: true,
      });
      const rev = await this.commandRunner.run('git', ['rev-parse', 'HEAD'], { cwd: this.cwd });
      commitSha = rev.stdout.trim();
      if (commitSha === this.worktreeBaseSha) {
        commitSha = '';
      }
    }

    if (!commitSha && !progressNew && !patternsNew) {
      return { ok: true };
    }

    return withLock(lockPath(this.config, 'git'), 30, async () => {
      const remotes = await this.commandRunner.run('git', ['remote'], {
        cwd: this.config.projectRoot,
        ignoreFailure: true,
      });
      if (remotes.stdout.trim()) {
        const pull = await this.commandRunner.run('git', ['pull', '--rebase', '--autostash'], {
          cwd: this.config.projectRoot,
          ignoreFailure: true,
        });
        if (pull.code !== 0) {
          return { ok: false, reason: 'git pull --rebase failed before applying worktree changes' };
        }
      }

      if (commitSha) {
        const mergePreview = await this.commandRunner.run(
          'git',
          ['merge-tree', '--write-tree', '--merge-base', this.worktreeBaseSha, 'HEAD', commitSha],
          { cwd: this.config.projectRoot, ignoreFailure: true },
        );
        if (mergePreview.code !== 0) {
          return { ok: false, reason: 'Cherry-pick conflict' };
        }

        const cherryPick = await this.commandRunner.run(
          'git',
          ['cherry-pick', '--no-commit', commitSha],
          { cwd: this.config.projectRoot, ignoreFailure: true },
        );
        if (cherryPick.code !== 0) {
          await this.commandRunner.run('git', ['cherry-pick', '--abort'], {
            cwd: this.config.projectRoot,
            ignoreFailure: true,
          });
          return { ok: false, reason: 'Cherry-pick conflict' };
        }
      }

      await appendIfPresent(this.config.files.progress, progressNew);
      await appendIfPresent(this.config.files.patterns, patternsNew);
      return { ok: true };
    });
  }

  async teardown(): Promise<void> {
    await rm(path.join(this.cwd, 'node_modules'), { force: true });
    await this.commandRunner.run('git', ['worktree', 'remove', this.cwd, '--force'], {
      cwd: this.config.projectRoot,
      ignoreFailure: true,
    });
    await rm(this.cwd, { recursive: true, force: true });
    await this.commandRunner.run('git', ['worktree', 'prune'], {
      cwd: this.config.projectRoot,
      ignoreFailure: true,
    });
  }
}

export class GitWorktreeWorkspaceStrategy implements WorkspaceStrategy {
  constructor(
    private readonly commandRunner: CommandRunner,
    private readonly config: BacklogRunnerConfig,
  ) {}

  async setup(): Promise<WorkspaceSession> {
    const worktreeBaseSha = (await this.commandRunner.run('git', ['rev-parse', 'HEAD'], {
      cwd: this.config.projectRoot,
    })).stdout.trim();
    const worktreeDir = await mkdtemp(path.join(tmpdir(), `backlog-${process.pid}-`));
    await this.commandRunner.run('git', ['worktree', 'add', '--detach', worktreeDir, 'HEAD', '--quiet'], {
      cwd: this.config.projectRoot,
    });
    await bootstrapWorkspaceNodeModules(this.config.projectRoot, worktreeDir);

    const progressRelative = path.relative(this.config.projectRoot, this.config.files.progress);
    const patternsRelative = path.relative(this.config.projectRoot, this.config.files.patterns);
    const progressBaseline = await lineCount(path.join(worktreeDir, progressRelative));
    const patternsBaseline = await lineCount(path.join(worktreeDir, patternsRelative));

    return new GitWorktreeSession(
      worktreeDir,
      this.commandRunner,
      this.config,
      worktreeBaseSha,
      progressBaseline,
      patternsBaseline,
    );
  }

  async commitAndPush(message: string, allowedPaths: string[]): Promise<WorkspaceApplyResult> {
    return gitCommitAndPush(this.commandRunner, this.config, this.config.projectRoot, message, allowedPaths);
  }
}
