import {
  buildTokenExtensionsWithCollectionModes,
  readTokenCollectionModeValues,
  readTokenModeValuesForCollection,
} from './collections.js';
import {
  opAdd,
  opAlpha,
  opDarken,
  opInvertLightness,
  opLighten,
  opMix,
  opScaleBy,
} from './derivation-ops.js';
import { evalExpr, substituteVars } from './eval-expr.js';
import { runColorRampGenerator } from './generator-engine.js';
import type { ColorRampConfig } from './generator-types.js';
import { stableStringify } from './stable-stringify.js';
import { isReference, parseReference } from './dtcg-types.js';
import type {
  Token,
  TokenCollection,
  TokenReference,
  TokenType,
  TokenValue,
} from './types.js';

export type TokenGraphPortType =
  | 'color'
  | 'number'
  | 'dimension'
  | 'string'
  | 'boolean'
  | 'token'
  | 'list'
  | 'any';

export type TokenGraphNodeKind =
  | 'tokenInput'
  | 'literal'
  | 'math'
  | 'color'
  | 'formula'
  | 'colorRamp'
  | 'list'
  | 'alias'
  | 'output'
  | 'groupOutput'
  | 'preview';

export interface TokenGraphViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface TokenGraphPosition {
  x: number;
  y: number;
}

export interface TokenGraphNode {
  id: string;
  kind: TokenGraphNodeKind;
  label: string;
  position: TokenGraphPosition;
  data: Record<string, unknown>;
}

export interface TokenGraphEdge {
  id: string;
  from: {
    nodeId: string;
    port: string;
  };
  to: {
    nodeId: string;
    port: string;
  };
}

export interface GraphOutputProvenance {
  graphId: string;
  outputNodeId: string;
  outputKey: string;
  lastAppliedHash: string;
}

export interface TokenGraphDocument {
  id: string;
  name: string;
  targetCollectionId: string;
  nodes: TokenGraphNode[];
  edges: TokenGraphEdge[];
  viewport: TokenGraphViewport;
  createdAt: string;
  updatedAt: string;
  lastPreviewAt?: string;
  lastAppliedAt?: string;
  lastPreviewDiagnostics?: TokenGraphDiagnostic[];
  lastApplyDiagnostics?: TokenGraphDiagnostic[];
  outputHashes?: Record<string, string>;
}

