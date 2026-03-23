import type { FastifyPluginAsync } from 'fastify';

export const tokenRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/tokens/resolved — get all resolved tokens
  fastify.get('/tokens/resolved', async (_request, reply) => {
    try {
      const resolved = await fastify.tokenStore.resolveTokens();
      return resolved;
    } catch (err) {
      reply.status(500).send({ error: 'Failed to resolve tokens', detail: String(err) });
    }
  });

  // GET /api/tokens/:set — get all tokens in a set (flat list with paths)
  fastify.get<{ Params: { set: string } }>('/tokens/:set', async (request, reply) => {
    const { set } = request.params;
    const tokenSet = await fastify.tokenStore.getSet(set);
    if (!tokenSet) {
      return reply.status(404).send({ error: `Token set "${set}" not found` });
    }
    const flat = await fastify.tokenStore.getFlatTokensForSet(set);
    return { set: set, tokens: flat };
  });

  // GET /api/tokens/:set/* — get single token by path
  fastify.get<{ Params: { set: string; '*': string } }>('/tokens/:set/*', async (request, reply) => {
    const { set } = request.params;
    const tokenPath = request.params['*'];
    if (!tokenPath) {
      return reply.status(400).send({ error: 'Token path is required' });
    }

    try {
      const token = await fastify.tokenStore.getToken(set, tokenPath);
      if (!token) {
        return reply.status(404).send({ error: `Token "${tokenPath}" not found in set "${set}"` });
      }

      // Also try to resolve it
      const resolved = await fastify.tokenStore.resolveToken(tokenPath);
      return { path: tokenPath, token, resolved: resolved?.$value ?? null };
    } catch (err) {
      reply.status(500).send({ error: 'Failed to get token', detail: String(err) });
    }
  });

  // POST /api/tokens/:set/* — create token
  fastify.post<{ Params: { set: string; '*': string }; Body: { $value: unknown; $type?: string; $description?: string; $extensions?: Record<string, unknown> } }>(
    '/tokens/:set/*',
    async (request, reply) => {
      const { set } = request.params;
      const tokenPath = request.params['*'];
      if (!tokenPath) {
        return reply.status(400).send({ error: 'Token path is required' });
      }

      const body = request.body;
      if (!body || body.$value === undefined) {
        return reply.status(400).send({ error: 'Token must have a $value property' });
      }

      try {
        // Check if token already exists
        const existing = await fastify.tokenStore.getToken(set, tokenPath);
        if (existing) {
          return reply.status(409).send({ error: `Token "${tokenPath}" already exists in set "${set}"` });
        }

        await fastify.tokenStore.createToken(set, tokenPath, body as any);
        reply.status(201).send({ path: tokenPath, set, token: body });
      } catch (err) {
        reply.status(500).send({ error: 'Failed to create token', detail: String(err) });
      }
    },
  );

  // PATCH /api/tokens/:set/* — update token
  fastify.patch<{ Params: { set: string; '*': string }; Body: { $value?: unknown; $type?: string; $description?: string; $extensions?: Record<string, unknown> } }>(
    '/tokens/:set/*',
    async (request, reply) => {
      const { set } = request.params;
      const tokenPath = request.params['*'];
      if (!tokenPath) {
        return reply.status(400).send({ error: 'Token path is required' });
      }

      try {
        await fastify.tokenStore.updateToken(set, tokenPath, request.body as any);
        const updated = await fastify.tokenStore.getToken(set, tokenPath);
        return { path: tokenPath, set, token: updated };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('not found')) {
          return reply.status(404).send({ error: message });
        }
        reply.status(500).send({ error: 'Failed to update token', detail: message });
      }
    },
  );

  // DELETE /api/tokens/:set/* — delete token
  fastify.delete<{ Params: { set: string; '*': string } }>('/tokens/:set/*', async (request, reply) => {
    const { set } = request.params;
    const tokenPath = request.params['*'];
    if (!tokenPath) {
      return reply.status(400).send({ error: 'Token path is required' });
    }

    try {
      const deleted = await fastify.tokenStore.deleteToken(set, tokenPath);
      if (!deleted) {
        return reply.status(404).send({ error: `Token "${tokenPath}" not found in set "${set}"` });
      }
      return { deleted: true, path: tokenPath, set };
    } catch (err) {
      reply.status(500).send({ error: 'Failed to delete token', detail: String(err) });
    }
  });
};
