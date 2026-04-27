import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  createDefaultTokenGraphDocument,
  DEFAULT_BORDER_RADIUS_SCALE_CONFIG,
  DEFAULT_COLOR_RAMP_CONFIG,
  DEFAULT_CUSTOM_SCALE_CONFIG,
  DEFAULT_OPACITY_SCALE_CONFIG,
  DEFAULT_SHADOW_SCALE_CONFIG,
  DEFAULT_SPACING_SCALE_CONFIG,
  DEFAULT_TYPE_SCALE_CONFIG,
  DEFAULT_Z_INDEX_SCALE_CONFIG,
  evaluateTokenGraphDocument,
  readTokenModeValuesForCollection,
  readGraphProvenance,
  stableStringify,
  tokenFromGraphOutput,
  type Token,
  type TokenCollection,
  type TokenGraphDocument,
  type TokenGraphDocumentNode,
  type TokenGraphPreviewResult,
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

interface GraphStoreFile {
  $graphs: TokenGraphDocument[];
}

export interface GraphCreateInput {
  name?: string;
  targetCollectionId: string;
  template?: "blank" | "colorRamp" | "spacing" | "type" | "radius" | "opacity" | "shadow" | "zIndex" | "formula";
}

export type GraphUpdateInput = Partial<
  Pick<TokenGraphDocument, "name" | "targetCollectionId" | "nodes" | "edges" | "viewport">
>;

export interface GraphApplyResult {
  preview: TokenGraphPreviewResult;
  operationId?: string;
  created: string[];
  updated: string[];
  deleted: string[];
}

export interface GraphStatusItem {
  graph: TokenGraphDocument;
  preview: TokenGraphPreviewResult;
  stale: boolean;
  unapplied: boolean;
  blocking: boolean;
  managedTokenCount: number;
}

export interface GraphOwnedTokenRef {
  collectionId: string;
  path: string;
  token: Token;
}

export interface GraphCollectionDependencyMeta {
  id: string;
  name: string;
  referencedCollections: string[];
}

export class TokenGraphService {
  readonly filePath: string;
  readonly lock = new PromiseChainLock();
  private graphs = new Map<string, TokenGraphDocument>();

  constructor(tokenDir: string) {
    this.filePath = path.join(path.resolve(tokenDir), "$graphs.json");
  }

  async initialize(): Promise<void> {
    await this.reloadFromDisk();
  }

