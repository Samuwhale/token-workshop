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
import { handleRouteError } from '../errors.js';

/** Validates a resolver name: non-empty, no null bytes, no path traversal, no leading/trailing whitespace. */
function isValidResolverName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name !== name.trim()) return false;
  if (name.includes('\0') || name.includes('..')) return false;
  return true;
}

/** Validates required fields in a ResolverFile body. */
function isValidResolverBody(body: unknown): body is ResolverFile {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if (b['version'] !== '2025.10') return false;
  if (!Array.isArray(b['resolutionOrder'])) return false;
  return true;
}

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
    if (!isValidResolverName(name)) return reply.status(400).send({ error: 'name must be a non-empty string with no null bytes or path traversal' });
    if (!isValidResolverBody(file)) return reply.status(400).send({ error: 'version ("2025.10") and resolutionOrder (array) are required' });
    try {
      await fastify.resolverStore.create(name, file);
      await fastify.operationLog.record({
        type: 'resolver-create',
        description: `Create resolver "${name}"`,
        setName: name,
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        rollbackSteps: [{ action: 'delete-resolver', name }],
      });
      return reply.status(201).send({ ok: true, name });
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to create resolver');
    }
  });

  // -----------------------------------------------------------------------
  // Convert existing $themes.json to a resolver file
  // IMPORTANT: Must be registered BEFORE /resolvers/:name routes
  // -----------------------------------------------------------------------
  fastify.post<{ Body: { name?: string } }>('/resolvers/from-themes', async (req, reply) => {
    const providedName = (req.body as { name?: string })?.name;
    if (providedName !== undefined && !isValidResolverName(providedName)) {
      return reply.status(400).send({ error: 'name must be a non-empty string with no null bytes or path traversal' });
    }
    const resolverName = providedName || 'theme-resolver';
    try {
      const storeDir = fastify.resolverStore.getDir();
      const themesPath = path.join(storeDir, '$themes.json');
      let dimensions: ThemeDimension[] = [];
      try {
        const content = await fs.readFile(themesPath, 'utf-8');
        const data = JSON.parse(content) as ThemesFile;
        dimensions = data.$themes || [];
      } catch {
        return reply.status(404).send({ error: 'No $themes.json found to convert.' });
      }

      if (dimensions.length === 0) {
        return reply.status(400).send({ error: 'No theme dimensions to convert.' });
      }

      const setNames = await fastify.tokenStore.getSets();
      const resolverFile = convertThemesToResolver(dimensions, setNames);

      await fastify.resolverStore.create(resolverName, resolverFile);
      await fastify.operationLog.record({
        type: 'resolver-create',
        description: `Create resolver "${resolverName}" from themes`,
        setName: resolverName,
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        rollbackSteps: [{ action: 'delete-resolver', name: resolverName }],
      });
      return reply.status(201).send({ ok: true, name: resolverName, resolver: resolverFile });
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to convert themes to resolver');
    }
  });

  // -----------------------------------------------------------------------
  // Get a single resolver
  // -----------------------------------------------------------------------
  fastify.get<{ Params: { name: string } }>('/resolvers/:name', async (req, reply) => {
    const file = fastify.resolverStore.get(req.params.name);
    if (!file) return reply.status(404).send({ error: 'Resolver not found' });
    return { name: req.params.name, ...file };
  });

  // -----------------------------------------------------------------------
  // Update a resolver
  // -----------------------------------------------------------------------
  fastify.put<{ Params: { name: string }; Body: ResolverFile }>('/resolvers/:name', async (req, reply) => {
    if (!isValidResolverBody(req.body)) {
      return reply.status(400).send({ error: 'version ("2025.10") and resolutionOrder (array) are required' });
    }
    try {
      const beforeFile = fastify.resolverStore.get(req.params.name);
      await fastify.resolverStore.update(req.params.name, req.body as ResolverFile);
      await fastify.operationLog.record({
        type: 'resolver-update',
        description: `Update resolver "${req.params.name}"`,
        setName: req.params.name,
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        rollbackSteps: beforeFile
          ? [{ action: 'write-resolver', name: req.params.name, file: structuredClone(beforeFile) }]
          : [],
      });
      return { ok: true };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to update resolver');
    }
  });

  // -----------------------------------------------------------------------
  // Delete a resolver
  // -----------------------------------------------------------------------
  fastify.delete<{ Params: { name: string } }>('/resolvers/:name', async (req, reply) => {
    try {
      const beforeFile = fastify.resolverStore.get(req.params.name);
      const deleted = await fastify.resolverStore.delete(req.params.name);
      if (!deleted) return reply.status(404).send({ error: 'Resolver not found' });
      await fastify.operationLog.record({
        type: 'resolver-delete',
        description: `Delete resolver "${req.params.name}"`,
        setName: req.params.name,
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        rollbackSteps: beforeFile
          ? [{ action: 'write-resolver', name: req.params.name, file: structuredClone(beforeFile) }]
          : [],
      });
      return { ok: true };
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // -----------------------------------------------------------------------
  // Get modifier metadata for building UI controls
  // -----------------------------------------------------------------------
  fastify.get<{ Params: { name: string } }>('/resolvers/:name/modifiers', async (req, reply) => {
    const file = fastify.resolverStore.get(req.params.name);
    if (!file) return reply.status(404).send({ error: 'Resolver not found' });

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
        return reply.status(400).send({ error: 'input object is required' });
      }
      try {
        const { tokens, diagnostics } = await fastify.resolverStore.resolve(
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
        return { tokens: flat, diagnostics };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to resolve tokens');
      }
    },
  );
};
