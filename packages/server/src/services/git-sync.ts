import simpleGit, { SimpleGit } from "simple-git";
import path from "node:path";
import fs from "node:fs/promises";
import { flattenTokenGroup, type Token } from "@tokenmanager/core";
import { BadRequestError, GitTimeoutError } from "../errors.js";
import type { CollectionStore } from "./collection-store.js";
import type { TokenStore } from "./token-store.js";
import type { RecipeService } from "./recipe-service.js";
import type { ResolverStore } from "./resolver-store.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";
import { stableStringify } from "./stable-stringify.js";

/**
 * Timeout (ms) applied to all git network operations (fetch, pull, push).
 * simple-git kills the spawned git process after this interval.
 */
const GIT_NETWORK_TIMEOUT_MS = 30_000;

/**
 * Detect whether a caught error originates from simple-git's timeout mechanism
 * or from an OS-level "operation timed out" message.
 */
function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("timeout") || msg.includes("timed out");
}

/**
 * Wrap a git network operation so that timeout errors surface as GitTimeoutError.
 * @param op  The label used in the error message (e.g. "fetch", "pull", "push")
 * @param promise  The simple-git promise to await
 */
async function wrapNetworkOp<T>(op: string, promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new GitTimeoutError(op, GIT_NETWORK_TIMEOUT_MS);
    }
    throw err;
  }
}

/**
 * Normalize a git status letter to one of A, M, D.
 * Git diff/diff-tree can emit: A (added), M (modified), D (deleted),
 * R (rename), C (copy), T (type-change), U (unmerged), X/B (broken).
 * Rename and copy are treated as additions of the destination file.
 * Type-change and unmerged are treated as modifications.
 * Unknown/broken statuses return null (skip the entry).
 */
function normalizeGitStatus(raw: string): "A" | "M" | "D" | null {
  const ch = raw.charAt(0);
  switch (ch) {
    case "A":
      return "A";
    case "D":
      return "D";
    case "M":
    case "T":
    case "U":
      return "M";
    case "R":
    case "C":
      return "A"; // destination file is new/copied
    default:
      return null;
  }
}

/**
 * Parse a git --name-status line into status + file path.
 * Handles rename (R100\told\tnew) and copy (C100\told\tnew) lines
 * which have two path columns — we use the destination path.
 */
function parseStatusLine(
  line: string,
): { status: string; filePath: string } | null {
  const parts = line.split("\t");
  if (parts.length < 2) return null;
  const status = parts[0];
  const ch = status.charAt(0);
  // R and C statuses have: R100\told_path\tnew_path
  if ((ch === "R" || ch === "C") && parts.length >= 3) {
    return { status, filePath: parts[parts.length - 1] };
  }
  return { status, filePath: parts.slice(1).join("\t") };
}

export type GitTokenFileStatus = "A" | "M" | "D";

export interface GitTokenChange {
  path: string;
  collectionId: string;
  type: string;
  status: "added" | "modified" | "removed";
  before?: unknown;
  after?: unknown;
}

export interface GitTokenFileDiff {
  file: string;
  collectionId: string;
  status: GitTokenFileStatus;
  before: string | null;
  after: string | null;
  beforeTokens: Map<string, Token>;
  afterTokens: Map<string, Token>;
  changes: GitTokenChange[];
}

interface TokenDiffLoadOptions {
  diffArgs: string[];
  loadBefore: (
    filePath: string,
    status: GitTokenFileStatus,
  ) => Promise<string | null>;
  loadAfter: (
    filePath: string,
    status: GitTokenFileStatus,
  ) => Promise<string | null>;
  includeUntrackedWorkingTree?: boolean;
}

/** Result of applyDiffChoices with partial-failure details. */
export interface ApplyDiffResult {
  /** Files that failed to checkout from remote during pull. */
  pullFailedFiles: string[];
  /** Whether the pull commit failed. */
  pullCommitFailed: boolean;
  pullCommitError?: string;
  /** Whether the push commit failed. */
  pushCommitFailed: boolean;
  pushCommitError?: string;
  /** Whether git push to remote failed. */
  pushFailed: boolean;
  pushError?: string;
}

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

