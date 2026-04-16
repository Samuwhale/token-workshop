import type { FastifyPluginAsync } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  TokenCollection,
  SelectedModes,
  ViewPreset,
  Token,
  TokenModeValues,
} from "@tokenmanager/core";
import {
  buildTokenExtensionsWithCollectionModes,
  normalizeSelectedModes,
  readTokenCollectionModeValues,
  readCollectionsFileState,
  serializeTokenCollections,
} from "@tokenmanager/core";
import {
  handleRouteError,
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../errors.js";
import type { SnapshotEntry } from "../services/operation-log.js";
import {
  qualifySnapshotEntries,
  snapshotPaths,
} from "../services/operation-log.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";

interface CollectionState {
  collections: TokenCollection[];
  views: ViewPreset[];
}

type TokenModeMap = TokenModeValues;
type TokenPatch = { path: string; patch: Partial<Token> };
type TokenPatchesBySet = Map<string, TokenPatch[]>;

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mergeSetSnapshot(
  target: Record<string, SnapshotEntry>,
  setName: string,
  snapshot: Record<string, SnapshotEntry>,
): void {
  Object.assign(target, qualifySnapshotEntries(setName, snapshot));
}

function groupSnapshotEntriesBySet(
  snapshot: Record<string, SnapshotEntry>,
): Map<string, Array<{ path: string; token: Token | null }>> {
  const grouped = new Map<string, Array<{ path: string; token: Token | null }>>();
  for (const [snapshotKey, entry] of Object.entries(snapshot)) {
    const prefix = `${entry.setName}::`;
    const tokenPath = snapshotKey.startsWith(prefix)
      ? snapshotKey.slice(prefix.length)
      : snapshotKey;
    const items = grouped.get(entry.setName) ?? [];
    items.push({ path: tokenPath, token: entry.token });
    grouped.set(entry.setName, items);
  }
  return grouped;
}

export interface CollectionsStore {
  filePath: string;
  load(): Promise<TokenCollection[]>;
  loadViews(): Promise<ViewPreset[]>;
  loadState(): Promise<CollectionState>;
  reloadFromDisk(): Promise<"changed" | "removed" | "unchanged">;
  save(collections: TokenCollection[]): Promise<void>;
  saveViews(views: ViewPreset[]): Promise<void>;
  saveState(state: CollectionState): Promise<void>;
  reset(): Promise<void>;
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

export function createCollectionsStore(tokenDir: string): CollectionsStore {
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
    if (existing) clearTimeout(existing);
    writingFiles.set(
      absoluteFilePath,
      setTimeout(() => writingFiles.delete(absoluteFilePath), 30_000),
    );
  }

  function endWriteGuard(absoluteFilePath: string): void {
    const timer = writingFiles.get(absoluteFilePath);
    if (timer) clearTimeout(timer);
    writingFiles.delete(absoluteFilePath);
  }

  function consumeWriteGuard(absoluteFilePath: string): boolean {
    if (!writingFiles.has(absoluteFilePath)) return false;
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
        state: { collections: [], views: [] },
        mtimeMs: null,
        exists: false,
      };
    }

    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content) as unknown;
    return {
      state: readCollectionsFileState(data),
      mtimeMs,
      exists: true,
    };
  }

  async function ensureStateLoaded(): Promise<CollectionState> {
    const mtimeMs = await fileMtimeMs();
    if (cache !== null && mtimeMs === cachedMtimeMs) {
      return structuredClone(cache);
    }

    try {
      const { state, exists } = await loadStateFromDisk();
      cache = structuredClone(state);
      cachedMtimeMs = exists ? mtimeMs : null;
    } catch {
      if (cache === null) {
        cache = { collections: [], views: [] };
        cachedMtimeMs = null;
      }
    }

    return structuredClone(cache);
  }

  const store: CollectionsStore = {
    filePath,

    async load(): Promise<TokenCollection[]> {
      const state = await ensureStateLoaded();
      return state.collections;
    },

    async loadViews(): Promise<ViewPreset[]> {
      const state = await ensureStateLoaded();
      return state.views;
    },

    async loadState(): Promise<CollectionState> {
      return ensureStateLoaded();
    },

    reloadFromDisk(): Promise<"changed" | "removed" | "unchanged"> {
      return lock.withLock(async () => {
        const previousMtimeMs = cachedMtimeMs;
        const previousSerialized =
          cache === null ? null : JSON.stringify(cache);
        const { state, mtimeMs, exists } = await loadStateFromDisk();

        if (!exists) {
          const hadData =
            cache !== null &&
            (cache.collections.length > 0 ||
              cache.views.length > 0 ||
              cachedMtimeMs !== null);
          cache = { collections: [], views: [] };
          cachedMtimeMs = null;
          return hadData ? "removed" : "unchanged";
        }

        if (cache !== null && mtimeMs === previousMtimeMs) {
          return "unchanged";
        }

        const nextSerialized = JSON.stringify(state);
        cache = structuredClone(state);
        cachedMtimeMs = mtimeMs;
        return previousSerialized === nextSerialized ? "unchanged" : "changed";
      });
    },

    async save(collections: TokenCollection[]): Promise<void> {
      const state = await ensureStateLoaded();
      await store.saveState({ ...state, collections });
    },

    async saveViews(views: ViewPreset[]): Promise<void> {
      const state = await ensureStateLoaded();
      await store.saveState({ ...state, views });
    },

    async saveState(state: CollectionState): Promise<void> {
      if (JSON.stringify(cache) === JSON.stringify(state)) {
        return;
      }
      const data = {
        $collections: serializeTokenCollections(state.collections),
        ...(state.views.length > 0 ? { $views: state.views } : {}),
      };
      const tmp = `${filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      startWriteGuard(filePath);
      try {
        await fs.rename(tmp, filePath);
      } catch (err) {
        endWriteGuard(filePath);
        await fs.unlink(tmp).catch((cleanupErr) => {
          console.error("[rollback-error] Cleanup failed: could not remove temp file after collection state write failure", cleanupErr);
        });
        throw err;
      }
      cache = structuredClone(state);
      cachedMtimeMs = await fileMtimeMs();
    },

    reset(): Promise<void> {
      return lock.withLock(async () => {
        startWriteGuard(filePath);
        await fs.rm(filePath, { force: true });
        cache = { collections: [], views: [] };
        cachedMtimeMs = null;
      });
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

export const collectionRoutes: FastifyPluginAsync<{ tokenDir: string }> = async (
  fastify,
  _opts,
) => {
  const store = fastify.collectionsStore;

  async function validateCollectionState(
    state: CollectionState,
  ): Promise<CollectionState> {
    const nextState = structuredClone(state);
    const setIds = await fastify.tokenStore.getSets();
    const setIdSet = new Set(setIds);
    const collectionIdSet = new Set<string>();
    const duplicateCollectionIds = new Set<string>();

    for (const collection of nextState.collections) {
      if (!collection.id.trim()) {
        throw new ConflictError("Collection state contains a collection with an empty id");
      }
      if (!collection.name.trim()) {
        throw new ConflictError(
          `Collection "${collection.id}" has an empty name in persisted state`,
        );
      }
      if (collectionIdSet.has(collection.id)) {
        duplicateCollectionIds.add(collection.id);
      } else {
        collectionIdSet.add(collection.id);
      }

      const modeNames = new Set<string>();
      const duplicateModeNames = new Set<string>();
      for (const mode of collection.modes) {
        if (!mode.name.trim()) {
          throw new ConflictError(
            `Collection "${collection.id}" contains a mode with an empty name`,
          );
        }
        if (modeNames.has(mode.name)) {
          duplicateModeNames.add(mode.name);
        } else {
          modeNames.add(mode.name);
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

    const missingCollectionIds = setIds.filter((setId) => !collectionIdSet.has(setId));
    const orphanedCollectionIds = nextState.collections
      .map((collection) => collection.id)
      .filter((collectionId) => !setIdSet.has(collectionId));

    if (missingCollectionIds.length > 0 || orphanedCollectionIds.length > 0) {
      const details = [
        missingCollectionIds.length > 0
          ? `missing collections for sets: ${missingCollectionIds.join(", ")}`
          : null,
        orphanedCollectionIds.length > 0
          ? `orphaned collections without matching sets: ${orphanedCollectionIds.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("; ");
      throw new ConflictError(
        `Collection state is out of sync with token storage: ${details}`,
      );
    }

    const validModesByCollectionId = new Map(
      nextState.collections.map((collection) => [
        collection.id,
        new Set(collection.modes.map((mode) => mode.name)),
      ]),
    );
    const viewIds = new Set<string>();

    for (const view of nextState.views) {
      if (!view.id.trim()) {
        throw new ConflictError("Collection view state contains a view with an empty id");
      }
      if (!view.name.trim()) {
        throw new ConflictError(
          `View "${view.id}" has an empty name in persisted state`,
        );
      }
      if (viewIds.has(view.id)) {
        throw new ConflictError(
          `Collection view state contains duplicate view ids: ${view.id}`,
        );
      }
      viewIds.add(view.id);

      for (const [collectionId, modeName] of Object.entries(view.selections)) {
        const validModes = validModesByCollectionId.get(collectionId);
        if (!validModes) {
          throw new ConflictError(
            `View "${view.id}" references unknown collection "${collectionId}"`,
          );
        }
        if (!validModes.has(modeName)) {
          throw new ConflictError(
            `View "${view.id}" references unknown mode "${modeName}" in collection "${collectionId}"`,
          );
        }
      }
    }

    return nextState;
  }

  async function withCollectionLock<T>(
    type: string,
    fn: (
      collections: TokenCollection[],
    ) => Promise<{
      collections: TokenCollection[];
      result: T;
      description: string;
    }>,
  ): Promise<T> {
    let capturedBefore: TokenCollection[] | null = null;
    let capturedDescription = "";
    const result = await store.withLock(async (collections) => {
      const validatedState = await validateCollectionState({
        collections,
        views: [],
      });
      capturedBefore = structuredClone(validatedState.collections);
      const out = await fn(validatedState.collections);
      capturedDescription = out.description;
      const nextState = await validateCollectionState({
        collections: out.collections,
        views: [],
      });
      return { collections: nextState.collections, result: out.result };
    });
    if (capturedBefore !== null) {
      await fastify.operationLog.record({
        type,
        description: capturedDescription,
        setName: "$collections",
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        rollbackSteps: [{ action: "write-themes", dimensions: capturedBefore }],
      });
    }
    return result;
  }

  async function collectModeMutationPatches(
    mutateModes: (
      token: Token,
    ) => TokenModeMap | null,
  ): Promise<TokenPatchesBySet> {
    const patchesBySet: TokenPatchesBySet = new Map();

    for (const setName of await fastify.tokenStore.getSets()) {
      const flatTokens = await fastify.tokenStore.getFlatTokensForSet(setName);
      const patches: TokenPatch[] = [];

      for (const [tokenPath, token] of Object.entries(flatTokens)) {
        const nextModes = mutateModes(token);
        if (nextModes === null) continue;

        const nextExtensions = buildTokenExtensionsWithCollectionModes(token, nextModes);
        if (
          JSON.stringify(nextExtensions ?? null) ===
          JSON.stringify(token.$extensions ?? null)
        ) {
          continue;
        }

        patches.push({
          path: tokenPath,
          patch: { $extensions: nextExtensions },
        });
      }

      if (patches.length > 0) {
        patchesBySet.set(setName, patches);
      }
    }

    return patchesBySet;
  }

  async function withCollectionStateAndTokenMutations<T>(
    type: string,
    fn: (state: CollectionState) => Promise<{
      state: CollectionState;
      result: T;
      description: string;
      tokenPatchesBySet?: TokenPatchesBySet;
    }>,
  ): Promise<T> {
    const beforeSnapshot: Record<string, SnapshotEntry> = {};
    const afterSnapshot: Record<string, SnapshotEntry> = {};
    const touchedPathsBySet = new Map<string, string[]>();
    let beforeState: CollectionState | null = null;
    let description = "";

    try {
      const result = await fastify.tokenLock.withLock(async () =>
        store.withStateLock(async (state) => {
          const validatedState = await validateCollectionState(state);
          beforeState = structuredClone(validatedState);
          const out = await fn(validatedState);
          description = out.description;

          for (const [setName, patches] of out.tokenPatchesBySet ?? []) {
            const paths = patches.map((patch) => patch.path);
            touchedPathsBySet.set(setName, paths);
            mergeSetSnapshot(
              beforeSnapshot,
              setName,
              await snapshotPaths(fastify.tokenStore, setName, paths),
            );
          }

          for (const [setName, patches] of out.tokenPatchesBySet ?? []) {
            await fastify.tokenStore.batchUpdateTokens(setName, patches);
          }

          for (const [setName, paths] of touchedPathsBySet.entries()) {
            mergeSetSnapshot(
              afterSnapshot,
              setName,
              await snapshotPaths(fastify.tokenStore, setName, paths),
            );
          }

          const nextState = await validateCollectionState(out.state);
          return { state: nextState, result: out.result };
        }),
      );

      if (beforeState !== null) {
        const previousState = beforeState as CollectionState;
        await fastify.operationLog.record({
          type,
          description,
          setName: "$collections",
          affectedPaths: [
            ...new Set(
              Array.from(touchedPathsBySet.values()).flatMap((paths) => paths),
            ),
          ],
          beforeSnapshot,
          afterSnapshot,
          rollbackSteps: [
            {
              action: "write-themes",
              dimensions: previousState.collections,
              views: previousState.views,
            },
          ],
        });
      }

      return result;
    } catch (err) {
      if (beforeState !== null || Object.keys(beforeSnapshot).length > 0) {
        await fastify.tokenLock.withLock(async () => {
          await store.withStateLock(async (state) => {
            if (Object.keys(beforeSnapshot).length > 0) {
              const snapshotBySet = groupSnapshotEntriesBySet(beforeSnapshot);
              for (const [setName, items] of snapshotBySet.entries()) {
                await fastify.tokenStore.restoreSnapshot(setName, items);
              }
            }

            return {
              state: beforeState ?? state,
              result: undefined,
            };
          });
        });
      }
      throw err;
    }
  }

  async function withCollectionStateMutation<T>(
    type: string,
    fn: (state: CollectionState) => Promise<{
      state: CollectionState;
      result: T;
      description: string;
    }>,
  ): Promise<T> {
    let beforeState: CollectionState | null = null;
    let description = "";

    const result = await store.withStateLock(async (state) => {
      const validatedState = await validateCollectionState(state);
      beforeState = structuredClone(validatedState);
      const out = await fn(validatedState);
      description = out.description;
      const nextState = await validateCollectionState(out.state);
      return { state: nextState, result: out.result };
    });

    const previousState = beforeState as CollectionState | null;
    if (!previousState) {
      return result;
    }

    await fastify.operationLog.record({
      type,
      description,
      setName: "$collections",
      affectedPaths: [],
      beforeSnapshot: {},
      afterSnapshot: {},
      rollbackSteps: [
        {
          action: "write-themes",
          dimensions: previousState.collections,
          views: previousState.views,
        },
      ],
    });

    return result;
  }

  fastify.get("/collections", async (_request, reply) => {
    try {
      const state = await validateCollectionState(await store.loadState());
      return {
        collections: serializeTokenCollections(state.collections),
        previews: state.views,
      };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to load collections");
    }
  });

  fastify.post<{ Params: { id: string }; Body: { name: string } }>(
    "/collections/:id/modes",
    async (request, reply) => {
      const { id } = request.params;
      const { name } = request.body || {};
      const bodyKeys = Object.keys(request.body ?? {});
      if (bodyKeys.some((key) => key !== "name")) {
        return reply.status(400).send({
          error: "Only the mode name is supported when creating a collection mode",
        });
      }
      if (!name || typeof name !== "string" || !name.trim()) {
        return reply.status(400).send({ error: "Mode name is required" });
      }
      const trimmedName = name.trim();
      try {
        const { option, status } = await withCollectionLock(
          "theme-option-upsert",
          async (collections) => {
            const collectionIndex = collections.findIndex(
              (collection) => collection.id === id,
            );
            if (collectionIndex === -1) {
              throw new NotFoundError(`Collection "${id}" not found`);
            }
            const nextCollections = structuredClone(collections);
            const collection = nextCollections[collectionIndex];
            const optIdx = collection.modes.findIndex(
              (option) => option.name === trimmedName,
            );
            const option = { name: trimmedName };
            const isUpdate = optIdx >= 0;
            if (isUpdate) {
              collection.modes[optIdx] = option;
            } else {
              collection.modes.push(option);
            }
            return {
              collections: nextCollections,
              result: { option, status: isUpdate ? 200 : 201 },
              description: `${isUpdate ? "Update" : "Add"} mode "${trimmedName}" in collection "${collection.name}"`,
            };
          },
        );
        return reply.status(status).send({ ok: true, option });
      } catch (err) {
        return handleRouteError(reply, err, "Failed to save mode");
      }
    },
  );

  fastify.put<{
    Params: { id: string; optionName: string };
    Body: { name: string };
  }>("/collections/:id/modes/:optionName", async (request, reply) => {
    const { id, optionName } = request.params;
    const { name } = request.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return reply.status(400).send({ error: "New mode name is required" });
    }
    const newName = name.trim();
    try {
        const option = await withCollectionStateAndTokenMutations(
          "theme-option-rename",
          async (state) => {
          const nextCollections = structuredClone(state.collections);
          const collectionIndex = nextCollections.findIndex(
            (collection) => collection.id === id,
          );
          if (collectionIndex === -1) {
            throw new NotFoundError(`Collection "${id}" not found`);
          }

          const collection = nextCollections[collectionIndex];
          const optionIndex = collection.modes.findIndex(
            (option) => option.name === optionName,
          );
          if (optionIndex === -1) {
            throw new NotFoundError(
              `Mode "${optionName}" not found in collection "${id}"`,
            );
          }
          if (
            newName !== optionName &&
            collection.modes.some((option) => option.name === newName)
          ) {
            throw new ConflictError(
              `Mode "${newName}" already exists in this collection`,
            );
          }

          const tokenPatchesBySet =
            newName === optionName
              ? undefined
              : await collectModeMutationPatches((token) => {
                  const nextModes = readTokenCollectionModeValues(token);
                  const collectionModes = nextModes[id];
                  if (!collectionModes || !(optionName in collectionModes)) {
                    return null;
                  }

                  if (
                    newName in collectionModes &&
                    JSON.stringify(collectionModes[newName]) !==
                      JSON.stringify(collectionModes[optionName])
                  ) {
                    throw new ConflictError(
                      `Token-authored mode data already exists under "${newName}" in collection "${id}"`,
                    );
                  }

                  collectionModes[newName] = collectionModes[optionName];
                  delete collectionModes[optionName];
                  return nextModes;
                });

          collection.modes[optionIndex] = { name: newName };

          return {
            state: {
              collections: nextCollections,
              views: state.views.map((view) => ({
                ...view,
                selections:
                  view.selections[id] === optionName
                    ? {
                        ...view.selections,
                        [id]: newName,
                      }
                    : view.selections,
              })),
            },
            result: collection.modes[optionIndex],
            description: `Rename mode "${optionName}" → "${newName}" in collection "${collection.name}"`,
            tokenPatchesBySet,
          };
        },
      );
      return { ok: true, option };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to rename mode");
    }
  });

  fastify.put<{ Params: { id: string }; Body: { options: string[] } }>(
    "/collections/:id/modes-order",
    async (request, reply) => {
      const { id } = request.params;
      const { options } = request.body || {};
      if (
        !Array.isArray(options) ||
        options.some((option) => typeof option !== "string")
      ) {
        return reply
          .status(400)
          .send({ error: "options must be an array of option name strings" });
      }
      try {
        const collection = await withCollectionLock(
          "theme-option-reorder",
          async (collections) => {
            const collectionIndex = collections.findIndex(
              (collection) => collection.id === id,
            );
            if (collectionIndex === -1) {
              throw new NotFoundError(`Collection "${id}" not found`);
            }
            const nextCollections = structuredClone(collections);
            const collection = nextCollections[collectionIndex];
            const byName = new Map(
              collection.modes.map((option) => [option.name, option]),
            );
            for (const optionName of options) {
              if (!byName.has(optionName)) {
                throw new BadRequestError(
                  `Mode "${optionName}" not found in collection "${id}"`,
                );
              }
            }
            if (
              options.length !== collection.modes.length ||
              new Set(options).size !== collection.modes.length
            ) {
              throw new BadRequestError(
                "options must list every mode name exactly once",
              );
            }
            collection.modes = options.map((optionName) => byName.get(optionName)!);
            return {
              collections: nextCollections,
              result: collection,
              description: `Reorder modes in collection "${collection.name}"`,
            };
          },
        );
        return { ok: true, dimension: serializeTokenCollections([collection])[0] };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to reorder modes");
      }
    },
  );

  fastify.delete<{ Params: { id: string; optionName: string } }>(
    "/collections/:id/modes/:optionName",
    async (request, reply) => {
      const { id, optionName } = request.params;
      try {
        await withCollectionStateAndTokenMutations(
          "theme-option-delete",
          async (state) => {
            const nextCollections = structuredClone(state.collections);
            const collectionIndex = nextCollections.findIndex(
              (collection) => collection.id === id,
            );
            if (collectionIndex === -1) {
              throw new NotFoundError(`Collection "${id}" not found`);
            }

            const collection = nextCollections[collectionIndex];
            const filteredOptions = collection.modes.filter(
              (option) => option.name !== optionName,
            );
            if (filteredOptions.length === collection.modes.length) {
              throw new NotFoundError(
                `Mode "${optionName}" not found in collection "${id}"`,
              );
            }

            const tokenPatchesBySet = await collectModeMutationPatches((token) => {
              const nextModes = readTokenCollectionModeValues(token);
              const collectionModes = nextModes[id];
              if (!collectionModes || !(optionName in collectionModes)) {
                return null;
              }

              delete collectionModes[optionName];
              if (Object.keys(collectionModes).length === 0) {
                delete nextModes[id];
              }
              return nextModes;
            });

            collection.modes = filteredOptions;

            return {
              state: {
                collections: nextCollections,
                views: state.views.map((view) => {
                  if (view.selections[id] !== optionName) {
                    return view;
                  }
                  const nextSelections = { ...view.selections };
                  delete nextSelections[id];
                  return {
                    ...view,
                    selections: nextSelections,
                  };
                }),
              },
              result: undefined,
              description: `Delete mode "${optionName}" from collection "${collection.name}"`,
              tokenPatchesBySet,
            };
          },
        );
        return { ok: true, id, optionName };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to delete mode");
      }
    },
  );

  fastify.post<{
    Body: { id: string; name: string; selections: SelectedModes };
  }>("/previews", async (request, reply) => {
    const { id, name, selections } = request.body || {};
    if (!id || typeof id !== "string") {
      return reply.status(400).send({ error: "View id is required" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return reply.status(400).send({ error: "View name is required" });
    }
    if (!selections || typeof selections !== "object" || Array.isArray(selections)) {
      return reply.status(400).send({ error: "View selections are required" });
    }
    try {
      const normalizedId = slugifyName(id);
      const view = await withCollectionStateMutation(
        "theme-view-create",
        async (state) => {
          if (state.views.some((item) => item.id === normalizedId)) {
            throw new ConflictError(`View "${normalizedId}" already exists`);
          }

          const nextView: ViewPreset = {
            id: normalizedId,
            name: name.trim(),
            selections: normalizeSelectedModes(
              state.collections,
              selections as SelectedModes,
            ),
          };

          return {
            state: {
              ...state,
              views: [...state.views, nextView],
            },
            result: nextView,
            description: `Create preview preset "${nextView.name}"`,
          };
        },
      );
      return reply.status(201).send({ ok: true, view });
    } catch (err) {
      return handleRouteError(reply, err, "Failed to create view");
    }
  });

  fastify.put<{
    Params: { id: string };
    Body: { name: string; selections: SelectedModes };
  }>("/previews/:id", async (request, reply) => {
    const { id } = request.params;
    const { name, selections } = request.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return reply.status(400).send({ error: "View name is required" });
    }
    if (!selections || typeof selections !== "object" || Array.isArray(selections)) {
      return reply.status(400).send({ error: "View selections are required" });
    }
    try {
      const view = await withCollectionStateMutation(
        "theme-view-update",
        async (state) => {
          const index = state.views.findIndex((item) => item.id === id);
          if (index === -1) {
            throw new NotFoundError(`View "${id}" not found`);
          }

          const nextView: ViewPreset = {
            id,
            name: name.trim(),
            selections: normalizeSelectedModes(
              state.collections,
              selections as SelectedModes,
            ),
          };
          const nextViews = state.views.slice();
          nextViews[index] = nextView;

          return {
            state: {
              ...state,
              views: nextViews,
            },
            result: nextView,
            description: `Update preview preset "${nextView.name}"`,
          };
        },
      );
      return { ok: true, view };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to update view");
    }
  });

  fastify.delete<{ Params: { id: string } }>(
    "/previews/:id",
    async (request, reply) => {
      const { id } = request.params;
      try {
        await withCollectionStateMutation(
          "theme-view-delete",
          async (state) => {
            const view = state.views.find((item) => item.id === id);
            if (!view) {
              throw new NotFoundError(`View "${id}" not found`);
            }

            return {
              state: {
                ...state,
                views: state.views.filter((item) => item.id !== id),
              },
              result: undefined,
              description: `Delete preview preset "${view.name}"`,
            };
          },
        );
        return { ok: true, id };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to delete view");
      }
    },
  );
};
