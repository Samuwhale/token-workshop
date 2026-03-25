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

  // POST /api/tokens/:set/groups/rename — rename a group (updates all token paths and alias refs)
  fastify.post<{ Params: { set: string }; Body: { oldGroupPath: string; newGroupPath: string } }>(
    '/tokens/:set/groups/rename',
    async (request, reply) => {
      const { set } = request.params;
      const { oldGroupPath, newGroupPath } = request.body ?? {};
      if (!oldGroupPath || !newGroupPath) {
        return reply.status(400).send({ error: 'oldGroupPath and newGroupPath are required' });
      }
      try {
        const result = await fastify.tokenStore.renameGroup(set, oldGroupPath, newGroupPath);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found') || msg.includes('is empty')) return reply.status(404).send({ error: msg });
        if (msg.includes('already exists')) return reply.status(409).send({ error: msg });
        return reply.status(500).send({ error: msg });
      }
    },
  );

  // POST /api/tokens/:set/groups/move — move a group to a different set
  fastify.post<{ Params: { set: string }; Body: { groupPath: string; targetSet: string } }>(
    '/tokens/:set/groups/move',
    async (request, reply) => {
      const { set } = request.params;
      const { groupPath, targetSet } = request.body ?? {};
      if (!groupPath || !targetSet) {
        return reply.status(400).send({ error: 'groupPath and targetSet are required' });
      }
      try {
        const result = await fastify.tokenStore.moveGroup(set, groupPath, targetSet);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found') || msg.includes('is empty')) return reply.status(404).send({ error: msg });
        return reply.status(500).send({ error: msg });
      }
    },
  );

  // POST /api/tokens/:set/groups/duplicate — duplicate a group with a -copy suffix
  fastify.post<{ Params: { set: string }; Body: { groupPath: string } }>(
    '/tokens/:set/groups/duplicate',
    async (request, reply) => {
      const { set } = request.params;
      const { groupPath } = request.body ?? {};
      if (!groupPath) {
        return reply.status(400).send({ error: 'groupPath is required' });
      }
      try {
        const result = await fastify.tokenStore.duplicateGroup(set, groupPath);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found') || msg.includes('is empty')) return reply.status(404).send({ error: msg });
        return reply.status(500).send({ error: msg });
      }
    },
  );

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
