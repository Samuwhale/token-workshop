import type { FastifyPluginAsync } from 'fastify';
import { handleRouteError } from '../errors.js';
import { snapshotSet } from '../services/operation-log.js';

export const snapshotRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  // POST /api/snapshots — save current state
  fastify.post<{ Body: { label?: string } }>('/snapshots', async (request, reply) => {
    try {
      const label = (request.body as { label?: string })?.label?.trim()
        || `Snapshot ${new Date().toLocaleString()}`;
      return await withLock(async () => {
        const entry = await fastify.manualSnapshots.save(label, fastify.tokenStore);
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
  fastify.get('/snapshots', async () => {
    const list = await fastify.manualSnapshots.list();
    return { snapshots: list };
  });

  // DELETE /api/snapshots/:id
  fastify.delete<{ Params: { id: string } }>('/snapshots/:id', async (request, reply) => {
    const deleted = await fastify.manualSnapshots.delete(request.params.id);
    if (!deleted) return reply.status(404).send({ error: 'Snapshot not found' });
    return { ok: true };
  });

  // GET /api/snapshots/:id/diff — compare with current state
  fastify.get<{ Params: { id: string } }>('/snapshots/:id/diff', async (request, reply) => {
    try {
      const diffs = await fastify.manualSnapshots.diff(request.params.id, fastify.tokenStore);
      return { diffs };
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

        // Snapshot current state of all affected sets for undo
        const affectedSets = Object.keys(snapshot.data);
        const beforeSnapshot: Record<string, { token: import('@tokenmanager/core').Token | null; setName: string }> = {};
        for (const setName of affectedSets) {
          Object.assign(beforeSnapshot, await snapshotSet(fastify.tokenStore, setName));
        }
        // Also snapshot sets that exist currently but aren't in the snapshot (they'll lose tokens)
        const currentSets = await fastify.tokenStore.getSets();
        for (const setName of currentSets) {
          if (!affectedSets.includes(setName)) {
            Object.assign(beforeSnapshot, await snapshotSet(fastify.tokenStore, setName));
          }
        }

        // Perform the restore
        const result = await fastify.manualSnapshots.restore(request.params.id, fastify.tokenStore);

        // Snapshot after state
        const afterSnapshot: Record<string, { token: import('@tokenmanager/core').Token | null; setName: string }> = {};
        const afterSets = await fastify.tokenStore.getSets();
        const allSets = new Set([...affectedSets, ...currentSets, ...afterSets]);
        for (const setName of allSets) {
          Object.assign(afterSnapshot, await snapshotSet(fastify.tokenStore, setName));
        }

        // Record in operation log for undo support
        const allPaths = [...new Set([...Object.keys(beforeSnapshot), ...Object.keys(afterSnapshot)])];
        const opEntry = await fastify.operationLog.record({
          type: 'snapshot-restore',
          description: `Restore snapshot "${snapshot.label}"`,
          setName: affectedSets.join(', '),
          affectedPaths: allPaths,
          beforeSnapshot,
          afterSnapshot,
        });

        return { ok: true, ...result, operationId: opEntry.id };
      });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });
};
