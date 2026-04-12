import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Token } from "@tokenmanager/core";
import type { TokenStore } from "./token-store.js";
import type { SetMetadataState } from "./token-store.js";
import { NotFoundError, ConflictError } from "../errors.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";

/** A snapshot of a single token path — null means the token did not exist. */
export interface SnapshotEntry {
  token: Token | null;
  setName: string;
}

export interface TokenPathRename {
  oldPath: string;
  newPath: string;
}

const MULTI_SET_SNAPSHOT_SEPARATOR = "::";

export function buildMultiSetSnapshotPath(
  setName: string,
  tokenPath: string,
): string {
  return `${setName}${MULTI_SET_SNAPSHOT_SEPARATOR}${tokenPath}`;
}

export function getSnapshotTokenPath(
  snapshotKey: string,
  setName: string,
): string {
  const prefix = `${setName}${MULTI_SET_SNAPSHOT_SEPARATOR}`;
  return snapshotKey.startsWith(prefix)
    ? snapshotKey.slice(prefix.length)
    : snapshotKey;
}

export function listSnapshotTokenPaths(
  snapshot: Record<string, SnapshotEntry>,
): string[] {
  return [
    ...new Set(
      Object.entries(snapshot).map(([snapshotKey, entry]) =>
        getSnapshotTokenPath(snapshotKey, entry.setName),
      ),
    ),
  ];
}

export function qualifySnapshotEntries(
  setName: string,
  snapshot: Record<string, SnapshotEntry>,
): Record<string, SnapshotEntry> {
  const result: Record<string, SnapshotEntry> = {};
  for (const [tokenPath, entry] of Object.entries(snapshot)) {
    result[buildMultiSetSnapshotPath(setName, tokenPath)] = entry;
  }
  return result;
}

export function mergeSnapshots(
  ...snapshots: Array<Record<string, SnapshotEntry>>
): Record<string, SnapshotEntry> {
  return Object.assign({}, ...snapshots);
}

function findSnapshotEntryForTokenPath(
  snapshot: Record<string, SnapshotEntry>,
  tokenPath: string,
): SnapshotEntry | undefined {
  const direct = snapshot[tokenPath];
  if (direct) {
    return direct;
  }
  for (const [snapshotKey, entry] of Object.entries(snapshot)) {
    if (getSnapshotTokenPath(snapshotKey, entry.setName) === tokenPath) {
      return entry;
    }
  }
  return undefined;
}

function snapshotContainsTokenPath(
  snapshot: Record<string, SnapshotEntry>,
  tokenPath: string,
): boolean {
  return findSnapshotEntryForTokenPath(snapshot, tokenPath) !== undefined;
}

export interface SetMetadataChange {
  field: keyof SetMetadataState;
  label: "Description" | "Collection" | "Mode";
  before?: string;
  after?: string;
}

export interface SetMetadataOperationMetadata {
  kind: "set-metadata";
  name: string;
  before: SetMetadataState;
  after: SetMetadataState;
  changes: SetMetadataChange[];
}

/** Structural rollback step — executed before token restoration during rollback. */
export type RollbackStep =
  | { action: "create-set"; name: string }
  | { action: "delete-set"; name: string }
  | { action: "rename-set"; from: string; to: string }
  | { action: "reorder-sets"; order: string[] }
  | {
      action: "write-set-metadata";
      name: string;
      metadata: Partial<SetMetadataState>;
    }
  | { action: "write-themes"; dimensions: unknown }
  | { action: "write-resolver"; name: string; file: unknown }
  | { action: "delete-resolver"; name: string }
  | { action: "create-generator"; generator: unknown }
  | { action: "delete-generator"; id: string };

/**
 * Minimal interface for serialized access to the $themes.json file.
 * Structurally compatible with DimensionsStore from routes/themes.ts.
 */
export interface ThemesWriteLock {
  withLock<T>(
    fn: (dims: any[]) => Promise<{ dims: any[]; result: T }>,
  ): Promise<T>;
}

