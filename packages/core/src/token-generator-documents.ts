import {
  buildTokenExtensionsWithCollectionModes,
  readTokenCollectionModeValues,
  readTokenModeValuesForCollection,
} from './collections.js';
import { makeReferenceGlobalRegex } from './constants.js';
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
import {
  computeBorderRadiusScaleTokens,
  computeColorRampTokens,
  computeCustomScaleTokens,
  computeOpacityScaleTokens,
  computeShadowScaleTokens,
  computeSpacingScaleTokens,
  computeTypeScaleTokens,
  computeZIndexScaleTokens,
} from './generator-engine.js';
import {
  DEFAULT_BORDER_RADIUS_SCALE_CONFIG,
  DEFAULT_COLOR_RAMP_CONFIG,
  DEFAULT_CUSTOM_SCALE_CONFIG,
  DEFAULT_OPACITY_SCALE_CONFIG,
  DEFAULT_SHADOW_SCALE_CONFIG,
  DEFAULT_SPACING_SCALE_CONFIG,
  DEFAULT_TYPE_SCALE_CONFIG,
  DEFAULT_Z_INDEX_SCALE_CONFIG,
  type BorderRadiusScaleConfig,
  type ColorRampConfig,
  type CustomScaleConfig,
  type GeneratorTokenResult,
  type OpacityScaleConfig,
  type ShadowScaleConfig,
  type SpacingScaleConfig,
  type TypeScaleConfig,
  type ZIndexScaleConfig,
} from './generator-types.js';
import { stableStringify } from './stable-stringify.js';
import { isReference, parseReference } from './dtcg-types.js';
import type {
  Token,
  TokenCollection,
  DimensionValue,
  TokenReference,
  TokenType,
  TokenValue,
} from './types.js';

export type TokenGeneratorPortType =
  | 'color'
  | 'number'
  | 'dimension'
  | 'string'
  | 'boolean'
  | 'token'
  | 'list'
  | 'any';

export type TokenGeneratorNodeKind =
  | 'tokenInput'
  | 'literal'
  | 'math'
  | 'color'
  | 'formula'
  | 'colorRamp'
  | 'spacingScale'
  | 'typeScale'
  | 'borderRadiusScale'
  | 'opacityScale'
  | 'shadowScale'
  | 'zIndexScale'
  | 'customScale'
  | 'list'
  | 'alias'
  | 'output'
  | 'groupOutput';

export interface TokenGeneratorViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface TokenGeneratorPosition {
  x: number;
  y: number;
}

export interface TokenGeneratorNode {
  id: string;
  kind: TokenGeneratorNodeKind;
  label: string;
  position: TokenGeneratorPosition;
  data: Record<string, unknown>;
}