export interface TokenGraphDiagnostic {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface TokenGraphPreviewOutput {
  path: string;
  type: TokenType;
  modeValues: Record<string, TokenValue | TokenReference>;
  nodeId: string;
  outputKey: string;
  hash: string;
  existingToken?: Token;
  change: 'created' | 'updated' | 'unchanged';
  collision: boolean;
}

export interface TokenGraphPreviewResult {
  graphId: string;
  targetCollectionId: string;
  targetModes: string[];
  outputs: TokenGraphPreviewOutput[];
  diagnostics: TokenGraphDiagnostic[];
  blocking: boolean;
  hash: string;
  previewedAt: string;
}

export interface EvaluateTokenGraphDocumentInput {
  document: TokenGraphDocument;
  collections: TokenCollection[];
  tokensByCollection: Record<string, Record<string, Token>>;
}

type GraphRuntimeValue =
  | {
      kind: 'scalar';
      type: TokenGraphPortType;
      value: TokenValue | TokenReference;
    }
  | {
      kind: 'list';
      type: TokenGraphPortType;
      values: Array<{
        key: string;
        label: string;
        value: TokenValue | TokenReference;
        type?: TokenType;
      }>;
    };

type ModeRuntimeValues = Record<string, GraphRuntimeValue | undefined>;

const DEFAULT_COLOR_RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

export function createDefaultTokenGraphDocument(
  targetCollectionId: string,
  name = 'New token graph',
): TokenGraphDocument {
  const now = new Date().toISOString();
  const id = `graph_${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    name,
    targetCollectionId,
    nodes: [
      {
        id: 'source',
        kind: 'literal',
        label: 'Source color',
        position: { x: 80, y: 140 },
        data: { type: 'color', value: '#6366f1' },
      },
      {
        id: 'ramp',
        kind: 'colorRamp',
        label: 'Color ramp',
        position: { x: 360, y: 120 },
        data: {
          steps: DEFAULT_COLOR_RAMP_STEPS,
          lightEnd: 96,
          darkEnd: 24,
          chromaBoost: 1,
          includeSource: true,
          sourceStep: 500,
        },
      },
      {
        id: 'output',
        kind: 'groupOutput',
        label: 'Output tokens',
        position: { x: 650, y: 150 },
        data: { pathPrefix: 'color.brand' },
      },
    ],
    edges: [
      {
        id: 'source-ramp',
        from: { nodeId: 'source', port: 'value' },
        to: { nodeId: 'ramp', port: 'value' },
      },
      {
        id: 'ramp-output',
        from: { nodeId: 'ramp', port: 'steps' },
        to: { nodeId: 'output', port: 'value' },
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  };
}

export function graphProvenanceHash(
  document: TokenGraphDocument,
  outputs: TokenGraphPreviewOutput[],
): string {
  return stableStringify({
    graphId: document.id,
    targetCollectionId: document.targetCollectionId,
    nodes: document.nodes,
    edges: document.edges,
    outputs: outputs.map((output) => ({
      path: output.path,
      type: output.type,
      modeValues: output.modeValues,
      outputKey: output.outputKey,
    })),
  });
}

export function tokenFromGraphOutput(
  collection: TokenCollection,
  output: TokenGraphPreviewOutput,
  provenance: GraphOutputProvenance,
  existingToken?: Token,
): Token {
  const token: Token = existingToken ? cloneToken(existingToken) : {
    $value: output.modeValues[collection.modes[0]?.name ?? ''] ?? '',
    $type: output.type,
  };
  token.$value = output.modeValues[collection.modes[0]?.name ?? ''] ?? '';
  token.$type = output.type;
  const tokenmanager =
    token.$extensions?.tokenmanager &&
    typeof token.$extensions.tokenmanager === 'object' &&
    !Array.isArray(token.$extensions.tokenmanager)
      ? { ...(token.$extensions.tokenmanager as Record<string, unknown>) }
      : {};
  token.$extensions = {
    ...(token.$extensions ?? {}),
    tokenmanager: {
      ...tokenmanager,
      graph: provenance,
    },
  };
  const nextModes = readTokenCollectionModeValues(token);
  const secondaryModeValues = Object.fromEntries(
    collection.modes
      .slice(1)
      .map((mode) => [mode.name, output.modeValues[mode.name]])
      .filter(([, value]) => value !== undefined),
  );
  if (Object.keys(secondaryModeValues).length > 0) {
    nextModes[collection.id] = secondaryModeValues;
  } else {
    delete nextModes[collection.id];
  }
  const nextExtensions = buildTokenExtensionsWithCollectionModes(
    token,
    nextModes,
  );
  if (nextExtensions) {
    token.$extensions = nextExtensions;
  }
  return token;
}

function cloneToken(token: Token): Token {
  return JSON.parse(JSON.stringify(token)) as Token;
}

export function readGraphProvenance(
  token: Pick<Token, '$extensions'> | undefined,
): GraphOutputProvenance | null {
  const raw = token?.$extensions?.tokenmanager?.graph;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (
    typeof record.graphId !== 'string' ||
    typeof record.outputNodeId !== 'string' ||
    typeof record.outputKey !== 'string' ||
    typeof record.lastAppliedHash !== 'string'
  ) {
    return null;
  }
  return {
    graphId: record.graphId,
    outputNodeId: record.outputNodeId,
    outputKey: record.outputKey,
    lastAppliedHash: record.lastAppliedHash,
  };
}

export function evaluateTokenGraphDocument({
  document,
  collections,
  tokensByCollection,
}: EvaluateTokenGraphDocumentInput): TokenGraphPreviewResult {
  const diagnostics: TokenGraphDiagnostic[] = [];
  const targetCollection = collections.find(
    (collection) => collection.id === document.targetCollectionId,
  );
  const previewedAt = new Date().toISOString();

  if (!targetCollection) {
    diagnostics.push({
      id: 'missing-target-collection',
      severity: 'error',
      message: `Target collection "${document.targetCollectionId}" no longer exists.`,
    });
    return emptyPreview(document, diagnostics, previewedAt);
  }

  const modeNames = targetCollection.modes.map((mode) => mode.name);
  if (modeNames.length === 0) {
    diagnostics.push({
      id: 'missing-target-modes',
      severity: 'error',
      message: `Target collection "${targetCollection.id}" has no modes.`,
    });
    return emptyPreview(document, diagnostics, previewedAt);
  }

  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  for (const edge of document.edges) {
    if (!nodeById.has(edge.from.nodeId) || !nodeById.has(edge.to.nodeId)) {
      diagnostics.push({
        id: `broken-edge-${edge.id}`,
        severity: 'error',
        edgeId: edge.id,
        message: 'This connection points to a node that no longer exists.',
      });
    }
  }

  const cycleNodeIds = findCycleNodeIds(document);
  for (const nodeId of cycleNodeIds) {
    diagnostics.push({
      id: `cycle-${nodeId}`,
      severity: 'error',
      nodeId,
      message: 'This node participates in a cycle. Graphs must run top to bottom without loops.',
    });
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return emptyPreview(document, diagnostics, previewedAt, modeNames);
  }

  const incoming = new Map<string, TokenGraphEdge[]>();
  for (const edge of document.edges) {
    const key = `${edge.to.nodeId}:${edge.to.port}`;
    incoming.set(key, [...(incoming.get(key) ?? []), edge]);
  }

  const cache = new Map<string, ModeRuntimeValues>();
  const evaluateNode = (nodeId: string): ModeRuntimeValues => {
    const cached = cache.get(nodeId);
    if (cached) return cached;
    const node = nodeById.get(nodeId);
    if (!node) return {};
    const result = evaluateNodeForModes({
      node,
      modeNames,
      targetCollection,
      collections,
      tokensByCollection,
      input: (port) => {
        const edge = incoming.get(`${node.id}:${port}`)?.[0];
        if (!edge) return {};
        return evaluateNode(edge.from.nodeId);
      },
      diagnostics,
    });
    cache.set(nodeId, result);
    return result;
  };

  const outputs: TokenGraphPreviewOutput[] = [];
  for (const node of document.nodes) {
    if (node.kind !== 'output' && node.kind !== 'groupOutput') {
      continue;
    }
    const valuesByMode = evaluateNode(node.id);
    outputs.push(
      ...materializeOutputs({
        document,
        node,
        targetCollection,
        modeNames,
        valuesByMode,
        existingTokens: tokensByCollection[targetCollection.id] ?? {},
        diagnostics,
      }),
    );
  }

  const hash = graphProvenanceHash(document, outputs);
  return {
    graphId: document.id,
    targetCollectionId: targetCollection.id,
    targetModes: modeNames,
    outputs,
    diagnostics,
    blocking: diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    hash,
    previewedAt,
  };
}

function emptyPreview(
  document: TokenGraphDocument,
  diagnostics: TokenGraphDiagnostic[],
  previewedAt: string,
  targetModes: string[] = [],
): TokenGraphPreviewResult {
  return {
    graphId: document.id,
    targetCollectionId: document.targetCollectionId,
    targetModes,
    outputs: [],
    diagnostics,
    blocking: diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    hash: stableStringify({ graphId: document.id, diagnostics }),
    previewedAt,
  };
}

function evaluateNodeForModes({
  node,
  modeNames,
  targetCollection,
  collections,
  tokensByCollection,
  input,
  diagnostics,
}: {
  node: TokenGraphNode;
  modeNames: string[];
  targetCollection: TokenCollection;
  collections: TokenCollection[];
  tokensByCollection: Record<string, Record<string, Token>>;
  input: (port: string) => ModeRuntimeValues;
  diagnostics: TokenGraphDiagnostic[];
}): ModeRuntimeValues {
  const result: ModeRuntimeValues = {};

  for (const modeName of modeNames) {
    try {
      const source = input('value')[modeName] ?? input('source')[modeName];
      result[modeName] = evaluateNodeForMode({
        node,
        modeName,
        source,
        targetCollection,
        collections,
        tokensByCollection,
        input,
      });
    } catch (error) {
      diagnostics.push({
        id: `${node.id}-${modeName}-error`,
        severity: 'error',
        nodeId: node.id,
        message: `${node.label}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return result;
}

function evaluateNodeForMode({
  node,
  modeName,
  source,
  targetCollection,
  collections,
  tokensByCollection,
  input,
}: {
  node: TokenGraphNode;
  modeName: string;
  source: GraphRuntimeValue | undefined;
  targetCollection: TokenCollection;
  collections: TokenCollection[];
  tokensByCollection: Record<string, Record<string, Token>>;
  input: (port: string) => ModeRuntimeValues;
}): GraphRuntimeValue | undefined {
  switch (node.kind) {
    case 'literal':
      return literalValue(node);
    case 'tokenInput':
      return tokenInputValue(node, modeName, targetCollection, collections, tokensByCollection);
    case 'alias':
      return aliasValue(node);
    case 'math':
      return mathValue(node, source);
    case 'formula':
      return formulaValue(node, modeName, source, input);
    case 'color':
      return colorValue(node, source);
    case 'colorRamp':
      return colorRampValue(node, source);
    case 'list':
      return listValue(node);
    case 'output':
    case 'groupOutput':
    case 'preview':
      return source;
    default:
      return undefined;
  }
}

function literalValue(node: TokenGraphNode): GraphRuntimeValue {
  const type = String(node.data.type ?? 'string') as TokenGraphPortType;
  const raw = node.data.value;
  if (type === 'number') return { kind: 'scalar', type, value: Number(raw ?? 0) };
  if (type === 'dimension') {
    return {
      kind: 'scalar',
      type,
      value: {
        value: Number(node.data.value ?? 0),
        unit: String(node.data.unit ?? 'px') as 'px',
      },
    };
  }
  if (type === 'boolean') return { kind: 'scalar', type, value: Boolean(raw) };
  return { kind: 'scalar', type, value: String(raw ?? '') };
}

function tokenInputValue(
  node: TokenGraphNode,
  modeName: string,
  targetCollection: TokenCollection,
  collections: TokenCollection[],
  tokensByCollection: Record<string, Record<string, Token>>,
): GraphRuntimeValue {
  const path = String(node.data.path ?? '').trim();
  if (!path) throw new Error('Choose a token source.');
  const collectionId = String(node.data.collectionId ?? targetCollection.id);
  const collection = collections.find((candidate) => candidate.id === collectionId);
  const token = tokensByCollection[collectionId]?.[path];
  if (!collection || !token) {
    throw new Error(`Token "${path}" was not found in "${collectionId}".`);
  }
  const modeValues = readTokenModeValuesForCollection(token, collection);
  const fallbackMode = collection.modes[0]?.name;
  if (
    collection.id !== targetCollection.id &&
    !(modeName in modeValues)
  ) {
    throw new Error(
      `Token "${path}" is in another collection. Add matching mode names or choose a token from "${targetCollection.id}".`,
    );
  }
  const value = resolveModeValue({
    collection,
    tokenPath: path,
    value: modeValues[modeName] ?? (fallbackMode ? modeValues[fallbackMode] : token.$value),
    modeName,
    tokensByCollection,
    visited: new Set([path]),
  });
  return {
    kind: 'scalar',
    type: token.$type === 'color' || token.$type === 'dimension' || token.$type === 'number'
      ? token.$type
      : 'token',
    value: value as TokenValue | TokenReference,
  };
}

function resolveModeValue({
  collection,
  tokenPath,
  value,
  modeName,
  tokensByCollection,
  visited,
}: {
  collection: TokenCollection;
  tokenPath: string;
  value: unknown;
  modeName: string;
  tokensByCollection: Record<string, Record<string, Token>>;
  visited: Set<string>;
}): unknown {
  if (!isReference(value)) {
    return value;
  }
  const nextPath = parseReference(value);
  if (visited.has(nextPath)) {
    throw new Error(`Alias cycle while resolving "${tokenPath}".`);
  }
  const nextToken = tokensByCollection[collection.id]?.[nextPath];
  if (!nextToken) {
    throw new Error(`Alias target "${nextPath}" was not found in "${collection.id}".`);
  }
  const nextModes = readTokenModeValuesForCollection(nextToken, collection);
  const fallbackMode = collection.modes[0]?.name;
  visited.add(nextPath);
  return resolveModeValue({
    collection,
    tokenPath: nextPath,
    value: nextModes[modeName] ?? (fallbackMode ? nextModes[fallbackMode] : nextToken.$value),
    modeName,
    tokensByCollection,
    visited,
  });
}

function aliasValue(node: TokenGraphNode): GraphRuntimeValue {
  const path = String(node.data.path ?? '').trim();
  if (!path) throw new Error('Choose a token to reference.');
  return {
    kind: 'scalar',
    type: 'token',
    value: `{${path}}` as TokenReference,
  };
}

function mathValue(
  node: TokenGraphNode,
  source: GraphRuntimeValue | undefined,
): GraphRuntimeValue {
  const operation = String(node.data.operation ?? 'add');
  const amount = Number(node.data.amount ?? 0);
  const value = requireScalar(source, 'Math nodes need an input value.');
  if (operation === 'scaleBy') {
    return { kind: 'scalar', type: source?.type ?? 'number', value: opScaleBy(value as number, amount) as TokenValue };
  }
  if (operation === 'subtract') {
    return { kind: 'scalar', type: source?.type ?? 'number', value: opAdd(value as number, -amount) as TokenValue };
  }
  if (operation === 'multiply') {
    return { kind: 'scalar', type: source?.type ?? 'number', value: opScaleBy(value as number, amount) as TokenValue };
  }
  if (operation === 'divide') {
    if (amount === 0) throw new Error('Cannot divide by zero.');
    return { kind: 'scalar', type: source?.type ?? 'number', value: opScaleBy(value as number, 1 / amount) as TokenValue };
  }
  if (operation === 'clamp') {
    const min = Number(node.data.min ?? 0);
    const max = Number(node.data.max ?? 1);
    if (isDimensionLike(value)) {
      return {
        kind: 'scalar',
        type: source?.type ?? 'dimension',
        value: { ...value, value: Math.max(min, Math.min(max, value.value)) },
      };
    }
    return { kind: 'scalar', type: 'number', value: Math.max(min, Math.min(max, Number(value))) };
  }
  if (operation === 'round') {
    const precision = Number(node.data.precision ?? 0);
    const factor = 10 ** precision;
    if (isDimensionLike(value)) {
      return {
        kind: 'scalar',
        type: source?.type ?? 'dimension',
        value: { ...value, value: Math.round(value.value * factor) / factor },
      };
    }
    return { kind: 'scalar', type: 'number', value: Math.round(Number(value) * factor) / factor };
  }
  return { kind: 'scalar', type: source?.type ?? 'number', value: opAdd(value as number, amount) as TokenValue };
}

function isDimensionLike(value: unknown): value is { value: number; unit: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    'unit' in value &&
    typeof (value as { value?: unknown }).value === 'number' &&
    typeof (value as { unit?: unknown }).unit === 'string'
  );
}

