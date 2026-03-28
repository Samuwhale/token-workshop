import type { FastifyPluginAsync } from 'fastify';

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
        const result = await fastify.operationLog.rollback(request.params.id, fastify.tokenStore);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found')) return reply.status(404).send({ error: msg });
        if (msg.includes('already rolled back')) return reply.status(409).send({ error: msg });
        return reply.status(500).send({ error: msg });
      }
    });
  });
};
