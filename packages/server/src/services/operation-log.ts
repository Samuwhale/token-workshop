import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ResolverFile,
  TokenCollection,
  ViewPreset,
  Token,
  TokenGenerator,
} from "@tokenmanager/core";
import type {
  CollectionMetadataState,
  CollectionPublishRoutingState,
} from "./collection-store.js";
import type { CollectionService } from "./collection-service.js";
import type { LintConfig } from "./lint.js";
import type {
  TokenStore,
} from "./token-store.js";
import { stableStringify } from "@tokenmanager/core";
import { NotFoundError, ConflictError } from "../errors.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";
import { expectJsonArray, parseJsonFile } from "../utils/json-file.js";

/** A snapshot of a single token path — null means the token did not exist. */
export interface SnapshotEntry {
  token: Token | null;
  collectionId: string;
}

export interface TokenPathRename {
  oldPath: string;
  newPath: string;
}

const COLLECTION_SNAPSHOT_SEPARATOR = "::";

export function buildCollectionSnapshotKey(
  collectionId: string,
  tokenPath: string,
): string {
  return `${collectionId}${COLLECTION_SNAPSHOT_SEPARATOR}${tokenPath}`;
}

export function getSnapshotTokenPath(
  snapshotKey: string,
  collectionId: string,
): string {
  const prefix = `${collectionId}${COLLECTION_SNAPSHOT_SEPARATOR}`;
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
        getSnapshotTokenPath(snapshotKey, entry.collectionId),
      ),
    ),
  ];
}

function snapshotEntriesEqual(
  left: SnapshotEntry | undefined,
  right: SnapshotEntry | undefined,
): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.collectionId === right.collectionId &&
    stableStringify(left.token) === stableStringify(right.token)
  );
}

export function listChangedSnapshotKeys(
  before: Record<string, SnapshotEntry>,
  after: Record<string, SnapshotEntry>,
): string[] {
  const changedKeys: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const snapshotKey of keys) {
    if (!snapshotEntriesEqual(before[snapshotKey], after[snapshotKey])) {
      changedKeys.push(snapshotKey);
    }
  }
  return changedKeys;
}

export function listChangedSnapshotTokenPaths(
  before: Record<string, SnapshotEntry>,
  after: Record<string, SnapshotEntry>,
): string[] {
  return [
    ...new Set(
      listChangedSnapshotKeys(before, after).map((snapshotKey) => {
        const entry = after[snapshotKey] ?? before[snapshotKey];
        if (!entry) {
          return snapshotKey;
        }
        return getSnapshotTokenPath(snapshotKey, entry.collectionId);
      }),
    ),
  ];
}

export function pickSnapshotEntries(
  snapshot: Record<string, SnapshotEntry>,
  snapshotKeys: string[],
): Record<string, SnapshotEntry> {
  const result: Record<string, SnapshotEntry> = {};
  for (const snapshotKey of snapshotKeys) {
    const entry = snapshot[snapshotKey];
    if (entry) {
      result[snapshotKey] = entry;
    }
  }
  return result;
}

export function qualifySnapshotEntries(
  collectionId: string,
  snapshot: Record<string, SnapshotEntry>,
): Record<string, SnapshotEntry> {
  const result: Record<string, SnapshotEntry> = {};
  for (const [tokenPath, entry] of Object.entries(snapshot)) {
    result[buildCollectionSnapshotKey(collectionId, tokenPath)] = entry;
  }
  return result;
}

export function mergeSnapshots(
  ...snapshots: Array<Record<string, SnapshotEntry>>
): Record<string, SnapshotEntry> {
  return Object.assign({}, ...snapshots);
}

