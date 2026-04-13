import type { FastifyPluginAsync } from 'fastify';
import { handleRouteError } from '../errors.js';
import {
  buildMultiSetSnapshotPath,
  listSnapshotTokenPaths,
  snapshotGroup,
  type RollbackStep,
  type SnapshotEntry,
} from '../services/operation-log.js';
import type {
  GeneratorCreateInput,
  DetachedGeneratorResult,
  OrphanedGeneratorToken,
  GeneratorPreviewInput,
  GeneratorUpdateInput,
} from '../services/generator-service.js';
import type { GeneratedTokenResult, TokenGenerator } from '@tokenmanager/core';

type CreateBody = GeneratorCreateInput;

type PreviewBody = GeneratorPreviewInput & {
  sourceValue?: unknown;
};

interface UpdateBody {
  [key: string]: unknown;
}

interface StepOverrideBody {
  value: unknown;
  locked: boolean;
}

interface DetachOutputsBody {
  scope?: 'token' | 'group';
  path?: string;
}

type SnapshotMap = Record<string, SnapshotEntry>;
type GeneratorSnapshotTarget = Pick<
  TokenGenerator,
  'targetSet' | 'targetSetTemplate' | 'inputTable' | 'targetGroup' | 'semanticLayer'
>;

interface LoggedGeneratorMutationConfig<TResult> {
  type: string;
  description: string | ((result: TResult) => string);
  setName: string | ((result: TResult) => string);
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
  tokens: OrphanedGeneratorToken[];
}

interface DeleteGeneratorResult {
  ok: true;
  id: string;
  tokensDeleted: number;
}

function getGeneratorSetNames(generator: Pick<TokenGenerator, 'targetSet' | 'targetSetTemplate' | 'inputTable'>): string[] {
  if (!generator.inputTable?.rows.length) {
    return generator.targetSet ? [generator.targetSet] : [];
  }
  const setNames = new Set<string>();
  for (const row of generator.inputTable.rows) {
    if (!row.brand.trim()) continue;
    setNames.add(
      generator.targetSetTemplate
        ? generator.targetSetTemplate.replace('{brand}', row.brand)
        : generator.targetSet,
    );
  }
  return [...setNames];
}

async function snapshotTokenPaths(
  tokenStore: Parameters<typeof snapshotGroup>[0],
  setName: string,
  paths: string[],
): Promise<Record<string, SnapshotEntry>> {
  const snapshot: Record<string, SnapshotEntry> = {};
  for (const path of paths) {
    const token = await tokenStore.getToken(setName, path);
    snapshot[buildMultiSetSnapshotPath(setName, path)] = {
      token: token ? structuredClone(token) : null,
      setName,
    };
  }
  return snapshot;
}

async function snapshotGeneratorOutputs(
  tokenStore: Parameters<typeof snapshotGroup>[0],
  generator: GeneratorSnapshotTarget,
): Promise<SnapshotMap> {
  const snapshot: SnapshotMap = {};
  const semanticPaths =
    generator.semanticLayer &&
    typeof generator.semanticLayer.prefix === 'string' &&
    Array.isArray(generator.semanticLayer.mappings)
      ? generator.semanticLayer.mappings
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
              `${generator.semanticLayer!.prefix}.${mapping.semantic}`,
          )
      : [];

  for (const setName of getGeneratorSetNames(generator)) {
    Object.assign(snapshot, await snapshotGroup(tokenStore, setName, generator.targetGroup));
    if (semanticPaths.length > 0) {
      Object.assign(snapshot, await snapshotTokenPaths(tokenStore, setName, semanticPaths));
    }
  }

  return snapshot;
}

