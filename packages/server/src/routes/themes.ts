import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ThemeDimension, ThemesFile, ThemeSetStatus } from '@tokenmanager/core';
import { flattenTokenGroup } from '@tokenmanager/core';

const VALID_THEME_SET_STATUSES = new Set<string>(['enabled', 'disabled', 'source']);

interface DimensionsStore {
  filePath: string;
  load(): Promise<ThemeDimension[]>;
  save(dimensions: ThemeDimension[]): Promise<void>;
}

function createDimensionsStore(tokenDir: string): DimensionsStore {
  const filePath = path.join(tokenDir, '$themes.json');
  let cache: ThemeDimension[] | null = null;
  let cachedMtimeMs: number | null = null;

  async function fileMtimeMs(): Promise<number | null> {
    try {
      const stat = await fs.stat(filePath);
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }

  return {
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
  };
}

function validateSets(sets: Record<string, unknown>): string | null {
  const invalid = Object.entries(sets).filter(([, v]) => !VALID_THEME_SET_STATUSES.has(v as string));
  if (invalid.length > 0) {
    return `Invalid set status values: ${invalid.map(([k, v]) => `"${k}": "${v}"`).join(', ')}. Must be "enabled", "disabled", or "source".`;
  }
  return null;
}

export const themeRoutes: FastifyPluginAsync<{ tokenDir: string }> = async (fastify, opts) => {
  const tokenDir = path.resolve(opts.tokenDir);
  const store = createDimensionsStore(tokenDir);

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
      const dimensions = await store.load();
      if (dimensions.some(d => d.id === id)) {
        return reply.status(409).send({ error: `Dimension with id "${id}" already exists` });
      }
      const dimension: ThemeDimension = { id, name: name.trim(), options: [] };
      dimensions.push(dimension);
      await store.save(dimensions);
      return reply.status(201).send({ dimension });
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to create dimension', detail: String(err) });
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
      const dimensions = await store.load();
      const idx = dimensions.findIndex(d => d.id === id);
      if (idx === -1) {
        return reply.status(404).send({ error: `Dimension "${id}" not found` });
      }
      dimensions[idx] = { ...dimensions[idx], name: name.trim() };
      await store.save(dimensions);
      return { dimension: dimensions[idx] };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to rename dimension', detail: String(err) });
    }
  });

  // DELETE /api/themes/dimensions/:id — delete a dimension
  fastify.delete<{ Params: { id: string } }>('/themes/dimensions/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      const dimensions = await store.load();
      const filtered = dimensions.filter(d => d.id !== id);
      if (filtered.length === dimensions.length) {
        return reply.status(404).send({ error: `Dimension "${id}" not found` });
      }
      await store.save(filtered);
      return { deleted: true, id };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to delete dimension', detail: String(err) });
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
        const dimensions = await store.load();
        const dimIdx = dimensions.findIndex(d => d.id === id);
        if (dimIdx === -1) {
          return reply.status(404).send({ error: `Dimension "${id}" not found` });
        }
        const dim = dimensions[dimIdx];
        const optIdx = dim.options.findIndex(o => o.name === trimmedName);
        const option = { name: trimmedName, sets };
        if (optIdx >= 0) {
          dim.options[optIdx] = option;
        } else {
          dim.options.push(option);
        }
        await store.save(dimensions);
        return reply.status(optIdx >= 0 ? 200 : 201).send({ option });
      } catch (err) {
        return reply.status(500).send({ error: 'Failed to save option', detail: String(err) });
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
        const dimensions = await store.load();
        const dimIdx = dimensions.findIndex(d => d.id === id);
        if (dimIdx === -1) {
          return reply.status(404).send({ error: `Dimension "${id}" not found` });
        }
        const dim = dimensions[dimIdx];
        const optIdx = dim.options.findIndex(o => o.name === optionName);
        if (optIdx === -1) {
          return reply.status(404).send({ error: `Option "${optionName}" not found in dimension "${id}"` });
        }
        if (newName !== optionName && dim.options.some(o => o.name === newName)) {
          return reply.status(409).send({ error: `Option "${newName}" already exists in this dimension` });
        }
        dim.options[optIdx] = { ...dim.options[optIdx], name: newName };
        await store.save(dimensions);
        return { option: dim.options[optIdx] };
      } catch (err) {
        return reply.status(500).send({ error: 'Failed to rename option', detail: String(err) });
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
        const dimensions = await store.load();
        const dimIdx = dimensions.findIndex(d => d.id === id);
        if (dimIdx === -1) {
          return reply.status(404).send({ error: `Dimension "${id}" not found` });
        }
        const dim = dimensions[dimIdx];
        const byName = new Map(dim.options.map(o => [o.name, o]));
        // Validate all names exist
        for (const name of options) {
          if (!byName.has(name)) {
            return reply.status(400).send({ error: `Option "${name}" not found in dimension "${id}"` });
          }
        }
        if (options.length !== dim.options.length || new Set(options).size !== options.length) {
          return reply.status(400).send({ error: 'options must list every option name exactly once' });
        }
        dimensions[dimIdx] = { ...dim, options: options.map(n => byName.get(n)!) };
        await store.save(dimensions);
        return { dimension: dimensions[dimIdx] };
      } catch (err) {
        return reply.status(500).send({ error: 'Failed to reorder options', detail: String(err) });
      }
    },
  );

  // DELETE /api/themes/dimensions/:id/options/:optionName — remove an option
  fastify.delete<{ Params: { id: string; optionName: string } }>(
    '/themes/dimensions/:id/options/:optionName',
    async (request, reply) => {
      const { id, optionName } = request.params;
      try {
        const dimensions = await store.load();
        const dimIdx = dimensions.findIndex(d => d.id === id);
        if (dimIdx === -1) {
          return reply.status(404).send({ error: `Dimension "${id}" not found` });
        }
        const dim = dimensions[dimIdx];
        const filtered = dim.options.filter(o => o.name !== optionName);
        if (filtered.length === dim.options.length) {
          return reply.status(404).send({ error: `Option "${optionName}" not found in dimension "${id}"` });
        }
        dimensions[dimIdx] = { ...dim, options: filtered };
        await store.save(dimensions);
        return { deleted: true, id, optionName };
      } catch (err) {
        return reply.status(500).send({ error: 'Failed to delete option', detail: String(err) });
      }
    },
  );

  // GET /api/themes/coverage — compute coverage gaps server-side
  fastify.get('/themes/coverage', async (_request, reply) => {
    try {
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
      return { coverage };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to compute coverage', detail: String(err) });
    }
  });
};
