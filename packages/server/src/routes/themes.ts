import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ThemeDimension, ThemesFile, ThemeSetStatus } from '@tokenmanager/core';
import { flattenTokenGroup } from '@tokenmanager/core';
import { handleRouteError } from '../errors.js';

const VALID_THEME_SET_STATUSES = new Set<string>(['enabled', 'disabled', 'source']);

export interface DimensionsStore {
  filePath: string;
  load(): Promise<ThemeDimension[]>;
  save(dimensions: ThemeDimension[]): Promise<void>;
  /** Run an exclusive load-modify-save transaction. Prevents concurrent mutations from racing. */
  withLock<T>(fn: (dims: ThemeDimension[]) => Promise<{ dims: ThemeDimension[]; result: T }>): Promise<T>;
}

export function createDimensionsStore(tokenDir: string): DimensionsStore {
  const filePath = path.join(tokenDir, '$themes.json');
  let cache: ThemeDimension[] | null = null;
  let cachedMtimeMs: number | null = null;
  let lockChain: Promise<unknown> = Promise.resolve();

  async function fileMtimeMs(): Promise<number | null> {
    try {
      const stat = await fs.stat(filePath);
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }

  const store: DimensionsStore = {
    filePath,

    async load(): Promise<ThemeDimension[]> {
      const mtime = await fileMtimeMs();
      if (cache !== null && mtime === cachedMtimeMs) return cache;
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content) as ThemesFile;
        cache = data.$themes || [];
        cachedMtimeMs = mtime;
      } catch {
        cache = [];
        cachedMtimeMs = mtime;
      }
      return structuredClone(cache);
    },

    async save(dimensions: ThemeDimension[]): Promise<void> {
      const data: ThemesFile = { $themes: dimensions };
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      cache = structuredClone(dimensions);
      cachedMtimeMs = await fileMtimeMs();
    },

    withLock<T>(fn: (dims: ThemeDimension[]) => Promise<{ dims: ThemeDimension[]; result: T }>): Promise<T> {
      const next = lockChain.then(async () => {
        const dims = await store.load();
        const { dims: updated, result } = await fn(dims);
        await store.save(updated);
        return result;
      });
      // Chain subsequent callers behind this one regardless of success/failure
      lockChain = next.catch(() => {});
      return next;
    },
  };

  return store;
}

function validateSets(sets: Record<string, unknown>): string | null {
  const invalid = Object.entries(sets).filter(([, v]) => !VALID_THEME_SET_STATUSES.has(v as string));
  if (invalid.length > 0) {
    return `Invalid set status values: ${invalid.map(([k, v]) => `"${k}": "${v}"`).join(', ')}. Must be "enabled", "disabled", or "source".`;
  }
  return null;
}

