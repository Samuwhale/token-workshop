import type { FastifyPluginAsync } from 'fastify';
import { LintConfigStore, lintTokens, validateAllTokens, DEFAULT_LINT_CONFIG } from '../services/lint.js';
import type { LintConfig } from '../services/lint.js'; // used by PUT /lint/config body type
import { handleRouteError } from '../errors.js';

declare module 'fastify' {
  interface FastifyInstance {
    lintConfigStore: LintConfigStore;
  }
}

export const lintRoutes: FastifyPluginAsync<{ tokenDir: string }> = async (fastify, opts) => {
  const lintConfigStore = new LintConfigStore(opts.tokenDir);
  fastify.decorate('lintConfigStore', lintConfigStore);

  // GET /api/lint/config — get current lint configuration
  fastify.get('/lint/config', async (_request, reply) => {
    try {
      return await lintConfigStore.get();
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get lint config');
    }
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
        if ('excludePaths' in rv && rv.excludePaths !== undefined) {
          if (!Array.isArray(rv.excludePaths) || !(rv.excludePaths as unknown[]).every(p => typeof p === 'string')) {
            return reply.status(400).send({ error: `Lint rule "${ruleKey}.excludePaths" must be an array of strings` });
          }
        }
        if ('setOverrides' in rv && rv.setOverrides !== undefined) {
          if (typeof rv.setOverrides !== 'object' || Array.isArray(rv.setOverrides) || rv.setOverrides === null) {
            return reply.status(400).send({ error: `Lint rule "${ruleKey}.setOverrides" must be an object` });
          }
          for (const [setName, setVal] of Object.entries(rv.setOverrides as Record<string, unknown>)) {
            if (typeof setVal !== 'object' || setVal === null || Array.isArray(setVal)) {
              return reply.status(400).send({ error: `Lint rule "${ruleKey}.setOverrides["${setName}"]" must be an object` });
            }
            const sv = setVal as Record<string, unknown>;
            if ('enabled' in sv && typeof sv.enabled !== 'boolean') {
              return reply.status(400).send({ error: `Lint rule "${ruleKey}.setOverrides["${setName}"].enabled" must be a boolean` });
            }
            if ('severity' in sv && sv.severity !== undefined && !VALID_SEVERITIES.has(sv.severity as string)) {
              return reply.status(400).send({ error: `Lint rule "${ruleKey}.setOverrides["${setName}"].severity" must be "error", "warning", or "info"` });
            }
          }
        }
      }
    }
    try {
      const cfg = await lintConfigStore.update(b as Partial<LintConfig>);
      return { ok: true, ...cfg };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to update lint config');
    }
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
      return handleRouteError(reply, err, 'Validation failed');
    }
  });

  // GET /api/lint/suppressions — get current server-persisted suppression keys
  fastify.get('/lint/suppressions', async (_request, reply) => {
    try {
      const suppressions = await lintConfigStore.getSuppressions();
      return { suppressions };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get suppressions');
    }
  });

  // PUT /api/lint/suppressions — replace the full set of suppression keys
  fastify.put<{ Body: unknown }>('/lint/suppressions', async (request, reply) => {
    const body = request.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return reply.status(400).send({ error: 'Request body must be a JSON object' });
    }
    const b = body as Record<string, unknown>;
    if (!('suppressions' in b) || !Array.isArray(b.suppressions)) {
      return reply.status(400).send({ error: '"suppressions" must be an array' });
    }
    if (!(b.suppressions as unknown[]).every(s => typeof s === 'string')) {
      return reply.status(400).send({ error: '"suppressions" must be an array of strings' });
    }
    try {
      await lintConfigStore.setSuppressions(b.suppressions as string[]);
      return { ok: true, suppressions: b.suppressions };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to update suppressions');
    }
  });

  // GET /api/lint/config/default — get default lint configuration
  fastify.get('/lint/config/default', async (_request, reply) => {
    try {
      return DEFAULT_LINT_CONFIG;
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get default lint config');
    }
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
      return handleRouteError(reply, err, 'Lint failed');
    }
  });
};
