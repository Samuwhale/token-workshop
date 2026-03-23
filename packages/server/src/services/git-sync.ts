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
}
