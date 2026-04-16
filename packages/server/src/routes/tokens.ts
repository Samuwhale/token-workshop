import type { FastifyPluginAsync } from 'fastify';
import { TOKEN_TYPE_VALUES, TokenValidator, isReference, parseReference, type Token, type TokenGroup } from '@tokenmanager/core';
import { handleRouteError } from '../errors.js';
import type { SnapshotEntry } from '../services/operation-log.js';
import {
  listChangedSnapshotKeys,
  listChangedSnapshotTokenPaths,
  pickSnapshotEntries,
  qualifySnapshotEntries,
  snapshotPaths,
  snapshotSet,
  snapshotGroup,
} from '../services/operation-log.js';
import {
  batchCopyTokensCommand,
  batchMoveTokensCommand,
  batchRenameTokensCommand,
  copyGroupCommand,
  copyTokenCommand,
  moveGroupCommand,
  moveTokenCommand,
  renameGroupCommand,
  renameTokenCommand,
} from '../services/token-mutation-commands.js';
import { stableStringify } from '../services/stable-stringify.js';

interface TokenMutationRouteBody {
  $type?: string;
  $value?: unknown;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

interface BatchTokenMutationRouteBody extends TokenMutationRouteBody {
  path: string;
  $scopes?: string[];
}

function validateTokenBody(body: unknown): body is TokenMutationRouteBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if ('$type' in b && b.$type !== undefined && !TOKEN_TYPE_VALUES.has(b.$type as string)) return false;
  if ('$description' in b && b.$description !== undefined && typeof b.$description !== 'string') return false;
  if ('$extensions' in b && b.$extensions !== undefined && (typeof b.$extensions !== 'object' || b.$extensions === null || Array.isArray(b.$extensions))) return false;
  return true;
}

const _tokenValidator = new TokenValidator();

/**
 * Validate a token $value against its declared $type.
 * Returns null on success, or an error string on failure.
 * Skips validation when type is absent or the value is a reference/formula.
 */
function validateTokenValue(value: unknown, type: string, path: string): string | null {
  const result = _tokenValidator.validate({ $value: value, $type: type } as Token, path);
  return result.valid ? null : result.errors.map(e => e.replace(`${path}: `, '')).join('; ');
}

const PATH_MAX_LEN = 500;

/** Validates a token path string: non-empty, no leading/trailing whitespace, no leading/trailing/consecutive dots. */
function isValidTokenPath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  if (path.length === 0 || path.length > PATH_MAX_LEN) return false;
  if (path !== path.trim()) return false;
  if (path.startsWith('.') || path.endsWith('.')) return false;
  if (path.includes('..')) return false;
  return true;
}

/** Validates a set name: non-empty string, no leading/trailing whitespace, no null bytes or path traversal. */
function isValidSetName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name !== name.trim()) return false;
  if (name.includes('\0') || name.includes('..')) return false;
  return true;
}

/** Validates a single segment key (direct child name): non-empty string, no leading/trailing whitespace. */
function isNonEmptyTrimmedString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v === v.trim();
}

function wildcardParamToTokenPath(pathParam: string): string {
  return pathParam.split('/').join('.');
}

function mergeSetSnapshot(
  target: Record<string, SnapshotEntry>,
  setName: string,
  snapshot: Record<string, SnapshotEntry>,
): void {
  Object.assign(target, qualifySnapshotEntries(setName, snapshot));
}

function getTokenLifecycle(token: Token): 'draft' | 'published' | 'deprecated' {
  const rawLifecycle = (token.$extensions?.tokenmanager as Record<string, unknown> | undefined)?.lifecycle;
  return rawLifecycle === 'draft' || rawLifecycle === 'deprecated' ? rawLifecycle : 'published';
}

function groupSnapshotEntriesBySet(
  snapshot: Record<string, SnapshotEntry>,
): Map<string, Array<{ path: string; token: Token | null }>> {
  const grouped = new Map<string, Array<{ path: string; token: Token | null }>>();
  for (const [snapshotKey, entry] of Object.entries(snapshot)) {
    const prefix = `${entry.setName}::`;
    const tokenPath = snapshotKey.startsWith(prefix) ? snapshotKey.slice(prefix.length) : snapshotKey;
    const items = grouped.get(entry.setName) ?? [];
    items.push({ path: tokenPath, token: entry.token });
    grouped.set(entry.setName, items);
  }
  return grouped;
}

