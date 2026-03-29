import type { FastifyPluginAsync } from 'fastify';
import { handleRouteError } from '../errors.js';

export const operationRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  // GET /api/operations — list recent operations
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/operations', async (request) => {
    const limit = Math.min(Math.max(1, parseInt(request.query.limit ?? '10', 10) || 10), 50);
    const offset = Math.max(0, parseInt(request.query.offset ?? '0', 10) || 0);
    const { entries, total } = await fastify.operationLog.getRecent(limit, offset);
    return { operations: entries, total, hasMore: offset + entries.length < total };
  });

  // POST /api/operations/:id/rollback — rollback an operation
  fastify.post<{ Params: { id: string } }>('/operations/:id/rollback', async (request, reply) => {
    return withLock(async () => {
      try {
        const result = await fastify.operationLog.rollback(request.params.id, {
          tokenStore: fastify.tokenStore,
          resolverStore: fastify.resolverStore,
          generatorService: fastify.generatorService,
        });
        return { ok: true, ...result };
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });
};