async function snapshotTaggedTokens(
  tokenStore: Parameters<typeof snapshotGroup>[0],
  tokens: Array<Pick<OrphanedGeneratorToken, 'setName' | 'path'>>,
): Promise<SnapshotMap> {
  const snapshot: SnapshotMap = {};
  const pathsBySet = new Map<string, string[]>();
  for (const token of tokens) {
    const existing = pathsBySet.get(token.setName);
    if (existing) {
      existing.push(token.path);
      continue;
    }
    pathsBySet.set(token.setName, [token.path]);
  }
  for (const [setName, paths] of pathsBySet) {
    Object.assign(snapshot, await snapshotTokenPaths(tokenStore, setName, [...new Set(paths)]));
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

export const generatorRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;
  const executeLoggedGeneratorMutation = async <TResult>(
    config: LoggedGeneratorMutationConfig<TResult>,
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
      setName:
        typeof config.setName === 'function'
          ? config.setName(result)
          : config.setName,
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

  // GET /api/generators — list all generators
  fastify.get('/generators', async (_request, reply) => {
    try {
      return await fastify.generatorService.getDashboardItems(fastify.tokenStore);
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // GET /api/generators/orphaned-tokens — find tokens whose generator no longer exists
  fastify.get('/generators/orphaned-tokens', async (_request, reply) => {
    try {
      const orphaned = fastify.generatorService.findOrphanedTokens(fastify.tokenStore);
      return { count: orphaned.length, tokens: orphaned };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to list orphaned tokens');
    }
  });

  // DELETE /api/generators/orphaned-tokens — delete all orphaned generator tokens
  fastify.delete('/generators/orphaned-tokens', async (_request, reply) => {
    try {
      return await withLock(async () => {
        return await executeLoggedGeneratorMutation<DeleteOrphanedTokensResult>({
          type: 'generator-orphaned-tokens-delete',
          description: (result) => `Delete ${result.deleted} orphaned generator tokens`,
          setName: (result) => result.tokens[0]?.setName ?? 'orphaned-generator-tokens',
          captureBefore: async () =>
            snapshotTaggedTokens(
              fastify.tokenStore,
              fastify.generatorService.findOrphanedTokens(fastify.tokenStore),
            ),
          mutate: () => fastify.generatorService.deleteOrphanedTokens(fastify.tokenStore),
          captureAfter: (result) => snapshotTaggedTokens(fastify.tokenStore, result.tokens),
        }).then((result) => ({ ok: true, deleted: result.deleted }));
      });
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to delete orphaned tokens');
    }
  });

  // POST /api/generators — create a new generator and run it immediately
  fastify.post<{ Body: CreateBody }>('/generators', async (request, reply) => {
    const { type, sourceToken, inlineValue, targetSet, targetGroup, name, config, overrides, inputTable, targetSetTemplate } = request.body ?? {} as CreateBody;
    if (typeof type !== 'string' || typeof targetSet !== 'string' || typeof targetGroup !== 'string' || !type || !targetSet || !targetGroup) {
      return reply.status(400).send({
        error: 'type, targetSet, and targetGroup are required',
      });
    }
    return withLock(async () => {
      try {
        return reply.status(201).send(await executeLoggedGeneratorMutation({
          type: 'generator-create',
          description: (generator) => `Create generator "${generator.name}" → ${generator.targetGroup}`,
          setName: targetSet,
          captureBefore: () => snapshotGeneratorOutputs(fastify.tokenStore, {
            targetSet,
            targetGroup,
            inputTable,
            targetSetTemplate: targetSetTemplate ?? undefined,
            semanticLayer: request.body?.semanticLayer,
          } as GeneratorSnapshotTarget),
          mutate: async () => {
            const generator = await fastify.generatorService.create({
              type,
              sourceToken: sourceToken ?? undefined,
              inlineValue: inlineValue ?? undefined,
              targetSet,
              targetGroup,
              name: typeof name === 'string' ? name : sourceToken ? `${sourceToken} ${type}` : type,
              config,
              overrides,
              inputTable,
              targetSetTemplate: targetSetTemplate ?? undefined,
              semanticLayer: request.body?.semanticLayer,
            });
            await fastify.generatorService.run(generator.id, fastify.tokenStore);
            return generator;
          },
          captureAfter: (generator) => snapshotGeneratorOutputs(fastify.tokenStore, generator),
          rollbackSteps: (generator) => [{ action: 'delete-generator', id: generator.id }],
        }));
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // POST /api/generators/preview — preview tokens without saving anything
  // IMPORTANT: must be registered before /:id routes so the static segment wins
  fastify.post<{ Body: PreviewBody }>('/generators/preview', async (request, reply) => {
    const body = request.body ?? {} as PreviewBody;
    if (typeof body.type !== 'string' || body.type === '') {
      return reply.status(400).send({ error: 'type is required' });
    }
    try {
      const preview = await fastify.generatorService.previewWithAnalysis(
        {
          type: body.type,
          sourceToken: body.sourceToken,
          inlineValue: body.inlineValue,
          targetGroup: body.targetGroup ?? '',
          targetSet: body.targetSet ?? '',
          targetSetTemplate: body.targetSetTemplate,
          config: body.config,
          overrides: body.overrides,
          inputTable: body.inputTable,
          semanticLayer: body.semanticLayer,
          baseGeneratorId: body.baseGeneratorId,
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

  // GET /api/generators/:id — get single generator
  fastify.get<{ Params: { id: string } }>('/generators/:id', async (request, reply) => {
    try {
      const gen = await fastify.generatorService.getById(request.params.id);
      if (!gen) return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
      return gen;
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // PUT /api/generators/:id — update generator config and re-run
  fastify.put<{ Params: { id: string }; Body: UpdateBody }>('/generators/:id', async (request, reply) => {
    const body = request.body ?? {};
    return withLock(async () => {
      try {
        const existing = await fastify.generatorService.getById(request.params.id);
        if (!existing) {
          return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
        }

        // Build a sanitized update object with only known fields
        const updates: GeneratorUpdateInput = {};

        if (typeof body.name === 'string') updates.name = body.name;
        if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
        if (typeof body.sourceToken === 'string') updates.sourceToken = body.sourceToken;
        if (typeof body.targetSet === 'string') updates.targetSet = body.targetSet;
        if (typeof body.targetGroup === 'string') updates.targetGroup = body.targetGroup;
        if (typeof body.targetSetTemplate === 'string') updates.targetSetTemplate = body.targetSetTemplate;
        if (body.inlineValue !== undefined) updates.inlineValue = body.inlineValue;
        if (body.type !== undefined) updates.type = body.type;
        if (body.overrides !== undefined) updates.overrides = body.overrides;
        if (body.inputTable !== undefined) updates.inputTable = body.inputTable;
        if (body.config !== undefined) updates.config = body.config;
        if (body.semanticLayer !== undefined) updates.semanticLayer = body.semanticLayer;

        return await executeLoggedGeneratorMutation({
          type: 'generator-update',
          description: (generator) => `Update generator "${generator.name}"`,
          setName: (generator) => generator.targetSet,
          captureBefore: () => snapshotGeneratorOutputs(fastify.tokenStore, existing),
          mutate: async () => {
            const generator = await fastify.generatorService.update(
              request.params.id,
              updates,
            );
            // Skip re-run when only the enabled flag changed — it's a state toggle, not a config change.
            const onlyEnabledChanged = Object.keys(updates).every(k => k === 'enabled');
            if (!onlyEnabledChanged) {
              await fastify.generatorService.run(generator.id, fastify.tokenStore);
            }
            return generator;
          },
          captureAfter: (generator) => snapshotGeneratorOutputs(fastify.tokenStore, generator),
          rollbackSteps: [{ action: 'create-generator', generator: existing }],
        });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // GET /api/generators/:id/tokens — list tokens created by a generator
  fastify.get<{ Params: { id: string } }>('/generators/:id/tokens', async (request, reply) => {
    try {
      const tokens = fastify.tokenStore.findTokensByGeneratorId(request.params.id);
      return { generatorId: request.params.id, count: tokens.length, tokens };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to list generator tokens');
    }
  });

  // POST /api/generators/:id/detach — convert generated outputs into manual tokens
  fastify.post<{
    Params: { id: string };
    Body: DetachOutputsBody;
  }>('/generators/:id/detach', async (request, reply) => {
    const scope = request.body?.scope === 'group' ? 'group' : 'token';
    const requestedPath =
      typeof request.body?.path === 'string' ? request.body.path.trim() : '';

    return withLock(async () => {
      try {
        const generator = await fastify.generatorService.getById(request.params.id);
        if (!generator) {
          return reply
            .status(404)
            .send({ error: `Generator "${request.params.id}" not found` });
        }

        const detachedPaths =
          scope === 'group'
            ? fastify.generatorService.getScaleOutputPaths(generator)
            : requestedPath
              ? [requestedPath]
              : [];

        if (detachedPaths.length === 0) {
          return reply.status(400).send({
            error:
              scope === 'group'
                ? 'Generator has no managed outputs to detach'
                : 'path is required when scope is "token"',
          });
        }

        const result = await executeLoggedGeneratorMutation<DetachedGeneratorResult>({
          type: scope === 'group' ? 'generator-detach-group' : 'generator-detach-token',
          description: (detachResult) =>
            scope === 'group'
              ? `Detach ${detachResult.detachedCount} outputs from generator "${detachResult.generator.name}"`
              : `Detach "${detachResult.detachedPaths[0]}" from generator "${detachResult.generator.name}"`,
          setName: () => generator.targetSet,
          captureBefore: () => snapshotGeneratorOutputs(fastify.tokenStore, generator),
          mutate: () =>
            fastify.generatorService.detachOutputPaths(
              request.params.id,
              fastify.tokenStore,
              detachedPaths,
            ),
          captureAfter: (detachResult) =>
            snapshotGeneratorOutputs(fastify.tokenStore, detachResult.generator),
          rollbackSteps: [{ action: 'create-generator', generator }],
        });

        return {
          ok: true,
          detachedCount: result.detachedCount,
          detachedPaths: result.detachedPaths,
          generator: result.generator,
        };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to detach generator outputs');
      }
    });
  });

  // DELETE /api/generators/:id — delete generator, optionally delete derived tokens
  fastify.delete<{ Params: { id: string }; Querystring: { deleteTokens?: string } }>(
    '/generators/:id',
    async (request, reply) => {
      return withLock(async () => {
        try {
          const gen = await fastify.generatorService.getById(request.params.id);
          if (!gen) {
            return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
          }
          // Snapshot before delete if tokens will also be removed
          const willDeleteTokens = request.query.deleteTokens === 'true';
          const result = await executeLoggedGeneratorMutation<DeleteGeneratorResult>({
            type: 'generator-delete',
            description: ({ tokensDeleted }) => tokensDeleted > 0
              ? `Delete generator "${gen.name}" and ${tokensDeleted} tokens`
              : `Delete generator "${gen.name}"`,
            setName: gen.targetSet,
            captureBefore: () =>
              willDeleteTokens
                ? snapshotGeneratorOutputs(fastify.tokenStore, gen)
                : Promise.resolve({}),
            mutate: async () => {
              const deleted = await fastify.generatorService.delete(request.params.id);
              if (!deleted) {
                throw new Error(`Generator "${request.params.id}" disappeared during delete`);
              }
              let tokensDeleted = 0;
              if (willDeleteTokens) {
                tokensDeleted = await fastify.tokenStore.deleteTokensByGeneratorId(request.params.id);
              }
              return { ok: true, id: request.params.id, tokensDeleted };
            },
            captureAfter: () =>
              willDeleteTokens
                ? snapshotGeneratorOutputs(fastify.tokenStore, gen)
                : Promise.resolve({}),
            affectedPaths: (before) => listSnapshotTokenPaths(before),
            rollbackSteps: [{ action: 'create-generator', generator: gen }],
          });
          return result;
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/generators/:id/dry-run — diff of what a re-run would produce, without committing
  fastify.post<{ Params: { id: string } }>('/generators/:id/dry-run', async (request, reply) => {
    try {
      const diff = await fastify.generatorService.dryRun(request.params.id, fastify.tokenStore);
      return diff;
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // POST /api/generators/:id/check-overwrites — preview which tokens would be overwritten
  fastify.post<{ Params: { id: string } }>('/generators/:id/check-overwrites', async (request, reply) => {
    try {
      const modified = await fastify.generatorService.checkOverwrites(
        request.params.id,
        fastify.tokenStore,
      );
      return { modified };
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // POST /api/generators/:id/run — manually re-run a generator
  fastify.post<{ Params: { id: string } }>('/generators/:id/run', async (request, reply) => {
    return withLock(async () => {
      try {
        const gen = await fastify.generatorService.getById(request.params.id);
        if (!gen) return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
        const results = await executeLoggedGeneratorMutation<GeneratedTokenResult[]>({
          type: 'generator-run',
          description: `Run generator "${gen.name}"`,
          setName: gen.targetSet,
          captureBefore: () => snapshotGeneratorOutputs(fastify.tokenStore, gen),
          mutate: () => fastify.generatorService.run(request.params.id, fastify.tokenStore),
          captureAfter: () => snapshotGeneratorOutputs(fastify.tokenStore, gen),
        });
        return { count: results.length, tokens: results };
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // GET /api/generators/:id/steps — compute current step values without persisting
  fastify.get<{ Params: { id: string } }>('/generators/:id/steps', async (request, reply) => {
    try {
      const gen = await fastify.generatorService.getById(request.params.id);
      if (!gen) return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
      const results = await fastify.generatorService.preview(gen, fastify.tokenStore);
      return { count: results.length, results };
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // PUT /api/generators/:id/steps/:stepName/override — set/update a step override
  fastify.put<{
    Params: { id: string; stepName: string };
    Body: StepOverrideBody;
  }>('/generators/:id/steps/:stepName/override', async (request, reply) => {
    const { value, locked } = request.body ?? {} as StepOverrideBody;
    if (value === undefined || locked === undefined) {
      return reply.status(400).send({ error: 'value and locked are required' });
    }
    return withLock(async () => {
      try {
        const gen = await fastify.generatorService.getById(request.params.id);
        if (!gen) return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
        return await executeLoggedGeneratorMutation({
          type: 'generator-step-override-set',
          description: (generator) =>
            `Set step override "${request.params.stepName}" on generator "${generator.name}"`,
          setName: (generator) => generator.targetSet,
          captureBefore: () => snapshotGeneratorOutputs(fastify.tokenStore, gen),
          mutate: async () => {
            const generator = await fastify.generatorService.setStepOverride(
              request.params.id,
              request.params.stepName,
              { value, locked },
            );
            await fastify.generatorService.run(generator.id, fastify.tokenStore);
            return generator;
          },
          captureAfter: (generator) => snapshotGeneratorOutputs(fastify.tokenStore, generator),
          rollbackSteps: [{ action: 'create-generator', generator: gen }],
        });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // DELETE /api/generators/:id/steps/:stepName/override — remove a step override
  fastify.delete<{
    Params: { id: string; stepName: string };
  }>('/generators/:id/steps/:stepName/override', async (request, reply) => {
    return withLock(async () => {
      try {
        const gen = await fastify.generatorService.getById(request.params.id);
        if (!gen) return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
        return await executeLoggedGeneratorMutation({
          type: 'generator-step-override-clear',
          description: (generator) =>
            `Clear step override "${request.params.stepName}" on generator "${generator.name}"`,
          setName: (generator) => generator.targetSet,
          captureBefore: () => snapshotGeneratorOutputs(fastify.tokenStore, gen),
          mutate: async () => {
            const generator = await fastify.generatorService.setStepOverride(
              request.params.id,
              request.params.stepName,
              null,
            );
            await fastify.generatorService.run(generator.id, fastify.tokenStore);
            return generator;
          },
          captureAfter: (generator) => snapshotGeneratorOutputs(fastify.tokenStore, generator),
          rollbackSteps: [{ action: 'create-generator', generator: gen }],
        });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });
};