function formulaValue(
  node: TokenGraphNode,
  modeName: string,
  source: GraphRuntimeValue | undefined,
  input: (port: string) => ModeRuntimeValues,
): GraphRuntimeValue {
  const vars: Record<string, number> = {};
  if (source) {
    const scalar = requireScalar(source, 'Formula input has no value.');
    const numberValue = Number(scalar);
    vars.value = numberValue;
    vars.x = numberValue;
    vars.var1 = numberValue;
  }
  for (const [key, value] of Object.entries(node.data)) {
    if (!key.startsWith('var')) continue;
    if (key === 'var1' && source) continue;
    const portSource = input(key)[modeName];
    const scalar = portSource ? requireScalar(portSource, `Formula input "${key}" has no value.`) : Number(value ?? 0);
    vars[key] = Number(scalar);
  }
  const expression = substituteVars(String(node.data.expression ?? '0'), vars);
  return { kind: 'scalar', type: 'number', value: evalExpr(expression) };
}

function colorValue(
  node: TokenGraphNode,
  source: GraphRuntimeValue | undefined,
): GraphRuntimeValue {
  const value = String(requireScalar(source, 'Color nodes need a source color.'));
  const amount = Number(node.data.amount ?? 0);
  const operation = String(node.data.operation ?? 'lighten');
  if (operation === 'darken') return { kind: 'scalar', type: 'color', value: opDarken(value, amount) };
  if (operation === 'alpha') return { kind: 'scalar', type: 'color', value: opAlpha(value, amount) };
  if (operation === 'mix') {
    return {
      kind: 'scalar',
      type: 'color',
      value: opMix(value, String(node.data.mixWith ?? '#ffffff'), Number(node.data.ratio ?? 0.5)),
    };
  }
  if (operation === 'invertLightness') {
    return { kind: 'scalar', type: 'color', value: opInvertLightness(value, Number(node.data.chromaBoost ?? 1)) };
  }
  return { kind: 'scalar', type: 'color', value: opLighten(value, amount) };
}