/** Context required for rollback — provides access to all services that may need restoration. */
export interface RollbackContext {
  tokenStore: TokenStore;
  /**
   * Provides serialized read/write access to $themes.json.
   * Must be passed so that rollback does not bypass the DimensionsStore lock chain,
   * which would race with concurrent theme mutations and corrupt the file.
   */
  themesStore?: ThemesWriteLock;
  resolverLock?: {
    withLock<T>(fn: () => Promise<T>): Promise<T>;
  };
  resolverStore?: {
    get(name: string): unknown;
    create(name: string, file: any): Promise<void>;
    update(name: string, file: any): Promise<void>;
    delete(name: string): Promise<boolean>;
    updateSetReferences?(oldName: string, newName: string): Promise<string[]>;
  };
  generatorService?: {
    updateSetName(oldName: string, newName: string): Promise<number | void>;
    getById(id: string): Promise<unknown>;
    restore(generator: unknown): Promise<void>;
    delete(id: string): Promise<boolean>;
  };
}

export interface OperationEntry {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  setName: string;
  affectedPaths: string[];
  beforeSnapshot: Record<string, SnapshotEntry>;
  afterSnapshot: Record<string, SnapshotEntry>;
  rolledBack: boolean;
  /** Steps to execute during rollback, before token snapshot restoration. */
  rollbackSteps?: RollbackStep[];
  /**
   * Explicit old→new token path pairs for rename operations.
   * Used by the Figma plugin to rename existing variables instead of
   * creating orphans when tokens are renamed on the server.
   */
  pathRenames?: TokenPathRename[];
  /** Arbitrary metadata for the operation (e.g. set-metadata before/after). */
  metadata?: SetMetadataOperationMetadata | Record<string, unknown>;
}

/** Lightweight version returned by the list endpoint (no snapshot data). */
export interface OperationSummary {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  setName: string;
  affectedPaths: string[];
  rolledBack: boolean;
  metadata?: OperationEntry["metadata"];
}

/** A single entry in a per-token value timeline. */
export interface TokenHistoryEntry {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  setName: string;
  rolledBack: boolean;
  before: import("@tokenmanager/core").Token | null;
  after: import("@tokenmanager/core").Token | null;
}

interface PathRenameEntry {
  operationId: string;
  rolledBack: boolean;
  pathRenames: TokenPathRename[];
}

export class OperationLog {
  private entries: OperationEntry[] = [];
  private pathRenameEntries: PathRenameEntry[] = [];
  private filePath: string;
  private pathRenameFilePath: string;
  private tokenDir: string;
  private loadPromise: Promise<void> | null = null;
  private lock = new PromiseChainLock();

  constructor(tokenDir: string) {
    this.tokenDir = path.resolve(tokenDir);
    const tmDir = path.join(this.tokenDir, ".tokenmanager");
    this.filePath = path.join(tmDir, "operations.json");
    this.pathRenameFilePath = path.join(tmDir, "path-renames.json");
  }

  private clonePathRenames(
    pathRenames: TokenPathRename[],
  ) {
    return pathRenames.map(({ oldPath, newPath }) => ({ oldPath, newPath }));
  }

  private toPathRenameEntry(entry: OperationEntry): PathRenameEntry | null {
    if (!entry.pathRenames?.length) {
      return null;
    }
    return {
      operationId: entry.id,
      rolledBack: entry.rolledBack,
      pathRenames: this.clonePathRenames(entry.pathRenames),
    };
  }

