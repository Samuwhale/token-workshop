import type { FastifyPluginAsync } from 'fastify';
import { flattenTokenGroup, type ThemeDimension, type ThemeSetStatus, type TokenGroup } from '@tokenmanager/core';
import type { SetMetadataChange, SetMetadataOperationMetadata } from '../services/operation-log.js';
import type { SetMetadataState } from '../services/token-store.js';
import { handleRouteError } from '../errors.js';
import { snapshotSet } from '../services/operation-log.js';
import { stableStringify } from '../services/stable-stringify.js';

type SetStructuralOperation = 'delete' | 'merge' | 'split';

interface SetResolverMeta {
  name: string;
  referencedSets: string[];
}

interface SetGeneratorMeta {
  id: string;
  name: string;
  targetSet: string;
  targetGroup: string;
}

interface SetThemeImpact {
  dimensionId: string;
  dimensionName: string;
  optionName: string;
  status: ThemeSetStatus;
}

interface SetResolverImpact {
  name: string;
}

interface SetGeneratorOwnershipImpact {
  generatorId: string;
  generatorName: string;
  targetGroup: string;
  tokenCount: number;
  samplePaths: string[];
}

interface SetGeneratorTargetImpact {
  generatorId: string;
  generatorName: string;
  targetGroup: string;
}

interface SetPreflightImpact {
  name: string;
  tokenCount: number;
  metadata: {
    description?: string;
    collectionName?: string;
    modeName?: string;
  };
  themeOptions: SetThemeImpact[];
  resolverRefs: SetResolverImpact[];
  generatedOwnership: SetGeneratorOwnershipImpact[];
  generatorTargets: SetGeneratorTargetImpact[];
}

interface SetPreflightBlocker {
  code: 'generator-target-set';
  setName: string;
  generatorId: string;
  generatorName: string;
  message: string;
}

interface SetMergeConflict {
  path: string;
  sourceValue: unknown;
  targetValue: unknown;
}

interface SetSplitPreviewItem {
  key: string;
  newName: string;
  count: number;
  existing: boolean;
}

interface SetStructuralPreflightResponse {
  operation: SetStructuralOperation;
  affectedSets: SetPreflightImpact[];
  blockers: SetPreflightBlocker[];
  warnings: string[];
  mergeConflicts: SetMergeConflict[];
  splitPreview: SetSplitPreviewItem[];
}

const SET_NAME_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;
const FOLDER_ITEM_SUFFIX = '/';

interface FolderSetRename {
  from: string;
  to: string;
}

function isValidSetName(name: string): boolean {
  return SET_NAME_RE.test(name);
}

function isFolderItemKey(item: string): boolean {
  return item.endsWith(FOLDER_ITEM_SUFFIX);
}

function topLevelFolderName(setName: string): string | null {
  const slashIdx = setName.indexOf('/');
  return slashIdx === -1 ? null : setName.slice(0, slashIdx);
}

function buildTopLevelItems(sets: string[]): string[] {
  const items: string[] = [];
  const seenFolders = new Set<string>();
  for (const setName of sets) {
    const folder = topLevelFolderName(setName);
    if (!folder) {
      items.push(setName);
      continue;
    }
    if (seenFolders.has(folder)) continue;
    seenFolders.add(folder);
    items.push(`${folder}${FOLDER_ITEM_SUFFIX}`);
  }
  return items;
}

function expandTopLevelItems(sets: string[], order: string[]): string[] {
  const standaloneSets = new Map<string, string>();
  const folderSets = new Map<string, string[]>();
  for (const setName of sets) {
    const folder = topLevelFolderName(setName);
    if (!folder) {
      standaloneSets.set(setName, setName);
      continue;
    }
    const members = folderSets.get(folder) ?? [];
    members.push(setName);
    folderSets.set(folder, members);
  }

  const expanded: string[] = [];
  for (const item of order) {
    if (isFolderItemKey(item)) {
      expanded.push(...(folderSets.get(item.slice(0, -1)) ?? []));
      continue;
    }
    if (standaloneSets.has(item)) {
      expanded.push(item);
    }
  }
  return expanded;
}

function getFolderSetNames(allSets: string[], folder: string): string[] {
  const prefix = `${folder}/`;
  return allSets.filter((setName) => setName.startsWith(prefix));
}

function replaceFolderPrefix(setName: string, fromFolder: string, toFolder: string): string {
  return `${toFolder}${setName.slice(fromFolder.length)}`;
}

function sortFolderRenamePairsForApply(pairs: FolderSetRename[]): FolderSetRename[] {
  return [...pairs].sort((left, right) => right.from.length - left.from.length);
}

