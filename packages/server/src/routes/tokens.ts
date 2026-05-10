import type { FastifyPluginAsync } from 'fastify';
import {
  buildTokenExtensionsWithScopes,
  CROSS_COLLECTION_SEARCH_HAS_VALUES,
  SUPPORTED_SEARCH_SCOPE_VALUES,
  buildTokenExtensionsWithCollectionModes,
  collectTokenReferencePaths,
  normalizeTokenScopeValues,
  sanitizeModeValuesForCollection,
  stableStringify,
  TOKEN_TYPE_VALUES,
  TokenValidator,
  flattenTokenGroup,
  getTokenLifecycle,
  isReference,
  parseReference,
  readGeneratorProvenance,
  readTokenCollectionModeValues,
  readTokenModeValuesForCollection,
  resolveCollectionIdForPath,
  readTokenScopes,
  type Token,
  type TokenCollection,
  type TokenGroup,
  writeTokenModeValuesForCollection,
} from '@token-workshop/core';
import { BadRequestError, ConflictError, handleRouteError } from '../errors.js';
import type { SnapshotEntry } from '../services/operation-log.js';
import {
  listChangedSnapshotKeys,
  listChangedSnapshotTokenPaths,
  pickSnapshotEntries,
  qualifySnapshotEntries,
  snapshotPaths,
  snapshotCollection,
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
import {
  validateTokenPath,
  normalizeScopedVariableToken,
  updateTokenAliasRefs,
} from '../services/token-tree-utils.js';
import { isValidCollectionName } from '../services/collection-helpers.js';
import { hasNextPage, readPagination } from './pagination.js';

interface TokenMutationRouteBody {
  $type?: string;
  $value?: unknown;
  $description?: string | null;
  $extensions?: Record<string, unknown> | null;
  $scopes?: string[] | null;
}

function getGeneratorManagedPaths(
  flatTokens: Record<string, Token>,
  paths: string[],
): string[] {
  const selectedPaths = paths.map((path) => ({
    exact: path,
    descendantPrefix: `${path}.`,
  }));
  const selected = new Set<string>();
  for (const [leafPath, token] of Object.entries(flatTokens)) {
    if (!readGeneratorProvenance(token)) {
      continue;
    }
    if (
      selectedPaths.some(
        ({ exact, descendantPrefix }) =>
          leafPath === exact || leafPath.startsWith(descendantPrefix),
      )
    ) {
      selected.add(leafPath);
    }
  }
  return [...selected].sort();
}

function formatGeneratorManagedPathList(paths: string[]): string {
  const preview = paths.slice(0, 5).map((path) => `"${path}"`).join(', ');
  const more = paths.length > 5 ? ` and ${paths.length - 5} more` : '';
  return `${preview}${more}`;
}

function assertNoGeneratorManagedTokenDelete(
  flatTokens: Record<string, Token>,
  paths: string[],
): void {
  const generatorManagedPaths = getGeneratorManagedPaths(flatTokens, paths);
  if (generatorManagedPaths.length === 0) return;
  throw new ConflictError(
    `Cannot delete generator-managed token${generatorManagedPaths.length === 1 ? '' : 's'} ${formatGeneratorManagedPathList(generatorManagedPaths)}. Detach from the generator first.`,
  );
}

function assertNoGeneratorManagedTokenMutation(
  flatTokens: Record<string, Token>,
  paths: string[],
  action: string,
): void {
  const generatorManagedPaths = getGeneratorManagedPaths(flatTokens, paths);
  if (generatorManagedPaths.length === 0) return;
  throw new ConflictError(
    `Cannot ${action} generator-managed token${generatorManagedPaths.length === 1 ? '' : 's'} ${formatGeneratorManagedPathList(generatorManagedPaths)}. Detach from the generator first.`,
  );
}

function tokenBodyContainsGeneratorProvenance(token: Pick<Token, '$extensions'>): boolean {
  const tokenworkshop = token.$extensions?.tokenworkshop;
  return Boolean(
    tokenworkshop &&
      typeof tokenworkshop === 'object' &&
      !Array.isArray(tokenworkshop) &&
      'generator' in tokenworkshop
  );
}

function assertNoGeneratorProvenanceWrite(
  token: Pick<Token, '$extensions'>,
  action: string,
): void {
  if (!tokenBodyContainsGeneratorProvenance(token)) return;
  throw new ConflictError(
    `Cannot ${action} generator provenance directly. Apply the generator or detach the token first.`,
  );
}

function listBulkRenameAffectedPaths(
  paths: string[],
  find: string,
  replace: string,
  isRegex: boolean | undefined,
): string[] {
  if (isRegex) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(find);
    } catch (err) {
      throw new BadRequestError(
        err instanceof Error ? err.message : 'Invalid regular expression',
      );
    }
    return paths.filter((path) => path.replace(pattern, replace) !== path);
  }
  return paths.filter((path) => path.replace(find, replace) !== path);
}

interface BatchTokenMutationRouteBody extends TokenMutationRouteBody {
  path: string;
}

function validateTokenBody(body: unknown): body is TokenMutationRouteBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if ('$type' in b && b.$type !== undefined && !TOKEN_TYPE_VALUES.has(b.$type as string)) return false;
  if (
    '$description' in b &&
    b.$description !== undefined &&
    b.$description !== null &&
    typeof b.$description !== 'string'
  ) {
    return false;
  }
  if (
    '$extensions' in b &&
    b.$extensions !== undefined &&
    b.$extensions !== null &&
    (typeof b.$extensions !== 'object' || Array.isArray(b.$extensions))
  ) return false;
  if (
    '$scopes' in b &&
    b.$scopes !== undefined &&
    b.$scopes !== null &&
    (!Array.isArray(b.$scopes) ||
      b.$scopes.some((scope) => typeof scope !== 'string'))
  ) {
    return false;
  }
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

function validateTokenDefinition(token: Token, path: string): string | null {
  const result = _tokenValidator.validate(token, path);
  return result.valid
    ? null
    : result.errors.map(e => e.replace(`${path}: `, '')).join('; ');
}

const PATH_MAX_LEN = 500;

/** Validates a token path string: non-empty, no leading/trailing whitespace, no leading/trailing/consecutive dots. */
function isValidTokenPath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  if (path.length === 0 || path.length > PATH_MAX_LEN) return false;
  if (path !== path.trim()) return false;
  try {
    validateTokenPath(path);
    return true;
  } catch {
    return false;
  }
}

/** Validates a collection ID: non-empty string, no leading/trailing whitespace, no null bytes or path traversal. */
function isValidCollectionId(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name === name.trim() &&
    isValidCollectionName(name)
  );
}

/** Validates a single segment key (direct child name): non-empty string, no leading/trailing whitespace. */
function isNonEmptyTrimmedString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v === v.trim();
}

function wildcardParamToTokenPath(pathParam: string): string {
  if (pathParam.length === 0) {
    return '';
  }
  try {
    const decodedPath = pathParam.split('/').map(decodeURIComponent).join('.');
    return isValidTokenPath(decodedPath) ? decodedPath : '';
  } catch {
    return '';
  }
}

function validateCollectionScopedModeValues(
  collectionId: string,
  validModeNames: Set<string>,
  tokenPath: string,
  token: Pick<Token, '$extensions'>,
): string | null {
  const modeValues = readTokenCollectionModeValues(token);
  const referencedCollectionIds = Object.keys(modeValues);
  if (referencedCollectionIds.length === 0) {
    return null;
  }

  const foreignCollectionId = referencedCollectionIds.find(
    (candidateCollectionId) => candidateCollectionId !== collectionId,
  );
  if (foreignCollectionId) {
    return `Token "${tokenPath}" can only define mode values for its own collection "${collectionId}", but found "${foreignCollectionId}"`;
  }

  for (const modeName of Object.keys(modeValues[collectionId] ?? {})) {
    if (!validModeNames.has(modeName)) {
      return `Token "${tokenPath}" defines unknown mode "${modeName}" for collection "${collectionId}"`;
    }
  }

  return null;
}

type TokenDefinitionEntry = { collectionId: string; token: Token };

function findCollectionDefinition(
  collections: TokenCollection[],
  collectionId: string,
): TokenCollection | undefined {
  return collections.find((collection) => collection.id === collectionId);
}

function normalizeTokenModesForCollectionWrite<T extends Pick<Token, '$extensions'>>(
  token: T,
  collection: TokenCollection,
): T {
  const nextToken = structuredClone(token);
  const currentModes = readTokenCollectionModeValues(nextToken);
  const collectionModes = currentModes[collection.id];
  if (!collectionModes) {
    return nextToken;
  }

  const normalizedCollectionModes = sanitizeModeValuesForCollection(
    collection,
    collectionModes,
  );
  const nextModes = { ...currentModes };
  if (Object.keys(normalizedCollectionModes).length > 0) {
    nextModes[collection.id] = normalizedCollectionModes;
  } else {
    delete nextModes[collection.id];
  }

  const nextExtensions = buildTokenExtensionsWithCollectionModes(
    nextToken,
    nextModes,
  );
  if (nextExtensions) {
    nextToken.$extensions = nextExtensions;
  } else {
    delete nextToken.$extensions;
  }

  return nextToken;
}

function normalizeTokenGroupModesForCollectionWrite(
  tokens: TokenGroup,
  collection: TokenCollection,
): TokenGroup {
  const nextTokens = structuredClone(tokens);
  for (const [, token] of flattenTokenGroup(nextTokens)) {
    const normalizedToken = normalizeTokenModesForCollectionWrite(
      token,
      collection,
    );
    for (const key of Object.keys(token)) {
      delete (token as unknown as Record<string, unknown>)[key];
    }
    Object.assign(token, normalizedToken);
  }
  return nextTokens;
}

