import type { FastifyPluginAsync } from 'fastify';
import type { TokenGroup } from '@tokenmanager/core';
import { getErrorMessage } from '../utils';

export const setRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/sets — list all sets (with optional descriptions)
  fastify.get('/sets', async () => {
    const sets = await fastify.tokenStore.getSets();
    const descriptions = fastify.tokenStore.getSetDescriptions();
    const counts = fastify.tokenStore.getSetCounts();
    const collectionNames = fastify.tokenStore.getSetCollectionNames();
    const modeNames = fastify.tokenStore.getSetModeNames();
    return { sets, descriptions, counts, collectionNames, modeNames };
  });

  // GET /api/sets/:name — get a set
  fastify.get<{ Params: { name: string } }>('/sets/:name', async (request, reply) => {
    const { name } = request.params;
    try {
      const set = await fastify.tokenStore.getSet(name);
      if (!set) {
        return reply.status(404).send({ error: `Token set "${name}" not found` });
      }
      return { name: set.name, tokens: set.tokens };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to get set', detail: String(err) });
    }
  });

  // POST /api/sets — create a set
  fastify.post<{ Body: { name: string; tokens?: Record<string, unknown> } }>('/sets', async (request, reply) => {
    const { name, tokens } = request.body || {};
    if (!name) {
      return reply.status(400).send({ error: 'Set name is required' });
    }

    // Validate name (alphanumeric, dashes, underscores; / for folder hierarchy)
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(name)) {
      return reply.status(400).send({ error: 'Set name must contain only alphanumeric characters, dashes, underscores, and / for folders' });
    }

    try {
      const existing = await fastify.tokenStore.getSet(name);
      if (existing) {
        return reply.status(409).send({ error: `Token set "${name}" already exists` });
      }

      const set = await fastify.tokenStore.createSet(name, tokens as TokenGroup | undefined);
      return reply.status(201).send({ name: set.name, tokens: set.tokens });
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to create set', detail: String(err) });
    }
  });

  // PATCH /api/sets/:name/metadata — update set description, figma collection name, and/or figma mode name
  fastify.patch<{ Params: { name: string }; Body: { description?: string; figmaCollection?: string; figmaMode?: string } }>('/sets/:name/metadata', async (request, reply) => {
    const { name } = request.params;
    const { description = '', figmaCollection, figmaMode } = request.body || {};
    try {
      await fastify.tokenStore.updateSetDescription(name, description);
      if (figmaCollection !== undefined) {
        await fastify.tokenStore.updateSetCollectionName(name, figmaCollection);
      }
      if (figmaMode !== undefined) {
        await fastify.tokenStore.updateSetModeName(name, figmaMode);
      }
      return { updated: true, name, description };
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg.includes('not found')) return reply.status(404).send({ error: msg });
      return reply.status(500).send({ error: 'Failed to update metadata', detail: msg });
    }
  });

  // POST /api/sets/:name/rename — rename a set (atomic: file + themes + in-memory)
  fastify.post<{ Params: { name: string }; Body: { newName: string } }>('/sets/:name/rename', async (request, reply) => {
    const { name } = request.params;
    const { newName } = request.body || {};

    if (!newName) {
      return reply.status(400).send({ error: 'newName is required' });
    }
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(newName)) {
      return reply.status(400).send({ error: 'Set name must contain only alphanumeric characters, dashes, underscores, and / for folders' });
    }

    try {
      await fastify.tokenStore.renameSet(name, newName);
      return { renamed: true, oldName: name, newName };
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg.includes('not found')) return reply.status(404).send({ error: msg });
      if (msg.includes('already exists')) return reply.status(409).send({ error: msg });
      return reply.status(500).send({ error: 'Failed to rename set', detail: msg });
    }
  });

  // PUT /api/sets/reorder — reorder sets
  fastify.put<{ Body: { order: string[] } }>('/sets/reorder', async (request, reply) => {
    const { order } = request.body || {};
    if (!Array.isArray(order)) {
      return reply.status(400).send({ error: 'order must be an array of set names' });
    }
    fastify.tokenStore.reorderSets(order);
    return { reordered: true };
  });

  // DELETE /api/data — wipe all sets and themes (danger zone)
  // Requires body: { confirm: "DELETE" } to prevent accidental calls
  fastify.delete<{ Body: { confirm?: string } }>('/data', async (request, reply) => {
    if (request.body?.confirm !== 'DELETE') {
      return reply.status(400).send({ error: 'Missing confirmation — send { confirm: "DELETE" } in the request body' });
    }
    try {
      await fastify.tokenStore.clearAll();
      return { cleared: true };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to clear data', detail: String(err) });
    }
  });

  // DELETE /api/sets/:name — delete a set
  fastify.delete<{ Params: { name: string } }>('/sets/:name', async (request, reply) => {
    const { name } = request.params;
    try {
      // Block deletion if any generator references this set as its targetSet
      const allGenerators = await fastify.generatorService.getAll();
      const blocking = allGenerators.filter((g) => g.targetSet === name);
      if (blocking.length > 0) {
        const names = blocking.map((g) => `"${g.name}"`).join(', ');
        return reply.status(409).send({
          error: `Cannot delete set "${name}" — it is used as the target by ${blocking.length === 1 ? 'generator' : 'generators'}: ${names}`,
          generatorIds: blocking.map((g) => g.id),
        });
      }

      const deleted = await fastify.tokenStore.deleteSet(name);
      if (!deleted) {
        return reply.status(404).send({ error: `Token set "${name}" not found` });
      }
      return { deleted: true, name };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to delete set', detail: String(err) });
    }
  });
};
