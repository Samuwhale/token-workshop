import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ThemeDimension, ThemesFile, ThemeSetStatus } from '@tokenmanager/core';

const VALID_THEME_SET_STATUSES = new Set<string>(['enabled', 'disabled', 'source']);

interface DimensionsStore {
  filePath: string;
  load(): Promise<ThemeDimension[]>;
  save(dimensions: ThemeDimension[]): Promise<void>;
}

function createDimensionsStore(tokenDir: string): DimensionsStore {
  const filePath = path.join(tokenDir, '$themes.json');
  let cache: ThemeDimension[] | null = null;

  return {
    filePath,

    async load(): Promise<ThemeDimension[]> {
      if (cache !== null) return cache;
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content) as ThemesFile;
        cache = data.$themes || [];
      } catch {
        cache = [];
      }
      return cache;
    },

    async save(dimensions: ThemeDimension[]): Promise<void> {
      const data: ThemesFile = { $themes: dimensions };
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      cache = dimensions;
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
    if (!name || typeof name !== 'string') {
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
    if (!name || typeof name !== 'string') {
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
      if (!name || typeof name !== 'string') {
        return reply.status(400).send({ error: 'Option name is required' });
      }
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
        const optIdx = dim.options.findIndex(o => o.name === name);
        const option = { name: name.trim(), sets };
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
      if (!name || typeof name !== 'string') {
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
};