export async function restoreSnapshotEntries(
  tokenStore: Pick<TokenStore, "restoreSnapshot">,
  snapshot: Record<string, SnapshotEntry>,
): Promise<void> {
  const itemsByCollection = new Map<
    string,
    Array<{ path: string; token: SnapshotEntry["token"] }>
  >();

  for (const [snapshotKey, entry] of Object.entries(snapshot)) {
    const items = itemsByCollection.get(entry.collectionId) ?? [];
    items.push({
      path: getSnapshotTokenPath(snapshotKey, entry.collectionId),
      token: entry.token ? structuredClone(entry.token) : null,
    });
    itemsByCollection.set(entry.collectionId, items);
  }

  for (const [collectionId, items] of itemsByCollection) {
    await tokenStore.restoreSnapshot(collectionId, items);
  }
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
    if (getSnapshotTokenPath(snapshotKey, entry.collectionId) === tokenPath) {
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

export interface FieldChange {
  field: string;
  label: string;
  before?: string;
  after?: string;
}

export interface FieldChangeOperationMetadata {
  kind: "collection-metadata" | "publish-routing";
  collectionId: string;
  before: CollectionMetadataState | CollectionPublishRoutingState;
  after: CollectionMetadataState | CollectionPublishRoutingState;
  changes: FieldChange[];
}

/** Structural rollback step — executed before token restoration during rollback. */
export type RollbackStep =
  | { action: "create-collection"; collectionId: string }
  | { action: "delete-collection"; collectionId: string }
  | { action: "rename-collection"; from: string; to: string }
  | { action: "reorder-collections"; order: string[] }
  | {
      action: "write-collection-metadata";
      collectionId: string;
      metadata: Partial<CollectionMetadataState>;
    }
  | {
      action: "write-publish-routing";
      collectionId: string;
      routing: Partial<CollectionPublishRoutingState>;
    }
  | {
      action: "restore-collection-state";
      collections: TokenCollection[];
      views?: ViewPreset[];
    }
  | { action: "restore-lint-config"; config: LintConfig }
  | { action: "write-resolver"; name: string; file: ResolverFile }
  | { action: "delete-resolver"; name: string }
  | { action: "create-generator"; generator: TokenGenerator }
  | { action: "delete-generator"; id: string };

/**
/** Context required for rollback — provides access to all services that may need restoration. */
export interface RollbackContext {
  tokenStore: TokenStore;
  collectionService?: CollectionService;
  resolverLock?: {
    withLock<T>(fn: () => Promise<T>): Promise<T>;
  };
  resolverStore?: {
    get(name: string): ResolverFile | undefined;
    create(name: string, file: ResolverFile): Promise<void>;
    update(name: string, file: ResolverFile): Promise<void>;
    delete(name: string): Promise<boolean>;
    renameCollectionReferences?(
      oldName: string,
      newName: string,
    ): Promise<string[]>;
  };
  generatorService?: {
    renameCollectionId(
      oldName: string,
      newName: string,
    ): Promise<number | void>;
    getById(id: string): Promise<TokenGenerator | undefined>;
    restore(generator: TokenGenerator): Promise<void>;
    delete(id: string): Promise<boolean>;
  };
  lintConfigStore?: {
    get(): Promise<LintConfig>;
    save(config: LintConfig): Promise<void>;
  };
}

export interface OperationEntry {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  resourceId: string;
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
  /** Arbitrary metadata for the operation (e.g. collection-metadata before/after). */
  metadata?: FieldChangeOperationMetadata | Record<string, unknown>;
}

/** Lightweight version returned by the list endpoint (no snapshot data). */
export interface OperationSummary {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  resourceId: string;
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
  resourceId: string;
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
  private loadPromise: Promise<void> | null = null;
  private lock = new PromiseChainLock();

  constructor(tokenDir: string) {
    const tmDir = path.join(path.resolve(tokenDir), ".tokenmanager");
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

  private async readStoredArray<T>(
    filePath: string,
  ): Promise<T[] | null> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
    return expectJsonArray<T>(
      parseJsonFile(raw, {
        filePath,
        relativeTo: path.dirname(filePath),
      }),
      {
        filePath,
        relativeTo: path.dirname(filePath),
      },
    );
  }

  private ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = Promise.all([
        this.readStoredArray<OperationEntry>(this.filePath),
        this.readStoredArray<PathRenameEntry>(this.pathRenameFilePath),
      ]).then(([entries, pathRenameEntries]) => {
        this.entries = entries ?? [];
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
    await fs.rmdir(path.dirname(this.filePath)).catch((err) => {
      console.error("[rollback-error] Cleanup failed: could not remove operation log store directory", err);
    });
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
          resourceId,
          affectedPaths,
          rolledBack,
          metadata,
        }) => ({
          id,
          timestamp,
          type,
          description,
          resourceId,
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
      resourceId: e.resourceId,
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
  // Structural rollback step execution
  // ---------------------------------------------------------------------------

  private async computeInverseSteps(
    steps: RollbackStep[],
    ctx: RollbackContext,
  ): Promise<RollbackStep[]> {
    const inverse: RollbackStep[] = [];
    for (const step of steps) {
      switch (step.action) {
        case "create-collection":
          inverse.push({ action: "delete-collection", collectionId: step.collectionId });
          break;
        case "delete-collection":
          inverse.push({ action: "create-collection", collectionId: step.collectionId });
          break;
        case "rename-collection":
          inverse.push({ action: "rename-collection", from: step.to, to: step.from });
          break;
        case "reorder-collections": {
          if (!ctx.collectionService) {
            throw new Error(
              'Cannot compute inverse rollback step "reorder-collections": collectionService not available in RollbackContext',
            );
          }
          const currentOrder = await ctx.collectionService.listCollectionIds();
          inverse.push({ action: "reorder-collections", order: currentOrder });
          break;
        }
        case "write-collection-metadata": {
          if (!ctx.collectionService) {
            break;
          }
          const current = await ctx.collectionService.getCollectionMetadata(
            step.collectionId,
          );
          const metadata: Partial<CollectionMetadataState> = {};
          for (const field of Object.keys(step.metadata) as Array<
            keyof CollectionMetadataState
          >) {
            metadata[field] = current[field];
          }
          inverse.push({
            action: "write-collection-metadata",
            collectionId: step.collectionId,
            metadata,
          });
          break;
        }
        case "write-publish-routing": {
          if (!ctx.collectionService) {
            break;
          }
          const current = await ctx.collectionService.getCollectionPublishRouting(
            step.collectionId,
          );
          const routing: Partial<CollectionPublishRoutingState> = {};
          for (const field of Object.keys(step.routing) as Array<
            keyof CollectionPublishRoutingState
          >) {
            routing[field] = current[field];
          }
          inverse.push({
            action: "write-publish-routing",
            collectionId: step.collectionId,
            routing,
          });
          break;
        }
        case "restore-collection-state": {
          if (!ctx.collectionService) {
            throw new Error(
              'Cannot compute inverse rollback step "restore-collection-state": collectionService not available in RollbackContext',
            );
          }
          const currentState = await ctx.collectionService.loadState();
          inverse.push({
            action: "restore-collection-state",
            collections: currentState.collections,
            views: currentState.views,
          });
          break;
        }
        case "restore-lint-config": {
          if (!ctx.lintConfigStore) {
            throw new Error(
              'Cannot compute inverse rollback step "restore-lint-config": lintConfigStore not available in RollbackContext',
            );
          }
          inverse.push({
            action: "restore-lint-config",
            config: await ctx.lintConfigStore.get(),
          });
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
            id: step.generator.id,
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
        case "create-collection":
          if (!ctx.collectionService) {
            throw new Error(
              'Cannot execute rollback step "create-collection": collectionService not available in RollbackContext',
            );
          }
          await ctx.collectionService.createCollection(step.collectionId);
          break;
        case "delete-collection":
          if (!ctx.collectionService) {
            throw new Error(
              'Cannot execute rollback step "delete-collection": collectionService not available in RollbackContext',
            );
          }
          await ctx.collectionService.deleteCollection(step.collectionId);
          break;
        case "rename-collection":
          if (!ctx.collectionService) {
            throw new Error(
              'Cannot execute rollback step "rename-collection": collectionService not available in RollbackContext',
            );
          }
          await ctx.collectionService.renameCollection(step.from, step.to);
          break;
        case "reorder-collections":
          if (!ctx.collectionService) {
            throw new Error(
              'Cannot execute rollback step "reorder-collections": collectionService not available in RollbackContext',
            );
          }
          await ctx.collectionService.reorderCollections(step.order as string[]);
          break;
        case "write-collection-metadata":
          if (!ctx.collectionService) {
            throw new Error(
              'Cannot execute rollback step "write-collection-metadata": collectionService not available in RollbackContext',
            );
          }
          await ctx.collectionService.updateCollectionMetadata(
            step.collectionId,
            step.metadata,
          );
          break;
        case "write-publish-routing":
          if (!ctx.collectionService) {
            throw new Error(
              'Cannot execute rollback step "write-publish-routing": collectionService not available in RollbackContext',
            );
          }
          await ctx.collectionService.updateCollectionPublishRouting(
            step.collectionId,
            step.routing,
          );
          break;
        case "restore-collection-state":
          if (!ctx.collectionService) {
            throw new Error(
              'Cannot execute rollback step "restore-collection-state": collectionService not available in RollbackContext',
            );
          }
          await ctx.collectionService.restoreWorkspaceStateWithinLock({
            collections: step.collections,
            views: step.views ?? [],
          });
          break;
        case "restore-lint-config":
          if (!ctx.lintConfigStore) {
            throw new Error(
              'Cannot execute rollback step "restore-lint-config": lintConfigStore not available in RollbackContext',
            );
          }
          await ctx.lintConfigStore.save(step.config);
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
        // Execute structural rollback steps first (e.g. re-create a deleted collection)
        if (entry.rollbackSteps?.length) {
          await this.executeSteps(entry.rollbackSteps, ctx);
        }

        // Capture current token state as "before" for the rollback operation itself
        for (const [snapshotKey, snap] of Object.entries(
          entry.beforeSnapshot,
        )) {
          const tokenPath = getSnapshotTokenPath(snapshotKey, snap.collectionId);
          try {
            const flatTokens = await ctx.tokenStore.getFlatTokensForCollection(
              snap.collectionId,
            );
            currentSnapshot[snapshotKey] = {
              token: flatTokens[tokenPath]
                ? structuredClone(flatTokens[tokenPath])
                : null,
              collectionId: snap.collectionId,
            };
          } catch {
            // Collection may not exist yet (will be created by token restoration)
            currentSnapshot[snapshotKey] = {
              token: null,
              collectionId: snap.collectionId,
            };
          }
        }

        // Group by collection for batch token processing
        const byCollection = new Map<
          string,
          Array<{ path: string; token: Token | null }>
        >();
        for (const [snapshotKey, snap] of Object.entries(
          entry.beforeSnapshot,
        )) {
          const tokenPath = getSnapshotTokenPath(snapshotKey, snap.collectionId);
          let list = byCollection.get(snap.collectionId);
          if (!list) {
            list = [];
            byCollection.set(snap.collectionId, list);
          }
          list.push({ path: tokenPath, token: snap.token });
        }

        // Restore tokens
        for (const [collectionId, items] of byCollection) {
          await ctx.tokenStore.restoreSnapshot(collectionId, items);
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
        resourceId: entry.resourceId,
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

/** Snapshot specific token paths in a collection. Returns path -> SnapshotEntry. */
export async function snapshotPaths(
  tokenStore: TokenStore,
  collectionId: string,
  paths: string[],
): Promise<Record<string, SnapshotEntry>> {
  const flatTokens = await tokenStore.getFlatTokensForCollection(collectionId);
  const result: Record<string, SnapshotEntry> = {};
  for (const p of paths) {
    result[p] = {
      token: flatTokens[p] ? structuredClone(flatTokens[p]) : null,
      collectionId,
    };
  }
  return result;
}

/** Snapshot all tokens in a collection. */
export async function snapshotCollection(
  tokenStore: TokenStore,
  collectionId: string,
): Promise<Record<string, SnapshotEntry>> {
  const flatTokens = await tokenStore.getFlatTokensForCollection(collectionId);
  const result: Record<string, SnapshotEntry> = {};
  for (const [p, token] of Object.entries(flatTokens)) {
    result[p] = { token: structuredClone(token), collectionId };
  }
  return result;
}

/** Snapshot all tokens across multiple collections with collection-qualified keys. */
export async function snapshotCollections(
  tokenStore: TokenStore,
  collectionIds: string[],
): Promise<Record<string, SnapshotEntry>> {
  const result: Record<string, SnapshotEntry> = {};
  for (const collectionId of collectionIds) {
    const flatTokens = await tokenStore.getFlatTokensForCollection(collectionId);
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      result[buildCollectionSnapshotKey(collectionId, tokenPath)] = {
        token: structuredClone(token),
        collectionId,
      };
    }
  }
  return result;
}

/** Snapshot all tokens under a group prefix in a collection. */
export async function snapshotGroup(
  tokenStore: TokenStore,
  collectionId: string,
  groupPrefix: string,
): Promise<Record<string, SnapshotEntry>> {
  const flatTokens = await tokenStore.getFlatTokensForCollection(collectionId);
  const result: Record<string, SnapshotEntry> = {};
  const prefix = groupPrefix + ".";
  for (const [p, token] of Object.entries(flatTokens)) {
    if (p === groupPrefix || p.startsWith(prefix)) {
      result[p] = { token: structuredClone(token), collectionId };
    }
  }
  return result;
}
