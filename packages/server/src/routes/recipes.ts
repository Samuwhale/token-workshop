import type { FastifyPluginAsync } from 'fastify';
import { handleRouteError } from '../errors.js';
import {
  buildCollectionSnapshotKey,
  listSnapshotTokenPaths,
  snapshotGroup,
  type RollbackStep,
  type SnapshotEntry,
} from '../services/operation-log.js';
import type {
  RecipeCreateInput,
  DetachedRecipeResult,
  OrphanedRecipeToken,
  RecipePreviewInput,
  RecipeUpdateInput,
} from '../services/recipe-service.js';
import {
  type GeneratedTokenResult,
  type TokenRecipe,
} from '@tokenmanager/core';

type CreateBody = RecipeCreateInput & {
  sourceValue?: unknown;
};

type PreviewBody = RecipePreviewInput & {
  sourceValue?: unknown;
};

interface UpdateBody {
  [key: string]: unknown;
  sourceValue?: unknown;
}

interface StepOverrideBody {
  value: unknown;
  locked: boolean;
}

interface DetachOutputsBody {
  scope?: 'token' | 'group';
  path?: string;
}

interface RunBody {
  sourceValue?: unknown;
}

type SnapshotMap = Record<string, SnapshotEntry>;
type RecipeSnapshotTarget = Pick<
  TokenRecipe,
  'targetCollection' | 'targetGroup' | 'semanticLayer'
>;

interface LoggedRecipeMutationConfig<TResult> {
  type: string;
  description: string | ((result: TResult) => string);
  collectionId: string | ((result: TResult) => string);
  captureBefore: () => Promise<SnapshotMap>;
  mutate: () => Promise<TResult>;
  captureAfter: (result: TResult) => Promise<SnapshotMap>;
  affectedPaths?: (
    before: SnapshotMap,
    after: SnapshotMap,
    result: TResult,
  ) => string[];
  rollbackSteps?: RollbackStep[] | ((result: TResult) => RollbackStep[] | undefined);
}

interface DeleteOrphanedTokensResult {
  deleted: number;
  tokens: OrphanedRecipeToken[];
}

interface DeleteRecipeResult {
  ok: true;
  id: string;
  tokensDeleted: number;
}

function getRecipeCollectionIds(recipe: Pick<TokenRecipe, 'targetCollection'>): string[] {
  return recipe.targetCollection ? [recipe.targetCollection] : [];
}

async function snapshotTokenPaths(
  tokenStore: Parameters<typeof snapshotGroup>[0],
  collectionId: string,
  paths: string[],
): Promise<Record<string, SnapshotEntry>> {
  const snapshot: Record<string, SnapshotEntry> = {};
  for (const path of paths) {
    const token = await tokenStore.getToken(collectionId, path);
    snapshot[buildCollectionSnapshotKey(collectionId, path)] = {
      token: token ? structuredClone(token) : null,
      collectionId,
    };
  }
  return snapshot;
}

async function snapshotRecipeOutputs(
  tokenStore: Parameters<typeof snapshotGroup>[0],
  recipe: RecipeSnapshotTarget,
): Promise<SnapshotMap> {
  const snapshot: SnapshotMap = {};
  const semanticPaths =
    recipe.semanticLayer &&
    typeof recipe.semanticLayer.prefix === 'string' &&
    Array.isArray(recipe.semanticLayer.mappings)
      ? recipe.semanticLayer.mappings
          .filter(
            (mapping: unknown): mapping is { semantic: string } =>
              Boolean(
                mapping &&
                  typeof mapping === 'object' &&
                  'semantic' in mapping &&
                  typeof mapping.semantic === 'string',
              ),
          )
          .map(
            (mapping: { semantic: string }) =>
              `${recipe.semanticLayer!.prefix}.${mapping.semantic}`,
          )
      : [];

  for (const collectionId of getRecipeCollectionIds(recipe)) {
    Object.assign(snapshot, await snapshotGroup(tokenStore, collectionId, recipe.targetGroup));
    if (semanticPaths.length > 0) {
      Object.assign(snapshot, await snapshotTokenPaths(tokenStore, collectionId, semanticPaths));
    }
  }

  return snapshot;
}

