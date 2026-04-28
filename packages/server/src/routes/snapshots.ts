import type { FastifyPluginAsync } from 'fastify';
import { handleRouteError } from '../errors.js';
import { snapshotCollections } from '../services/operation-log.js';
import type { ResolverFile } from '@tokenmanager/core';

type SnapshotRouteContext = {
  resolverLock: {
    withLock<T>(fn: () => Promise<T>): Promise<T>;
  };
  resolverStore: {
    getAllFiles(): Record<string, ResolverFile>;
  };
};

async function captureCurrentResolvers(
  fastify: SnapshotRouteContext,
): Promise<Record<string, ResolverFile>> {
  return fastify.resolverLock.withLock(async () => fastify.resolverStore.getAllFiles());
}

export const snapshotRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  // POST /api/snapshots — save current state
  fastify.post<{ Body: { label?: string } }>('/snapshots', async (request, reply) => {
    try {
      const body = request.body;
      const isObj = typeof body === 'object' && body !== null && !Array.isArray(body);
      const rawLabel = isObj ? (body as Record<string, unknown>).label : undefined;
      if (rawLabel !== undefined && typeof rawLabel !== 'string') {
        return reply.status(400).send({ error: 'label must be a string' });
      }
      const label = (typeof rawLabel === 'string' ? rawLabel.trim() : '')
        || `Snapshot ${new Date().toLocaleString()}`;
      return await withLock(async () => {
        const entry = await fastify.manualSnapshots.save(
          label,
          fastify.tokenStore,
          fastify.collectionService,
          fastify.resolverStore,
          fastify.generatorService,
          fastify.lintConfigStore,
        );
        return reply.status(201).send({
          ok: true,
          id: entry.id,
          label: entry.label,
          timestamp: entry.timestamp,
        });
      });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // GET /api/snapshots — list saved snapshots
  fastify.get('/snapshots', async (_request, reply) => {
    try {
      const list = await fastify.manualSnapshots.list();
      return { snapshots: list };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to list snapshots');
    }
  });

  // DELETE /api/snapshots/:id
  fastify.delete<{ Params: { id: string } }>('/snapshots/:id', async (request, reply) => {
    try {
      const deleted = await fastify.manualSnapshots.delete(request.params.id);
      if (!deleted) return reply.status(404).send({ error: 'Snapshot not found' });
      return { ok: true };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to delete snapshot');
    }
  });

  // GET /api/snapshots/:idA/compare/:idB — compare two snapshots against each other
  fastify.get<{ Params: { idA: string; idB: string } }>('/snapshots/:idA/compare/:idB', async (request, reply) => {
    try {
      const comparison = await fastify.manualSnapshots.diffSnapshots(request.params.idA, request.params.idB);
      return comparison;
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // GET /api/snapshots/:id/diff — compare with current state
  fastify.get<{ Params: { id: string } }>('/snapshots/:id/diff', async (request, reply) => {
    try {
      const comparison = await fastify.manualSnapshots.diff(
        request.params.id,
        fastify.tokenStore,
        fastify.collectionService,
        fastify.resolverStore,
        fastify.generatorService,
        fastify.lintConfigStore,
      );
      return comparison;
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // POST /api/snapshots/:id/restore — revert to saved snapshot
  fastify.post<{ Params: { id: string } }>('/snapshots/:id/restore', async (request, reply) => {
    try {
      return await withLock(async () => {
        // Look up snapshot metadata for the description
        const snapshot = await fastify.manualSnapshots.get(request.params.id);
        if (!snapshot) {
          return reply.status(404).send({ error: 'Snapshot not found' });
        }

        // Snapshot current state of all affected collections for undo
        const snapshotCollectionIds = Object.keys(snapshot.data);
        const beforeCollectionState = await fastify.collectionService.loadState();
        const currentCollections = beforeCollectionState.collections.map(
          (collection) => collection.id,
        );
        const beforeSnapshot = await snapshotCollections(
          fastify.tokenStore,
          [...new Set([...snapshotCollectionIds, ...currentCollections])],
        );

        const beforeResolvers = await captureCurrentResolvers(fastify);
        const beforeGenerators = await fastify.generatorService.list();
        const beforeLintConfig = await fastify.lintConfigStore.get();

        // Perform the restore
        const result = await fastify.manualSnapshots.restore(
          request.params.id,
          fastify.collectionService,
          fastify.resolverStore,
          fastify.generatorService,
          fastify.lintConfigStore,
          {
            collectionIds: currentCollections,
            collections: beforeCollectionState.collections,
            resolvers: beforeResolvers,
            generators: beforeGenerators,
            lintConfig: beforeLintConfig,
          },
        );

        // Snapshot after state
        const afterCollectionIds = (
          await fastify.collectionService.loadState()
        ).collections.map((collection) => collection.id);
        const allCollectionIds = new Set([
          ...snapshotCollectionIds,
          ...currentCollections,
          ...afterCollectionIds,
        ]);
        const afterSnapshot = await snapshotCollections(
          fastify.tokenStore,
          [...allCollectionIds],
        );

        // Record in operation log for undo support
        const allPaths = [...new Set([...Object.keys(beforeSnapshot), ...Object.keys(afterSnapshot)])];
        const opEntry = await fastify.operationLog.record({
          type: 'snapshot-restore',
          description: `Restore snapshot "${snapshot.label}"`,
          resourceId: Array.from(allCollectionIds).join(', '),
          affectedPaths: allPaths,
          beforeSnapshot,
          afterSnapshot,
          rollbackSteps: result.rollbackSteps,
        });

        return {
          ok: true,
          restoredCollections: result.restoredCollections,
          deletedCollections: result.deletedCollections,
          restoredCollectionState: result.restoredCollectionState,
          restoredResolvers: result.restoredResolvers,
          deletedResolvers: result.deletedResolvers,
          operationId: opEntry.id,
        };
      });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });
};