export const tokenRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  // GET /api/tokens/resolved — get all resolved tokens
  fastify.get('/tokens/resolved', async (_request, reply) => {
    try {
      const resolved = await fastify.tokenStore.resolveTokens();
      return resolved;
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to resolve tokens');
    }
  });

  const SEARCH_MAX_Q_LEN = 500;
  const SEARCH_MAX_LIST_ITEMS = 20;
  const SEARCH_MAX_ITEM_LEN = 200;

  function validateSearchList(param: string | undefined, name: string): string | null {
    if (!param) return null;
    const items = param.split(',');
    if (items.length > SEARCH_MAX_LIST_ITEMS) return `"${name}" must not exceed ${SEARCH_MAX_LIST_ITEMS} comma-separated values`;
    if (items.some(v => v.length > SEARCH_MAX_ITEM_LEN)) return `Each value in "${name}" must not exceed ${SEARCH_MAX_ITEM_LEN} characters`;
    return null;
  }

  // GET /api/tokens/search — search tokens across all sets
  fastify.get<{ Querystring: { q?: string; type?: string; has?: string; value?: string; desc?: string; path?: string; name?: string; limit?: string; offset?: string } }>(
    '/tokens/search',
    async (request, reply) => {
      try {
        const { q, type, has, value, desc, path: pathQ, name: nameQ, limit, offset } = request.query;

        if (q && q.length > SEARCH_MAX_Q_LEN) {
          return reply.status(400).send({ error: `"q" must not exceed ${SEARCH_MAX_Q_LEN} characters` });
        }
        const listError =
          validateSearchList(type, 'type') ??
          validateSearchList(has, 'has') ??
          validateSearchList(value, 'value') ??
          validateSearchList(desc, 'desc') ??
          validateSearchList(pathQ, 'path') ??
          validateSearchList(nameQ, 'name');
        if (listError) return reply.status(400).send({ error: listError });

        const parsedLimit = parseInt(limit ?? '200', 10);
        const resolvedLimit = Math.min(
          Math.max(isNaN(parsedLimit) ? 200 : parsedLimit, 1),
          1000,
        );
        const parsedOffset = parseInt(offset ?? '0', 10);
        const resolvedOffset = Math.max(isNaN(parsedOffset) ? 0 : parsedOffset, 0);
        const { results, total } = fastify.tokenStore.searchTokens({
          q: q || undefined,
          types: type ? type.split(',') : undefined,
          has: has ? has.split(',') : undefined,
          values: value ? value.split(',') : undefined,
          descs: desc ? desc.split(',') : undefined,
          paths: pathQ ? pathQ.split(',') : undefined,
          names: nameQ ? nameQ.split(',') : undefined,
          limit: resolvedLimit,
          offset: resolvedOffset,
        });
        return { data: results, total, hasMore: resolvedOffset + results.length < total, limit: resolvedLimit, offset: resolvedOffset };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to search tokens');
      }
    },
  );

  // GET /api/tokens/where?path=X — find all set definitions for an exact token path
  fastify.get<{ Querystring: { path?: string } }>('/tokens/where', async (request, reply) => {
    try {
      const { path: tokenPath } = request.query;
      if (!tokenPath || typeof tokenPath !== 'string' || tokenPath.trim().length === 0) {
        return reply.status(400).send({ error: '"path" query parameter is required' });
      }
      if (tokenPath.length > PATH_MAX_LEN) {
        return reply.status(400).send({ error: `"path" must not exceed ${PATH_MAX_LEN} characters` });
      }
      const defs = fastify.tokenStore.getTokenDefinitions(tokenPath.trim());
      const baseValue = defs.length > 0 ? stableStringify(defs[0].token.$value) : null;
      return {
        path: tokenPath.trim(),
        definitions: defs.map(d => ({
          setName: d.setName,
          $type: d.token.$type || 'unknown',
          $value: d.token.$value,
          $description: d.token.$description,
          isAlias: isReference(d.token.$value),
          isDifferentFromFirst: baseValue !== null && stableStringify(d.token.$value) !== baseValue,
        })),
      };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to look up token definitions');
    }
  });

  // GET /api/tokens/:set — get all tokens in a set (flat list with paths)
  fastify.get<{ Params: { set: string } }>('/tokens/:set', async (request, reply) => {
    try {
      const { set } = request.params;
      const tokenSet = await fastify.tokenStore.getSet(set);
      if (!tokenSet) {
        return reply.status(404).send({ error: `Token set "${set}" not found` });
      }
      return { set: set, tokens: tokenSet.tokens };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get token set');
    }
  });

  // POST /api/tokens/:set/groups/rename — rename a group (updates all token paths and alias refs)
  fastify.post<{ Params: { set: string }; Body: { oldGroupPath: string; newGroupPath: string; updateAliases?: boolean } }>(
    '/tokens/:set/groups/rename',
    async (request, reply) => {
      const { set } = request.params;
      const { oldGroupPath, newGroupPath, updateAliases } = request.body ?? {};
      if (!isValidTokenPath(oldGroupPath) || !isValidTokenPath(newGroupPath)) {
        return reply.status(400).send({ error: 'oldGroupPath and newGroupPath must be valid non-empty paths with no leading/trailing dots' });
      }
      return withLock(async () => {
        try {
          const { result } = await renameGroupCommand(
            {
              tokenStore: fastify.tokenStore,
              operationLog: fastify.operationLog,
              recipeService: fastify.recipeService,
            },
            {
              collectionId: set,
              oldGroupPath,
              newGroupPath,
              updateAliases: updateAliases !== false,
            },
          );
          return {
            ok: true,
            renamedCount: result.renamedCount,
            aliasesUpdated: result.aliasesUpdated,
          };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/tokens/:set/groups/move — move a group to a different set
  fastify.post<{ Params: { set: string }; Body: { groupPath: string; targetSet: string } }>(
    '/tokens/:set/groups/move',
    async (request, reply) => {
      const { set } = request.params;
      const { groupPath, targetSet } = request.body ?? {};
      if (!isValidTokenPath(groupPath)) {
        return reply.status(400).send({ error: 'groupPath must be a valid non-empty path with no leading/trailing dots' });
      }
      if (!isValidSetName(targetSet)) {
        return reply.status(400).send({ error: 'targetSet must be a valid non-empty set name' });
      }
      return withLock(async () => {
        try {
          const { result } = await moveGroupCommand(
            {
              tokenStore: fastify.tokenStore,
              operationLog: fastify.operationLog,
              recipeService: fastify.recipeService,
            },
            {
              sourceCollectionId: set,
              groupPath,
              targetCollectionId: targetSet,
            },
          );
          return { ok: true, movedCount: result.movedCount };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/tokens/:set/groups/copy — copy a group to a different set
  fastify.post<{ Params: { set: string }; Body: { groupPath: string; targetSet: string } }>(
    '/tokens/:set/groups/copy',
    async (request, reply) => {
      const { set } = request.params;
      const { groupPath, targetSet } = request.body ?? {};
      if (!isValidTokenPath(groupPath)) {
        return reply.status(400).send({ error: 'groupPath must be a valid non-empty path with no leading/trailing dots' });
      }
      if (!isValidSetName(targetSet)) {
        return reply.status(400).send({ error: 'targetSet must be a valid non-empty set name' });
      }
      return withLock(async () => {
        try {
          const { result } = await copyGroupCommand(
            {
              tokenStore: fastify.tokenStore,
              operationLog: fastify.operationLog,
              recipeService: fastify.recipeService,
            },
            {
              sourceCollectionId: set,
              groupPath,
              targetCollectionId: targetSet,
            },
          );
          return { ok: true, copiedCount: result.copiedCount };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/tokens/:set/groups/duplicate — duplicate a group with a -copy suffix
  fastify.post<{ Params: { set: string }; Body: { groupPath: string } }>(
    '/tokens/:set/groups/duplicate',
    async (request, reply) => {
      const { set } = request.params;
      const { groupPath } = request.body ?? {};
      if (!isValidTokenPath(groupPath)) {
        return reply.status(400).send({ error: 'groupPath must be a valid non-empty path with no leading/trailing dots' });
      }
      return withLock(async () => {
        try {
          const result = await fastify.tokenStore.duplicateGroup(set, groupPath);
          const after = await snapshotGroup(fastify.tokenStore, set, result.newGroupPath);
          await fastify.operationLog.record({
            type: 'group-duplicate',
            description: `Duplicate group "${groupPath}" as "${result.newGroupPath}" in ${set}`,
            setName: set,
            affectedPaths: Object.keys(after),
            beforeSnapshot: {},
            afterSnapshot: after,
          });
          return { ok: true, ...result };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/tokens/:set/groups/reorder — reorder direct children of a group
  fastify.post<{ Params: { set: string }; Body: { groupPath?: string; orderedKeys: string[] } }>(
    '/tokens/:set/groups/reorder',
    async (request, reply) => {
      const { set } = request.params;
      const { groupPath = '', orderedKeys } = request.body ?? {};
      if (groupPath && !isValidTokenPath(groupPath)) {
        return reply.status(400).send({ error: 'groupPath must be a valid path with no leading/trailing dots' });
      }
      if (!Array.isArray(orderedKeys)) {
        return reply.status(400).send({ error: 'orderedKeys must be an array' });
      }
      if (orderedKeys.some((k: unknown) => !isNonEmptyTrimmedString(k))) {
        return reply.status(400).send({ error: 'Each item in orderedKeys must be a non-empty string' });
      }
      return withLock(async () => {
        try {
          const prefix = groupPath ? groupPath + '.' : '';
          const before = await snapshotSet(fastify.tokenStore, set);
          await fastify.tokenStore.reorderGroupChildren(set, groupPath, orderedKeys);
          const after = await snapshotSet(fastify.tokenStore, set);
          await fastify.operationLog.record({
            type: 'group-reorder',
            description: `Reorder children of "${groupPath || '(root)'}" in ${set}`,
            setName: set,
            affectedPaths: orderedKeys.map(k => prefix + k),
            beforeSnapshot: before,
            afterSnapshot: after,
          });
          return { ok: true };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/tokens/:set/groups/create — create an empty group at a path
  fastify.post<{ Params: { set: string }; Body: { groupPath: string } }>(
    '/tokens/:set/groups/create',
    async (request, reply) => {
      const { set } = request.params;
      const { groupPath } = request.body ?? {};
      if (!isValidTokenPath(groupPath)) {
        return reply.status(400).send({ error: 'groupPath must be a valid non-empty path with no leading/trailing dots' });
      }
      return withLock(async () => {
        try {
          await fastify.tokenStore.createGroup(set, groupPath);
          await fastify.operationLog.record({
            type: 'group-create',
            description: `Create empty group "${groupPath}" in ${set}`,
            setName: set,
            affectedPaths: [groupPath],
            beforeSnapshot: {},
            afterSnapshot: {},
          });
          return reply.status(201).send({ ok: true, groupPath, set });
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // PATCH /api/tokens/:set/groups/meta — update $type and/or $description on a group
  fastify.patch<{
    Params: { set: string };
    Body: { groupPath?: string; $type?: string | null; $description?: string | null };
  }>('/tokens/:set/groups/meta', async (request, reply) => {
    const { set } = request.params;
    const { groupPath = '', $type, $description } = request.body ?? {};
    if (groupPath && !isValidTokenPath(groupPath)) {
      return reply.status(400).send({ error: 'groupPath must be a valid path with no leading/trailing dots' });
    }
    if ($type !== undefined && $type !== null && !TOKEN_TYPE_VALUES.has($type)) {
      return reply.status(400).send({ error: `Invalid $type "${$type}": must be a valid DTCG token type` });
    }
    return withLock(async () => {
      try {
        const before = groupPath
          ? await snapshotGroup(fastify.tokenStore, set, groupPath)
          : await snapshotSet(fastify.tokenStore, set);
        await fastify.tokenStore.updateGroup(set, groupPath, { $type, $description });
        const after = groupPath
          ? await snapshotGroup(fastify.tokenStore, set, groupPath)
          : await snapshotSet(fastify.tokenStore, set);
        await fastify.operationLog.record({
          type: 'group-meta-update',
          description: `Update metadata on "${groupPath || '(root)'}" in ${set}`,
          setName: set,
          affectedPaths: [groupPath || '(root)'],
          beforeSnapshot: before,
          afterSnapshot: after,
        });
        return { ok: true, groupPath, set };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to update group metadata');
      }
    });
  });

  // POST /api/tokens/:set/bulk-rename — rename tokens by find/replace pattern
  fastify.post<{
    Params: { set: string };
    Body: { find: string; replace: string; isRegex?: boolean };
  }>('/tokens/:set/bulk-rename', async (request, reply) => {
    const { set } = request.params;
    const { find, replace, isRegex } = request.body ?? {};
    if (typeof find !== 'string' || find.length === 0) {
      return reply.status(400).send({ error: 'find must be a non-empty string' });
    }
    if (typeof replace !== 'string') {
      return reply.status(400).send({ error: 'replace must be a string' });
    }
    if (find.length > PATH_MAX_LEN || replace.length > PATH_MAX_LEN) {
      return reply.status(400).send({ error: `find and replace must not exceed ${PATH_MAX_LEN} characters` });
    }
    return withLock(async () => {
      try {
        const before = await snapshotSet(fastify.tokenStore, set);
        const result = await fastify.tokenStore.bulkRename(set, find, replace, isRegex);
        const after = await snapshotSet(fastify.tokenStore, set);
        await fastify.operationLog.record({
          type: 'bulk-rename',
          description: `Bulk rename "${find}" → "${replace}" in ${set}`,
          setName: set,
          affectedPaths: [...new Set([...Object.keys(before), ...Object.keys(after)])],
          beforeSnapshot: before,
          afterSnapshot: after,
        });
        await fastify.recipeService.updateBulkTokenPaths(find, replace, isRegex ?? false);
        return { ok: true, ...result };
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // POST /api/tokens/:set/batch-update — apply partial patches to multiple tokens (single operation log entry)
  fastify.post<{
    Params: { set: string };
    Body: { patches: Array<{ path: string; patch: Record<string, unknown> }> };
  }>('/tokens/:set/batch-update', async (request, reply) => {
    const { set } = request.params;
    const { patches } = request.body ?? {};
    if (!Array.isArray(patches) || patches.length === 0) {
      return reply.status(400).send({ error: 'patches must be a non-empty array' });
    }
    for (const p of patches) {
      if (!isValidTokenPath(p.path)) {
        return reply.status(400).send({ error: 'Each entry must have a valid non-empty path with no leading/trailing dots' });
      }
      if (!p.patch || typeof p.patch !== 'object') {
        return reply.status(400).send({ error: `Each entry must have a patch object (got invalid patch for "${p.path}")` });
      }
      if (!validateTokenBody(p.patch)) {
        return reply.status(400).send({ error: `Invalid patch for "${p.path}": $type must be a valid DTCG token type` });
      }
    }
    return withLock(async () => {
      try {
        // Type-aware validation for each patch (needs existing token for inherited type)
        for (const p of patches) {
          const patchVal = (p.patch as Record<string, unknown>).$value;
          if (patchVal !== undefined) {
            const patchType = (p.patch as Record<string, unknown>).$type as string | undefined;
            const effectiveType = patchType ?? (await fastify.tokenStore.getToken(set, p.path))?.$type;
            if (effectiveType) {
              const valueErr = validateTokenValue(patchVal, effectiveType, p.path);
              if (valueErr) return reply.status(400).send({ error: `Invalid $value for "${p.path}" (type "${effectiveType}"): ${valueErr}` });
            }
            if (isReference(patchVal)) {
              const targetPath = parseReference(patchVal as string);
              if (!fastify.tokenStore.tokenPathExists(targetPath)) {
                return reply.status(400).send({ error: `Alias target "${targetPath}" in "${p.path}" does not exist` });
              }
            }
          }
        }

        const paths = patches.map(p => p.path);
        const before = await snapshotPaths(fastify.tokenStore, set, paths);
        await fastify.tokenStore.batchUpdateTokens(set, patches);
        const after = await snapshotPaths(fastify.tokenStore, set, paths);
        const entry = await fastify.operationLog.record({
          type: 'batch-update',
          description: `Batch update ${patches.length} token${patches.length === 1 ? '' : 's'} in ${set}`,
          setName: set,
          affectedPaths: paths,
          beforeSnapshot: before,
          afterSnapshot: after,
        });
        return { ok: true, updated: patches.length, operationId: entry.id };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to batch update tokens');
      }
    });
  });

  fastify.post<{
    Body: {
      primitiveSet: string;
      primitivePath: string;
      sourceTokens: Array<{ setName: string; path: string }>;
    };
  }>('/tokens/promote-alias', async (request, reply) => {
    const { primitiveSet, primitivePath, sourceTokens } = request.body ?? {};

    if (!isValidSetName(primitiveSet)) {
      return reply.status(400).send({ error: 'primitiveSet must be a valid non-empty set name' });
    }
    if (!isValidTokenPath(primitivePath)) {
      return reply.status(400).send({ error: 'primitivePath must be a valid non-empty path with no leading/trailing dots' });
    }
    if (!Array.isArray(sourceTokens) || sourceTokens.length === 0) {
      return reply.status(400).send({ error: 'sourceTokens must include at least one token' });
    }

    const seenSourceTokens = new Set<string>();
    for (const sourceToken of sourceTokens) {
      if (!isValidSetName(sourceToken?.setName) || !isValidTokenPath(sourceToken?.path)) {
        return reply.status(400).send({ error: 'Each source token must include a valid setName and path' });
      }
      const sourceKey = `${sourceToken.setName}:${sourceToken.path}`;
      if (seenSourceTokens.has(sourceKey)) {
        return reply.status(400).send({ error: `Duplicate source token "${sourceKey}"` });
      }
      seenSourceTokens.add(sourceKey);
    }

    return withLock(async () => {
      try {
        if (await fastify.tokenStore.getToken(primitiveSet, primitivePath)) {
          return reply.status(409).send({ error: `Token "${primitivePath}" already exists in set "${primitiveSet}"` });
        }

        const resolvedSources: Array<{ setName: string; path: string; token: Token }> = [];
        let canonicalValue: unknown = undefined;
        let canonicalType: string | undefined = undefined;
        let canonicalSerialized: string | null = null;

        for (const sourceToken of sourceTokens) {
          const token = await fastify.tokenStore.getToken(sourceToken.setName, sourceToken.path);
          if (!token) {
            return reply.status(404).send({ error: `Source token "${sourceToken.path}" not found in set "${sourceToken.setName}"` });
          }
          if (isReference(token.$value)) {
            return reply.status(400).send({ error: `Source token "${sourceToken.path}" in "${sourceToken.setName}" is already an alias` });
          }

          const serializedValue = stableStringify(token.$value);
          if (canonicalSerialized === null) {
            canonicalValue = token.$value;
            canonicalType = token.$type;
            canonicalSerialized = serializedValue;
          } else if (serializedValue !== canonicalSerialized || token.$type !== canonicalType) {
            return reply.status(400).send({
              error: `Source token "${sourceToken.path}" in "${sourceToken.setName}" does not match the group's shared raw value`,
            });
          }

          resolvedSources.push({
            setName: sourceToken.setName,
            path: sourceToken.path,
            token,
          });
        }

        const touchedPathsBySet = new Map<string, Set<string>>();
        for (const sourceToken of resolvedSources) {
          const paths = touchedPathsBySet.get(sourceToken.setName) ?? new Set<string>();
          paths.add(sourceToken.path);
          touchedPathsBySet.set(sourceToken.setName, paths);
        }
        const primitiveSetPaths = touchedPathsBySet.get(primitiveSet) ?? new Set<string>();
        primitiveSetPaths.add(primitivePath);
        touchedPathsBySet.set(primitiveSet, primitiveSetPaths);

        const beforeSnapshot: Record<string, SnapshotEntry> = {};
        for (const [setName, paths] of touchedPathsBySet.entries()) {
          const snapshot = await snapshotPaths(fastify.tokenStore, setName, [...paths]);
          mergeSetSnapshot(beforeSnapshot, setName, snapshot);
        }

        await fastify.tokenStore.createToken(
          primitiveSet,
          primitivePath,
          {
            ...(canonicalType ? { $type: canonicalType } : {}),
            $value: canonicalValue,
          } as Token,
        );

        const sourceTokensBySet = new Map<string, Array<{ path: string; patch: Record<string, unknown> }>>();
        for (const sourceToken of resolvedSources) {
          const patches = sourceTokensBySet.get(sourceToken.setName) ?? [];
          patches.push({
            path: sourceToken.path,
            patch: { $value: `{${primitivePath}}` },
          });
          sourceTokensBySet.set(sourceToken.setName, patches);
        }

        for (const [setName, patches] of sourceTokensBySet.entries()) {
          await fastify.tokenStore.batchUpdateTokens(setName, patches);
        }

        const afterSnapshot: Record<string, SnapshotEntry> = {};
        for (const [setName, paths] of touchedPathsBySet.entries()) {
          const snapshot = await snapshotPaths(fastify.tokenStore, setName, [...paths]);
          mergeSetSnapshot(afterSnapshot, setName, snapshot);
        }

        const entry = await fastify.operationLog.record({
          type: 'batch-update',
          description: `Promote ${resolvedSources.length} tokens to shared alias "${primitivePath}"`,
          setName: primitiveSet,
          affectedPaths: [
            primitivePath,
            ...resolvedSources.map(sourceToken => sourceToken.path),
          ],
          beforeSnapshot,
          afterSnapshot,
        });

        return reply.status(201).send({
          ok: true,
          primitivePath,
          primitiveSet,
          promoted: resolvedSources.length,
          operationId: entry.id,
        });
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to promote tokens to a shared alias');
      }
    });
  });

  // POST /api/tokens/:set/batch-rename-paths — rename specific token paths (single operation log entry)
  fastify.post<{
    Params: { set: string };
    Body: { renames: Array<{ oldPath: string; newPath: string }>; updateAliases?: boolean };
  }>('/tokens/:set/batch-rename-paths', async (request, reply) => {
    const { set } = request.params;
    const { renames, updateAliases } = request.body ?? {};
    if (!Array.isArray(renames) || renames.length === 0) {
      return reply.status(400).send({ error: 'renames must be a non-empty array' });
    }
    for (const r of renames) {
      if (!isValidTokenPath(r.oldPath) || !isValidTokenPath(r.newPath)) {
        return reply.status(400).send({ error: 'Each rename must have valid oldPath and newPath with no leading/trailing dots' });
      }
    }
    return withLock(async () => {
      try {
        const { result, operationId } = await batchRenameTokensCommand(
          {
            tokenStore: fastify.tokenStore,
            operationLog: fastify.operationLog,
            recipeService: fastify.recipeService,
          },
          {
            collectionId: set,
            renames,
            updateAliases: updateAliases !== false,
          },
        );
        return { ok: true, renamed: result.renamed, operationId };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to batch rename tokens');
      }
    });
  });

  // POST /api/tokens/:set/batch-move — move multiple tokens to another set (single operation log entry)
  fastify.post<{
    Params: { set: string };
    Body: { paths: string[]; targetSet: string };
  }>('/tokens/:set/batch-move', async (request, reply) => {
    const { set } = request.params;
    const { paths, targetSet } = request.body ?? {};
    if (!Array.isArray(paths) || paths.length === 0) {
      return reply.status(400).send({ error: 'paths must be a non-empty array' });
    }
    if (paths.some((p: unknown) => !isValidTokenPath(p))) {
      return reply.status(400).send({ error: 'Each path must be a valid non-empty string with no leading/trailing dots' });
    }
    if (!isValidSetName(targetSet)) {
      return reply.status(400).send({ error: 'targetSet must be a valid non-empty set name' });
    }
    return withLock(async () => {
      try {
        const { result, operationId } = await batchMoveTokensCommand(
          {
            tokenStore: fastify.tokenStore,
            operationLog: fastify.operationLog,
            recipeService: fastify.recipeService,
          },
          {
            sourceCollectionId: set,
            paths,
            targetCollectionId: targetSet,
          },
        );
        return { ok: true, moved: result.moved, operationId };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to batch move tokens');
      }
    });
  });

  // POST /api/tokens/:set/batch-copy — copy multiple tokens to another set, preserving originals
  fastify.post<{
    Params: { set: string };
    Body: { paths: string[]; targetSet: string };
  }>('/tokens/:set/batch-copy', async (request, reply) => {
    const { set } = request.params;
    const { paths, targetSet } = request.body ?? {};
    if (!Array.isArray(paths) || paths.length === 0) {
      return reply.status(400).send({ error: 'paths must be a non-empty array' });
    }
    if (paths.some((p: unknown) => !isValidTokenPath(p))) {
      return reply.status(400).send({ error: 'Each path must be a valid non-empty string with no leading/trailing dots' });
    }
    if (!isValidSetName(targetSet)) {
      return reply.status(400).send({ error: 'targetSet must be a valid non-empty set name' });
    }
    return withLock(async () => {
      try {
        const { result, operationId } = await batchCopyTokensCommand(
          {
            tokenStore: fastify.tokenStore,
            operationLog: fastify.operationLog,
            recipeService: fastify.recipeService,
          },
          {
            sourceCollectionId: set,
            paths,
            targetCollectionId: targetSet,
          },
        );
        return { ok: true, copied: result.copied, operationId };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to batch copy tokens');
      }
    });
  });

  // POST /api/tokens/:set/batch — upsert multiple tokens in a single request
  fastify.post<{
    Params: { set: string };
    Body: { tokens: BatchTokenMutationRouteBody[]; strategy: 'skip' | 'overwrite' | 'merge' };
  }>('/tokens/:set/batch', async (request, reply) => {
    const { set } = request.params;
    const { tokens, strategy } = request.body ?? {};
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return reply.status(400).send({ error: 'tokens must be a non-empty array' });
    }
    if (strategy !== 'skip' && strategy !== 'overwrite' && strategy !== 'merge') {
      return reply.status(400).send({ error: 'strategy must be "skip", "overwrite", or "merge"' });
    }
    for (const t of tokens) {
      const tokenPath = t.path;
      if (!isValidTokenPath(tokenPath)) {
        return reply.status(400).send({ error: 'Each token must have a valid non-empty path with no leading/trailing dots' });
      }
      if (t.$value === undefined) {
        return reply.status(400).send({ error: `Token "${tokenPath}" must have a $value` });
      }
      if (!validateTokenBody(t)) {
        return reply.status(400).send({ error: `Invalid token body for "${tokenPath}": $type must be a valid DTCG token type` });
      }
      // Type-aware value validation when $type is explicitly provided
      if (t.$type) {
        const valueErr = validateTokenValue(t.$value, t.$type, tokenPath);
        if (valueErr) return reply.status(400).send({ error: `Invalid $value for "${tokenPath}" (type "${t.$type}"): ${valueErr}` });
      }
    }
    return withLock(async () => {
      try {
        // Check alias targets exist (allow intra-batch references)
        const batchPaths = new Set(tokens.map(t => t.path));
        for (const t of tokens) {
          if (isReference(t.$value)) {
            const targetPath = parseReference(t.$value as string);
            if (!fastify.tokenStore.tokenPathExists(targetPath) && !batchPaths.has(targetPath)) {
              return reply.status(400).send({ error: `Alias target "${targetPath}" in "${t.path}" does not exist` });
            }
          }
        }

        const paths = tokens.map(t => t.path);
        const setExistedBefore = !!(await fastify.tokenStore.getSet(set));
        const before = await snapshotPaths(fastify.tokenStore, set, paths);
        const result = await fastify.tokenStore.batchUpsertTokens(
          set,
          tokens.map(t => ({ path: t.path, token: t as Token })),
          strategy,
        );
        const after = await snapshotPaths(fastify.tokenStore, set, paths);
        const changedSnapshotKeys = listChangedSnapshotKeys(before, after);
        const changedPaths = listChangedSnapshotTokenPaths(before, after);
        const beforeSnapshot = pickSnapshotEntries(before, changedSnapshotKeys);
        const afterSnapshot = pickSnapshotEntries(after, changedSnapshotKeys);

        let operationId: string | undefined;
        if (changedSnapshotKeys.length > 0) {
          operationId = (
            await fastify.operationLog.record({
              type: 'batch-upsert',
              description: `Batch upsert ${tokens.length} tokens in ${set}`,
              setName: set,
              affectedPaths: changedPaths,
              beforeSnapshot,
              afterSnapshot,
              ...(!setExistedBefore ? { rollbackSteps: [{ action: 'delete-set' as const, name: set }] } : {}),
            })
          ).id;
        }

        return { ok: true, ...result, changedPaths, operationId };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to batch upsert tokens');
      }
    });
  });

  // GET /api/tokens/deprecated-usage — list deprecated tokens that still have active alias dependents
  fastify.get('/tokens/deprecated-usage', async (_request, reply) => {
    try {
      const deprecatedByPath = new Map<string, { setName: string; type: string }>();
      for (const { path: tokenPath, token, setName } of fastify.tokenStore.getAllFlatTokens()) {
        if (getTokenLifecycle(token) !== 'deprecated' || deprecatedByPath.has(tokenPath)) {
          continue;
        }
        deprecatedByPath.set(tokenPath, {
          setName,
          type: token.$type ?? 'unknown',
        });
      }

      const entries = [...deprecatedByPath.entries()]
        .map(([deprecatedPath, meta]) => ({
          deprecatedPath,
          setName: meta.setName,
          type: meta.type,
          dependents: fastify.tokenStore
            .getDependents(deprecatedPath)
            .slice()
            .sort(
              (a, b) =>
                a.path.localeCompare(b.path) ||
                a.setName.localeCompare(b.setName),
            ),
        }))
        .filter(entry => entry.dependents.length > 0)
        .map(entry => ({
          ...entry,
          activeReferenceCount: entry.dependents.length,
        }))
        .sort(
          (a, b) =>
            b.activeReferenceCount - a.activeReferenceCount ||
            a.deprecatedPath.localeCompare(b.deprecatedPath),
        );

      return { entries };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to load deprecated token usage');
    }
  });

  // POST /api/tokens/deprecated-usage/replace — replace all direct alias references to a deprecated token
  fastify.post<{
    Body: { deprecatedPath?: string; replacementPath?: string };
  }>('/tokens/deprecated-usage/replace', async (request, reply) => {
    const { deprecatedPath, replacementPath } = request.body ?? {};
    if (!isValidTokenPath(deprecatedPath) || !isValidTokenPath(replacementPath)) {
      return reply.status(400).send({ error: 'deprecatedPath and replacementPath must be valid non-empty token paths' });
    }
    if (deprecatedPath === replacementPath) {
      return reply.status(400).send({ error: 'replacementPath must be different from deprecatedPath' });
    }

    return withLock(async () => {
      const beforeSnapshot: Record<string, SnapshotEntry> = {};
      try {
        const deprecatedDefinitions = fastify.tokenStore.getTokenDefinitions(deprecatedPath);
        const deprecatedDefinition = deprecatedDefinitions.find(
          ({ token }) => getTokenLifecycle(token) === 'deprecated',
        );
        if (!deprecatedDefinition) {
          return reply.status(404).send({ error: `Deprecated token "${deprecatedPath}" not found` });
        }

        const replacementDefinitions = fastify.tokenStore.getTokenDefinitions(replacementPath);
        const replacementToken = replacementDefinitions[0]?.token;
        if (!replacementToken) {
          return reply.status(404).send({ error: `Replacement token "${replacementPath}" not found` });
        }

        const deprecatedType = deprecatedDefinition.token.$type;
        const replacementType = replacementToken.$type;
        if (deprecatedType && replacementType && deprecatedType !== replacementType) {
          return reply.status(400).send({
            error: `Replacement token "${replacementPath}" has type "${replacementType}" but deprecated token "${deprecatedPath}" has type "${deprecatedType}"`,
          });
        }

        const dependents = fastify.tokenStore.getDependents(deprecatedPath);
        if (dependents.length === 0) {
          return { ok: true, updated: 0 };
        }

        const patchesBySet = new Map<string, Array<{ path: string; patch: Partial<Token> }>>();
        for (const dependent of dependents) {
          const existing = await fastify.tokenStore.getToken(dependent.setName, dependent.path);
          if (!existing) {
            return reply.status(404).send({
              error: `Dependent token "${dependent.path}" in set "${dependent.setName}" no longer exists`,
            });
          }
          if (existing.$type && replacementType && existing.$type !== replacementType) {
            return reply.status(400).send({
              error: `Cannot retarget "${dependent.path}" in set "${dependent.setName}" from type "${existing.$type}" to replacement type "${replacementType}"`,
            });
          }

          const patches = patchesBySet.get(dependent.setName) ?? [];
          patches.push({
            path: dependent.path,
            patch: { $value: `{${replacementPath}}` },
          });
          patchesBySet.set(dependent.setName, patches);
        }

        for (const [setName, patches] of patchesBySet.entries()) {
          const snapshot = await snapshotPaths(
            fastify.tokenStore,
            setName,
            patches.map(patch => patch.path),
          );
          mergeSetSnapshot(beforeSnapshot, setName, snapshot);
        }

        for (const [setName, patches] of patchesBySet.entries()) {
          await fastify.tokenStore.batchUpdateTokens(setName, patches);
        }

        const afterSnapshot: Record<string, SnapshotEntry> = {};
        for (const [setName, patches] of patchesBySet.entries()) {
          const snapshot = await snapshotPaths(
            fastify.tokenStore,
            setName,
            patches.map(patch => patch.path),
          );
          mergeSetSnapshot(afterSnapshot, setName, snapshot);
        }

        const operationId = await fastify.operationLog.record({
          type: 'replace-deprecated-references',
          description: `Replace ${dependents.length} reference${dependents.length === 1 ? '' : 's'} from "${deprecatedPath}" to "${replacementPath}"`,
          setName: deprecatedDefinition.setName,
          affectedPaths: dependents.map(dependent => dependent.path),
          beforeSnapshot,
          afterSnapshot,
        });

        return {
          ok: true,
          updated: dependents.length,
          operationId,
        };
      } catch (err) {
        if (Object.keys(beforeSnapshot).length > 0) {
          const snapshotBySet = groupSnapshotEntriesBySet(beforeSnapshot);
          for (const [setName, items] of snapshotBySet.entries()) {
            await fastify.tokenStore.restoreSnapshot(setName, items);
          }
        }
        return handleRouteError(reply, err, 'Failed to replace deprecated references');
      }
    });
  });

  // GET /api/tokens/:set/dependents/* — get tokens that reference a given token path (cross-set)
  fastify.get<{ Params: { set: string; '*': string } }>('/tokens/:set/dependents/*', async (request, reply) => {
    const { set } = request.params;
    const tokenSet = await fastify.tokenStore.getSet(set);
    if (!tokenSet) {
      return reply.status(404).send({ error: `Token set "${set}" not found` });
    }
    const tokenPath = wildcardParamToTokenPath(request.params['*']);
    if (!tokenPath) {
      return reply.status(400).send({ error: 'Token path is required' });
    }
    try {
      const dependents = fastify.tokenStore.getDependents(tokenPath);
      return { tokenPath, dependents, count: dependents.length };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get dependents');
    }
  });

  // GET /api/tokens/:set/group-dependents/* — get tokens that reference any token under a group prefix
  fastify.get<{ Params: { set: string; '*': string } }>('/tokens/:set/group-dependents/*', async (request, reply) => {
    const { set } = request.params;
    const tokenSet = await fastify.tokenStore.getSet(set);
    if (!tokenSet) {
      return reply.status(404).send({ error: `Token set "${set}" not found` });
    }
    const groupPath = wildcardParamToTokenPath(request.params['*']);
    if (!groupPath) {
      return reply.status(400).send({ error: 'Group path is required' });
    }
    try {
      const dependents = fastify.tokenStore.getGroupDependents(groupPath);
      return { groupPath, dependents, count: dependents.length };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get group dependents');
    }
  });

  // GET /api/tokens/:set/tokens/rename-preview — preview alias changes from a token rename (dry-run)
  fastify.get<{ Params: { set: string }; Querystring: { oldPath: string; newPath: string } }>(
    '/tokens/:set/tokens/rename-preview',
    async (request, reply) => {
      const { oldPath, newPath } = request.query;
      if (!isValidTokenPath(oldPath) || !isValidTokenPath(newPath)) {
        return reply.status(400).send({ error: 'oldPath and newPath must be valid non-empty paths with no leading/trailing dots' });
      }
      try {
        const changes = fastify.tokenStore.previewRenameToken(oldPath, newPath);
        return { oldPath, newPath, changes, count: changes.length };
      } catch (err) {
        return handleRouteError(reply, err);
      }
    },
  );

  // GET /api/tokens/:set/groups/rename-preview — preview alias changes from a group rename (dry-run)
  fastify.get<{ Params: { set: string }; Querystring: { oldGroupPath: string; newGroupPath: string } }>(
    '/tokens/:set/groups/rename-preview',
    async (request, reply) => {
      const { oldGroupPath, newGroupPath } = request.query;
      if (!isValidTokenPath(oldGroupPath) || !isValidTokenPath(newGroupPath)) {
        return reply.status(400).send({ error: 'oldGroupPath and newGroupPath must be valid non-empty paths with no leading/trailing dots' });
      }
      try {
        const changes = fastify.tokenStore.previewRenameGroup(oldGroupPath, newGroupPath);
        return { oldGroupPath, newGroupPath, changes, count: changes.length };
      } catch (err) {
        return handleRouteError(reply, err);
      }
    },
  );

  // POST /api/tokens/:set/tokens/rename — rename a single leaf token and update alias references
  fastify.post<{ Params: { set: string }; Body: { oldPath: string; newPath: string; updateAliases?: boolean } }>(
    '/tokens/:set/tokens/rename',
    async (request, reply) => {
      const { set } = request.params;
      const { oldPath, newPath, updateAliases } = request.body ?? {};
      if (!isValidTokenPath(oldPath) || !isValidTokenPath(newPath)) {
        return reply.status(400).send({ error: 'oldPath and newPath must be valid non-empty paths with no leading/trailing dots' });
      }
      return withLock(async () => {
        try {
          const { result } = await renameTokenCommand(
            {
              tokenStore: fastify.tokenStore,
              operationLog: fastify.operationLog,
              recipeService: fastify.recipeService,
            },
            {
              collectionId: set,
              oldPath,
              newPath,
              updateAliases: updateAliases !== false,
            },
          );
          return { ok: true, aliasesUpdated: result.aliasesUpdated };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/tokens/:set/tokens/move — move a single token to a different set
  fastify.post<{ Params: { set: string }; Body: { tokenPath: string; targetSet: string } }>(
    '/tokens/:set/tokens/move',
    async (request, reply) => {
      const { set } = request.params;
      const { tokenPath, targetSet } = request.body ?? {};
      if (!isValidTokenPath(tokenPath)) {
        return reply.status(400).send({ error: 'tokenPath must be a valid non-empty path with no leading/trailing dots' });
      }
      if (!isValidSetName(targetSet)) {
        return reply.status(400).send({ error: 'targetSet must be a valid non-empty set name' });
      }
      return withLock(async () => {
        try {
          await moveTokenCommand(
            {
              tokenStore: fastify.tokenStore,
              operationLog: fastify.operationLog,
              recipeService: fastify.recipeService,
            },
            {
              sourceCollectionId: set,
              tokenPath,
              targetCollectionId: targetSet,
            },
          );
          return { ok: true };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/tokens/:set/tokens/copy — copy a single token to a different set
  fastify.post<{ Params: { set: string }; Body: { tokenPath: string; targetSet: string } }>(
    '/tokens/:set/tokens/copy',
    async (request, reply) => {
      const { set } = request.params;
      const { tokenPath, targetSet } = request.body ?? {};
      if (!isValidTokenPath(tokenPath)) {
        return reply.status(400).send({ error: 'tokenPath must be a valid non-empty path with no leading/trailing dots' });
      }
      if (!isValidSetName(targetSet)) {
        return reply.status(400).send({ error: 'targetSet must be a valid non-empty set name' });
      }
      return withLock(async () => {
        try {
          await copyTokenCommand(
            {
              tokenStore: fastify.tokenStore,
              operationLog: fastify.operationLog,
              recipeService: fastify.recipeService,
            },
            {
              sourceCollectionId: set,
              tokenPath,
              targetCollectionId: targetSet,
            },
          );
          return { ok: true };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // GET /api/tokens/:set/raw — get the raw nested DTCG token group for a set
  fastify.get<{ Params: { set: string } }>('/tokens/:set/raw', async (request, reply) => {
    try {
      const { set } = request.params;
      const tokenSet = await fastify.tokenStore.getSet(set);
      if (!tokenSet) {
        return reply.status(404).send({ error: `Token set "${set}" not found` });
      }
      return tokenSet.tokens;
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get raw token set');
    }
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
      return withLock(async () => {
        try {
          const before = await snapshotSet(fastify.tokenStore, set);
          await fastify.tokenStore.replaceSetTokens(set, body as TokenGroup);
          const after = await snapshotSet(fastify.tokenStore, set);
          await fastify.operationLog.record({
            type: 'set-replace',
            description: `Replace all tokens in ${set}`,
            setName: set,
            affectedPaths: [...new Set([...Object.keys(before), ...Object.keys(after)])],
            beforeSnapshot: before,
            afterSnapshot: after,
          });
          return { ok: true, set };
        } catch (err) {
          return handleRouteError(reply, err, 'Failed to replace token set');
        }
      });
    },
  );

  // GET /api/tokens/:set/* — get single token by path
  fastify.get<{ Params: { set: string; '*': string } }>('/tokens/:set/*', async (request, reply) => {
    const { set } = request.params;
    const tokenPath = wildcardParamToTokenPath(request.params['*']);
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
      return handleRouteError(reply, err, 'Failed to get token');
    }
  });

  // POST /api/tokens/:set/* — create token
  fastify.post<{ Params: { set: string; '*': string }; Body: TokenMutationRouteBody }>(
    '/tokens/:set/*',
    async (request, reply) => {
      const { set } = request.params;
      const tokenPath = wildcardParamToTokenPath(request.params['*']);
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

      // Type-aware value validation (can be done before acquiring the lock)
      if (body.$type) {
        const valueErr = validateTokenValue(body.$value, body.$type, tokenPath);
        if (valueErr) return reply.status(400).send({ error: `Invalid $value for type "${body.$type}": ${valueErr}` });
      }

      return withLock(async () => {
        try {
          // Check if token already exists
          const existing = await fastify.tokenStore.getToken(set, tokenPath);
          if (existing) {
            return reply.status(409).send({ error: `Token "${tokenPath}" already exists in set "${set}"` });
          }

          // Check alias target existence
          if (isReference(body.$value)) {
            const targetPath = parseReference(body.$value as string);
            if (!fastify.tokenStore.tokenPathExists(targetPath)) {
              return reply.status(400).send({ error: `Alias target "${targetPath}" does not exist` });
            }
          }

          const before = await snapshotPaths(fastify.tokenStore, set, [tokenPath]);
          await fastify.tokenStore.createToken(set, tokenPath, body as Token);
          const after = await snapshotPaths(fastify.tokenStore, set, [tokenPath]);
          await fastify.operationLog.record({
            type: 'token-create',
            description: `Create token "${tokenPath}" in ${set}`,
            setName: set,
            affectedPaths: [tokenPath],
            beforeSnapshot: before,
            afterSnapshot: after,
          });
          const created = await fastify.tokenStore.getToken(set, tokenPath);
          return reply.status(201).send({ ok: true, path: tokenPath, set, token: created });
        } catch (err) {
          return handleRouteError(reply, err, 'Failed to create token');
        }
      });
    },
  );

  // PATCH /api/tokens/:set/* — update token
  fastify.patch<{ Params: { set: string; '*': string }; Body: TokenMutationRouteBody }>(
    '/tokens/:set/*',
    async (request, reply) => {
      const { set } = request.params;
      const tokenPath = wildcardParamToTokenPath(request.params['*']);
      if (!tokenPath) {
        return reply.status(400).send({ error: 'Token path is required' });
      }

      const body = request.body;
      if (!validateTokenBody(body)) {
        return reply.status(400).send({ error: 'Invalid token body: $type must be a valid DTCG token type' });
      }

      return withLock(async () => {
        try {
          // Validate $value against effective type (own or inherited from existing token)
          if (body.$value !== undefined) {
            const existingForType = await fastify.tokenStore.getToken(set, tokenPath);
            const effectiveType = body.$type ?? existingForType?.$type;
            if (effectiveType) {
              const valueErr = validateTokenValue(body.$value, effectiveType, tokenPath);
              if (valueErr) return reply.status(400).send({ error: `Invalid $value for type "${effectiveType}": ${valueErr}` });
            }
            // Check alias target existence
            if (isReference(body.$value)) {
              const targetPath = parseReference(body.$value as string);
              if (!fastify.tokenStore.tokenPathExists(targetPath)) {
                return reply.status(400).send({ error: `Alias target "${targetPath}" does not exist` });
              }
            }
          }

          const before = await snapshotPaths(fastify.tokenStore, set, [tokenPath]);
          await fastify.tokenStore.updateToken(set, tokenPath, body as Partial<Token>);
          const after = await snapshotPaths(fastify.tokenStore, set, [tokenPath]);
          await fastify.operationLog.record({
            type: 'token-update',
            description: `Update token "${tokenPath}" in ${set}`,
            setName: set,
            affectedPaths: [tokenPath],
            beforeSnapshot: before,
            afterSnapshot: after,
          });
          const updated = await fastify.tokenStore.getToken(set, tokenPath);
          return { ok: true, path: tokenPath, set, token: updated };
        } catch (err) {
          return handleRouteError(reply, err, 'Failed to update token');
        }
      });
    },
  );

  // POST /api/tokens/:set/batch-delete — delete multiple tokens/groups in one call
  fastify.post<{ Params: { set: string }; Body: { paths: string[]; force?: boolean } }>(
    '/tokens/:set/batch-delete',
    async (request, reply) => {
      const { set } = request.params;
      const { paths, force } = request.body ?? {};
      if (!Array.isArray(paths) || paths.length === 0) {
        return reply.status(400).send({ error: 'paths array is required and must not be empty' });
      }
      if (paths.some((p: unknown) => !isValidTokenPath(p))) {
        return reply.status(400).send({ error: 'Each path must be a valid non-empty string with no leading/trailing dots' });
      }

      return withLock(async () => {
        try {
          if (!force) {
            const flatTokens = await fastify.tokenStore.getFlatTokensForSet(set);
            // Expand group paths to all leaf tokens they contain
            const allDeletedLeaves = new Set<string>();
            for (const p of paths) {
              for (const leafPath of Object.keys(flatTokens)) {
                if (leafPath === p || leafPath.startsWith(p + '.')) {
                  allDeletedLeaves.add(leafPath);
                }
              }
            }

            const externalDependents: Array<{ path: string; setName: string }> = [];
            const seen = new Set<string>();
            for (const p of allDeletedLeaves) {
              for (const dep of fastify.tokenStore.getDependents(p)) {
                if (!allDeletedLeaves.has(dep.path) && !seen.has(dep.path)) {
                  seen.add(dep.path);
                  externalDependents.push(dep);
                }
              }
            }

            if (externalDependents.length > 0) {
              const preview = externalDependents
                .slice(0, 5)
                .map((d) => `"${d.path}"`)
                .join(', ');
              const more = externalDependents.length > 5 ? ` and ${externalDependents.length - 5} more` : '';
              return reply.status(409).send({
                error: `Cannot delete — ${externalDependents.length} token${externalDependents.length !== 1 ? 's' : ''} reference the selection: ${preview}${more}`,
                dependents: externalDependents,
              });
            }
          }

          const before = await snapshotPaths(fastify.tokenStore, set, paths);
          const deleted = await fastify.tokenStore.deleteTokens(set, paths);
          const after = await snapshotPaths(fastify.tokenStore, set, paths);
          if (deleted.length > 0) {
            await fastify.operationLog.record({
              type: 'batch-delete',
              description: `Delete ${deleted.length} token(s) from ${set}`,
              setName: set,
              affectedPaths: deleted,
              beforeSnapshot: before,
              afterSnapshot: after,
            });
          }
          return { ok: true, deleted: deleted.length, paths: deleted, set };
        } catch (err) {
          return handleRouteError(reply, err, 'Failed to delete tokens');
        }
      });
    },
  );

  // DELETE /api/tokens/:set/* — delete token or group
  fastify.delete<{ Params: { set: string; '*': string }; Querystring: { force?: string } }>(
    '/tokens/:set/*',
    async (request, reply) => {
      const { set } = request.params;
      const tokenPath = wildcardParamToTokenPath(request.params['*']);
      if (!tokenPath) {
        return reply.status(400).send({ error: 'Token path is required' });
      }

      const force = request.query.force === 'true';

      return withLock(async () => {
        try {
          if (!force) {
            // Collect all leaf token paths being deleted (single token or all tokens in a group)
            const flatTokens = await fastify.tokenStore.getFlatTokensForSet(set);
            const deletedPaths = Object.keys(flatTokens).filter(
              (p) => p === tokenPath || p.startsWith(tokenPath + '.'),
            );
            const deletedSet = new Set(deletedPaths);

            // For each deleted path, find dependents that are NOT themselves being deleted
            const externalDependents: Array<{ path: string; setName: string }> = [];
            const seen = new Set<string>();
            for (const p of deletedPaths) {
              for (const dep of fastify.tokenStore.getDependents(p)) {
                if (!deletedSet.has(dep.path) && !seen.has(dep.path)) {
                  seen.add(dep.path);
                  externalDependents.push(dep);
                }
              }
            }

            if (externalDependents.length > 0) {
              const preview = externalDependents
                .slice(0, 5)
                .map((d) => `"${d.path}"`)
                .join(', ');
              const more = externalDependents.length > 5 ? ` and ${externalDependents.length - 5} more` : '';
              return reply.status(409).send({
                error: `Cannot delete "${tokenPath}" — ${externalDependents.length} token${externalDependents.length !== 1 ? 's' : ''} reference it: ${preview}${more}`,
                dependents: externalDependents,
              });
            }
          }

          const before = await snapshotPaths(fastify.tokenStore, set, [tokenPath]);
          const deleted = await fastify.tokenStore.deleteToken(set, tokenPath);
          if (!deleted) {
            return reply.status(404).send({ error: `Token "${tokenPath}" not found in set "${set}"` });
          }
          const after = await snapshotPaths(fastify.tokenStore, set, [tokenPath]);
          await fastify.operationLog.record({
            type: 'token-delete',
            description: `Delete "${tokenPath}" from ${set}`,
            setName: set,
            affectedPaths: [tokenPath],
            beforeSnapshot: before,
            afterSnapshot: after,
          });
          return { ok: true, path: tokenPath, set };
        } catch (err) {
          return handleRouteError(reply, err, 'Failed to delete token');
        }
      });
    },
  );
};