function colorRampValue(
  node: TokenGraphNode,
  source: GraphRuntimeValue | undefined,
): GraphRuntimeValue {
  const sourceColor = String(requireScalar(source, 'Color ramps need a source color.'));
  const steps = Array.isArray(node.data.steps) ? node.data.steps : DEFAULT_COLOR_RAMP_STEPS;
  const config: ColorRampConfig = {
    steps: steps.map((step) => (typeof step === 'number' ? step : Number(step))).filter(Number.isFinite),
    lightEnd: Number(node.data.lightEnd ?? 96),
    darkEnd: Number(node.data.darkEnd ?? 24),
    chromaBoost: Number(node.data.chromaBoost ?? 1),
    includeSource: Boolean(node.data.includeSource ?? true),
    sourceStep: Number(node.data.sourceStep ?? 500),
  };
  const generated = runColorRampGenerator(sourceColor, config, 'output');
  return {
    kind: 'list',
    type: 'color',
    values: generated.map((item) => ({
      key: item.stepName,
      label: item.stepName,
      value: item.value as TokenValue,
      type: 'color',
    })),
  };
}

function listValue(node: TokenGraphNode): GraphRuntimeValue {
  const items = Array.isArray(node.data.items) ? node.data.items : [];
  return {
    kind: 'list',
    type: String(node.data.type ?? 'number') as TokenGraphPortType,
    values: items.map((item, index) => {
      if (isListItemRecord(item)) {
        const key = String(item.key ?? index + 1);
        return {
          key,
          label: String(item.label ?? key),
          value: item.value as TokenValue,
          type: (item.type ?? node.data.tokenType) as TokenType | undefined,
        };
      }
      return {
        key: String(index + 1),
        label: String(index + 1),
        value: item as TokenValue,
        type: node.data.tokenType as TokenType | undefined,
      };
    }),
  };
}

