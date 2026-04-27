import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  createDefaultTokenGraphDocument,
  evaluateTokenGraphDocument,
  readTokenModeValuesForCollection,
  readGraphProvenance,
  stableStringify,
  tokenFromGraphOutput,
  type Token,
  type TokenCollection,
  type TokenGraphDocument,
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
      try {
        if (tokens.length > 0) {
          await tokenStore.batchUpsertTokens(graph.targetCollectionId, tokens, "overwrite");
        }
        if (deleted.length > 0) {
          await tokenStore.deleteTokens(graph.targetCollectionId, deleted);
        }
      } catch (error) {
        await restoreSnapshot(tokenStore, graph.targetCollectionId, beforeSnapshot);
        throw error;
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
        });
        operationId = operation.id;
      }

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

      return {
        preview,
        operationId,
        created,
        updated,
        deleted,
      };
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
      await tokenStore.updateToken(collectionId, tokenPath, nextToken);
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
  } else if (template === "spacing") {
    base.nodes = scaleTemplateNodes("dimension", "Spacing steps", "spacing.scale", [
      scaleItem("0", { value: 0, unit: "px" }, "dimension"),
      scaleItem("2", { value: 2, unit: "px" }, "dimension"),
      scaleItem("4", { value: 4, unit: "px" }, "dimension"),
      scaleItem("8", { value: 8, unit: "px" }, "dimension"),
      scaleItem("12", { value: 12, unit: "px" }, "dimension"),
      scaleItem("16", { value: 16, unit: "px" }, "dimension"),
      scaleItem("24", { value: 24, unit: "px" }, "dimension"),
      scaleItem("32", { value: 32, unit: "px" }, "dimension"),
    ]);
    base.edges = scaleTemplateEdges();
  } else if (template === "type") {
    base.nodes = scaleTemplateNodes("dimension", "Type scale", "font.size", [
      scaleItem("xs", { value: 12, unit: "px" }, "dimension"),
      scaleItem("sm", { value: 14, unit: "px" }, "dimension"),
      scaleItem("md", { value: 16, unit: "px" }, "dimension"),
      scaleItem("lg", { value: 20, unit: "px" }, "dimension"),
      scaleItem("xl", { value: 24, unit: "px" }, "dimension"),
      scaleItem("2xl", { value: 32, unit: "px" }, "dimension"),
      scaleItem("3xl", { value: 40, unit: "px" }, "dimension"),
      scaleItem("4xl", { value: 48, unit: "px" }, "dimension"),
    ]);
    base.edges = scaleTemplateEdges();
  } else if (template === "radius") {
    base.nodes = scaleTemplateNodes("dimension", "Radius scale", "radius", [
      scaleItem("none", { value: 0, unit: "px" }, "dimension"),
      scaleItem("xs", { value: 2, unit: "px" }, "dimension"),
      scaleItem("sm", { value: 4, unit: "px" }, "dimension"),
      scaleItem("md", { value: 8, unit: "px" }, "dimension"),
      scaleItem("lg", { value: 12, unit: "px" }, "dimension"),
      scaleItem("full", { value: 999, unit: "px" }, "dimension"),
    ]);
    base.edges = scaleTemplateEdges();
  } else if (template === "opacity") {
    base.nodes = scaleTemplateNodes("number", "Opacity scale", "opacity", [
      scaleItem("0", 0, "number"),
      scaleItem("8", 0.08, "number"),
      scaleItem("16", 0.16, "number"),
      scaleItem("32", 0.32, "number"),
      scaleItem("64", 0.64, "number"),
      scaleItem("100", 1, "number"),
    ]);
    base.edges = scaleTemplateEdges();
  } else if (template === "zIndex") {
    base.nodes = scaleTemplateNodes("number", "Z-index scale", "z", [
      scaleItem("base", 0, "number"),
      scaleItem("raised", 10, "number"),
      scaleItem("sticky", 100, "number"),
      scaleItem("overlay", 1000, "number"),
      scaleItem("modal", 1100, "number"),
      scaleItem("toast", 1200, "number"),
    ]);
    base.edges = scaleTemplateEdges();
  } else if (template === "formula") {
    base.nodes = [
      {
        id: "source",
        kind: "literal",
        label: "Input value",
        position: { x: 90, y: 140 },
        data: { type: "number", value: 8 },
      },
      {
        id: "scale",
        kind: "formula",
        label: "Formula",
        position: { x: 360, y: 140 },
        data: { expression: "value * 2" },
      },
      {
        id: "output",
        kind: "output",
        label: "Output token",
        position: { x: 640, y: 140 },
        data: { path: "formula.output", tokenType: "number" },
      },
    ];
    base.edges = [
      { id: "source-scale", from: { nodeId: "source", port: "value" }, to: { nodeId: "scale", port: "value" } },
      { id: "scale-output", from: { nodeId: "scale", port: "value" }, to: { nodeId: "output", port: "value" } },
    ];
  } else if (template === "shadow") {
    base.nodes = scaleTemplateNodes("string", "Shadow aliases", "shadow", [
      scaleItem("sm", shadowValue(0, 1, 2, 0), "shadow"),
      scaleItem("md", shadowValue(0, 4, 12, 0), "shadow"),
      scaleItem("lg", shadowValue(0, 12, 32, 0), "shadow"),
    ]);
    base.edges = scaleTemplateEdges();
  }
  base.createdAt = base.createdAt || now;
  base.updatedAt = now;
  return normalizeGraphDocument(base);
}

function scaleTemplateNodes(
  type: string,
  label: string,
  pathPrefix: string,
  items: unknown[],
): TokenGraphDocument["nodes"] {
  return [
    {
      id: "steps",
      kind: "list",
      label,
      position: { x: 120, y: 150 },
      data: { type, items },
    },
    {
      id: "output",
      kind: "groupOutput",
      label: "Output tokens",
      position: { x: 430, y: 150 },
      data: { pathPrefix },
    },
  ];
}

function scaleItem(key: string, value: unknown, type: string) {
  return { key, label: key, value, type };
}

function shadowValue(x: number, y: number, blur: number, spread: number) {
  return {
    color: "#00000024",
    offsetX: { value: x, unit: "px" },
    offsetY: { value: y, unit: "px" },
    blur: { value: blur, unit: "px" },
    spread: { value: spread, unit: "px" },
    type: "dropShadow",
  };
}

function scaleTemplateEdges(): TokenGraphDocument["edges"] {
  return [
    {
      id: "steps-output",
      from: { nodeId: "steps", port: "value" },
      to: { nodeId: "output", port: "value" },
    },
  ];
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
