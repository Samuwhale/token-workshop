import type { FastifyPluginAsync } from 'fastify';
import { TOKEN_TYPE_VALUES, type Token, type TokenGroup } from '@tokenmanager/core';

function validateTokenBody(body: unknown): body is Partial<Token> {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if ('$type' in b && b.$type !== undefined && !TOKEN_TYPE_VALUES.has(b.$type as string)) return false;
  if ('$description' in b && b.$description !== undefined && typeof b.$description !== 'string') return false;
  if ('$extensions' in b && b.$extensions !== undefined && (typeof b.$extensions !== 'object' || b.$extensions === null || Array.isArray(b.$extensions))) return false;
  return true;
}

export const tokenRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/tokens/resolved — get all resolved tokens
  fastify.get('/tokens/resolved', async (_request, reply) => {
    try {
      const resolved = await fastify.tokenStore.resolveTokens();
      return resolved;
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to resolve tokens', detail: String(err) });
    }
  });

  // GET /api/tokens/:set — get all tokens in a set (flat list with paths)
  fastify.get<{ Params: { set: string } }>('/tokens/:set', async (request, reply) => {
    const { set } = request.params;
    const tokenSet = await fastify.tokenStore.getSet(set);
    if (!tokenSet) {
      return reply.status(404).send({ error: `Token set "${set}" not found` });
    }
    return { set: set, tokens: tokenSet.tokens };
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

  // POST /api/tokens/:set/groups/create — create an empty group at a path
  fastify.post<{ Params: { set: string }; Body: { groupPath: string } }>(
    '/tokens/:set/groups/create',
    async (request, reply) => {
      const { set } = request.params;
      const { groupPath } = request.body ?? {};
      if (!groupPath) {
        return reply.status(400).send({ error: 'groupPath is required' });
      }
      try {
        await fastify.tokenStore.createGroup(set, groupPath);
        return reply.status(201).send({ groupPath, set });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found')) return reply.status(404).send({ error: msg });
        if (msg.includes('already exists')) return reply.status(409).send({ error: msg });
        return reply.status(500).send({ error: msg });
      }
    },
  );

  // POST /api/tokens/:set/bulk-rename — rename tokens by find/replace pattern
  fastify.post<{
    Params: { set: string };
    Body: { find: string; replace: string; isRegex?: boolean };
  }>('/tokens/:set/bulk-rename', async (request, reply) => {
    const { set } = request.params;
    const { find, replace, isRegex } = request.body ?? {};
    if (!find || replace === undefined) {
      return reply.status(400).send({ error: 'find and replace are required' });
    }
    try {
      const result = await fastify.tokenStore.bulkRename(set, find, replace, isRegex);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return reply.status(404).send({ error: msg });
      return reply.status(500).send({ error: msg });
    }
  });

  // POST /api/tokens/:set/batch — upsert multiple tokens in a single request
  fastify.post<{
    Params: { set: string };
    Body: { tokens: Array<{ path: string; $type?: string; $value: unknown; $description?: string; $extensions?: Record<string, unknown> }>; strategy: 'skip' | 'overwrite' };
  }>('/tokens/:set/batch', async (request, reply) => {
    const { set } = request.params;
    const { tokens, strategy } = request.body ?? {};
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return reply.status(400).send({ error: 'tokens must be a non-empty array' });
    }
    if (strategy !== 'skip' && strategy !== 'overwrite') {
      return reply.status(400).send({ error: 'strategy must be "skip" or "overwrite"' });
    }
    for (const t of tokens) {
      if (!t.path || t.$value === undefined) {
        return reply.status(400).send({ error: 'Each token must have a path and $value' });
      }
      if (!validateTokenBody(t)) {
        return reply.status(400).send({ error: `Invalid token body for "${t.path}": $type must be a valid DTCG token type` });
      }
    }
    try {
      const result = await fastify.tokenStore.batchUpsertTokens(
        set,
        tokens.map(t => ({ path: t.path, token: t as Token })),
        strategy,
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return reply.status(404).send({ error: msg });
      return reply.status(500).send({ error: 'Failed to batch upsert tokens', detail: msg });
    }
  });

  // GET /api/tokens/:set/dependents/* — get tokens that reference a given token path (cross-set)
  fastify.get<{ Params: { set: string; '*': string } }>('/tokens/:set/dependents/*', async (request, reply) => {
    const tokenPath = request.params['*'];
    if (!tokenPath) {
      return reply.status(400).send({ error: 'Token path is required' });
    }
    try {
      const dependents = fastify.tokenStore.getDependents(tokenPath);
      return { tokenPath, dependents, count: dependents.length };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to get dependents', detail: String(err) });
    }
  });

  // POST /api/tokens/:set/tokens/rename — rename a single leaf token and update alias references
  fastify.post<{ Params: { set: string }; Body: { oldPath: string; newPath: string } }>(
    '/tokens/:set/tokens/rename',
    async (request, reply) => {
      const { set } = request.params;
      const { oldPath, newPath } = request.body ?? {};
      if (!oldPath || !newPath) {
        return reply.status(400).send({ error: 'oldPath and newPath are required' });
      }
      try {
        const result = await fastify.tokenStore.renameToken(set, oldPath, newPath);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found')) return reply.status(404).send({ error: msg });
        if (msg.includes('already exists')) return reply.status(409).send({ error: msg });
        return reply.status(500).send({ error: msg });
      }
    },
  );

  // POST /api/tokens/:set/tokens/move — move a single token to a different set
  fastify.post<{ Params: { set: string }; Body: { tokenPath: string; targetSet: string } }>(
    '/tokens/:set/tokens/move',
    async (request, reply) => {
      const { set } = request.params;
      const { tokenPath, targetSet } = request.body ?? {};
      if (!tokenPath || !targetSet) {
        return reply.status(400).send({ error: 'tokenPath and targetSet are required' });
      }
      try {
        await fastify.tokenStore.moveToken(set, tokenPath, targetSet);
        return { moved: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found')) return reply.status(404).send({ error: msg });
        return reply.status(500).send({ error: msg });
      }
    },
  );

  // GET /api/tokens/:set/raw — get the raw nested DTCG token group for a set
  fastify.get<{ Params: { set: string } }>('/tokens/:set/raw', async (request, reply) => {
    const { set } = request.params;
    const tokenSet = await fastify.tokenStore.getSet(set);
    if (!tokenSet) {
      return reply.status(404).send({ error: `Token set "${set}" not found` });
    }
    return tokenSet.tokens;
  });

  // PUT /api/tokens/:set — replace all tokens in a set with a new nested DTCG token group
  fastify.put<{ Params: { set: string }; Body: Record<string, unknown> }>(
    '/tokens/:set',
    async (request, reply) => {
      const { set } = request.params;
      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.status(400).send({ error: 'Request body must be a JSON object' });
      }
      try {
        await fastify.tokenStore.replaceSetTokens(set, body as TokenGroup);
        return { set, replaced: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found')) return reply.status(404).send({ error: msg });
        return reply.status(500).send({ error: 'Failed to replace token set', detail: msg });
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
      return reply.status(500).send({ error: 'Failed to get token', detail: String(err) });
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
      if (!validateTokenBody(body)) {
        return reply.status(400).send({ error: 'Invalid token body: $type must be a valid DTCG token type' });
      }

      try {
        // Check if token already exists
        const existing = await fastify.tokenStore.getToken(set, tokenPath);
        if (existing) {
          return reply.status(409).send({ error: `Token "${tokenPath}" already exists in set "${set}"` });
        }

        await fastify.tokenStore.createToken(set, tokenPath, body as Token);
        return reply.status(201).send({ path: tokenPath, set, token: body });
      } catch (err) {
        return reply.status(500).send({ error: 'Failed to create token', detail: String(err) });
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

      const body = request.body;
      if (!validateTokenBody(body)) {
        return reply.status(400).send({ error: 'Invalid token body: $type must be a valid DTCG token type' });
      }

      try {
        await fastify.tokenStore.updateToken(set, tokenPath, body);
        const updated = await fastify.tokenStore.getToken(set, tokenPath);
        return { path: tokenPath, set, token: updated };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('not found')) {
          return reply.status(404).send({ error: message });
        }
        return reply.status(500).send({ error: 'Failed to update token', detail: message });
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
      return reply.status(500).send({ error: 'Failed to delete token', detail: String(err) });
    }
  });
};