  private ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = Promise.all([
        fs
          .readFile(this.filePath, "utf-8")
          .then((raw) => JSON.parse(raw) as OperationEntry[])
          .catch(() => []),
        fs
          .readFile(this.pathRenameFilePath, "utf-8")
          .then((raw) => JSON.parse(raw) as PathRenameEntry[])
          .catch(() => null),
      ]).then(([entries, pathRenameEntries]) => {
        this.entries = entries;
        this.pathRenameEntries =
          pathRenameEntries ??
          this.entries
            .map((entry) => this.toPathRenameEntry(entry))
            .filter((entry): entry is PathRenameEntry => entry !== null);
      });
    }
    return this.loadPromise;
  }

  private async persistEntries(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.entries, null, 2), "utf-8");
    await fs.rename(tmp, this.filePath);
  }

  private async persistPathRenameEntries(): Promise<void> {
    await fs.mkdir(path.dirname(this.pathRenameFilePath), { recursive: true });
    const tmp = `${this.pathRenameFilePath}.tmp`;
    await fs.writeFile(
      tmp,
      JSON.stringify(this.pathRenameEntries, null, 2),
      "utf-8",
    );
    await fs.rename(tmp, this.pathRenameFilePath);
  }

  private async cleanupStoreDir(): Promise<void> {
    await fs.rmdir(path.dirname(this.filePath)).catch(() => {});
  }

  /** Push a new entry and persist — must be called while holding the lock. */
  private async pushAndPersist(
    entry: Omit<OperationEntry, "id" | "timestamp" | "rolledBack">,
  ): Promise<OperationEntry> {
    const full: OperationEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      rolledBack: false,
    };
    this.entries.push(full);
    const pathRenameEntry = this.toPathRenameEntry(full);
    if (pathRenameEntry) {
      this.pathRenameEntries.push(pathRenameEntry);
      await Promise.all([
        this.persistEntries(),
        this.persistPathRenameEntries(),
      ]);
    } else {
      await this.persistEntries();
    }
    return full;
  }

  /** Record a new operation entry. */
  async record(
    entry: Omit<OperationEntry, "id" | "timestamp" | "rolledBack">,
  ): Promise<OperationEntry> {
    await this.ensureLoaded();
    return this.lock.withLock(() => this.pushAndPersist(entry));
  }

  async reset(): Promise<void> {
    await this.ensureLoaded();
    await this.lock.withLock(async () => {
      await fs.rm(this.filePath, { force: true });
      await fs.rm(this.pathRenameFilePath, { force: true });
      this.entries = [];
      this.pathRenameEntries = [];
      await this.cleanupStoreDir();
    });
  }

  /** Get recent entries (newest first) as lightweight summaries, with total count. */
  async getRecent(
    limit = 5,
    offset = 0,
  ): Promise<{ entries: OperationSummary[]; total: number }> {
    await this.ensureLoaded();
    const total = this.entries.length;
    // entries stored oldest-first; slice from the newest end using offset
    const end = Math.max(0, total - offset);
    const start = Math.max(0, end - limit);
    const entries = this.entries
      .slice(start, end)
      .reverse()
      .map(
        ({
          id,
          timestamp,
          type,
          description,
          setName,
          affectedPaths,
          rolledBack,
          metadata,
        }) => ({
          id,
          timestamp,
          type,
          description,
          setName,
          affectedPaths,
          rolledBack,
          metadata,
        }),
      );
    return { entries, total };
  }

  /** Get a full entry by ID. */
  async getById(id: string): Promise<OperationEntry | undefined> {
    await this.ensureLoaded();
    return this.entries.find((e) => e.id === id);
  }

  /** Get the value-change history for a specific token path (newest first). */
  async getTokenHistory(
    tokenPath: string,
    limit = 20,
    offset = 0,
  ): Promise<{ entries: TokenHistoryEntry[]; total: number }> {
    await this.ensureLoaded();
    // Filter to operations that affected this path and had a value change
    const matching = this.entries
      .filter(
        (entry) =>
          entry.affectedPaths.includes(tokenPath) ||
          snapshotContainsTokenPath(entry.beforeSnapshot, tokenPath) ||
          snapshotContainsTokenPath(entry.afterSnapshot, tokenPath),
      )
      .reverse(); // newest first
    const total = matching.length;
    const page = matching.slice(offset, offset + limit);
    const entries: TokenHistoryEntry[] = page.map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      type: e.type,
      description: e.description,
      setName: e.setName,
      rolledBack: e.rolledBack,
      before:
        findSnapshotEntryForTokenPath(e.beforeSnapshot, tokenPath)?.token ??
        null,
      after:
        findSnapshotEntryForTokenPath(e.afterSnapshot, tokenPath)?.token ??
        null,
    }));
    return { entries, total };
  }

  /**
   * Return all recorded path rename pairs from non-rolled-back rename operations.
   * Used by the Figma plugin to rename existing variables when tokens are renamed.
   */
  async getPathRenames(): Promise<Array<{ oldPath: string; newPath: string }>> {
    await this.ensureLoaded();
    const renames: Array<{ oldPath: string; newPath: string }> = [];
    for (const entry of this.pathRenameEntries) {
      if (entry.rolledBack) {
        continue;
      }
      renames.push(...this.clonePathRenames(entry.pathRenames));
    }
    return renames;
  }

  // ---------------------------------------------------------------------------
  // Themes file helpers (for structural rollback of theme operations)
  // ---------------------------------------------------------------------------

  private async readThemesFile(): Promise<unknown> {
    try {
      const content = await fs.readFile(
        path.join(this.tokenDir, "$themes.json"),
        "utf-8",
      );
      const data = JSON.parse(content);
      return data.$themes || [];
    } catch {
      return [];
    }
  }

  private async writeThemesFile(dimensions: unknown): Promise<void> {
    const data = { $themes: dimensions };
    const dest = path.join(this.tokenDir, "$themes.json");
    const tmp = `${dest}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, dest);
  }

  // ---------------------------------------------------------------------------
  // Structural rollback step execution
  // ---------------------------------------------------------------------------

  private async computeInverseSteps(
    steps: RollbackStep[],
    ctx: RollbackContext,
  ): Promise<RollbackStep[]> {
    const inverse: RollbackStep[] = [];
    for (const step of steps) {
      switch (step.action) {
        case "create-set":
          inverse.push({ action: "delete-set", name: step.name });
          break;
        case "delete-set":
          inverse.push({ action: "create-set", name: step.name });
          break;
        case "rename-set":
          inverse.push({ action: "rename-set", from: step.to, to: step.from });
          break;
        case "reorder-sets": {
          const currentOrder = await ctx.tokenStore.getSets();
          inverse.push({ action: "reorder-sets", order: currentOrder });
          break;
        }
        case "write-set-metadata": {
          const current = ctx.tokenStore.getSetMetadata(step.name);
          const metadata: Partial<SetMetadataState> = {};
          for (const field of Object.keys(step.metadata) as Array<
            keyof SetMetadataState
          >) {
            metadata[field] = current[field];
          }
          inverse.push({
            action: "write-set-metadata",
            name: step.name,
            metadata,
          });
          break;
        }
        case "write-themes": {
          // Read current themes state while holding the DimensionsStore lock so that
          // an in-flight theme mutation cannot complete its save between our read and
          // the inverse-step computation, which would produce a stale snapshot.
          let currentDims: unknown;
          if (ctx.themesStore) {
            currentDims = await ctx.themesStore.withLock(async (dims) => ({
              dims, // no-op: don't modify dims
              result: structuredClone(dims),
            }));
          } else {
            currentDims = await this.readThemesFile();
          }
          inverse.push({ action: "write-themes", dimensions: currentDims });
          break;
        }
        case "write-resolver": {
          if (ctx.resolverStore) {
            const current = ctx.resolverStore.get(step.name);
            if (current) {
              inverse.push({
                action: "write-resolver",
                name: step.name,
                file: structuredClone(current),
              });
            } else {
              inverse.push({ action: "delete-resolver", name: step.name });
            }
          }
          break;
        }
        case "delete-resolver": {
          if (ctx.resolverStore) {
            const current = ctx.resolverStore.get(step.name);
            if (current) {
              inverse.push({
                action: "write-resolver",
                name: step.name,
                file: structuredClone(current),
              });
            }
          }
          break;
        }
        case "create-generator":
          // inverse: delete the generator that was just created
          inverse.push({
            action: "delete-generator",
            id: (step.generator as { id: string }).id,
          });
          break;
        case "delete-generator": {
          // inverse: re-create the generator — look up current state before it's deleted
          if (ctx.generatorService) {
            const current = await ctx.generatorService.getById(step.id);
            if (current) {
              inverse.push({
                action: "create-generator",
                generator: structuredClone(current),
              });
            }
          }
          break;
        }
      }
    }
    return inverse;
  }

  private async executeSteps(
    steps: RollbackStep[],
    ctx: RollbackContext,
  ): Promise<void> {
    for (const step of steps) {
      switch (step.action) {
        case "create-set":
          await ctx.tokenStore.createSet(step.name);
          break;
        case "delete-set":
          await ctx.tokenStore.deleteSet(step.name);
          break;
        case "rename-set":
          await ctx.tokenStore.renameSet(step.from, step.to);
          if (ctx.resolverStore?.updateSetReferences) {
            const rewriteResolverRefs = () =>
              ctx.resolverStore!.updateSetReferences!(step.from, step.to);
            if (ctx.resolverLock) {
              await ctx.resolverLock.withLock(rewriteResolverRefs);
            } else {
              await rewriteResolverRefs();
            }
          }
          if (ctx.generatorService) {
            await ctx.generatorService.updateSetName(step.from, step.to);
          }
          break;
        case "reorder-sets":
          await ctx.tokenStore.reorderSets(step.order as string[]);
          break;
        case "write-set-metadata":
          await ctx.tokenStore.updateSetMetadata(step.name, step.metadata);
          break;
        case "write-themes":
          // Write through the DimensionsStore lock so that concurrent theme mutations
          // serialise behind this rollback write and don't overwrite it.
          if (ctx.themesStore) {
            await ctx.themesStore.withLock(async () => ({
              dims: step.dimensions as any[],
              result: undefined,
            }));
          } else {
            await this.writeThemesFile(step.dimensions);
          }
          break;
        case "write-resolver": {
          if (ctx.resolverStore) {
            const writeResolver = async () => {
              const existing = ctx.resolverStore!.get(step.name);
              if (existing) {
                await ctx.resolverStore!.update(step.name, step.file);
              } else {
                await ctx.resolverStore!.create(step.name, step.file);
              }
            };
            if (ctx.resolverLock) {
              await ctx.resolverLock.withLock(writeResolver);
            } else {
              await writeResolver();
            }
          }
          break;
        }
        case "delete-resolver":
          if (ctx.resolverStore) {
            const deleteResolver = () => ctx.resolverStore!.delete(step.name);
            if (ctx.resolverLock) {
              await ctx.resolverLock.withLock(deleteResolver);
            } else {
              await deleteResolver();
            }
          }
          break;
        case "create-generator":
          if (!ctx.generatorService) {
            throw new Error(
              `Cannot execute rollback step "create-generator": generatorService not available in RollbackContext`,
            );
          }
          await ctx.generatorService.restore(step.generator);
          break;
        case "delete-generator":
          if (!ctx.generatorService) {
            throw new Error(
              `Cannot execute rollback step "delete-generator": generatorService not available in RollbackContext`,
            );
          }
          await ctx.generatorService.delete(step.id);
          break;
      }
    }
  }

  private markPathRenameEntryRolledBack(operationId: string): void {
    const pathRenameEntry = this.pathRenameEntries.find(
      (entry) => entry.operationId === operationId,
    );
    if (pathRenameEntry) {
      pathRenameEntry.rolledBack = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Rollback
  // ---------------------------------------------------------------------------

  /** Roll back an operation by restoring structural state and token snapshots. */
  async rollback(
    id: string,
    ctx: RollbackContext,
  ): Promise<{ restoredPaths: string[]; rollbackEntryId: string }> {
    await this.ensureLoaded();
    // Acquire the lock for the entire rollback so that concurrent rollback requests
    // for the same operation cannot both pass the `rolledBack` check before either
    // sets it to true (TOCTOU race).
    return this.lock.withLock(async () => {
      const entry = this.entries.find((e) => e.id === id);
      if (!entry) throw new NotFoundError(`Operation "${id}" not found`);
      if (entry.rolledBack)
        throw new ConflictError(`Operation "${id}" was already rolled back`);

      // Compute inverse of structural steps before executing them
      let inverseSteps: RollbackStep[] | undefined;
      if (entry.rollbackSteps?.length) {
        inverseSteps = await this.computeInverseSteps(entry.rollbackSteps, ctx);
      }

      // Execute structural rollback steps, snapshot current token state, and restore tokens
      // atomically: if any step fails, revert structural changes using the pre-computed inverse steps.
      const currentSnapshot: Record<string, SnapshotEntry> = {};
      try {
        // Execute structural rollback steps first (e.g. re-create a deleted set)
        if (entry.rollbackSteps?.length) {
          await this.executeSteps(entry.rollbackSteps, ctx);
        }

        // Capture current token state as "before" for the rollback operation itself
        for (const [snapshotKey, snap] of Object.entries(
          entry.beforeSnapshot,
        )) {
          const tokenPath = getSnapshotTokenPath(snapshotKey, snap.setName);
          try {
            const flatTokens = await ctx.tokenStore.getFlatTokensForSet(
              snap.setName,
            );
            currentSnapshot[snapshotKey] = {
              token: flatTokens[tokenPath]
                ? structuredClone(flatTokens[tokenPath])
                : null,
              setName: snap.setName,
            };
          } catch {
            // Set may not exist yet (will be created by token restoration)
            currentSnapshot[snapshotKey] = {
              token: null,
              setName: snap.setName,
            };
          }
        }

        // Group by set for batch token processing
        const bySet = new Map<
          string,
          Array<{ path: string; token: Token | null }>
        >();
        for (const [snapshotKey, snap] of Object.entries(
          entry.beforeSnapshot,
        )) {
          const tokenPath = getSnapshotTokenPath(snapshotKey, snap.setName);
          let list = bySet.get(snap.setName);
          if (!list) {
            list = [];
            bySet.set(snap.setName, list);
          }
          list.push({ path: tokenPath, token: snap.token });
        }

        // Restore tokens
        for (const [setName, items] of bySet) {
          await ctx.tokenStore.restoreSnapshot(setName, items);
        }
      } catch (err) {
        // Rollback failed mid-way — attempt to revert any structural steps that already ran,
        // restoring structural state to what it was before we started. Best-effort: if the
        // revert also fails we surface the original error so the caller sees the root cause.
        if (inverseSteps?.length) {
          try {
            await this.executeSteps(inverseSteps, ctx);
          } catch (revertErr) {
            // Revert also failed — system is in an inconsistent state.
            const revertMsg =
              revertErr instanceof Error
                ? revertErr.message
                : String(revertErr);
            const origMsg = err instanceof Error ? err.message : String(err);
            console.error(
              `[operation-log] CRITICAL: rollback of operation "${id}" failed (${origMsg}) ` +
                `and the structural revert also failed (${revertMsg}). ` +
                `System may be in an inconsistent state.`,
            );
            const combined = new Error(
              `Rollback failed: ${origMsg}. Structural revert also failed: ${revertMsg}. System may be in an inconsistent state.`,
            );
            (
              combined as NodeJS.ErrnoException & { statusCode?: number }
            ).statusCode = 500;
            throw combined;
          }
        }
        throw err;
      }

      // Mark the original entry as rolled-back and record the rollback entry.
      // Already inside withLock, so no inner lock needed.
      entry.rolledBack = true;
      this.markPathRenameEntryRolledBack(entry.id);
      const rollbackPathRenames = entry.pathRenames?.length
        ? entry.pathRenames.map(({ oldPath, newPath }) => ({
            oldPath: newPath,
            newPath: oldPath,
          }))
        : undefined;
      const rollbackEntry = await this.pushAndPersist({
        type: "rollback",
        description: `Undo: ${entry.description}`,
        setName: entry.setName,
        affectedPaths: entry.affectedPaths,
        beforeSnapshot: currentSnapshot,
        afterSnapshot: entry.beforeSnapshot,
        ...(rollbackPathRenames?.length
          ? { pathRenames: rollbackPathRenames }
          : {}),
        ...(inverseSteps?.length ? { rollbackSteps: inverseSteps } : {}),
      });

      return {
        restoredPaths: listSnapshotTokenPaths(entry.beforeSnapshot),
        rollbackEntryId: rollbackEntry.id,
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Snapshot helpers — call these before/after mutations to capture state
// ---------------------------------------------------------------------------

/** Snapshot specific token paths in a set. Returns path -> SnapshotEntry. */
export async function snapshotPaths(
  tokenStore: TokenStore,
  setName: string,
  paths: string[],
): Promise<Record<string, SnapshotEntry>> {
  const flatTokens = await tokenStore.getFlatTokensForSet(setName);
  const result: Record<string, SnapshotEntry> = {};
  for (const p of paths) {
    result[p] = {
      token: flatTokens[p] ? structuredClone(flatTokens[p]) : null,
      setName,
    };
  }
  return result;
}

/** Snapshot all tokens in a set. */
export async function snapshotSet(
  tokenStore: TokenStore,
  setName: string,
): Promise<Record<string, SnapshotEntry>> {
  const flatTokens = await tokenStore.getFlatTokensForSet(setName);
  const result: Record<string, SnapshotEntry> = {};
  for (const [p, token] of Object.entries(flatTokens)) {
    result[p] = { token: structuredClone(token), setName };
  }
  return result;
}

/** Snapshot all tokens across multiple sets with set-qualified keys. */
export async function snapshotSets(
  tokenStore: TokenStore,
  setNames: string[],
): Promise<Record<string, SnapshotEntry>> {
  const result: Record<string, SnapshotEntry> = {};
  for (const setName of setNames) {
    const flatTokens = await tokenStore.getFlatTokensForSet(setName);
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      result[buildMultiSetSnapshotPath(setName, tokenPath)] = {
        token: structuredClone(token),
        setName,
      };
    }
  }
  return result;
}

/** Snapshot all tokens under a group prefix in a set. */
export async function snapshotGroup(
  tokenStore: TokenStore,
  setName: string,
  groupPrefix: string,
): Promise<Record<string, SnapshotEntry>> {
  const flatTokens = await tokenStore.getFlatTokensForSet(setName);
  const result: Record<string, SnapshotEntry> = {};
  const prefix = groupPrefix + ".";
  for (const [p, token] of Object.entries(flatTokens)) {
    if (p === groupPrefix || p.startsWith(prefix)) {
      result[p] = { token: structuredClone(token), setName };
    }
  }
  return result;
}