async function snapshotTaggedTokens(
  tokenStore: Parameters<typeof snapshotGroup>[0],
  tokens: Array<Pick<OrphanedRecipeToken, 'collectionId' | 'path'>>,
): Promise<SnapshotMap> {
  const snapshot: SnapshotMap = {};
  const pathsByCollection = new Map<string, string[]>();
  for (const token of tokens) {
    const existing = pathsByCollection.get(token.collectionId);
    if (existing) {
      existing.push(token.path);
      continue;
    }
    pathsByCollection.set(token.collectionId, [token.path]);
  }
  for (const [collectionId, paths] of pathsByCollection) {
    Object.assign(snapshot, await snapshotTokenPaths(tokenStore, collectionId, [...new Set(paths)]));
  }
  return snapshot;
}

function listAffectedPaths(before: SnapshotMap, after: SnapshotMap): string[] {
  return [
    ...new Set([
      ...listSnapshotTokenPaths(before),
      ...listSnapshotTokenPaths(after),
    ]),
  ];
}

async function validateRecipeTargetCollections(
  recipe: Pick<TokenRecipe, 'targetCollection'>,
  requireCollectionsExist: (collectionIds: Iterable<string>) => Promise<void>,
): Promise<void> {
  await requireCollectionsExist([recipe.targetCollection]);
}