export const themeRoutes: FastifyPluginAsync<{ tokenDir: string }> = async (fastify, _opts) => {
  const store = fastify.dimensionsStore;

  // Coverage cache — invalidated when themes file or token sets change
  let coverageCache: {
    themeMtimeMs: number | null;
    result: Record<string, Record<string, { uncovered: Array<{ path: string; set: string }> }>>;
  } | null = null;

  const themesFilePath = store.filePath;
  async function getThemeMtime(): Promise<number | null> {
    try {
      const stat = await fs.stat(themesFilePath);
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }

  // Invalidate coverage cache when any token set changes
  fastify.tokenStore.onChange(() => {
    coverageCache = null;
  });

  /**
   * Wrapper around store.withLock that also records an operation log entry.
   * The callback receives current dimensions and must return { dims, result, description }.
   * `beforeDims` is captured automatically before the callback mutates.
   */
  async function withThemeLock<T>(
    type: string,
    fn: (dims: ThemeDimension[]) => Promise<{ dims: ThemeDimension[]; result: T; description: string }>,
  ): Promise<T> {
    let capturedBefore: ThemeDimension[] | null = null;
    let capturedDescription = '';
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
        setName: '$themes',
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        rollbackSteps: [{ action: 'write-themes', dimensions: capturedBefore }],
      });
    }
    return result;
  }

  // GET /api/themes — list dimensions
  fastify.get('/themes', async (_request, reply) => {
    try {
      const dimensions = await store.load();
      return { dimensions };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to load themes', detail: String(err) });
    }
  });

  // POST /api/themes/dimensions — create a new dimension
  fastify.post<{ Body: { id: string; name: string } }>('/themes/dimensions', async (request, reply) => {
    const { id, name } = request.body || {};
    if (!id || typeof id !== 'string') {
      return reply.status(400).send({ error: 'Dimension id is required' });
    }
    if (!/^[a-z0-9-]+$/.test(id)) {
      return reply.status(400).send({ error: 'Dimension id must contain only lowercase letters, numbers, and hyphens' });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.status(400).send({ error: 'Dimension name is required' });
    }
    try {
      const dimension = await withThemeLock('theme-dimension-create', async (dimensions) => {
        if (dimensions.some(d => d.id === id)) {
          throw Object.assign(new Error(`Dimension with id "${id}" already exists`), { statusCode: 409 });
        }
        const dim: ThemeDimension = { id, name: name.trim(), options: [] };
        dimensions.push(dim);
        return { dims: dimensions, result: dim, description: `Create theme dimension "${name.trim()}"` };
      });
      const afterDims = await store.load();
      await fastify.operationLog.record({
        type: 'theme-dimension-create',
        description: `Create theme dimension "${name.trim()}"`,
        setName: '',
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        metadata: { kind: 'theme-dimensions', before: beforeDims, after: afterDims },
      });
      return reply.status(201).send({ dimension });
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to create dimension');
    }
  });

  // PUT /api/themes/dimensions/:id — rename a dimension
  fastify.put<{ Params: { id: string }; Body: { name: string } }>('/themes/dimensions/:id', async (request, reply) => {
    const { id } = request.params;
    const { name } = request.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.status(400).send({ error: 'Dimension name is required' });
    }
    try {
      const dimension = await withThemeLock('theme-dimension-rename', async (dimensions) => {
        const idx = dimensions.findIndex(d => d.id === id);
        if (idx === -1) {
          throw Object.assign(new Error(`Dimension "${id}" not found`), { statusCode: 404 });
        }
        const oldName = dimensions[idx].name;
        dimensions[idx] = { ...dimensions[idx], name: name.trim() };
        return { dims: dimensions, result: dimensions[idx], description: `Rename dimension "${oldName}" → "${name.trim()}"` };
      });
      const afterDims = await store.load();
      await fastify.operationLog.record({
        type: 'theme-dimension-rename',
        description: `Rename theme dimension "${id}" to "${name.trim()}"`,
        setName: '',
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        metadata: { kind: 'theme-dimensions', before: beforeDims, after: afterDims },
      });
      return { dimension };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to rename dimension');
    }
  });

  // PUT /api/themes/dimensions-order — reorder dimensions
  fastify.put<{ Body: { dimensionIds: string[] } }>('/themes/dimensions-order', async (request, reply) => {
    const { dimensionIds } = request.body || {};
    if (!Array.isArray(dimensionIds) || dimensionIds.some(id => typeof id !== 'string')) {
      return reply.status(400).send({ error: 'dimensionIds must be an array of dimension id strings' });
    }
    try {
      let beforeDims: ThemeDimension[] = [];
      const reordered = await store.withLock(async (dimensions) => {
        beforeDims = structuredClone(dimensions);
        const byId = new Map(dimensions.map(d => [d.id, d]));
        for (const id of dimensionIds) {
          if (!byId.has(id)) {
            throw Object.assign(new Error(`Dimension "${id}" not found`), { statusCode: 400 });
          }
        }
        if (dimensionIds.length !== dimensions.length || new Set(dimensionIds).size !== dimensionIds.length) {
          throw Object.assign(new Error('dimensionIds must list every dimension id exactly once'), { statusCode: 400 });
        }
        const newOrder = dimensionIds.map(id => byId.get(id)!);
        return { dims: newOrder, result: newOrder };
      });
      const afterDims = await store.load();
      await fastify.operationLog.record({
        type: 'theme-dimensions-reorder',
        description: 'Reorder theme dimensions',
        setName: '',
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        metadata: { kind: 'theme-dimensions', before: beforeDims, after: afterDims },
      });
      return { dimensions: reordered };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to reorder dimensions');
    }
  });

  // DELETE /api/themes/dimensions/:id — delete a dimension
  fastify.delete<{ Params: { id: string } }>('/themes/dimensions/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      await withThemeLock('theme-dimension-delete', async (dimensions) => {
        const dim = dimensions.find(d => d.id === id);
        if (!dim) {
          throw Object.assign(new Error(`Dimension "${id}" not found`), { statusCode: 404 });
        }
        const filtered = dimensions.filter(d => d.id !== id);
        return { dims: filtered, result: undefined, description: `Delete theme dimension "${dim.name}"` };
      });
      const afterDims = await store.load();
      await fastify.operationLog.record({
        type: 'theme-dimension-delete',
        description: `Delete theme dimension "${id}"`,
        setName: '',
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        metadata: { kind: 'theme-dimensions', before: beforeDims, after: afterDims },
      });
      return { deleted: true, id };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to delete dimension');
    }
  });

  // POST /api/themes/dimensions/:id/options — add or update an option
  fastify.post<{ Params: { id: string }; Body: { name: string; sets: Record<string, ThemeSetStatus> } }>(
    '/themes/dimensions/:id/options',
    async (request, reply) => {
      const { id } = request.params;
      const { name, sets } = request.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        return reply.status(400).send({ error: 'Option name is required' });
      }
      const trimmedName = name.trim();
      if (!sets || typeof sets !== 'object') {
        return reply.status(400).send({ error: 'Option must have a sets object' });
      }
      const setsError = validateSets(sets);
      if (setsError) return reply.status(400).send({ error: setsError });

      try {
        const { option, status } = await withThemeLock('theme-option-upsert', async (dimensions) => {
          const dimIdx = dimensions.findIndex(d => d.id === id);
          if (dimIdx === -1) {
            throw Object.assign(new Error(`Dimension "${id}" not found`), { statusCode: 404 });
          }
          const dim = dimensions[dimIdx];
          const optIdx = dim.options.findIndex(o => o.name === trimmedName);
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
            description: `${isUpdate ? 'Update' : 'Add'} option "${trimmedName}" in dimension "${dim.name}"`,
          };
        });
        const afterDims = await store.load();
        await fastify.operationLog.record({
          type: status === 201 ? 'theme-option-create' : 'theme-option-update',
          description: `${status === 201 ? 'Add' : 'Update'} option "${trimmedName}" in dimension "${id}"`,
          setName: '',
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          metadata: { kind: 'theme-dimensions', before: beforeDims, after: afterDims },
        });
        return reply.status(status).send({ option });
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to save option');
      }
    },
  );

  // PUT /api/themes/dimensions/:id/options/:optionName — rename an option
  fastify.put<{ Params: { id: string; optionName: string }; Body: { name: string } }>(
    '/themes/dimensions/:id/options/:optionName',
    async (request, reply) => {
      const { id, optionName } = request.params;
      const { name } = request.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        return reply.status(400).send({ error: 'New option name is required' });
      }
      const newName = name.trim();
      try {
        const option = await withThemeLock('theme-option-rename', async (dimensions) => {
          const dimIdx = dimensions.findIndex(d => d.id === id);
          if (dimIdx === -1) {
            throw Object.assign(new Error(`Dimension "${id}" not found`), { statusCode: 404 });
          }
          const dim = dimensions[dimIdx];
          const optIdx = dim.options.findIndex(o => o.name === optionName);
          if (optIdx === -1) {
            throw Object.assign(new Error(`Option "${optionName}" not found in dimension "${id}"`), { statusCode: 404 });
          }
          if (newName !== optionName && dim.options.some(o => o.name === newName)) {
            throw Object.assign(new Error(`Option "${newName}" already exists in this dimension`), { statusCode: 409 });
          }
          dim.options[optIdx] = { ...dim.options[optIdx], name: newName };
          return { dims: dimensions, result: dim.options[optIdx], description: `Rename option "${optionName}" → "${newName}" in dimension "${dim.name}"` };
        });
        const afterDims = await store.load();
        await fastify.operationLog.record({
          type: 'theme-option-rename',
          description: `Rename option "${optionName}" to "${newName}" in dimension "${id}"`,
          setName: '',
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          metadata: { kind: 'theme-dimensions', before: beforeDims, after: afterDims },
        });
        return { option };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to rename option');
      }
    },
  );

  // PUT /api/themes/dimensions/:id/options-order — reorder options within a dimension
  fastify.put<{ Params: { id: string }; Body: { options: string[] } }>(
    '/themes/dimensions/:id/options-order',
    async (request, reply) => {
      const { id } = request.params;
      const { options } = request.body || {};
      if (!Array.isArray(options) || options.some(o => typeof o !== 'string')) {
        return reply.status(400).send({ error: 'options must be an array of option name strings' });
      }
      try {
        const dimension = await withThemeLock('theme-option-reorder', async (dimensions) => {
          const dimIdx = dimensions.findIndex(d => d.id === id);
          if (dimIdx === -1) {
            throw Object.assign(new Error(`Dimension "${id}" not found`), { statusCode: 404 });
          }
          const dim = dimensions[dimIdx];
          const byName = new Map(dim.options.map(o => [o.name, o]));
          for (const name of options) {
            if (!byName.has(name)) {
              throw Object.assign(new Error(`Option "${name}" not found in dimension "${id}"`), { statusCode: 400 });
            }
          }
          if (options.length !== dim.options.length || new Set(options).size !== options.length) {
            throw Object.assign(new Error('options must list every option name exactly once'), { statusCode: 400 });
          }
          dimensions[dimIdx] = { ...dim, options: options.map(n => byName.get(n)!) };
          return { dims: dimensions, result: dimensions[dimIdx], description: `Reorder options in dimension "${dim.name}"` };
        });
        const afterDims = await store.load();
        await fastify.operationLog.record({
          type: 'theme-options-reorder',
          description: `Reorder options in dimension "${id}"`,
          setName: '',
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          metadata: { kind: 'theme-dimensions', before: beforeDims, after: afterDims },
        });
        return { dimension };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to reorder options');
      }
    },
  );

  // DELETE /api/themes/dimensions/:id/options/:optionName — remove an option
  fastify.delete<{ Params: { id: string; optionName: string } }>(
    '/themes/dimensions/:id/options/:optionName',
    async (request, reply) => {
      const { id, optionName } = request.params;
      try {
        await withThemeLock('theme-option-delete', async (dimensions) => {
          const dimIdx = dimensions.findIndex(d => d.id === id);
          if (dimIdx === -1) {
            throw Object.assign(new Error(`Dimension "${id}" not found`), { statusCode: 404 });
          }
          const dim = dimensions[dimIdx];
          const filtered = dim.options.filter(o => o.name !== optionName);
          if (filtered.length === dim.options.length) {
            throw Object.assign(new Error(`Option "${optionName}" not found in dimension "${id}"`), { statusCode: 404 });
          }
          dimensions[dimIdx] = { ...dim, options: filtered };
          return { dims: dimensions, result: undefined, description: `Delete option "${optionName}" from dimension "${dim.name}"` };
        });
        const afterDims = await store.load();
        await fastify.operationLog.record({
          type: 'theme-option-delete',
          description: `Delete option "${optionName}" from dimension "${id}"`,
          setName: '',
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          metadata: { kind: 'theme-dimensions', before: beforeDims, after: afterDims },
        });
        return { deleted: true, id, optionName };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to delete option');
      }
    },
  );

  // GET /api/themes/coverage — compute coverage gaps server-side (cached)
  fastify.get('/themes/coverage', async (_request, reply) => {
    try {
      // Check if cached result is still valid (theme file unchanged)
      const currentMtime = await getThemeMtime();
      if (coverageCache && coverageCache.themeMtimeMs === currentMtime) {
        return { coverage: coverageCache.result };
      }

      const dimensions = await store.load();
      const tokenStore = fastify.tokenStore;

      // Build a flat value map per set
      const setTokenValues: Record<string, Record<string, any>> = {};
      const allSetNames = new Set<string>();
      for (const dim of dimensions) {
        for (const opt of dim.options) {
          for (const setName of Object.keys(opt.sets)) {
            allSetNames.add(setName);
          }
        }
      }
      for (const setName of allSetNames) {
        const tokenSet = await tokenStore.getSet(setName);
        if (tokenSet) {
          const map: Record<string, any> = {};
          for (const [p, token] of flattenTokenGroup(tokenSet.tokens)) {
            map[p] = token.$value;
          }
          setTokenValues[setName] = map;
        }
      }

      const isResolved = (value: any, activeValues: Record<string, any>, visited = new Set<string>()): boolean => {
        if (typeof value !== 'string') return true;
        const m = /^\{([^}]+)\}$/.exec(value);
        if (!m) return true;
        const target = m[1];
        if (visited.has(target)) return false;
        if (!(target in activeValues)) return false;
        return isResolved(activeValues[target], activeValues, new Set([...visited, target]));
      };

      const coverage: Record<string, Record<string, { uncovered: Array<{ path: string; set: string }> }>> = {};
      for (const dim of dimensions) {
        coverage[dim.id] = {};
        for (const opt of dim.options) {
          const activeValues: Record<string, any> = {};
          const tokenSetOrigin: Record<string, string> = {};
          for (const [setName, state] of Object.entries(opt.sets)) {
            if (state === 'source') {
              for (const p of Object.keys(setTokenValues[setName] ?? {})) {
                tokenSetOrigin[p] = setName;
              }
              Object.assign(activeValues, setTokenValues[setName] ?? {});
            }
          }
          for (const [setName, state] of Object.entries(opt.sets)) {
            if (state === 'enabled') {
              for (const p of Object.keys(setTokenValues[setName] ?? {})) {
                tokenSetOrigin[p] = setName;
              }
              Object.assign(activeValues, setTokenValues[setName] ?? {});
            }
          }
          const uncovered = Object.entries(activeValues)
            .filter(([, v]) => !isResolved(v, activeValues))
            .map(([p]) => ({ path: p, set: tokenSetOrigin[p] ?? '' }));
          coverage[dim.id][opt.name] = { uncovered };
        }
      }

      // Cache the result
      coverageCache = { themeMtimeMs: currentMtime, result: coverage };
      return { coverage };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to compute coverage', detail: String(err) });
    }
  });
};