/** A parsed conflict region yielded by parseConflictRegions. */
interface ParsedRegion {
  regionIndex: number;
  oursLines: string[];
  theirsLines: string[];
}

/**
 * Iterate over all conflict regions in a split line array.
 * Yields ParsedRegion for each well-formed <<<<<<< / ======= / >>>>>>> block.
 * Malformed regions (missing ======= or >>>>>>>) are skipped.
 * Between regions the callback receives the non-conflict lines via the
 * `beforeLines` array that is mutated in place before each yield.
 */
function* parseConflictRegions(
  lines: string[],
): Generator<{ beforeLines: string[]; region: ParsedRegion | null }> {
  let i = 0;
  let regionIndex = 0;
  let pendingBefore: string[] = [];

  while (i < lines.length) {
    if (lines[i].startsWith("<<<<<<<")) {
      // Yield accumulated non-conflict lines before this region
      yield { beforeLines: pendingBefore, region: null };
      pendingBefore = [];

      const oursLines: string[] = [];
      const theirsLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("=======")) {
        oursLines.push(lines[i]);
        i++;
      }
      if (i >= lines.length) {
        // Malformed: missing =======; yield what we have and stop
        yield { beforeLines: oursLines, region: null };
        return;
      }
      i++; // skip =======
      while (i < lines.length && !lines[i].startsWith(">>>>>>>")) {
        theirsLines.push(lines[i]);
        i++;
      }
      if (i >= lines.length) {
        // Malformed: missing >>>>>>>; yield what we have and stop
        yield { beforeLines: theirsLines, region: null };
        return;
      }
      i++; // skip >>>>>>>
      yield {
        beforeLines: [],
        region: { regionIndex: regionIndex++, oursLines, theirsLines },
      };
    } else {
      pendingBefore.push(lines[i]);
      i++;
    }
  }
  // Yield any trailing non-conflict lines
  if (pendingBefore.length > 0) {
    yield { beforeLines: pendingBefore, region: null };
  }
}

/**
 * Parse git conflict markers from raw file content.
 * Returns the conflict regions found. If no markers are found, returns [].
 */