export interface TokenGeneratorEdge {
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

export type TokenGeneratorPortShape = 'scalar' | 'list';

export interface TokenGeneratorPortDescriptor {
  id: string;
  label: string;
  shape: TokenGeneratorPortShape;
  type: TokenGeneratorPortType;
  accepts?: TokenGeneratorPortType[];
}

export interface TokenGeneratorConnectionCheck {
  valid: boolean;
  reason?: string;
}

export interface TokenGeneratorConnectionInput {
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
  edges?: TokenGeneratorEdge[];
}

export interface GeneratorOutputProvenance {
  generatorId: string;
  outputNodeId: string;
  outputKey: string;
  lastAppliedHash: string;
}

export interface TokenGeneratorDocument {
  id: string;
  name: string;
  authoringMode: 'preset' | 'graph';
  targetCollectionId: string;
  nodes: TokenGeneratorNode[];
  edges: TokenGeneratorEdge[];
  viewport: TokenGeneratorViewport;
  createdAt: string;
  updatedAt: string;
  lastAppliedAt?: string;
  lastApplyDiagnostics?: TokenGeneratorDiagnostic[];
  outputHashes?: Record<string, string>;
}

export interface TokenGeneratorDiagnostic {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface TokenGeneratorPreviewOutput {
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

export type TokenGeneratorNodePreviewValue =
  | {
      kind: 'scalar';
      type: TokenGeneratorPortType;
      value: TokenValue | TokenReference;
    }
  | {
      kind: 'list';
      type: TokenGeneratorPortType;
      values: Array<{
        key: string;
        label: string;
        value: TokenValue | TokenReference;
        type?: TokenType;
      }>;
    };

export interface TokenGeneratorNodePreview {
  nodeId: string;
  modeValues: Record<string, TokenGeneratorNodePreviewValue>;
}

export interface TokenGeneratorPreviewResult {
  generatorId: string;
  targetCollectionId: string;
  targetModes: string[];
  outputs: TokenGeneratorPreviewOutput[];
  nodePreviews: Record<string, TokenGeneratorNodePreview>;
  nodePreviewDiagnostics: TokenGeneratorDiagnostic[];
  diagnostics: TokenGeneratorDiagnostic[];
  blocking: boolean;
  hash: string;
  previewedAt: string;
}

export interface EvaluateTokenGeneratorDocumentInput {
  document: TokenGeneratorDocument;
  collections: TokenCollection[];
  tokensByCollection: Record<string, Record<string, Token>>;
}

type GeneratorRuntimeValue =
  | {
      kind: 'scalar';
      type: TokenGeneratorPortType;
      value: TokenValue | TokenReference;
    }
  | {
      kind: 'list';
      type: TokenGeneratorPortType;
      values: Array<{
        key: string;
        label: string;
        value: TokenValue | TokenReference;
        type?: TokenType;
      }>;
    };

type ModeRuntimeValues = Record<string, GeneratorRuntimeValue | undefined>;
type GeneratorTokenRefMap = Record<string, string>;
type ResolvedGeneratorTokenRef = {
  path: string;
  token: Token;
  value: unknown;
};

export function getTokenGeneratorInputPorts(
  node: TokenGeneratorNode,
): TokenGeneratorPortDescriptor[] {
  switch (node.kind) {
    case 'math':
      return [
        {
          id: 'value',
          label: 'Value',
          shape: 'scalar',
          type: 'number',
          accepts: ['number', 'dimension'],
        },
      ];
    case 'formula':
      return [
        { id: 'value', label: 'Value', shape: 'scalar', type: 'number', accepts: ['number'] },
        { id: 'var2', label: 'Var 2', shape: 'scalar', type: 'number', accepts: ['number'] },
        { id: 'var3', label: 'Var 3', shape: 'scalar', type: 'number', accepts: ['number'] },
      ];
    case 'color':
    case 'colorRamp':
      return [
        { id: 'value', label: 'Color', shape: 'scalar', type: 'color', accepts: ['color'] },
      ];
    case 'spacingScale':
      return [
        {
          id: 'value',
          label: 'Base',
          shape: 'scalar',
          type: 'dimension',
          accepts: ['number', 'dimension'],
        },
      ];
    case 'typeScale':
      return [
        {
          id: 'value',
          label: 'Base',
          shape: 'scalar',
          type: 'dimension',
          accepts: ['number', 'dimension'],
        },
      ];
    case 'borderRadiusScale':
      return [
        {
          id: 'value',
          label: 'Base',
          shape: 'scalar',
          type: 'dimension',
          accepts: ['number', 'dimension'],
        },
      ];
    case 'customScale':
      return [
        {
          id: 'value',
          label: 'Base',
          shape: 'scalar',
          type: 'number',
          accepts: ['number', 'dimension'],
        },
      ];
    case 'output':
      return [
        { id: 'value', label: 'Value', shape: 'scalar', type: 'any', accepts: ['any'] },
      ];
    case 'groupOutput':
      return [
        { id: 'value', label: 'Series', shape: 'list', type: 'any', accepts: ['any'] },
      ];
    default:
      return [];
  }
}

export function getTokenGeneratorOutputPorts(
  node: TokenGeneratorNode,
): TokenGeneratorPortDescriptor[] {
  switch (node.kind) {
    case 'output':
    case 'groupOutput':
      return [];
    case 'colorRamp':
      return [
        { id: 'value', label: 'Series', shape: 'list', type: 'color' },
      ];
    case 'spacingScale':
    case 'typeScale':
    case 'borderRadiusScale':
      return [
        { id: 'value', label: 'Series', shape: 'list', type: 'dimension' },
      ];
    case 'opacityScale':
    case 'zIndexScale':
      return [
        { id: 'value', label: 'Series', shape: 'list', type: 'number' },
      ];
    case 'shadowScale':
      return [
        { id: 'value', label: 'Series', shape: 'list', type: 'token' },
      ];
    case 'customScale': {
      const type = readCustomScaleOutputType(node.data.outputType);
      return [
        { id: 'value', label: 'Series', shape: 'list', type },
      ];
    }
    case 'list':
      return [
        {
          id: 'value',
          label: 'Series',
          shape: 'list',
          type: readNodeOutputType(node),
        },
      ];
    default:
      return [
        {
          id: 'value',
          label: 'Value',
          shape: 'scalar',
          type: readNodeOutputType(node),
        },
      ];
  }
}

export function checkTokenGeneratorConnection(
  document: Pick<TokenGeneratorDocument, 'nodes' | 'edges'>,
  input: TokenGeneratorConnectionInput,
): TokenGeneratorConnectionCheck {
  const sourceNode = document.nodes.find((node) => node.id === input.sourceNodeId);
  const targetNode = document.nodes.find((node) => node.id === input.targetNodeId);
  if (!sourceNode || !targetNode) {
    return { valid: false, reason: 'Choose two existing graph steps.' };
  }
  if (sourceNode.id === targetNode.id) {
    return { valid: false, reason: 'A step cannot connect to itself.' };
  }

  const sourcePort = getTokenGeneratorOutputPorts(sourceNode).find(
    (port) => port.id === input.sourcePort,
  );
  const targetPort = getTokenGeneratorInputPorts(targetNode).find(
    (port) => port.id === input.targetPort,
  );
  if (!sourcePort) {
    return { valid: false, reason: 'This step does not have that output.' };
  }
  if (!targetPort) {
    return { valid: false, reason: 'This step does not have that input.' };
  }
  if (sourcePort.shape !== targetPort.shape) {
    return {
      valid: false,
      reason:
        targetPort.shape === 'list'
          ? 'This input needs a list of generated steps.'
          : 'This input needs one value.',
    };
  }
  if (!portTypesAreCompatible(sourcePort.type, targetPort)) {
    return {
      valid: false,
      reason: `${targetPort.label} expects ${formatPortTypeList(targetPort.accepts ?? [targetPort.type])}.`,
    };
  }

  const nextEdges = input.edges ?? document.edges;
  const targetInputEdges = nextEdges.filter(
    (edge) =>
      edge.to.nodeId === input.targetNodeId &&
      edge.to.port === input.targetPort,
  );
  const matchingConnectionEdges = targetInputEdges.filter(
    (edge) =>
      edge.from.nodeId === input.sourceNodeId &&
      edge.from.port === input.sourcePort,
  );
  if (
    targetInputEdges.length > 1 ||
    targetInputEdges.length > matchingConnectionEdges.length
  ) {
    return { valid: false, reason: 'This input already has a source.' };
  }
  if (connectionWouldCycle(nextEdges, input.sourceNodeId, input.targetNodeId)) {
    return { valid: false, reason: 'This connection would create a loop.' };
  }

  return { valid: true };
}

function readNodeOutputType(node: TokenGeneratorNode): TokenGeneratorPortType {
  if (node.kind === 'literal') {
    const type = node.data.type;
    if (
      type === 'color' ||
      type === 'number' ||
      type === 'dimension' ||
      type === 'string' ||
      type === 'boolean'
    ) {
      return type;
    }
    return 'any';
  }
  if (node.kind === 'tokenInput') {
    const type = node.data.tokenType;
    if (type === 'color' || type === 'number' || type === 'dimension') return type;
    if (type === 'string' || type === 'boolean' || type === 'token') return 'token';
    return 'any';
  }
  if (node.kind === 'alias') return 'token';
  if (node.kind === 'color') return 'color';
  if (node.kind === 'math' || node.kind === 'formula') return 'number';
  if (node.kind === 'list') {
    const type = node.data.type;
    if (
      type === 'color' ||
      type === 'number' ||
      type === 'dimension' ||
      type === 'string' ||
      type === 'boolean' ||
      type === 'token'
    ) {
      return type;
    }
  }
  return 'any';
}

function portTypesAreCompatible(
  sourceType: TokenGeneratorPortType,
  targetPort: TokenGeneratorPortDescriptor,
): boolean {
  const accepted = targetPort.accepts ?? [targetPort.type];
  if (accepted.includes('any')) return true;
  if (sourceType === 'any') return targetPort.type === 'any';
  return accepted.includes(sourceType);
}

function formatPortTypeList(types: TokenGeneratorPortType[]): string {
  const normalized = types.includes('any') ? ['any value'] : types;
  return normalized.join(' or ');
}

function readCustomScaleOutputType(value: unknown): 'dimension' | 'number' {
  return value === 'dimension' ? 'dimension' : 'number';
}

function connectionWouldCycle(
  edges: TokenGeneratorEdge[],
  sourceNodeId: string,
  targetNodeId: string,
): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    outgoing.set(edge.from.nodeId, [
      ...(outgoing.get(edge.from.nodeId) ?? []),
      edge.to.nodeId,
    ]);
  }
  const stack = [targetNodeId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (nodeId === sourceNodeId) return true;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    stack.push(...(outgoing.get(nodeId) ?? []));
  }
  return false;
}

export function createDefaultTokenGeneratorDocument(
  targetCollectionId: string,
  name = 'New generator',
): TokenGeneratorDocument {
  const now = new Date().toISOString();
  const id = `generator_${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    name,
    authoringMode: 'preset',
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
        data: { ...DEFAULT_COLOR_RAMP_CONFIG },
      },
      {
        id: 'output',
        kind: 'groupOutput',
        label: 'Series output',
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
        from: { nodeId: 'ramp', port: 'value' },
        to: { nodeId: 'output', port: 'value' },
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  };
}

export function generatorProvenanceHash(
  document: TokenGeneratorDocument,
  outputs: TokenGeneratorPreviewOutput[],
): string {
  return stableStringify({
    generatorId: document.id,
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

export function tokenFromGeneratorOutput(
  collection: TokenCollection,
  output: TokenGeneratorPreviewOutput,
  provenance: GeneratorOutputProvenance,
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
      generator: provenance,
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

export function readGeneratorProvenance(
  token: Pick<Token, '$extensions'> | undefined,
): GeneratorOutputProvenance | null {
  const raw = token?.$extensions?.tokenmanager?.generator;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (
    typeof record.generatorId !== 'string' ||
    typeof record.outputNodeId !== 'string' ||
    typeof record.outputKey !== 'string' ||
    typeof record.lastAppliedHash !== 'string'
  ) {
    return null;
  }
  return {
    generatorId: record.generatorId,
    outputNodeId: record.outputNodeId,
    outputKey: record.outputKey,
    lastAppliedHash: record.lastAppliedHash,
  };
}

export function evaluateTokenGeneratorDocument({
  document,
  collections,
  tokensByCollection,
}: EvaluateTokenGeneratorDocumentInput): TokenGeneratorPreviewResult {
  const diagnostics: TokenGeneratorDiagnostic[] = [];
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
    const check = checkTokenGeneratorConnection(document, {
      sourceNodeId: edge.from.nodeId,
      sourcePort: edge.from.port,
      targetNodeId: edge.to.nodeId,
      targetPort: edge.to.port,
      edges: document.edges,
    });
    if (!check.valid) {
      diagnostics.push({
        id: `broken-edge-${edge.id}`,
        severity: 'error',
        edgeId: edge.id,
        ...(nodeById.has(edge.to.nodeId) ? { nodeId: edge.to.nodeId } : {}),
        message: check.reason ?? 'This connection is not valid.',
      });
    }
  }
  validateUnsupportedTokenRefs(document, diagnostics);
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return emptyPreview(document, diagnostics, previewedAt, modeNames);
  }

  const incoming = new Map<string, TokenGeneratorEdge[]>();
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

  const outputs: TokenGeneratorPreviewOutput[] = [];
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
  validateDuplicateOutputPaths(outputs, diagnostics);

  const hash = generatorProvenanceHash(document, outputs);
  const nodePreviewCache = new Map(cache);
  const previewDiagnostics: TokenGeneratorDiagnostic[] = [];
  const evaluatePreviewNode = (nodeId: string): ModeRuntimeValues => {
    const cached = nodePreviewCache.get(nodeId);
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
        return evaluatePreviewNode(edge.from.nodeId);
      },
      diagnostics: previewDiagnostics,
    });
    nodePreviewCache.set(nodeId, result);
    return result;
  };
  const nodePreviews = Object.fromEntries(
    document.nodes
      .filter((node) => node.kind !== 'output' && node.kind !== 'groupOutput')
      .map((node) => [node.id, evaluatePreviewNode(node.id)] as const)
      .filter(([, valuesByMode]) => Object.keys(valuesByMode).length > 0)
      .map(([nodeId, valuesByMode]) => [
        nodeId,
        {
          nodeId,
          modeValues: serializeNodePreviewModeValues(valuesByMode),
        },
      ]),
  );
  return {
    generatorId: document.id,
    targetCollectionId: targetCollection.id,
    targetModes: modeNames,
    outputs,
    nodePreviews,
    nodePreviewDiagnostics: previewDiagnostics,
    diagnostics,
    blocking: diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    hash,
    previewedAt,
  };
}

function validateDuplicateOutputPaths(
  outputs: TokenGeneratorPreviewOutput[],
  diagnostics: TokenGeneratorDiagnostic[],
): void {
  const outputsByPath = new Map<string, TokenGeneratorPreviewOutput[]>();
  for (const output of outputs) {
    outputsByPath.set(output.path, [
      ...(outputsByPath.get(output.path) ?? []),
      output,
    ]);
  }

  let duplicateGroupIndex = 0;
  for (const [path, pathOutputs] of outputsByPath) {
    if (pathOutputs.length <= 1) continue;
    duplicateGroupIndex += 1;
    const nodeIds = [...new Set(pathOutputs.map((output) => output.nodeId))];
    for (const nodeId of nodeIds) {
      diagnostics.push({
        id: `duplicate-output-${duplicateGroupIndex}-${nodeId}`,
        severity: 'error',
        nodeId,
        message: `Multiple outputs target "${path}". Choose a unique output path for each output.`,
      });
    }
  }
}

function emptyPreview(
  document: TokenGeneratorDocument,
  diagnostics: TokenGeneratorDiagnostic[],
  previewedAt: string,
  targetModes: string[] = [],
): TokenGeneratorPreviewResult {
  return {
    generatorId: document.id,
    targetCollectionId: document.targetCollectionId,
    targetModes,
    outputs: [],
    nodePreviews: {},
    nodePreviewDiagnostics: [],
    diagnostics,
    blocking: diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    hash: stableStringify({ generatorId: document.id, diagnostics }),
    previewedAt,
  };
}

function serializeNodePreviewModeValues(
  valuesByMode: ModeRuntimeValues,
): Record<string, TokenGeneratorNodePreviewValue> {
  return Object.fromEntries(
    Object.entries(valuesByMode)
      .filter((entry): entry is [string, GeneratorRuntimeValue] =>
        Boolean(entry[1]),
      )
      .map(([modeName, value]) => [
        modeName,
        value.kind === 'list'
          ? {
              kind: 'list' as const,
              type: value.type,
              values: value.values.map((item) => ({
                key: item.key,
                label: item.label,
                value: item.value,
                ...(item.type ? { type: item.type } : {}),
              })),
            }
          : {
              kind: 'scalar' as const,
              type: value.type,
              value: value.value,
            },
      ]),
  );
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
  node: TokenGeneratorNode;
  modeNames: string[];
  targetCollection: TokenCollection;
  collections: TokenCollection[];
  tokensByCollection: Record<string, Record<string, Token>>;
  input: (port: string) => ModeRuntimeValues;
  diagnostics: TokenGeneratorDiagnostic[];
}): ModeRuntimeValues {
  const result: ModeRuntimeValues = {};

  for (const modeName of modeNames) {
    try {
      const source = input('value')[modeName];
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
  node: TokenGeneratorNode;
  modeName: string;
  source: GeneratorRuntimeValue | undefined;
  targetCollection: TokenCollection;
  collections: TokenCollection[];
  tokensByCollection: Record<string, Record<string, Token>>;
  input: (port: string) => ModeRuntimeValues;
}): GeneratorRuntimeValue | undefined {
  switch (node.kind) {
    case 'literal':
      return literalValue(node, modeName, targetCollection, tokensByCollection);
    case 'tokenInput':
      return tokenInputValue(node, modeName, targetCollection, collections, tokensByCollection);
    case 'alias':
      return aliasValue(node, targetCollection, tokensByCollection);
    case 'math':
      return mathValue(node, source);
    case 'formula':
      return formulaValue(node, modeName, source, targetCollection, tokensByCollection, input);
    case 'color':
      return colorValue(node, source);
    case 'colorRamp':
      return colorRampValue(node, modeName, source, targetCollection, tokensByCollection);
    case 'spacingScale':
      return spacingScaleValue(node, modeName, source, targetCollection, tokensByCollection);
    case 'typeScale':
      return typeScaleValue(node, modeName, source, targetCollection, tokensByCollection);
    case 'borderRadiusScale':
      return borderRadiusScaleValue(node, modeName, source, targetCollection, tokensByCollection);
    case 'opacityScale':
      return opacityScaleValue(node, modeName, targetCollection, tokensByCollection);
    case 'shadowScale':
      return shadowScaleValue(node, modeName, targetCollection, tokensByCollection);
    case 'zIndexScale':
      return zIndexScaleValue(node, modeName, targetCollection, tokensByCollection);
    case 'customScale':
      return customScaleValue(node, modeName, source, targetCollection, tokensByCollection);
    case 'list':
      return listValue(node);
    case 'output':
    case 'groupOutput':
      return source;
    default:
      return undefined;
  }
}

function literalValue(
  node: TokenGeneratorNode,
  modeName: string,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
): GeneratorRuntimeValue {
  const type = String(node.data.type ?? 'string') as TokenGeneratorPortType;
  const refs = readTokenRefMap(node);
  const hasTokenRef = Object.prototype.hasOwnProperty.call(refs, 'value');
  const resolvedRef = hasTokenRef
    ? resolveGeneratorTokenRef(refs.value, modeName, targetCollection, tokensByCollection, 'value')
    : undefined;
  if (resolvedRef !== undefined) {
    if (type === 'number') {
      validateResolvedTokenRefType(resolvedRef, ['number', 'dimension'], 'value');
      return { kind: 'scalar', type, value: coerceNumberValue(resolvedRef.value, 'value') };
    }
    if (type === 'dimension') {
      validateResolvedTokenRefType(resolvedRef, ['dimension', 'number'], 'value');
      const fallbackUnit = String(node.data.unit ?? 'px');
      return {
        kind: 'scalar',
        type,
        value: isDimensionLike(resolvedRef.value)
          ? resolvedRef.value
          : { value: coerceNumberValue(resolvedRef.value, 'value'), unit: fallbackUnit },
      };
    }
    if (type === 'boolean') {
      validateResolvedTokenRefType(resolvedRef, ['boolean'], 'value');
      return { kind: 'scalar', type, value: Boolean(resolvedRef.value) };
    }
    validateResolvedTokenRefType(resolvedRef, [type], 'value');
    return { kind: 'scalar', type, value: String(resolvedRef.value ?? '') };
  }
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
  node: TokenGeneratorNode,
  modeName: string,
  targetCollection: TokenCollection,
  collections: TokenCollection[],
  tokensByCollection: Record<string, Record<string, Token>>,
): GeneratorRuntimeValue {
  const path = String(node.data.path ?? '').trim();
  if (!path) throw new Error('Choose a token source.');
  const collectionId = String(node.data.collectionId ?? targetCollection.id);
  const collection = collections.find((candidate) => candidate.id === collectionId);
  const token = tokensByCollection[collectionId]?.[path];
  if (!collection || !token) {
    throw new Error(`Token "${path}" was not found in "${collectionId}".`);
  }
  const modeValues = readTokenModeValuesForCollection(token, collection);
  if (
    collection.id !== targetCollection.id &&
    !(modeName in modeValues)
  ) {
    throw new Error(
      `Token "${path}" is in another collection. Add matching mode names or choose a token from "${targetCollection.id}".`,
    );
  }
  if (!(modeName in modeValues)) {
    throw new Error(`Token "${path}" has no value for mode "${modeName}".`);
  }
  const value = resolveModeValue({
    collection,
    tokenPath: path,
    value: modeValues[modeName],
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
  if (!(modeName in nextModes)) {
    throw new Error(`Alias target "${nextPath}" has no value for mode "${modeName}".`);
  }
  visited.add(nextPath);
  return resolveModeValue({
    collection,
    tokenPath: nextPath,
    value: nextModes[modeName],
    modeName,
    tokensByCollection,
    visited,
  });
}

function readTokenRefMap(node: TokenGeneratorNode): GeneratorTokenRefMap {
  const fromData =
    node.data.$tokenRefs &&
    typeof node.data.$tokenRefs === 'object' &&
    !Array.isArray(node.data.$tokenRefs)
      ? (node.data.$tokenRefs as Record<string, unknown>)
      : {};
  const config =
    node.data.config &&
    typeof node.data.config === 'object' &&
    !Array.isArray(node.data.config)
      ? (node.data.config as Record<string, unknown>)
      : {};
  const fromConfig =
    config.$tokenRefs &&
    typeof config.$tokenRefs === 'object' &&
    !Array.isArray(config.$tokenRefs)
      ? (config.$tokenRefs as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries({ ...fromConfig, ...fromData })
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function validateUnsupportedTokenRefs(
  document: TokenGeneratorDocument,
  diagnostics: TokenGeneratorDiagnostic[],
): void {
  for (const node of document.nodes) {
    const supportedKeys = supportedTokenRefKeysForNode(node.kind);
    for (const key of Object.keys(readTokenRefMap(node))) {
      if (supportedKeys.has(key)) continue;
      diagnostics.push({
        id: `${node.id}-unsupported-token-ref-${key}`,
        severity: 'error',
        nodeId: node.id,
        message: `${node.label}: "${key}" cannot use a token reference.`,
      });
    }
  }
}

function supportedTokenRefKeysForNode(kind: TokenGeneratorNodeKind): Set<string> {
  if (kind === 'literal') return new Set(['value']);
  if (kind === 'colorRamp') return new Set(['lightEnd', 'darkEnd', 'chromaBoost']);
  if (kind === 'typeScale') return new Set(['ratio']);
  if (kind === 'shadowScale') return new Set(['color']);
  return new Set();
}

function resolveGeneratorTokenRef(
  path: string,
  modeName: string,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
  fieldName: string,
): ResolvedGeneratorTokenRef {
  const cleanPath = path.trim().replace(/^\{|\}$/g, '');
  if (!cleanPath) {
    throw new Error(`Choose a token for "${fieldName}".`);
  }
  const token = tokensByCollection[targetCollection.id]?.[cleanPath];
  if (!token) {
    throw new Error(`Token "${cleanPath}" was not found in "${targetCollection.id}".`);
  }
  const modeValues = readTokenModeValuesForCollection(token, targetCollection);
  if (!(modeName in modeValues)) {
    throw new Error(`Token "${cleanPath}" has no value for mode "${modeName}".`);
  }
  const value = resolveModeValue({
    collection: targetCollection,
    tokenPath: cleanPath,
    value: modeValues[modeName],
    modeName,
    tokensByCollection,
    visited: new Set([cleanPath]),
  });
  return { path: cleanPath, token, value };
}

function validateResolvedTokenRefType(
  resolved: ResolvedGeneratorTokenRef,
  acceptedTypes: TokenGeneratorPortType[],
  fieldName: string,
): void {
  const tokenType = resolved.token.$type as TokenGeneratorPortType | undefined;
  if (!tokenType || !acceptedTypes.includes(tokenType)) {
    throw new Error(
      `Token "${resolved.path}" cannot drive "${fieldName}". Expected ${acceptedTypes.join(' or ')}, got ${tokenType ?? 'unknown'}.`,
    );
  }
  if (!resolvedValueMatchesPortTypes(resolved.value, acceptedTypes)) {
    throw new Error(
      `Token "${resolved.path}" cannot drive "${fieldName}" because its resolved value does not match ${acceptedTypes.join(' or ')}.`,
    );
  }
}

function coerceNumberValue(value: unknown, fieldName: string): number {
  const raw = isDimensionLike(value) ? value.value : value;
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Token reference for "${fieldName}" did not resolve to a finite number.`);
  }
  return numeric;
}