function isListItemRecord(item: unknown): item is Record<string, unknown> {
  return (
    typeof item === 'object' &&
    item !== null &&
    !Array.isArray(item) &&
    'value' in item
  );
}

function requireScalar(
  value: GraphRuntimeValue | undefined,
  message: string,
): TokenValue | TokenReference {
  if (!value) throw new Error(message);
  if (value.kind !== 'scalar') throw new Error('This node expects one value, but received a list.');
  return value.value;
}

function materializeOutputs({
  document,
  node,
  targetCollection,
  modeNames,
  valuesByMode,
  existingTokens,
  diagnostics,
}: {
  document: TokenGraphDocument;
  node: TokenGraphNode;
  targetCollection: TokenCollection;
  modeNames: string[];
  valuesByMode: ModeRuntimeValues;
  existingTokens: Record<string, Token>;
  diagnostics: TokenGraphDiagnostic[];
}): TokenGraphPreviewOutput[] {
  const firstModeValue = valuesByMode[modeNames[0]];
  const path = String(node.data.path ?? '').trim();
  const pathPrefix = String(node.data.pathPrefix ?? path).trim();
  if (!firstModeValue) {
    diagnostics.push({
      id: `${node.id}-missing-input`,
      severity: 'error',
      nodeId: node.id,
      message: `${node.label}: connect a value before applying this output.`,
    });
    return [];
  }

  if (node.kind === 'groupOutput' && firstModeValue.kind !== 'list') {
    diagnostics.push({
      id: `${node.id}-scalar-group-output`,
      severity: 'error',
      nodeId: node.id,
      message: `${node.label}: group outputs need a list input. Use Token output for one token.`,
    });
    return [];
  }

  if (firstModeValue.kind === 'list' || node.kind === 'groupOutput') {
    const listValuesByMode = Object.fromEntries(
      modeNames.map((modeName) => [modeName, valuesByMode[modeName]]),
    );
    if (!pathPrefix) {
      diagnostics.push({
        id: `${node.id}-missing-prefix`,
        severity: 'error',
        nodeId: node.id,
        message: `${node.label}: choose an output group.`,
      });
      return [];
    }
    return firstModeValue.kind === 'list'
      ? firstModeValue.values.map((item, itemIndex) => {
          const modeValues = Object.fromEntries(
            modeNames.map((modeName) => {
              const modeValue = listValuesByMode[modeName];
              const value = modeValue?.kind === 'list'
                ? (modeValue.values[itemIndex]?.value ?? item.value)
                : modeValue?.value ?? item.value;
              return [modeName, value];
            }),
          ) as Record<string, TokenValue | TokenReference>;
          const outputPath = `${pathPrefix}.${item.key}`;
          return makeOutput({
            document,
            node,
            targetCollection,
            outputPath,
            outputKey: item.key,
            modeValues,
            type: item.type ?? inferTokenType(item.value),
            existingTokens,
          });
        })
      : [];
  }

  if (!path) {
    diagnostics.push({
      id: `${node.id}-missing-path`,
      severity: 'error',
      nodeId: node.id,
      message: `${node.label}: choose an output token path.`,
    });
    return [];
  }

  const modeValues = Object.fromEntries(
    modeNames.map((modeName) => {
      const value = valuesByMode[modeName];
      if (!value || value.kind !== 'scalar') {
        return [modeName, firstModeValue.value];
      }
      return [modeName, value.value];
    }),
  ) as Record<string, TokenValue | TokenReference>;

  return [
    makeOutput({
      document,
      node,
      targetCollection,
      outputPath: path,
      outputKey: path,
      modeValues,
      type: (node.data.tokenType as TokenType | undefined) ?? inferTokenType(firstModeValue.value),
      existingTokens,
    }),
  ];
}

