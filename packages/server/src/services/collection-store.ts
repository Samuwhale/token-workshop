import fs from "node:fs/promises";
import path from "node:path";
import type {
  CollectionPublishRouting,
  TokenCollection,
} from "@token-workshop/core";
import {
  normalizeCollectionModeName,
  readCollectionsFileState,
  serializeTokenCollections,
  stableStringify,
} from "@token-workshop/core";
import { ConflictError, NotFoundError } from "../errors.js";
import { expectJsonObject, parseJsonFile } from "../utils/json-file.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";

export interface CollectionState {
  collections: TokenCollection[];
}

export interface CollectionMetadataState {
  description?: string;
}

export type CollectionPublishRoutingState = CollectionPublishRouting;

export interface CollectionStore {
  filePath: string;
  load(): Promise<TokenCollection[]>;
  loadState(): Promise<CollectionState>;
  reloadFromDisk(): Promise<"changed" | "removed" | "unchanged">;
  save(collections: TokenCollection[]): Promise<void>;
  saveState(state: CollectionState): Promise<void>;
  startWriteGuard(absoluteFilePath: string): void;
  endWriteGuard(absoluteFilePath: string): void;
  consumeWriteGuard(absoluteFilePath: string): boolean;
  withLock<T>(
    fn: (
      collections: TokenCollection[],
    ) => Promise<{ collections: TokenCollection[]; result: T }>,
  ): Promise<T>;
  withStateLock<T>(
    fn: (
      state: CollectionState,
    ) => Promise<{ state: CollectionState; result: T }>,
  ): Promise<T>;
  withReadStateLock<T>(
    fn: (state: CollectionState) => Promise<T>,
  ): Promise<T>;
}

function validateCollectionState(state: CollectionState): CollectionState {
  const nextState = structuredClone(state);
  const collectionIdSet = new Set<string>();
  const duplicateCollectionIds = new Set<string>();

  for (const collection of nextState.collections) {
    if (!collection.id.trim()) {
      throw new ConflictError(
        "Collection state contains a collection with an empty id",
      );
    }
    if (collectionIdSet.has(collection.id)) {
      duplicateCollectionIds.add(collection.id);
    } else {
      collectionIdSet.add(collection.id);
    }

    if (collection.modes.length === 0) {
      throw new ConflictError(
        `Collection "${collection.id}" must define at least one mode`,
      );
    }

    const modeNames = new Set<string>();
    const duplicateModeNames = new Set<string>();
    for (const mode of collection.modes) {
      if (!mode.name.trim()) {
        throw new ConflictError(
          `Collection "${collection.id}" contains a mode with an empty name`,
        );
      }
      const normalizedModeName = normalizeCollectionModeName(mode.name);
      if (modeNames.has(normalizedModeName)) {
        duplicateModeNames.add(mode.name);
      } else {
        modeNames.add(normalizedModeName);
      }
    }

    if (duplicateModeNames.size > 0) {
      throw new ConflictError(
        `Collection "${collection.id}" contains duplicate modes: ${[...duplicateModeNames].join(", ")}`,
      );
    }
  }

  if (duplicateCollectionIds.size > 0) {
    throw new ConflictError(
      `Collection state contains duplicate collection ids: ${[...duplicateCollectionIds].join(", ")}`,
    );
  }

  return nextState;
}

export function requireCollection(
  state: CollectionState,
  collectionId: string,
): TokenCollection {
  const collection = state.collections.find(
    (candidate) => candidate.id === collectionId,
  );
  if (!collection) {
    throw new NotFoundError(`Collection "${collectionId}" not found`);
  }
  return collection;
}

