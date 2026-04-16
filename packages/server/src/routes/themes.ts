import type { FastifyPluginAsync } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ActiveModeSelections,
  CollectionDefinition,
  ViewPreset,
  CollectionsFile,
  Token,
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

interface CollectionDocumentState {
  dimensions: CollectionDefinition[];
  views: ViewPreset[];
}

type TokenModeMap = Record<string, Record<string, unknown>>;
type TokenPatch = { path: string; patch: Partial<Token> };
type TokenPatchesBySet = Map<string, TokenPatch[]>;

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeModeOption(
  value: unknown,
): CollectionDefinition["options"][number] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const name =
    "name" in value && typeof value.name === "string"
      ? value.name.trim()
      : "";
  if (!name) {
    return null;
  }

  return { name };
}

function normalizeCollectionDefinition(
  value: unknown,
): CollectionDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const id = "id" in value && typeof value.id === "string" ? value.id.trim() : "";
  const name =
    "name" in value && typeof value.name === "string"
      ? value.name.trim()
      : "";
  if (!id || !name) {
    return null;
  }

  const rawOptions = "options" in value ? value.options : [];
  const options = Array.isArray(rawOptions)
    ? rawOptions
        .map((option) => normalizeModeOption(option))
        .filter((option): option is CollectionDefinition["options"][number] => option !== null)
    : [];

  return { id, name, options };
}

function normalizeViewPreset(
  value: unknown,
): ViewPreset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const id = "id" in value && typeof value.id === "string" ? value.id.trim() : "";
  const name =
    "name" in value && typeof value.name === "string"
      ? value.name.trim()
      : "";
  if (!id || !name) {
    return null;
  }

  const rawSelections = "selections" in value ? value.selections : null;
  if (
    !rawSelections ||
    typeof rawSelections !== "object" ||
    Array.isArray(rawSelections)
  ) {
    return null;
  }

  const selections = Object.fromEntries(
    Object.entries(rawSelections).filter(
      ([dimensionId, optionName]) =>
        dimensionId.trim().length > 0 && typeof optionName === "string",
    ),
  );

  return { id, name, selections };
}

function normalizeCollectionsFile(data: CollectionsFile | null | undefined): CollectionDocumentState {
  const rawCollections = (data as Record<string, unknown> | null | undefined);
  const collections = Array.isArray(rawCollections?.$collections)
    ? rawCollections.$collections
    : Array.isArray((rawCollections as Record<string, unknown> | null | undefined)?.$themes)
      ? (rawCollections as Record<string, unknown>).$themes
      : undefined;
  return {
    dimensions: Array.isArray(collections)
      ? (collections as unknown[])
          .map((dimension) => normalizeCollectionDefinition(dimension))
          .filter((dimension): dimension is CollectionDefinition => dimension !== null)
      : [],
    views: Array.isArray(data?.$views)
      ? data.$views
          .map((view) => normalizeViewPreset(view))
          .filter((view): view is ViewPreset => view !== null)
      : [],
  };
}

function readTokenModes(token: Token): TokenModeMap {
  const rawModes = (
    token.$extensions?.tokenmanager as Record<string, unknown> | undefined
  )?.modes;
  if (!rawModes || typeof rawModes !== "object" || Array.isArray(rawModes)) {
    return {};
  }

  const modes: TokenModeMap = {};
  for (const [dimensionId, optionMap] of Object.entries(rawModes)) {
    if (!optionMap || typeof optionMap !== "object" || Array.isArray(optionMap)) {
      continue;
    }
    modes[dimensionId] = { ...(optionMap as Record<string, unknown>) };
  }
  return modes;
}

