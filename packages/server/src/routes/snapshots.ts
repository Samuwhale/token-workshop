import type { FastifyPluginAsync } from 'fastify';
import { handleRouteError } from '../errors.js';

export const snapshotRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/snapshots — save current state
  fastify.post<{ Body: { label?: string } }>('/snapshots', async (request, reply) => {
    const label = (request.body as { label?: string })?.label?.trim()
      || `Snapshot ${new Date().toLocaleString()}`;
    const entry = await fastify.manualSnapshots.save(label, fastify.tokenStore);
    return reply.status(201).send({
      id: entry.id,
      label: entry.label,
      timestamp: entry.timestamp,
    });
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
      const result = await fastify.manualSnapshots.restore(request.params.id, fastify.tokenStore);
      return result;
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });
};
