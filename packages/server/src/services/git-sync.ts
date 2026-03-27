import simpleGit, { SimpleGit } from 'simple-git';
import path from 'node:path';

export class GitSync {
  private dir: string;
  private git: SimpleGit;

  constructor(dir: string) {
    this.dir = path.resolve(dir);
    this.git = simpleGit(this.dir);
  }

  async isRepo(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    await this.git.init();
  }

  async status() {
    return this.git.status();
  }

  async commit(message: string): Promise<string> {
    await this.git.add('.');
    const result = await this.git.commit(message);
    return result.commit;
  }

  async push(): Promise<void> {
    await this.git.push();
  }

  async pull(): Promise<void> {
    await this.git.pull();
  }

  async getCurrentBranch(): Promise<string> {
    const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  }

  async getBranches(): Promise<string[]> {
    const result = await this.git.branchLocal();
    return result.all;
  }

  async checkout(branch: string): Promise<void> {
    await this.git.checkout(branch);
  }

  async createBranch(branch: string): Promise<void> {
    await this.git.checkoutLocalBranch(branch);
  }

  async log(limit = 20) {
    return this.git.log({ maxCount: limit });
  }

  async setRemote(url: string): Promise<void> {
    try {
      await this.git.addRemote('origin', url);
    } catch {
      await this.git.remote(['set-url', 'origin', url]);
    }
  }

  async getRemote(): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      return origin?.refs?.push || null;
    } catch {
      return null;
    }
  }

  async fetch(): Promise<void> {
    await this.git.fetch();
  }

  /** Compare local HEAD vs remote tracking branch.
   *  Returns categorized file lists. Requires remote to be configured. */
  async computeUnifiedDiff(): Promise<{
    localOnly: string[];
    remoteOnly: string[];
    conflicts: string[];
  }> {
    try {
      await this.git.fetch();
      const branch = await this.getCurrentBranch();
      const remote = `origin/${branch}`;

      const [localRaw, remoteRaw] = await Promise.all([
        this.git.raw(['diff', '--name-only', `${remote}..HEAD`]).catch(() => ''),
        this.git.raw(['diff', '--name-only', `HEAD..${remote}`]).catch(() => ''),
      ]);

      const localFiles = localRaw.trim().split('\n').filter(Boolean);
      const remoteFiles = remoteRaw.trim().split('\n').filter(Boolean);
      const conflictSet = new Set(localFiles.filter(f => remoteFiles.includes(f)));

      return {
        localOnly: localFiles.filter(f => !conflictSet.has(f)),
        remoteOnly: remoteFiles.filter(f => !conflictSet.has(f)),
        conflicts: [...conflictSet],
      };
    } catch {
      return { localOnly: [], remoteOnly: [], conflicts: [] };
    }
  }

  /** Apply direction choices: push, pull, or skip per file */
  async applyDiffChoices(choices: Record<string, 'push' | 'pull' | 'skip'>): Promise<void> {
    const toPull = Object.entries(choices).filter(([, d]) => d === 'pull').map(([f]) => f);
    if (toPull.length > 0) {
      // Checkout individual files from remote
      const branch = await this.getCurrentBranch();
      for (const file of toPull) {
        await this.git.raw(['checkout', `origin/${branch}`, '--', file]).catch(() => { /* ignore */ });
      }
      await this.git.add(toPull);
      await this.git.commit(`chore: pull ${toPull.length} file(s) from remote`).catch(() => { /* ignore */ });
    }
    // 'push' direction: stage only the selected files, commit, then push
    const toPush = Object.entries(choices).filter(([, d]) => d === 'push').map(([f]) => f);
    if (toPush.length > 0) {
      await this.git.add(toPush);
      await this.git.commit(`chore: push ${toPush.length} file(s) to remote`).catch(() => { /* nothing new to commit */ });
      await this.git.push();
    }
  }
}
