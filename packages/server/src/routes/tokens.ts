import type { FastifyPluginAsync } from 'fastify';
import { TOKEN_TYPE_VALUES, type Token, type TokenGroup } from '@tokenmanager/core';
import { handleRouteError } from '../errors.js';
import { snapshotPaths, snapshotSet, snapshotGroup } from '../services/operation-log.js';

function validateTokenBody(body: unknown): body is Partial<Token> {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if ('$type' in b && b.$type !== undefined && !TOKEN_TYPE_VALUES.has(b.$type as string)) return false;
  if ('$description' in b && b.$description !== undefined && typeof b.$description !== 'string') return false;
  if ('$extensions' in b && b.$extensions !== undefined && (typeof b.$extensions !== 'object' || b.$extensions === null || Array.isArray(b.$extensions))) return false;
  return true;
}

export const tokenRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  // GET /api/tokens/resolved — get all resolved tokens
  fastify.get('/tokens/resolved', async (_request, reply) => {
    try {
      const resolved = await fastify.tokenStore.resolveTokens();
      return resolved;
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to resolve tokens', detail: String(err) });
    }
  });

  // GET /api/tokens/search — search tokens across all sets
  fastify.get<{ Querystring: { q?: string; type?: string; has?: string; value?: string; desc?: string; path?: string; name?: string; limit?: string; offset?: string } }>(
    '/tokens/search',
    async (request, reply) => {
      try {
        const { q, type, has, value, desc, path: pathQ, name: nameQ, limit, offset } = request.query;
        const { results, total } = fastify.tokenStore.searchTokens({
          q: q || undefined,
          types: type ? type.split(',') : undefined,
          has: has ? has.split(',') : undefined,
          values: value ? value.split(',') : undefined,
          descs: desc ? desc.split(',') : undefined,
          paths: pathQ ? pathQ.split(',') : undefined,
          names: nameQ ? nameQ.split(',') : undefined,
          limit: limit ? Math.min(parseInt(limit, 10) || 200, 1000) : 200,
          offset: offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0,
        });
        return { results, total };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to search tokens');
      }
    },
  );

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
      if (!oldGroupPath || !newGroupPath) {
        return reply.status(400).send({ error: 'oldGroupPath and newGroupPath are required' });
      }
      return withLock(async () => {
        try {
          const before = await snapshotGroup(fastify.tokenStore, set, oldGroupPath);
          const result = await fastify.tokenStore.renameGroup(set, oldGroupPath, newGroupPath, updateAliases !== false);
          const after = await snapshotGroup(fastify.tokenStore, set, newGroupPath);
          await fastify.operationLog.record({
            type: 'group-rename',
            description: `Rename group "${oldGroupPath}" → "${newGroupPath}" in ${set}`,
            setName: set,
            affectedPaths: [...Object.keys(before), ...Object.keys(after)],
            beforeSnapshot: before,
            afterSnapshot: after,
          });
          await fastify.generatorService.updateGroupPath(oldGroupPath, newGroupPath);
          return { ok: true, ...result };
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
      if (!groupPath || !targetSet) {
        return reply.status(400).send({ error: 'groupPath and targetSet are required' });
      }
      return withLock(async () => {
        try {
          const beforeSource = await snapshotGroup(fastify.tokenStore, set, groupPath);
          const beforeTarget = await snapshotGroup(fastify.tokenStore, targetSet, groupPath);
          const result = await fastify.tokenStore.moveGroup(set, groupPath, targetSet);
          const afterSource = await snapshotGroup(fastify.tokenStore, set, groupPath);
          const afterTarget = await snapshotGroup(fastify.tokenStore, targetSet, groupPath);
          const before = { ...beforeSource, ...Object.fromEntries(
            Object.entries(beforeTarget).map(([k, v]) => [`${k}@${targetSet}`, v])
          )};
          const after = { ...afterSource, ...Object.fromEntries(
            Object.entries(afterTarget).map(([k, v]) => [`${k}@${targetSet}`, v])
          )};
          await fastify.operationLog.record({
            type: 'group-move',
            description: `Move group "${groupPath}" from ${set} to ${targetSet}`,
            setName: set,
            affectedPaths: [...Object.keys(beforeSource), ...Object.keys(afterTarget)],
            beforeSnapshot: before,
            afterSnapshot: after,
          });
          return { ok: true, ...result };
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
      if (!groupPath || !targetSet) {
        return reply.status(400).send({ error: 'groupPath and targetSet are required' });
      }
      return withLock(async () => {
        try {
          const beforeTarget = await snapshotGroup(fastify.tokenStore, targetSet, groupPath);
          const result = await fastify.tokenStore.copyGroup(set, groupPath, targetSet);
          const afterTarget = await snapshotGroup(fastify.tokenStore, targetSet, groupPath);
          await fastify.operationLog.record({
            type: 'group-copy',
            description: `Copy group "${groupPath}" from ${set} to ${targetSet}`,
            setName: set,
            affectedPaths: [...Object.keys(afterTarget)],
            beforeSnapshot: Object.fromEntries(
              Object.entries(beforeTarget).map(([k, v]) => [`${k}@${targetSet}`, v])
            ),
            afterSnapshot: Object.fromEntries(
              Object.entries(afterTarget).map(([k, v]) => [`${k}@${targetSet}`, v])
            ),
          });
          return { ok: true, ...result };
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
      if (!groupPath) {
        return reply.status(400).send({ error: 'groupPath is required' });
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
      if (!Array.isArray(orderedKeys)) {
        return reply.status(400).send({ error: 'orderedKeys must be an array' });
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
      if (!groupPath) {
        return reply.status(400).send({ error: 'groupPath is required' });
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
    if (!find || replace === undefined) {
      return reply.status(400).send({ error: 'find and replace are required' });
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
        await fastify.generatorService.updateBulkTokenPaths(find, replace, isRegex ?? false);
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
      if (!p.path || !p.patch || typeof p.patch !== 'object') {
        return reply.status(400).send({ error: 'Each entry must have a path and patch object' });
      }
      if (!validateTokenBody(p.patch)) {
        return reply.status(400).send({ error: `Invalid patch for "${p.path}": $type must be a valid DTCG token type` });
      }
    }
    return withLock(async () => {
      try {
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
      if (!r.oldPath || !r.newPath) {
        return reply.status(400).send({ error: 'Each rename must have oldPath and newPath' });
      }
    }
    return withLock(async () => {
      try {
        const allOldPaths = renames.map(r => r.oldPath);
        const allNewPaths = renames.map(r => r.newPath);
        const before = await snapshotPaths(fastify.tokenStore, set, allOldPaths);
        const result = await fastify.tokenStore.batchRenameTokens(set, renames, updateAliases !== false);
        const after = await snapshotPaths(fastify.tokenStore, set, allNewPaths);
        const pathMap = new Map(renames.map(r => [r.oldPath, r.newPath]));
        const entry = await fastify.operationLog.record({
          type: 'batch-rename',
          description: `Batch rename ${renames.length} token${renames.length === 1 ? '' : 's'} in ${set}`,
          setName: set,
          affectedPaths: [...allOldPaths, ...allNewPaths],
          beforeSnapshot: before,
          afterSnapshot: after,
        });
        await fastify.generatorService.updateTokenPaths(pathMap);
        return { ok: true, renamed: result.renamed, operationId: entry.id };
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
    if (!targetSet) {
      return reply.status(400).send({ error: 'targetSet is required' });
    }
    return withLock(async () => {
      try {
        const beforeSource = await snapshotPaths(fastify.tokenStore, set, paths);
        const beforeTarget = await snapshotPaths(fastify.tokenStore, targetSet, paths);
        const before = { ...beforeSource, ...Object.fromEntries(
          Object.entries(beforeTarget).map(([k, v]) => [`${k}@${targetSet}`, v])
        )};
        const result = await fastify.tokenStore.batchMoveTokens(set, paths, targetSet);
        const afterSource = await snapshotPaths(fastify.tokenStore, set, paths);
        const afterTarget = await snapshotPaths(fastify.tokenStore, targetSet, paths);
        const after = { ...afterSource, ...Object.fromEntries(
          Object.entries(afterTarget).map(([k, v]) => [`${k}@${targetSet}`, v])
        )};
        const entry = await fastify.operationLog.record({
          type: 'batch-move',
          description: `Move ${result.moved} token${result.moved === 1 ? '' : 's'} from ${set} to ${targetSet}`,
          setName: set,
          affectedPaths: paths,
          beforeSnapshot: before,
          afterSnapshot: after,
        });
        return { ok: true, moved: result.moved, operationId: entry.id };
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
    if (!targetSet) {
      return reply.status(400).send({ error: 'targetSet is required' });
    }
    return withLock(async () => {
      try {
        const beforeTarget = await snapshotPaths(fastify.tokenStore, targetSet, paths);
        const result = await fastify.tokenStore.batchCopyTokens(set, paths, targetSet);
        const afterTarget = await snapshotPaths(fastify.tokenStore, targetSet, paths);
        const entry = await fastify.operationLog.record({
          type: 'batch-copy',
          description: `Copy ${result.copied} token${result.copied === 1 ? '' : 's'} from ${set} to ${targetSet}`,
          setName: targetSet,
          affectedPaths: paths,
          beforeSnapshot: Object.fromEntries(
            Object.entries(beforeTarget).map(([k, v]) => [`${k}@${targetSet}`, v])
          ),
          afterSnapshot: Object.fromEntries(
            Object.entries(afterTarget).map(([k, v]) => [`${k}@${targetSet}`, v])
          ),
        });
        return { ok: true, copied: result.copied, operationId: entry.id };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to batch copy tokens');
      }
    });
  });

  // POST /api/tokens/:set/batch — upsert multiple tokens in a single request
  fastify.post<{
    Params: { set: string };
    Body: { tokens: Array<{ path: string; $type?: string; $value: unknown; $description?: string; $scopes?: string[]; $extensions?: Record<string, unknown> }>; strategy: 'skip' | 'overwrite' | 'merge' };
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
      if (!t.path || t.$value === undefined) {
        return reply.status(400).send({ error: 'Each token must have a path and $value' });
      }
      if (!validateTokenBody(t)) {
        return reply.status(400).send({ error: `Invalid token body for "${t.path}": $type must be a valid DTCG token type` });
      }
    }
    return withLock(async () => {
      try {
        const paths = tokens.map(t => t.path);
        const before = await snapshotPaths(fastify.tokenStore, set, paths);
        const result = await fastify.tokenStore.batchUpsertTokens(
          set,
          tokens.map(t => ({ path: t.path, token: t as Token })),
          strategy,
        );
        const after = await snapshotPaths(fastify.tokenStore, set, paths);
        await fastify.operationLog.record({
          type: 'batch-upsert',
          description: `Batch upsert ${tokens.length} tokens in ${set}`,
          setName: set,
          affectedPaths: paths,
          beforeSnapshot: before,
          afterSnapshot: after,
        });
        return { ok: true, ...result };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to batch upsert tokens');
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
    const tokenPath = request.params['*'].split('/').join('.');
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

  // GET /api/tokens/:set/group-dependents/* — get tokens that reference any token under a group prefix
  fastify.get<{ Params: { set: string; '*': string } }>('/tokens/:set/group-dependents/*', async (request, reply) => {
    const { set } = request.params;
    const tokenSet = await fastify.tokenStore.getSet(set);
    if (!tokenSet) {
      return reply.status(404).send({ error: `Token set "${set}" not found` });
    }
    const groupPath = request.params['*'].split('/').join('.');
    if (!groupPath) {
      return reply.status(400).send({ error: 'Group path is required' });
    }
    try {
      const dependents = fastify.tokenStore.getGroupDependents(groupPath);
      return { groupPath, dependents, count: dependents.length };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to get group dependents', detail: String(err) });
    }
  });

  // GET /api/tokens/:set/tokens/rename-preview — preview alias changes from a token rename (dry-run)
  fastify.get<{ Params: { set: string }; Querystring: { oldPath: string; newPath: string } }>(
    '/tokens/:set/tokens/rename-preview',
    async (request, reply) => {
      const { oldPath, newPath } = request.query;
      if (!oldPath || !newPath) {
        return reply.status(400).send({ error: 'oldPath and newPath query params are required' });
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
      if (!oldGroupPath || !newGroupPath) {
        return reply.status(400).send({ error: 'oldGroupPath and newGroupPath query params are required' });
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
      if (!oldPath || !newPath) {
        return reply.status(400).send({ error: 'oldPath and newPath are required' });
      }
      return withLock(async () => {
        try {
          const before = await snapshotPaths(fastify.tokenStore, set, [oldPath]);
          const result = await fastify.tokenStore.renameToken(set, oldPath, newPath, updateAliases !== false);
          const after = await snapshotPaths(fastify.tokenStore, set, [newPath]);
          await fastify.operationLog.record({
            type: 'token-rename',
            description: `Rename token "${oldPath}" → "${newPath}" in ${set}`,
            setName: set,
            affectedPaths: [oldPath, newPath],
            beforeSnapshot: before,
            afterSnapshot: after,
          });
          await fastify.generatorService.updateTokenPaths(new Map([[oldPath, newPath]]));
          return { ok: true, ...result };
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
      if (!tokenPath || !targetSet) {
        return reply.status(400).send({ error: 'tokenPath and targetSet are required' });
      }
      return withLock(async () => {
        try {
          const beforeSource = await snapshotPaths(fastify.tokenStore, set, [tokenPath]);
          const beforeTarget = await snapshotPaths(fastify.tokenStore, targetSet, [tokenPath]);
          await fastify.tokenStore.moveToken(set, tokenPath, targetSet);
          const afterSource = await snapshotPaths(fastify.tokenStore, set, [tokenPath]);
          const afterTarget = await snapshotPaths(fastify.tokenStore, targetSet, [tokenPath]);
          const before = { ...beforeSource, ...Object.fromEntries(
            Object.entries(beforeTarget).map(([k, v]) => [`${k}@${targetSet}`, v])
          )};
          const after = { ...afterSource, ...Object.fromEntries(
            Object.entries(afterTarget).map(([k, v]) => [`${k}@${targetSet}`, v])
          )};
          await fastify.operationLog.record({
            type: 'token-move',
            description: `Move token "${tokenPath}" from ${set} to ${targetSet}`,
            setName: set,
            affectedPaths: [tokenPath],
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

  // POST /api/tokens/:set/tokens/copy — copy a single token to a different set
  fastify.post<{ Params: { set: string }; Body: { tokenPath: string; targetSet: string } }>(
    '/tokens/:set/tokens/copy',
    async (request, reply) => {
      const { set } = request.params;
      const { tokenPath, targetSet } = request.body ?? {};
      if (!tokenPath || !targetSet) {
        return reply.status(400).send({ error: 'tokenPath and targetSet are required' });
      }
      return withLock(async () => {
        try {
          const beforeTarget = await snapshotPaths(fastify.tokenStore, targetSet, [tokenPath]);
          await fastify.tokenStore.copyToken(set, tokenPath, targetSet);
          const afterTarget = await snapshotPaths(fastify.tokenStore, targetSet, [tokenPath]);
          await fastify.operationLog.record({
            type: 'token-copy',
            description: `Copy token "${tokenPath}" from ${set} to ${targetSet}`,
            setName: targetSet,
            affectedPaths: [tokenPath],
            beforeSnapshot: beforeTarget,
            afterSnapshot: afterTarget,
          });
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
    const tokenPath = request.params['*'].split('/').join('.');
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
      const tokenPath = request.params['*'].split('/').join('.');
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

      return withLock(async () => {
        try {
          // Check if token already exists
          const existing = await fastify.tokenStore.getToken(set, tokenPath);
          if (existing) {
            return reply.status(409).send({ error: `Token "${tokenPath}" already exists in set "${set}"` });
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
  fastify.patch<{ Params: { set: string; '*': string }; Body: { $value?: unknown; $type?: string; $description?: string; $extensions?: Record<string, unknown> } }>(
    '/tokens/:set/*',
    async (request, reply) => {
      const { set } = request.params;
      const tokenPath = request.params['*'].split('/').join('.');
      if (!tokenPath) {
        return reply.status(400).send({ error: 'Token path is required' });
      }

      const body = request.body;
      if (!validateTokenBody(body)) {
        return reply.status(400).send({ error: 'Invalid token body: $type must be a valid DTCG token type' });
      }

      return withLock(async () => {
        try {
          const before = await snapshotPaths(fastify.tokenStore, set, [tokenPath]);
          await fastify.tokenStore.updateToken(set, tokenPath, body);
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

  // POST /api/tokens/:set/bulk-delete — delete multiple tokens/groups in one call
  fastify.post<{ Params: { set: string }; Body: { paths: string[]; force?: boolean } }>(
    '/tokens/:set/bulk-delete',
    async (request, reply) => {
      const { set } = request.params;
      const { paths, force } = request.body ?? {};
      if (!Array.isArray(paths) || paths.length === 0) {
        return reply.status(400).send({ error: 'paths array is required and must not be empty' });
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
              type: 'bulk-delete',
              description: `Delete ${deleted.length} token(s) from ${set}`,
              setName: set,
              affectedPaths: deleted,
              beforeSnapshot: before,
              afterSnapshot: after,
            });
          }
          return { ok: true, deleted: deleted.length, paths: deleted, set };
        } catch (err) {
          return reply.status(500).send({ error: 'Failed to delete tokens', detail: String(err) });
        }
      });
    },
  );

  // DELETE /api/tokens/:set/* — delete token or group
  fastify.delete<{ Params: { set: string; '*': string }; Querystring: { force?: string } }>(
    '/tokens/:set/*',
    async (request, reply) => {
      const { set } = request.params;
      const tokenPath = request.params['*'].split('/').join('.');
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
          return reply.status(500).send({ error: 'Failed to delete token', detail: String(err) });
        }
      });
    },
  );
};
