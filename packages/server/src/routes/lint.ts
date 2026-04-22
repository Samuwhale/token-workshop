import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  lintAllCollections,
  validateAllTokens,
  DEFAULT_LINT_CONFIG,
  normalizeSuppressionKeys,
} from '../services/lint.js';
import type { LintConfig, LintRuleConfig, LintRuleCollectionOverride } from '../services/lint.js';
import { handleRouteError } from '../errors.js';

const KNOWN_CONFIG_FIELDS = new Set(['lintRules']);
const KNOWN_RULE_IDS = Object.keys(
  DEFAULT_LINT_CONFIG.lintRules,
) as Array<keyof LintConfig['lintRules']>;
const KNOWN_RULES = new Set<string>(KNOWN_RULE_IDS);
const KNOWN_RULE_FIELDS = new Set(['enabled', 'severity', 'options', 'excludePaths', 'collectionOverrides']);
const KNOWN_OVERRIDE_FIELDS = new Set(['enabled', 'severity', 'options']);
const VALID_SEVERITIES = new Set(['error', 'warning', 'info']);

type KnownRuleId = (typeof KNOWN_RULE_IDS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKnownRuleId(value: string): value is KnownRuleId {
  return KNOWN_RULES.has(value);
}

function normalizeStringArray(values: unknown[], label: string): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!values.every(value => typeof value === 'string')) {
    return { ok: false, error: `${label} must be an array of strings` };
  }

  const normalized = Array.from(
    new Set(
      values
        .map(value => value.trim())
        .filter(Boolean),
    ),
  );

  if (normalized.length !== values.length) {
    return { ok: false, error: `${label} must not include blank or duplicate values` };
  }

  return { ok: true, value: normalized };
}

async function buildKnownExceptionScopes(fastify: FastifyInstance): Promise<Set<string>> {
  const scopes = new Set<string>();
  const collectionIds = await fastify.collectionService.listCollectionIds();

  for (const collectionId of collectionIds) {
    const flatTokens = await fastify.tokenStore.getFlatTokensForCollection(collectionId);
    for (const tokenPath of Object.keys(flatTokens)) {
      const segments = tokenPath.split('.').filter(Boolean);
      for (let depth = 1; depth <= segments.length; depth += 1) {
        scopes.add(segments.slice(0, depth).join('.'));
      }
    }
  }

  return scopes;
}

function validateOverride(
  ruleKey: string,
  collectionId: string,
  overrideValue: unknown,
  currentOverride: LintRuleCollectionOverride | undefined,
): { ok: true; value: LintRuleCollectionOverride } | { ok: false; error: string } {
  if (!isRecord(overrideValue)) {
    return { ok: false, error: `Lint rule "${ruleKey}.collectionOverrides["${collectionId}"]" must be an object` };
  }

  for (const key of Object.keys(overrideValue)) {
    if (!KNOWN_OVERRIDE_FIELDS.has(key)) {
      return { ok: false, error: `Unknown lint override field: "${ruleKey}.collectionOverrides["${collectionId}"].${key}"` };
    }
  }

  const sanitized: LintRuleCollectionOverride = { ...(currentOverride ?? {}) };

  if ('enabled' in overrideValue) {
    if (typeof overrideValue.enabled !== 'boolean') {
      return { ok: false, error: `Lint rule "${ruleKey}.collectionOverrides["${collectionId}"].enabled" must be a boolean` };
    }
    sanitized.enabled = overrideValue.enabled;
  }

  if ('severity' in overrideValue && overrideValue.severity !== undefined) {
    if (!VALID_SEVERITIES.has(String(overrideValue.severity))) {
      return { ok: false, error: `Lint rule "${ruleKey}.collectionOverrides["${collectionId}"].severity" must be "error", "warning", or "info"` };
    }
    sanitized.severity = overrideValue.severity as LintRuleCollectionOverride['severity'];
  }

  if ('options' in overrideValue && overrideValue.options !== undefined) {
    if (!isRecord(overrideValue.options)) {
      return { ok: false, error: `Lint rule "${ruleKey}.collectionOverrides["${collectionId}"].options" must be an object` };
    }
    sanitized.options = overrideValue.options;
  }

  return { ok: true, value: sanitized };
}

