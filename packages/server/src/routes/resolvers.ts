/**
 * DTCG Resolver API routes.
 *
 * CRUD for *.resolver.json files plus a resolve endpoint that
 * merges token sources according to selected modifier contexts.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ResolverFile, ResolverInput, ThemeDimension, ThemesFile } from '@tokenmanager/core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { convertThemesToResolver } from '../services/themes-to-resolver.js';

export const resolverRoutes: FastifyPluginAsync = async (fastify) => {
  // -----------------------------------------------------------------------
  // List all resolvers
  // -----------------------------------------------------------------------
  fastify.get('/resolvers', async () => {
    return { resolvers: fastify.resolverStore.list() };
  });

  // -----------------------------------------------------------------------
  // Create a new resolver
  // -----------------------------------------------------------------------
  fastify.post<{ Body: { name: string } & ResolverFile }>('/resolvers', async (req, reply) => {
    const { name, ...file } = req.body as { name: string } & ResolverFile;
    if (!name) return reply.code(400).send({ error: 'name is required' });
    try {
      await fastify.resolverStore.create(name, file);
      await fastify.operationLog.record({
        type: 'resolver-create',
        description: `Create resolver "${name}"`,
        setName: '',
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        metadata: { kind: 'resolver-create', name, file },
      });
      return reply.code(201).send({ ok: true, name });
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      return reply.code(e.statusCode || 500).send({ error: e.message });
    }
  });

  // -----------------------------------------------------------------------
  // Convert existing $themes.json to a resolver file
  // IMPORTANT: Must be registered BEFORE /resolvers/:name routes
  // -----------------------------------------------------------------------
  fastify.post<{ Body: { name?: string } }>('/resolvers/from-themes', async (req, reply) => {
    const resolverName = (req.body as { name?: string })?.name || 'theme-resolver';
    try {
      const storeDir = fastify.resolverStore.getDir();
      const themesPath = path.join(storeDir, '$themes.json');
      let dimensions: ThemeDimension[] = [];
      try {
        const content = await fs.readFile(themesPath, 'utf-8');
        const data = JSON.parse(content) as ThemesFile;
        dimensions = data.$themes || [];
      } catch {
        return reply.code(404).send({ error: 'No $themes.json found to convert.' });
      }

      if (dimensions.length === 0) {
        return reply.code(400).send({ error: 'No theme dimensions to convert.' });
      }

      const setNames = await fastify.tokenStore.getSets();
      const resolverFile = convertThemesToResolver(dimensions, setNames);

      await fastify.resolverStore.create(resolverName, resolverFile);
      await fastify.operationLog.record({
        type: 'resolver-create',
        description: `Create resolver "${resolverName}" from themes`,
        setName: '',
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        metadata: { kind: 'resolver-create', name: resolverName, file: resolverFile },
      });
      return reply.code(201).send({ ok: true, name: resolverName, resolver: resolverFile });
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      return reply.code(e.statusCode || 500).send({ error: e.message });
    }
  });

  // -----------------------------------------------------------------------
  // Get a single resolver
  // -----------------------------------------------------------------------
  fastify.get<{ Params: { name: string } }>('/resolvers/:name', async (req, reply) => {
    const file = fastify.resolverStore.get(req.params.name);
    if (!file) return reply.code(404).send({ error: 'Resolver not found' });
    return { name: req.params.name, ...file };
  });

  // -----------------------------------------------------------------------
  // Update a resolver
  // -----------------------------------------------------------------------
  fastify.put<{ Params: { name: string }; Body: ResolverFile }>('/resolvers/:name', async (req, reply) => {
    try {
      const before = structuredClone(fastify.resolverStore.get(req.params.name));
      if (!before) return reply.code(404).send({ error: 'Resolver not found' });
      await fastify.resolverStore.update(req.params.name, req.body as ResolverFile);
      await fastify.operationLog.record({
        type: 'resolver-update',
        description: `Update resolver "${req.params.name}"`,
        setName: '',
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        metadata: { kind: 'resolver-update', name: req.params.name, before, after: req.body as ResolverFile },
      });
      return { ok: true };
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      return reply.code(e.statusCode || 500).send({ error: e.message });
    }
  });

  // -----------------------------------------------------------------------
  // Delete a resolver
  // -----------------------------------------------------------------------
  fastify.delete<{ Params: { name: string } }>('/resolvers/:name', async (req, reply) => {
    const file = structuredClone(fastify.resolverStore.get(req.params.name));
    if (!file) return reply.code(404).send({ error: 'Resolver not found' });
    const deleted = await fastify.resolverStore.delete(req.params.name);
    if (!deleted) return reply.code(404).send({ error: 'Resolver not found' });
    await fastify.operationLog.record({
      type: 'resolver-delete',
      description: `Delete resolver "${req.params.name}"`,
      setName: '',
      affectedPaths: [],
      beforeSnapshot: {},
      afterSnapshot: {},
      metadata: { kind: 'resolver-delete', name: req.params.name, file },
    });
    return { ok: true };
  });

  // -----------------------------------------------------------------------
  // Get modifier metadata for building UI controls
  // -----------------------------------------------------------------------
  fastify.get<{ Params: { name: string } }>('/resolvers/:name/modifiers', async (req, reply) => {
    const file = fastify.resolverStore.get(req.params.name);
    if (!file) return reply.code(404).send({ error: 'Resolver not found' });

    const modifiers: Record<string, { description?: string; contexts: string[]; default?: string }> = {};
    if (file.modifiers) {
      for (const [modName, mod] of Object.entries(file.modifiers)) {
        modifiers[modName] = {
          description: mod.description,
          contexts: Object.keys(mod.contexts),
          default: mod.default,
        };
      }
    }
    return { modifiers };
  });

  // -----------------------------------------------------------------------
  // Resolve tokens given modifier input
  // -----------------------------------------------------------------------
  fastify.post<{ Params: { name: string }; Body: { input: ResolverInput } }>(
    '/resolvers/:name/resolve',
    async (req, reply) => {
      const { input } = req.body as { input: ResolverInput };
      if (!input || typeof input !== 'object') {
        return reply.code(400).send({ error: 'input object is required' });
      }
      try {
        const tokens = await fastify.resolverStore.resolve(
          req.params.name,
          input,
          fastify.tokenStore,
        );
        const flat: Record<string, { $value: unknown; $type?: string; $description?: string }> = {};
        for (const [tokenPath, token] of Object.entries(tokens)) {
          flat[tokenPath] = {
            $value: token.$value,
            $type: token.$type,
            ...(token.$description ? { $description: token.$description } : {}),
          };
        }
        return { tokens: flat };
      } catch (err: unknown) {
        const e = err as Error & { statusCode?: number };
        return reply.code(e.statusCode || 500).send({ error: e.message });
      }
    },
  );
};