function sortFolderRenamePairsForRollback(pairs: FolderSetRename[]): FolderSetRename[] {
  return [...pairs]
    .reverse()
    .map(({ from, to }) => ({ from: to, to: from }));
}

function findFolderRenameConflicts(allSets: string[], sourceSetNames: string[], renames: FolderSetRename[]): string[] {
  const sourceSetLookup = new Set(sourceSetNames);
  const conflicts = new Set<string>();
  const targetCounts = new Map<string, number>();

  for (const rename of renames) {
    targetCounts.set(rename.to, (targetCounts.get(rename.to) ?? 0) + 1);
  }

  for (const [target, count] of targetCounts) {
    if (count > 1) {
      conflicts.add(target);
    }
  }

  for (const rename of renames) {
    if (!isValidSetName(rename.to)) {
      conflicts.add(rename.to);
      continue;
    }
    if (!sourceSetLookup.has(rename.to) && allSets.includes(rename.to)) {
      conflicts.add(rename.to);
    }
  }

  return [...conflicts].sort((a, b) => a.localeCompare(b));
}

function buildThemeImpacts(setName: string, dimensions: ThemeDimension[]): SetThemeImpact[] {
  const impacts: SetThemeImpact[] = [];
  for (const dimension of dimensions) {
    for (const option of dimension.options) {
      const status = option.sets[setName];
      if (!status) continue;
      impacts.push({
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        optionName: option.name,
        status,
      });
    }
  }
  return impacts;
}

function buildGeneratedOwnershipImpacts(
  setName: string,
  allOwnedTokens: Array<{ setName: string; path: string; generatorId: string }>,
  generatorById: Map<string, SetGeneratorMeta>,
): SetGeneratorOwnershipImpact[] {
  const grouped = new Map<string, { tokenCount: number; samplePaths: string[] }>();
  for (const token of allOwnedTokens) {
    if (token.setName !== setName) continue;
    const entry = grouped.get(token.generatorId) ?? { tokenCount: 0, samplePaths: [] };
    entry.tokenCount += 1;
    if (entry.samplePaths.length < 5) {
      entry.samplePaths.push(token.path);
    }
    grouped.set(token.generatorId, entry);
  }
  return [...grouped.entries()]
    .map(([generatorId, ownership]) => {
      const generator = generatorById.get(generatorId);
      return {
        generatorId,
        generatorName: generator?.name ?? 'Unknown generator',
        targetGroup: generator?.targetGroup ?? '',
        tokenCount: ownership.tokenCount,
        samplePaths: ownership.samplePaths.sort((a, b) => a.localeCompare(b)),
      };
    })
    .sort((a, b) => a.generatorName.localeCompare(b.generatorName));
}

function buildGeneratorTargets(setName: string, generators: SetGeneratorMeta[]): SetGeneratorTargetImpact[] {
  return generators
    .filter((generator) => generator.targetSet === setName)
    .map((generator) => ({
      generatorId: generator.id,
      generatorName: generator.name,
      targetGroup: generator.targetGroup,
    }))
    .sort((a, b) => a.generatorName.localeCompare(b.generatorName));
}