function makeOutput({
  document,
  node,
  targetCollection,
  outputPath,
  outputKey,
  modeValues,
  type,
  existingTokens,
}: {
  document: TokenGraphDocument;
  node: TokenGraphNode;
  targetCollection: TokenCollection;
  outputPath: string;
  outputKey: string;
  modeValues: Record<string, TokenValue | TokenReference>;
  type: TokenType;
  existingTokens: Record<string, Token>;
}): TokenGraphPreviewOutput {
  const existingToken = existingTokens[outputPath];
  const expectedHash = stableStringify({ documentId: document.id, nodeId: node.id, outputKey, modeValues, type });
  const existingModeValues = existingToken
    ? readTokenModeValuesForCollection(existingToken, targetCollection)
    : null;
  const existingHash = existingModeValues && existingToken
    ? stableStringify({
        documentId: document.id,
        nodeId: node.id,
        outputKey,
        modeValues: existingModeValues,
        type: existingToken.$type,
      })
    : null;
  const provenance = readGraphProvenance(existingToken);
  const change = !existingToken
    ? 'created'
    : stableStringify({ modeValues: existingModeValues, type: existingToken.$type }) ===
        stableStringify({ modeValues, type })
      ? 'unchanged'
      : 'updated';
  return {
    path: outputPath,
    type,
    modeValues,
    nodeId: node.id,
    outputKey,
    hash: expectedHash,
    existingToken,
    change,
    collision: Boolean(
      existingToken &&
      (provenance?.graphId !== document.id ||
        (provenance.graphId === document.id &&
          existingHash !== provenance.lastAppliedHash)),
    ),
  };
}

function inferTokenType(value: unknown): TokenType {
  if (typeof value === 'string') {
    return value.startsWith('#') ? 'color' : 'string';
  }
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    'unit' in value
  ) {
    return 'dimension';
  }
  return 'string';
}

function findCycleNodeIds(document: TokenGraphDocument): Set<string> {
  const outgoing = new Map<string, string[]>();
  for (const edge of document.edges) {
    outgoing.set(edge.from.nodeId, [...(outgoing.get(edge.from.nodeId) ?? []), edge.to.nodeId]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles = new Set<string>();

  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      cycles.add(nodeId);
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const next of outgoing.get(nodeId) ?? []) {
      visit(next);
      if (cycles.has(next)) cycles.add(nodeId);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const node of document.nodes) {
    visit(node.id);
  }
  return cycles;
}
