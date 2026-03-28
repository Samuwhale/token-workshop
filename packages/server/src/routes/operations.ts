import type { FastifyPluginAsync } from 'fastify';
import { handleRouteError } from '../errors.js';

export const operationRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  // GET /api/operations — list recent operations
  fastify.get<{ Querystring: { limit?: string } }>('/operations', async (request) => {
    const limit = Math.min(Math.max(1, parseInt(request.query.limit ?? '5', 10) || 5), 50);
    return { operations: await fastify.operationLog.getRecent(limit) };
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
        return result;
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });
};
