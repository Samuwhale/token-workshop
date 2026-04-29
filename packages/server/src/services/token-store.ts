import fs from "node:fs/promises";
import path from "node:path";
import { watch } from "chokidar";
import {
  SEARCH_SCOPE_CATEGORIES,
  collectTokenReferencePaths,
  resolveCollectionIdForPath,
  type Token,
  type TokenGroup,
  type TokenType,
  type ResolvedToken,
  isFormula,
  isReference,
  flattenTokenGroup,
  readGeneratorProvenance,
  readTokenScopes,
  stableStringify,
  TokenResolver,
} from "@tokenmanager/core";
import { NotFoundError, ConflictError, BadRequestError } from "../errors.js";
import type { TokenPathRename } from "./operation-log.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";
import { expectJsonObject, parseJsonFile } from "../utils/json-file.js";
import {
  validateTokenPath,
  pathExistsAt,
  getObjectAtPath,
  setGroupAtPath,
  getTokenAtPath,
  getTokenAtPathWithInheritedType,
  setTokenAtPath,
  deleteTokenAtPath,
  collectGroupLeafTokens,
  updateAliasRefs,
  updateBulkAliasRefs,
  previewBulkAliasChanges,
  previewGroupAliasChanges,
  normalizeScopedVariableToken,
  normalizeScopedVariableTokenGroup,
  type AliasChange,
} from "./token-tree-utils.js";
import { isValidCollectionName } from "./collection-helpers.js";

import { isSafeRegex } from "./token-tree-utils.js";

const TOKEN_FILE_SUFFIX = ".tokens.json";

interface StoredCollection {
  name: string;
  tokens: TokenGroup;
  filePath?: string;
}

interface PlannedTokenRename {
  oldPath: string;
  newPath: string;
  token: Token;
}

interface PlannedTokenTransfer {
  sourcePath: string;
  targetPath: string;
  token: Token;
}

interface PlannedGroupLeafToken {
  relativePath: string;
  token: Token;
}

interface PlannedGroupRename {
  collection: StoredCollection;
  oldGroupPath: string;
  newGroupPath: string;
  groupObject?: TokenGroup;
  leafTokens: PlannedGroupLeafToken[];
  pathRenames: TokenPathRename[];
}

interface PlannedGroupTransfer {
  source: StoredCollection;
  target: StoredCollection;
  groupPath: string;
  groupObject?: TokenGroup;
  leafTokens: PlannedGroupLeafToken[];
}