function normalizeCreateRouteBody(
  body: TokenMutationRouteBody,
): Token {
  if (body.$value === undefined) {
    throw new BadRequestError('Token must have a $value property');
  }

  const nextExtensions = normalizeRouteExtensions(body);

  return {
    ...(body.$type !== undefined
      ? { $type: body.$type as Token['$type'] }
      : {}),
    $value: body.$value as Token['$value'],
    ...(body.$description !== undefined && body.$description !== null
      ? { $description: body.$description }
      : {}),
    ...(nextExtensions
      ? { $extensions: nextExtensions }
      : {}),
  };
}

function normalizeRouteExtensions(
  body: Pick<TokenMutationRouteBody, '$extensions' | '$scopes'>,
): Record<string, unknown> | undefined {
  const normalizedExtensionScopes = normalizeTokenScopeValues(
    readTokenScopes({
      $extensions:
        body.$extensions && body.$extensions !== null
          ? body.$extensions
          : undefined,
    }),
  );

  const normalizedScopes =
    '$scopes' in body
      ? normalizeTokenScopeValues(body.$scopes)
      : normalizedExtensionScopes;
  return buildTokenExtensionsWithScopes(body.$extensions, normalizedScopes);
}

function normalizeUpdateRouteExtensions(
  body: Pick<TokenMutationRouteBody, '$extensions' | '$scopes'>,
  existingToken?: Pick<Token, '$extensions'> | null,
): Record<string, unknown> | undefined {
  if ('$extensions' in body) {
    return normalizeRouteExtensions(body);
  }

  if ('$scopes' in body) {
    return normalizeRouteExtensions({
      $extensions:
        existingToken?.$extensions &&
        typeof existingToken.$extensions === 'object' &&
        !Array.isArray(existingToken.$extensions)
          ? structuredClone(existingToken.$extensions)
          : undefined,
      $scopes: body.$scopes,
    });
  }

  return undefined;
}

function normalizeUpdateRouteBody(
  body: TokenMutationRouteBody,
  existingToken?: Pick<Token, '$extensions'> | null,
): Partial<Pick<Token, '$type' | '$value' | '$description' | '$extensions'>> {
  const nextBody: Partial<
    Pick<Token, '$type' | '$value' | '$description' | '$extensions'>
  > = {};

  if ('$type' in body) {
    nextBody.$type = body.$type as Token['$type'];
  }
  if ('$value' in body) {
    nextBody.$value = body.$value as Token['$value'];
  }
  if ('$description' in body) {
    nextBody.$description = body.$description ?? undefined;
  }
  if ('$extensions' in body || '$scopes' in body) {
    nextBody.$extensions = normalizeUpdateRouteExtensions(body, existingToken);
  }

  return nextBody;
}

function mergeCollectionSnapshot(
  target: Record<string, SnapshotEntry>,
  collectionId: string,
  snapshot: Record<string, SnapshotEntry>,
): void {
  Object.assign(target, qualifySnapshotEntries(collectionId, snapshot));
}

function groupSnapshotEntriesByCollection(
  snapshot: Record<string, SnapshotEntry>,
): Map<string, Array<{ path: string; token: Token | null }>> {
  const grouped = new Map<string, Array<{ path: string; token: Token | null }>>();
  for (const [snapshotKey, entry] of Object.entries(snapshot)) {
    const prefix = `${entry.collectionId}::`;
    const tokenPath = snapshotKey.startsWith(prefix) ? snapshotKey.slice(prefix.length) : snapshotKey;
    const items = grouped.get(entry.collectionId) ?? [];
    items.push({ path: tokenPath, token: entry.token });
    grouped.set(entry.collectionId, items);
  }
  return grouped;
}

