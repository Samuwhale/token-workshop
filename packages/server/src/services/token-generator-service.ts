import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildGeneratorNodesFromStructuredDraft,
  createDefaultTokenGeneratorDocument,
  evaluateTokenGeneratorDocument,
  generatorDefaultConfig,
  generatorDefaultOutputPrefix,
  generatorDefaultSourceValue,
  generatorPresetLabel,
  makeDefaultStructuredGeneratorDraft,
  readTokenModeValuesForCollection,
  readGeneratorProvenance,
  stableStringify,
  tokenFromGeneratorOutput,
  type Token,
  type TokenCollection,
  type TokenGeneratorDocument,
  type TokenGeneratorDocumentNode,
  type TokenGeneratorEdge,
  type TokenGeneratorPreviewResult,
  type TokenGeneratorViewport,
  type GeneratorTemplateKind,
} from "@tokenmanager/core";
import { BadRequestError, ConflictError, NotFoundError } from "../errors.js";
import type { CollectionService } from "./collection-service.js";
import {
  buildCollectionSnapshotKey,
  listChangedSnapshotKeys,
  listChangedSnapshotTokenPaths,
  pickSnapshotEntries,
  type SnapshotEntry,
} from "./operation-log.js";
import type { OperationLog } from "./operation-log.js";
import type { TokenStore } from "./token-store.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";

interface GeneratorStoreFile {
  $generators: TokenGeneratorDocument[];
}

const GENERATOR_NODE_KINDS = new Set<string>([
  "tokenInput",
  "literal",
  "math",
  "color",
  "formula",
  "colorRamp",
  "spacingScale",
  "typeScale",
  "borderRadiusScale",
  "opacityScale",
  "shadowScale",
  "zIndexScale",
  "customScale",
  "list",
  "alias",
  "output",
  "groupOutput",
]);

export interface GeneratorCreateInput {
  name?: string;
  targetCollectionId: string;
  template?: GeneratorTemplateKind;
  nodes?: TokenGeneratorDocument["nodes"];
  edges?: TokenGeneratorDocument["edges"];
  viewport?: TokenGeneratorDocument["viewport"];
}

export type GeneratorUpdateInput = Partial<
  Pick<
    TokenGeneratorDocument,
    "name" | "targetCollectionId" | "nodes" | "edges" | "viewport"
  >
>;

export type GeneratorDraftInput = Pick<
  TokenGeneratorDocument,
  "name" | "targetCollectionId" | "nodes" | "edges" | "viewport"
>;

export interface GeneratorApplyResult {
  preview: TokenGeneratorPreviewResult;
  operationId?: string;
  created: string[];
  updated: string[];
  deleted: string[];
}

export interface GeneratorApplyOptions {
  expectedPreviewHash?: string;
  newGenerator?: boolean;
}

export interface GeneratorStatusItem {
  generator: TokenGeneratorDocument;
  preview: TokenGeneratorPreviewResult;
  stale: boolean;
  unapplied: boolean;
  blocking: boolean;
  managedTokenCount: number;
}

export interface GeneratorOwnedTokenRef {
  collectionId: string;
  path: string;
  token: Token;
}

export interface GeneratorCollectionDependencyMeta {
  id: string;
  name: string;
  referencedCollections: string[];
}

export class TokenGeneratorService {
  readonly filePath: string;
  readonly lock = new PromiseChainLock();
  private generators = new Map<string, TokenGeneratorDocument>();

  constructor(tokenDir: string) {
    this.filePath = path.join(path.resolve(tokenDir), "$generators.json");
  }

  async initialize(): Promise<void> {
    await this.reloadFromDisk();
  }

