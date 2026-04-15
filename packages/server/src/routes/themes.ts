import type { FastifyPluginAsync } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ActiveThemes,
  ThemeDimension,
  ThemeViewPreset,
  ThemesFile,
} from "@tokenmanager/core";
import {
  handleRouteError,
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../errors.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";

interface ThemeDocumentState {
  dimensions: ThemeDimension[];
  views: ThemeViewPreset[];
}

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
        await withThemeLock("theme-dimension-delete", async (dimensions) => {
          const dim = dimensions.find((dimension) => dimension.id === id);
          if (!dim) throw new NotFoundError(`Dimension "${id}" not found`);
          return {
            dims: dimensions.filter((dimension) => dimension.id !== id),
            result: undefined,
            description: `Delete theme dimension "${dim.name}"`,
          };
        });
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
        const dimension = await withThemeLock(
          "theme-dimension-duplicate",
          async (dimensions) => {
            const source = dimensions.find((dimension) => dimension.id === id);
            if (!source) {
              throw new NotFoundError(`Dimension "${id}" not found`);
            }
            const name = getDuplicateDimensionName(dimensions, source.name);
            const duplicate: ThemeDimension = {
              id: getDuplicateDimensionId(dimensions, name),
              name,
              options: structuredClone(source.options),
            };
            return {
              dims: [...dimensions, duplicate],
              result: duplicate,
              description: `Duplicate theme dimension "${source.name}" → "${duplicate.name}"`,
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
      const option = await withThemeLock(
        "theme-option-rename",
        async (dimensions) => {
          const dimIdx = dimensions.findIndex((dimension) => dimension.id === id);
          if (dimIdx === -1) {
            throw new NotFoundError(`Dimension "${id}" not found`);
          }
          const nextDimensions = structuredClone(dimensions);
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
          dimension.options[optionIndex] = {
            name: newName,
          };
          return {
            dims: nextDimensions,
            result: dimension.options[optionIndex],
            description: `Rename option "${optionName}" → "${newName}" in dimension "${dimension.name}"`,
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
        await withThemeLock("theme-option-delete", async (dimensions) => {
          const dimIdx = dimensions.findIndex((dimension) => dimension.id === id);
          if (dimIdx === -1) {
            throw new NotFoundError(`Dimension "${id}" not found`);
          }
          const nextDimensions = structuredClone(dimensions);
          const dimension = nextDimensions[dimIdx];
          const filteredOptions = dimension.options.filter(
            (option) => option.name !== optionName,
          );
          if (filteredOptions.length === dimension.options.length) {
            throw new NotFoundError(
              `Option "${optionName}" not found in dimension "${id}"`,
            );
          }
          dimension.options = filteredOptions;
          return {
            dims: nextDimensions,
            result: undefined,
            description: `Delete option "${optionName}" from dimension "${dimension.name}"`,
          };
        });
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
