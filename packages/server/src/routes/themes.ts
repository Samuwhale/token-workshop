import type { FastifyPluginAsync } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ThemeDimension,
  ThemesFile,
  ThemeSetStatus,
} from "@tokenmanager/core";
import {
  handleRouteError,
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../errors.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";

const VALID_THEME_SET_STATUSES = new Set<string>([
  "enabled",
  "disabled",
  "source",
]);

function slugifyDimensionId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  const baseId = slugifyDimensionId(name);
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
  reloadFromDisk(): Promise<"changed" | "removed" | "unchanged">;
  save(dimensions: ThemeDimension[]): Promise<void>;
  reset(): Promise<void>;
  startWriteGuard(absoluteFilePath: string): void;
  endWriteGuard(absoluteFilePath: string): void;
  consumeWriteGuard(absoluteFilePath: string): boolean;
  /** Run an exclusive load-modify-save transaction. Prevents concurrent mutations from racing. */
  withLock<T>(
    fn: (
      dims: ThemeDimension[],
    ) => Promise<{ dims: ThemeDimension[]; result: T }>,
  ): Promise<T>;
}

export function createDimensionsStore(tokenDir: string): DimensionsStore {
  const filePath = path.join(tokenDir, "$themes.json");
  let cache: ThemeDimension[] | null = null;
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

  async function loadDimensionsFromDisk(): Promise<{
    dimensions: ThemeDimension[];
    mtimeMs: number | null;
    exists: boolean;
  }> {
    const mtimeMs = await fileMtimeMs();
    if (mtimeMs === null) {
      return { dimensions: [], mtimeMs: null, exists: false };
    }

    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content) as ThemesFile;
    if (!Array.isArray(data.$themes)) {
      throw new Error('Invalid themes file: expected { "$themes": [] }');
    }

    return {
      dimensions: data.$themes,
      mtimeMs,
      exists: true,
    };
  }

  const store: DimensionsStore = {
    filePath,

    async load(): Promise<ThemeDimension[]> {
      const mtimeMs = await fileMtimeMs();
      if (cache !== null && mtimeMs === cachedMtimeMs) {
        return structuredClone(cache);
      }

      try {
        const { dimensions, exists } = await loadDimensionsFromDisk();
        cache = structuredClone(dimensions);
        cachedMtimeMs = exists ? mtimeMs : null;
      } catch {
        if (cache === null) {
          cache = [];
          cachedMtimeMs = null;
        }
      }
      return structuredClone(cache);
    },

    reloadFromDisk(): Promise<"changed" | "removed" | "unchanged"> {
      return lock.withLock(async () => {
        const previousMtimeMs = cachedMtimeMs;
        const previousSerialized =
          cache === null ? null : JSON.stringify(cache);
        const { dimensions, mtimeMs, exists } = await loadDimensionsFromDisk();

        if (!exists) {
          const hadData =
            cache !== null && (cache.length > 0 || cachedMtimeMs !== null);
          cache = [];
          cachedMtimeMs = null;
          return hadData ? "removed" : "unchanged";
        }

        if (cache !== null && mtimeMs === previousMtimeMs) {
          return "unchanged";
        }

        const nextSerialized = JSON.stringify(dimensions);
        cache = structuredClone(dimensions);
        cachedMtimeMs = mtimeMs;
        return previousSerialized === nextSerialized ? "unchanged" : "changed";
      });
    },

    async save(dimensions: ThemeDimension[]): Promise<void> {
      const data: ThemesFile = { $themes: dimensions };
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
      cache = structuredClone(dimensions);
      cachedMtimeMs = await fileMtimeMs();
    },

    reset(): Promise<void> {
      return lock.withLock(async () => {
        startWriteGuard(filePath);
        await fs.rm(filePath, { force: true });
        cache = [];
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
  };

  return store;
}

function validateSets(sets: Record<string, unknown>): string | null {
  const invalid = Object.entries(sets).filter(
    ([, v]) => !VALID_THEME_SET_STATUSES.has(v as string),
  );
  if (invalid.length > 0) {
    return `Invalid set status values: ${invalid.map(([k, v]) => `"${k}": "${v}"`).join(", ")}. Must be "enabled", "disabled", or "source".`;
  }
  return null;
}

export const themeRoutes: FastifyPluginAsync<{ tokenDir: string }> = async (
  fastify,
  _opts,
) => {
  const store = fastify.dimensionsStore;

  /**
   * Wrapper around store.withLock that also records an operation log entry.
   * The callback receives current dimensions and must return { dims, result, description }.
   * `beforeDims` is captured automatically before the callback mutates.
   */
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

  // GET /api/themes — list dimensions
  fastify.get("/themes", async (_request, reply) => {
    try {
      const dimensions = await store.load();
      return { dimensions };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to load themes");
    }
  });

  // POST /api/themes/dimensions — create a new dimension
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
            if (dimensions.some((d) => d.id === id)) {
              throw new ConflictError(
                `Dimension with id "${id}" already exists`,
              );
            }
            const dim: ThemeDimension = { id, name: name.trim(), options: [] };
            dimensions.push(dim);
            return {
              dims: dimensions,
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

  // PUT /api/themes/dimensions/:id — rename a dimension
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
            const idx = dimensions.findIndex((d) => d.id === id);
            if (idx === -1) {
              throw new NotFoundError(`Dimension "${id}" not found`);
            }
            const oldName = dimensions[idx].name;
            dimensions[idx] = { ...dimensions[idx], name: name.trim() };
            return {
              dims: dimensions,
              result: dimensions[idx],
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

  // PUT /api/themes/dimensions-order — reorder dimensions
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
            const byId = new Map(dimensions.map((d) => [d.id, d]));
            for (const id of dimensionIds) {
              if (!byId.has(id)) {
                throw new BadRequestError(`Dimension "${id}" not found`);
              }
            }
            if (
              dimensionIds.length !== dimensions.length ||
              new Set(dimensionIds).size !== dimensionIds.length
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

  // DELETE /api/themes/dimensions/:id — delete a dimension
  fastify.delete<{ Params: { id: string } }>(
    "/themes/dimensions/:id",
    async (request, reply) => {
      const { id } = request.params;
      try {
        await withThemeLock("theme-dimension-delete", async (dimensions) => {
          const dim = dimensions.find((d) => d.id === id);
          if (!dim) {
            throw new NotFoundError(`Dimension "${id}" not found`);
          }
          const filtered = dimensions.filter((d) => d.id !== id);
          return {
            dims: filtered,
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

  // POST /api/themes/dimensions/:id/duplicate — duplicate a dimension and all of its options atomically
  fastify.post<{ Params: { id: string } }>(
    "/themes/dimensions/:id/duplicate",
    async (request, reply) => {
      const { id } = request.params;
      try {
        const dimension = await withThemeLock(
          "theme-dimension-duplicate",
          async (dimensions) => {
            const source = dimensions.find((entry) => entry.id === id);
            if (!source) {
              throw new NotFoundError(`Dimension "${id}" not found`);
            }

            const name = getDuplicateDimensionName(dimensions, source.name);
            const duplicate: ThemeDimension = {
              id: getDuplicateDimensionId(dimensions, name),
              name,
              options: structuredClone(source.options),
            };
            dimensions.push(duplicate);

            return {
              dims: dimensions,
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

  // POST /api/themes/dimensions/:id/options — add or update an option
  fastify.post<{
    Params: { id: string };
    Body: { name: string; sets: Record<string, ThemeSetStatus> };
  }>("/themes/dimensions/:id/options", async (request, reply) => {
    const { id } = request.params;
    const { name, sets } = request.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return reply.status(400).send({ error: "Option name is required" });
    }
    const trimmedName = name.trim();
    if (!sets || typeof sets !== "object") {
      return reply
        .status(400)
        .send({ error: "Option must have a sets object" });
    }
    const setsError = validateSets(sets);
    if (setsError) return reply.status(400).send({ error: setsError });

    try {
      const { option, status } = await withThemeLock(
        "theme-option-upsert",
        async (dimensions) => {
          const dimIdx = dimensions.findIndex((d) => d.id === id);
          if (dimIdx === -1) {
            throw new NotFoundError(`Dimension "${id}" not found`);
          }
          const dim = dimensions[dimIdx];
          const optIdx = dim.options.findIndex((o) => o.name === trimmedName);
          const opt = { name: trimmedName, sets };
          const isUpdate = optIdx >= 0;
          if (isUpdate) {
            dim.options[optIdx] = opt;
          } else {
            dim.options.push(opt);
          }
          return {
            dims: dimensions,
            result: { option: opt, status: isUpdate ? 200 : 201 },
            description: `${isUpdate ? "Update" : "Add"} option "${trimmedName}" in dimension "${dim.name}"`,
          };
        },
      );
      return reply.status(status).send({ ok: true, option });
    } catch (err) {
      return handleRouteError(reply, err, "Failed to save option");
    }
  });

  // PUT /api/themes/dimensions/:id/options/:optionName — rename an option
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
          const dimIdx = dimensions.findIndex((d) => d.id === id);
          if (dimIdx === -1) {
            throw new NotFoundError(`Dimension "${id}" not found`);
          }
          const dim = dimensions[dimIdx];
          const optIdx = dim.options.findIndex((o) => o.name === optionName);
          if (optIdx === -1) {
            throw new NotFoundError(
              `Option "${optionName}" not found in dimension "${id}"`,
            );
          }
          if (
            newName !== optionName &&
            dim.options.some((o) => o.name === newName)
          ) {
            throw new ConflictError(
              `Option "${newName}" already exists in this dimension`,
            );
          }
          dim.options[optIdx] = { ...dim.options[optIdx], name: newName };
          return {
            dims: dimensions,
            result: dim.options[optIdx],
            description: `Rename option "${optionName}" → "${newName}" in dimension "${dim.name}"`,
          };
        },
      );
      return { ok: true, option };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to rename option");
    }
  });

  // PUT /api/themes/dimensions/:id/options-order — reorder options within a dimension
  fastify.put<{ Params: { id: string }; Body: { options: string[] } }>(
    "/themes/dimensions/:id/options-order",
    async (request, reply) => {
      const { id } = request.params;
      const { options } = request.body || {};
      if (
        !Array.isArray(options) ||
        options.some((o) => typeof o !== "string")
      ) {
        return reply
          .status(400)
          .send({ error: "options must be an array of option name strings" });
      }
      try {
        const dimension = await withThemeLock(
          "theme-option-reorder",
          async (dimensions) => {
            const dimIdx = dimensions.findIndex((d) => d.id === id);
            if (dimIdx === -1) {
              throw new NotFoundError(`Dimension "${id}" not found`);
            }
            const dim = dimensions[dimIdx];
            const byName = new Map(dim.options.map((o) => [o.name, o]));
            for (const name of options) {
              if (!byName.has(name)) {
                throw new BadRequestError(
                  `Option "${name}" not found in dimension "${id}"`,
                );
              }
            }
            if (
              options.length !== dim.options.length ||
              new Set(options).size !== options.length
            ) {
              throw new BadRequestError(
                "options must list every option name exactly once",
              );
            }
            dimensions[dimIdx] = {
              ...dim,
              options: options.map((n) => byName.get(n)!),
            };
            return {
              dims: dimensions,
              result: dimensions[dimIdx],
              description: `Reorder options in dimension "${dim.name}"`,
            };
          },
        );
        return { ok: true, dimension };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to reorder options");
      }
    },
  );

  // DELETE /api/themes/dimensions/:id/options/:optionName — remove an option
  fastify.delete<{ Params: { id: string; optionName: string } }>(
    "/themes/dimensions/:id/options/:optionName",
    async (request, reply) => {
      const { id, optionName } = request.params;
      try {
        await withThemeLock("theme-option-delete", async (dimensions) => {
          const dimIdx = dimensions.findIndex((d) => d.id === id);
          if (dimIdx === -1) {
            throw new NotFoundError(`Dimension "${id}" not found`);
          }
          const dim = dimensions[dimIdx];
          const filtered = dim.options.filter((o) => o.name !== optionName);
          if (filtered.length === dim.options.length) {
            throw new NotFoundError(
              `Option "${optionName}" not found in dimension "${id}"`,
            );
          }
          dimensions[dimIdx] = { ...dim, options: filtered };
          return {
            dims: dimensions,
            result: undefined,
            description: `Delete option "${optionName}" from dimension "${dim.name}"`,
          };
        });
        return { ok: true, id, optionName };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to delete option");
      }
    },
  );

};
