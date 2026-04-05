import type { FastifyPluginAsync } from 'fastify';
import { handleRouteError } from '../errors.js';

export const operationRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  // GET /api/operations — list recent operations
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/operations', async (request, reply) => {
    try {
      const limit = Math.min(Math.max(1, parseInt(request.query.limit ?? '10', 10) || 10), 50);
      const offset = Math.max(0, parseInt(request.query.offset ?? '0', 10) || 0);
      const { entries, total } = await fastify.operationLog.getRecent(limit, offset);
      return { operations: entries, total, hasMore: offset + entries.length < total };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to list operations');
    }
  });

  // GET /api/operations/token-history — value timeline for a specific token path
  // Must be registered before /operations/:id/rollback to avoid :id capturing "token-history"
  fastify.get<{
    Querystring: { path?: string; limit?: string; offset?: string };
  }>('/operations/token-history', async (request, reply) => {
    try {
      const tokenPath = request.query.path;
      if (!tokenPath) {
        reply.code(400);
        return { error: 'Missing required query param: path' };
      }
      const limit = Math.min(Math.max(1, parseInt(request.query.limit ?? '20', 10) || 20), 100);
      const offset = Math.max(0, parseInt(request.query.offset ?? '0', 10) || 0);
      const { entries, total } = await fastify.operationLog.getTokenHistory(tokenPath, limit, offset);
      return { entries, total, hasMore: offset + entries.length < total };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get token history');
    }
  });

  // POST /api/operations/:id/rollback — rollback an operation
  fastify.post<{ Params: { id: string } }>('/operations/:id/rollback', async (request, reply) => {
    return withLock(async () => {
      try {
        const result = await fastify.operationLog.rollback(request.params.id, {
          tokenStore: fastify.tokenStore,
          themesStore: fastify.dimensionsStore,
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