function aliasValue(
  node: TokenGeneratorNode,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
): GeneratorRuntimeValue {
  const path = String(node.data.path ?? '').trim();
  if (!path) throw new Error('Choose a token to reference.');
  if (!tokensByCollection[targetCollection.id]?.[path]) {
    throw new Error(`Token "${path}" was not found in "${targetCollection.id}".`);
  }
  return {
    kind: 'scalar',
    type: 'token',
    value: `{${path}}` as TokenReference,
  };
}

function mathValue(
  node: TokenGeneratorNode,
  source: GeneratorRuntimeValue | undefined,
): GeneratorRuntimeValue {
  const operation = String(node.data.operation ?? 'add');
  const amount = Number(node.data.amount ?? 0);
  const value = requireScalar(source, 'Math nodes need an input value.');
  if (operation === 'scaleBy') {
    return { kind: 'scalar', type: source?.type ?? 'number', value: opScaleBy(value as number, amount) as TokenValue };
  }
  if (operation === 'subtract') {
    return { kind: 'scalar', type: source?.type ?? 'number', value: opAdd(value as number, mathDeltaForSource(value, -amount)) as TokenValue };
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
  return { kind: 'scalar', type: source?.type ?? 'number', value: opAdd(value as number, mathDeltaForSource(value, amount)) as TokenValue };
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

function mathDeltaForSource(
  value: TokenValue | TokenReference,
  amount: number,
): number | DimensionValue {
  if (isDimensionLike(value)) {
    return { value: amount, unit: value.unit as DimensionValue['unit'] };
  }
  return amount;
}

function formulaValue(
  node: TokenGeneratorNode,
  modeName: string,
  source: GeneratorRuntimeValue | undefined,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
  input: (port: string) => ModeRuntimeValues,
): GeneratorRuntimeValue {
  const vars: Record<string, number> = {};
  if (source) {
    const scalar = requireScalar(source, 'Formula input has no value.');
    const numberValue = coerceNumberValue(scalar, 'value');
    vars.value = numberValue;
    vars.x = numberValue;
    vars.var1 = numberValue;
  }
  const variableKeys = new Set(
    Object.keys(node.data).filter((key) => key.startsWith('var')),
  );
  for (const port of getTokenGeneratorInputPorts(node)) {
    if (port.id.startsWith('var')) variableKeys.add(port.id);
  }
  for (const key of variableKeys) {
    if (!key.startsWith('var')) continue;
    if (key === 'var1' && source) continue;
    const value = node.data[key];
    const portSource = input(key)[modeName];
    const scalar = portSource ? requireScalar(portSource, `Formula input "${key}" has no value.`) : Number(value ?? 0);
    vars[key] = coerceNumberValue(scalar, key);
  }
  const expressionWithRefs = resolveFormulaTokenReferences(
    String(node.data.expression ?? '0'),
    modeName,
    targetCollection,
    tokensByCollection,
    'formula',
  );
  const expression = substituteVars(expressionWithRefs, vars);
  return { kind: 'scalar', type: 'number', value: evalExpr(expression) };
}

function colorValue(
  node: TokenGeneratorNode,
  source: GeneratorRuntimeValue | undefined,
): GeneratorRuntimeValue {
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
  node: TokenGeneratorNode,
  modeName: string,
  source: GeneratorRuntimeValue | undefined,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
): GeneratorRuntimeValue {
  const sourceColor = String(requireScalar(source, 'Color ramps need a source color.'));
  const config = readNodeConfigForMode<ColorRampConfig>(node, DEFAULT_COLOR_RAMP_CONFIG, modeName, targetCollection, tokensByCollection);
  const generated = computeColorRampTokens(sourceColor, config, 'output');
  return generatedResultsToList('color', generated);
}

function spacingScaleValue(
  node: TokenGeneratorNode,
  modeName: string,
  source: GeneratorRuntimeValue | undefined,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
): GeneratorRuntimeValue {
  const config = readNodeConfigForMode<SpacingScaleConfig>(node, DEFAULT_SPACING_SCALE_CONFIG, modeName, targetCollection, tokensByCollection);
  return generatedResultsToList(
    'dimension',
    computeSpacingScaleTokens(requireDimensionSource(source, 'Spacing scales need a base size.'), config, 'output'),
  );
}

function typeScaleValue(
  node: TokenGeneratorNode,
  modeName: string,
  source: GeneratorRuntimeValue | undefined,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
): GeneratorRuntimeValue {
  const config = readNodeConfigForMode<TypeScaleConfig>(node, DEFAULT_TYPE_SCALE_CONFIG, modeName, targetCollection, tokensByCollection);
  return generatedResultsToList(
    'dimension',
    computeTypeScaleTokens(requireDimensionSource(source, 'Type scales need a base font size.'), config, 'output'),
  );
}

function borderRadiusScaleValue(
  node: TokenGeneratorNode,
  modeName: string,
  source: GeneratorRuntimeValue | undefined,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
): GeneratorRuntimeValue {
  const config = readNodeConfigForMode<BorderRadiusScaleConfig>(node, DEFAULT_BORDER_RADIUS_SCALE_CONFIG, modeName, targetCollection, tokensByCollection);
  return generatedResultsToList(
    'dimension',
    computeBorderRadiusScaleTokens(requireDimensionSource(source, 'Radius scales need a base radius.'), config, 'output'),
  );
}

function opacityScaleValue(
  node: TokenGeneratorNode,
  modeName: string,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
): GeneratorRuntimeValue {
  const config = readNodeConfigForMode<OpacityScaleConfig>(node, DEFAULT_OPACITY_SCALE_CONFIG, modeName, targetCollection, tokensByCollection);
  return generatedResultsToList('number', computeOpacityScaleTokens(config, 'output'));
}

function shadowScaleValue(
  node: TokenGeneratorNode,
  modeName: string,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
): GeneratorRuntimeValue {
  const config = readNodeConfigForMode<ShadowScaleConfig>(node, DEFAULT_SHADOW_SCALE_CONFIG, modeName, targetCollection, tokensByCollection);
  return generatedResultsToList('token', computeShadowScaleTokens(config, 'output'));
}

function zIndexScaleValue(
  node: TokenGeneratorNode,
  modeName: string,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
): GeneratorRuntimeValue {
  const config = readNodeConfigForMode<ZIndexScaleConfig>(node, DEFAULT_Z_INDEX_SCALE_CONFIG, modeName, targetCollection, tokensByCollection);
  return generatedResultsToList('number', computeZIndexScaleTokens(config, 'output'));
}

function customScaleValue(
  node: TokenGeneratorNode,
  modeName: string,
  source: GeneratorRuntimeValue | undefined,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
): GeneratorRuntimeValue {
  const config = readNodeConfigForMode<CustomScaleConfig>(node, DEFAULT_CUSTOM_SCALE_CONFIG, modeName, targetCollection, tokensByCollection);
  const outputPortType = readCustomScaleOutputType(config.outputType);
  const normalizedConfig = {
    ...config,
    outputType: outputPortType,
    formula: resolveFormulaTokenReferences(
      String(config.formula ?? ''),
      modeName,
      targetCollection,
      tokensByCollection,
      'formula',
    ),
  };
  return generatedResultsToList(
    outputPortType,
    computeCustomScaleTokens(
      source ? requireNumericSource(source) : undefined,
      normalizedConfig,
      'output',
    ),
  );
}

function readNodeConfig<T extends object>(
  node: TokenGeneratorNode,
  defaults: T,
): T {
  const rawConfig = node.data.config;
  const explicitConfig =
    rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
      ? rawConfig as Partial<T>
      : {};
  return JSON.parse(JSON.stringify({ ...defaults, ...node.data, ...explicitConfig })) as T;
}

function readNodeConfigForMode<T extends object>(
  node: TokenGeneratorNode,
  defaults: T,
  modeName: string,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
): T {
  const config = readNodeConfig<T>(node, defaults) as Record<string, unknown>;
  const refs = readTokenRefMap(node);
  const supportedRefKeys = configTokenRefKeysForNodeKind(node.kind);
  for (const [key, path] of Object.entries(refs)) {
    if (key === 'value') continue;
    if (!supportedRefKeys.has(key)) {
      throw new Error(`"${key}" cannot use a token reference on ${formatNodeKindForDiagnostic(node.kind)}.`);
    }
    const resolved = resolveGeneratorTokenRef(path, modeName, targetCollection, tokensByCollection, key);
    config[key] = coerceConfigReferenceValue(key, config[key] ?? (defaults as Record<string, unknown>)[key], resolved);
  }
  delete config.$tokenRefs;
  return JSON.parse(JSON.stringify(config)) as T;
}

function coerceConfigReferenceValue(
  fieldName: string,
  currentValue: unknown,
  resolved: ResolvedGeneratorTokenRef,
): unknown {
  if (typeof currentValue === 'number') {
    validateResolvedTokenRefType(resolved, ['number', 'dimension'], fieldName);
    return coerceNumberValue(resolved.value, fieldName);
  }
  if (typeof currentValue === 'boolean') {
    validateResolvedTokenRefType(resolved, ['boolean'], fieldName);
    return resolved.value;
  }
  if (typeof currentValue === 'string') {
    const acceptedTypes: TokenGeneratorPortType[] =
      fieldName === 'color' || fieldName === 'mixWith' ? ['color'] : ['string'];
    validateResolvedTokenRefType(resolved, acceptedTypes, fieldName);
    return resolved.value;
  }
  throw new Error(`"${fieldName}" cannot use a token reference.`);
}

function configTokenRefKeysForNodeKind(kind: TokenGeneratorNodeKind): Set<string> {
  if (kind === 'colorRamp') return new Set(['lightEnd', 'darkEnd', 'chromaBoost']);
  if (kind === 'typeScale') return new Set(['ratio']);
  if (kind === 'shadowScale') return new Set(['color']);
  return new Set();
}

function formatNodeKindForDiagnostic(kind: TokenGeneratorNodeKind): string {
  return kind.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function resolveFormulaTokenReferences(
  formula: string,
  modeName: string,
  targetCollection: TokenCollection,
  tokensByCollection: Record<string, Record<string, Token>>,
  fieldName: string,
): string {
  return formula.replace(makeReferenceGlobalRegex(), (_match, path: string) => {
    const resolved = resolveGeneratorTokenRef(path, modeName, targetCollection, tokensByCollection, fieldName);
    validateResolvedTokenRefType(resolved, ['number', 'dimension'], fieldName);
    return String(coerceNumberValue(resolved.value, fieldName));
  });
}

function resolvedValueMatchesPortTypes(
  value: unknown,
  acceptedTypes: TokenGeneratorPortType[],
): boolean {
  return acceptedTypes.some((type) => {
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'dimension') return isDimensionLike(value);
    if (type === 'boolean') return typeof value === 'boolean';
    if (type === 'color' || type === 'string') return typeof value === 'string';
    if (type === 'token') return isReference(value);
    return true;
  });
}

function generatedResultsToList(
  type: TokenGeneratorPortType,
  generated: GeneratorTokenResult[],
): GeneratorRuntimeValue {
  return {
    kind: 'list',
    type,
    values: generated.map((item) => ({
      key: item.stepName,
      label: item.stepName,
      value: item.value as TokenValue,
      type: item.type,
    })),
  };
}

function requireDimensionSource(
  source: GeneratorRuntimeValue | undefined,
  message: string,
): { value: number; unit: string } {
  const value = requireScalar(source, message);
  if (isDimensionLike(value)) {
    return value;
  }
  if (typeof value === 'number') {
    return { value, unit: 'px' };
  }
  throw new Error(message);
}

function requireNumericSource(source: GeneratorRuntimeValue): number {
  const value = requireScalar(source, 'Formula scales need a numeric base value.');
  if (isDimensionLike(value)) {
    return value.value;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error('Formula scales need a numeric base value.');
  }
  return numberValue;
}

function listValue(node: TokenGeneratorNode): GeneratorRuntimeValue {
  const items = Array.isArray(node.data.items) ? node.data.items : [];
  const listType = String(node.data.type ?? 'number') as TokenGeneratorPortType;
  const listItemType = tokenTypeForListType(listType);
  const tokenListItemType = node.data.tokenType as TokenType | undefined;
  return {
    kind: 'list',
    type: listType,
    values: items.map((item, index) => {
      if (isListItemRecord(item)) {
        const key = String(item.key ?? index + 1);
        return {
          key,
          label: String(item.label ?? key),
          value: item.value as TokenValue,
          type: listType === 'token'
            ? (item.type as TokenType | undefined) ?? tokenListItemType
            : listItemType,
        };
      }
      return {
        key: String(index + 1),
        label: String(index + 1),
        value: item as TokenValue,
        type: listType === 'token' ? tokenListItemType : listItemType,
      };
    }),
  };
}

function tokenTypeForListType(type: TokenGeneratorPortType): TokenType | undefined {
  if (
    type === 'color' ||
    type === 'number' ||
    type === 'dimension' ||
    type === 'string' ||
    type === 'boolean'
  ) {
    return type;
  }
  return undefined;
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
  value: GeneratorRuntimeValue | undefined,
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
  document: TokenGeneratorDocument;
  node: TokenGeneratorNode;
  targetCollection: TokenCollection;
  modeNames: string[];
  valuesByMode: ModeRuntimeValues;
  existingTokens: Record<string, Token>;
  diagnostics: TokenGeneratorDiagnostic[];
}): TokenGeneratorPreviewOutput[] {
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
      message: `${node.label}: series outputs need a series input. Use Token output for one token.`,
    });
    return [];
  }

  if (node.kind === 'output' && firstModeValue.kind === 'list') {
    diagnostics.push({
      id: `${node.id}-list-token-output`,
      severity: 'error',
      nodeId: node.id,
      message: `${node.label}: token outputs need one value. Use Series output for ramps and scales.`,
    });
    return [];
  }

  if (node.kind === 'groupOutput') {
    const firstListValue = firstModeValue.kind === 'list' ? firstModeValue : null;
    if (!firstListValue) return [];
    if (!pathPrefix) {
      diagnostics.push({
        id: `${node.id}-missing-prefix`,
        severity: 'error',
        nodeId: node.id,
        message: `${node.label}: choose an output group.`,
      });
      return [];
    }
    const listValuesByMode = new Map<string, Extract<GeneratorRuntimeValue, { kind: 'list' }>>();
    for (const modeName of modeNames) {
      const modeValue = valuesByMode[modeName];
      if (!modeValue) {
        diagnostics.push({
          id: `${node.id}-missing-${modeName}`,
          severity: 'error',
          nodeId: node.id,
          message: `${node.label}: ${modeName} has no output value. Connect inputs that evaluate for every target mode.`,
        });
        continue;
      }
      if (modeValue.kind !== 'list') {
        diagnostics.push({
          id: `${node.id}-non-list-${modeName}`,
          severity: 'error',
          nodeId: node.id,
          message: `${node.label}: ${modeName} evaluates to one value, but this output needs a list.`,
        });
        continue;
      }
      if (modeValue.values.length !== firstListValue.values.length) {
        diagnostics.push({
          id: `${node.id}-list-length-${modeName}`,
          severity: 'error',
          nodeId: node.id,
          message: `${node.label}: ${modeName} produces ${modeValue.values.length} items; expected ${firstListValue.values.length}.`,
        });
        continue;
      }
      listValuesByMode.set(modeName, modeValue);
    }
    if (listValuesByMode.size !== modeNames.length) return [];
    return firstListValue.values.map((item, itemIndex) => {
      const modeValues = Object.fromEntries(
        modeNames.map((modeName) => {
          const modeValue = listValuesByMode.get(modeName)!;
          return [modeName, modeValue.values[itemIndex].value];
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
    });
  }

  const firstScalarValue = firstModeValue.kind === 'scalar' ? firstModeValue : null;
  if (!firstScalarValue) return [];

  if (!path) {
    diagnostics.push({
      id: `${node.id}-missing-path`,
      severity: 'error',
      nodeId: node.id,
      message: `${node.label}: choose an output token path.`,
    });
    return [];
  }

  const scalarModeValues = new Map<string, TokenValue | TokenReference>();
  for (const modeName of modeNames) {
    const value = valuesByMode[modeName];
    if (!value) {
      diagnostics.push({
        id: `${node.id}-missing-${modeName}`,
        severity: 'error',
        nodeId: node.id,
        message: `${node.label}: ${modeName} has no output value. Connect inputs that evaluate for every target mode.`,
      });
      continue;
    }
    if (value.kind !== 'scalar') {
      diagnostics.push({
        id: `${node.id}-non-scalar-${modeName}`,
        severity: 'error',
        nodeId: node.id,
        message: `${node.label}: ${modeName} produces a series. Use Series output or pick one item first.`,
      });
      continue;
    }
    scalarModeValues.set(modeName, value.value);
  }
  if (scalarModeValues.size !== modeNames.length) return [];

  const modeValues = Object.fromEntries(
    modeNames.map((modeName) => [modeName, scalarModeValues.get(modeName)!]),
  ) as Record<string, TokenValue | TokenReference>;

  return [
    makeOutput({
      document,
      node,
      targetCollection,
      outputPath: path,
      outputKey: path,
      modeValues,
      type:
        (node.data.tokenType as TokenType | undefined) ??
        inferTokenType(firstScalarValue.value),
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
  document: TokenGeneratorDocument;
  node: TokenGeneratorNode;
  targetCollection: TokenCollection;
  outputPath: string;
  outputKey: string;
  modeValues: Record<string, TokenValue | TokenReference>;
  type: TokenType;
  existingTokens: Record<string, Token>;
}): TokenGeneratorPreviewOutput {
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
  const provenance = readGeneratorProvenance(existingToken);
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
      (provenance?.generatorId !== document.id ||
        (provenance.generatorId === document.id &&
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
