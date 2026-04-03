import type { FastifyPluginAsync } from 'fastify';
import { LintConfigStore, lintTokens, validateAllTokens, DEFAULT_LINT_CONFIG } from '../services/lint.js';
import type { LintConfig } from '../services/lint.js'; // used by PUT /lint/config body type

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
  fastify.put<{ Body: unknown }>('/lint/config', async (request, reply) => {
    const body = request.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return reply.status(400).send({ error: 'Request body must be a JSON object' });
    }
    const b = body as Record<string, unknown>;
    const KNOWN_TOP_KEYS = new Set(['lintRules']);
    for (const key of Object.keys(b)) {
      if (!KNOWN_TOP_KEYS.has(key)) {
        return reply.status(400).send({ error: `Unknown lint config field: "${key}"` });
      }
    }
    if ('lintRules' in b) {
      const rules = b.lintRules;
      if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
        return reply.status(400).send({ error: '"lintRules" must be an object' });
      }
      const KNOWN_RULES = new Set<string>(['no-raw-color', 'require-description', 'path-pattern', 'max-alias-depth', 'no-duplicate-values']);
      const VALID_SEVERITIES = new Set<string>(['error', 'warning', 'info']);
      for (const [ruleKey, ruleVal] of Object.entries(rules as Record<string, unknown>)) {
        if (!KNOWN_RULES.has(ruleKey)) {
          return reply.status(400).send({ error: `Unknown lint rule: "${ruleKey}"` });
        }
        if (typeof ruleVal !== 'object' || ruleVal === null || Array.isArray(ruleVal)) {
          return reply.status(400).send({ error: `Lint rule "${ruleKey}" must be an object` });
        }
        const rv = ruleVal as Record<string, unknown>;
        if ('enabled' in rv && typeof rv.enabled !== 'boolean') {
          return reply.status(400).send({ error: `Lint rule "${ruleKey}.enabled" must be a boolean` });
        }
        if ('severity' in rv && rv.severity !== undefined && !VALID_SEVERITIES.has(rv.severity as string)) {
          return reply.status(400).send({ error: `Lint rule "${ruleKey}.severity" must be "error", "warning", or "info"` });
        }
        if ('options' in rv && rv.options !== undefined && (typeof rv.options !== 'object' || Array.isArray(rv.options) || rv.options === null)) {
          return reply.status(400).send({ error: `Lint rule "${ruleKey}.options" must be an object` });
        }
      }
    }
    const cfg = await lintConfigStore.update(b as Partial<LintConfig>);
    return { ok: true, ...cfg };
  });

  // POST /api/tokens/validate — validate all tokens across all sets
  fastify.post('/tokens/validate', async (_request, reply) => {
    try {
      const config = await lintConfigStore.get();
      const issues = await validateAllTokens(fastify.tokenStore, config);
      const errors = issues.filter(i => i.severity === 'error').length;
      const warnings = issues.filter(i => i.severity === 'warning').length;
      return { issues, summary: { total: issues.length, errors, warnings } };
    } catch (err) {
      return reply.status(500).send({ error: 'Validation failed', detail: String(err) });
    }
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