function buildExtensionsWithModes(
  token: Token,
  nextModes: TokenModeMap,
): Token["$extensions"] | undefined {
  const nextExtensions = token.$extensions
    ? structuredClone(token.$extensions)
    : {};
  const existingTokenManager =
    nextExtensions.tokenmanager &&
    typeof nextExtensions.tokenmanager === "object" &&
    !Array.isArray(nextExtensions.tokenmanager)
      ? { ...(nextExtensions.tokenmanager as Record<string, unknown>) }
      : {};

  if (Object.keys(nextModes).length > 0) {
    existingTokenManager.modes = nextModes;
    nextExtensions.tokenmanager = existingTokenManager;
  } else if (Object.keys(existingTokenManager).length > 0) {
    delete existingTokenManager.modes;
    if (Object.keys(existingTokenManager).length > 0) {
      nextExtensions.tokenmanager = existingTokenManager;
    } else {
      delete nextExtensions.tokenmanager;
    }
  } else {
    delete nextExtensions.tokenmanager;
  }

  return Object.keys(nextExtensions).length > 0 ? nextExtensions : undefined;
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
  load(): Promise<CollectionDefinition[]>;
  loadViews(): Promise<ViewPreset[]>;
  loadState(): Promise<CollectionDocumentState>;
  reloadFromDisk(): Promise<"changed" | "removed" | "unchanged">;
  save(dimensions: CollectionDefinition[]): Promise<void>;
  saveViews(views: ViewPreset[]): Promise<void>;
  saveState(state: CollectionDocumentState): Promise<void>;
  reset(): Promise<void>;
  startWriteGuard(absoluteFilePath: string): void;
  endWriteGuard(absoluteFilePath: string): void;
  consumeWriteGuard(absoluteFilePath: string): boolean;
  withLock<T>(
    fn: (
      dims: CollectionDefinition[],
    ) => Promise<{ dims: CollectionDefinition[]; result: T }>,
  ): Promise<T>;
  withStateLock<T>(
    fn: (
      state: CollectionDocumentState,
    ) => Promise<{ state: CollectionDocumentState; result: T }>,
  ): Promise<T>;
  withReadStateLock<T>(
    fn: (state: CollectionDocumentState) => Promise<T>,
  ): Promise<T>;
}

