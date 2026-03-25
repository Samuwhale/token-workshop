import type { FastifyPluginAsync } from 'fastify';
import { LintConfigStore, lintTokens, DEFAULT_LINT_CONFIG } from '../services/lint.js';
import type { LintConfig } from '../services/lint.js';

declare module 'fastify' {
  interface FastifyInstance {
    lintConfigStore: LintConfigStore;
  }
}

export const lintRoutes: FastifyPluginAsync<{ tokenDir: string }> = async (fastify, opts) => {
  const lintConfigStore = new LintConfigStore(opts.tokenDir);
  fastify.decorate('lintConfigStore', lintConfigStore);

  // GET /api/lint/config — get current lint configuration
  fastify.get('/lint/config', async () => {
    return lintConfigStore.get();
  });

  // PUT /api/lint/config — update lint configuration
  fastify.put<{ Body: Partial<LintConfig> }>('/lint/config', async (request) => {
    return lintConfigStore.update(request.body ?? {});
  });

  // GET /api/lint/config/default — get default lint configuration
  fastify.get('/lint/config/default', async () => {
    return DEFAULT_LINT_CONFIG;
  });

  // POST /api/tokens/lint — lint a set and return violations
  fastify.post<{ Body: { set: string } }>('/tokens/lint', async (request, reply) => {
    const { set } = request.body ?? {};
    if (!set) {
      return reply.status(400).send({ error: 'set is required' });
    }
    const tokenSet = await fastify.tokenStore.getSet(set);
    if (!tokenSet) {
      return reply.status(404).send({ error: `Token set "${set}" not found` });
    }
    try {
      const config = await lintConfigStore.get();
      const violations = await lintTokens(set, fastify.tokenStore, config);
      return { set, violations, count: violations.length };
    } catch (err) {
      return reply.status(500).send({ error: 'Lint failed', detail: String(err) });
    }
  });
};