function validateRuleConfig(
  ruleKey: string,
  ruleValue: unknown,
  knownCollections: Set<string>,
  knownScopes: Set<string>,
  currentRule: LintRuleConfig | undefined,
): { ok: true; value: LintRuleConfig } | { ok: false; error: string } {
  if (!isRecord(ruleValue)) {
    return { ok: false, error: `Lint rule "${ruleKey}" must be an object` };
  }

  for (const key of Object.keys(ruleValue)) {
    if (!KNOWN_RULE_FIELDS.has(key)) {
      return { ok: false, error: `Unknown lint rule field: "${ruleKey}.${key}"` };
    }
  }

  const sanitized: LintRuleConfig = { ...(currentRule ?? { enabled: false }) };

  if ('enabled' in ruleValue) {
    if (typeof ruleValue.enabled !== 'boolean') {
      return { ok: false, error: `Lint rule "${ruleKey}.enabled" must be a boolean` };
    }
    sanitized.enabled = ruleValue.enabled;
  }

  if ('severity' in ruleValue && ruleValue.severity !== undefined) {
    if (!VALID_SEVERITIES.has(String(ruleValue.severity))) {
      return { ok: false, error: `Lint rule "${ruleKey}.severity" must be "error", "warning", or "info"` };
    }
    sanitized.severity = ruleValue.severity as LintRuleConfig['severity'];
  }

  if ('options' in ruleValue && ruleValue.options !== undefined) {
    if (!isRecord(ruleValue.options)) {
      return { ok: false, error: `Lint rule "${ruleKey}.options" must be an object` };
    }
    sanitized.options = ruleValue.options;
  }

  if ('excludePaths' in ruleValue && ruleValue.excludePaths !== undefined) {
    if (!Array.isArray(ruleValue.excludePaths)) {
      return { ok: false, error: `Lint rule "${ruleKey}.excludePaths" must be an array of strings` };
    }
    const normalizedPaths = normalizeStringArray(ruleValue.excludePaths, `Lint rule "${ruleKey}.excludePaths"`);
    if (!normalizedPaths.ok) {
      return normalizedPaths;
    }
    const invalidScope = normalizedPaths.value.find(path => !knownScopes.has(path));
    if (invalidScope) {
      return {
        ok: false,
        error: `Lint rule "${ruleKey}.excludePaths" includes unknown token group "${invalidScope}"`,
      };
    }
    sanitized.excludePaths = normalizedPaths.value;
  }

  if ('collectionOverrides' in ruleValue && ruleValue.collectionOverrides !== undefined) {
    if (!isRecord(ruleValue.collectionOverrides)) {
      return { ok: false, error: `Lint rule "${ruleKey}.collectionOverrides" must be an object` };
    }

    const sanitizedOverrides: Record<string, LintRuleCollectionOverride> = {};
    for (const [collectionId, overrideValue] of Object.entries(ruleValue.collectionOverrides)) {
      if (!knownCollections.has(collectionId)) {
        return { ok: false, error: `Lint rule "${ruleKey}.collectionOverrides" references unknown collection "${collectionId}"` };
      }
      const validatedOverride = validateOverride(ruleKey, collectionId, overrideValue, currentRule?.collectionOverrides?.[collectionId]);
      if (!validatedOverride.ok) {
        return validatedOverride;
      }
      sanitizedOverrides[collectionId] = validatedOverride.value;
    }
    sanitized.collectionOverrides = sanitizedOverrides;
  }

  return { ok: true, value: sanitized };
}