export function createCollectionsStore(tokenDir: string): CollectionsStore {
  const filePath = path.join(tokenDir, "$collections.json");
  let cache: CollectionDocumentState | null = null;
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
    state: CollectionDocumentState;
    mtimeMs: number | null;
    exists: boolean;
  }> {
    const mtimeMs = await fileMtimeMs();
    if (mtimeMs === null) {
      return {
        state: { dimensions: [], views: [] },
        mtimeMs: null,
        exists: false,
      };
    }

    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content) as CollectionsFile;
    return {
      state: normalizeCollectionsFile(data),
      mtimeMs,
      exists: true,
    };
  }

  async function ensureStateLoaded(): Promise<CollectionDocumentState> {
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
        cache = { dimensions: [], views: [] };
        cachedMtimeMs = null;
      }
    }

    return structuredClone(cache);
  }

  const store: CollectionsStore = {
    filePath,

    async load(): Promise<CollectionDefinition[]> {
      const state = await ensureStateLoaded();
      return state.dimensions;
    },

    async loadViews(): Promise<ViewPreset[]> {
      const state = await ensureStateLoaded();
      return state.views;
    },

    async loadState(): Promise<CollectionDocumentState> {
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
            (cache.dimensions.length > 0 ||
              cache.views.length > 0 ||
              cachedMtimeMs !== null);
          cache = { dimensions: [], views: [] };
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

    async save(dimensions: CollectionDefinition[]): Promise<void> {
      const state = await ensureStateLoaded();
      await store.saveState({ ...state, dimensions });
    },

    async saveViews(views: ViewPreset[]): Promise<void> {
      const state = await ensureStateLoaded();
      await store.saveState({ ...state, views });
    },

    async saveState(state: CollectionDocumentState): Promise<void> {
      if (JSON.stringify(cache) === JSON.stringify(state)) {
        return;
      }
      const data: CollectionsFile = {
        $collections: state.dimensions,
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
        cache = { dimensions: [], views: [] };
        cachedMtimeMs = null;
      });
    },

    startWriteGuard,
    endWriteGuard,
    consumeWriteGuard,

    withLock<T>(
      fn: (
        dims: CollectionDefinition[],
      ) => Promise<{ dims: CollectionDefinition[]; result: T }>,
    ): Promise<T> {
      return lock.withLock(async () => {
        const dims = await store.load();
        const { dims: updated, result } = await fn(dims);
        await store.save(updated);
        return result;
      });
    },

    withStateLock<T>(
      fn: (
        state: CollectionDocumentState,
      ) => Promise<{ state: CollectionDocumentState; result: T }>,
    ): Promise<T> {
      return lock.withLock(async () => {
        const state = await store.loadState();
        const { state: updated, result } = await fn(state);
        await store.saveState(updated);
        return result;
      });
    },

    withReadStateLock<T>(fn: (state: CollectionDocumentState) => Promise<T>): Promise<T> {
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

  async function normalizeCollectionState(
    state: CollectionDocumentState,
  ): Promise<CollectionDocumentState> {
    const setNames = await fastify.tokenStore.getSets();
    const existingById = new Map(
      state.dimensions.map((dimension) => [dimension.id, dimension]),
    );

    const dimensions = setNames.map((setName) => {
      const existing = existingById.get(setName);
      return {
        id: setName,
        name: setName,
        options: structuredClone(existing?.options ?? []),
      };
    });

    const validOptionsById = new Map(
      dimensions.map((dimension) => [
        dimension.id,
        new Set(dimension.options.map((option) => option.name)),
      ]),
    );

    const views = state.views.map((view) => ({
      ...view,
      selections: Object.fromEntries(
        Object.entries(view.selections).filter(([collectionId, optionName]) => {
          const validOptions = validOptionsById.get(collectionId);
          return validOptions?.has(optionName) ?? false;
        }),
      ),
    }));

    return { dimensions, views };
  }

  function normalizeSelectionsForDimensions(
    dimensions: CollectionDefinition[],
    selections: ActiveModeSelections,
  ): ActiveModeSelections {
    const next: ActiveModeSelections = {};

    for (const dimension of dimensions) {
      const selectedOption = selections[dimension.id];
      if (
        selectedOption &&
        dimension.options.some((option) => option.name === selectedOption)
      ) {
        next[dimension.id] = selectedOption;
      }
    }

    return next;
  }

  async function withCollectionLock<T>(
    type: string,
    fn: (
      dims: CollectionDefinition[],
    ) => Promise<{ dims: CollectionDefinition[]; result: T; description: string }>,
  ): Promise<T> {
    let capturedBefore: CollectionDefinition[] | null = null;
    let capturedDescription = "";
    const result = await store.withLock(async (dims) => {
      const normalizedState = await normalizeCollectionState({
        dimensions: dims,
        views: [],
      });
      capturedBefore = structuredClone(normalizedState.dimensions);
      const out = await fn(normalizedState.dimensions);
      capturedDescription = out.description;
      return { dims: out.dims, result: out.result };
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

        const nextExtensions = buildExtensionsWithModes(token, nextModes);
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
    fn: (state: CollectionDocumentState) => Promise<{
      state: CollectionDocumentState;
      result: T;
      description: string;
      tokenPatchesBySet?: TokenPatchesBySet;
    }>,
  ): Promise<T> {
    const beforeSnapshot: Record<string, SnapshotEntry> = {};
    const afterSnapshot: Record<string, SnapshotEntry> = {};
    const touchedPathsBySet = new Map<string, string[]>();
    let beforeState: CollectionDocumentState | null = null;
    let description = "";

    try {
      const result = await fastify.tokenLock.withLock(async () =>
        store.withStateLock(async (state) => {
          const normalizedState = await normalizeCollectionState(state);
          beforeState = structuredClone(normalizedState);
          const out = await fn(normalizedState);
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

          return { state: out.state, result: out.result };
        }),
      );

      if (beforeState !== null) {
        const previousState = beforeState as CollectionDocumentState;
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
              dimensions: previousState.dimensions,
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
    fn: (state: CollectionDocumentState) => Promise<{
      state: CollectionDocumentState;
      result: T;
      description: string;
    }>,
  ): Promise<T> {
    let beforeState: CollectionDocumentState | null = null;
    let description = "";

    const result = await store.withStateLock(async (state) => {
      const normalizedState = await normalizeCollectionState(state);
      beforeState = structuredClone(normalizedState);
      const out = await fn(normalizedState);
      description = out.description;
      return { state: out.state, result: out.result };
    });

    const previousState = beforeState as CollectionDocumentState | null;
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
          dimensions: previousState.dimensions,
          views: previousState.views,
        },
      ],
    });

    return result;
  }

  await store.withStateLock(async (state) => ({
    state: await normalizeCollectionState(state),
    result: undefined,
  }));

  fastify.get("/collections", async (_request, reply) => {
    try {
      const state = await normalizeCollectionState(await store.loadState());
      return {
        collections: state.dimensions,
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
          async (dimensions) => {
            const dimIdx = dimensions.findIndex((dimension) => dimension.id === id);
            if (dimIdx === -1) {
              throw new NotFoundError(`Collection "${id}" not found`);
            }
            const nextDimensions = structuredClone(dimensions);
            const dimension = nextDimensions[dimIdx];
            const optIdx = dimension.options.findIndex(
              (option) => option.name === trimmedName,
            );
            const option = { name: trimmedName };
            const isUpdate = optIdx >= 0;
            if (isUpdate) {
              dimension.options[optIdx] = option;
            } else {
              dimension.options.push(option);
            }
            return {
              dims: nextDimensions,
              result: { option, status: isUpdate ? 200 : 201 },
              description: `${isUpdate ? "Update" : "Add"} mode "${trimmedName}" in collection "${dimension.name}"`,
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
          const nextDimensions = structuredClone(state.dimensions);
          const dimIdx = nextDimensions.findIndex((dimension) => dimension.id === id);
          if (dimIdx === -1) {
            throw new NotFoundError(`Collection "${id}" not found`);
          }

          const dimension = nextDimensions[dimIdx];
          const optionIndex = dimension.options.findIndex(
            (option) => option.name === optionName,
          );
          if (optionIndex === -1) {
            throw new NotFoundError(
              `Mode "${optionName}" not found in collection "${id}"`,
            );
          }
          if (
            newName !== optionName &&
            dimension.options.some((option) => option.name === newName)
          ) {
            throw new ConflictError(
              `Mode "${newName}" already exists in this collection`,
            );
          }

          const tokenPatchesBySet =
            newName === optionName
              ? undefined
              : await collectModeMutationPatches((token) => {
                  const nextModes = readTokenModes(token);
                  const dimModes = nextModes[id];
                  if (!dimModes || !(optionName in dimModes)) {
                    return null;
                  }

                  if (
                    newName in dimModes &&
                    JSON.stringify(dimModes[newName]) !==
                      JSON.stringify(dimModes[optionName])
                  ) {
                    throw new ConflictError(
                      `Token-authored mode data already exists under "${newName}" in collection "${id}"`,
                    );
                  }

                  dimModes[newName] = dimModes[optionName];
                  delete dimModes[optionName];
                  return nextModes;
                });

          dimension.options[optionIndex] = { name: newName };

          return {
            state: {
              dimensions: nextDimensions,
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
            result: dimension.options[optionIndex],
            description: `Rename mode "${optionName}" → "${newName}" in collection "${dimension.name}"`,
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
        const dimension = await withCollectionLock(
          "theme-option-reorder",
          async (dimensions) => {
            const dimIdx = dimensions.findIndex((dimension) => dimension.id === id);
            if (dimIdx === -1) {
              throw new NotFoundError(`Collection "${id}" not found`);
            }
            const nextDimensions = structuredClone(dimensions);
            const dimension = nextDimensions[dimIdx];
            const byName = new Map(
              dimension.options.map((option) => [option.name, option]),
            );
            for (const optionName of options) {
              if (!byName.has(optionName)) {
                throw new BadRequestError(
                  `Mode "${optionName}" not found in collection "${id}"`,
                );
              }
            }
            if (
              options.length !== dimension.options.length ||
              new Set(options).size !== dimension.options.length
            ) {
              throw new BadRequestError(
                "options must list every mode name exactly once",
              );
            }
            dimension.options = options.map((optionName) => byName.get(optionName)!);
            return {
              dims: nextDimensions,
              result: dimension,
              description: `Reorder modes in collection "${dimension.name}"`,
            };
          },
        );
        return { ok: true, dimension };
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
            const nextDimensions = structuredClone(state.dimensions);
            const dimIdx = nextDimensions.findIndex((dimension) => dimension.id === id);
            if (dimIdx === -1) {
              throw new NotFoundError(`Collection "${id}" not found`);
            }

            const dimension = nextDimensions[dimIdx];
            const filteredOptions = dimension.options.filter(
              (option) => option.name !== optionName,
            );
            if (filteredOptions.length === dimension.options.length) {
              throw new NotFoundError(
                `Mode "${optionName}" not found in collection "${id}"`,
              );
            }

            const tokenPatchesBySet = await collectModeMutationPatches((token) => {
              const nextModes = readTokenModes(token);
              const dimModes = nextModes[id];
              if (!dimModes || !(optionName in dimModes)) {
                return null;
              }

              delete dimModes[optionName];
              if (Object.keys(dimModes).length === 0) {
                delete nextModes[id];
              }
              return nextModes;
            });

            dimension.options = filteredOptions;

            return {
              state: {
                dimensions: nextDimensions,
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
              description: `Delete mode "${optionName}" from collection "${dimension.name}"`,
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
    Body: { id: string; name: string; selections: ActiveModeSelections };
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
            selections: normalizeSelectionsForDimensions(
              state.dimensions,
              selections as ActiveModeSelections,
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
    Body: { name: string; selections: ActiveModeSelections };
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
            selections: normalizeSelectionsForDimensions(
              state.dimensions,
              selections as ActiveModeSelections,
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