export function parseConflictMarkers(content: string): ConflictRegion[] {
  const regions: ConflictRegion[] = [];
  for (const { region } of parseConflictRegions(content.split("\n"))) {
    if (region) {
      regions.push({
        index: region.regionIndex,
        ours: region.oursLines.join("\n"),
        theirs: region.theirsLines.join("\n"),
      });
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
  choices: Record<number, "ours" | "theirs">,
): string {
  const result: string[] = [];
  for (const { beforeLines, region } of parseConflictRegions(
    content.split("\n"),
  )) {
    result.push(...beforeLines);
    if (region) {
      const choice = choices[region.regionIndex] ?? "ours";
      result.push(
        ...(choice === "theirs" ? region.theirsLines : region.oursLines),
      );
    }
  }
  return result.join("\n");
}

export class GitSync {
  private dir: string;
  private git: SimpleGit;
  /** Promise-chain mutex — all git-mutating operations serialize behind this. */
  private lock = new PromiseChainLock();

  constructor(dir: string) {
    this.dir = path.resolve(dir);
    this.git = simpleGit({
      baseDir: this.dir,
      timeout: { block: GIT_NETWORK_TIMEOUT_MS },
    });
  }

  /** Validate a branch name is safe (not a flag, not empty, no control chars). */
  private validateBranchName(name: string): void {
    if (!name || name.startsWith("-")) {
      throw new Error(`Invalid branch name: "${name}"`);
    }
    // Block control characters and whitespace other than normal space (which git itself rejects)
    if (/[\x00-\x1f\x7f]/.test(name)) {
      throw new Error(
        `Invalid branch name: "${name}" contains control characters`,
      );
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
      await this.git.revparse(["--git-dir"]);
      return true;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    await this.lock.withLock(() => this.git.init());
  }

  async status() {
    return this.git.status();
  }

  async commit(message: string, files?: string[]): Promise<string> {
    return this.lock.withLock(async () => {
      if (files && files.length > 0) {
        this.validatePaths(files);
        await this.git.add(files);
      } else {
        await this.git.add(".");
      }
      const result = await this.git.commit(message);
      return result.commit;
    });
  }

  async push(): Promise<void> {
    await this.lock.withLock(() => wrapNetworkOp("push", this.git.push()));
  }

  async pull(): Promise<{ conflicts: string[] }> {
    return this.lock.withLock(async () => {
      try {
        await wrapNetworkOp("pull", this.git.pull());
        return { conflicts: [] };
      } catch (err) {
        if (err instanceof GitTimeoutError) throw err;
        // Check if the pull resulted in merge conflicts
        const conflicted = await this.getConflictedFiles();
        if (conflicted.length > 0) {
          return { conflicts: conflicted };
        }
        throw err;
      }
    });
  }

  /** List files with unresolved merge conflicts. */
  async getConflictedFiles(): Promise<string[]> {
    try {
      const raw = await this.git.raw([
        "diff",
        "--name-only",
        "--diff-filter=U",
      ]);
      return raw.trim().split("\n").filter(Boolean);
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
      if (!filePath.startsWith(this.dir + path.sep) && filePath !== this.dir)
        continue;
      try {
        const content = await fs.readFile(filePath, "utf-8");
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
  async resolveFileConflict(
    file: string,
    choices: Record<number, "ours" | "theirs">,
  ): Promise<void> {
    return this.lock.withLock(async () => {
      this.validatePaths([file]);
      const filePath = path.resolve(this.dir, file);
      const content = await fs.readFile(filePath, "utf-8");
      const resolved = resolveConflictContent(content, choices);
      const tmp = `${filePath}.tmp`;
      await fs.writeFile(tmp, resolved, "utf-8");
      await fs.rename(tmp, filePath);
      await this.git.add([file]);
    });
  }

  /**
   * Validate, resolve, and stage all conflict resolutions atomically.
   *
   * Before touching any files:
   *   1. Validates that every requested file is actually conflicted.
   *   2. Validates that every region index is within range.
   *   3. Validates that every choice value is 'ours' or 'theirs'.
   *   4. Resolves all file contents in memory.
   *
   * Only then writes and stages. If any write/stage fails, already-staged
   * files are restored to their conflicted state via `git checkout -m`.
   */
  async resolveAllConflicts(
    resolutions: Array<{
      file: string;
      choices: Record<number, "ours" | "theirs">;
    }>,
  ): Promise<void> {
    return this.lock.withLock(async () => {
      // --- 1. Validate structure of each resolution entry ---
      for (const res of resolutions) {
        if (!res || typeof res.file !== "string" || !res.file) {
          throw new BadRequestError(
            'Each resolution must have a non-empty "file" string',
          );
        }
        if (
          !res.choices ||
          typeof res.choices !== "object" ||
          Array.isArray(res.choices)
        ) {
          throw new BadRequestError(
            `Resolution for "${res.file}" must have a "choices" object`,
          );
        }
        for (const [idxStr, choice] of Object.entries(res.choices)) {
          if (choice !== "ours" && choice !== "theirs") {
            throw new BadRequestError(
              `Invalid choice "${choice}" at region ${idxStr} in "${res.file}": must be "ours" or "theirs"`,
            );
          }
        }
      }

      // --- 2. Validate paths (directory traversal check) ---
      this.validatePaths(resolutions.map((r) => r.file));

      // --- 3. Load current conflict state and cross-validate ---
      const currentConflicts = await this.getConflicts();
      const conflictMap = new Map(currentConflicts.map((c) => [c.file, c]));

      for (const { file, choices } of resolutions) {
        const conflict = conflictMap.get(file);
        if (!conflict) {
          throw new BadRequestError(
            `File "${file}" is not currently conflicted (it may have already been resolved or was never in conflict)`,
          );
        }
        const regionCount = conflict.regions.length;
        for (const idxStr of Object.keys(choices)) {
          const idx = Number(idxStr);
          if (!Number.isInteger(idx) || idx < 0 || idx >= regionCount) {
            throw new BadRequestError(
              `Region index ${idx} is out of range for "${file}" (file has ${regionCount} conflict region(s))`,
            );
          }
        }
        const missingIndices: number[] = [];
        for (let i = 0; i < regionCount; i++) {
          if (!(i in choices)) missingIndices.push(i);
        }
        if (missingIndices.length > 0) {
          throw new BadRequestError(
            `Incomplete resolution for "${file}": missing choices for conflict region(s) ${missingIndices.join(", ")} ` +
              `(file has ${regionCount} conflict region(s); all must be resolved in a single request)`,
          );
        }
      }

      // --- 4. Resolve all file contents in memory (no side effects yet) ---
      const resolved: Array<{
        file: string;
        filePath: string;
        content: string;
      }> = [];
      for (const { file, choices } of resolutions) {
        const filePath = path.resolve(this.dir, file);
        const content = await fs.readFile(filePath, "utf-8");
        resolved.push({
          file,
          filePath,
          content: resolveConflictContent(content, choices),
        });
      }

      // --- 5. Write and stage; rollback on partial failure ---
      const staged: string[] = [];
      try {
        for (const { file, filePath, content } of resolved) {
          const tmp = `${filePath}.tmp`;
          await fs.writeFile(tmp, content, "utf-8");
          await fs.rename(tmp, filePath);
          await this.git.add([file]);
          staged.push(file);
        }
      } catch (err) {
        // Restore already-staged files to their conflicted state so the
        // repository is left in a clean "fully conflicted" state that the
        // client can retry, rather than a partial merge.
        for (const f of staged) {
          try {
            await this.git.raw(["checkout", "-m", "--", f]);
          } catch (rollbackErr) {
            console.warn(`[GitSync] Rollback failed for "${f}":`, rollbackErr);
          }
        }
        throw err;
      }
    });
  }

  /** Abort the current merge. */
  async abortMerge(): Promise<void> {
    await this.lock.withLock(() => this.git.merge(["--abort"]));
  }

  /** Finalize merge after all conflicts resolved — creates the merge commit. */
  async finalizeMerge(): Promise<void> {
    return this.lock.withLock(async () => {
      // Check if any conflicts remain
      const remaining = await this.getConflictedFiles();
      if (remaining.length > 0) {
        throw new Error(
          `Cannot finalize merge: ${remaining.length} file(s) still have conflicts`,
        );
      }
      try {
        await this.git.commit("Merge remote changes (conflicts resolved)");
      } catch (err) {
        console.warn("[GitSync] Finalize merge commit failed:", err);
        throw err;
      }
    });
  }

  async getCurrentBranch(): Promise<string> {
    const branch = await this.git.revparse(["--abbrev-ref", "HEAD"]);
    return branch.trim();
  }

  async getBranches(): Promise<string[]> {
    const result = await this.git.branchLocal();
    return result.all;
  }

  async checkout(branch: string): Promise<void> {
    await this.lock.withLock(async () => {
      this.validateBranchName(branch);
      await this.git.checkout(branch);
    });
  }

  async createBranch(branch: string): Promise<void> {
    return this.lock.withLock(() => {
      this.validateBranchName(branch);
      return this.git.checkoutLocalBranch(branch);
    });
  }

  async log(limit = 20, offset = 0, search?: string) {
    const options: Record<string, unknown> = { maxCount: limit };
    if (offset > 0) options["--skip"] = offset;
    if (search) {
      options["--grep"] = search;
      options["--regexp-ignore-case"] = null;
    }
    return this.git.log(options as Parameters<typeof this.git.log>[0]);
  }

  /** Get the content of a file at a specific commit. Returns null if the file doesn't exist at that commit. */
  async showFileAtCommit(
    commitHash: string,
    filePath: string,
  ): Promise<string | null> {
    try {
      return await this.git.show([`${commitHash}:${filePath}`]);
    } catch {
      return null;
    }
  }

  private getCollectionIdForFile(filePath: string): string {
    return filePath.replace(/\.tokens\.json$/, "");
  }

  private parseTokenContent(content: string | null): Map<string, Token> {
    const tokens = new Map<string, Token>();
    if (!content) return tokens;

    try {
      for (const [tokenPath, token] of flattenTokenGroup(JSON.parse(content))) {
        tokens.set(tokenPath, token as Token);
      }
    } catch {
      // Skip unreadable or non-token JSON payloads so previews can still load.
    }

    return tokens;
  }

  private buildTokenChanges(
    collectionId: string,
    beforeTokens: Map<string, Token>,
    afterTokens: Map<string, Token>,
  ): GitTokenChange[] {
    const changes: GitTokenChange[] = [];

    for (const [tokenPath, token] of afterTokens) {
      if (!beforeTokens.has(tokenPath)) {
        changes.push({
          path: tokenPath,
          collectionId,
          type: token.$type || "unknown",
          status: "added",
          after: token.$value,
        });
      }
    }

    for (const [tokenPath, token] of beforeTokens) {
      if (!afterTokens.has(tokenPath)) {
        changes.push({
          path: tokenPath,
          collectionId,
          type: token.$type || "unknown",
          status: "removed",
          before: token.$value,
        });
      }
    }

    for (const [tokenPath, afterToken] of afterTokens) {
      const beforeToken = beforeTokens.get(tokenPath);
      if (!beforeToken) continue;

      if (
        stableStringify(beforeToken.$value) !==
        stableStringify(afterToken.$value)
      ) {
        changes.push({
          path: tokenPath,
          collectionId,
          type: afterToken.$type || beforeToken.$type || "unknown",
          status: "modified",
          before: beforeToken.$value,
          after: afterToken.$value,
        });
      }
    }

    return changes;
  }

  private async readWorkingTreeFile(filePath: string): Promise<string | null> {
    const absPath = path.resolve(this.dir, filePath);
    try {
      return await fs.readFile(absPath, "utf-8");
    } catch {
      return null;
    }
  }

  private async buildTokenFileDiff(
    filePath: string,
    status: GitTokenFileStatus,
    loadBefore: (
      filePath: string,
      status: GitTokenFileStatus,
    ) => Promise<string | null>,
    loadAfter: (
      filePath: string,
      status: GitTokenFileStatus,
    ) => Promise<string | null>,
  ): Promise<GitTokenFileDiff> {
    const [before, after] = await Promise.all([
      loadBefore(filePath, status),
      loadAfter(filePath, status),
    ]);
    const beforeTokens = this.parseTokenContent(before);
    const afterTokens = this.parseTokenContent(after);
    const collectionId = this.getCollectionIdForFile(filePath);

    return {
      file: filePath,
      collectionId,
      status,
      before,
      after,
      beforeTokens,
      afterTokens,
      changes: this.buildTokenChanges(collectionId, beforeTokens, afterTokens),
    };
  }

  private async loadTokenFileDiffs({
    diffArgs,
    loadBefore,
    loadAfter,
    includeUntrackedWorkingTree = false,
  }: TokenDiffLoadOptions): Promise<GitTokenFileDiff[]> {
    const raw = await this.git.raw(diffArgs);
    const lines = raw.trim().split("\n").filter(Boolean);
    const fileDiffs: GitTokenFileDiff[] = [];
    const seenFiles = new Set<string>();

    for (const line of lines) {
      const parsed = parseStatusLine(line);
      if (!parsed) continue;

      const { filePath } = parsed;
      if (!filePath.endsWith(".tokens.json")) continue;

      const status = normalizeGitStatus(parsed.status);
      if (!status || seenFiles.has(filePath)) continue;

      seenFiles.add(filePath);
      fileDiffs.push(
        await this.buildTokenFileDiff(filePath, status, loadBefore, loadAfter),
      );
    }

    if (!includeUntrackedWorkingTree) {
      return fileDiffs;
    }

    const untrackedRaw = await this.git.raw([
      "ls-files",
      "--others",
      "--exclude-standard",
    ]);
    const untrackedFiles = untrackedRaw.trim().split("\n").filter(Boolean);

    for (const filePath of untrackedFiles) {
      if (!filePath.endsWith(".tokens.json") || seenFiles.has(filePath)) {
        continue;
      }

      seenFiles.add(filePath);
      fileDiffs.push(
        await this.buildTokenFileDiff(
          filePath,
          "A",
          async () => null,
          async () => this.readWorkingTreeFile(filePath),
        ),
      );
    }

    return fileDiffs;
  }

  /** Get token file diffs between two arbitrary commits (fromHash → toHash). */
  async diffBetweenCommits(
    fromHash: string,
    toHash: string,
  ): Promise<GitTokenFileDiff[]> {
    return this.loadTokenFileDiffs({
      diffArgs: ["diff", "--name-status", fromHash, toHash],
      loadBefore: async (filePath, status) =>
        status === "A" ? null : this.showFileAtCommit(fromHash, filePath),
      loadAfter: async (filePath, status) =>
        status === "D" ? null : this.showFileAtCommit(toHash, filePath),
    });
  }

  /** Get the list of changed .tokens.json files in a commit with their before/after JSON content. */
  async getTokenFileDiffs(commitHash: string): Promise<GitTokenFileDiff[]> {
    return this.loadTokenFileDiffs({
      diffArgs: [
        "diff-tree",
        "--no-commit-id",
        "-r",
        "--name-status",
        commitHash,
      ],
      loadBefore: async (filePath, status) =>
        status === "A"
          ? null
          : this.showFileAtCommit(`${commitHash}~1`, filePath),
      loadAfter: async (filePath, status) =>
        status === "D" ? null : this.showFileAtCommit(commitHash, filePath),
    });
  }

  async setRemote(url: string): Promise<void> {
    return this.lock.withLock(async () => {
      try {
        await this.git.addRemote("origin", url);
      } catch {
        await this.git.remote(["set-url", "origin", url]);
      }
    });
  }

  async getRemote(): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((r) => r.name === "origin");
      return origin?.refs?.push || null;
    } catch {
      return null;
    }
  }

  async fetch(): Promise<void> {
    await this.lock.withLock(() => wrapNetworkOp("fetch", this.git.fetch()));
  }

  /** Get token-level diffs for uncommitted changes in .tokens.json files.
   *  Compares working tree against HEAD. */
  async getWorkingTreeTokenDiff(): Promise<GitTokenFileDiff[]> {
    return this.loadTokenFileDiffs({
      diffArgs: ["diff", "HEAD", "--name-status"],
      loadBefore: async (filePath, status) =>
        status === "A" ? null : this.showFileAtCommit("HEAD", filePath),
      loadAfter: async (filePath, status) =>
        status === "D" ? null : this.readWorkingTreeFile(filePath),
      includeUntrackedWorkingTree: true,
    });
  }

  /** Token-level diff of what a push would send (local HEAD vs remote tracking branch).
   *  Also returns the list of commits that would be pushed. */
  async getPushPreview(): Promise<{
    commits: Array<{
      hash: string;
      date: string;
      message: string;
      author: string;
    }>;
    fileDiffs: GitTokenFileDiff[];
  }> {
    await this.fetch();
    const branch = await this.getCurrentBranch();
    const remote = `origin/${branch}`;

    // Commits that would be pushed
    const logResult = await this.git.log({ from: remote, to: "HEAD" });
    const commits = logResult.all.map((e) => ({
      hash: e.hash,
      date: e.date,
      message: e.message,
      author: e.author_name,
    }));

    const fileDiffs = await this.loadTokenFileDiffs({
      diffArgs: ["diff", "--name-status", `${remote}..HEAD`],
      loadBefore: async (filePath, status) =>
        status === "A" ? null : this.showFileAtCommit(remote, filePath),
      loadAfter: async (filePath, status) =>
        status === "D" ? null : this.showFileAtCommit("HEAD", filePath),
    });

    return { commits, fileDiffs };
  }

  /** Token-level diff of what a pull would bring in (remote tracking branch vs local HEAD).
   *  Also returns the list of incoming commits. */
  async getPullPreview(): Promise<{
    commits: Array<{
      hash: string;
      date: string;
      message: string;
      author: string;
    }>;
    fileDiffs: GitTokenFileDiff[];
  }> {
    await this.fetch();
    const branch = await this.getCurrentBranch();
    const remote = `origin/${branch}`;

    // Commits that would be pulled
    const logResult = await this.git.log({ from: "HEAD", to: remote });
    const commits = logResult.all.map((e) => ({
      hash: e.hash,
      date: e.date,
      message: e.message,
      author: e.author_name,
    }));

    const fileDiffs = await this.loadTokenFileDiffs({
      diffArgs: ["diff", "--name-status", `HEAD..${remote}`],
      loadBefore: async (filePath, status) =>
        status === "A" ? null : this.showFileAtCommit("HEAD", filePath),
      loadAfter: async (filePath, status) =>
        status === "D" ? null : this.showFileAtCommit(remote, filePath),
    });

    return { commits, fileDiffs };
  }

  /** Compare local HEAD vs remote tracking branch.
   *  Returns categorized file lists. Requires remote to be configured. */
  async computeUnifiedDiff(): Promise<{
    localOnly: string[];
    remoteOnly: string[];
    conflicts: string[];
  }> {
    await this.fetch();
    const branch = await this.getCurrentBranch();
    const remote = `origin/${branch}`;

    const [localRaw, remoteRaw] = await Promise.all([
      this.git
        .raw(["diff", "--name-only", `${remote}..HEAD`])
        .catch((err: unknown) => {
          throw new Error(
            `Failed to compute local diff against ${remote}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }),
      this.git
        .raw(["diff", "--name-only", `HEAD..${remote}`])
        .catch((err: unknown) => {
          throw new Error(
            `Failed to compute remote diff against ${remote}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }),
    ]);

    const localFiles = localRaw.trim().split("\n").filter(Boolean);
    const remoteFiles = remoteRaw.trim().split("\n").filter(Boolean);
    const conflictSet = new Set(
      localFiles.filter((f) => remoteFiles.includes(f)),
    );

    return {
      localOnly: localFiles.filter((f) => !conflictSet.has(f)),
      remoteOnly: remoteFiles.filter((f) => !conflictSet.has(f)),
      conflicts: [...conflictSet],
    };
  }

  /** Apply direction choices: push, pull, or skip per file */
  async applyDiffChoices(
    choices: Record<string, "push" | "pull" | "skip">,
    stores?: {
      tokenStore?: TokenStore;
      collectionsStore?: CollectionStore;
      reloadCollectionsWorkspace?: () => Promise<void>;
      recipeService?: RecipeService;
      resolverStore?: ResolverStore;
    },
  ): Promise<ApplyDiffResult> {
    return this.lock.withLock(async () => {
      const toPull = Object.entries(choices)
        .filter(([, d]) => d === "pull")
        .map(([f]) => f);
      const toPush = Object.entries(choices)
        .filter(([, d]) => d === "push")
        .map(([f]) => f);
      this.validatePaths([...toPull, ...toPush]);

      const result: ApplyDiffResult = {
        pullFailedFiles: [],
        pullCommitFailed: false,
        pushCommitFailed: false,
        pushFailed: false,
      };

      if (toPull.length > 0) {
        // Suppress watcher events for all files we're about to check out so the
        // watcher doesn't reload them mid-iteration while git is still writing.
        for (const file of toPull) {
          const absolutePath = path.join(this.dir, file);
          if (stores?.tokenStore && file.endsWith(".tokens.json")) {
            stores.tokenStore.startWriteGuard(absolutePath);
          }
          if (
            stores?.collectionsStore &&
            path.basename(file) === "$collections.json"
          ) {
            stores.collectionsStore.startWriteGuard(absolutePath);
          }
          if (
            stores?.recipeService &&
            path.basename(file) === "$recipes.json"
          ) {
            stores.recipeService.startWriteGuard(absolutePath);
          }
          if (stores?.resolverStore && file.endsWith(".resolver.json")) {
            stores.resolverStore.startWriteGuard(absolutePath);
          }
        }

        // Checkout individual files from remote
        const branch = await this.getCurrentBranch();
        for (const file of toPull) {
          try {
            await this.git.raw(["checkout", `origin/${branch}`, "--", file]);
          } catch (err) {
            console.warn(`[GitSync] Failed to checkout file "${file}":`, err);
            result.pullFailedFiles.push(file);
          }
        }
        // Clear guards for files that failed checkout — git never wrote them,
        // so the watcher won't fire to clear them automatically.
        if (result.pullFailedFiles.length > 0) {
          for (const file of result.pullFailedFiles) {
            const absolutePath = path.join(this.dir, file);
            if (stores?.tokenStore && file.endsWith(".tokens.json")) {
              stores.tokenStore.endWriteGuard(absolutePath);
            }
            if (
              stores?.collectionsStore &&
              path.basename(file) === "$collections.json"
            ) {
              stores.collectionsStore.endWriteGuard(absolutePath);
            }
            if (
              stores?.recipeService &&
              path.basename(file) === "$recipes.json"
            ) {
              stores.recipeService.endWriteGuard(absolutePath);
            }
            if (stores?.resolverStore && file.endsWith(".resolver.json")) {
              stores.resolverStore.endWriteGuard(absolutePath);
            }
          }
        }

        const pulledFiles = toPull.filter(
          (f) => !result.pullFailedFiles.includes(f),
        );
        if (pulledFiles.length > 0) {
          await this.git.add(pulledFiles);
          try {
            await this.git.commit(
              `chore: pull ${pulledFiles.length} file(s) from remote`,
            );
          } catch (err) {
            console.warn(
              "[GitSync] Pull commit failed (may have no changes):",
              err,
            );
            result.pullCommitFailed = true;
            result.pullCommitError = String(err);
          }
          // Explicitly reload all successfully pulled workspace files so the
          // in-memory services stay in sync with the checked-out content
          // without relying on watcher timing.
          for (const file of pulledFiles) {
            try {
              if (stores?.tokenStore && file.endsWith(".tokens.json")) {
                await stores.tokenStore.reloadFile(file);
              } else if (
                stores?.collectionsStore &&
                path.basename(file) === "$collections.json"
              ) {
                await stores.collectionsStore.reloadFromDisk();
                await stores.reloadCollectionsWorkspace?.();
              } else if (
                stores?.recipeService &&
                path.basename(file) === "$recipes.json"
              ) {
                await stores.recipeService.reloadFromDisk();
              } else if (
                stores?.resolverStore &&
                file.endsWith(".resolver.json")
              ) {
                await stores.resolverStore.reloadFile(file);
              }
            } catch (err) {
              console.warn(
                `[GitSync] Failed to reload "${file}" after pull:`,
                err,
              );
            }
          }
        }
      }
      // 'push' direction: stage only the selected files, commit, then push
      if (toPush.length > 0) {
        await this.git.add(toPush);
        let pushCommitSucceeded = false;
        try {
          await this.git.commit(
            `chore: push ${toPush.length} file(s) to remote`,
          );
          pushCommitSucceeded = true;
        } catch (err) {
          console.warn(
            "[GitSync] Push commit failed (may have no changes):",
            err,
          );
          result.pushCommitFailed = true;
          result.pushCommitError = String(err);
        }
        if (pushCommitSucceeded) {
          try {
            await wrapNetworkOp("push", this.git.push());
          } catch (err) {
            console.warn("[GitSync] Push to remote failed:", err);
            result.pushFailed = true;
            result.pushError = String(err);
            if (err instanceof GitTimeoutError) throw err;
          }
        }
      }

      return result;
    });
  }
}
