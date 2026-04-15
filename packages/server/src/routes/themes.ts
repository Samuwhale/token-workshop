import type { FastifyPluginAsync } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ActiveThemes,
  ThemeDimension,
  ThemeViewPreset,
  ThemesFile,
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

interface ThemeDocumentState {
  dimensions: ThemeDimension[];
  views: ThemeViewPreset[];
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

function normalizeThemeFile(data: ThemesFile | null | undefined): ThemeDocumentState {
  return {
    dimensions: Array.isArray(data?.$themes) ? data.$themes : [],
    views: Array.isArray(data?.$views) ? data.$views : [],
  };
}

function getDuplicateDimensionName(
  dimensions: ThemeDimension[],
  sourceName: string,
): string {
  let nextName = `${sourceName} Copy`;
  let counter = 2;
  while (
    dimensions.some(
      (dimension) => dimension.name.toLowerCase() === nextName.toLowerCase(),
    )
  ) {
    nextName = `${sourceName} Copy ${counter++}`;
  }
  return nextName;
}

function getDuplicateDimensionId(
  dimensions: ThemeDimension[],
  name: string,
): string {
  const baseId = slugifyName(name);
  let nextId = baseId;
  let counter = 2;
  while (dimensions.some((dimension) => dimension.id === nextId)) {
    nextId = `${baseId}-${counter++}`;
  }
  return nextId;
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

export interface DimensionsStore {
  filePath: string;
  load(): Promise<ThemeDimension[]>;
  loadViews(): Promise<ThemeViewPreset[]>;
  loadState(): Promise<ThemeDocumentState>;
  reloadFromDisk(): Promise<"changed" | "removed" | "unchanged">;
  save(dimensions: ThemeDimension[]): Promise<void>;
  saveViews(views: ThemeViewPreset[]): Promise<void>;
  saveState(state: ThemeDocumentState): Promise<void>;
  reset(): Promise<void>;
  startWriteGuard(absoluteFilePath: string): void;
  endWriteGuard(absoluteFilePath: string): void;
  consumeWriteGuard(absoluteFilePath: string): boolean;
  withLock<T>(
    fn: (
      dims: ThemeDimension[],
    ) => Promise<{ dims: ThemeDimension[]; result: T }>,
  ): Promise<T>;
  withStateLock<T>(
    fn: (
      state: ThemeDocumentState,
    ) => Promise<{ state: ThemeDocumentState; result: T }>,
  ): Promise<T>;
}

export function createDimensionsStore(tokenDir: string): DimensionsStore {
  const filePath = path.join(tokenDir, "$themes.json");
  let cache: ThemeDocumentState | null = null;
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
    state: ThemeDocumentState;
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
    const data = JSON.parse(content) as ThemesFile;
    return {
      state: normalizeThemeFile(data),
      mtimeMs,
      exists: true,
    };
  }

  async function ensureStateLoaded(): Promise<ThemeDocumentState> {
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

  const store: DimensionsStore = {
    filePath,

    async load(): Promise<ThemeDimension[]> {
      const state = await ensureStateLoaded();
      return state.dimensions;
    },

    async loadViews(): Promise<ThemeViewPreset[]> {
      const state = await ensureStateLoaded();
      return state.views;
    },

    async loadState(): Promise<ThemeDocumentState> {
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

    async save(dimensions: ThemeDimension[]): Promise<void> {
      const state = await ensureStateLoaded();
      await store.saveState({ ...state, dimensions });
    },

    async saveViews(views: ThemeViewPreset[]): Promise<void> {
      const state = await ensureStateLoaded();
      await store.saveState({ ...state, views });
    },

    async saveState(state: ThemeDocumentState): Promise<void> {
      const data: ThemesFile = {
        $themes: state.dimensions,
        ...(state.views.length > 0 ? { $views: state.views } : {}),
      };
      const tmp = `${filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      startWriteGuard(filePath);
      try {
        await fs.rename(tmp, filePath);
      } catch (err) {
        endWriteGuard(filePath);
        await fs.unlink(tmp).catch(() => {});
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
        dims: ThemeDimension[],
      ) => Promise<{ dims: ThemeDimension[]; result: T }>,
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
        state: ThemeDocumentState,
      ) => Promise<{ state: ThemeDocumentState; result: T }>,
    ): Promise<T> {
      return lock.withLock(async () => {
        const state = await store.loadState();
        const { state: updated, result } = await fn(state);
        await store.saveState(updated);
        return result;
      });
    },
  };

  return store;
}

export const themeRoutes: FastifyPluginAsync<{ tokenDir: string }> = async (
  fastify,
  _opts,
) => {
  const store = fastify.dimensionsStore;

  async function withThemeLock<T>(
    type: string,
    fn: (
      dims: ThemeDimension[],
    ) => Promise<{ dims: ThemeDimension[]; result: T; description: string }>,
  ): Promise<T> {
    let capturedBefore: ThemeDimension[] | null = null;
    let capturedDescription = "";
    const result = await store.withLock(async (dims) => {
      capturedBefore = structuredClone(dims);
      const out = await fn(dims);
      capturedDescription = out.description;
      return { dims: out.dims, result: out.result };
    });
    if (capturedBefore !== null) {
      await fastify.operationLog.record({
        type,
        description: capturedDescription,
        setName: "$themes",
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

  async function withThemeStateAndTokenMutations<T>(
    type: string,
    fn: (state: ThemeDocumentState) => Promise<{
      state: ThemeDocumentState;
      result: T;
      description: string;
      tokenPatchesBySet?: TokenPatchesBySet;
    }>,
  ): Promise<T> {
    const beforeSnapshot: Record<string, SnapshotEntry> = {};
    const afterSnapshot: Record<string, SnapshotEntry> = {};
    const touchedPathsBySet = new Map<string, string[]>();
    let beforeState: ThemeDocumentState | null = null;
    let description = "";

    try {
      const result = await fastify.tokenLock.withLock(async () =>
        store.withStateLock(async (state) => {
          beforeState = structuredClone(state);
          const out = await fn(state);
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
        const previousState = beforeState as ThemeDocumentState;
        await fastify.operationLog.record({
          type,
          description,
          setName: "$themes",
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

  fastify.get("/themes", async (_request, reply) => {
    try {
      const state = await store.loadState();
      return {
        dimensions: state.dimensions,
        views: state.views,
      };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to load themes");
    }
  });

  fastify.post<{ Body: { id: string; name: string } }>(
    "/themes/dimensions",
    async (request, reply) => {
      const { id, name } = request.body || {};
      if (!id || typeof id !== "string") {
        return reply.status(400).send({ error: "Dimension id is required" });
      }
      if (!/^[a-z0-9-]+$/.test(id)) {
        return reply.status(400).send({
          error:
            "Dimension id must contain only lowercase letters, numbers, and hyphens",
        });
      }
      if (!name || typeof name !== "string" || !name.trim()) {
        return reply.status(400).send({ error: "Dimension name is required" });
      }
      try {
        const dimension = await withThemeLock(
          "theme-dimension-create",
          async (dimensions) => {
            if (dimensions.some((dimension) => dimension.id === id)) {
              throw new ConflictError(
                `Dimension with id "${id}" already exists`,
              );
            }
            const dim: ThemeDimension = { id, name: name.trim(), options: [] };
            return {
              dims: [...dimensions, dim],
              result: dim,
              description: `Create theme dimension "${name.trim()}"`,
            };
          },
        );
        return reply.status(201).send({ ok: true, dimension });
      } catch (err) {
        return handleRouteError(reply, err, "Failed to create dimension");
      }
    },
  );

  fastify.put<{ Params: { id: string }; Body: { name: string } }>(
    "/themes/dimensions/:id",
    async (request, reply) => {
      const { id } = request.params;
      const { name } = request.body || {};
      if (!name || typeof name !== "string" || !name.trim()) {
        return reply.status(400).send({ error: "Dimension name is required" });
      }
      try {
        const dimension = await withThemeLock(
          "theme-dimension-rename",
          async (dimensions) => {
            const idx = dimensions.findIndex((dimension) => dimension.id === id);
            if (idx === -1) {
              throw new NotFoundError(`Dimension "${id}" not found`);
            }
            const oldName = dimensions[idx].name;
            const nextDimensions = structuredClone(dimensions);
            nextDimensions[idx] = {
              ...nextDimensions[idx],
              name: name.trim(),
            };
            return {
              dims: nextDimensions,
              result: nextDimensions[idx],
              description: `Rename dimension "${oldName}" → "${name.trim()}"`,
            };
          },
        );
        return { ok: true, dimension };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to rename dimension");
      }
    },
  );

  fastify.put<{ Body: { dimensionIds: string[] } }>(
    "/themes/dimensions-order",
    async (request, reply) => {
      const { dimensionIds } = request.body || {};
      if (
        !Array.isArray(dimensionIds) ||
        dimensionIds.some((id) => typeof id !== "string")
      ) {
        return reply.status(400).send({
          error: "dimensionIds must be an array of dimension id strings",
        });
      }
      try {
        const reordered = await withThemeLock(
          "theme-dimensions-reorder",
          async (dimensions) => {
            const byId = new Map(
              dimensions.map((dimension) => [dimension.id, dimension]),
            );
            for (const id of dimensionIds) {
              if (!byId.has(id)) {
                throw new BadRequestError(`Dimension "${id}" not found`);
              }
            }
            if (
              dimensionIds.length !== dimensions.length ||
              new Set(dimensionIds).size !== dimensions.length
            ) {
              throw new BadRequestError(
                "dimensionIds must list every dimension id exactly once",
              );
            }
            const newOrder = dimensionIds.map((id) => byId.get(id)!);
            return {
              dims: newOrder,
              result: newOrder,
              description: "Reorder theme dimensions",
            };
          },
        );
        return { ok: true, dimensions: reordered };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to reorder dimensions");
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/themes/dimensions/:id",
    async (request, reply) => {
      const { id } = request.params;
      try {
        await withThemeStateAndTokenMutations(
          "theme-dimension-delete",
          async (state) => {
            const dim = state.dimensions.find((dimension) => dimension.id === id);
            if (!dim) throw new NotFoundError(`Dimension "${id}" not found`);

            const tokenPatchesBySet = await collectModeMutationPatches((token) => {
              const nextModes = readTokenModes(token);
              if (!(id in nextModes)) return null;
              delete nextModes[id];
              return nextModes;
            });

            return {
              state: {
                dimensions: state.dimensions.filter(
                  (dimension) => dimension.id !== id,
                ),
                views: state.views.map((view) => {
                  const nextSelections = { ...view.selections };
                  delete nextSelections[id];
                  return {
                    ...view,
                    selections: nextSelections,
                  };
                }),
              },
              result: undefined,
              description: `Delete theme dimension "${dim.name}"`,
              tokenPatchesBySet,
            };
          },
        );
        return { ok: true, id };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to delete dimension");
      }
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/themes/dimensions/:id/duplicate",
    async (request, reply) => {
      const { id } = request.params;
      try {
        const dimension = await withThemeStateAndTokenMutations(
          "theme-dimension-duplicate",
          async (state) => {
            const source = state.dimensions.find((dimension) => dimension.id === id);
            if (!source) {
              throw new NotFoundError(`Dimension "${id}" not found`);
            }
            const name = getDuplicateDimensionName(state.dimensions, source.name);
            const duplicate: ThemeDimension = {
              id: getDuplicateDimensionId(state.dimensions, name),
              name,
              options: structuredClone(source.options),
            };

            const tokenPatchesBySet = await collectModeMutationPatches((token) => {
              const nextModes = readTokenModes(token);
              const sourceModes = nextModes[source.id];
              if (!sourceModes || Object.keys(sourceModes).length === 0) {
                return null;
              }

              nextModes[duplicate.id] = structuredClone(sourceModes);
              return nextModes;
            });

            return {
              state: {
                ...state,
                dimensions: [...state.dimensions, duplicate],
              },
              result: duplicate,
              description: `Duplicate theme dimension "${source.name}" → "${duplicate.name}"`,
              tokenPatchesBySet,
            };
          },
        );
        return reply.status(201).send({ ok: true, dimension });
      } catch (err) {
        return handleRouteError(reply, err, "Failed to duplicate dimension");
      }
    },
  );

  fastify.post<{ Params: { id: string }; Body: { name: string } }>(
    "/themes/dimensions/:id/options",
    async (request, reply) => {
      const { id } = request.params;
      const { name } = request.body || {};
      const bodyKeys = Object.keys(request.body ?? {});
      if (bodyKeys.some((key) => key !== "name")) {
        return reply.status(400).send({
          error: "Only the option name is supported when creating a theme option",
        });
      }
      if (!name || typeof name !== "string" || !name.trim()) {
        return reply.status(400).send({ error: "Option name is required" });
      }
      const trimmedName = name.trim();
      try {
        const { option, status } = await withThemeLock(
          "theme-option-upsert",
          async (dimensions) => {
            const dimIdx = dimensions.findIndex((dimension) => dimension.id === id);
            if (dimIdx === -1) {
              throw new NotFoundError(`Dimension "${id}" not found`);
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
              description: `${isUpdate ? "Update" : "Add"} option "${trimmedName}" in dimension "${dimension.name}"`,
            };
          },
        );
        return reply.status(status).send({ ok: true, option });
      } catch (err) {
        return handleRouteError(reply, err, "Failed to save option");
      }
    },
  );

  fastify.put<{
    Params: { id: string; optionName: string };
    Body: { name: string };
  }>("/themes/dimensions/:id/options/:optionName", async (request, reply) => {
    const { id, optionName } = request.params;
    const { name } = request.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return reply.status(400).send({ error: "New option name is required" });
    }
    const newName = name.trim();
    try {
      const option = await withThemeStateAndTokenMutations(
        "theme-option-rename",
        async (state) => {
          const nextDimensions = structuredClone(state.dimensions);
          const dimIdx = nextDimensions.findIndex((dimension) => dimension.id === id);
          if (dimIdx === -1) {
            throw new NotFoundError(`Dimension "${id}" not found`);
          }

          const dimension = nextDimensions[dimIdx];
          const optionIndex = dimension.options.findIndex(
            (option) => option.name === optionName,
          );
          if (optionIndex === -1) {
            throw new NotFoundError(
              `Option "${optionName}" not found in dimension "${id}"`,
            );
          }
          if (
            newName !== optionName &&
            dimension.options.some((option) => option.name === newName)
          ) {
            throw new ConflictError(
              `Option "${newName}" already exists in this dimension`,
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
                      `Token "${optionName}" already has authored data under "${newName}" in dimension "${id}"`,
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
            description: `Rename option "${optionName}" → "${newName}" in dimension "${dimension.name}"`,
            tokenPatchesBySet,
          };
        },
      );
      return { ok: true, option };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to rename option");
    }
  });

  fastify.put<{ Params: { id: string }; Body: { options: string[] } }>(
    "/themes/dimensions/:id/options-order",
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
        const dimension = await withThemeLock(
          "theme-option-reorder",
          async (dimensions) => {
            const dimIdx = dimensions.findIndex((dimension) => dimension.id === id);
            if (dimIdx === -1) {
              throw new NotFoundError(`Dimension "${id}" not found`);
            }
            const nextDimensions = structuredClone(dimensions);
            const dimension = nextDimensions[dimIdx];
            const byName = new Map(
              dimension.options.map((option) => [option.name, option]),
            );
            for (const optionName of options) {
              if (!byName.has(optionName)) {
                throw new BadRequestError(
                  `Option "${optionName}" not found in dimension "${id}"`,
                );
              }
            }
            if (
              options.length !== dimension.options.length ||
              new Set(options).size !== dimension.options.length
            ) {
              throw new BadRequestError(
                "options must list every option name exactly once",
              );
            }
            dimension.options = options.map((optionName) => byName.get(optionName)!);
            return {
              dims: nextDimensions,
              result: dimension,
              description: `Reorder options in dimension "${dimension.name}"`,
            };
          },
        );
        return { ok: true, dimension };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to reorder options");
      }
    },
  );

  fastify.delete<{ Params: { id: string; optionName: string } }>(
    "/themes/dimensions/:id/options/:optionName",
    async (request, reply) => {
      const { id, optionName } = request.params;
      try {
        await withThemeStateAndTokenMutations(
          "theme-option-delete",
          async (state) => {
            const nextDimensions = structuredClone(state.dimensions);
            const dimIdx = nextDimensions.findIndex((dimension) => dimension.id === id);
            if (dimIdx === -1) {
              throw new NotFoundError(`Dimension "${id}" not found`);
            }

            const dimension = nextDimensions[dimIdx];
            const filteredOptions = dimension.options.filter(
              (option) => option.name !== optionName,
            );
            if (filteredOptions.length === dimension.options.length) {
              throw new NotFoundError(
                `Option "${optionName}" not found in dimension "${id}"`,
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
              description: `Delete option "${optionName}" from dimension "${dimension.name}"`,
              tokenPatchesBySet,
            };
          },
        );
        return { ok: true, id, optionName };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to delete option");
      }
    },
  );

  fastify.post<{
    Body: { id: string; name: string; selections: ActiveThemes };
  }>("/themes/views", async (request, reply) => {
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
      const view = await store.withStateLock(async (state) => {
        if (state.views.some((item) => item.id === normalizedId)) {
          throw new ConflictError(`View "${normalizedId}" already exists`);
        }
        const nextView: ThemeViewPreset = {
          id: normalizedId,
          name: name.trim(),
          selections: selections as ActiveThemes,
        };
        return {
          state: {
            ...state,
            views: [...state.views, nextView],
          },
          result: nextView,
        };
      });
      return reply.status(201).send({ ok: true, view });
    } catch (err) {
      return handleRouteError(reply, err, "Failed to create view");
    }
  });

  fastify.put<{
    Params: { id: string };
    Body: { name: string; selections: ActiveThemes };
  }>("/themes/views/:id", async (request, reply) => {
    const { id } = request.params;
    const { name, selections } = request.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return reply.status(400).send({ error: "View name is required" });
    }
    if (!selections || typeof selections !== "object" || Array.isArray(selections)) {
      return reply.status(400).send({ error: "View selections are required" });
    }
    try {
      const view = await store.withStateLock(async (state) => {
        const index = state.views.findIndex((item) => item.id === id);
        if (index === -1) {
          throw new NotFoundError(`View "${id}" not found`);
        }
        const nextView: ThemeViewPreset = {
          id,
          name: name.trim(),
          selections: selections as ActiveThemes,
        };
        const nextViews = state.views.slice();
        nextViews[index] = nextView;
        return {
          state: {
            ...state,
            views: nextViews,
          },
          result: nextView,
        };
      });
      return { ok: true, view };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to update view");
    }
  });

  fastify.delete<{ Params: { id: string } }>(
    "/themes/views/:id",
    async (request, reply) => {
      const { id } = request.params;
      try {
        await store.withStateLock(async (state) => {
          const nextViews = state.views.filter((item) => item.id !== id);
          if (nextViews.length === state.views.length) {
            throw new NotFoundError(`View "${id}" not found`);
          }
          return {
            state: {
              ...state,
              views: nextViews,
            },
            result: undefined,
          };
        });
        return { ok: true, id };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to delete view");
      }
    },
  );
};