export function createCollectionStore(tokenDir: string): CollectionStore {
  const filePath = path.join(tokenDir, "$collections.json");
  let cache: CollectionState | null = null;
  let cachedMtimeMs: number | null = null;
  const lock = new PromiseChainLock();
  const writingFiles = new Map<string, ReturnType<typeof setTimeout>>();

  async function fileMtimeMs(): Promise<number | null> {
    try {
      const stat = await fs.stat(filePath);
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }

  function startWriteGuard(absoluteFilePath: string): void {
    const existing = writingFiles.get(absoluteFilePath);
    if (existing) {
      clearTimeout(existing);
    }
    writingFiles.set(
      absoluteFilePath,
      setTimeout(() => writingFiles.delete(absoluteFilePath), 30_000),
    );
  }

  function endWriteGuard(absoluteFilePath: string): void {
    const timer = writingFiles.get(absoluteFilePath);
    if (timer) {
      clearTimeout(timer);
    }
    writingFiles.delete(absoluteFilePath);
  }

  function consumeWriteGuard(absoluteFilePath: string): boolean {
    if (!writingFiles.has(absoluteFilePath)) {
      return false;
    }
    endWriteGuard(absoluteFilePath);
    return true;
  }

  async function loadStateFromDisk(): Promise<{
    state: CollectionState;
    mtimeMs: number | null;
    exists: boolean;
  }> {
    const mtimeMs = await fileMtimeMs();
    if (mtimeMs === null) {
      return {
        state: { collections: [] },
        mtimeMs: null,
        exists: false,
      };
    }

    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          state: { collections: [] },
          mtimeMs: null,
          exists: false,
        };
      }
      throw err;
    }
    const data = expectJsonObject(
      parseJsonFile(content, { filePath, relativeTo: tokenDir }),
      { filePath, relativeTo: tokenDir },
    );
    return {
      state: validateCollectionState(readCollectionsFileState(data)),
      mtimeMs,
      exists: true,
    };
  }

  async function ensureStateLoaded(): Promise<CollectionState> {
    const mtimeMs = await fileMtimeMs();
    if (cache !== null && mtimeMs === cachedMtimeMs) {
      return structuredClone(cache);
    }

    const { state, exists } = await loadStateFromDisk();
    cache = structuredClone(state);
    cachedMtimeMs = exists ? mtimeMs : null;

    return structuredClone(cache);
  }

  const store: CollectionStore = {
    filePath,

    async load(): Promise<TokenCollection[]> {
      const state = await ensureStateLoaded();
      return state.collections;
    },

    async loadState(): Promise<CollectionState> {
      return ensureStateLoaded();
    },

    reloadFromDisk(): Promise<"changed" | "removed" | "unchanged"> {
      return lock.withLock(async () => {
        const previousMtimeMs = cachedMtimeMs;
        const previousSerialized = cache === null ? null : stableStringify(cache);
        const { state, mtimeMs, exists } = await loadStateFromDisk();

        if (!exists) {
          const hadData =
            cache !== null &&
            (cache.collections.length > 0 || cachedMtimeMs !== null);
          cache = { collections: [] };
          cachedMtimeMs = null;
          return hadData ? "removed" : "unchanged";
        }

        if (cache !== null && mtimeMs === previousMtimeMs) {
          return "unchanged";
        }

        const nextSerialized = stableStringify(state);
        cache = structuredClone(state);
        cachedMtimeMs = mtimeMs;
        return previousSerialized === nextSerialized ? "unchanged" : "changed";
      });
    },

    async save(collections: TokenCollection[]): Promise<void> {
      await store.saveState({ collections });
    },

    async saveState(state: CollectionState): Promise<void> {
      const validatedState = validateCollectionState(state);
      if (stableStringify(cache) === stableStringify(validatedState)) {
        return;
      }
      const data = {
        $collections: serializeTokenCollections(validatedState.collections),
      };
      const tmp = `${filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      startWriteGuard(filePath);
      try {
        await fs.rename(tmp, filePath);
      } catch (err) {
        endWriteGuard(filePath);
        await fs.unlink(tmp).catch((cleanupErr) => {
          console.error(
            "[rollback-error] Cleanup failed: could not remove temp file after collection state write failure",
            cleanupErr,
          );
        });
        throw err;
      }
      cache = structuredClone(validatedState);
      cachedMtimeMs = await fileMtimeMs();
    },

    startWriteGuard,
    endWriteGuard,
    consumeWriteGuard,

    withLock<T>(
      fn: (
        collections: TokenCollection[],
      ) => Promise<{ collections: TokenCollection[]; result: T }>,
    ): Promise<T> {
      return lock.withLock(async () => {
        const collections = await store.load();
        const { collections: updated, result } = await fn(collections);
        await store.save(updated);
        return result;
      });
    },

    withStateLock<T>(
      fn: (
        state: CollectionState,
      ) => Promise<{ state: CollectionState; result: T }>,
    ): Promise<T> {
      return lock.withLock(async () => {
        const state = await store.loadState();
        const { state: updated, result } = await fn(state);
        await store.saveState(updated);
        return result;
      });
    },

    withReadStateLock<T>(fn: (state: CollectionState) => Promise<T>): Promise<T> {
      return lock.withLock(async () => {
        const state = await store.loadState();
        return fn(structuredClone(state));
      });
    },
  };

  return store;
}