  async reloadFromDisk(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as GraphStoreFile;
      const graphs = Array.isArray(parsed.$graphs) ? parsed.$graphs : [];
      this.graphs = new Map(
        graphs
          .filter((graph) => typeof graph?.id === "string")
          .map((graph) => [graph.id, normalizeGraphDocument(graph)]),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.graphs.clear();
        return;
      }
      throw error;
    }
  }

  async list(): Promise<TokenGraphDocument[]> {
    return Array.from(this.graphs.values()).map(cloneGraph);
  }

  async getById(id: string): Promise<TokenGraphDocument | undefined> {
    const graph = this.graphs.get(id);
    return graph ? cloneGraph(graph) : undefined;
  }

  async snapshot(): Promise<TokenGraphDocument[]> {
    return this.list();
  }

  async restore(graphs: TokenGraphDocument[]): Promise<void> {
    await this.lock.withLock(async () => {
      this.graphs = new Map(
        graphs.map((graph) => {
          const normalized = normalizeGraphDocument(graph);
          return [normalized.id, normalized];
        }),
      );
      await this.persist();
    });
  }

  async create(input: GraphCreateInput): Promise<TokenGraphDocument> {
    return this.lock.withLock(async () => {
      const graph = buildTemplateGraph(input);
      this.graphs.set(graph.id, graph);
      await this.persist();
      return cloneGraph(graph);
    });
  }

  async update(id: string, input: GraphUpdateInput, tokenStore?: TokenStore): Promise<TokenGraphDocument> {
    return this.lock.withLock(async () => {
      const existing = this.graphs.get(id);
      if (!existing) throw new NotFoundError(`Graph "${id}" not found`);
      if (
        tokenStore &&
        input.targetCollectionId &&
        input.targetCollectionId !== existing.targetCollectionId
      ) {
        const owned = this.findOwnedTokenRefs(id, tokenStore);
        if (owned.length > 0) {
          throw new ConflictError(
            `Graph "${existing.name}" already manages ${owned.length} token${owned.length === 1 ? "" : "s"}. Detach or delete those outputs before changing the target collection.`,
          );
        }
      }
      const updated = normalizeGraphDocument({
        ...existing,
        ...input,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      });
      this.graphs.set(id, updated);
      await this.persist();
      return cloneGraph(updated);
    });
  }

  async delete(id: string, tokenStore?: TokenStore): Promise<boolean> {
    return this.lock.withLock(async () => {
      if (tokenStore) {
        const ownedPaths = this.findOwnedTokenPaths(id, tokenStore);
        if (ownedPaths.length > 0) {
          throw new ConflictError(
            `Graph "${id}" still manages ${ownedPaths.length} token${ownedPaths.length === 1 ? "" : "s"}. Delete or detach those outputs before deleting the graph.`,
          );
        }
      }
      const deleted = this.graphs.delete(id);
      if (deleted) await this.persist();
      return deleted;
    });
  }

  async preview(
    id: string,
    collectionService: CollectionService,
    tokenStore: TokenStore,
  ): Promise<TokenGraphPreviewResult> {
    const graph = this.graphs.get(id);
    if (!graph) throw new NotFoundError(`Graph "${id}" not found`);
    const preview = await this.buildPreview(graph, collectionService, tokenStore);
    await this.updatePreviewMetadata(id, preview);
    return preview;
  }

  async status(
    collectionService: CollectionService,
    tokenStore: TokenStore,
  ): Promise<GraphStatusItem[]> {
    const graphs = Array.from(this.graphs.values()).map(cloneGraph);
    const items: GraphStatusItem[] = [];
    for (const graph of graphs) {
      const preview = await this.buildPreview(graph, collectionService, tokenStore);
      const previewHashes = Object.fromEntries(
        preview.outputs.map((output) => [output.path, output.hash]),
      );
      const storedHashes = graph.outputHashes ?? {};
      const stale =
        Boolean(graph.lastAppliedAt) &&
        (!sameStringRecord(previewHashes, storedHashes) ||
          preview.outputs.some((output) => output.change !== "unchanged"));
      const unapplied = !graph.lastAppliedAt && preview.outputs.length > 0;
      items.push({
        graph,
        preview,
        stale,
        unapplied,
        blocking:
          preview.blocking ||
          stale ||
          preview.outputs.some((output) => output.collision),
        managedTokenCount: this.findOwnedTokenRefs(graph.id, tokenStore).length,
      });
    }
    return items;
  }

  async apply(
    id: string,
    collectionService: CollectionService,
    tokenStore: TokenStore,
    operationLog: OperationLog,
  ): Promise<GraphApplyResult> {
    return this.lock.withLock(async () => {
      const graph = this.graphs.get(id);
      if (!graph) throw new NotFoundError(`Graph "${id}" not found`);

      const preview = await this.buildPreview(graph, collectionService, tokenStore);
      if (preview.blocking) {
        throw new BadRequestError("Fix graph diagnostics before applying outputs.");
      }
      const manualCollisions = preview.outputs.filter((output) => output.collision);
      if (manualCollisions.length > 0) {
        throw new ConflictError(
          `Graph would overwrite manual tokens: ${manualCollisions.map((output) => output.path).join(", ")}`,
        );
      }

      const state = await collectionService.loadState();
      const targetCollection = state.collections.find(
        (collection) => collection.id === graph.targetCollectionId,
      );
      if (!targetCollection) {
        throw new NotFoundError(`Collection "${graph.targetCollectionId}" not found`);
      }

      const targetOutputPaths = new Set(preview.outputs.map((output) => output.path));
      const currentOwnedRefs = this.findOwnedTokenRefs(
        graph.id,
        tokenStore,
      );
      const ownedOutsideTarget = currentOwnedRefs.filter(
        (entry) => entry.collectionId !== graph.targetCollectionId,
      );
      if (ownedOutsideTarget.length > 0) {
        throw new ConflictError(
          `Graph still owns outputs in another collection: ${ownedOutsideTarget.map((entry) => `${entry.collectionId}/${entry.path}`).join(", ")}. Detach those tokens before applying.`,
        );
      }
      const deleted = currentOwnedRefs
        .filter((entry) => !targetOutputPaths.has(entry.path))
        .map((entry) => entry.path);
      const modifiedDeleted = currentOwnedRefs.filter(
        (entry) =>
          !targetOutputPaths.has(entry.path) &&
          !this.tokenStillMatchesAppliedGraphOutput(graph, targetCollection, entry.token),
      );
      if (modifiedDeleted.length > 0) {
        throw new ConflictError(
          `Graph would delete manually changed tokens: ${modifiedDeleted.map((entry) => entry.path).join(", ")}. Detach those tokens before applying.`,
        );
      }
      const touchedPaths = [...new Set([...preview.outputs.map((output) => output.path), ...deleted])];
      const beforeSnapshot = await snapshotPaths(tokenStore, graph.targetCollectionId, touchedPaths);
      const graphBefore = cloneGraph(graph);
      const graphStateBefore = Array.from(this.graphs.values()).map(cloneGraph);

      const tokens = preview.outputs.map((output) => ({
        path: output.path,
        token: tokenFromGraphOutput(
          targetCollection,
          output,
          {
            graphId: graph.id,
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
          await tokenStore.batchUpsertTokens(graph.targetCollectionId, tokens, "overwrite");
        }
        if (deleted.length > 0) {
          tokenWritesStarted = true;
          await tokenStore.deleteTokens(graph.targetCollectionId, deleted);
        }

        const afterSnapshot = await snapshotPaths(tokenStore, graph.targetCollectionId, touchedPaths);
        const changedKeys = listChangedSnapshotKeys(beforeSnapshot, afterSnapshot);
        const changedPaths = listChangedSnapshotTokenPaths(beforeSnapshot, afterSnapshot);
        const created = preview.outputs
          .filter((output) => output.change === "created")
          .map((output) => output.path);
        const updated = preview.outputs
          .filter((output) => output.change === "updated")
          .map((output) => output.path);

        const updatedGraph = normalizeGraphDocument({
          ...graph,
          lastAppliedAt: new Date().toISOString(),
          lastApplyDiagnostics: preview.diagnostics,
          outputHashes: Object.fromEntries(
            preview.outputs.map((output) => [output.path, output.hash]),
          ),
          updatedAt: new Date().toISOString(),
        });
        this.graphs.set(graph.id, updatedGraph);
        await this.persist();

        let operationId: string | undefined;
        if (changedKeys.length > 0) {
          const operation = await operationLog.record({
            type: "graph-apply",
            description: `Apply graph "${graph.name}"`,
            resourceId: graph.id,
            affectedPaths: changedPaths,
            beforeSnapshot: pickSnapshotEntries(beforeSnapshot, changedKeys),
            afterSnapshot: pickSnapshotEntries(afterSnapshot, changedKeys),
            metadata: {
              kind: "graph-apply",
              graphId: graph.id,
              graphName: graph.name,
              targetCollectionId: graph.targetCollectionId,
            },
            rollbackSteps: [
              {
                action: "restore-graphs",
                graphs: graphStateBefore,
              },
            ],
          });
          operationId = operation.id;
        }

        return {
          preview,
          operationId,
          created,
          updated,
          deleted,
        };
      } catch (error) {
        if (tokenWritesStarted) {
          await restoreSnapshot(tokenStore, graph.targetCollectionId, beforeSnapshot);
        }
        this.graphs.set(graphBefore.id, graphBefore);
        await this.persist();
        throw error;
      }
    });
  }

  async detachOutput(
    id: string,
    collectionId: string,
    tokenPath: string,
    tokenStore: TokenStore,
    operationLog: OperationLog,
  ): Promise<{ ok: true; operationId?: string }> {
    return this.lock.withLock(async () => {
      const graph = this.graphs.get(id);
      if (!graph) throw new NotFoundError(`Graph "${id}" not found`);
      const token = await tokenStore.getToken(collectionId, tokenPath);
      if (!token) {
        throw new NotFoundError(`Token "${tokenPath}" not found in collection "${collectionId}"`);
      }
      const provenance = readGraphProvenance(token);
      if (provenance?.graphId !== id) {
        throw new BadRequestError(`Token "${tokenPath}" is not managed by graph "${graph.name}".`);
      }
      const beforeSnapshot = await snapshotPaths(tokenStore, collectionId, [tokenPath]);
      const nextToken = structuredClone(token);
      const extensions = { ...(nextToken.$extensions ?? {}) };
      const tokenmanager =
        extensions.tokenmanager &&
        typeof extensions.tokenmanager === "object" &&
        !Array.isArray(extensions.tokenmanager)
          ? { ...(extensions.tokenmanager as Record<string, unknown>) }
          : {};
      delete tokenmanager.graph;
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
        const afterSnapshot = await snapshotPaths(tokenStore, collectionId, [tokenPath]);
        const changedKeys = listChangedSnapshotKeys(beforeSnapshot, afterSnapshot);
        let operationId: string | undefined;
        if (changedKeys.length > 0) {
          const operation = await operationLog.record({
            type: "graph-detach",
            description: `Detach "${tokenPath}" from graph "${graph.name}"`,
            resourceId: graph.id,
            affectedPaths: [tokenPath],
            beforeSnapshot: pickSnapshotEntries(beforeSnapshot, changedKeys),
            afterSnapshot: pickSnapshotEntries(afterSnapshot, changedKeys),
            metadata: {
              kind: "graph-detach",
              graphId: graph.id,
              graphName: graph.name,
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

  async renameCollectionId(oldCollectionId: string, newCollectionId: string): Promise<number> {
    return this.lock.withLock(async () => {
      let changed = 0;
      const nextGraphs = Array.from(this.graphs.values()).map((graph) => {
        let graphChanged = false;
        const nodes = graph.nodes.map((node) => {
          if (node.data.collectionId !== oldCollectionId) return node;
          graphChanged = true;
          return {
            ...node,
            data: {
              ...node.data,
              collectionId: newCollectionId,
            },
          };
        });
        const targetCollectionId =
          graph.targetCollectionId === oldCollectionId ? newCollectionId : graph.targetCollectionId;
        graphChanged = graphChanged || targetCollectionId !== graph.targetCollectionId;
        if (!graphChanged) return graph;
        changed += 1;
        return normalizeGraphDocument({
          ...graph,
          targetCollectionId,
          nodes,
          updatedAt: new Date().toISOString(),
        });
      });
      if (changed > 0) {
        this.graphs = new Map(nextGraphs.map((graph) => [graph.id, graph]));
        await this.persist();
      }
      return changed;
    });
  }

  async deleteCollectionId(collectionId: string): Promise<number> {
    return this.lock.withLock(async () => {
      const nextGraphs = Array.from(this.graphs.values()).filter(
        (graph) => graph.targetCollectionId !== collectionId,
      );
      const deleted = this.graphs.size - nextGraphs.length;
      if (deleted > 0) {
        this.graphs = new Map(nextGraphs.map((graph) => [graph.id, graph]));
        await this.persist();
      }
      return deleted;
    });
  }

  getCollectionReferenceCount(collectionIds: Iterable<string>): number {
    const collectionIdSet = new Set(collectionIds);
    let count = 0;
    for (const graph of this.graphs.values()) {
      if (collectionIdSet.has(graph.targetCollectionId)) {
        count += 1;
        continue;
      }
      if (
        graph.nodes.some(
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

  listCollectionDependencyMeta(): GraphCollectionDependencyMeta[] {
    return Array.from(this.graphs.values())
      .map((graph) => ({
        id: graph.id,
        name: graph.name,
        referencedCollections: [
          ...new Set([
            graph.targetCollectionId,
            ...graph.nodes
              .map((node) => node.data.collectionId)
              .filter((collectionId): collectionId is string => typeof collectionId === "string"),
          ]),
        ].filter(Boolean),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  assertNoCollectionReferences(collectionIds: Iterable<string>): void {
    const count = this.getCollectionReferenceCount(collectionIds);
    if (count > 0) {
      throw new ConflictError(
        `Cannot delete collection while ${count} graph document${count === 1 ? "" : "s"} still reference it. Delete or retarget those graphs first.`,
      );
    }
  }

  private async buildPreview(
    graph: TokenGraphDocument,
    collectionService: CollectionService,
    tokenStore: TokenStore,
  ): Promise<TokenGraphPreviewResult> {
    const state = await collectionService.loadState();
    const tokensByCollection: Record<string, Record<string, Token>> = {};
    for (const collection of state.collections) {
      tokensByCollection[collection.id] =
        await tokenStore.getFlatTokensForCollection(collection.id);
    }
    return evaluateTokenGraphDocument({
      document: graph,
      collections: state.collections as TokenCollection[],
      tokensByCollection,
    });
  }

  private async updatePreviewMetadata(
    id: string,
    preview: TokenGraphPreviewResult,
  ): Promise<void> {
    await this.lock.withLock(async () => {
      const graph = this.graphs.get(id);
      if (!graph) return;
      this.graphs.set(id, {
        ...graph,
        lastPreviewAt: preview.previewedAt,
        lastPreviewDiagnostics: preview.diagnostics,
        updatedAt: graph.updatedAt,
      });
      await this.persist();
    });
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const body: GraphStoreFile = {
      $graphs: Array.from(this.graphs.values()),
    };
    await fs.writeFile(tmp, JSON.stringify(body, null, 2), "utf-8");
    await fs.rename(tmp, this.filePath);
  }

  private findOwnedTokenPaths(
    graphId: string,
    tokenStore: TokenStore,
    collectionId?: string,
  ): string[] {
    return this.findOwnedTokenRefs(graphId, tokenStore, collectionId).map(
      (entry) => entry.path,
    );
  }

  findOwnedTokenRefs(
    graphId: string,
    tokenStore: TokenStore,
    collectionId?: string,
  ): GraphOwnedTokenRef[] {
    return tokenStore
      .getAllFlatTokens()
      .filter(
        (entry) =>
          (!collectionId || entry.collectionId === collectionId) &&
          readGraphProvenance(entry.token)?.graphId === graphId,
      )
      .map((entry) => ({
        collectionId: entry.collectionId,
        path: entry.path,
        token: entry.token,
      }));
  }

  private tokenStillMatchesAppliedGraphOutput(
    graph: TokenGraphDocument,
    targetCollection: TokenCollection,
    token: Token,
  ): boolean {
    const provenance = readGraphProvenance(token);
    if (!provenance || provenance.graphId !== graph.id) {
      return false;
    }
    if (tokenHasManualGraphOutputMetadata(token)) {
      return false;
    }
    const currentHash = stableStringify({
      documentId: graph.id,
      nodeId: provenance.outputNodeId,
      outputKey: provenance.outputKey,
      modeValues: readTokenModeValuesForCollection(token, targetCollection),
      type: token.$type,
    });
    return currentHash === provenance.lastAppliedHash;
  }
}

function tokenHasManualGraphOutputMetadata(token: Token): boolean {
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
      if (tokenmanagerKey !== "graph" && tokenmanagerKey !== "modes") {
        return true;
      }
    }
  }
  return false;
}

function sameStringRecord(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
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

function buildTemplateGraph(input: GraphCreateInput): TokenGraphDocument {
  const base = createDefaultTokenGraphDocument(
    input.targetCollectionId,
    input.name ?? templateName(input.template),
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
  return normalizeGraphDocument(base);
}

function generatedTemplate(
  template: NonNullable<GraphCreateInput["template"]>,
): Pick<TokenGraphDocument, "nodes" | "edges"> {
  const descriptor = graphTemplateDescriptor(template);
  const nodes: TokenGraphDocumentNode[] = [];
  if (descriptor.source) {
    nodes.push({
      id: "source",
      kind: "literal",
      label: descriptor.source.label,
      position: { x: 90, y: 150 },
      data: descriptor.source.data,
    });
  }
  nodes.push({
    id: "generation",
    kind: descriptor.kind,
    label: descriptor.label,
    position: { x: descriptor.source ? 360 : 130, y: 140 },
    data: { ...(descriptor.config as Record<string, unknown>) },
  });
  nodes.push({
    id: "output",
    kind: "groupOutput",
    label: "Output tokens",
    position: { x: descriptor.source ? 650 : 430, y: 150 },
    data: { pathPrefix: descriptor.pathPrefix },
  });
  return {
    nodes,
    edges: [
      ...(descriptor.source
        ? [
            {
              id: "source-generation",
              from: { nodeId: "source", port: "value" },
              to: { nodeId: "generation", port: "value" },
            },
          ]
        : []),
      {
        id: "generation-output",
        from: { nodeId: "generation", port: "value" },
        to: { nodeId: "output", port: "value" },
      },
    ],
  };
}

function graphTemplateDescriptor(
  template: NonNullable<GraphCreateInput["template"]>,
): {
  kind: TokenGraphDocumentNode["kind"];
  label: string;
  pathPrefix: string;
  config: unknown;
  source?: { label: string; data: Record<string, unknown> };
} {
  if (template === "spacing") {
    return {
      kind: "spacingScale",
      label: "Spacing scale",
      pathPrefix: "spacing",
      config: DEFAULT_SPACING_SCALE_CONFIG,
      source: { label: "Base size", data: { type: "dimension", value: 4, unit: "px" } },
    };
  }
  if (template === "type") {
    return {
      kind: "typeScale",
      label: "Type scale",
      pathPrefix: "fontSize",
      config: DEFAULT_TYPE_SCALE_CONFIG,
      source: { label: "Base font size", data: { type: "dimension", value: 16, unit: "px" } },
    };
  }
  if (template === "radius") {
    return {
      kind: "borderRadiusScale",
      label: "Radius scale",
      pathPrefix: "radius",
      config: DEFAULT_BORDER_RADIUS_SCALE_CONFIG,
      source: { label: "Base radius", data: { type: "dimension", value: 4, unit: "px" } },
    };
  }
  if (template === "opacity") {
    return {
      kind: "opacityScale",
      label: "Opacity scale",
      pathPrefix: "opacity",
      config: DEFAULT_OPACITY_SCALE_CONFIG,
    };
  }
  if (template === "shadow") {
    return {
      kind: "shadowScale",
      label: "Shadow scale",
      pathPrefix: "shadow",
      config: DEFAULT_SHADOW_SCALE_CONFIG,
    };
  }
  if (template === "zIndex") {
    return {
      kind: "zIndexScale",
      label: "Z-index scale",
      pathPrefix: "zIndex",
      config: DEFAULT_Z_INDEX_SCALE_CONFIG,
    };
  }
  if (template === "formula") {
    return {
      kind: "customScale",
      label: "Formula scale",
      pathPrefix: "scale",
      config: DEFAULT_CUSTOM_SCALE_CONFIG,
      source: { label: "Base number", data: { type: "number", value: 8 } },
    };
  }
  return {
    kind: "colorRamp",
    label: "Palette",
    pathPrefix: "color.brand",
    config: DEFAULT_COLOR_RAMP_CONFIG,
    source: { label: "Base color", data: { type: "color", value: "#6366f1" } },
  };
}

function templateName(template: GraphCreateInput["template"]): string {
  if (!template || template === "colorRamp") return "Color ramp";
  if (template === "spacing") return "Spacing scale";
  if (template === "type") return "Type scale";
  if (template === "radius") return "Radius scale";
  if (template === "opacity") return "Opacity scale";
  if (template === "shadow") return "Shadow scale";
  if (template === "zIndex") return "Z-index scale";
  if (template === "formula") return "Formula graph";
  return "New token graph";
}

function normalizeGraphDocument(graph: TokenGraphDocument): TokenGraphDocument {
  const now = new Date().toISOString();
  return {
    id: String(graph.id || randomUUID()),
    name: String(graph.name || "Untitled graph"),
    targetCollectionId: String(graph.targetCollectionId || ""),
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
    viewport: graph.viewport ?? { x: 0, y: 0, zoom: 1 },
    createdAt: graph.createdAt || now,
    updatedAt: graph.updatedAt || now,
    lastPreviewAt: graph.lastPreviewAt,
    lastAppliedAt: graph.lastAppliedAt,
    lastPreviewDiagnostics: graph.lastPreviewDiagnostics,
    lastApplyDiagnostics: graph.lastApplyDiagnostics,
    outputHashes: graph.outputHashes,
  };
}

function cloneGraph(graph: TokenGraphDocument): TokenGraphDocument {
  return structuredClone(graph);
}