  async reloadFromDisk(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as GeneratorStoreFile;
      if (!Array.isArray(parsed.$generators)) {
        throw new Error(
          `Invalid generator store "${this.filePath}": $generators must be an array`,
        );
      }
      const generators = parsed.$generators;
      this.generators = new Map(
        generators.map((generator) => {
          const normalized = normalizeGeneratorDocument(generator);
          return [normalized.id, normalized] as const;
        }),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.generators.clear();
        return;
      }
      throw error;
    }
  }

  async list(): Promise<TokenGeneratorDocument[]> {
    return Array.from(this.generators.values()).map(cloneGenerator);
  }

  async getById(id: string): Promise<TokenGeneratorDocument | undefined> {
    const generator = this.generators.get(id);
    return generator ? cloneGenerator(generator) : undefined;
  }

  async snapshot(): Promise<TokenGeneratorDocument[]> {
    return this.list();
  }

  async restore(generators: TokenGeneratorDocument[]): Promise<void> {
    await this.lock.withLock(async () => {
      this.generators = new Map(
        generators.map((generator) => {
          const normalized = normalizeGeneratorDocument(generator);
          return [normalized.id, normalized];
        }),
      );
      await this.persist();
    });
  }

  async create(input: GeneratorCreateInput): Promise<TokenGeneratorDocument> {
    return this.lock.withLock(async () => {
      const generator =
        input.nodes && input.edges && input.viewport
          ? buildDraftGenerator({
              name: input.name ?? generatorPresetLabel(input.template),
              targetCollectionId: input.targetCollectionId,
              nodes: input.nodes,
              edges: input.edges,
              viewport: input.viewport,
            })
          : buildTemplateGenerator(input);
      this.generators.set(generator.id, generator);
      await this.persist();
      return cloneGenerator(generator);
    });
  }

  async update(
    id: string,
    input: GeneratorUpdateInput,
    tokenStore?: TokenStore,
  ): Promise<TokenGeneratorDocument> {
    return this.lock.withLock(async () => {
      const existing = this.generators.get(id);
      if (!existing) throw new NotFoundError(`Generator "${id}" not found`);
      if (
        tokenStore &&
        input.targetCollectionId &&
        input.targetCollectionId !== existing.targetCollectionId
      ) {
        const owned = this.findOwnedTokenRefs(id, tokenStore);
        if (owned.length > 0) {
          throw new ConflictError(
            `Generator "${existing.name}" already manages ${owned.length} token${owned.length === 1 ? "" : "s"}. Detach or delete those outputs before changing the target collection.`,
          );
        }
      }
      const updated = normalizeGeneratorDocument({
        ...existing,
        ...input,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      });
      this.generators.set(id, updated);
      await this.persist();
      return cloneGenerator(updated);
    });
  }

  async delete(id: string, tokenStore?: TokenStore): Promise<boolean> {
    return this.lock.withLock(async () => {
      if (tokenStore) {
        const ownedPaths = this.findOwnedTokenPaths(id, tokenStore);
        if (ownedPaths.length > 0) {
          throw new ConflictError(
            `Generator "${id}" still manages ${ownedPaths.length} token${ownedPaths.length === 1 ? "" : "s"}. Delete or detach those outputs before deleting the generator.`,
          );
        }
      }
      const deleted = this.generators.delete(id);
      if (deleted) await this.persist();
      return deleted;
    });
  }

  async preview(
    id: string,
    collectionService: CollectionService,
    tokenStore: TokenStore,
  ): Promise<TokenGeneratorPreviewResult> {
    const generator = this.generators.get(id);
    if (!generator) throw new NotFoundError(`Generator "${id}" not found`);
    return this.buildPreview(generator, collectionService, tokenStore);
  }

  async previewDraft(
    input: GeneratorDraftInput,
    collectionService: CollectionService,
    tokenStore: TokenStore,
  ): Promise<TokenGeneratorPreviewResult> {
    const generator = buildDraftGenerator(input);
    return this.buildPreview(generator, collectionService, tokenStore);
  }

  async status(
    collectionService: CollectionService,
    tokenStore: TokenStore,
  ): Promise<GeneratorStatusItem[]> {
    const generators = Array.from(this.generators.values()).map(cloneGenerator);
    const items: GeneratorStatusItem[] = [];
    for (const generator of generators) {
      const preview = await this.buildPreview(
        generator,
        collectionService,
        tokenStore,
      );
      const previewHashes = Object.fromEntries(
        preview.outputs.map((output) => [output.path, output.hash]),
      );
      const storedHashes = generator.outputHashes ?? {};
      const stale =
        Boolean(generator.lastAppliedAt) &&
        (!sameStringRecord(previewHashes, storedHashes) ||
          preview.outputs.some((output) => output.change !== "unchanged"));
      const unapplied = !generator.lastAppliedAt && preview.outputs.length > 0;
      items.push({
        generator,
        preview,
        stale,
        unapplied,
        blocking:
          preview.blocking ||
          stale ||
          preview.outputs.some((output) => output.collision),
        managedTokenCount: this.findOwnedTokenRefs(generator.id, tokenStore)
          .length,
      });
    }
    return items;
  }

  async apply(
    id: string,
    collectionService: CollectionService,
    tokenStore: TokenStore,
    operationLog: OperationLog,
    options: GeneratorApplyOptions = {},
  ): Promise<GeneratorApplyResult> {
    return this.lock.withLock(async () => {
      const generator = this.generators.get(id);
      if (!generator) throw new NotFoundError(`Generator "${id}" not found`);

      const preview = await this.buildPreview(
        generator,
        collectionService,
        tokenStore,
      );
      if (
        options.expectedPreviewHash &&
        preview.hash !== options.expectedPreviewHash
      ) {
        throw new ConflictError(
          "Generator outputs changed since the last review. Review the generator again before applying.",
        );
      }
      if (preview.blocking) {
        throw new BadRequestError(
          "Fix generator diagnostics before applying outputs.",
        );
      }
      const manualCollisions = preview.outputs.filter(
        (output) => output.collision,
      );
      if (manualCollisions.length > 0) {
        throw new ConflictError(
          `Generator would overwrite manual tokens: ${manualCollisions.map((output) => output.path).join(", ")}`,
        );
      }

      const state = await collectionService.loadState();
      const targetCollection = state.collections.find(
        (collection) => collection.id === generator.targetCollectionId,
      );
      if (!targetCollection) {
        throw new NotFoundError(
          `Collection "${generator.targetCollectionId}" not found`,
        );
      }

      const targetOutputPaths = new Set(
        preview.outputs.map((output) => output.path),
      );
      const currentOwnedRefs = this.findOwnedTokenRefs(
        generator.id,
        tokenStore,
      );
      const ownedOutsideTarget = currentOwnedRefs.filter(
        (entry) => entry.collectionId !== generator.targetCollectionId,
      );
      if (ownedOutsideTarget.length > 0) {
        throw new ConflictError(
          `Generator still owns outputs in another collection: ${ownedOutsideTarget.map((entry) => `${entry.collectionId}/${entry.path}`).join(", ")}. Detach those tokens before applying.`,
        );
      }
      const deleted = currentOwnedRefs
        .filter((entry) => !targetOutputPaths.has(entry.path))
        .map((entry) => entry.path);
      const modifiedDeleted = currentOwnedRefs.filter(
        (entry) =>
          !targetOutputPaths.has(entry.path) &&
          !this.tokenStillMatchesAppliedGeneratorOutput(
            generator,
            targetCollection,
            entry.token,
          ),
      );
      if (modifiedDeleted.length > 0) {
        throw new ConflictError(
          `Generator would delete manually changed tokens: ${modifiedDeleted.map((entry) => entry.path).join(", ")}. Detach those tokens before applying.`,
        );
      }
      const touchedPaths = [
        ...new Set([
          ...preview.outputs.map((output) => output.path),
          ...deleted,
        ]),
      ];
      const beforeSnapshot = await snapshotPaths(
        tokenStore,
        generator.targetCollectionId,
        touchedPaths,
      );
      const generatorBefore = cloneGenerator(generator);
      const generatorStateBefore = Array.from(this.generators.values()).map(
        cloneGenerator,
      );
      const rollbackGeneratorState = options.newGenerator
        ? generatorStateBefore.filter(
            (candidate) => candidate.id !== generator.id,
          )
        : generatorStateBefore;

      const tokens = preview.outputs.map((output) => ({
        path: output.path,
        token: tokenFromGeneratorOutput(
          targetCollection,
          output,
          {
            generatorId: generator.id,
            outputNodeId: output.nodeId,
            outputKey: output.outputKey,
            lastAppliedHash: output.hash,
          },
          output.existingToken,
        ),
      }));
      let tokenWritesStarted = false;
      try {
        if (tokens.length > 0) {
          tokenWritesStarted = true;
          await tokenStore.batchUpsertTokens(
            generator.targetCollectionId,
            tokens,
            "overwrite",
          );
        }
        if (deleted.length > 0) {
          tokenWritesStarted = true;
          await tokenStore.deleteTokens(generator.targetCollectionId, deleted);
        }

        const afterSnapshot = await snapshotPaths(
          tokenStore,
          generator.targetCollectionId,
          touchedPaths,
        );
        const changedKeys = listChangedSnapshotKeys(
          beforeSnapshot,
          afterSnapshot,
        );
        const changedPaths = listChangedSnapshotTokenPaths(
          beforeSnapshot,
          afterSnapshot,
        );
        const created = preview.outputs
          .filter((output) => output.change === "created")
          .map((output) => output.path);
        const updated = preview.outputs
          .filter((output) => output.change === "updated")
          .map((output) => output.path);

        const updatedGenerator = normalizeGeneratorDocument({
          ...generator,
          lastAppliedAt: new Date().toISOString(),
          lastApplyDiagnostics: preview.diagnostics,
          outputHashes: Object.fromEntries(
            preview.outputs.map((output) => [output.path, output.hash]),
          ),
          updatedAt: new Date().toISOString(),
        });
        this.generators.set(generator.id, updatedGenerator);
        await this.persist();

        const operation = await operationLog.record({
          type: "generator-apply",
          description: `Apply generator "${generator.name}"`,
          resourceId: generator.id,
          affectedPaths: changedPaths,
          beforeSnapshot: pickSnapshotEntries(beforeSnapshot, changedKeys),
          afterSnapshot: pickSnapshotEntries(afterSnapshot, changedKeys),
          metadata: {
            kind: "generator-apply",
            generatorId: generator.id,
            generatorName: generator.name,
            targetCollectionId: generator.targetCollectionId,
          },
          rollbackSteps: [
            {
              action: "restore-generators",
              generators: rollbackGeneratorState,
            },
          ],
        });
        const operationId = operation.id;

        return {
          preview,
          operationId,
          created,
          updated,
          deleted,
        };
      } catch (error) {
        if (tokenWritesStarted) {
          await restoreSnapshot(
            tokenStore,
            generator.targetCollectionId,
            beforeSnapshot,
          );
        }
        this.generators.set(generatorBefore.id, generatorBefore);
        await this.persist();
        throw error;
      }
    });
  }

  async applyDraft(
    input: GeneratorDraftInput,
    collectionService: CollectionService,
    tokenStore: TokenStore,
    operationLog: OperationLog,
    options: GeneratorApplyOptions = {},
  ): Promise<GeneratorApplyResult & { generator: TokenGeneratorDocument }> {
    const generator = buildDraftGenerator(input);
    this.generators.set(generator.id, generator);
    await this.persist();
    try {
      const result = await this.apply(
        generator.id,
        collectionService,
        tokenStore,
        operationLog,
        { ...options, newGenerator: true },
      );
      const appliedGenerator = this.generators.get(generator.id) ?? generator;
      return { ...result, generator: cloneGenerator(appliedGenerator) };
    } catch (error) {
      const ownedPaths = this.findOwnedTokenPaths(generator.id, tokenStore);
      if (ownedPaths.length === 0) {
        this.generators.delete(generator.id);
        await this.persist();
      }
      throw error;
    }
  }

  async detachOutput(
    id: string,
    collectionId: string,
    tokenPath: string,
    tokenStore: TokenStore,
    operationLog: OperationLog,
  ): Promise<{ ok: true; operationId?: string }> {
    return this.lock.withLock(async () => {
      const generator = this.generators.get(id);
      if (!generator) throw new NotFoundError(`Generator "${id}" not found`);
      const token = await tokenStore.getToken(collectionId, tokenPath);
      if (!token) {
        throw new NotFoundError(
          `Token "${tokenPath}" not found in collection "${collectionId}"`,
        );
      }
      const provenance = readGeneratorProvenance(token);
      if (provenance?.generatorId !== id) {
        throw new BadRequestError(
          `Token "${tokenPath}" is not managed by generator "${generator.name}".`,
        );
      }
      const beforeSnapshot = await snapshotPaths(tokenStore, collectionId, [
        tokenPath,
      ]);
      const nextToken = structuredClone(token);
      const extensions = { ...(nextToken.$extensions ?? {}) };
      const tokenmanager =
        extensions.tokenmanager &&
        typeof extensions.tokenmanager === "object" &&
        !Array.isArray(extensions.tokenmanager)
          ? { ...(extensions.tokenmanager as Record<string, unknown>) }
          : {};
      delete tokenmanager.generator;
      if (Object.keys(tokenmanager).length > 0) {
        extensions.tokenmanager = tokenmanager;
      } else {
        delete extensions.tokenmanager;
      }
      if (Object.keys(extensions).length > 0) {
        nextToken.$extensions = extensions;
      } else {
        delete nextToken.$extensions;
      }
      let tokenUpdated = false;
      try {
        await tokenStore.updateToken(collectionId, tokenPath, nextToken);
        tokenUpdated = true;
        const afterSnapshot = await snapshotPaths(tokenStore, collectionId, [
          tokenPath,
        ]);
        const changedKeys = listChangedSnapshotKeys(
          beforeSnapshot,
          afterSnapshot,
        );
        let operationId: string | undefined;
        if (changedKeys.length > 0) {
          const operation = await operationLog.record({
            type: "generator-detach",
            description: `Detach "${tokenPath}" from generator "${generator.name}"`,
            resourceId: generator.id,
            affectedPaths: [tokenPath],
            beforeSnapshot: pickSnapshotEntries(beforeSnapshot, changedKeys),
            afterSnapshot: pickSnapshotEntries(afterSnapshot, changedKeys),
            metadata: {
              kind: "generator-detach",
              generatorId: generator.id,
              generatorName: generator.name,
              collectionId,
              tokenPath,
            },
          });
          operationId = operation.id;
        }
        return { ok: true, operationId };
      } catch (error) {
        if (tokenUpdated) {
          await restoreSnapshot(tokenStore, collectionId, beforeSnapshot);
        }
        throw error;
      }
    });
  }

  async renameCollectionId(
    oldCollectionId: string,
    newCollectionId: string,
  ): Promise<number> {
    return this.lock.withLock(async () => {
      let changed = 0;
      const nextGenerators = Array.from(this.generators.values()).map(
        (generator) => {
          let generatorChanged = false;
          const nodes = generator.nodes.map((node) => {
            if (node.data.collectionId !== oldCollectionId) return node;
            generatorChanged = true;
            return {
              ...node,
              data: {
                ...node.data,
                collectionId: newCollectionId,
              },
            };
          });
          const targetCollectionId =
            generator.targetCollectionId === oldCollectionId
              ? newCollectionId
              : generator.targetCollectionId;
          generatorChanged =
            generatorChanged ||
            targetCollectionId !== generator.targetCollectionId;
          if (!generatorChanged) return generator;
          changed += 1;
          return normalizeGeneratorDocument({
            ...generator,
            targetCollectionId,
            nodes,
            updatedAt: new Date().toISOString(),
          });
        },
      );
      if (changed > 0) {
        this.generators = new Map(
          nextGenerators.map((generator) => [generator.id, generator]),
        );
        await this.persist();
      }
      return changed;
    });
  }

  async deleteCollectionId(collectionId: string): Promise<number> {
    return this.lock.withLock(async () => {
      const nextGenerators = Array.from(this.generators.values()).filter(
        (generator) => generator.targetCollectionId !== collectionId,
      );
      const deleted = this.generators.size - nextGenerators.length;
      if (deleted > 0) {
        this.generators = new Map(
          nextGenerators.map((generator) => [generator.id, generator]),
        );
        await this.persist();
      }
      return deleted;
    });
  }

  getCollectionReferenceCount(collectionIds: Iterable<string>): number {
    const collectionIdSet = new Set(collectionIds);
    let count = 0;
    for (const generator of this.generators.values()) {
      if (collectionIdSet.has(generator.targetCollectionId)) {
        count += 1;
        continue;
      }
      if (
        generator.nodes.some(
          (node) =>
            typeof node.data.collectionId === "string" &&
            collectionIdSet.has(node.data.collectionId),
        )
      ) {
        count += 1;
      }
    }
    return count;
  }

  listCollectionDependencyMeta(): GeneratorCollectionDependencyMeta[] {
    return Array.from(this.generators.values())
      .map((generator) => ({
        id: generator.id,
        name: generator.name,
        referencedCollections: [
          ...new Set([
            generator.targetCollectionId,
            ...generator.nodes
              .map((node) => node.data.collectionId)
              .filter(
                (collectionId): collectionId is string =>
                  typeof collectionId === "string",
              ),
          ]),
        ].filter(Boolean),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  assertNoCollectionReferences(collectionIds: Iterable<string>): void {
    const count = this.getCollectionReferenceCount(collectionIds);
    if (count > 0) {
      throw new ConflictError(
        `Cannot delete collection while ${count} generator document${count === 1 ? "" : "s"} still reference it. Delete or retarget those generators first.`,
      );
    }
  }

  private async buildPreview(
    generator: TokenGeneratorDocument,
    collectionService: CollectionService,
    tokenStore: TokenStore,
  ): Promise<TokenGeneratorPreviewResult> {
    const state = await collectionService.loadState();
    const tokensByCollection: Record<string, Record<string, Token>> = {};
    for (const collection of state.collections) {
      tokensByCollection[collection.id] =
        await tokenStore.getFlatTokensForCollection(collection.id);
    }
    return evaluateTokenGeneratorDocument({
      document: generator,
      collections: state.collections as TokenCollection[],
      tokensByCollection,
    });
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const body: GeneratorStoreFile = {
      $generators: Array.from(this.generators.values()),
    };
    await fs.writeFile(tmp, JSON.stringify(body, null, 2), "utf-8");
    await fs.rename(tmp, this.filePath);
  }

  private findOwnedTokenPaths(
    generatorId: string,
    tokenStore: TokenStore,
    collectionId?: string,
  ): string[] {
    return this.findOwnedTokenRefs(generatorId, tokenStore, collectionId).map(
      (entry) => entry.path,
    );
  }

  findOwnedTokenRefs(
    generatorId: string,
    tokenStore: TokenStore,
    collectionId?: string,
  ): GeneratorOwnedTokenRef[] {
    return tokenStore
      .getAllFlatTokens()
      .filter(
        (entry) =>
          (!collectionId || entry.collectionId === collectionId) &&
          readGeneratorProvenance(entry.token)?.generatorId === generatorId,
      )
      .map((entry) => ({
        collectionId: entry.collectionId,
        path: entry.path,
        token: entry.token,
      }));
  }

  private tokenStillMatchesAppliedGeneratorOutput(
    generator: TokenGeneratorDocument,
    targetCollection: TokenCollection,
    token: Token,
  ): boolean {
    const provenance = readGeneratorProvenance(token);
    if (!provenance || provenance.generatorId !== generator.id) {
      return false;
    }
    if (tokenHasManualGeneratorOutputMetadata(token)) {
      return false;
    }
    const currentHash = stableStringify({
      documentId: generator.id,
      nodeId: provenance.outputNodeId,
      outputKey: provenance.outputKey,
      modeValues: readTokenModeValuesForCollection(token, targetCollection),
      type: token.$type,
    });
    return currentHash === provenance.lastAppliedHash;
  }
}

function tokenHasManualGeneratorOutputMetadata(token: Token): boolean {
  if (token.$description) {
    return true;
  }
  const extensions = token.$extensions;
  if (!extensions) {
    return false;
  }
  for (const [key, value] of Object.entries(extensions)) {
    if (key !== "tokenmanager") {
      return true;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return true;
    }
    const tokenmanager = value as Record<string, unknown>;
    for (const tokenmanagerKey of Object.keys(tokenmanager)) {
      if (tokenmanagerKey !== "generator" && tokenmanagerKey !== "modes") {
        return true;
      }
    }
  }
  return false;
}

function sameStringRecord(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && left[key] === right[key],
  );
}

async function snapshotPaths(
  tokenStore: TokenStore,
  collectionId: string,
  paths: string[],
): Promise<Record<string, SnapshotEntry>> {
  const snapshot: Record<string, SnapshotEntry> = {};
  for (const tokenPath of paths) {
    snapshot[buildCollectionSnapshotKey(collectionId, tokenPath)] = {
      collectionId,
      token: (await tokenStore.getToken(collectionId, tokenPath)) ?? null,
    };
  }
  return snapshot;
}

async function restoreSnapshot(
  tokenStore: TokenStore,
  collectionId: string,
  snapshot: Record<string, SnapshotEntry>,
): Promise<void> {
  await tokenStore.restoreSnapshot(
    collectionId,
    Object.entries(snapshot).map(([snapshotKey, entry]) => ({
      path: snapshotKey.slice(`${collectionId}::`.length),
      token: entry.token ? structuredClone(entry.token) : null,
    })),
  );
}

function buildTemplateGenerator(
  input: GeneratorCreateInput,
): TokenGeneratorDocument {
  const base = createDefaultTokenGeneratorDocument(
    input.targetCollectionId,
    input.name ?? generatorPresetLabel(input.template),
  );
  base.id = randomUUID();
  const now = new Date().toISOString();
  const template = input.template ?? "colorRamp";
  if (template === "blank") {
    base.nodes = [];
    base.edges = [];
  } else {
    const generated = generatedTemplate(template);
    base.nodes = generated.nodes;
    base.edges = generated.edges;
  }
  base.createdAt = base.createdAt || now;
  base.updatedAt = now;
  return normalizeGeneratorDocument(base);
}

function buildDraftGenerator(
  input: GeneratorDraftInput,
): TokenGeneratorDocument {
  const now = new Date().toISOString();
  return normalizeGeneratorDocument({
    id: randomUUID(),
    name: input.name,
    targetCollectionId: input.targetCollectionId,
    nodes: input.nodes,
    edges: input.edges,
    viewport: input.viewport,
    createdAt: now,
    updatedAt: now,
  });
}

function generatedTemplate(
  template: NonNullable<GeneratorCreateInput["template"]>,
): Pick<TokenGeneratorDocument, "nodes" | "edges"> {
  if (template === "blank") return { nodes: [], edges: [] };
  return buildGeneratorNodesFromStructuredDraft({
    ...makeDefaultStructuredGeneratorDraft(template, ""),
    sourceValue: generatorDefaultSourceValue(template),
    outputPrefix: generatorDefaultOutputPrefix(template),
    config: generatorDefaultConfig(template),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateGeneratorViewport(
  generatorId: string,
  viewport: unknown,
): asserts viewport is TokenGeneratorViewport {
  if (
    !isRecord(viewport) ||
    !Number.isFinite(viewport.x) ||
    !Number.isFinite(viewport.y) ||
    !Number.isFinite(viewport.zoom)
  ) {
    throw new Error(
      `Invalid generator document "${generatorId}": viewport must contain numeric x, y, and zoom`,
    );
  }
}

function validateGeneratorNode(
  generatorId: string,
  node: unknown,
): asserts node is TokenGeneratorDocumentNode {
  if (!isRecord(node) || typeof node.id !== "string" || !node.id.trim()) {
    throw new Error(
      `Invalid generator document "${generatorId}": every node must have a string id`,
    );
  }
  if (typeof node.kind !== "string" || !GENERATOR_NODE_KINDS.has(node.kind)) {
    throw new Error(
      `Invalid generator document "${generatorId}": node "${node.id}" has invalid kind`,
    );
  }
  if (typeof node.label !== "string") {
    throw new Error(
      `Invalid generator document "${generatorId}": node "${node.id}" label must be a string`,
    );
  }
  if (
    !isRecord(node.position) ||
    !Number.isFinite(node.position.x) ||
    !Number.isFinite(node.position.y)
  ) {
    throw new Error(
      `Invalid generator document "${generatorId}": node "${node.id}" position must contain numeric x and y`,
    );
  }
  if (!isRecord(node.data)) {
    throw new Error(
      `Invalid generator document "${generatorId}": node "${node.id}" data must be an object`,
    );
  }
}

function validateGeneratorEdgeEndpoint(
  generatorId: string,
  edgeId: string,
  endpointName: "from" | "to",
  endpoint: unknown,
): void {
  if (
    !isRecord(endpoint) ||
    typeof endpoint.nodeId !== "string" ||
    !endpoint.nodeId.trim() ||
    typeof endpoint.port !== "string" ||
    !endpoint.port.trim()
  ) {
    throw new Error(
      `Invalid generator document "${generatorId}": edge "${edgeId}" ${endpointName} must contain nodeId and port`,
    );
  }
}

function validateGeneratorEdge(
  generatorId: string,
  edge: unknown,
): asserts edge is TokenGeneratorEdge {
  if (!isRecord(edge) || typeof edge.id !== "string" || !edge.id.trim()) {
    throw new Error(
      `Invalid generator document "${generatorId}": every edge must have a string id`,
    );
  }
  validateGeneratorEdgeEndpoint(generatorId, edge.id, "from", edge.from);
  validateGeneratorEdgeEndpoint(generatorId, edge.id, "to", edge.to);
}

function normalizeGeneratorDocument(
  generator: TokenGeneratorDocument,
): TokenGeneratorDocument {
  if (!generator || typeof generator !== "object") {
    throw new Error("Invalid generator document: expected an object");
  }
  if (!generator.id || !generator.name || !generator.targetCollectionId) {
    throw new Error(
      "Invalid generator document: id, name, and targetCollectionId are required",
    );
  }
  if (!Array.isArray(generator.nodes) || !Array.isArray(generator.edges)) {
    throw new Error(
      `Invalid generator document "${generator.id}": nodes and edges must be arrays`,
    );
  }
  if (!generator.viewport) {
    throw new Error(
      `Invalid generator document "${generator.id}": viewport is required`,
    );
  }
  validateGeneratorViewport(generator.id, generator.viewport);
  generator.nodes.forEach((node) => validateGeneratorNode(generator.id, node));
  generator.edges.forEach((edge) => validateGeneratorEdge(generator.id, edge));
  if (!generator.createdAt || !generator.updatedAt) {
    throw new Error(
      `Invalid generator document "${generator.id}": createdAt and updatedAt are required`,
    );
  }
  return {
    id: String(generator.id),
    name: String(generator.name),
    targetCollectionId: String(generator.targetCollectionId),
    nodes: generator.nodes,
    edges: generator.edges,
    viewport: generator.viewport,
    createdAt: generator.createdAt,
    updatedAt: generator.updatedAt,
    lastAppliedAt: generator.lastAppliedAt,
    lastApplyDiagnostics: generator.lastApplyDiagnostics,
    outputHashes: generator.outputHashes,
  };
}

function cloneGenerator(
  generator: TokenGeneratorDocument,
): TokenGeneratorDocument {
  return structuredClone(generator);
}
