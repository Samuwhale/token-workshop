import type { FastifyPluginAsync } from 'fastify';
import type { TokenGroup } from '@tokenmanager/core';
import { handleRouteError } from '../errors.js';
import { snapshotSet } from '../services/operation-log.js';

export const setRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

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

    return withLock(async () => {
      try {
        const existing = await fastify.tokenStore.getSet(name);
        if (existing) {
          return reply.status(409).send({ error: `Token set "${name}" already exists` });
        }

        const set = await fastify.tokenStore.createSet(name, tokens as TokenGroup | undefined);
        const afterSnap = await snapshotSet(fastify.tokenStore, name);
        await fastify.operationLog.record({
          type: 'set-create',
          description: `Create set "${name}"`,
          setName: name,
          affectedPaths: Object.keys(afterSnap),
          beforeSnapshot: {},
          afterSnapshot: afterSnap,
          rollbackSteps: [{ action: 'delete-set', name }],
        });
        return reply.status(201).send({ name: set.name, tokens: set.tokens });
      } catch (err) {
        return reply.status(500).send({ error: 'Failed to create set', detail: String(err) });
      }
    });
  });

  // PATCH /api/sets/:name/metadata — update set description, figma collection name, and/or figma mode name
  fastify.patch<{ Params: { name: string }; Body: { description?: string; figmaCollection?: string; figmaMode?: string } }>('/sets/:name/metadata', async (request, reply) => {
    const { name } = request.params;
    const { description = '', figmaCollection, figmaMode } = request.body || {};
    return withLock(async () => {
      try {
        const beforeDesc = fastify.tokenStore.getSetDescriptions();
        const beforeColl = fastify.tokenStore.getSetCollectionNames();
        const beforeMode = fastify.tokenStore.getSetModeNames();
        const beforeMeta = { description: beforeDesc[name], collectionName: beforeColl[name], modeName: beforeMode[name] };

        await fastify.tokenStore.updateSetDescription(name, description);
        if (figmaCollection !== undefined) {
          await fastify.tokenStore.updateSetCollectionName(name, figmaCollection);
        }
        if (figmaMode !== undefined) {
          await fastify.tokenStore.updateSetModeName(name, figmaMode);
        }

        const afterDesc = fastify.tokenStore.getSetDescriptions();
        const afterColl = fastify.tokenStore.getSetCollectionNames();
        const afterMode = fastify.tokenStore.getSetModeNames();
        await fastify.operationLog.record({
          type: 'set-metadata',
          description: `Update metadata for set "${name}"`,
          setName: name,
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          metadata: {
            kind: 'set-metadata',
            name,
            before: beforeMeta,
            after: { description: afterDesc[name], collectionName: afterColl[name], modeName: afterMode[name] },
          },
        });
        return { updated: true, name, description };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to update metadata');
      }
    });
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

    return withLock(async () => {
      try {
        await fastify.tokenStore.renameSet(name, newName);
        await fastify.generatorService.updateSetName(name, newName);
        await fastify.operationLog.record({
          type: 'set-rename',
          description: `Rename set "${name}" → "${newName}"`,
          setName: newName,
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: [{ action: 'rename-set', from: newName, to: name }],
        });
        return { renamed: true, oldName: name, newName };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to rename set');
      }
    });
  });

  // PUT /api/sets/reorder — reorder sets
  fastify.put<{ Body: { order: string[] } }>('/sets/reorder', async (request, reply) => {
    const { order } = request.body || {};
    if (!Array.isArray(order)) {
      return reply.status(400).send({ error: 'order must be an array of set names' });
    }
    return withLock(async () => {
      const previousOrder = await fastify.tokenStore.getSets();
      fastify.tokenStore.reorderSets(order);
      await fastify.operationLog.record({
        type: 'set-reorder',
        description: 'Reorder token sets',
        setName: '',
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        rollbackSteps: [{ action: 'reorder-sets', order: previousOrder }],
      });
      return { reordered: true };
    });
  });

  // DELETE /api/data — wipe all sets and themes (danger zone)
  // Requires body: { confirm: "DELETE" } to prevent accidental calls
  fastify.delete<{ Body: { confirm?: string } }>('/data', async (request, reply) => {
    if (request.body?.confirm !== 'DELETE') {
      return reply.status(400).send({ error: 'Missing confirmation — send { confirm: "DELETE" } in the request body' });
    }
    return withLock(async () => {
      try {
        await fastify.tokenStore.clearAll();
        return { cleared: true };
      } catch (err) {
        return reply.status(500).send({ error: 'Failed to clear data', detail: String(err) });
      }
    });
  });

  // DELETE /api/sets/:name — delete a set
  fastify.delete<{ Params: { name: string } }>('/sets/:name', async (request, reply) => {
    const { name } = request.params;
    return withLock(async () => {
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

        const beforeSnap = await snapshotSet(fastify.tokenStore, name);
        const deleted = await fastify.tokenStore.deleteSet(name);
        if (!deleted) {
          return reply.status(404).send({ error: `Token set "${name}" not found` });
        }
        await fastify.operationLog.record({
          type: 'set-delete',
          description: `Delete set "${name}"`,
          setName: name,
          affectedPaths: Object.keys(beforeSnap),
          beforeSnapshot: beforeSnap,
          afterSnapshot: {},
          rollbackSteps: [{ action: 'create-set', name }],
        });
        return { deleted: true, name };
      } catch (err) {
        return reply.status(500).send({ error: 'Failed to delete set', detail: String(err) });
      }
    });
  });
};