export const recipeRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;
  const executeLoggedRecipeMutation = async <TResult>(
    config: LoggedRecipeMutationConfig<TResult>,
  ): Promise<TResult> => {
    const beforeSnapshot = await config.captureBefore();
    const result = await config.mutate();
    const afterSnapshot = await config.captureAfter(result);
    await fastify.operationLog.record({
      type: config.type,
      description:
        typeof config.description === 'function'
          ? config.description(result)
          : config.description,
      resourceId:
        typeof config.collectionId === 'function'
          ? config.collectionId(result)
          : config.collectionId,
      affectedPaths:
        config.affectedPaths?.(beforeSnapshot, afterSnapshot, result) ??
        listAffectedPaths(beforeSnapshot, afterSnapshot),
      beforeSnapshot,
      afterSnapshot,
      rollbackSteps:
        typeof config.rollbackSteps === 'function'
          ? config.rollbackSteps(result)
          : config.rollbackSteps,
    });
    return result;
  };

  // GET /api/recipes — list all recipes
  fastify.get('/recipes', async (_request, reply) => {
    try {
      return await fastify.recipeService.getDashboardItems(
        fastify.tokenStore,
        fastify.collectionService,
      );
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // GET /api/recipes/orphaned-tokens — find tokens whose recipe no longer exists
  fastify.get('/recipes/orphaned-tokens', async (_request, reply) => {
    try {
      const orphaned = fastify.recipeService.findOrphanedTokens(fastify.tokenStore);
      return { count: orphaned.length, tokens: orphaned };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to list orphaned tokens');
    }
  });

  // DELETE /api/recipes/orphaned-tokens — delete all orphaned recipe tokens
  fastify.delete('/recipes/orphaned-tokens', async (_request, reply) => {
    try {
      return await withLock(async () => {
        return await executeLoggedRecipeMutation<DeleteOrphanedTokensResult>({
          type: 'recipe-orphaned-tokens-delete',
          description: (result) => `Delete ${result.deleted} orphaned generated tokens`,
          collectionId: (result) => result.tokens[0]?.collectionId ?? 'orphaned-recipe-tokens',
          captureBefore: async () =>
            snapshotTaggedTokens(
              fastify.tokenStore,
              fastify.recipeService.findOrphanedTokens(fastify.tokenStore),
            ),
          mutate: () => fastify.recipeService.deleteOrphanedTokens(fastify.tokenStore),
          captureAfter: (result) => snapshotTaggedTokens(fastify.tokenStore, result.tokens),
        }).then((result) => ({ ok: true, deleted: result.deleted }));
      });
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to delete orphaned tokens');
    }
  });

  // POST /api/recipes — create a new recipe and run it immediately
  fastify.post<{ Body: CreateBody }>('/recipes', async (request, reply) => {
    const { type, sourceToken, inlineValue, targetCollection, targetGroup, name, config, overrides } = request.body ?? {} as CreateBody;
    if (typeof type !== 'string' || typeof targetCollection !== 'string' || typeof targetGroup !== 'string' || !type || !targetCollection || !targetGroup) {
      return reply.status(400).send({
        error: 'type, targetCollection, and targetGroup are required',
      });
    }
    return withLock(async () => {
      try {
        await validateRecipeTargetCollections(
          {
            targetCollection,
          },
          (collectionIds) => fastify.collectionService.requireCollectionsExist(collectionIds),
        );
        await fastify.recipeService.assertKeepUpdatedSupported(
          {
            enabled: request.body?.enabled,
            sourceToken: sourceToken ?? undefined,
          },
          fastify.tokenStore,
          fastify.collectionService,
        );
        return reply.status(201).send(await executeLoggedRecipeMutation({
          type: 'recipe-create',
          description: (recipe) => `Create generated group "${recipe.name}" → ${recipe.targetGroup}`,
          collectionId: targetCollection,
          captureBefore: () => snapshotRecipeOutputs(fastify.tokenStore, {
            targetCollection,
            targetGroup,
            semanticLayer: request.body?.semanticLayer,
          } as RecipeSnapshotTarget),
          mutate: async () => {
            const recipe = await fastify.recipeService.create({
              type,
              sourceToken: sourceToken ?? undefined,
              inlineValue: inlineValue ?? undefined,
              targetCollection,
              targetGroup,
              name: typeof name === 'string' ? name : sourceToken ? `${sourceToken} ${type}` : type,
              config,
              overrides,
              semanticLayer: request.body?.semanticLayer,
            });
            await fastify.recipeService.run(recipe.id, fastify.tokenStore, {
              sourceValueOverride: request.body?.sourceValue,
            });
            return recipe;
          },
          captureAfter: (recipe) => snapshotRecipeOutputs(fastify.tokenStore, recipe),
          rollbackSteps: (recipe) => [{ action: 'delete-recipe', id: recipe.id }],
        }));
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // POST /api/recipes/preview — preview tokens without saving anything
  // IMPORTANT: must be registered before /:id routes so the static segment wins
  fastify.post<{ Body: PreviewBody }>('/recipes/preview', async (request, reply) => {
    const body = request.body ?? {} as PreviewBody;
    if (typeof body.type !== 'string' || body.type === '') {
      return reply.status(400).send({ error: 'type is required' });
    }
    try {
      const preview = await fastify.recipeService.previewWithAnalysis(
        {
          type: body.type,
          sourceToken: body.sourceToken,
          inlineValue: body.inlineValue,
          targetGroup: body.targetGroup ?? '',
          targetCollection: body.targetCollection ?? '',
          config: body.config,
          overrides: body.overrides,
          semanticLayer: body.semanticLayer,
          baseRecipeId: body.baseRecipeId,
          detachedPaths: body.detachedPaths,
        },
        fastify.tokenStore,
        body.sourceValue,
      );
      return { count: preview.tokens.length, tokens: preview.tokens, analysis: preview.analysis };
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // GET /api/recipes/:id — get single recipe
  fastify.get<{ Params: { id: string } }>('/recipes/:id', async (request, reply) => {
    try {
      const gen = await fastify.recipeService.getById(request.params.id);
      if (!gen) return reply.status(404).send({ error: `Generated group "${request.params.id}" not found` });
      return gen;
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // PUT /api/recipes/:id — update recipe config and re-run
  fastify.put<{ Params: { id: string }; Body: UpdateBody }>('/recipes/:id', async (request, reply) => {
    const body = request.body ?? {};
    return withLock(async () => {
      try {
        const existing = await fastify.recipeService.getById(request.params.id);
        if (!existing) {
          return reply.status(404).send({ error: `Generated group "${request.params.id}" not found` });
        }

        // Build a sanitized update object with only known fields
        const updates: RecipeUpdateInput = {};

        if (typeof body.name === 'string') updates.name = body.name;
        if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
        if (typeof body.sourceToken === 'string') updates.sourceToken = body.sourceToken;
        if (typeof body.targetCollection === 'string') updates.targetCollection = body.targetCollection;
        if (typeof body.targetGroup === 'string') updates.targetGroup = body.targetGroup;
        if (body.inlineValue !== undefined) updates.inlineValue = body.inlineValue;
        if (body.type !== undefined) updates.type = body.type;
        if (body.overrides !== undefined) updates.overrides = body.overrides;
        if (body.config !== undefined) updates.config = body.config;
        if (body.semanticLayer !== undefined) updates.semanticLayer = body.semanticLayer;

        await validateRecipeTargetCollections(
          {
            targetCollection: updates.targetCollection ?? existing.targetCollection,
          },
          (collectionIds) => fastify.collectionService.requireCollectionsExist(collectionIds),
        );
        await fastify.recipeService.assertKeepUpdatedSupported(
          {
            enabled: updates.enabled ?? existing.enabled,
            sourceToken: updates.sourceToken ?? existing.sourceToken,
          },
          fastify.tokenStore,
          fastify.collectionService,
        );

        return await executeLoggedRecipeMutation<TokenRecipe>({
          type: 'recipe-update',
          description: (recipe) => `Update generated group "${recipe.name}"`,
          collectionId: (recipe) => recipe.targetCollection,
          captureBefore: () => snapshotRecipeOutputs(fastify.tokenStore, existing),
          mutate: async () => {
            const recipe = await fastify.recipeService.update(
              request.params.id,
              updates,
            );
            // Skip re-run when only the enabled flag changed — it's a state toggle, not a config change.
            const onlyEnabledChanged = Object.keys(updates).every(k => k === 'enabled');
            if (!onlyEnabledChanged) {
              await fastify.recipeService.run(recipe.id, fastify.tokenStore, {
                sourceValueOverride: body.sourceValue,
              });
            }
            return recipe;
          },
          captureAfter: (recipe) => snapshotRecipeOutputs(fastify.tokenStore, recipe),
          rollbackSteps: [{ action: 'create-recipe', recipe: existing }],
        });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // GET /api/recipes/:id/tokens — list tokens created by a recipe
  fastify.get<{ Params: { id: string } }>('/recipes/:id/tokens', async (request, reply) => {
    try {
      const tokens = fastify.tokenStore.findTokensByRecipeId(request.params.id);
      return { recipeId: request.params.id, count: tokens.length, tokens };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to list recipe tokens');
    }
  });

  // POST /api/recipes/:id/detach — convert generated outputs into manual tokens
  fastify.post<{
    Params: { id: string };
    Body: DetachOutputsBody;
  }>('/recipes/:id/detach', async (request, reply) => {
    const scope = request.body?.scope === 'group' ? 'group' : 'token';
    const requestedPath =
      typeof request.body?.path === 'string' ? request.body.path.trim() : '';

    return withLock(async () => {
      try {
        const recipe = await fastify.recipeService.getById(request.params.id);
        if (!recipe) {
          return reply
            .status(404)
            .send({ error: `Generated group "${request.params.id}" not found` });
        }

        const detachedPaths =
          scope === 'group'
            ? fastify.recipeService.getScaleOutputPaths(recipe)
            : requestedPath
              ? [requestedPath]
              : [];

        if (detachedPaths.length === 0) {
          return reply.status(400).send({
            error:
              scope === 'group'
                ? 'Generated group has no managed outputs to detach'
                : 'path is required when scope is "token"',
          });
        }

        const result = await executeLoggedRecipeMutation<DetachedRecipeResult>({
          type: scope === 'group' ? 'recipe-detach-group' : 'recipe-detach-token',
          description: (detachResult) =>
            scope === 'group'
              ? `Detach ${detachResult.detachedCount} outputs from generated group "${detachResult.recipe.name}"`
              : `Detach "${detachResult.detachedPaths[0]}" from generated group "${detachResult.recipe.name}"`,
          collectionId: () => recipe.targetCollection,
          captureBefore: () => snapshotRecipeOutputs(fastify.tokenStore, recipe),
          mutate: () =>
            fastify.recipeService.detachOutputPaths(
              request.params.id,
              fastify.tokenStore,
              detachedPaths,
            ),
          captureAfter: (detachResult) =>
            snapshotRecipeOutputs(fastify.tokenStore, detachResult.recipe),
          rollbackSteps: [{ action: 'create-recipe', recipe }],
        });

        return {
          ok: true,
          detachedCount: result.detachedCount,
          detachedPaths: result.detachedPaths,
          recipe: result.recipe,
        };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to detach generated group outputs');
      }
    });
  });

  // DELETE /api/recipes/:id — delete recipe, optionally delete derived tokens
  fastify.delete<{ Params: { id: string }; Querystring: { deleteTokens?: string } }>(
    '/recipes/:id',
    async (request, reply) => {
      return withLock(async () => {
        try {
          const gen = await fastify.recipeService.getById(request.params.id);
          if (!gen) {
            return reply.status(404).send({ error: `Generated group "${request.params.id}" not found` });
          }
          // Snapshot before delete if tokens will also be removed
          const willDeleteTokens = request.query.deleteTokens === 'true';
          const result = await executeLoggedRecipeMutation<DeleteRecipeResult>({
            type: 'recipe-delete',
            description: ({ tokensDeleted }) => tokensDeleted > 0
              ? `Delete generated group "${gen.name}" and ${tokensDeleted} tokens`
              : `Delete generated group "${gen.name}"`,
            collectionId: gen.targetCollection,
            captureBefore: () =>
              willDeleteTokens
                ? snapshotRecipeOutputs(fastify.tokenStore, gen)
                : Promise.resolve({}),
            mutate: async () => {
              const deleted = await fastify.recipeService.delete(request.params.id);
              if (!deleted) {
                throw new Error(`Generated group "${request.params.id}" disappeared during delete`);
              }
              let tokensDeleted = 0;
              if (willDeleteTokens) {
                tokensDeleted = await fastify.tokenStore.deleteTokensByRecipeId(request.params.id);
              }
              return { ok: true, id: request.params.id, tokensDeleted };
            },
            captureAfter: () =>
              willDeleteTokens
                ? snapshotRecipeOutputs(fastify.tokenStore, gen)
                : Promise.resolve({}),
            affectedPaths: (before) => listSnapshotTokenPaths(before),
            rollbackSteps: [{ action: 'create-recipe', recipe: gen }],
          });
          return result;
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/recipes/:id/run — manually re-run a recipe
  fastify.post<{ Params: { id: string }; Body: RunBody }>('/recipes/:id/run', async (request, reply) => {
    return withLock(async () => {
      try {
        const gen = await fastify.recipeService.getById(request.params.id);
        if (!gen) return reply.status(404).send({ error: `Generated group "${request.params.id}" not found` });
        await validateRecipeTargetCollections(
          gen,
          (collectionIds) => fastify.collectionService.requireCollectionsExist(collectionIds),
        );
        const results = await executeLoggedRecipeMutation<GeneratedTokenResult[]>({
          type: 'recipe-run',
          description: `Run generated group "${gen.name}"`,
          collectionId: gen.targetCollection,
          captureBefore: () => snapshotRecipeOutputs(fastify.tokenStore, gen),
          mutate: () =>
            fastify.recipeService.run(request.params.id, fastify.tokenStore, {
              sourceValueOverride: request.body?.sourceValue,
            }),
          captureAfter: () => snapshotRecipeOutputs(fastify.tokenStore, gen),
        });
        return { count: results.length, tokens: results };
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // GET /api/recipes/:id/steps — compute current step values without persisting
  fastify.get<{ Params: { id: string } }>('/recipes/:id/steps', async (request, reply) => {
    try {
      const gen = await fastify.recipeService.getById(request.params.id);
      if (!gen) return reply.status(404).send({ error: `Generated group "${request.params.id}" not found` });
      const results = await fastify.recipeService.preview(gen, fastify.tokenStore);
      return { count: results.length, results };
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // PUT /api/recipes/:id/steps/:stepName/override — set/update a step override
  fastify.put<{
    Params: { id: string; stepName: string };
    Body: StepOverrideBody;
  }>('/recipes/:id/steps/:stepName/override', async (request, reply) => {
    const { value, locked } = request.body ?? {} as StepOverrideBody;
    if (value === undefined || locked === undefined) {
      return reply.status(400).send({ error: 'value and locked are required' });
    }
    return withLock(async () => {
      try {
        const gen = await fastify.recipeService.getById(request.params.id);
        if (!gen) return reply.status(404).send({ error: `Generated group "${request.params.id}" not found` });
        await validateRecipeTargetCollections(
          gen,
          (collectionIds) => fastify.collectionService.requireCollectionsExist(collectionIds),
        );
        return await executeLoggedRecipeMutation<TokenRecipe>({
          type: 'recipe-step-override-set',
          description: (recipe) =>
            `Set manual exception "${request.params.stepName}" on generated group "${recipe.name}"`,
          collectionId: (recipe) => recipe.targetCollection,
          captureBefore: () => snapshotRecipeOutputs(fastify.tokenStore, gen),
          mutate: async () => {
            const recipe = await fastify.recipeService.setStepOverride(
              request.params.id,
              request.params.stepName,
              { value, locked },
            );
            await fastify.recipeService.run(recipe.id, fastify.tokenStore);
            return recipe;
          },
          captureAfter: (recipe) => snapshotRecipeOutputs(fastify.tokenStore, recipe),
          rollbackSteps: [{ action: 'create-recipe', recipe: gen }],
        });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // DELETE /api/recipes/:id/steps/:stepName/override — remove a step override
  fastify.delete<{
    Params: { id: string; stepName: string };
  }>('/recipes/:id/steps/:stepName/override', async (request, reply) => {
    return withLock(async () => {
      try {
        const gen = await fastify.recipeService.getById(request.params.id);
        if (!gen) return reply.status(404).send({ error: `Generated group "${request.params.id}" not found` });
        await validateRecipeTargetCollections(
          gen,
          (collectionIds) => fastify.collectionService.requireCollectionsExist(collectionIds),
        );
        return await executeLoggedRecipeMutation<TokenRecipe>({
          type: 'recipe-step-override-clear',
          description: (recipe) =>
            `Clear manual exception "${request.params.stepName}" on generated group "${recipe.name}"`,
          collectionId: (recipe) => recipe.targetCollection,
          captureBefore: () => snapshotRecipeOutputs(fastify.tokenStore, gen),
          mutate: async () => {
            const recipe = await fastify.recipeService.setStepOverride(
              request.params.id,
              request.params.stepName,
              null,
            );
            await fastify.recipeService.run(recipe.id, fastify.tokenStore);
            return recipe;
          },
          captureAfter: (recipe) => snapshotRecipeOutputs(fastify.tokenStore, recipe),
          rollbackSteps: [{ action: 'create-recipe', recipe: gen }],
        });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });
};
