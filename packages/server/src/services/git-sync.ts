import simpleGit, { SimpleGit } from 'simple-git';
import path from 'node:path';
import fs from 'node:fs/promises';

/** A single conflict region within a file. */
export interface ConflictRegion {
  /** Zero-based index of the conflict within the file */
  index: number;
  ours: string;
  theirs: string;
}

/** Parsed conflict data for a single file. */
export interface FileConflict {
  file: string;
  regions: ConflictRegion[];
}

/**
 * Parse git conflict markers from raw file content.
 * Returns the conflict regions found. If no markers are found, returns [].
 */
export function parseConflictMarkers(content: string): ConflictRegion[] {
  const regions: ConflictRegion[] = [];
  const lines = content.split('\n');
  let i = 0;
  let regionIndex = 0;

  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      const oursLines: string[] = [];
      const theirsLines: string[] = [];
      i++;
      // Collect "ours" lines until =======
      while (i < lines.length && !lines[i].startsWith('=======')) {
        oursLines.push(lines[i]);
        i++;
      }
      i++; // skip =======
      // Collect "theirs" lines until >>>>>>>
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        theirsLines.push(lines[i]);
        i++;
      }
      i++; // skip >>>>>>>
      regions.push({
        index: regionIndex++,
        ours: oursLines.join('\n'),
        theirs: theirsLines.join('\n'),
      });
    } else {
      i++;
    }
  }
  return regions;
}

/**
 * Rebuild a file by replacing conflict markers with the chosen side.
 * choices maps region index to 'ours' or 'theirs'.
 */
export function resolveConflictContent(
  content: string,
  choices: Record<number, 'ours' | 'theirs'>,
): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let i = 0;
  let regionIndex = 0;

  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      const oursLines: string[] = [];
      const theirsLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('=======')) {
        oursLines.push(lines[i]);
        i++;
      }
      i++; // skip =======
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        theirsLines.push(lines[i]);
        i++;
      }
      i++; // skip >>>>>>>
      const choice = choices[regionIndex] ?? 'ours';
      const chosen = choice === 'theirs' ? theirsLines : oursLines;
      result.push(...chosen);
      regionIndex++;
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result.join('\n');
}

export class GitSync {
  private dir: string;
  private git: SimpleGit;

  constructor(dir: string) {
    this.dir = path.resolve(dir);
    this.git = simpleGit(this.dir);
  }

  /** Validate a branch name is safe (not a flag, not empty, no control chars). */
  private validateBranchName(name: string): void {
    if (!name || name.startsWith('-')) {
      throw new Error(`Invalid branch name: "${name}"`);
    }
    // Block control characters and whitespace other than normal space (which git itself rejects)
    if (/[\x00-\x1f\x7f]/.test(name)) {
      throw new Error(`Invalid branch name: "${name}" contains control characters`);
    }
  }