function normalizeSearchTerms(values?: string[]): string[] | undefined {
  if (!values) {
    return undefined;
  }
  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

export class TokenStore {
  /** Shared async mutex — route handlers and watcher callbacks serialize through this single lock. */
  readonly lock = new PromiseChainLock();
  private dir: string;
  private collections: Map<string, StoredCollection> = new Map();
  private flatTokens: Map<string, Array<{ token: Token; collectionId: string }>> =
    new Map();
  private resolver: TokenResolver | null = null;
  private collectionResolvers: Map<string, TokenResolver> = new Map();
  /** Cross-collection dependents: refTarget -> list of {path, collectionId} that reference it. */
  private crossCollectionDependents: Map<
    string,
    Array<{ path: string; collectionId: string }>
  > = new Map();
  private watcher: ReturnType<typeof watch> | null = null;
  private changeListeners: Set<(event: ChangeEvent) => void> = new Set();
  private _rebuildDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingWatcherEvents: ChangeEvent[] = [];
  private _batchDepth = 0;
  private _writingFiles: Map<string, ReturnType<typeof setTimeout>> = new Map();
  /** Per-collection promise chains that serialize concurrent saveCollection calls for the same file. */
  private _saveChains = new Map<string, Promise<void>>();

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  async initialize(collectionIds: Iterable<string>): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await this.syncRegisteredCollections(collectionIds);
    this.startWatching();
  }

  private collectionFilePath(collectionId: string): string {
    return path.join(this.dir, `${collectionId}${TOKEN_FILE_SUFFIX}`);
  }

  private collectionIdFromTokenFilePath(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, "/");
    return normalized.endsWith(TOKEN_FILE_SUFFIX)
      ? normalized.slice(0, -TOKEN_FILE_SUFFIX.length)
      : normalized;
  }

  private async readCollectionTokens(
    collectionId: string,
  ): Promise<{
    tokens: TokenGroup;
    missing: boolean;
    filePath: string;
    normalizationChanged: boolean;
  }> {
    const filePath = this.collectionFilePath(collectionId);
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          tokens: {},
          missing: true,
          filePath,
          normalizationChanged: false,
        };
      }
      throw err;
    }
    let tokens: TokenGroup;
    try {
      tokens = expectJsonObject(
        parseJsonFile(content, { filePath, relativeTo: this.dir }),
        {
          filePath,
          relativeTo: this.dir,
          expectation: "contain a top-level token-group object",
        },
      ) as TokenGroup;
    } catch (err) {
      if (err instanceof ConflictError) {
        throw err;
      }
      throw new ConflictError(
        `Collection "${collectionId}" could not be loaded from "${path.relative(this.dir, filePath)}".`,
      );
    }
    const normalizationChanged = normalizeScopedVariableTokenGroup(tokens);
    return { tokens, missing: false, filePath, normalizationChanged };
  }

  private async loadRegisteredCollection(
    collectionId: string,
  ): Promise<"loaded" | "missing"> {
    const { tokens, missing, filePath, normalizationChanged } =
      await this.readCollectionTokens(collectionId);
    this.collections.set(collectionId, {
      name: collectionId,
      tokens,
      ...(missing ? {} : { filePath }),
    });
    if (!missing && normalizationChanged) {
      await this.saveCollection(collectionId);
    }
    return missing ? "missing" : "loaded";
  }

  async syncRegisteredCollections(collectionIds: Iterable<string>): Promise<void> {
    const nextIds = [...new Set(Array.from(collectionIds).filter(Boolean))];
    const nextCollections = new Map<string, StoredCollection>();
    const missingIds: string[] = [];
    const normalizedIds: string[] = [];

    for (const collectionId of nextIds) {
      const { tokens, missing, filePath, normalizationChanged } =
        await this.readCollectionTokens(collectionId);
      nextCollections.set(collectionId, {
        name: collectionId,
        tokens,
        ...(missing ? {} : { filePath }),
      });
      if (missing) {
        missingIds.push(collectionId);
      }
      if (!missing && normalizationChanged) {
        normalizedIds.push(collectionId);
      }
    }

    this.collections = nextCollections;
    for (const collectionId of normalizedIds) {
      await this.saveCollection(collectionId);
    }
    this.rebuildFlatTokens();

    for (const collectionId of missingIds) {
      this.emitEvent({
        type: "file-load-error",
        collectionId,
        message: `Collection "${collectionId}" is registered but its token file is missing on disk.`,
      });
    }
  }

  private scheduleRebuild(event: ChangeEvent): void {
    this._pendingWatcherEvents.push(event);
    if (this._rebuildDebounceTimer !== null) {
      clearTimeout(this._rebuildDebounceTimer);
    }
    this._rebuildDebounceTimer = setTimeout(() => {
      this._rebuildDebounceTimer = null;
      this.rebuildFlatTokens();
      const events = this._pendingWatcherEvents.splice(0);
      for (const ev of events) this.emit(ev);
    }, 50);
  }

  /** Mark a file as being written so the watcher ignores the next event for it. */
  private _startWriteGuard(filePath: string): void {
    const existing = this._writingFiles.get(filePath);
    if (existing) clearTimeout(existing);
    // Fallback timeout only for memory-leak prevention — the watcher callback clears the guard first
    const timer = setTimeout(() => this._writingFiles.delete(filePath), 30_000);
    this._writingFiles.set(filePath, timer);
  }

  /** Clear the write guard (called from watcher callbacks after suppressing one event). */
  private _clearWriteGuard(filePath: string): void {
    const timer = this._writingFiles.get(filePath);
    if (timer) clearTimeout(timer);
    this._writingFiles.delete(filePath);
  }

  /**
   * Public write guard — suppress the next watcher event for an absolute file path.
   * Use before external processes (e.g. git checkout) write to a token file so the
   * watcher does not trigger a redundant reload.
   */
  startWriteGuard(absoluteFilePath: string): void {
    this._startWriteGuard(absoluteFilePath);
  }

  /**
   * Cancel a write guard that was started with startWriteGuard() but whose
   * file was never written (e.g. git checkout failed). Prevents the guard
   * from silencing watcher events for the full 30-second fallback window.
   */
  endWriteGuard(absoluteFilePath: string): void {
    this._clearWriteGuard(absoluteFilePath);
  }

  /**
   * Explicitly reload a token file by its relative path (relative to this.dir).
   * Acquires the internal lock so it serializes correctly with watcher callbacks.
   * Emits a `collection-updated` event after loading.
   */
  async reloadFile(relativePath: string): Promise<void> {
    const collectionId = this.collectionIdFromTokenFilePath(relativePath);
    if (!this.collections.has(collectionId)) {
      return;
    }
    await this.lock.withLock(async () => {
      let loaded = true;
      await this.loadRegisteredCollection(collectionId).catch((err) => {
        loaded = false;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[TokenStore] Error reloading "${relativePath}":`, err);
        this.emitEvent({ type: "file-load-error", collectionId, message });
      });
      if (loaded) this.scheduleRebuild({ type: "collection-updated", collectionId });
    });
  }

  private startWatching(): void {
    this.watcher = watch(path.join(this.dir, "**/*.tokens.json"), {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });

    this.watcher.on("change", (filePath) => {
      if (this._writingFiles.has(filePath as string)) {
        this._clearWriteGuard(filePath as string);
        return;
      }
      const relativePath = path.relative(this.dir, filePath as string);
      const collectionId = this.collectionIdFromTokenFilePath(relativePath);
      if (!this.collections.has(collectionId)) {
        return;
      }
      void this.lock.withLock(async () => {
        let loaded = true;
        await this.loadRegisteredCollection(collectionId).catch((err) => {
          loaded = false;
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[TokenStore] Error reloading "${relativePath}":`, err);
          this.emitEvent({ type: "file-load-error", collectionId, message });
        });
        if (loaded) this.scheduleRebuild({ type: "collection-updated", collectionId });
      });
    });

    this.watcher.on("add", (filePath) => {
      if (this._writingFiles.has(filePath as string)) {
        this._clearWriteGuard(filePath as string);
        return;
      }
      const relativePath = path.relative(this.dir, filePath as string);
      const collectionId = this.collectionIdFromTokenFilePath(relativePath);
      if (!this.collections.has(collectionId)) {
        return;
      }
      void this.lock.withLock(async () => {
        let loaded = true;
        await this.loadRegisteredCollection(collectionId).catch((err) => {
          loaded = false;
          const message = err instanceof Error ? err.message : String(err);
          console.warn(
            `[TokenStore] Error loading collection file "${relativePath}":`,
            err,
          );
          this.emitEvent({ type: "file-load-error", collectionId, message });
        });
        if (loaded) this.scheduleRebuild({ type: "collection-updated", collectionId });
      });
    });

    this.watcher.on("unlink", (filePath) => {
      if (this._writingFiles.has(filePath as string)) {
        this._clearWriteGuard(filePath as string);
        return;
      }
      const relativePath = path.relative(this.dir, filePath as string);
      const collectionId = this.collectionIdFromTokenFilePath(relativePath);
      if (!this.collections.has(collectionId)) {
        return;
      }
      void this.lock.withLock(async () => {
        this.emitEvent({
          type: "file-load-error",
          collectionId,
          message: `Collection "${collectionId}" lost its token file on disk.`,
        });
      });
    });

    this.watcher.on("error", (err) => {
      console.error("[TokenStore] File watcher error:", err);
    });
  }

  private rebuildFlatTokens(): void {
    if (this._batchDepth > 0) return; // deferred — endBatch() always rebuilds
    this.flatTokens = this.buildLiveFlatTokens(); // atomic swap — no reader sees a partial/empty map
    this.rebuildResolvers();
    this.rebuildCrossCollectionDependents();
  }

  /**
   * Build a fresh flat token map by iterating this.collections directly.
   * Unlike rebuildFlatTokens(), this is not guarded by _batchDepth, so it
   * reflects the current (post-mutation) state of this.collections even inside a batch.
   */
  private buildLiveFlatTokens(): Map<
    string,
    Array<{ token: Token; collectionId: string }>
  > {
    const newMap = new Map<string, Array<{ token: Token; collectionId: string }>>();
    for (const [collectionId, collection] of this.collections) {
      for (const [tokenPath, token] of flattenTokenGroup(collection.tokens)) {
        let entries = newMap.get(tokenPath);
        if (!entries) {
          entries = [];
          newMap.set(tokenPath, entries);
        }
        entries.push({ token: token as Token, collectionId });
      }
    }
    return newMap;
  }

  /** Begin a batch operation — defers flat-token rebuilds until endBatch(). */
  beginBatch(): void {
    this._batchDepth++;
  }

  /** End a batch operation — always rebuilds flat tokens when the outermost batch ends. */
  endBatch(): void {
    if (this._batchDepth > 0) this._batchDepth--;
    if (this._batchDepth === 0) {
      this.rebuildFlatTokens();
    }
  }

  /** Execute fn() inside a batch, always rebuilding flat tokens when the outermost batch ends. */
  private async withBatch<T>(fn: () => Promise<T>): Promise<T> {
    this.beginBatch();
    try {
      return await fn();
    } finally {
      this.endBatch();
    }
  }

  private rebuildResolvers(): void {
    const mergedTokens: Record<string, Token> = {};
    const collectionOverrides = new Map<string, Record<string, Token>>();

    for (const [tokenPath, entries] of this.flatTokens) {
      if (entries.length > 0) {
        mergedTokens[tokenPath] = entries[0].token;
      }
      for (const entry of entries) {
        let tokens = collectionOverrides.get(entry.collectionId);
        if (!tokens) {
          tokens = {};
          collectionOverrides.set(entry.collectionId, tokens);
        }
        tokens[tokenPath] = entry.token;
      }
    }

    this.resolver = new TokenResolver(mergedTokens, "__merged__");
    this.collectionResolvers = new Map(
      Array.from(collectionOverrides, ([collectionId, tokens]) => [
        collectionId,
        // Collection-pinned reads must stay inside that collection. Falling
        // back to merged tokens from other collections can silently resolve an
        // overlapping path from the wrong source and diverge from the UI.
        new TokenResolver(tokens, collectionId),
      ]),
    );
  }

  /** Build cross-collection dependents map by scanning ALL token entries across all collections. */
  private rebuildCrossCollectionDependents(): void {
    // Forward: for every (path, collectionId) pair, collect what it references
    // Reverse: refTarget -> all (path, collectionId) that reference it
    const dependents = new Map<
      string,
      Array<{ path: string; collectionId: string }>
    >();

    for (const [tokenPath, entries] of this.flatTokens) {
      for (const { token, collectionId } of entries) {
        const refs = this.collectAllRefsFromToken(token);
        for (const ref of refs) {
          let list = dependents.get(ref);
          if (!list) {
            list = [];
            dependents.set(ref, list);
          }
          list.push({ path: tokenPath, collectionId });
        }
      }
    }

    this.crossCollectionDependents = dependents;
  }

  // -----------------------------------------------------------------------
  // Circular reference detection
  // -----------------------------------------------------------------------

  private collectAllRefsFromToken(token: Token): Set<string> {
    return new Set(
      collectTokenReferencePaths(token, {
        includeExtends: true,
      }),
    );
  }

  private dependencyNodeId(collectionId: string, tokenPath: string): string {
    return `${collectionId}\u0000${tokenPath}`;
  }

  private formatDependencyNodeId(nodeId: string): string {
    const separatorIndex = nodeId.indexOf("\u0000");
    if (separatorIndex === -1) return nodeId;
    const collectionId = nodeId.slice(0, separatorIndex);
    const tokenPath = nodeId.slice(separatorIndex + 1);
    return `${collectionId}:${tokenPath}`;
  }

  private buildDependencyMap(
    overrides?: Map<string, { path: string; collectionId: string; token: Token }>,
    liveFlatTokens?: Map<string, Array<{ token: Token; collectionId: string }>>,
  ): Map<string, Set<string>> {
    const sourceTokens = liveFlatTokens ?? this.flatTokens;
    const pathToCollectionId: Record<string, string> = {};
    const collectionIdsByPath: Record<string, string[]> = {};
    const registerPath = (tokenPath: string, collectionId: string) => {
      pathToCollectionId[tokenPath] ??= collectionId;
      const collectionIds = collectionIdsByPath[tokenPath] ?? [];
      if (!collectionIds.includes(collectionId)) {
        collectionIds.push(collectionId);
        collectionIdsByPath[tokenPath] = collectionIds;
      }
    };

    for (const [tokenPath, entries] of sourceTokens) {
      for (const { collectionId } of entries) {
        registerPath(tokenPath, collectionId);
      }
    }
    for (const override of overrides?.values() ?? []) {
      registerPath(override.path, override.collectionId);
    }

    const deps = new Map<string, Set<string>>();
    for (const [tokenPath, entries] of sourceTokens) {
      for (const { token, collectionId } of entries) {
        const nodeId = this.dependencyNodeId(collectionId, tokenPath);
        const nextToken = overrides?.get(nodeId)?.token ?? token;
        deps.set(
          nodeId,
          this.collectDependencyTargets(nextToken, collectionId, {
            pathToCollectionId,
            collectionIdsByPath,
          }),
        );
      }
    }

    for (const override of overrides?.values() ?? []) {
      const nodeId = this.dependencyNodeId(override.collectionId, override.path);
      if (!deps.has(nodeId)) {
        deps.set(
          nodeId,
          this.collectDependencyTargets(override.token, override.collectionId, {
            pathToCollectionId,
            collectionIdsByPath,
          }),
        );
      }
    }

    return deps;
  }

  private collectDependencyTargets(
    token: Token,
    sourceCollectionId: string,
    index: {
      pathToCollectionId: Record<string, string>;
      collectionIdsByPath: Record<string, string[]>;
    },
  ): Set<string> {
    const targets = new Set<string>();
    for (const refPath of collectTokenReferencePaths(token, {
      collectionId: sourceCollectionId,
      includeExtends: true,
    })) {
      const resolution = resolveCollectionIdForPath({
        path: refPath,
        preferredCollectionId: sourceCollectionId,
        pathToCollectionId: index.pathToCollectionId,
        collectionIdsByPath: index.collectionIdsByPath,
      });
      if (resolution.collectionId) {
        targets.add(this.dependencyNodeId(resolution.collectionId, refPath));
      }
    }
    return targets;
  }

  private buildProspectiveToken(existing: Token, patch: Partial<Token>): Token {
    const next = structuredClone(existing);
    this.applyTokenPatch(next, patch);
    return next;
  }

  /**
   * Run a DFS cycle-detection pass on the given dependency map, starting from
   * the specified nodes. Throws ConflictError with a descriptive cycle path if
   * a cycle is reachable from any start node.
   */
  private runCycleDFS(
    deps: Map<string, Set<string>>,
    startNodes: Iterable<string>,
  ): void {
    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<string, number>();
    const parent = new Map<string, string>();

    const dfs = (node: string): void => {
      color.set(node, GRAY);
      const nodeDeps = deps.get(node);
      if (nodeDeps) {
        for (const dep of nodeDeps) {
          const depColor = color.get(dep) ?? WHITE;
          if (depColor === GRAY) {
            const cycle = [dep];
            let cur = node;
            while (cur !== dep) {
              cycle.push(cur);
              cur = parent.get(cur)!;
            }
            cycle.push(dep);
            cycle.reverse();
            throw new ConflictError(
              `Circular reference detected: ${cycle
                .map((id) => this.formatDependencyNodeId(id))
                .join(" → ")}`,
            );
          }
          if (depColor === WHITE) {
            parent.set(dep, node);
            dfs(dep);
          }
        }
      }
      color.set(node, BLACK);
    };

    for (const nodeId of startNodes) {
      if ((color.get(nodeId) ?? WHITE) === WHITE) {
        dfs(nodeId);
      }
    }
  }

  /**
   * Detect if circular references would be created by writing the given full
   * tokens into one collection.
   */
  checkCircularReferences(
    collectionId: string,
    changes: Array<{ path: string; token: Token }>,
  ): void {
    const overrides = new Map<
      string,
      { path: string; collectionId: string; token: Token }
    >();
    for (const change of changes) {
      overrides.set(this.dependencyNodeId(collectionId, change.path), {
        ...change,
        collectionId,
      });
    }
    const deps = this.buildDependencyMap(overrides);
    this.runCycleDFS(
      deps,
      changes.map((change) => this.dependencyNodeId(collectionId, change.path)),
    );
  }

  // ----- CRUD operations -----

  async reorderGroupChildren(
    collectionId: string,
    groupPath: string,
    orderedKeys: string[],
  ): Promise<void> {
    const collection = this.collections.get(collectionId);
    if (!collection) throw new NotFoundError(`Collection "${collectionId}" not found`);
    let group: TokenGroup;
    if (groupPath) {
      const found = getObjectAtPath(collection.tokens, groupPath);
      if (!found)
        throw new NotFoundError(
          `Group "${groupPath}" not found in collection "${collectionId}"`,
        );
      group = found;
    } else {
      group = collection.tokens as TokenGroup;
    }
    const nonMetaKeys = Object.keys(group).filter((k) => !k.startsWith("$"));
    const orderedSet = new Set(orderedKeys);
    for (const key of orderedKeys) {
      if (!(key in group))
        throw new NotFoundError(`Key "${key}" not found in group`);
    }
    for (const key of nonMetaKeys) {
      if (!orderedSet.has(key))
        throw new BadRequestError(`Key "${key}" is missing from orderedKeys`);
    }
    const reordered: TokenGroup = {};
    for (const [k, v] of Object.entries(group)) {
      if (k.startsWith("$")) reordered[k] = v;
    }
    for (const key of orderedKeys) {
      reordered[key] = group[key];
    }
    if (groupPath) {
      setGroupAtPath(collection.tokens, groupPath, reordered);
    } else {
      collection.tokens = reordered as TokenGroup;
    }
    await this.saveCollection(collectionId);
    this.rebuildFlatTokens();
    this.emit({ type: "token-updated", collectionId: collectionId });
  }

  getStoredCollectionTokenCounts(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [name, collection] of this.collections) {
      result[name] = flattenTokenGroup(collection.tokens).size;
    }
    return result;
  }

  async getCollection(
    collectionId: string,
  ): Promise<StoredCollection | undefined> {
    return this.collections.get(collectionId);
  }

  async replaceWorkspaceTokens(
    tokensByCollection: Record<string, TokenGroup>,
  ): Promise<void> {
    const desiredCollectionIds = [...new Set(Object.keys(tokensByCollection))];
    const desiredCollectionIdSet = new Set(desiredCollectionIds);
    const existingCollectionIds = Array.from(this.collections.keys());

    await this.withBatch(async () => {
      for (const collectionId of existingCollectionIds) {
        if (!desiredCollectionIdSet.has(collectionId)) {
          await this.deleteCollection(collectionId);
        }
      }

      for (const collectionId of desiredCollectionIds) {
        const tokens = structuredClone(tokensByCollection[collectionId] ?? {});
        const existing = this.collections.get(collectionId);
        if (existing) {
          await this.replaceCollectionTokens(collectionId, tokens);
          continue;
        }
        await this.createCollection(collectionId, tokens);
      }
    });
  }

  /** Replace all tokens in a collection with a new nested DTCG token group. */
  async replaceCollectionTokens(
    collectionId: string,
    tokens: TokenGroup,
  ): Promise<void> {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      throw new NotFoundError(`Collection "${collectionId}" not found`);
    }
    // Check for circular references in the new token collection
    const changes: Array<{ path: string; token: Token }> = [];
    for (const [tokenPath, token] of flattenTokenGroup(tokens)) {
      changes.push({ path: tokenPath, token: token as Token });
    }
    if (changes.length > 0) {
      this.checkCircularReferences(collectionId, changes);
    }
    collection.tokens = tokens;
    await this.saveCollection(collectionId);
    this.rebuildFlatTokens();
    this.emit({ type: "token-updated", collectionId });
  }

  /** Write collection to disk and register in memory, but skip rebuildFlatTokens(). */
  private async _createCollectionNoRebuild(
    name: string,
    tokens: TokenGroup = {},
  ): Promise<StoredCollection> {
    const filePath = this.collectionFilePath(name);
    const tmpPath = filePath + ".tmp";
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(tmpPath, JSON.stringify(tokens, null, 2));
    this._startWriteGuard(filePath);
    await fs.rename(tmpPath, filePath);
    const collection: StoredCollection = { name, tokens, filePath };
    this.collections.set(name, collection);
    return collection;
  }

  async createCollection(
    collectionId: string,
    tokens?: TokenGroup,
  ): Promise<StoredCollection> {
    const collection = await this._createCollectionNoRebuild(collectionId, tokens);
    this.rebuildFlatTokens();
    return collection;
  }

  async deleteCollection(collectionId: string): Promise<boolean> {
    const collection = this.collections.get(collectionId);
    if (!collection) return false;
    const filePath = this.collectionFilePath(collectionId);
    this._startWriteGuard(filePath);
    try {
      await fs.unlink(filePath).catch((err) => {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err;
        }
      });
      await this.removeEmptyParentDirs(filePath);
    } finally {
      this._clearWriteGuard(filePath);
    }
    this.collections.delete(collectionId);
    this.rebuildFlatTokens();
    return true;
  }

  /** Remove empty parent directories between filePath and this.dir */
  private async removeEmptyParentDirs(filePath: string): Promise<void> {
    let dir = path.dirname(filePath);
    while (dir !== this.dir && dir.startsWith(this.dir)) {
      try {
        await fs.rmdir(dir); // only succeeds if empty
      } catch {
        break; // directory not empty or other error — stop
      }
      dir = path.dirname(dir);
    }
  }

  async renameCollection(
    oldCollectionId: string,
    newCollectionId: string,
  ): Promise<void> {
    if (!isValidCollectionName(newCollectionId)) {
      throw new BadRequestError(
        "Collection name must contain only alphanumeric characters, dashes, underscores, and / for folders",
      );
    }
    const collection = this.collections.get(oldCollectionId);
    if (!collection) {
      throw new NotFoundError(`Collection "${oldCollectionId}" not found`);
    }
    if (this.collections.has(newCollectionId)) {
      throw new ConflictError(`Collection "${newCollectionId}" already exists`);
    }

    const oldFilePath = this.collectionFilePath(oldCollectionId);
    const newFilePath = this.collectionFilePath(newCollectionId);
    await fs.mkdir(path.dirname(newFilePath), { recursive: true });
    this._startWriteGuard(oldFilePath);
    this._startWriteGuard(newFilePath);
    try {
      try {
        await fs.rename(oldFilePath, newFilePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err;
        }
        const tmpPath = `${newFilePath}.tmp`;
        await fs.writeFile(tmpPath, JSON.stringify(collection.tokens, null, 2));
        await fs.rename(tmpPath, newFilePath);
      }
      const renamed: StoredCollection = {
        name: newCollectionId,
        tokens: collection.tokens,
        filePath: newFilePath,
      };
      this.collections.set(newCollectionId, renamed);
      this.collections.delete(oldCollectionId);

      // Clean up empty parent dirs left behind by the rename
      await this.removeEmptyParentDirs(oldFilePath);

      this.rebuildFlatTokens();
      this.emit({ type: "collection-removed", collectionId: oldCollectionId });
      this.emit({ type: "collection-added", collectionId: newCollectionId });
    } finally {
      this._clearWriteGuard(oldFilePath);
      this._clearWriteGuard(newFilePath);
    }
  }

  async getToken(
    collectionId: string,
    tokenPath: string,
  ): Promise<Token | undefined> {
    const collection = this.collections.get(collectionId);
    if (!collection) return undefined;
    return getTokenAtPathWithInheritedType(collection.tokens, tokenPath);
  }

  async createToken(
    collectionId: string,
    tokenPath: string,
    token: Token,
  ): Promise<void> {
    if (!isValidCollectionName(collectionId)) {
      throw new BadRequestError(
        `Invalid collection name "${collectionId}". Only alphanumeric characters, dashes, underscores, and / for folders are allowed.`,
      );
    }
    validateTokenPath(tokenPath);
    token = this.normalizeStoredToken(token);
    const collection = this.collections.get(collectionId);
    if (!collection) {
      throw new NotFoundError(`Collection "${collectionId}" not found`);
    }
    // Check for circular references before persisting
    this.checkCircularReferences(collectionId, [{ path: tokenPath, token }]);
    const snapshot = this.snapshotCollectionTokens(collectionId);
    setTokenAtPath(collection.tokens, tokenPath, structuredClone(token));
    try {
      await this.saveCollection(collectionId);
    } catch (err) {
      this.restoreSnapshots(snapshot);
      throw err;
    }
    this.rebuildFlatTokens();
    this.emit({ type: "token-updated", collectionId: collectionId, tokenPath });
  }

  async updateToken(
    collectionId: string,
    tokenPath: string,
    token: Partial<Token>,
  ): Promise<void> {
    const collection = this.collections.get(collectionId);
    if (!collection) throw new NotFoundError(`Collection "${collectionId}" not found`);
    const existing = getTokenAtPath(collection.tokens, tokenPath);
    const existingWithInheritedType = getTokenAtPathWithInheritedType(
      collection.tokens,
      tokenPath,
    );
    if (!existing)
      throw new NotFoundError(
        `Token "${tokenPath}" not found in collection "${collectionId}"`,
      );
    token = this.normalizeStoredTokenPatch(
      existingWithInheritedType ?? existing,
      token,
    );
    // Check for circular references before persisting
    this.checkCircularReferences(collectionId, [
      {
        path: tokenPath,
        token: this.buildProspectiveToken(existingWithInheritedType ?? existing, token),
      },
    ]);
    // Replace known token fields explicitly so stale properties don't persist.
    // A partial update only touches keys that are present in the incoming object.
    const snapshot = this.snapshotCollectionTokens(collectionId);
    this.applyTokenPatch(existing, token);
    try {
      await this.saveCollection(collectionId);
    } catch (err) {
      this.restoreSnapshots(snapshot);
      this.rebuildFlatTokens(); // in-place mutations above corrupted flatTokens entries; rebuild from restored snapshot
      throw err;
    }
    this.rebuildFlatTokens();
    this.emit({ type: "token-updated", collectionId: collectionId, tokenPath });
  }

  async batchUpsertTokens(
    collectionId: string,
    tokens: Array<{ path: string; token: Token }>,
    strategy: "skip" | "overwrite" | "merge",
  ): Promise<{ imported: number; skipped: number }> {
    if (!isValidCollectionName(collectionId)) {
      throw new BadRequestError(
        `Invalid collection name "${collectionId}". Only alphanumeric characters, dashes, underscores, and / for folders are allowed.`,
      );
    }
    const collection = this.collections.get(collectionId);
    if (!collection) {
      throw new NotFoundError(`Collection "${collectionId}" not found`);
    }
    for (const { path: tokenPath } of tokens) {
      validateTokenPath(tokenPath);
    }
    // Check for circular references among all proposed changes
    const changes: Array<{ path: string; token: Token }> = [];
    for (const { path: tokenPath, token } of tokens) {
      const existing = getTokenAtPath(collection.tokens, tokenPath);
      if (existing && strategy === "skip") continue; // won't be changed
      changes.push({ path: tokenPath, token: this.normalizeStoredToken(token) });
    }
    if (changes.length > 0) {
      this.checkCircularReferences(collectionId, changes);
    }
    const snapshot = this.snapshotCollectionTokens(collectionId);
    let imported = 0;
    let skipped = 0;
    await this.withBatch(async () => {
      try {
        for (const { path: tokenPath, token } of tokens) {
          const normalizedToken = this.normalizeStoredToken(token);
          const existing = getTokenAtPath(collection.tokens, tokenPath);
          if (existing) {
            if (strategy === "overwrite") {
              setTokenAtPath(
                collection.tokens,
                tokenPath,
                structuredClone(normalizedToken),
              );
              imported++;
            } else if (strategy === "merge") {
              // Update value/type from incoming, preserve local description and extensions
              const existingWithInheritedType =
                getTokenAtPathWithInheritedType(collection.tokens, tokenPath) ??
                existing;
              const mergedPatch = this.normalizeStoredTokenPatch(
                existingWithInheritedType,
                {
                  ...("$value" in normalizedToken
                    ? { $value: normalizedToken.$value }
                    : {}),
                  ...("$type" in normalizedToken
                    ? { $type: normalizedToken.$type }
                    : {}),
                },
              );
              this.applyTokenPatch(existing, mergedPatch);
              imported++;
            } else {
              skipped++;
            }
          } else {
            setTokenAtPath(
              collection.tokens,
              tokenPath,
              structuredClone(normalizedToken),
            );
            imported++;
          }
        }
        await this.saveCollection(collectionId);
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
    this.emit({ type: "token-updated", collectionId: collectionId, tokenPath: "" });
    return { imported, skipped };
  }

  async deleteToken(collectionId: string, tokenPath: string): Promise<boolean> {
    const collection = this.collections.get(collectionId);
    if (!collection) return false;
    const snapshot = this.snapshotCollectionTokens(collectionId);
    const deleted = deleteTokenAtPath(collection.tokens, tokenPath);
    if (deleted) {
      try {
        await this.saveCollection(collectionId);
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
      this.rebuildFlatTokens();
      this.emit({ type: "token-updated", collectionId: collectionId, tokenPath });
    }
    return deleted;
  }

  /** Delete multiple token paths in a single save. Returns the list of paths actually deleted. */
  async deleteTokens(collectionId: string, tokenPaths: string[]): Promise<string[]> {
    const collection = this.collections.get(collectionId);
    if (!collection) return [];
    const snapshot = this.snapshotCollectionTokens(collectionId);
    const deleted: string[] = [];
    await this.withBatch(async () => {
      try {
        for (const tokenPath of tokenPaths) {
          if (deleteTokenAtPath(collection.tokens, tokenPath)) {
            deleted.push(tokenPath);
          }
        }
        if (deleted.length > 0) {
          await this.saveCollection(collectionId);
        }
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
    if (deleted.length > 0) {
      this.emit({ type: "token-updated", collectionId: collectionId, tokenPath: "" });
    }
    return deleted;
  }

  /**
   * Restore a collection slice of token paths to a previous state.
   * Used by the operation log rollback feature.
   * Items with `token: null` are deleted; items with a token value are created/updated.
   */
  async restoreSnapshot(
    collectionId: string,
    items: Array<{ path: string; token: Token | null }>,
  ): Promise<void> {
    const collection = this.collections.get(collectionId);
    if (!collection) throw new NotFoundError(`Collection "${collectionId}" not found`);
    const snapshot = this.snapshotCollectionTokens(collectionId);
    await this.withBatch(async () => {
      try {
        for (const { path: tokenPath, token } of items) {
          if (token === null) {
            deleteTokenAtPath(collection.tokens, tokenPath);
          } else {
            setTokenAtPath(
              collection.tokens,
              tokenPath,
              structuredClone(this.normalizeStoredToken(token)),
            );
          }
        }
        await this.saveCollection(collectionId);
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
    this.emit({ type: "token-updated", collectionId: collectionId });
  }

  async resolveTokens(): Promise<ResolvedToken[]> {
    if (!this.resolver) {
      return [];
    }
    const resolvedMap = this.resolver.resolveAll();
    const results: ResolvedToken[] = [];
    for (const [tokenPath, resolved] of resolvedMap) {
      const entries = this.flatTokens.get(tokenPath);
      // Emit one result per collection that defines this token
      if (entries && entries.length > 1) {
        for (const entry of entries) {
          results.push({ ...resolved, collectionId: entry.collectionId });
        }
      } else {
        results.push({
          ...resolved,
          collectionId: entries?.[0]?.collectionId ?? resolved.collectionId,
        });
      }
    }
    return results;
  }

  async resolveToken(tokenPath: string): Promise<ResolvedToken | undefined> {
    const entries = this.flatTokens.get(tokenPath);
    if (!entries || entries.length === 0 || !this.resolver) return undefined;
    try {
      const resolved = this.resolver.resolve(tokenPath);
      return {
        ...resolved,
        collectionId: entries[0].collectionId,
      };
    } catch {
      return undefined;
    }
  }

  async resolveTokenInCollection(
    tokenPath: string,
    preferredCollectionId?: string,
  ): Promise<ResolvedToken | undefined> {
    if (!preferredCollectionId) {
      return this.resolveToken(tokenPath);
    }

    const collectionResolver = this.collectionResolvers.get(preferredCollectionId);
    if (!collectionResolver) {
      return undefined;
    }

    const collectionEntry =
      this.flatTokens
        .get(tokenPath)
        ?.find((entry) => entry.collectionId === preferredCollectionId) ?? null;
    if (!collectionEntry) {
      return undefined;
    }

    try {
      const resolved = collectionResolver.resolve(tokenPath);
      return {
        ...resolved,
        collectionId: preferredCollectionId,
      };
    } catch {
      return undefined;
    }
  }

  /** Get all tokens in a collection as a flat map of path -> Token. */
  async getFlatTokensForCollection(
    collectionId: string,
  ): Promise<Record<string, Token>> {
    const result: Record<string, Token> = {};
    for (const [tokenPath, entries] of this.flatTokens) {
      for (const entry of entries) {
        if (entry.collectionId === collectionId) {
          result[tokenPath] = entry.token;
          break;
        }
      }
    }
    return result;
  }

  /** Returns true if a token with the given dotted path exists in any collection. */
  tokenPathExists(tokenPath: string): boolean {
    return this.flatTokens.has(tokenPath);
  }

  /** Get all collection definitions for an exact token path. Returns one entry per collection that defines the path, in collection order. */
  getTokenDefinitions(
    tokenPath: string,
  ): Array<{ collectionId: string; token: Token }> {
    return (this.flatTokens.get(tokenPath) ?? []).map((e) => ({
      collectionId: e.collectionId,
      token: e.token,
    }));
  }

  getTokenDefinitionsInCollection(
    tokenPath: string,
    preferredCollectionId?: string,
  ): Array<{ collectionId: string; token: Token }> {
    const definitions = this.getTokenDefinitions(tokenPath);
    if (!preferredCollectionId) {
      return definitions;
    }
    return definitions.filter(
      (definition) => definition.collectionId === preferredCollectionId,
    );
  }

  /** Get all flat tokens across all collections (includes all collection versions per path). */
  getAllFlatTokens(): Array<{ path: string; token: Token; collectionId: string }> {
    const result: Array<{ path: string; token: Token; collectionId: string }> = [];
    for (const [tokenPath, entries] of this.flatTokens) {
      for (const entry of entries) {
        result.push({
          path: tokenPath,
          token: entry.token,
          collectionId: entry.collectionId,
        });
      }
    }
    return result;
  }

  /** Search tokens across all collections using structured query parameters. */
  searchTokens(opts: {
    q?: string;
    types?: string[];
    has?: string[];
    values?: string[];
    descs?: string[];
    paths?: string[];
    names?: string[];
    scopes?: string[];
    limit?: number;
    offset?: number;
  }): {
    results: Array<{
      collectionId: string;
      path: string;
      name: string;
      $type: string;
      $value: unknown;
      $description?: string;
    }>;
    total: number;
  } {
    const {
      q,
      types,
      has,
      values,
      descs,
      paths,
      names,
      scopes,
      limit = 200,
      offset = 0,
    } = opts;
    const qLower = q?.trim().toLowerCase();
    const normalizedTypes = normalizeSearchTerms(types);
    const normalizedHas = normalizeSearchTerms(has);
    const normalizedValues = normalizeSearchTerms(values);
    const normalizedDescs = normalizeSearchTerms(descs);
    const normalizedPaths = normalizeSearchTerms(paths);
    const normalizedNames = normalizeSearchTerms(names);
    const normalizedScopes = normalizeSearchTerms(scopes);
    const allowedScopeValues: Set<string> | null = normalizedScopes
      ? new Set(
          normalizedScopes.flatMap(
            (scope) =>
              SEARCH_SCOPE_CATEGORIES[
                scope as keyof typeof SEARCH_SCOPE_CATEGORIES
              ] ?? [],
          ),
        )
      : null;
    if (normalizedScopes && normalizedScopes.length > 0 && allowedScopeValues && allowedScopeValues.size === 0) {
      return { results: [], total: 0 };
    }
    const duplicateEntryKeys =
      normalizedHas &&
      normalizedHas.some((value) => value === "duplicate" || value === "dup")
        ? (() => {
            const valueToEntries = new Map<string, string[]>();
            for (const [tokenPath, entries] of this.flatTokens) {
              for (const entry of entries) {
                const duplicateKey = stableStringify(entry.token.$value);
                const entryKey = `${entry.collectionId}:${tokenPath}`;
                const existing = valueToEntries.get(duplicateKey);
                if (existing) {
                  existing.push(entryKey);
                } else {
                  valueToEntries.set(duplicateKey, [entryKey]);
                }
              }
            }

            const duplicates = new Set<string>();
            for (const entryKeys of valueToEntries.values()) {
              if (entryKeys.length < 2) continue;
              for (const entryKey of entryKeys) {
                duplicates.add(entryKey);
              }
            }
            return duplicates;
          })()
        : null;
    const all: Array<{
      collectionId: string;
      path: string;
      name: string;
      $type: string;
      $value: unknown;
      $description?: string;
    }> = [];

    for (const [tokenPath, entries] of this.flatTokens) {
      const lp = tokenPath.toLowerCase();
      const leafName = tokenPath.includes(".")
        ? tokenPath.slice(tokenPath.lastIndexOf(".") + 1)
        : tokenPath;
      const ln = leafName.toLowerCase();

      // path: qualifier
      if (
        normalizedPaths &&
        normalizedPaths.length > 0 &&
        !normalizedPaths.some((pathValue) => lp.startsWith(pathValue) || lp.includes(pathValue))
      )
        continue;

      // name: qualifier
      if (
        normalizedNames &&
        normalizedNames.length > 0 &&
        !normalizedNames.some((nameValue) => ln.includes(nameValue))
      )
        continue;

      for (const entry of entries) {
        // Free text: match against path, leaf name, or description
        if (qLower) {
          const ld = (entry.token.$description || "").toLowerCase();
          if (
            !lp.includes(qLower) &&
            !ln.includes(qLower) &&
            !ld.includes(qLower)
          )
            continue;
        }

        // type: qualifier
        if (normalizedTypes && normalizedTypes.length > 0) {
          const et = (entry.token.$type || "").toLowerCase();
          if (
            !normalizedTypes.some(
              (typeValue) => et === typeValue || et.includes(typeValue),
            )
          ) {
            continue;
          }
        }

        // has: qualifiers
        let skip = false;
        if (normalizedHas && normalizedHas.length > 0) {
          for (const h of normalizedHas) {
            if (
              (h === "alias" || h === "ref") &&
              !isReference(entry.token.$value)
            ) {
              skip = true;
              break;
            }
            if (h === "direct" && isReference(entry.token.$value)) {
              skip = true;
              break;
            }
            if (
              (h === "description" || h === "desc") &&
              !entry.token.$description
            ) {
              skip = true;
              break;
            }
            if (
              (h === "extension" || h === "ext") &&
              (!entry.token.$extensions ||
                Object.keys(entry.token.$extensions).length === 0)
            ) {
              skip = true;
              break;
            }
            if (
              (h === "duplicate" || h === "dup") &&
              !duplicateEntryKeys?.has(`${entry.collectionId}:${tokenPath}`)
            ) {
              skip = true;
              break;
            }
            if ((h === "managed" || h === "generator") && !readGeneratorProvenance(entry.token)) {
              skip = true;
              break;
            }
          }
        }
        if (skip) continue;

        // value: qualifier
        if (normalizedValues && normalizedValues.length > 0) {
          const sv = stableStringify(entry.token.$value).toLowerCase();
          if (!normalizedValues.some((valueTerm) => sv.includes(valueTerm))) {
            continue;
          }
        }

        // desc: qualifier — match $description
        if (normalizedDescs && normalizedDescs.length > 0) {
          const ld = (entry.token.$description || "").toLowerCase();
          if (
            !normalizedDescs.some((descriptionTerm) =>
              ld.includes(descriptionTerm),
            )
          ) {
            continue;
          }
        }

        if (normalizedScopes && normalizedScopes.length > 0) {
          const tokenScopes = readTokenScopes(entry.token);
          if (
            tokenScopes.length === 0 ||
            !tokenScopes.some((tokenScope) => allowedScopeValues?.has(tokenScope))
          ) {
            continue;
          }
        }

        all.push({
          collectionId: entry.collectionId,
          path: tokenPath,
          name: leafName,
          $type: entry.token.$type || "unknown",
          $value: entry.token.$value,
          $description: entry.token.$description,
        });
      }
    }

    all.sort(
      (left, right) =>
        left.collectionId.localeCompare(right.collectionId) ||
        left.path.localeCompare(right.path),
    );

    return { results: all.slice(offset, offset + limit), total: all.length };
  }

  /** Get all tokens that reference the given token path, with their collection ids. */
  getDependents(tokenPath: string): Array<{ path: string; collectionId: string }> {
    return (this.crossCollectionDependents.get(tokenPath) ?? []).map((dependent) => ({
      path: dependent.path,
      collectionId: dependent.collectionId,
    }));
  }

  /** Get all tokens that reference any token under the given group prefix (cross-collection). */
  getGroupDependents(
    groupPrefix: string,
  ): Array<{ path: string; collectionId: string; referencedToken: string }> {
    const prefix = groupPrefix + ".";
    const seen = new Set<string>();
    const result: Array<{
      path: string;
      collectionId: string;
      referencedToken: string;
    }> = [];
    for (const [refPath, deps] of this.crossCollectionDependents) {
      if (refPath === groupPrefix || refPath.startsWith(prefix)) {
        for (const dep of deps) {
          // Exclude tokens that are themselves under the group (internal refs)
          if (dep.path === groupPrefix || dep.path.startsWith(prefix)) continue;
          const key = `${dep.collectionId}:${dep.path}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({
              path: dep.path,
              collectionId: dep.collectionId,
              referencedToken: refPath,
            });
          }
        }
      }
    }
    return result;
  }

  /** Get all token groups (the raw data) keyed by collection id */
  getAllTokenData(): Record<string, TokenGroup> {
    const result: Record<string, TokenGroup> = {};
    for (const [name, collection] of this.collections) {
      result[name] = collection.tokens;
    }
    return result;
  }

  private getCollectionOrThrow(name: string): StoredCollection {
    const collection = this.collections.get(name);
    if (!collection) {
      throw new NotFoundError(`Collection "${name}" not found`);
    }
    return collection;
  }

  private getRenameSnapshotCollectionIds(
    primaryCollectionId: string,
    updateAliases: boolean,
  ): string[] {
    if (!updateAliases) {
      return [primaryCollectionId];
    }
    return [primaryCollectionId, ...[...this.collections.keys()].filter((name) => name !== primaryCollectionId)];
  }

  private async runStructuralMutation<T>(
    snapshotCollectionIds: string[],
    fn: () => Promise<T>,
  ): Promise<T> {
    const snapshot = this.snapshotCollectionTokens(...snapshotCollectionIds);
    return this.withBatch(async () => {
      try {
        return await fn();
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
  }

  private async saveCollections(collectionIds: Iterable<string>): Promise<void> {
    for (const collectionId of collectionIds) {
      await this.saveCollection(collectionId);
    }
  }

  private async applyTokenAliasUpdates(
    pathMap: Map<string, string>,
  ): Promise<number> {
    let aliasesUpdated = 0;
    const collectionsToSave = new Set<string>();
    for (const [collectionId, collection] of this.collections) {
      const changed = updateBulkAliasRefs(collection.tokens, pathMap);
      if (changed > 0) {
        aliasesUpdated += changed;
        collectionsToSave.add(collectionId);
      }
    }
    await this.saveCollections(collectionsToSave);
    return aliasesUpdated;
  }

  private async applyGroupAliasUpdates(
    oldGroupPath: string,
    newGroupPath: string,
  ): Promise<number> {
    let aliasesUpdated = 0;
    const collectionsToSave = new Set<string>();
    for (const [collectionId, collection] of this.collections) {
      const changed = updateAliasRefs(collection.tokens, oldGroupPath, newGroupPath);
      if (changed > 0) {
        aliasesUpdated += changed;
        collectionsToSave.add(collectionId);
      }
    }
    await this.saveCollections(collectionsToSave);
    return aliasesUpdated;
  }

  private planTokenRenames(
    collectionId: string,
    renames: TokenPathRename[],
  ): { collection: StoredCollection; plannedRenames: PlannedTokenRename[]; pathMap: Map<string, string> } {
    const collection = this.getCollectionOrThrow(collectionId);
    const plannedRenames: PlannedTokenRename[] = [];
    const pathMap = new Map<string, string>();
    const targetPaths = new Set<string>();

    for (const { oldPath, newPath } of renames) {
      validateTokenPath(newPath);

      const token = getTokenAtPath(collection.tokens, oldPath);
      if (!token) {
        throw new NotFoundError(
          `Token "${oldPath}" not found in collection "${collectionId}"`,
        );
      }
      if (getTokenAtPath(collection.tokens, newPath)) {
        throw new ConflictError(`Token "${newPath}" already exists`);
      }
      if (targetPaths.has(newPath)) {
        throw new ConflictError(`Duplicate target path "${newPath}" in batch`);
      }

      targetPaths.add(newPath);
      pathMap.set(oldPath, newPath);
      plannedRenames.push({ oldPath, newPath, token });
    }

    return { collection, plannedRenames, pathMap };
  }

  private planTokenTransfers(
    fromCollection: string,
    transfers: Array<{ sourcePath: string; targetPath?: string }>,
    toCollection: string,
    options: { overwriteExisting: boolean },
  ): {
    source: StoredCollection;
    target: StoredCollection;
    plannedTransfers: PlannedTokenTransfer[];
  } {
    if (fromCollection === toCollection) {
      throw new BadRequestError("Source and target collections are the same");
    }

    const source = this.getCollectionOrThrow(fromCollection);
    const target = this.getCollectionOrThrow(toCollection);
    const plannedTransfers: PlannedTokenTransfer[] = [];
    const targetPaths = new Set<string>();

    for (const { sourcePath, targetPath: requestedTargetPath } of transfers) {
      const targetPath = requestedTargetPath ?? sourcePath;
      validateTokenPath(targetPath);

      const token = getTokenAtPath(source.tokens, sourcePath);
      if (!token) {
        throw new NotFoundError(
          `Token "${sourcePath}" not found in collection "${fromCollection}"`,
        );
      }
      if (
        !options.overwriteExisting &&
        pathExistsAt(target.tokens, targetPath)
      ) {
        throw new ConflictError(
          `Path "${targetPath}" already exists in target collection "${toCollection}"`,
        );
      }
      if (targetPaths.has(targetPath)) {
        throw new ConflictError(`Duplicate target path "${targetPath}" in transfer batch`);
      }
      targetPaths.add(targetPath);
      plannedTransfers.push({ sourcePath, targetPath, token });
    }

    return { source, target, plannedTransfers };
  }

  private planGroupRename(
    collectionId: string,
    oldGroupPath: string,
    newGroupPath: string,
  ): PlannedGroupRename {
    const collection = this.getCollectionOrThrow(collectionId);
    const leafTokens = collectGroupLeafTokens(collection.tokens, oldGroupPath);

    if (leafTokens.length === 0) {
      const groupObject = getObjectAtPath(collection.tokens, oldGroupPath);
      if (!groupObject) {
        throw new NotFoundError(`Group "${oldGroupPath}" not found`);
      }
      if (pathExistsAt(collection.tokens, newGroupPath)) {
        throw new ConflictError(`Path "${newGroupPath}" already exists`);
      }
      return {
        collection,
        oldGroupPath,
        newGroupPath,
        groupObject,
        leafTokens: [],
        pathRenames: [],
      };
    }

    const pathRenames = leafTokens.map(({ relativePath }) => ({
      oldPath: `${oldGroupPath}.${relativePath}`,
      newPath: `${newGroupPath}.${relativePath}`,
    }));

    for (const { newPath } of pathRenames) {
      if (getTokenAtPath(collection.tokens, newPath)) {
        throw new ConflictError(`Token at path "${newPath}" already exists`);
      }
    }

    return {
      collection,
      oldGroupPath,
      newGroupPath,
      leafTokens,
      pathRenames,
    };
  }

  private planGroupTransfer(
    fromCollection: string,
    groupPath: string,
    toCollection: string,
    options: { overwriteExisting: boolean; actionLabel: "move" | "copy" },
  ): PlannedGroupTransfer {
    if (fromCollection === toCollection) {
      throw new BadRequestError("Source and target collections are the same");
    }

    const source = this.getCollectionOrThrow(fromCollection);
    const target = this.getCollectionOrThrow(toCollection);
    const leafTokens = collectGroupLeafTokens(source.tokens, groupPath);

    if (leafTokens.length === 0) {
      const groupObject = getObjectAtPath(source.tokens, groupPath);
      if (!groupObject) {
        throw new NotFoundError(`Group "${groupPath}" not found`);
      }
      if (
        !options.overwriteExisting &&
        pathExistsAt(target.tokens, groupPath)
      ) {
        throw new ConflictError(
          `Path "${groupPath}" already exists in target collection "${toCollection}"`,
        );
      }
      return {
        source,
        target,
        groupPath,
        groupObject,
        leafTokens: [],
      };
    }

    const collisions: string[] = [];
    for (const { relativePath } of leafTokens) {
      const targetPath = `${groupPath}.${relativePath}`;
      if (!options.overwriteExisting && pathExistsAt(target.tokens, targetPath)) {
        collisions.push(targetPath);
      }
    }
    if (collisions.length > 0) {
      throw new ConflictError(
        `Cannot ${options.actionLabel} group: ${collisions.length} token path(s) already exist in target collection "${toCollection}": ${collisions.slice(0, 5).join(", ")}${collisions.length > 5 ? `, and ${collisions.length - 5} more` : ""}`,
      );
    }

    return {
      source,
      target,
      groupPath,
      leafTokens,
    };
  }

  // ----- Group operations -----

  async renameGroup(
    collectionId: string,
    oldGroupPath: string,
    newGroupPath: string,
    updateAliases = true,
  ): Promise<{
    renamedCount: number;
    aliasesUpdated: number;
    pathRenames: TokenPathRename[];
  }> {
    const plan = this.planGroupRename(collectionId, oldGroupPath, newGroupPath);
    return this.runStructuralMutation(
      this.getRenameSnapshotCollectionIds(collectionId, updateAliases),
      async () => {
        if (plan.groupObject) {
          setGroupAtPath(plan.collection.tokens, newGroupPath, plan.groupObject);
          deleteTokenAtPath(plan.collection.tokens, oldGroupPath);
        } else {
          for (const { relativePath, token } of plan.leafTokens) {
            setTokenAtPath(
              plan.collection.tokens,
              `${newGroupPath}.${relativePath}`,
              token,
            );
          }
          deleteTokenAtPath(plan.collection.tokens, oldGroupPath);
        }

        await this.saveCollection(collectionId);

        const aliasesUpdated = updateAliases
          ? await this.applyGroupAliasUpdates(oldGroupPath, newGroupPath)
          : 0;

        return {
          renamedCount: plan.leafTokens.length,
          aliasesUpdated,
          pathRenames: plan.pathRenames,
        };
      },
    );
  }

  /** Preview which alias $values would be rewritten by a token rename (read-only). */
  previewRenameToken(
    oldPath: string,
    newPath: string,
  ): Array<AliasChange & { collectionId: string }> {
    const pathMap = new Map([[oldPath, newPath]]);
    const result: Array<AliasChange & { collectionId: string }> = [];
    for (const [sName, s] of this.collections) {
      for (const change of previewBulkAliasChanges(s.tokens, pathMap)) {
        result.push({ ...change, collectionId: sName });
      }
    }
    return result;
  }

  /** Preview which alias $values would be rewritten by a group rename (read-only). */
  previewRenameGroup(
    oldGroupPath: string,
    newGroupPath: string,
  ): Array<AliasChange & { collectionId: string }> {
    const result: Array<AliasChange & { collectionId: string }> = [];
    for (const [sName, s] of this.collections) {
      for (const change of previewGroupAliasChanges(
        s.tokens,
        oldGroupPath,
        newGroupPath,
      )) {
        result.push({ ...change, collectionId: sName });
      }
    }
    return result;
  }

  async renameToken(
    collectionId: string,
    oldPath: string,
    newPath: string,
    updateAliases = true,
  ): Promise<{ aliasesUpdated: number; pathRenames: TokenPathRename[] }> {
    const result = await this.batchRenameTokens(
      collectionId,
      [{ oldPath, newPath }],
      updateAliases,
    );
    return {
      aliasesUpdated: result.aliasesUpdated,
      pathRenames: result.pathRenames,
    };
  }

  async moveGroup(
    fromCollection: string,
    groupPath: string,
    toCollection: string,
  ): Promise<{ movedCount: number }> {
    const plan = this.planGroupTransfer(fromCollection, groupPath, toCollection, {
      overwriteExisting: false,
      actionLabel: "move",
    });
    return this.runStructuralMutation([fromCollection, toCollection], async () => {
      if (plan.groupObject) {
        setGroupAtPath(plan.target.tokens, groupPath, plan.groupObject);
      } else {
        for (const { relativePath, token } of plan.leafTokens) {
          setTokenAtPath(plan.target.tokens, `${groupPath}.${relativePath}`, token);
        }
      }

      deleteTokenAtPath(plan.source.tokens, groupPath);
      await this.saveCollections([fromCollection, toCollection]);

      return { movedCount: plan.leafTokens.length };
    });
  }

  async copyGroup(
    fromCollection: string,
    groupPath: string,
    toCollection: string,
  ): Promise<{ copiedCount: number }> {
    const plan = this.planGroupTransfer(fromCollection, groupPath, toCollection, {
      overwriteExisting: false,
      actionLabel: "copy",
    });
    return this.runStructuralMutation([toCollection], async () => {
      if (plan.groupObject) {
        setGroupAtPath(plan.target.tokens, groupPath, structuredClone(plan.groupObject));
      } else {
        for (const { relativePath, token } of plan.leafTokens) {
          setTokenAtPath(
            plan.target.tokens,
            `${groupPath}.${relativePath}`,
            structuredClone(token),
          );
        }
      }

      await this.saveCollection(toCollection);
      return { copiedCount: plan.leafTokens.length };
    });
  }

  async moveToken(
    fromCollection: string,
    tokenPath: string,
    toCollection: string,
    options?: {
      targetPath?: string;
      overwriteExisting?: boolean;
    },
  ): Promise<void> {
    const plan = this.planTokenTransfers(
      fromCollection,
      [{ sourcePath: tokenPath, targetPath: options?.targetPath }],
      toCollection,
      {
        overwriteExisting: options?.overwriteExisting ?? false,
      },
    );
    await this.runStructuralMutation([fromCollection, toCollection], async () => {
      for (const { sourcePath, targetPath, token } of plan.plannedTransfers) {
        setTokenAtPath(plan.target.tokens, targetPath, token);
        deleteTokenAtPath(plan.source.tokens, sourcePath);
      }
      await this.saveCollections([fromCollection, toCollection]);
    });
  }

  async copyToken(
    fromCollection: string,
    tokenPath: string,
    toCollection: string,
    options?: {
      targetPath?: string;
      overwriteExisting?: boolean;
    },
  ): Promise<void> {
    const plan = this.planTokenTransfers(
      fromCollection,
      [{ sourcePath: tokenPath, targetPath: options?.targetPath }],
      toCollection,
      {
        overwriteExisting: options?.overwriteExisting ?? false,
      },
    );
    await this.runStructuralMutation([toCollection], async () => {
      for (const { targetPath, token } of plan.plannedTransfers) {
        setTokenAtPath(plan.target.tokens, targetPath, structuredClone(token));
      }
      await this.saveCollection(toCollection);
    });
  }

  /**
   * Atomically update multiple tokens in the same collection. All changes are applied
   * in memory first, then saved once. If any patch fails validation, all
   * changes are rolled back (no partial writes to disk).
   */
  async batchUpdateTokens(
    collectionId: string,
    patches: Array<{ path: string; patch: Partial<Token> }>,
  ): Promise<void> {
    const collection = this.collections.get(collectionId);
    if (!collection) throw new NotFoundError(`Collection "${collectionId}" not found`);
    // Validate all patches upfront before mutating anything
    const enrichedPatches: Array<{ path: string; patch: Partial<Token> }> = [];
    const circularChecks: Array<{ path: string; token: Token }> = [];
    for (const { path: tokenPath, patch } of patches) {
      const existing = getTokenAtPath(collection.tokens, tokenPath);
      const existingWithInheritedType = getTokenAtPathWithInheritedType(
        collection.tokens,
        tokenPath,
      );
      if (!existing)
        throw new NotFoundError(
          `Token "${tokenPath}" not found in collection "${collectionId}"`,
        );
      const enrichedPatch = this.normalizeStoredTokenPatch(
        existingWithInheritedType ?? existing,
        patch,
      );
      circularChecks.push({
        path: tokenPath,
        token: this.buildProspectiveToken(existingWithInheritedType ?? existing, enrichedPatch),
      });
      enrichedPatches.push({ path: tokenPath, patch: enrichedPatch });
    }
    if (circularChecks.length > 0) {
      this.checkCircularReferences(collectionId, circularChecks);
    }
    // All validation passed — apply changes atomically
    const snapshot = this.snapshotCollectionTokens(collectionId);
    await this.withBatch(async () => {
      try {
        for (const { path: tokenPath, patch } of enrichedPatches) {
          const existing = getTokenAtPath(collection.tokens, tokenPath)!;
          this.applyTokenPatch(existing, patch);
        }
        await this.saveCollection(collectionId);
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
    this.emit({ type: "token-updated", collectionId: collectionId, tokenPath: "" });
  }

  /**
   * Atomically rename multiple tokens in the same collection. All renames are applied
   * in memory first, then saved once. Alias updates across all collections are also
   * batched into a single save per affected collection. If any rename fails, all
   * changes (including alias updates) are rolled back.
   */
  async batchRenameTokens(
    collectionId: string,
    renames: TokenPathRename[],
    updateAliases = true,
  ): Promise<{
    renamed: number;
    aliasesUpdated: number;
    pathRenames: TokenPathRename[];
  }> {
    const plan = this.planTokenRenames(collectionId, renames);
    return this.runStructuralMutation(
      this.getRenameSnapshotCollectionIds(collectionId, updateAliases),
      async () => {
        for (const { oldPath, newPath, token } of plan.plannedRenames) {
          setTokenAtPath(plan.collection.tokens, newPath, token);
          deleteTokenAtPath(plan.collection.tokens, oldPath);
        }

        await this.saveCollection(collectionId);

        const aliasesUpdated = updateAliases
          ? await this.applyTokenAliasUpdates(plan.pathMap)
          : 0;

        return {
          renamed: plan.plannedRenames.length,
          aliasesUpdated,
          pathRenames: renames.map(({ oldPath, newPath }) => ({
            oldPath,
            newPath,
          })),
        };
      },
    );
  }

  /**
   * Atomically move multiple tokens from one collection to another. All moves are
   * applied in memory first, then both collections are saved once. If any move fails
   * validation, all changes are rolled back.
   */
  async batchMoveTokens(
    fromCollection: string,
    paths: string[],
    toCollection: string,
  ): Promise<{ moved: number }> {
    const plan = this.planTokenTransfers(
      fromCollection,
      paths.map((sourcePath) => ({ sourcePath })),
      toCollection,
      {
        overwriteExisting: false,
      },
    );
    return this.runStructuralMutation([fromCollection, toCollection], async () => {
      for (const { sourcePath, targetPath, token } of plan.plannedTransfers) {
        setTokenAtPath(plan.target.tokens, targetPath, token);
        deleteTokenAtPath(plan.source.tokens, sourcePath);
      }
      await this.saveCollections([fromCollection, toCollection]);
      return { moved: plan.plannedTransfers.length };
    });
  }

  /**
   * Copy multiple tokens from one collection to another, overwriting any existing tokens at the
   * same paths in the target collection. The source tokens are preserved (not deleted).
   */
  async batchCopyTokens(
    fromCollection: string,
    paths: string[],
    toCollection: string,
  ): Promise<{ copied: number }> {
    const plan = this.planTokenTransfers(
      fromCollection,
      paths.map((sourcePath) => ({ sourcePath })),
      toCollection,
      {
        overwriteExisting: true,
      },
    );
    return this.runStructuralMutation([toCollection], async () => {
      for (const { targetPath, token } of plan.plannedTransfers) {
        setTokenAtPath(plan.target.tokens, targetPath, structuredClone(token));
      }
      await this.saveCollection(toCollection);
      return { copied: plan.plannedTransfers.length };
    });
  }

  async duplicateGroup(
    collectionId: string,
    groupPath: string,
  ): Promise<{ newGroupPath: string; count: number }> {
    const collection = this.collections.get(collectionId);
    if (!collection) throw new NotFoundError(`Collection "${collectionId}" not found`);
    const snapshot = this.snapshotCollectionTokens(collectionId);
    const leafTokens = collectGroupLeafTokens(collection.tokens, groupPath);
    if (leafTokens.length === 0) {
      const groupObj = getObjectAtPath(collection.tokens, groupPath);
      if (!groupObj) throw new NotFoundError(`Group "${groupPath}" not found`);
      const lastDot0 = groupPath.lastIndexOf(".");
      const parentPath0 = lastDot0 >= 0 ? groupPath.slice(0, lastDot0) : "";
      const baseName0 =
        lastDot0 >= 0 ? groupPath.slice(lastDot0 + 1) : groupPath;
      const makeNewPath0 = (suffix: string) =>
        parentPath0 ? `${parentPath0}.${suffix}` : suffix;
      let newEmptyPath = makeNewPath0(`${baseName0}-copy`);
      let attempt0 = 2;
      while (pathExistsAt(collection.tokens, newEmptyPath)) {
        newEmptyPath = makeNewPath0(`${baseName0}-copy-${attempt0++}`);
      }
      setGroupAtPath(
        collection.tokens,
        newEmptyPath,
        structuredClone(groupObj),
      );
      try {
        await this.saveCollection(collectionId);
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
      this.rebuildFlatTokens();
      return { newGroupPath: newEmptyPath, count: 0 };
    }
    const lastDot = groupPath.lastIndexOf(".");
    const parentPath = lastDot >= 0 ? groupPath.slice(0, lastDot) : "";
    const baseName = lastDot >= 0 ? groupPath.slice(lastDot + 1) : groupPath;
    const makeNewPath = (suffix: string) =>
      parentPath ? `${parentPath}.${suffix}` : suffix;
    let newGroupPath = makeNewPath(`${baseName}-copy`);
    let attempt = 2;
    while (pathExistsAt(collection.tokens, newGroupPath)) {
      newGroupPath = makeNewPath(`${baseName}-copy-${attempt++}`);
    }
    for (const { relativePath, token } of leafTokens) {
      setTokenAtPath(
        collection.tokens,
        `${newGroupPath}.${relativePath}`,
        structuredClone(token),
      );
    }
    try {
      await this.saveCollection(collectionId);
    } catch (err) {
      this.restoreSnapshots(snapshot);
      throw err;
    }
    this.rebuildFlatTokens();
    return { newGroupPath, count: leafTokens.length };
  }

  async bulkRename(
    collectionId: string,
    find: string,
    replace: string,
    isRegex = false,
  ): Promise<{ renamed: number; skipped: string[]; aliasesUpdated: number }> {
    const collection = this.collections.get(collectionId);
    if (!collection) throw new NotFoundError(`Collection "${collectionId}" not found`);

    const flatTokens = await this.getFlatTokensForCollection(collectionId);

    let pattern: RegExp | null = null;
    if (isRegex) {
      if (!isSafeRegex(find)) {
        throw new BadRequestError(
          `Regex pattern rejected: pattern is too long or contains nested quantifiers that could cause excessive backtracking`,
        );
      }
      try {
        pattern = new RegExp(find, "g");
      } catch {
        throw new BadRequestError(`Invalid regex pattern: "${find}"`);
      }
    }

    // Compute all intended renames
    const renames: Array<{ oldPath: string; newPath: string; token: Token }> =
      [];
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      const newPath = pattern
        ? tokenPath.replace(pattern, replace)
        : tokenPath.split(find).join(replace);
      if (newPath !== tokenPath) {
        renames.push({ oldPath: tokenPath, newPath, token });
      }
    }

    // Check for collisions: new path already exists and won't be freed by this rename batch
    const oldPaths = new Set(renames.map((r) => r.oldPath));
    const skipped: string[] = [];
    const filteredRenames: Array<{
      oldPath: string;
      newPath: string;
      token: Token;
    }> = [];
    for (const rename of renames) {
      const existsInSet =
        getTokenAtPath(collection.tokens, rename.newPath) !== undefined;
      const willBeFreed = oldPaths.has(rename.newPath);
      if (existsInSet && !willBeFreed) {
        skipped.push(rename.oldPath);
      } else {
        filteredRenames.push(rename);
      }
    }

    const pathMap = new Map(filteredRenames.map((r) => [r.oldPath, r.newPath]));

    // Snapshot all collections before mutation so we can restore atomically on failure
    const snapshot = this.snapshotCollectionTokens(...this.collections.keys());

    return await this.withBatch(async () => {
      try {
        // Apply: set new paths first, then remove old ones
        for (const { newPath, token } of filteredRenames) {
          setTokenAtPath(collection.tokens, newPath, token);
        }
        for (const { oldPath } of filteredRenames) {
          deleteTokenAtPath(collection.tokens, oldPath);
        }

        // Update alias references across all collections
        let aliasesUpdated = 0;
        const aliasModifiedCollections = new Set<string>();
        for (const [collectionName, collectionEntry] of this.collections) {
          const changed = updateBulkAliasRefs(collectionEntry.tokens, pathMap);
          if (changed > 0) {
            aliasesUpdated += changed;
            aliasModifiedCollections.add(collectionName);
          }
        }

        // Detect circular alias references created by the rename.
        // flatTokens is stale inside a batch (rebuildFlatTokens is deferred), so
        // build a fresh dependency map from this.collections directly — all mutations
        // (path renames + alias ref updates) have already been applied to the
        // token objects, so no overrides are needed.
        const liveDeps = this.buildDependencyMap(
          undefined,
          this.buildLiveFlatTokens(),
        );
        this.runCycleDFS(liveDeps, liveDeps.keys());

        // All checks passed — persist to disk
        await this.saveCollection(collectionId);
        for (const collectionName of aliasModifiedCollections) {
          await this.saveCollection(collectionName);
        }

        return { renamed: filteredRenames.length, skipped, aliasesUpdated };
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
  }

  // ----- Formula metadata -----

  /**
   * If a token's $value is a formula string, ensure $extensions.tokenmanager.formula
   * is set so Style Dictionary can output calc() expressions at export time.
   */
  private enrichFormulaExtension(
    token: Pick<Token, "$value" | "$extensions">,
  ): Token {
    const formulaValue =
      typeof token.$value === "string" && isFormula(token.$value)
        ? token.$value
        : null;
    const existingExtensions =
      token.$extensions &&
      typeof token.$extensions === "object" &&
      !Array.isArray(token.$extensions)
        ? { ...token.$extensions }
        : undefined;
    const existingTokenManager =
      existingExtensions?.tokenmanager &&
      typeof existingExtensions.tokenmanager === "object" &&
      !Array.isArray(existingExtensions.tokenmanager)
        ? {
            ...(existingExtensions.tokenmanager as Record<string, unknown>),
          }
        : undefined;
    const nextTokenManager = existingTokenManager
      ? { ...existingTokenManager }
      : undefined;
    if (formulaValue === null && nextTokenManager) {
      delete nextTokenManager.formula;
    }

    let nextExtensions = existingExtensions
      ? { ...existingExtensions }
      : undefined;
    if (formulaValue !== null) {
      nextExtensions = {
        ...nextExtensions,
        tokenmanager: {
          ...(nextTokenManager ?? {}),
          formula: formulaValue,
        },
      };
    } else if (nextExtensions && "tokenmanager" in nextExtensions) {
      if (nextTokenManager && Object.keys(nextTokenManager).length > 0) {
        nextExtensions.tokenmanager = nextTokenManager;
      } else {
        delete nextExtensions.tokenmanager;
      }
    }

    if (!nextExtensions || Object.keys(nextExtensions).length === 0) {
      return token.$extensions === undefined
        ? (token as Token)
        : ({ ...token, $extensions: undefined } as Token);
    }

    return {
      ...token,
      $extensions: nextExtensions,
    } as Token;
  }

  private normalizeStoredToken(token: Token): Token {
    const normalized = this.enrichFormulaExtension(
      normalizeScopedVariableToken(token),
    );
    if (normalized.$description == null) {
      delete normalized.$description;
    }
    if (normalized.$extensions == null) {
      delete normalized.$extensions;
    }
    return normalized;
  }

  private normalizeStoredTokenPatch(
    normalizationBase: Token,
    patch: Partial<Token>,
  ): Partial<Token> {
    let nextPatch = patch;
    if ("$description" in nextPatch && nextPatch.$description == null) {
      nextPatch = { ...nextPatch, $description: undefined };
    }
    if ("$extensions" in nextPatch && nextPatch.$extensions == null) {
      nextPatch = { ...nextPatch, $extensions: undefined };
    }

    const baseline = this.normalizeStoredToken(structuredClone(normalizationBase));
    const nextToken = structuredClone(normalizationBase);
    this.applyTokenPatch(nextToken, nextPatch);
    const normalizedNextToken = this.normalizeStoredToken(nextToken);

    const normalizedPatch: Partial<Token> = {};
    const tokenFields = [
      "$type",
      "$value",
      "$description",
      "$extensions",
    ] as const;

    for (const field of tokenFields) {
      const previousValue = baseline[field];
      const nextValue = normalizedNextToken[field];
      if (stableStringify(previousValue) === stableStringify(nextValue)) {
        continue;
      }

      if (
        (field === "$description" || field === "$extensions") &&
        nextValue === undefined
      ) {
        normalizedPatch[field] = undefined;
        continue;
      }

      normalizedPatch[field] = nextValue as never;
    }

    return normalizedPatch;
  }

  private applyTokenPatch(existing: Token, patch: Partial<Token>): void {
    if ("$value" in patch) existing.$value = patch.$value!;
    if ("$type" in patch) {
      if (patch.$type === undefined) {
        delete existing.$type;
      } else {
        existing.$type = patch.$type;
      }
    }
    if ("$description" in patch) {
      if (patch.$description === undefined) {
        delete existing.$description;
      } else {
        existing.$description = patch.$description;
      }
    }
    if ("$extensions" in patch) {
      if (patch.$extensions === undefined) {
        delete existing.$extensions;
      } else {
        existing.$extensions = patch.$extensions;
      }
    }
  }

  // ----- Group creation -----

  async createGroup(collectionId: string, groupPath: string): Promise<void> {
    validateTokenPath(groupPath);
    const collection = this.collections.get(collectionId);
    if (!collection) throw new NotFoundError(`Collection "${collectionId}" not found`);
    if (pathExistsAt(collection.tokens, groupPath)) {
      throw new ConflictError(`Path "${groupPath}" already exists`);
    }
    const snapshot = this.snapshotCollectionTokens(collectionId);
    setGroupAtPath(collection.tokens, groupPath, {});
    try {
      await this.saveCollection(collectionId);
    } catch (err) {
      this.restoreSnapshots(snapshot);
      throw err;
    }
    this.rebuildFlatTokens();
    this.emit({ type: "token-updated", collectionId: collectionId });
  }

  async updateGroup(
    collectionId: string,
    groupPath: string,
    meta: { $type?: string | null; $description?: string | null },
  ): Promise<void> {
    const collection = this.collections.get(collectionId);
    if (!collection) throw new NotFoundError(`Collection "${collectionId}" not found`);
    let group: TokenGroup;
    if (!groupPath) {
      group = collection.tokens as TokenGroup;
    } else {
      const found = getObjectAtPath(collection.tokens, groupPath);
      if (!found)
        throw new NotFoundError(
          `Group "${groupPath}" not found in collection "${collectionId}"`,
        );
      group = found;
    }
    const snapshot = this.snapshotCollectionTokens(collectionId);
    if ("$type" in meta) {
      if (meta.$type == null) delete group.$type;
      else group.$type = meta.$type as TokenType;
    }
    if ("$description" in meta) {
      if (meta.$description == null || meta.$description === "")
        delete group.$description;
      else group.$description = meta.$description;
    }
    try {
      await this.saveCollection(collectionId);
    } catch (err) {
      this.restoreSnapshots(snapshot);
      throw err;
    }
    this.rebuildFlatTokens();
    this.emit({ type: "token-updated", collectionId: collectionId, tokenPath: groupPath });
  }

  /**
   * Snapshot the tokens for one or more collections so they can be restored on failure.
   * Returns a Map of collectionId → cloned TokenGroup.
   */
  private snapshotCollectionTokens(...names: string[]): Map<string, TokenGroup> {
    const snapshots = new Map<string, TokenGroup>();
    for (const name of names) {
      const collection = this.collections.get(name);
      if (collection) snapshots.set(name, structuredClone(collection.tokens));
    }
    return snapshots;
  }

  /** Restore in-memory tokens from snapshots (used on saveCollection failure). */
  private restoreSnapshots(snapshots: Map<string, TokenGroup>): void {
    for (const [name, tokens] of snapshots) {
      const collection = this.collections.get(name);
      if (collection) collection.tokens = tokens;
    }
  }

  private saveCollection(name: string): Promise<void> {
    // Serialize writes for each collection: chain the actual I/O behind any in-flight
    // write for the same collection so concurrent callers never race on the same .tmp file.
    const prev = this._saveChains.get(name) ?? Promise.resolve();
    const next = prev.then(async () => {
      const collection = this.collections.get(name);
      if (!collection) return;
      const filePath = this.collectionFilePath(name);
      const tmpPath = filePath + ".tmp";
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(tmpPath, JSON.stringify(collection.tokens, null, 2));
      this._startWriteGuard(filePath);
      try {
        await fs.rename(tmpPath, filePath);
      } catch (err) {
        await fs.unlink(tmpPath).catch(() => {});
        throw err;
      }
    });
    // Advance the chain regardless of success/failure (mirrors PromiseChainLock behaviour).
    this._saveChains.set(
      name,
      next.catch(() => {}),
    );
    return next;
  }

  // ----- SSE support -----

  onChange(listener: (event: ChangeEvent) => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private emit(event: ChangeEvent): void {
    for (const listener of this.changeListeners) {
      listener(event);
    }
  }

  /** Emit an arbitrary event to all SSE listeners. */
  emitEvent(event: ChangeEvent): void {
    this.emit(event);
  }

  async shutdown(): Promise<void> {
    if (this._rebuildDebounceTimer !== null) {
      clearTimeout(this._rebuildDebounceTimer);
      this._rebuildDebounceTimer = null;
    }
    await Promise.all([...this._saveChains.values()]);
    await this.watcher?.close();
  }
}

export interface ChangeEvent {
  type:
    | "collection-added"
    | "collection-updated"
    | "collection-removed"
    | "token-updated"
    | "file-load-error"
    | "workspace-file-changed"
    | "workspace-file-removed";
  collectionId: string;
  tokenPath?: string;
  message?: string;
  resourceType?: "collections" | "generators" | "resolver";
}