export const lintRoutes: FastifyPluginAsync<{ tokenDir: string }> = async (fastify, opts) => {
  void opts;
  const lintConfigStore = fastify.lintConfigStore;

  fastify.get('/lint/config', async (_request, reply) => {
    try {
      return await lintConfigStore.get();
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get lint config');
    }
  });

  fastify.put<{ Body: unknown }>('/lint/config', async (request, reply) => {
    const body = request.body;
    if (!isRecord(body)) {
      return reply.status(400).send({ error: 'Request body must be a JSON object' });
    }

    for (const key of Object.keys(body)) {
      if (!KNOWN_CONFIG_FIELDS.has(key)) {
        return reply.status(400).send({ error: `Unknown lint config field: "${key}"` });
      }
    }

    const update: Partial<LintConfig> = {};

    if ('lintRules' in body) {
      if (!isRecord(body.lintRules)) {
        return reply.status(400).send({ error: '"lintRules" must be an object' });
      }

      const knownCollections = new Set(
        await fastify.collectionService.listCollectionIds(),
      );
      const knownScopes = await buildKnownExceptionScopes(fastify);
      const currentConfig = await lintConfigStore.get();
      const sanitizedRules: Partial<LintConfig['lintRules']> = {};

      for (const [ruleKey, ruleValue] of Object.entries(body.lintRules)) {
        if (!isKnownRuleId(ruleKey)) {
          return reply.status(400).send({ error: `Unknown lint rule: "${ruleKey}"` });
        }

        const validatedRule = validateRuleConfig(
          ruleKey,
          ruleValue,
          knownCollections,
          knownScopes,
          currentConfig.lintRules[ruleKey],
        );
        if (!validatedRule.ok) {
          return reply.status(400).send({ error: validatedRule.error });
        }

        sanitizedRules[ruleKey] = validatedRule.value;
      }

      update.lintRules = sanitizedRules;
    }

    try {
      const config = await lintConfigStore.update(update);
      return { ok: true, ...config };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to update lint config');
    }
  });

  fastify.post('/tokens/validate', async (_request, reply) => {
    try {
      await fastify.collectionService.loadState();
      const config = await lintConfigStore.get();
      const issues = await validateAllTokens(fastify.tokenStore, config);
      const errors = issues.filter(issue => issue.severity === 'error').length;
      const warnings = issues.filter(issue => issue.severity === 'warning').length;
      return { issues, summary: { total: issues.length, errors, warnings } };
    } catch (err) {
      return handleRouteError(reply, err, 'Validation failed');
    }
  });

  fastify.get('/lint/suppressions', async (_request, reply) => {
    try {
      const suppressions = await lintConfigStore.getSuppressions();
      return { suppressions };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get suppressions');
    }
  });

  fastify.put<{ Body: unknown }>('/lint/suppressions', async (request, reply) => {
    const body = request.body;
    if (!isRecord(body)) {
      return reply.status(400).send({ error: 'Request body must be a JSON object' });
    }
    if (!('suppressions' in body) || !Array.isArray(body.suppressions)) {
      return reply.status(400).send({ error: '"suppressions" must be an array' });
    }
    if (!body.suppressions.every(suppression => typeof suppression === 'string')) {
      return reply.status(400).send({ error: '"suppressions" must be an array of strings' });
    }

    const normalizedSuppressions = normalizeSuppressionKeys(body.suppressions);
    if (normalizedSuppressions.length !== body.suppressions.length) {
      return reply.status(400).send({
        error: '"suppressions" must contain valid, unique suppression keys',
      });
    }

    try {
      await lintConfigStore.setSuppressions(normalizedSuppressions);
      return { ok: true, suppressions: normalizedSuppressions };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to update suppressions');
    }
  });

  fastify.get('/lint/config/default', async (_request, reply) => {
    try {
      return DEFAULT_LINT_CONFIG;
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get default lint config');
    }
  });

  fastify.post('/tokens/lint', async (_request, reply) => {
    try {
      await fastify.collectionService.loadState();
      const config = await lintConfigStore.get();
      const violations = await lintAllCollections(fastify.tokenStore, config);
      return { violations, count: violations.length };
    } catch (err) {
      return handleRouteError(reply, err, 'Lint failed');
    }
  });
};