  /** Validate that all file paths resolve within the token directory. */
  private validatePaths(files: string[]): void {
    for (const file of files) {
      const resolved = path.resolve(this.dir, file);
      if (!resolved.startsWith(this.dir + path.sep) && resolved !== this.dir) {
        throw new Error(`Path "${file}" resolves outside the token directory`);
      }
    }
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

  async commit(message: string, files?: string[]): Promise<string> {
    if (files && files.length > 0) {
      this.validatePaths(files);
      await this.git.add(files);
    } else {
      await this.git.add('.');
    }
    const result = await this.git.commit(message);
    return result.commit;
  }

  async push(): Promise<void> {
    await this.git.push();
  }

  async pull(): Promise<{ conflicts: string[] }> {
    try {
      await this.git.pull();
      return { conflicts: [] };
    } catch (err) {
      // Check if the pull resulted in merge conflicts
      const conflicted = await this.getConflictedFiles();
      if (conflicted.length > 0) {
        return { conflicts: conflicted };
      }
      throw err;
    }
  }

  /** List files with unresolved merge conflicts. */
  async getConflictedFiles(): Promise<string[]> {
    try {
      const raw = await this.git.raw(['diff', '--name-only', '--diff-filter=U']);
      return raw.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /** Get parsed conflict data for all conflicted files. */
  async getConflicts(): Promise<FileConflict[]> {
    const files = await this.getConflictedFiles();
    const results: FileConflict[] = [];
    for (const file of files) {
      const filePath = path.resolve(this.dir, file);
      // Validate path is within token directory
      if (!filePath.startsWith(this.dir + path.sep) && filePath !== this.dir) continue;
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const regions = parseConflictMarkers(content);
        if (regions.length > 0) {
          results.push({ file, regions });
        }
      } catch {
        // File may not exist (deleted in one side)
      }
    }
    return results;
  }

  /** Resolve conflicts in a file by choosing ours/theirs per region, then stage it. */
  async resolveFileConflict(file: string, choices: Record<number, 'ours' | 'theirs'>): Promise<void> {
    this.validatePaths([file]);
    const filePath = path.resolve(this.dir, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const resolved = resolveConflictContent(content, choices);
    await fs.writeFile(filePath, resolved, 'utf-8');
    await this.git.add([file]);
  }

  /** Abort the current merge. */
  async abortMerge(): Promise<void> {
    await this.git.merge(['--abort']);
  }

  /** Finalize merge after all conflicts resolved — creates the merge commit. */
  async finalizeMerge(): Promise<void> {
    // Check if any conflicts remain
    const remaining = await this.getConflictedFiles();
    if (remaining.length > 0) {
      throw new Error(`Cannot finalize merge: ${remaining.length} file(s) still have conflicts`);
    }
    try {
      await this.git.commit('Merge remote changes (conflicts resolved)');
    } catch (err) {
      console.warn('[GitSync] Finalize merge commit failed:', err);
    }
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
    this.validateBranchName(branch);
    await this.git.checkout(branch);
  }

  async createBranch(branch: string): Promise<void> {
    this.validateBranchName(branch);
    await this.git.checkoutLocalBranch(branch);
  }

  async log(limit = 20) {
    return this.git.log({ maxCount: limit });
  }

  /** Get the content of a file at a specific commit. Returns null if the file doesn't exist at that commit. */
  async showFileAtCommit(commitHash: string, filePath: string): Promise<string | null> {
    try {
      return await this.git.show([`${commitHash}:${filePath}`]);
    } catch {
      return null;
    }
  }

  /** Get the list of changed .tokens.json files in a commit with their before/after JSON content. */
  async getTokenFileDiffs(commitHash: string): Promise<Array<{
    file: string;
    status: 'A' | 'M' | 'D';
    before: string | null;
    after: string | null;
  }>> {
    // Get list of changed files with status
    const raw = await this.git.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', commitHash]);
    const lines = raw.trim().split('\n').filter(Boolean);
    const results: Array<{ file: string; status: 'A' | 'M' | 'D'; before: string | null; after: string | null }> = [];

    for (const line of lines) {
      const [status, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t');
      if (!filePath.endsWith('.tokens.json')) continue;

      const s = status.charAt(0) as 'A' | 'M' | 'D';
      const after = s !== 'D' ? await this.showFileAtCommit(commitHash, filePath) : null;
      const before = s !== 'A' ? await this.showFileAtCommit(`${commitHash}~1`, filePath) : null;
      results.push({ file: filePath, status: s, before, after });
    }

    return results;
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
  }

  /** Apply direction choices: push, pull, or skip per file */
  async applyDiffChoices(choices: Record<string, 'push' | 'pull' | 'skip'>): Promise<void> {
    const toPull = Object.entries(choices).filter(([, d]) => d === 'pull').map(([f]) => f);
    const toPush = Object.entries(choices).filter(([, d]) => d === 'push').map(([f]) => f);
    this.validatePaths([...toPull, ...toPush]);
    if (toPull.length > 0) {
      // Checkout individual files from remote
      const branch = await this.getCurrentBranch();
      for (const file of toPull) {
        await this.git.raw(['checkout', `origin/${branch}`, '--', file]).catch((err) => { console.warn(`[GitSync] Failed to checkout file "${file}":`, err); });
      }
      await this.git.add(toPull);
      try {
        await this.git.commit(`chore: pull ${toPull.length} file(s) from remote`);
      } catch (err) {
        console.warn('[GitSync] Pull commit failed (may have no changes):', err);
      }
    }
    // 'push' direction: stage only the selected files, commit, then push
    if (toPush.length > 0) {
      await this.git.add(toPush);
      let pushCommitSucceeded = false;
      try {
        await this.git.commit(`chore: push ${toPush.length} file(s) to remote`);
        pushCommitSucceeded = true;
      } catch (err) {
        console.warn('[GitSync] Push commit failed (may have no changes):', err);
      }
      if (pushCommitSucceeded) {
        await this.git.push();
      }
    }
  }
}