function buildSetImpact(params: {
  setName: string;
  tokens: TokenGroup;
  metadata: SetMetadataState;
  dimensions: ThemeDimension[];
  resolvers: SetResolverMeta[];
  generators: SetGeneratorMeta[];
  allOwnedTokens: Array<{ setName: string; path: string; generatorId: string }>;
}): SetPreflightImpact {
  const { setName, tokens, metadata, dimensions, resolvers, generators, allOwnedTokens } = params;
  const generatorById = new Map(generators.map((generator) => [generator.id, generator]));
  return {
    name: setName,
    tokenCount: flattenTokenGroup(tokens).size,
    metadata,
    themeOptions: buildThemeImpacts(setName, dimensions),
    resolverRefs: resolvers
      .filter((resolver) => resolver.referencedSets.includes(setName))
      .map((resolver) => ({ name: resolver.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    generatedOwnership: buildGeneratedOwnershipImpacts(setName, allOwnedTokens, generatorById),
    generatorTargets: buildGeneratorTargets(setName, generators),
  };
}

function buildGeneratorTargetBlockers(setImpact: SetPreflightImpact): SetPreflightBlocker[] {
  return setImpact.generatorTargets.map((generator) => ({
    code: 'generator-target-set',
    setName: setImpact.name,
    generatorId: generator.generatorId,
    generatorName: generator.generatorName,
    message: `Generator "${generator.generatorName}" still targets "${setImpact.name}"${generator.targetGroup ? ` at ${generator.targetGroup}` : ''}.`,
  }));
}

function buildMergeConflicts(sourceTokens: TokenGroup, targetTokens: TokenGroup): SetMergeConflict[] {
  const sourceFlat = Object.fromEntries(flattenTokenGroup(sourceTokens));
  const targetFlat = Object.fromEntries(flattenTokenGroup(targetTokens));
  const conflicts: SetMergeConflict[] = [];
  for (const [path, sourceToken] of Object.entries(sourceFlat)) {
    const targetToken = targetFlat[path];
    if (!targetToken) continue;
    if (stableStringify(sourceToken.$value) !== stableStringify(targetToken.$value)) {
      conflicts.push({
        path,
        sourceValue: sourceToken.$value,
        targetValue: targetToken.$value,
      });
    }
  }
  return conflicts.sort((a, b) => a.path.localeCompare(b.path));
}

function buildSplitPreview(setName: string, tokens: TokenGroup, existingSetNames: string[]): SetSplitPreviewItem[] {
  return Object.entries(tokens)
    .filter(([key, value]) => !key.startsWith('$') && value && typeof value === 'object' && !('$value' in value))
    .map(([key, value]) => {
      const count = flattenTokenGroup(value as TokenGroup).size;
      const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, '-');
      const newName = `${setName}-${sanitized}`;
      return {
        key,
        newName,
        count,
        existing: existingSetNames.includes(newName),
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => a.newName.localeCompare(b.newName));
}

function listMetadataFields(metadata: SetPreflightImpact['metadata']): string[] {
  const fields: string[] = [];
  if (metadata.description) fields.push('description');
  if (metadata.collectionName) fields.push('collection');
  if (metadata.modeName) fields.push('mode');
  return fields;
}

function buildPreflightWarnings(params: {
  operation: SetStructuralOperation;
  source: SetPreflightImpact;
  target?: SetPreflightImpact;
  deleteOriginal?: boolean;
  splitPreview: SetSplitPreviewItem[];
}): string[] {
  const { operation, source, target, deleteOriginal = false, splitPreview } = params;
  const warnings: string[] = [];

  if (operation === 'delete') {
    if (source.themeOptions.length > 0) {
      warnings.push(`Deleting "${source.name}" leaves ${source.themeOptions.length} theme option reference${source.themeOptions.length === 1 ? '' : 's'} to repair.`);
    }
    if (source.resolverRefs.length > 0) {
      warnings.push(`Deleting "${source.name}" breaks ${source.resolverRefs.length} resolver source reference${source.resolverRefs.length === 1 ? '' : 's'} until they are repointed.`);
    }
    const metadataFields = listMetadataFields(source.metadata);
    if (metadataFields.length > 0) {
      warnings.push(`Deleting "${source.name}" also removes its Figma ${metadataFields.join(', ')} metadata.`);
    }
    if (source.generatedOwnership.length > 0) {
      warnings.push(`Generated tokens owned inside "${source.name}" are removed with the set; generators are not retargeted automatically.`);
    }
  }

  if (operation === 'merge') {
    warnings.push(`Merging copies tokens from "${source.name}" into "${target?.name ?? 'the target set'}" only. Theme options, resolver refs, Figma metadata, and generator wiring stay attached to their current sets.`);
    if (source.generatedOwnership.length > 0) {
      warnings.push(`Generated token ownership stays on "${source.name}" after the merge. Move or recreate those outputs separately if the source set will be retired.`);
    }
  }

  if (operation === 'split') {
    const existingDestinations = splitPreview.filter((entry) => entry.existing);
    if (existingDestinations.length > 0) {
      warnings.push(
        `${existingDestinations.length} split destination${existingDestinations.length === 1 ? '' : 's'} already exist and will be skipped. Their current dependencies are listed below so you can decide whether to rename or merge instead.`,
      );
    }
    if (!deleteOriginal) {
      warnings.push(`Split creates new sets from "${source.name}" but leaves theme options, resolver refs, Figma metadata, and generator ownership on the original set.`);
    } else {
      warnings.push(`Deleting "${source.name}" after the split does not redistribute theme options, resolver refs, Figma metadata, or generator ownership to the new sets.`);
    }
  }

  return warnings;
}

export const setRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;
  const METADATA_FIELD_CONFIG: Array<{
    bodyKey: 'description' | 'figmaCollection' | 'figmaMode';
    field: keyof SetMetadataState;
    label: SetMetadataChange['label'];
  }> = [
    { bodyKey: 'description', field: 'description', label: 'Description' },
    { bodyKey: 'figmaCollection', field: 'collectionName', label: 'Collection' },
    { bodyKey: 'figmaMode', field: 'modeName', label: 'Mode' },
  ];

  // GET /api/sets — list all sets (with optional descriptions)
  fastify.get('/sets', async (_request, reply) => {
    try {
      const sets = await fastify.tokenStore.getSets();
      const descriptions = fastify.tokenStore.getSetDescriptions();
      const counts = fastify.tokenStore.getSetCounts();
      const collectionNames = fastify.tokenStore.getSetCollectionNames();
      const modeNames = fastify.tokenStore.getSetModeNames();
      return { sets, descriptions, counts, collectionNames, modeNames };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to list sets');
    }
  });

  // GET /api/sets/:name — get a set
  fastify.get<{ Params: { name: string } }>('/sets/:name', async (request, reply) => {
    const { name } = request.params;
    try {
      const set = await fastify.tokenStore.getSet(name);
      if (!set) {
        return reply.status(404).send({ error: `Token set "${name}" not found` });
      }
      return { name: set.name, tokens: set.tokens };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get set');
    }
  });

  // POST /api/sets — create a set
  fastify.post<{ Body: { name: string; tokens?: Record<string, unknown> } }>('/sets', async (request, reply) => {
    const { name, tokens } = request.body || {};
    if (!name) {
      return reply.status(400).send({ error: 'Set name is required' });
    }

    // Validate name (alphanumeric, dashes, underscores; / for folder hierarchy)
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(name)) {
      return reply.status(400).send({ error: 'Set name must contain only alphanumeric characters, dashes, underscores, and / for folders' });
    }

    return withLock(async () => {
      try {
        const existing = await fastify.tokenStore.getSet(name);
        if (existing) {
          return reply.status(409).send({ error: `Token set "${name}" already exists` });
        }

        const set = await fastify.tokenStore.createSet(name, tokens as TokenGroup | undefined);
        const afterSnap = await snapshotSet(fastify.tokenStore, name);
        await fastify.operationLog.record({
          type: 'set-create',
          description: `Create set "${name}"`,
          setName: name,
          affectedPaths: Object.keys(afterSnap),
          beforeSnapshot: {},
          afterSnapshot: afterSnap,
          rollbackSteps: [{ action: 'delete-set', name }],
        });
        return reply.status(201).send({ ok: true, name: set.name });
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to create set');
      }
    });
  });

  // PATCH /api/sets/:name/metadata — update set description, figma collection name, and/or figma mode name
  fastify.patch<{ Params: { name: string }; Body: { description?: string; figmaCollection?: string; figmaMode?: string } }>('/sets/:name/metadata', async (request, reply) => {
    const { name } = request.params;
    const body = request.body || {};
    return withLock(async () => {
      try {
        const touchedFields = METADATA_FIELD_CONFIG
          .filter(({ bodyKey }) => Object.prototype.hasOwnProperty.call(body, bodyKey));
        if (touchedFields.length === 0) {
          const current = fastify.tokenStore.getSetMetadata(name);
          return { ok: true, name, ...current, changed: false };
        }

        const beforeMeta = fastify.tokenStore.getSetMetadata(name);
        const patch: Partial<SetMetadataState> = {};
        const changes: SetMetadataChange[] = [];
        for (const { bodyKey, field, label } of touchedFields) {
          const nextValue = body[bodyKey]?.trim() || undefined;
          patch[field] = nextValue;
          if (beforeMeta[field] !== nextValue) {
            changes.push({
              field,
              label,
              before: beforeMeta[field],
              after: nextValue,
            });
          }
        }

        if (changes.length === 0) {
          return { ok: true, name, ...beforeMeta, changed: false };
        }

        await fastify.tokenStore.updateSetMetadata(name, patch);
        const afterMeta = fastify.tokenStore.getSetMetadata(name);
        const rollbackMetadata = changes.reduce<Partial<SetMetadataState>>((acc, change) => {
          acc[change.field] = change.before;
          return acc;
        }, {});
        const metadata: SetMetadataOperationMetadata = {
          kind: 'set-metadata',
          name,
          before: beforeMeta,
          after: afterMeta,
          changes,
        };
        await fastify.operationLog.record({
          type: 'set-metadata',
          description: `Update metadata for set "${name}"`,
          setName: name,
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: [{ action: 'write-set-metadata', name, metadata: rollbackMetadata }],
          metadata,
        });
        return { ok: true, name, ...afterMeta, changed: true };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to update metadata');
      }
    });
  });

  // POST /api/sets/:name/rename — rename a set (atomic: file + themes + in-memory)
  fastify.post<{ Params: { name: string }; Body: { newName: string } }>('/sets/:name/rename', async (request, reply) => {
    const { name } = request.params;
    const { newName } = request.body || {};

    if (!newName) {
      return reply.status(400).send({ error: 'newName is required' });
    }
    if (!isValidSetName(newName)) {
      return reply.status(400).send({ error: 'Set name must contain only alphanumeric characters, dashes, underscores, and / for folders' });
    }

    return withLock(async () => {
      try {
        await fastify.tokenStore.renameSet(name, newName);
        await fastify.generatorService.updateSetName(name, newName);
        await fastify.operationLog.record({
          type: 'set-rename',
          description: `Rename set "${name}" → "${newName}"`,
          setName: newName,
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: [{ action: 'rename-set', from: newName, to: name }],
        });
        return { ok: true, oldName: name, newName };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to rename set');
      }
    });
  });

  // PUT /api/sets/reorder — reorder sets
  fastify.put<{ Body: { order: string[] } }>('/sets/reorder', async (request, reply) => {
    const { order } = request.body || {};
    if (!Array.isArray(order)) {
      return reply.status(400).send({ error: 'order must be an array of set names' });
    }
    try {
      return await withLock(async () => {
        const previousOrder = await fastify.tokenStore.getSets();
        fastify.tokenStore.reorderSets(order);
        await fastify.operationLog.record({
          type: 'set-reorder',
          description: 'Reorder token sets',
          setName: '',
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: [{ action: 'reorder-sets', order: previousOrder }],
        });
        return { ok: true };
      });
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to reorder sets');
    }
  });

  // POST /api/set-folders/rename — rename a folder prefix across all contained sets
  fastify.post<{ Body: { fromFolder?: string; toFolder?: string } }>('/set-folders/rename', async (request, reply) => {
    const fromFolder = request.body?.fromFolder?.trim();
    const toFolder = request.body?.toFolder?.trim();
    if (!fromFolder || !toFolder) {
      return reply.status(400).send({ error: 'fromFolder and toFolder are required' });
    }
    if (!isValidSetName(fromFolder) || !isValidSetName(toFolder)) {
      return reply.status(400).send({ error: 'Folder names must contain only alphanumeric characters, dashes, underscores, and / for folders' });
    }
    if (fromFolder === toFolder) {
      return reply.status(400).send({ error: 'Target folder must differ from the source folder' });
    }

    return withLock(async () => {
      try {
        const allSets = await fastify.tokenStore.getSets();
        const folderSetNames = getFolderSetNames(allSets, fromFolder);
        if (folderSetNames.length === 0) {
          return reply.status(404).send({ error: `Folder "${fromFolder}" not found` });
        }

        const renames = folderSetNames.map((setName) => ({
          from: setName,
          to: replaceFolderPrefix(setName, fromFolder, toFolder),
        }));
        const conflicts = findFolderRenameConflicts(allSets, folderSetNames, renames);
        if (conflicts.length > 0) {
          return reply.status(409).send({
            error: `Folder rename would collide with existing sets: ${conflicts.join(', ')}`,
            conflicts,
          });
        }

        for (const rename of sortFolderRenamePairsForApply(renames)) {
          await fastify.tokenStore.renameSet(rename.from, rename.to);
          await fastify.generatorService.updateSetName(rename.from, rename.to);
        }

        await fastify.operationLog.record({
          type: 'set-folder-rename',
          description: `Rename folder "${fromFolder}" → "${toFolder}"`,
          setName: toFolder,
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: sortFolderRenamePairsForRollback(renames).map(({ from, to }) => ({
            action: 'rename-set' as const,
            from,
            to,
          })),
          metadata: {
            folder: fromFolder,
            newFolder: toFolder,
            renamedSets: renames,
          },
        });

        return {
          ok: true,
          folder: fromFolder,
          newFolder: toFolder,
          renamedSets: renames,
          sets: await fastify.tokenStore.getSets(),
        };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to rename folder');
      }
    });
  });

  // POST /api/set-folders/reorder — reorder top-level folders and standalone sets
  fastify.post<{ Body: { order?: string[] } }>('/set-folders/reorder', async (request, reply) => {
    const order = request.body?.order;
    if (!Array.isArray(order)) {
      return reply.status(400).send({ error: 'order must be an array of top-level folder/set items' });
    }

    return withLock(async () => {
      try {
        const previousOrder = await fastify.tokenStore.getSets();
        const currentItems = buildTopLevelItems(previousOrder);
        if (
          order.length !== currentItems.length ||
          currentItems.some((item) => !order.includes(item))
        ) {
          return reply.status(400).send({ error: 'order must contain every current top-level set item exactly once' });
        }

        const nextOrder = expandTopLevelItems(previousOrder, order);
        fastify.tokenStore.reorderSets(nextOrder);
        await fastify.operationLog.record({
          type: 'set-folder-reorder',
          description: 'Reorder top-level set folders',
          setName: '',
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: [{ action: 'reorder-sets', order: previousOrder }],
          metadata: { order },
        });

        return { ok: true, sets: await fastify.tokenStore.getSets() };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to reorder folders');
      }
    });
  });

  // POST /api/set-folders/merge — move every set from one folder into another existing folder
  fastify.post<{ Body: { sourceFolder?: string; targetFolder?: string } }>('/set-folders/merge', async (request, reply) => {
    const sourceFolder = request.body?.sourceFolder?.trim();
    const targetFolder = request.body?.targetFolder?.trim();
    if (!sourceFolder || !targetFolder) {
      return reply.status(400).send({ error: 'sourceFolder and targetFolder are required' });
    }
    if (!isValidSetName(sourceFolder) || !isValidSetName(targetFolder)) {
      return reply.status(400).send({ error: 'Folder names must contain only alphanumeric characters, dashes, underscores, and / for folders' });
    }
    if (sourceFolder === targetFolder) {
      return reply.status(400).send({ error: 'Target folder must differ from the source folder' });
    }

    return withLock(async () => {
      try {
        const allSets = await fastify.tokenStore.getSets();
        const sourceSetNames = getFolderSetNames(allSets, sourceFolder);
        if (sourceSetNames.length === 0) {
          return reply.status(404).send({ error: `Folder "${sourceFolder}" not found` });
        }

        const targetSetNames = getFolderSetNames(allSets, targetFolder);
        if (targetSetNames.length === 0) {
          return reply.status(404).send({ error: `Target folder "${targetFolder}" not found` });
        }

        const renames = sourceSetNames.map((setName) => ({
          from: setName,
          to: replaceFolderPrefix(setName, sourceFolder, targetFolder),
        }));
        const conflicts = findFolderRenameConflicts(allSets, sourceSetNames, renames);
        if (conflicts.length > 0) {
          return reply.status(409).send({
            error: `Folder merge would collide with existing sets: ${conflicts.join(', ')}`,
            conflicts,
          });
        }

        for (const rename of sortFolderRenamePairsForApply(renames)) {
          await fastify.tokenStore.renameSet(rename.from, rename.to);
          await fastify.generatorService.updateSetName(rename.from, rename.to);
        }

        await fastify.operationLog.record({
          type: 'set-folder-merge',
          description: `Merge folder "${sourceFolder}" into "${targetFolder}"`,
          setName: targetFolder,
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: sortFolderRenamePairsForRollback(renames).map(({ from, to }) => ({
            action: 'rename-set' as const,
            from,
            to,
          })),
          metadata: {
            sourceFolder,
            targetFolder,
            movedSets: renames,
          },
        });

        return {
          ok: true,
          sourceFolder,
          targetFolder,
          movedSets: renames,
          sets: await fastify.tokenStore.getSets(),
        };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to merge folders');
      }
    });
  });

  // POST /api/set-folders/delete — delete every set inside a folder
  fastify.post<{ Body: { folder?: string } }>('/set-folders/delete', async (request, reply) => {
    const folder = request.body?.folder?.trim();
    if (!folder) {
      return reply.status(400).send({ error: 'folder is required' });
    }
    if (!isValidSetName(folder)) {
      return reply.status(400).send({ error: 'Folder names must contain only alphanumeric characters, dashes, underscores, and / for folders' });
    }

    return withLock(async () => {
      try {
        const allSets = await fastify.tokenStore.getSets();
        const folderSetNames = getFolderSetNames(allSets, folder);
        if (folderSetNames.length === 0) {
          return reply.status(404).send({ error: `Folder "${folder}" not found` });
        }

        const generators = (await fastify.generatorService.getAll()).map((generator) => ({
          id: generator.id,
          name: generator.name,
          targetSet: generator.targetSet,
          targetGroup: generator.targetGroup,
        }));
        const blockedTargets = folderSetNames.flatMap((setName) =>
          buildGeneratorTargets(setName, generators),
        );
        if (blockedTargets.length > 0) {
          const names = blockedTargets.map((generator) => `"${generator.generatorName}"`).join(', ');
          return reply.status(409).send({
            error: `Cannot delete folder "${folder}" — contained sets are used as generator targets by ${blockedTargets.length === 1 ? 'generator' : 'generators'}: ${names}`,
            generatorIds: blockedTargets.map((generator) => generator.generatorId),
          });
        }

        for (const setName of folderSetNames) {
          await fastify.tokenStore.deleteSet(setName);
        }

        await fastify.operationLog.record({
          type: 'set-folder-delete',
          description: `Delete folder "${folder}"`,
          setName: folder,
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          metadata: {
            folder,
            deletedSets: folderSetNames,
          },
        });

        return {
          ok: true,
          folder,
          deletedSets: folderSetNames,
          sets: await fastify.tokenStore.getSets(),
        };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to delete folder');
      }
    });
  });

  // DELETE /api/data — wipe all persisted state (danger zone)
  // Requires body: { confirm: "DELETE" } to prevent accidental calls
  fastify.delete<{ Body: { confirm?: string } }>('/data', async (request, reply) => {
    if (request.body?.confirm !== 'DELETE') {
      return reply.status(400).send({ error: 'Missing confirmation — send { confirm: "DELETE" } in the request body' });
    }
    return withLock(async () => {
      try {
        await fastify.resolverLock.withLock(async () => {
          await fastify.tokenStore.clearAll();
          await fastify.dimensionsStore.reset();
          await fastify.generatorService.reset();
          await fastify.resolverStore.reset();
          await fastify.operationLog.reset();
          await fastify.manualSnapshots.reset();
        });
        return { ok: true };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to clear data');
      }
    });
  });

  // POST /api/sets/:name/duplicate — duplicate a set (copies tokens + metadata)
  fastify.post<{ Params: { name: string }; Body?: { newName?: string } }>('/sets/:name/duplicate', async (request, reply) => {
    const { name } = request.params;
    const requestedName = request.body?.newName;

    return withLock(async () => {
      try {
        const source = await fastify.tokenStore.getSet(name);
        if (!source) {
          return reply.status(404).send({ error: `Token set "${name}" not found` });
        }

        // Auto-generate a unique name if not provided
        let newName = requestedName;
        if (!newName) {
          const allSets = await fastify.tokenStore.getSets();
          newName = `${name}-copy`;
          let i = 2;
          while (allSets.includes(newName)) {
            newName = `${name}-copy-${i++}`;
          }
        } else {
          if (!isValidSetName(newName)) {
            return reply.status(400).send({ error: 'Set name must contain only alphanumeric characters, dashes, underscores, and / for folders' });
          }
          const existing = await fastify.tokenStore.getSet(newName);
          if (existing) {
            return reply.status(409).send({ error: `Token set "${newName}" already exists` });
          }
        }

        // Deep-copy tokens (includes $description, $figmaCollection, $figmaMode metadata fields)
        const tokensCopy = JSON.parse(JSON.stringify(source.tokens));
        const set = await fastify.tokenStore.createSet(newName, tokensCopy);
        const afterSnap = await snapshotSet(fastify.tokenStore, newName);
        await fastify.operationLog.record({
          type: 'set-create',
          description: `Duplicate set "${name}" → "${newName}"`,
          setName: newName,
          affectedPaths: Object.keys(afterSnap),
          beforeSnapshot: {},
          afterSnapshot: afterSnap,
          rollbackSteps: [{ action: 'delete-set', name: newName }],
        });
        return reply.status(201).send({ ok: true, name: set.name, originalName: name });
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to duplicate set');
      }
    });
  });

  // POST /api/sets/:name/preflight — inspect dependency impacts before a structural set change
  fastify.post<{
    Params: { name: string };
    Body: { operation?: SetStructuralOperation; targetSet?: string; deleteOriginal?: boolean };
  }>('/sets/:name/preflight', async (request, reply) => {
    const { name } = request.params;
    const { operation, targetSet, deleteOriginal = false } = request.body || {};
    if (operation !== 'delete' && operation !== 'merge' && operation !== 'split') {
      return reply.status(400).send({ error: 'operation must be "delete", "merge", or "split"' });
    }
    if (operation === 'merge') {
      if (!targetSet) {
        return reply.status(400).send({ error: 'targetSet is required for merge preflight' });
      }
      if (targetSet === name) {
        return reply.status(400).send({ error: 'targetSet must differ from the source set' });
      }
    }

    try {
      const sourceSet = await fastify.tokenStore.getSet(name);
      if (!sourceSet) {
        return reply.status(404).send({ error: `Token set "${name}" not found` });
      }

      const [dimensions, generatorsRaw, allOwnedTokens, splitSetNames, targetSetData] = await Promise.all([
        fastify.dimensionsStore.load(),
        fastify.generatorService.getAll(),
        Promise.resolve(fastify.tokenStore.findTokensByGeneratorId('*')),
        operation === 'split' ? fastify.tokenStore.getSets() : Promise.resolve([] as string[]),
        operation === 'merge' && targetSet
          ? fastify.tokenStore.getSet(targetSet)
          : Promise.resolve(undefined),
      ]);
      if (operation === 'merge' && targetSet && !targetSetData) {
        return reply.status(404).send({ error: `Token set "${targetSet}" not found` });
      }

      const generators: SetGeneratorMeta[] = generatorsRaw.map((generator: {
        id: string;
        name: string;
        targetSet: string;
        targetGroup: string;
      }) => ({
        id: generator.id,
        name: generator.name,
        targetSet: generator.targetSet,
        targetGroup: generator.targetGroup,
      }));
      const resolvers: SetResolverMeta[] = fastify.resolverStore.list().map((resolver) => ({
        name: resolver.name,
        referencedSets: resolver.referencedSets,
      }));
      const sourceImpact = buildSetImpact({
        setName: name,
        tokens: sourceSet.tokens,
        metadata: fastify.tokenStore.getSetMetadata(name),
        dimensions,
        resolvers,
        generators,
        allOwnedTokens,
      });
      const splitPreview = operation === 'split'
        ? buildSplitPreview(name, sourceSet.tokens, splitSetNames)
        : [];
      const affectedSets: SetPreflightImpact[] = [sourceImpact];
      if (operation === 'merge' && targetSet && targetSetData) {
        affectedSets.push(buildSetImpact({
          setName: targetSet,
          tokens: targetSetData.tokens,
          metadata: fastify.tokenStore.getSetMetadata(targetSet),
          dimensions,
          resolvers,
          generators,
          allOwnedTokens,
        }));
      }
      if (operation === 'split') {
        const existingDestinations = splitPreview.filter((entry) => entry.existing);
        const existingDestinationImpacts = await Promise.all(
          existingDestinations.map(async (entry) => {
            const existingSet = await fastify.tokenStore.getSet(entry.newName);
            if (!existingSet) return null;
            return buildSetImpact({
              setName: entry.newName,
              tokens: existingSet.tokens,
              metadata: fastify.tokenStore.getSetMetadata(entry.newName),
              dimensions,
              resolvers,
              generators,
              allOwnedTokens,
            });
          }),
        );
        affectedSets.push(...existingDestinationImpacts.filter((impact): impact is SetPreflightImpact => impact !== null));
      }

      const blockers = operation === 'delete' || (operation === 'split' && deleteOriginal)
        ? buildGeneratorTargetBlockers(sourceImpact)
        : [];
      const mergeConflicts = operation === 'merge' && targetSetData
        ? buildMergeConflicts(sourceSet.tokens, targetSetData.tokens)
        : [];
      const warnings = buildPreflightWarnings({
        operation,
        source: sourceImpact,
        target: affectedSets[1],
        deleteOriginal,
        splitPreview,
      });

      const response: SetStructuralPreflightResponse = {
        operation,
        affectedSets,
        blockers,
        warnings,
        mergeConflicts,
        splitPreview,
      };
      return response;
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to inspect set dependencies');
    }
  });

  // DELETE /api/sets/:name — delete a set
  fastify.delete<{ Params: { name: string } }>('/sets/:name', async (request, reply) => {
    const { name } = request.params;
    return withLock(async () => {
      try {
        const set = await fastify.tokenStore.getSet(name);
        if (!set) {
          return reply.status(404).send({ error: `Token set "${name}" not found` });
        }

        const generatorTargets = buildGeneratorTargets(
          name,
          (await fastify.generatorService.getAll()).map((generator) => ({
            id: generator.id,
            name: generator.name,
            targetSet: generator.targetSet,
            targetGroup: generator.targetGroup,
          })),
        );
        if (generatorTargets.length > 0) {
          const names = generatorTargets.map((generator) => `"${generator.generatorName}"`).join(', ');
          return reply.status(409).send({
            error: `Cannot delete set "${name}" — it is used as the target by ${generatorTargets.length === 1 ? 'generator' : 'generators'}: ${names}`,
            generatorIds: generatorTargets.map((generator) => generator.generatorId),
          });
        }

        const beforeSnap = await snapshotSet(fastify.tokenStore, name);
        const deleted = await fastify.tokenStore.deleteSet(name);
        if (!deleted) {
          return reply.status(404).send({ error: `Token set "${name}" not found` });
        }
        const entry = await fastify.operationLog.record({
          type: 'set-delete',
          description: `Delete set "${name}"`,
          setName: name,
          affectedPaths: Object.keys(beforeSnap),
          beforeSnapshot: beforeSnap,
          afterSnapshot: {},
          rollbackSteps: [{ action: 'create-set', name }],
        });
        return { ok: true, name, operationId: entry.id };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to delete set');
      }
    });
  });
};