export const tokenRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  function getTokenDefinitionInCollection(
    tokenPath: string,
    collectionId: string,
  ): TokenDefinitionEntry | undefined {
    return fastify.tokenStore
      .getTokenDefinitions(tokenPath)
      .find((definition) => definition.collectionId === collectionId);
  }

  function getCanonicalTokenDefinition(
    tokenPath: string,
  ): TokenDefinitionEntry | undefined {
    return fastify.tokenStore.getTokenDefinitions(tokenPath)[0];
  }

  function buildTokenPathIndex(): {
    pathToCollectionId: Record<string, string>;
    collectionIdsByPath: Record<string, string[]>;
  } {
    const pathToCollectionId: Record<string, string> = {};
    const collectionIdsByPath: Record<string, string[]> = {};

    for (const { path, collectionId } of fastify.tokenStore.getAllFlatTokens()) {
      pathToCollectionId[path] ??= collectionId;
      const collectionIds = collectionIdsByPath[path] ?? [];
      if (!collectionIds.includes(collectionId)) {
        collectionIds.push(collectionId);
        collectionIdsByPath[path] = collectionIds;
      }
    }

    return { pathToCollectionId, collectionIdsByPath };
  }

  function listActiveDependents(
    tokenPath: string,
    targetCollectionId: string,
    pathIndex = buildTokenPathIndex(),
  ): Array<{ path: string; collectionId: string }> {
    return fastify.tokenStore.getDependents(tokenPath).filter((dependent) => {
      const resolution = resolveCollectionIdForPath({
        path: tokenPath,
        preferredCollectionId: dependent.collectionId,
        pathToCollectionId: pathIndex.pathToCollectionId,
        collectionIdsByPath: pathIndex.collectionIdsByPath,
      });
      if (resolution.collectionId !== targetCollectionId) {
        return false;
      }

      const dependentToken = getTokenDefinitionInCollection(
        dependent.path,
        dependent.collectionId,
      )?.token;
      return dependentToken != null && getTokenLifecycle(dependentToken) !== 'deprecated';
    });
  }

  async function loadCollectionModeNames(
    collectionId: string,
  ): Promise<Set<string>> {
    const collection = await loadCollectionDefinition(collectionId);
    return new Set(collection.modes.map((mode) => mode.name));
  }

  async function loadCollectionDefinition(
    collectionId: string,
  ): Promise<TokenCollection> {
    const state = await fastify.collectionService.loadState();
    const collection = findCollectionDefinition(state.collections, collectionId);
    if (!collection) {
      throw new Error(`Collection "${collectionId}" not found`);
    }
    return collection;
  }

  async function validateTokenModesForCollectionWrite(
    collectionId: string,
    tokenPath: string,
    token: Pick<Token, '$extensions'>,
    validModeNames?: Set<string>,
  ): Promise<string | null> {
    const modeNames = validModeNames ?? await loadCollectionModeNames(collectionId);
    return validateCollectionScopedModeValues(
      collectionId,
      modeNames,
      tokenPath,
      token,
    );
  }

  function findMissingTokenReference(
    collectionId: string,
    token: Token,
  ): string | null {
    const references = collectTokenReferencePaths(token, {
      collectionId,
      includeExtends: true,
    });
    return references.find(
      (referencePath) => !fastify.tokenStore.tokenPathExists(referencePath),
    ) ?? null;
  }

  async function validateTokenGroupModesForCollectionWrite(
    collectionId: string,
    tokens: TokenGroup,
  ): Promise<string | null> {
    const validModeNames = await loadCollectionModeNames(collectionId);
    for (const [tokenPath, token] of flattenTokenGroup(tokens)) {
      const error = validateCollectionScopedModeValues(
        collectionId,
        validModeNames,
        tokenPath,
        token,
      );
      if (error) {
        return error;
      }
    }
    return null;
  }

  async function ensureCollectionsExist(
    reply: Parameters<typeof handleRouteError>[0],
    collectionIds: Iterable<string>,
    fallbackMessage: string,
  ): Promise<unknown | undefined> {
    try {
      await fastify.collectionService.requireCollectionsExist(collectionIds);
      return undefined;
    } catch (err) {
      return handleRouteError(reply, err, fallbackMessage);
    }
  }

  fastify.addHook("preHandler", async (request, reply) => {
    const params =
      request.params && typeof request.params === "object"
        ? (request.params as Record<string, unknown>)
        : null;
    const collectionId =
      params && typeof params.collectionId === "string"
        ? params.collectionId
        : null;
    if (!collectionId) {
      return;
    }

    const collectionError = await ensureCollectionsExist(
      reply,
      [collectionId],
      `Collection "${collectionId}" not found`,
    );
    if (collectionError) {
      return collectionError;
    }
  });

  // GET /api/tokens/resolved — get all resolved tokens
  fastify.get('/tokens/resolved', async (_request, reply) => {
    try {
      await fastify.collectionService.loadState();
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

  // GET /api/tokens/search — search tokens across all collections
  fastify.get<{ Querystring: { q?: string; type?: string; has?: string; value?: string; desc?: string; path?: string; name?: string; scope?: string; limit?: string; offset?: string } }>(
    '/tokens/search',
    async (request, reply) => {
      try {
        await fastify.collectionService.loadState();
        const {
          q,
          type,
          has,
          value,
          desc,
          path: pathQ,
          name: nameQ,
          scope,
          limit,
          offset,
        } = request.query;

        if (q && q.length > SEARCH_MAX_Q_LEN) {
          return reply.status(400).send({ error: `"q" must not exceed ${SEARCH_MAX_Q_LEN} characters` });
        }
        const listError =
          validateSearchList(type, 'type') ??
          validateSearchList(has, 'has') ??
          validateSearchList(value, 'value') ??
          validateSearchList(desc, 'desc') ??
          validateSearchList(pathQ, 'path') ??
          validateSearchList(nameQ, 'name') ??
          validateSearchList(scope, 'scope');
        if (listError) return reply.status(400).send({ error: listError });

        const requestedHasValues = has
          ? has.split(",").map((item) => item.trim().toLowerCase())
          : undefined;
        if (
          requestedHasValues &&
          requestedHasValues.some(
            (item) => !CROSS_COLLECTION_SEARCH_HAS_VALUES.has(item),
          )
        ) {
          return reply.status(400).send({
            error:
              'Cross-collection search supports has:alias, has:direct, has:duplicate, has:description, has:extension, and has:managed.',
          });
        }
        const requestedScopeValues = scope
          ? scope.split(",").map((item) => item.trim().toLowerCase())
          : undefined;
        if (
          requestedScopeValues &&
          requestedScopeValues.some(
            (item) => !SUPPORTED_SEARCH_SCOPE_VALUES.has(item),
          )
        ) {
          return reply.status(400).send({
            error:
              'Cross-collection search supports scope:fill, scope:stroke, scope:text, scope:radius, scope:spacing, scope:gap, scope:size, scope:stroke-width, scope:opacity, scope:typography, scope:effect, and scope:visibility.',
          });
        }

        const { limit: resolvedLimit, offset: resolvedOffset } = readPagination(
          { limit, offset },
          {
            defaultLimit: 200,
            maxLimit: 1000,
          },
        );

        const { results, total } = fastify.tokenStore.searchTokens({
          q: q || undefined,
          types: type ? type.split(',') : undefined,
          has: requestedHasValues,
          values: value ? value.split(',') : undefined,
          descs: desc ? desc.split(',') : undefined,
          paths: pathQ ? pathQ.split(',') : undefined,
          names: nameQ ? nameQ.split(',') : undefined,
          scopes: requestedScopeValues?.filter(Boolean),
          limit: resolvedLimit,
          offset: resolvedOffset,
        });
        return {
          data: results,
          total,
          hasMore: hasNextPage(resolvedOffset, results.length, total),
          limit: resolvedLimit,
          offset: resolvedOffset,
        };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to search tokens');
      }
    },
  );

  // GET /api/tokens/:collectionId — get all tokens in a collection (flat list with paths)
  fastify.get<{ Params: { collectionId: string } }>('/tokens/:collectionId', async (request, reply) => {
    try {
      const { collectionId } = request.params;
      const tokenCollection = await fastify.tokenStore.getCollection(collectionId);
      if (!tokenCollection) {
        return reply.status(404).send({ error: `Collection "${collectionId}" not found` });
      }
      return { collectionId, tokens: tokenCollection.tokens };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get collection tokens');
    }
  });

  // POST /api/tokens/:collectionId/groups/rename — rename a group (updates all token paths and alias refs)
  fastify.post<{ Params: { collectionId: string }; Body: { oldGroupPath: string; newGroupPath: string; updateAliases?: boolean } }>(
    '/tokens/:collectionId/groups/rename',
    async (request, reply) => {
      const { collectionId } = request.params;
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
            },
            {
              collectionId,
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

  // POST /api/tokens/:collectionId/groups/move — move a group to a different collection
  fastify.post<{ Params: { collectionId: string }; Body: { groupPath: string; targetCollectionId: string } }>(
    '/tokens/:collectionId/groups/move',
    async (request, reply) => {
      const { collectionId } = request.params;
      const { groupPath, targetCollectionId } = request.body ?? {};
      if (!isValidTokenPath(groupPath)) {
        return reply.status(400).send({ error: 'groupPath must be a valid non-empty path with no leading/trailing dots' });
      }
      if (!isValidCollectionId(targetCollectionId)) {
        return reply.status(400).send({ error: 'targetCollectionId must be a valid non-empty collection id' });
      }
      const collectionError = await ensureCollectionsExist(
        reply,
        [collectionId, targetCollectionId],
        "Failed to load collection move targets",
      );
      if (collectionError) {
        return collectionError;
      }
      return withLock(async () => {
        try {
          const { result } = await moveGroupCommand(
            {
              tokenStore: fastify.tokenStore,
              operationLog: fastify.operationLog,
            },
            {
              sourceCollectionId: collectionId,
              groupPath,
              targetCollectionId,
            },
          );
          return { ok: true, movedCount: result.movedCount };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/tokens/:collectionId/groups/copy — copy a group to a different collection
  fastify.post<{ Params: { collectionId: string }; Body: { groupPath: string; targetCollectionId: string } }>(
    '/tokens/:collectionId/groups/copy',
    async (request, reply) => {
      const { collectionId } = request.params;
      const { groupPath, targetCollectionId } = request.body ?? {};
      if (!isValidTokenPath(groupPath)) {
        return reply.status(400).send({ error: 'groupPath must be a valid non-empty path with no leading/trailing dots' });
      }
      if (!isValidCollectionId(targetCollectionId)) {
        return reply.status(400).send({ error: 'targetCollectionId must be a valid non-empty collection id' });
      }
      const collectionError = await ensureCollectionsExist(
        reply,
        [collectionId, targetCollectionId],
        "Failed to load collection copy targets",
      );
      if (collectionError) {
        return collectionError;
      }
      return withLock(async () => {
        try {
          const { result } = await copyGroupCommand(
            {
              tokenStore: fastify.tokenStore,
              operationLog: fastify.operationLog,
            },
            {
              sourceCollectionId: collectionId,
              groupPath,
              targetCollectionId,
            },
          );
          return { ok: true, copiedCount: result.copiedCount };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/tokens/:collectionId/groups/duplicate — duplicate a group with a -copy suffix
  fastify.post<{ Params: { collectionId: string }; Body: { groupPath: string } }>(
    '/tokens/:collectionId/groups/duplicate',
    async (request, reply) => {
      const { collectionId } = request.params;
      const { groupPath } = request.body ?? {};
      if (!isValidTokenPath(groupPath)) {
        return reply.status(400).send({ error: 'groupPath must be a valid non-empty path with no leading/trailing dots' });
      }
      return withLock(async () => {
        try {
          const result = await fastify.tokenStore.duplicateGroup(collectionId, groupPath);
          const after = await snapshotGroup(fastify.tokenStore, collectionId, result.newGroupPath);
          await fastify.operationLog.record({
            type: 'group-duplicate',
            description: `Duplicate group "${groupPath}" as "${result.newGroupPath}" in ${collectionId}`,
            resourceId: collectionId,
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

  // POST /api/tokens/:collectionId/groups/reorder — reorder direct children of a group
  fastify.post<{ Params: { collectionId: string }; Body: { groupPath?: string; orderedKeys: string[] } }>(
    '/tokens/:collectionId/groups/reorder',
    async (request, reply) => {
      const { collectionId } = request.params;
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
          const before = await snapshotCollection(fastify.tokenStore, collectionId);
          await fastify.tokenStore.reorderGroupChildren(collectionId, groupPath, orderedKeys);
          const after = await snapshotCollection(fastify.tokenStore, collectionId);
          await fastify.operationLog.record({
            type: 'group-reorder',
            description: `Reorder children of "${groupPath || '(root)'}" in ${collectionId}`,
            resourceId: collectionId,
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

  // POST /api/tokens/:collectionId/groups/create — create an empty group at a path
  fastify.post<{ Params: { collectionId: string }; Body: { groupPath: string } }>(
    '/tokens/:collectionId/groups/create',
    async (request, reply) => {
      const { collectionId } = request.params;
      const { groupPath } = request.body ?? {};
      if (!isValidTokenPath(groupPath)) {
        return reply.status(400).send({ error: 'groupPath must be a valid non-empty path with no leading/trailing dots' });
      }
      return withLock(async () => {
        try {
          await fastify.tokenStore.createGroup(collectionId, groupPath);
          await fastify.operationLog.record({
            type: 'group-create',
            description: `Create empty group "${groupPath}" in ${collectionId}`,
            resourceId: collectionId,
            affectedPaths: [groupPath],
            beforeSnapshot: {},
            afterSnapshot: {},
          });
          return reply.status(201).send({ ok: true, groupPath, collectionId });
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // PATCH /api/tokens/:collectionId/groups/meta — update $type and/or $description on a group
  fastify.patch<{
    Params: { collectionId: string };
    Body: { groupPath?: string; $type?: string | null; $description?: string | null };
  }>('/tokens/:collectionId/groups/meta', async (request, reply) => {
    const { collectionId } = request.params;
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
          ? await snapshotGroup(fastify.tokenStore, collectionId, groupPath)
          : await snapshotCollection(fastify.tokenStore, collectionId);
        await fastify.tokenStore.updateGroup(collectionId, groupPath, { $type, $description });
        const after = groupPath
          ? await snapshotGroup(fastify.tokenStore, collectionId, groupPath)
          : await snapshotCollection(fastify.tokenStore, collectionId);
        await fastify.operationLog.record({
          type: 'group-meta-update',
          description: `Update metadata on "${groupPath || '(root)'}" in ${collectionId}`,
          resourceId: collectionId,
          affectedPaths: [groupPath || '(root)'],
          beforeSnapshot: before,
          afterSnapshot: after,
        });
        return { ok: true, groupPath, collectionId };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to update group metadata');
      }
    });
  });

  // POST /api/tokens/:collectionId/bulk-rename — rename tokens by find/replace pattern
  fastify.post<{
    Params: { collectionId: string };
    Body: { find: string; replace: string; isRegex?: boolean };
  }>('/tokens/:collectionId/bulk-rename', async (request, reply) => {
    const { collectionId } = request.params;
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
        const flatTokens = await fastify.tokenStore.getFlatTokensForCollection(collectionId);
        assertNoGeneratorManagedTokenMutation(
          flatTokens,
          listBulkRenameAffectedPaths(Object.keys(flatTokens), find, replace, isRegex),
          'rename',
        );
        const before = await snapshotCollection(fastify.tokenStore, collectionId);
        const result = await fastify.tokenStore.bulkRename(collectionId, find, replace, isRegex);
        const after = await snapshotCollection(fastify.tokenStore, collectionId);
        await fastify.operationLog.record({
          type: 'bulk-rename',
          description: `Bulk rename "${find}" → "${replace}" in ${collectionId}`,
          resourceId: collectionId,
          affectedPaths: [...new Set([...Object.keys(before), ...Object.keys(after)])],
          beforeSnapshot: before,
          afterSnapshot: after,
        });
        return { ok: true, ...result };
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // POST /api/tokens/:collectionId/batch-update — apply partial patches to multiple tokens (single operation log entry)
  fastify.post<{
    Params: { collectionId: string };
    Body: { patches: Array<{ path: string; patch: Record<string, unknown> }> };
  }>('/tokens/:collectionId/batch-update', async (request, reply) => {
    const { collectionId } = request.params;
    const { patches } = request.body ?? {};
    if (!Array.isArray(patches) || patches.length === 0) {
      return reply.status(400).send({ error: 'patches must be a non-empty array' });
    }
    for (const p of patches) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) {
        return reply.status(400).send({ error: 'Each entry must be an object with path and patch' });
      }
      if (!isValidTokenPath(p.path)) {
        return reply.status(400).send({ error: 'Each entry must have a valid non-empty path with no leading/trailing dots' });
      }
      if (!p.patch || typeof p.patch !== 'object' || Array.isArray(p.patch)) {
        return reply.status(400).send({ error: `Each entry must have a patch object (got invalid patch for "${p.path}")` });
      }
      if (!validateTokenBody(p.patch)) {
        return reply.status(400).send({ error: `Invalid patch for "${p.path}": $type must be a valid DTCG token type` });
      }
    }
    return withLock(async () => {
      try {
        await fastify.collectionService.requireCollectionsExist([collectionId]);
        const collection = await loadCollectionDefinition(collectionId);
        const validModeNames = new Set(
          collection.modes.map((mode) => mode.name),
        );
        const normalizedPatches: Array<{
          path: string;
          existingToken: Token;
          patch: Partial<Token>;
        }> =
          [];
        for (const entry of patches) {
          const existingToken = await fastify.tokenStore.getToken(
            collectionId,
            entry.path,
          );
          if (!existingToken) {
            return reply
              .status(404)
              .send({
                error: `Token "${entry.path}" not found in collection "${collectionId}"`,
              });
          }
          if (readGeneratorProvenance(existingToken)) {
            throw new ConflictError(
              `Cannot update generator-managed token "${entry.path}". Detach from the generator first.`,
            );
          }
          normalizedPatches.push({
            path: entry.path,
            existingToken,
            patch: normalizeTokenModesForCollectionWrite(
              normalizeScopedVariableToken(
                normalizeUpdateRouteBody(
                  entry.patch as TokenMutationRouteBody,
                  existingToken,
                ),
              ) as Partial<Token>,
              collection,
            ),
          });
          assertNoGeneratorProvenanceWrite(
            normalizedPatches[normalizedPatches.length - 1].patch,
            `write "${entry.path}"`,
          );
        }
        // Type-aware validation for each patch (needs existing token for inherited type)
        for (const p of normalizedPatches) {
          const modeError = await validateTokenModesForCollectionWrite(
            collectionId,
            p.path,
            p.patch,
            validModeNames,
          );
          if (modeError) {
            return reply.status(400).send({ error: modeError });
          }

          const candidateToken = { ...p.existingToken, ...p.patch } as Token;
          const tokenErr = validateTokenDefinition(candidateToken, p.path);
          if (tokenErr) {
            return reply.status(400).send({
              error: `Invalid token "${p.path}": ${tokenErr}`,
            });
          }

          const patchVal = p.patch.$value;
          if (patchVal !== undefined) {
            const patchType = p.patch.$type;
            const effectiveType = patchType ?? (await fastify.tokenStore.getToken(collectionId, p.path))?.$type;
            if (effectiveType) {
              const valueErr = validateTokenValue(patchVal, effectiveType, p.path);
              if (valueErr) return reply.status(400).send({ error: `Invalid $value for "${p.path}" (type "${effectiveType}"): ${valueErr}` });
            }
          }
          const missingReference = findMissingTokenReference(
            collectionId,
            candidateToken,
          );
          if (missingReference) {
            return reply.status(400).send({
              error: `Alias target "${missingReference}" in "${p.path}" does not exist`,
            });
          }
        }

        const paths = patches.map(p => p.path);
        const before = await snapshotPaths(fastify.tokenStore, collectionId, paths);
        await fastify.tokenStore.batchUpdateTokens(
          collectionId,
          normalizedPatches.map(({ path, patch }) => ({ path, patch })),
        );
        const after = await snapshotPaths(fastify.tokenStore, collectionId, paths);
        const entry = await fastify.operationLog.record({
          type: 'batch-update',
          description: `Batch update ${patches.length} token${patches.length === 1 ? '' : 's'} in ${collectionId}`,
          resourceId: collectionId,
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
      primitiveCollectionId: string;
      primitivePath: string;
      sourceTokens: Array<{ collectionId: string; path: string }>;
    };
  }>('/tokens/promote-alias', async (request, reply) => {
    const { primitiveCollectionId, primitivePath, sourceTokens } = request.body ?? {};

    if (!isValidCollectionId(primitiveCollectionId)) {
      return reply.status(400).send({ error: 'primitiveCollectionId must be a valid non-empty collection id' });
    }
    if (!isValidTokenPath(primitivePath)) {
      return reply.status(400).send({ error: 'primitivePath must be a valid non-empty path with no leading/trailing dots' });
    }
    if (!Array.isArray(sourceTokens) || sourceTokens.length === 0) {
      return reply.status(400).send({ error: 'sourceTokens must include at least one token' });
    }

    const seenSourceTokens = new Set<string>();
    for (const sourceToken of sourceTokens) {
      if (!isValidCollectionId(sourceToken?.collectionId) || !isValidTokenPath(sourceToken?.path)) {
        return reply.status(400).send({ error: 'Each source token must include a valid collectionId and path' });
      }
      const sourceKey = `${sourceToken.collectionId}:${sourceToken.path}`;
      if (seenSourceTokens.has(sourceKey)) {
        return reply.status(400).send({ error: `Duplicate source token "${sourceKey}"` });
      }
      seenSourceTokens.add(sourceKey);
    }
    const collectionError = await ensureCollectionsExist(
      reply,
      [primitiveCollectionId, ...sourceTokens.map((sourceToken) => sourceToken.collectionId)],
      "Failed to load collection alias promotion targets",
    );
    if (collectionError) {
      return collectionError;
    }

    return withLock(async () => {
      try {
        if (await fastify.tokenStore.getToken(primitiveCollectionId, primitivePath)) {
          return reply.status(409).send({ error: `Token "${primitivePath}" already exists in collection "${primitiveCollectionId}"` });
        }

        const collectionDefinitions = new Map<string, TokenCollection>();
        const primitiveCollection =
          await loadCollectionDefinition(primitiveCollectionId);
        collectionDefinitions.set(primitiveCollectionId, primitiveCollection);

        const resolvedSources: Array<{ collectionId: string; path: string; token: Token }> = [];
        let canonicalModeValues: Record<string, unknown> | null = null;
        let canonicalType: Token["$type"] | undefined = undefined;
        let canonicalSerialized: string | null = null;

        for (const sourceToken of sourceTokens) {
          let sourceCollection = collectionDefinitions.get(sourceToken.collectionId);
          if (!sourceCollection) {
            sourceCollection = await loadCollectionDefinition(sourceToken.collectionId);
            collectionDefinitions.set(sourceToken.collectionId, sourceCollection);
          }
          const token = await fastify.tokenStore.getToken(sourceToken.collectionId, sourceToken.path);
          if (!token) {
            return reply.status(404).send({ error: `Source token "${sourceToken.path}" not found in collection "${sourceToken.collectionId}"` });
          }
          if (readGeneratorProvenance(token)) {
            throw new ConflictError(
              `Cannot promote generator-managed token "${sourceToken.path}" in "${sourceToken.collectionId}". Detach from the generator first.`,
            );
          }
          const modeValues = readTokenModeValuesForCollection(
            token,
            sourceCollection,
          );
          const aliasedMode = Object.entries(modeValues).find(([, modeValue]) =>
            isReference(modeValue),
          )?.[0];
          if (aliasedMode) {
            return reply.status(400).send({
              error: `Source token "${sourceToken.path}" in "${sourceToken.collectionId}" is already an alias in mode "${aliasedMode}"`,
            });
          }

          const serializedValue = stableStringify(modeValues);
          if (canonicalSerialized === null) {
            canonicalModeValues = modeValues;
            canonicalType = token.$type;
            canonicalSerialized = serializedValue;
          } else if (serializedValue !== canonicalSerialized || token.$type !== canonicalType) {
            return reply.status(400).send({
              error: `Source token "${sourceToken.path}" in "${sourceToken.collectionId}" does not match the group's shared mode values`,
            });
          }

          resolvedSources.push({
            collectionId: sourceToken.collectionId,
            path: sourceToken.path,
            token,
          });
        }

        const touchedPathsByCollection = new Map<string, Set<string>>();
        for (const sourceToken of resolvedSources) {
          const paths = touchedPathsByCollection.get(sourceToken.collectionId) ?? new Set<string>();
          paths.add(sourceToken.path);
          touchedPathsByCollection.set(sourceToken.collectionId, paths);
        }
        const primitiveCollectionPaths =
          touchedPathsByCollection.get(primitiveCollectionId) ?? new Set<string>();
        primitiveCollectionPaths.add(primitivePath);
        touchedPathsByCollection.set(primitiveCollectionId, primitiveCollectionPaths);

        const beforeSnapshot: Record<string, SnapshotEntry> = {};
        for (const [collectionId, paths] of touchedPathsByCollection.entries()) {
          const snapshot = await snapshotPaths(fastify.tokenStore, collectionId, [...paths]);
          mergeCollectionSnapshot(beforeSnapshot, collectionId, snapshot);
        }

        if (!canonicalModeValues) {
          return reply.status(400).send({ error: 'No source token values found' });
        }

        const primitiveInitialValue = Object.values(canonicalModeValues)[0] as Token["$value"];
        const primitiveToken = {
          ...(canonicalType ? { $type: canonicalType } : {}),
          $value: primitiveInitialValue,
        };
        try {
          writeTokenModeValuesForCollection(
            primitiveToken,
            primitiveCollection,
            canonicalModeValues,
          );
        } catch (err) {
          return reply.status(400).send({
            error:
              err instanceof Error
                ? err.message
                : 'Primitive collection modes do not match the source token modes',
          });
        }

        await fastify.tokenStore.createToken(
          primitiveCollectionId,
          primitivePath,
          primitiveToken,
        );

        const sourceTokensByCollection = new Map<string, Array<{ path: string; patch: Record<string, unknown> }>>();
        for (const sourceToken of resolvedSources) {
          const sourceCollection = collectionDefinitions.get(sourceToken.collectionId);
          if (!sourceCollection) {
            throw new Error(`Collection "${sourceToken.collectionId}" not found`);
          }
          const aliasModeValues = Object.fromEntries(
            sourceCollection.modes.map((mode) => [mode.name, `{${primitivePath}}`]),
          );
          const nextSourceToken = structuredClone(sourceToken.token);
          writeTokenModeValuesForCollection(
            nextSourceToken,
            sourceCollection,
            aliasModeValues,
          );
          const patches = sourceTokensByCollection.get(sourceToken.collectionId) ?? [];
          patches.push({
            path: sourceToken.path,
            patch: {
              $value: nextSourceToken.$value,
              $extensions: nextSourceToken.$extensions,
            },
          });
          sourceTokensByCollection.set(sourceToken.collectionId, patches);
        }

        for (const [collectionId, patches] of sourceTokensByCollection.entries()) {
          await fastify.tokenStore.batchUpdateTokens(collectionId, patches);
        }

        const afterSnapshot: Record<string, SnapshotEntry> = {};
        for (const [collectionId, paths] of touchedPathsByCollection.entries()) {
          const snapshot = await snapshotPaths(fastify.tokenStore, collectionId, [...paths]);
          mergeCollectionSnapshot(afterSnapshot, collectionId, snapshot);
        }

        const entry = await fastify.operationLog.record({
          type: 'batch-update',
          description: `Promote ${resolvedSources.length} tokens to shared alias "${primitivePath}"`,
          resourceId: primitiveCollectionId,
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
          primitiveCollectionId,
          promoted: resolvedSources.length,
          operationId: entry.id,
        });
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to promote tokens to a shared alias');
      }
    });
  });

  // POST /api/tokens/:collectionId/batch-rename-paths — rename specific token paths (single operation log entry)
  fastify.post<{
    Params: { collectionId: string };
    Body: { renames: Array<{ oldPath: string; newPath: string }>; updateAliases?: boolean };
  }>('/tokens/:collectionId/batch-rename-paths', async (request, reply) => {
    const { collectionId } = request.params;
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
          },
          {
            collectionId,
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

  // POST /api/tokens/:collectionId/batch-move — move multiple tokens to another collection (single operation log entry)
  fastify.post<{
    Params: { collectionId: string };
    Body: { paths: string[]; targetCollectionId: string };
  }>('/tokens/:collectionId/batch-move', async (request, reply) => {
    const { collectionId } = request.params;
    const { paths, targetCollectionId } = request.body ?? {};
    if (!Array.isArray(paths) || paths.length === 0) {
      return reply.status(400).send({ error: 'paths must be a non-empty array' });
    }
    if (paths.some((p: unknown) => !isValidTokenPath(p))) {
      return reply.status(400).send({ error: 'Each path must be a valid non-empty string with no leading/trailing dots' });
    }
    if (!isValidCollectionId(targetCollectionId)) {
      return reply.status(400).send({ error: 'targetCollectionId must be a valid non-empty collection id' });
    }
    const collectionError = await ensureCollectionsExist(
      reply,
      [collectionId, targetCollectionId],
      "Failed to load batch move targets",
    );
    if (collectionError) {
      return collectionError;
    }
    return withLock(async () => {
      try {
        const { result, operationId } = await batchMoveTokensCommand(
          {
            tokenStore: fastify.tokenStore,
            operationLog: fastify.operationLog,
          },
          {
            sourceCollectionId: collectionId,
            paths,
            targetCollectionId,
          },
        );
        return { ok: true, moved: result.moved, operationId };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to batch move tokens');
      }
    });
  });

  // POST /api/tokens/:collectionId/batch-copy — copy multiple tokens to another collection, preserving originals
  fastify.post<{
    Params: { collectionId: string };
    Body: { paths: string[]; targetCollectionId: string };
  }>('/tokens/:collectionId/batch-copy', async (request, reply) => {
    const { collectionId } = request.params;
    const { paths, targetCollectionId } = request.body ?? {};
    if (!Array.isArray(paths) || paths.length === 0) {
      return reply.status(400).send({ error: 'paths must be a non-empty array' });
    }
    if (paths.some((p: unknown) => !isValidTokenPath(p))) {
      return reply.status(400).send({ error: 'Each path must be a valid non-empty string with no leading/trailing dots' });
    }
    if (!isValidCollectionId(targetCollectionId)) {
      return reply.status(400).send({ error: 'targetCollectionId must be a valid non-empty collection id' });
    }
    const collectionError = await ensureCollectionsExist(
      reply,
      [collectionId, targetCollectionId],
      "Failed to load batch copy targets",
    );
    if (collectionError) {
      return collectionError;
    }
    return withLock(async () => {
      try {
        const { result, operationId } = await batchCopyTokensCommand(
          {
            tokenStore: fastify.tokenStore,
            operationLog: fastify.operationLog,
          },
          {
            sourceCollectionId: collectionId,
            paths,
            targetCollectionId,
          },
        );
        return { ok: true, copied: result.copied, operationId };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to batch copy tokens');
      }
    });
  });

  // POST /api/tokens/:collectionId/batch — upsert multiple tokens in a single request
  fastify.post<{
    Params: { collectionId: string };
    Body: { tokens: BatchTokenMutationRouteBody[]; strategy: 'skip' | 'overwrite' | 'merge' };
  }>('/tokens/:collectionId/batch', async (request, reply) => {
    const { collectionId } = request.params;
    const { tokens: rawTokens, strategy } = request.body ?? {};
    if (!Array.isArray(rawTokens) || rawTokens.length === 0) {
      return reply.status(400).send({ error: 'tokens must be a non-empty array' });
    }
    if (strategy !== 'skip' && strategy !== 'overwrite' && strategy !== 'merge') {
      return reply.status(400).send({ error: 'strategy must be "skip", "overwrite", or "merge"' });
    }
    const tokens: Array<{
      path: string;
      token: Token;
    }> = [];
    for (const rawToken of rawTokens) {
      if (!rawToken || typeof rawToken !== 'object' || Array.isArray(rawToken)) {
        return reply.status(400).send({ error: 'Each token must be an object with path and token fields' });
      }
      const { path: tokenPath, ...rawTokenBody } =
        rawToken as BatchTokenMutationRouteBody;
      if (!isValidTokenPath(tokenPath)) {
        return reply.status(400).send({ error: 'Each token must have a valid non-empty path with no leading/trailing dots' });
      }
      if (!validateTokenBody(rawTokenBody)) {
        return reply.status(400).send({ error: `Invalid token body for "${tokenPath}": $type must be a valid DTCG token type` });
      }
      if (rawTokenBody.$value === undefined) {
        return reply.status(400).send({ error: `Token "${tokenPath}" must have a $value` });
      }
      const token = normalizeScopedVariableToken(
        normalizeCreateRouteBody(rawTokenBody),
      );
      assertNoGeneratorProvenanceWrite(token, `write "${tokenPath}"`);
      // Type-aware value validation when $type is explicitly provided
      if (token.$type) {
        const valueErr = validateTokenValue(token.$value, token.$type, tokenPath);
        if (valueErr) return reply.status(400).send({ error: `Invalid $value for "${tokenPath}" (type "${token.$type}"): ${valueErr}` });
      }
      tokens.push({ path: tokenPath, token });
    }
    return withLock(async () => {
      try {
        await fastify.collectionService.requireCollectionsExist([collectionId]);
        const collection = await loadCollectionDefinition(collectionId);
        const validModeNames = new Set(
          collection.modes.map((mode) => mode.name),
        );
        // Check alias targets exist (allow intra-batch references)
        const batchPaths = new Set(tokens.map(({ path }) => path));
        const normalizedTokens = tokens.map(({ path, token }) => ({
          path,
          token: normalizeTokenModesForCollectionWrite(token, collection),
        }));
        for (const t of normalizedTokens) {
          const existingToken = await fastify.tokenStore.getToken(
            collectionId,
            t.path,
          );
          if (existingToken && strategy !== 'skip' && readGeneratorProvenance(existingToken)) {
            throw new ConflictError(
              `Cannot ${strategy} generator-managed token "${t.path}". Detach from the generator first.`,
            );
          }
          const modeError = await validateTokenModesForCollectionWrite(
            collectionId,
            t.path,
            t.token,
            validModeNames,
          );
          if (modeError) {
            return reply.status(400).send({ error: modeError });
          }

          const tokenToValidate =
            existingToken && strategy === 'skip'
              ? null
              : existingToken && strategy === 'merge'
                ? ({
                    ...existingToken,
                    ...("$value" in t.token ? { $value: t.token.$value } : {}),
                    ...("$type" in t.token ? { $type: t.token.$type } : {}),
                  } as Token)
                : t.token;
          const tokenErr = tokenToValidate
            ? validateTokenDefinition(tokenToValidate, t.path)
            : null;
          if (tokenErr) {
            return reply.status(400).send({
              error: `Invalid token "${t.path}": ${tokenErr}`,
            });
          }

          if (isReference(t.token.$value)) {
            const targetPath = parseReference(t.token.$value as string);
            if (!fastify.tokenStore.tokenPathExists(targetPath) && !batchPaths.has(targetPath)) {
              return reply.status(400).send({ error: `Alias target "${targetPath}" in "${t.path}" does not exist` });
            }
          }
        }

        const paths = tokens.map(({ path }) => path);
        const before = await snapshotPaths(fastify.tokenStore, collectionId, paths);
        const result = await fastify.tokenStore.batchUpsertTokens(
          collectionId,
          normalizedTokens.map(({ path, token }) => ({ path, token })),
          strategy,
        );
        const after = await snapshotPaths(fastify.tokenStore, collectionId, paths);
        const changedSnapshotKeys = listChangedSnapshotKeys(before, after);
        const changedPaths = listChangedSnapshotTokenPaths(before, after);
        const beforeSnapshot = pickSnapshotEntries(before, changedSnapshotKeys);
        const afterSnapshot = pickSnapshotEntries(after, changedSnapshotKeys);

        let operationId: string | undefined;
        if (changedSnapshotKeys.length > 0) {
          operationId = (
            await fastify.operationLog.record({
              type: 'batch-upsert',
              description: `Batch upsert ${tokens.length} tokens in ${collectionId}`,
              resourceId: collectionId,
              affectedPaths: changedPaths,
              beforeSnapshot,
              afterSnapshot,
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
      await fastify.collectionService.loadState();
      const deprecatedEntries = new Map<string, { deprecatedPath: string; collectionId: string; type: string }>();
      const pathIndex = buildTokenPathIndex();
      for (const { path: tokenPath, token, collectionId } of fastify.tokenStore.getAllFlatTokens()) {
        if (getTokenLifecycle(token) !== 'deprecated') {
          continue;
        }
        const canonicalDefinition = getCanonicalTokenDefinition(tokenPath);
        if (!canonicalDefinition || canonicalDefinition.collectionId !== collectionId) {
          continue;
        }
        const entryKey = `${collectionId}:${tokenPath}`;
        if (deprecatedEntries.has(entryKey)) {
          continue;
        }
        deprecatedEntries.set(entryKey, {
          deprecatedPath: tokenPath,
          collectionId,
          type: token.$type ?? 'unknown',
        });
      }

      const entries = [...deprecatedEntries.values()]
        .map((entry) => ({
          ...entry,
          dependents: listActiveDependents(entry.deprecatedPath, entry.collectionId, pathIndex)
            .slice()
            .sort(
              (a, b) =>
                a.path.localeCompare(b.path) ||
                a.collectionId.localeCompare(b.collectionId),
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
            a.collectionId.localeCompare(b.collectionId) ||
            a.deprecatedPath.localeCompare(b.deprecatedPath),
        );

      return { entries };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to load deprecated token usage');
    }
  });

  // POST /api/tokens/deprecated-usage/replace — replace authored references to a deprecated token
  fastify.post<{
    Body: {
      collectionId?: string;
      deprecatedPath?: string;
      replacementPath?: string;
      replacementCollectionId?: string;
    };
  }>('/tokens/deprecated-usage/replace', async (request, reply) => {
    const { collectionId, deprecatedPath, replacementPath, replacementCollectionId } = request.body ?? {};
    if (!isValidCollectionId(collectionId)) {
      return reply.status(400).send({ error: 'collectionId must be a valid non-empty collection id' });
    }
    if (!isValidCollectionId(replacementCollectionId)) {
      return reply.status(400).send({ error: 'replacementCollectionId must be a valid non-empty collection id' });
    }
    if (!isValidTokenPath(deprecatedPath) || !isValidTokenPath(replacementPath)) {
      return reply.status(400).send({ error: 'deprecatedPath and replacementPath must be valid non-empty token paths' });
    }
    if (deprecatedPath === replacementPath && collectionId === replacementCollectionId) {
      return reply.status(400).send({ error: 'replacement token must be different from deprecated token' });
    }

    return withLock(async () => {
      const beforeSnapshot: Record<string, SnapshotEntry> = {};
      try {
        await fastify.collectionService.loadState();
        const deprecatedDefinition = getTokenDefinitionInCollection(
          deprecatedPath,
          collectionId,
        );
        if (!deprecatedDefinition) {
          return reply.status(404).send({
            error: `Deprecated token "${deprecatedPath}" not found in collection "${collectionId}"`,
          });
        }
        if (getTokenLifecycle(deprecatedDefinition.token) !== 'deprecated') {
          return reply.status(400).send({
            error: `Token "${deprecatedPath}" in collection "${collectionId}" is not deprecated`,
          });
        }
        const canonicalDefinition = getCanonicalTokenDefinition(deprecatedPath);
        if (!canonicalDefinition || canonicalDefinition.collectionId !== collectionId) {
          return reply.status(400).send({
            error: `Deprecated token "${deprecatedPath}" can only be replaced from its canonical collection definition`,
          });
        }

        const replacementDefinition = getTokenDefinitionInCollection(
          replacementPath,
          replacementCollectionId,
        );
        if (!replacementDefinition) {
          return reply.status(404).send({
            error: `Replacement token "${replacementPath}" not found in collection "${replacementCollectionId}"`,
          });
        }
        const replacementToken = replacementDefinition.token;
        if (getTokenLifecycle(replacementToken) === 'deprecated') {
          return reply.status(400).send({
            error: `Replacement token "${replacementPath}" in collection "${replacementCollectionId}" is deprecated`,
          });
        }

        const deprecatedType = deprecatedDefinition.token.$type;
        const replacementType = replacementToken.$type;
        if (deprecatedType && replacementType && deprecatedType !== replacementType) {
          return reply.status(400).send({
            error: `Replacement token "${replacementPath}" has type "${replacementType}" but deprecated token "${deprecatedPath}" has type "${deprecatedType}"`,
          });
        }

        const pathIndex = buildTokenPathIndex();
        const dependents = listActiveDependents(deprecatedPath, collectionId, pathIndex);
        if (dependents.length === 0) {
          return { ok: true, updated: 0 };
        }

        const unresolvedDependents = dependents.filter((dependent) => {
          const resolution = resolveCollectionIdForPath({
            path: replacementPath,
            preferredCollectionId: dependent.collectionId,
            pathToCollectionId: pathIndex.pathToCollectionId,
            collectionIdsByPath: pathIndex.collectionIdsByPath,
          });
          return resolution.collectionId !== replacementCollectionId;
        });
        if (unresolvedDependents.length > 0) {
          const preview = unresolvedDependents
            .slice(0, 5)
            .map((dependent) => `"${dependent.path}" in "${dependent.collectionId}"`)
            .join(', ');
          const more =
            unresolvedDependents.length > 5
              ? ` and ${unresolvedDependents.length - 5} more`
              : '';
          throw new ConflictError(
            `Replacement token "${replacementPath}" from "${replacementCollectionId}" cannot be used because that path resolves to a different collection from ${preview}${more}. Choose a replacement that resolves from every dependent collection.`,
          );
        }

        const replacementPathMap = new Map([[deprecatedPath, replacementPath]]);
        const patchesByCollection = new Map<string, Array<{ path: string; patch: Partial<Token> }>>();
        const updatedDependentPaths: string[] = [];
        let updatedReferences = 0;
        for (const dependent of dependents) {
          const existingDefinition = getTokenDefinitionInCollection(
            dependent.path,
            dependent.collectionId,
          );
          if (!existingDefinition) {
            return reply.status(404).send({
              error: `Dependent token "${dependent.path}" in collection "${dependent.collectionId}" no longer exists`,
            });
          }
          const existing = existingDefinition.token;
          const existingWithInheritedType =
            await fastify.tokenStore.getToken(dependent.collectionId, dependent.path) ?? existing;
          if (readGeneratorProvenance(existing)) {
            throw new ConflictError(
              `Cannot retarget generator-managed token "${dependent.path}" in "${dependent.collectionId}". Detach from the generator first.`,
            );
          }
          if (
            existingWithInheritedType.$type &&
            replacementType &&
            existingWithInheritedType.$type !== replacementType
          ) {
            return reply.status(400).send({
              error:
                `Cannot retarget "${dependent.path}" in collection "${dependent.collectionId}" ` +
                `from type "${existingWithInheritedType.$type}" to replacement type "${replacementType}"`,
            });
          }

          const nextToken = structuredClone(existing);
          const replacedReferences = updateTokenAliasRefs(nextToken, replacementPathMap);
          if (replacedReferences === 0) {
            continue;
          }
          updatedReferences += replacedReferences;
          updatedDependentPaths.push(dependent.path);

          const patches = patchesByCollection.get(dependent.collectionId) ?? [];
          patches.push({
            path: dependent.path,
            patch: nextToken,
          });
          patchesByCollection.set(dependent.collectionId, patches);
        }

        if (updatedReferences === 0) {
          return { ok: true, updated: 0 };
        }

        for (const [targetCollectionId, patches] of patchesByCollection.entries()) {
          const snapshot = await snapshotPaths(
            fastify.tokenStore,
            targetCollectionId,
            patches.map(patch => patch.path),
          );
          mergeCollectionSnapshot(beforeSnapshot, targetCollectionId, snapshot);
        }

        for (const [targetCollectionId, patches] of patchesByCollection.entries()) {
          await fastify.tokenStore.batchUpdateTokens(targetCollectionId, patches);
        }

        const afterSnapshot: Record<string, SnapshotEntry> = {};
        for (const [targetCollectionId, patches] of patchesByCollection.entries()) {
          const snapshot = await snapshotPaths(
            fastify.tokenStore,
            targetCollectionId,
            patches.map(patch => patch.path),
          );
          mergeCollectionSnapshot(afterSnapshot, targetCollectionId, snapshot);
        }

        const operationEntry = await fastify.operationLog.record({
          type: 'replace-deprecated-references',
          description: `Replace ${updatedReferences} reference${updatedReferences === 1 ? '' : 's'} from "${deprecatedPath}" to "${replacementPath}"`,
          resourceId: deprecatedDefinition.collectionId,
          affectedPaths: updatedDependentPaths,
          beforeSnapshot,
          afterSnapshot,
        });

        return {
          ok: true,
          updated: updatedReferences,
          operationId: operationEntry.id,
        };
      } catch (err) {
        if (Object.keys(beforeSnapshot).length > 0) {
          const snapshotByCollection = groupSnapshotEntriesByCollection(beforeSnapshot);
          for (const [targetCollectionId, items] of snapshotByCollection.entries()) {
            await fastify.tokenStore.restoreSnapshot(targetCollectionId, items);
          }
        }
        return handleRouteError(reply, err, 'Failed to replace deprecated references');
      }
    });
  });

  // GET /api/tokens/:collectionId/dependents/* — get tokens that reference a given token path (cross-collection)
  fastify.get<{ Params: { collectionId: string; '*': string } }>('/tokens/:collectionId/dependents/*', async (request, reply) => {
    const { collectionId } = request.params;
    const tokenCollection = await fastify.tokenStore.getCollection(collectionId);
    if (!tokenCollection) {
      return reply.status(404).send({ error: `Collection "${collectionId}" not found` });
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

  // GET /api/tokens/:collectionId/group-dependents/* — get tokens that reference any token under a group prefix
  fastify.get<{ Params: { collectionId: string; '*': string } }>('/tokens/:collectionId/group-dependents/*', async (request, reply) => {
    const { collectionId } = request.params;
    const tokenCollection = await fastify.tokenStore.getCollection(collectionId);
    if (!tokenCollection) {
      return reply.status(404).send({ error: `Collection "${collectionId}" not found` });
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

  // GET /api/tokens/:collectionId/tokens/rename-preview — preview alias changes from a token rename (dry-run)
  fastify.get<{ Params: { collectionId: string }; Querystring: { oldPath: string; newPath: string } }>(
    '/tokens/:collectionId/tokens/rename-preview',
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

  // GET /api/tokens/:collectionId/groups/rename-preview — preview alias changes from a group rename (dry-run)
  fastify.get<{ Params: { collectionId: string }; Querystring: { oldGroupPath: string; newGroupPath: string } }>(
    '/tokens/:collectionId/groups/rename-preview',
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

  // POST /api/tokens/:collectionId/tokens/rename — rename a single leaf token and update alias references
  fastify.post<{ Params: { collectionId: string }; Body: { oldPath: string; newPath: string; updateAliases?: boolean } }>(
    '/tokens/:collectionId/tokens/rename',
    async (request, reply) => {
      const { collectionId } = request.params;
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
            },
            {
              collectionId,
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

  // POST /api/tokens/:collectionId/tokens/move — move a single token to a different collection
  fastify.post<{
    Params: { collectionId: string };
    Body: {
      tokenPath: string;
      targetCollectionId: string;
      targetPath?: string;
      overwriteExisting?: boolean;
    };
  }>(
    '/tokens/:collectionId/tokens/move',
    async (request, reply) => {
      const { collectionId } = request.params;
      const { tokenPath, targetCollectionId, targetPath, overwriteExisting } = request.body ?? {};
      if (!isValidTokenPath(tokenPath)) {
        return reply.status(400).send({ error: 'tokenPath must be a valid non-empty path with no leading/trailing dots' });
      }
      if (!isValidCollectionId(targetCollectionId)) {
        return reply.status(400).send({ error: 'targetCollectionId must be a valid non-empty collection id' });
      }
      if (targetPath !== undefined && !isValidTokenPath(targetPath)) {
        return reply.status(400).send({ error: 'targetPath must be a valid non-empty path with no leading/trailing dots' });
      }
      if (overwriteExisting !== undefined && typeof overwriteExisting !== 'boolean') {
        return reply.status(400).send({ error: 'overwriteExisting must be a boolean when provided' });
      }
      const collectionError = await ensureCollectionsExist(
        reply,
        [collectionId, targetCollectionId],
        "Failed to load token move targets",
      );
      if (collectionError) {
        return collectionError;
      }
      return withLock(async () => {
        try {
          await moveTokenCommand(
            {
              tokenStore: fastify.tokenStore,
              operationLog: fastify.operationLog,
            },
            {
              sourceCollectionId: collectionId,
              tokenPath,
              targetCollectionId,
              targetPath,
              overwriteExisting,
            },
          );
          return { ok: true };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/tokens/:collectionId/tokens/copy — copy a single token to a different collection
  fastify.post<{
    Params: { collectionId: string };
    Body: {
      tokenPath: string;
      targetCollectionId: string;
      targetPath?: string;
      overwriteExisting?: boolean;
    };
  }>(
    '/tokens/:collectionId/tokens/copy',
    async (request, reply) => {
      const { collectionId } = request.params;
      const { tokenPath, targetCollectionId, targetPath, overwriteExisting } = request.body ?? {};
      if (!isValidTokenPath(tokenPath)) {
        return reply.status(400).send({ error: 'tokenPath must be a valid non-empty path with no leading/trailing dots' });
      }
      if (!isValidCollectionId(targetCollectionId)) {
        return reply.status(400).send({ error: 'targetCollectionId must be a valid non-empty collection id' });
      }
      if (targetPath !== undefined && !isValidTokenPath(targetPath)) {
        return reply.status(400).send({ error: 'targetPath must be a valid non-empty path with no leading/trailing dots' });
      }
      if (overwriteExisting !== undefined && typeof overwriteExisting !== 'boolean') {
        return reply.status(400).send({ error: 'overwriteExisting must be a boolean when provided' });
      }
      const collectionError = await ensureCollectionsExist(
        reply,
        [collectionId, targetCollectionId],
        "Failed to load token copy targets",
      );
      if (collectionError) {
        return collectionError;
      }
      return withLock(async () => {
        try {
          await copyTokenCommand(
            {
              tokenStore: fastify.tokenStore,
              operationLog: fastify.operationLog,
            },
            {
              sourceCollectionId: collectionId,
              tokenPath,
              targetCollectionId,
              targetPath,
              overwriteExisting,
            },
          );
          return { ok: true };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // GET /api/tokens/:collectionId/raw — get the raw nested DTCG token group for a collection
  fastify.get<{ Params: { collectionId: string } }>('/tokens/:collectionId/raw', async (request, reply) => {
    try {
      const { collectionId } = request.params;
      const tokenCollection = await fastify.tokenStore.getCollection(collectionId);
      if (!tokenCollection) {
        return reply.status(404).send({ error: `Collection "${collectionId}" not found` });
      }
      return tokenCollection.tokens;
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get raw collection tokens');
    }
  });

  // PUT /api/tokens/:collectionId — replace all tokens in a collection with a new nested DTCG token group
  fastify.put<{ Params: { collectionId: string }; Body: Record<string, unknown> }>(
    '/tokens/:collectionId',
    async (request, reply) => {
      const { collectionId } = request.params;
      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.status(400).send({ error: 'Request body must be a JSON object' });
      }
      return withLock(async () => {
        try {
          await fastify.collectionService.requireCollectionsExist([collectionId]);
          const collection = await loadCollectionDefinition(collectionId);
          const normalizedBody = normalizeTokenGroupModesForCollectionWrite(
            body as TokenGroup,
            collection,
          );
          const modeError = await validateTokenGroupModesForCollectionWrite(
            collectionId,
            normalizedBody,
          );
          if (modeError) {
            return reply.status(400).send({ error: modeError });
          }
          for (const [path, token] of flattenTokenGroup(normalizedBody)) {
            assertNoGeneratorProvenanceWrite(token, `write "${path}"`);
          }
          const validationErrors = _tokenValidator
            .validateSet(normalizedBody)
            .flatMap((result) => result.errors);
          if (validationErrors.length > 0) {
            return reply.status(400).send({
              error: `Invalid collection tokens: ${validationErrors.join('; ')}`,
            });
          }
          const existingFlatTokens = await fastify.tokenStore.getFlatTokensForCollection(collectionId);
          assertNoGeneratorManagedTokenMutation(
            existingFlatTokens,
            Object.keys(existingFlatTokens),
            'replace collection tokens containing',
          );
          const before = await snapshotCollection(fastify.tokenStore, collectionId);
          await fastify.tokenStore.replaceCollectionTokens(
            collectionId,
            normalizedBody,
          );
          const after = await snapshotCollection(fastify.tokenStore, collectionId);
          await fastify.operationLog.record({
            type: 'collection-replace',
            description: `Replace all tokens in ${collectionId}`,
            resourceId: collectionId,
            affectedPaths: [...new Set([...Object.keys(before), ...Object.keys(after)])],
            beforeSnapshot: before,
            afterSnapshot: after,
          });
          return { ok: true, collectionId };
        } catch (err) {
          return handleRouteError(reply, err, 'Failed to replace collection tokens');
        }
      });
    },
  );

  // GET /api/tokens/:collectionId/* — get single token by path
  fastify.get<{ Params: { collectionId: string; '*': string } }>('/tokens/:collectionId/*', async (request, reply) => {
    const { collectionId } = request.params;
    const tokenPath = wildcardParamToTokenPath(request.params['*']);
    if (!tokenPath) {
      return reply.status(400).send({ error: 'Token path is required' });
    }

    try {
      const token = await fastify.tokenStore.getToken(collectionId, tokenPath);
      if (!token) {
        return reply.status(404).send({ error: `Token "${tokenPath}" not found in collection "${collectionId}"` });
      }

      // Also try to resolve it
      const resolved = await fastify.tokenStore.resolveToken(tokenPath);
      return { path: tokenPath, token, resolved: resolved?.$value ?? null };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get token');
    }
  });

  // POST /api/tokens/:collectionId/* — create token
  fastify.post<{ Params: { collectionId: string; '*': string }; Body: TokenMutationRouteBody }>(
    '/tokens/:collectionId/*',
    async (request, reply) => {
      const { collectionId } = request.params;
      const tokenPath = wildcardParamToTokenPath(request.params['*']);
      if (!tokenPath) {
        return reply.status(400).send({ error: 'Token path is required' });
      }

      const rawBody = request.body;
      if (!rawBody || rawBody.$value === undefined) {
        return reply.status(400).send({ error: 'Token must have a $value property' });
      }
      if (!validateTokenBody(rawBody)) {
        return reply.status(400).send({ error: 'Invalid token body: $type must be a valid DTCG token type' });
      }
      const body = normalizeScopedVariableToken(
        normalizeCreateRouteBody(rawBody),
      );

      // Type-aware value validation (can be done before acquiring the lock)
      if (body.$type) {
        const valueErr = validateTokenValue(body.$value, body.$type, tokenPath);
        if (valueErr) return reply.status(400).send({ error: `Invalid $value for type "${body.$type}": ${valueErr}` });
      }

      return withLock(async () => {
        try {
          await fastify.collectionService.requireCollectionsExist([collectionId]);
          const collection = await loadCollectionDefinition(collectionId);
          const normalizedBody = normalizeTokenModesForCollectionWrite(
            body as Token,
            collection,
          );
          assertNoGeneratorProvenanceWrite(normalizedBody, `create "${tokenPath}"`);
          const modeError = await validateTokenModesForCollectionWrite(
            collectionId,
            tokenPath,
            normalizedBody,
          );
          if (modeError) {
            return reply.status(400).send({ error: modeError });
          }
          const tokenErr = validateTokenDefinition(normalizedBody, tokenPath);
          if (tokenErr) {
            return reply.status(400).send({
              error: `Invalid token "${tokenPath}": ${tokenErr}`,
            });
          }
          // Check if token already exists
          const existing = await fastify.tokenStore.getToken(collectionId, tokenPath);
          if (existing) {
            return reply.status(409).send({ error: `Token "${tokenPath}" already exists in collection "${collectionId}"` });
          }

          const missingReference = findMissingTokenReference(
            collectionId,
            normalizedBody,
          );
          if (missingReference) {
            return reply.status(400).send({
              error: `Alias target "${missingReference}" in "${tokenPath}" does not exist`,
            });
          }

          const before = await snapshotPaths(fastify.tokenStore, collectionId, [tokenPath]);
          await fastify.tokenStore.createToken(
            collectionId,
            tokenPath,
            normalizedBody,
          );
          const after = await snapshotPaths(fastify.tokenStore, collectionId, [tokenPath]);
          await fastify.operationLog.record({
            type: 'token-create',
            description: `Create token "${tokenPath}" in ${collectionId}`,
            resourceId: collectionId,
            affectedPaths: [tokenPath],
            beforeSnapshot: before,
            afterSnapshot: after,
          });
          const created = await fastify.tokenStore.getToken(collectionId, tokenPath);
          return reply.status(201).send({ ok: true, path: tokenPath, collectionId, token: created });
        } catch (err) {
          return handleRouteError(reply, err, 'Failed to create token');
        }
      });
    },
  );

  // PATCH /api/tokens/:collectionId/* — update token
  fastify.patch<{ Params: { collectionId: string; '*': string }; Body: TokenMutationRouteBody }>(
    '/tokens/:collectionId/*',
    async (request, reply) => {
      const { collectionId } = request.params;
      const tokenPath = wildcardParamToTokenPath(request.params['*']);
      if (!tokenPath) {
        return reply.status(400).send({ error: 'Token path is required' });
      }

      const rawBody = request.body;
      if (!validateTokenBody(rawBody)) {
        return reply.status(400).send({ error: 'Invalid token body: $type must be a valid DTCG token type' });
      }

      return withLock(async () => {
        try {
          await fastify.collectionService.requireCollectionsExist([collectionId]);
          const existingToken = await fastify.tokenStore.getToken(
            collectionId,
            tokenPath,
          );
          if (!existingToken) {
            return reply.status(404).send({
              error: `Token "${tokenPath}" not found in collection "${collectionId}"`,
            });
          }
          if (readGeneratorProvenance(existingToken)) {
            throw new ConflictError(
              `Cannot update generator-managed token "${tokenPath}". Detach from the generator first.`,
            );
          }
          const body = normalizeScopedVariableToken(
            normalizeUpdateRouteBody(rawBody, existingToken),
          );
          const collection = await loadCollectionDefinition(collectionId);
          const normalizedBody = normalizeTokenModesForCollectionWrite(
            body as Partial<Token>,
            collection,
          );
          assertNoGeneratorProvenanceWrite(normalizedBody, `update "${tokenPath}"`);
          const modeError = await validateTokenModesForCollectionWrite(
            collectionId,
            tokenPath,
            normalizedBody,
          );
          if (modeError) {
            return reply.status(400).send({ error: modeError });
          }
          const candidateToken = { ...existingToken, ...normalizedBody } as Token;
          const tokenErr = validateTokenDefinition(candidateToken, tokenPath);
          if (tokenErr) {
            return reply.status(400).send({
              error: `Invalid token "${tokenPath}": ${tokenErr}`,
            });
          }
          // Validate $value against effective type (own or inherited from existing token)
          if (normalizedBody.$value !== undefined) {
            const effectiveType = normalizedBody.$type ?? existingToken.$type;
            if (effectiveType) {
              const valueErr = validateTokenValue(normalizedBody.$value, effectiveType, tokenPath);
              if (valueErr) return reply.status(400).send({ error: `Invalid $value for type "${effectiveType}": ${valueErr}` });
            }
          }
          const missingReference = findMissingTokenReference(
            collectionId,
            candidateToken,
          );
          if (missingReference) {
            return reply.status(400).send({
              error: `Alias target "${missingReference}" in "${tokenPath}" does not exist`,
            });
          }

          const before = await snapshotPaths(fastify.tokenStore, collectionId, [tokenPath]);
          await fastify.tokenStore.updateToken(
            collectionId,
            tokenPath,
            normalizedBody,
          );
          const after = await snapshotPaths(fastify.tokenStore, collectionId, [tokenPath]);
          await fastify.operationLog.record({
            type: 'token-update',
            description: `Update token "${tokenPath}" in ${collectionId}`,
            resourceId: collectionId,
            affectedPaths: [tokenPath],
            beforeSnapshot: before,
            afterSnapshot: after,
          });
          const updated = await fastify.tokenStore.getToken(collectionId, tokenPath);
          return { ok: true, path: tokenPath, collectionId, token: updated };
        } catch (err) {
          return handleRouteError(reply, err, 'Failed to update token');
        }
      });
    },
  );

  // POST /api/tokens/:collectionId/batch-delete — delete multiple tokens/groups in one call
  fastify.post<{ Params: { collectionId: string }; Body: { paths: string[]; force?: boolean } }>(
    '/tokens/:collectionId/batch-delete',
    async (request, reply) => {
      const { collectionId } = request.params;
      const { paths, force } = request.body ?? {};
      if (!Array.isArray(paths) || paths.length === 0) {
        return reply.status(400).send({ error: 'paths array is required and must not be empty' });
      }
      if (paths.some((p: unknown) => !isValidTokenPath(p))) {
        return reply.status(400).send({ error: 'Each path must be a valid non-empty string with no leading/trailing dots' });
      }

      return withLock(async () => {
        try {
          const flatTokens = await fastify.tokenStore.getFlatTokensForCollection(collectionId);
          assertNoGeneratorManagedTokenDelete(flatTokens, paths);
          if (!force) {
            // Expand group paths to all leaf tokens they contain
            const allDeletedLeaves = new Set<string>();
            for (const p of paths) {
              for (const leafPath of Object.keys(flatTokens)) {
                if (leafPath === p || leafPath.startsWith(p + '.')) {
                  allDeletedLeaves.add(leafPath);
                }
              }
            }

            const externalDependents: Array<{ path: string; collectionId: string }> = [];
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

          const before = await snapshotPaths(fastify.tokenStore, collectionId, paths);
          const deleted = await fastify.tokenStore.deleteTokens(collectionId, paths);
          const after = await snapshotPaths(fastify.tokenStore, collectionId, paths);
          if (deleted.length > 0) {
            await fastify.operationLog.record({
              type: 'batch-delete',
              description: `Delete ${deleted.length} token(s) from ${collectionId}`,
              resourceId: collectionId,
              affectedPaths: deleted,
              beforeSnapshot: before,
              afterSnapshot: after,
            });
          }
          return { ok: true, deleted: deleted.length, paths: deleted, collectionId };
        } catch (err) {
          return handleRouteError(reply, err, 'Failed to delete tokens');
        }
      });
    },
  );

  // DELETE /api/tokens/:collectionId/* — delete token or group
  fastify.delete<{ Params: { collectionId: string; '*': string }; Querystring: { force?: string } }>(
    '/tokens/:collectionId/*',
    async (request, reply) => {
      const { collectionId } = request.params;
      const tokenPath = wildcardParamToTokenPath(request.params['*']);
      if (!tokenPath) {
        return reply.status(400).send({ error: 'Token path is required' });
      }

      const force = request.query.force === 'true';

      return withLock(async () => {
        try {
          const flatTokens = await fastify.tokenStore.getFlatTokensForCollection(collectionId);
          assertNoGeneratorManagedTokenDelete(flatTokens, [tokenPath]);
          if (!force) {
            // Collect all leaf token paths being deleted (single token or all tokens in a group)
            const deletedPaths = Object.keys(flatTokens).filter(
              (p) => p === tokenPath || p.startsWith(tokenPath + '.'),
            );
            const deletedSet = new Set(deletedPaths);

            // For each deleted path, find dependents that are NOT themselves being deleted
            const externalDependents: Array<{ path: string; collectionId: string }> = [];
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

          const before = await snapshotPaths(fastify.tokenStore, collectionId, [tokenPath]);
          const deleted = await fastify.tokenStore.deleteToken(collectionId, tokenPath);
          if (!deleted) {
            return reply.status(404).send({ error: `Token "${tokenPath}" not found in collection "${collectionId}"` });
          }
          const after = await snapshotPaths(fastify.tokenStore, collectionId, [tokenPath]);
          await fastify.operationLog.record({
            type: 'token-delete',
            description: `Delete "${tokenPath}" from ${collectionId}`,
            resourceId: collectionId,
            affectedPaths: [tokenPath],
            beforeSnapshot: before,
            afterSnapshot: after,
          });
          return { ok: true, path: tokenPath, collectionId };
        } catch (err) {
          return handleRouteError(reply, err, 'Failed to delete token');
        }
      });
    },
  );
};
