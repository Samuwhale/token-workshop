import {
  flattenTokenGroup,
  readTokenModeValuesForCollection,
  type TokenCollection,
  type DTCGGroup,
  type DTCGToken,
  type ResolverInput,
} from '@token-workshop/core';
import type {
  ReadVariableCollection,
  ReadVariableToken,
  VariableSyncToken,
  TokenMapEntry,
} from '../../shared/types';
import { apiFetch, createFetchSignal } from './apiFetch';
import { coerceBooleanValue, stableStringify, truncateValueForDisplay } from './utils';
import { resolveAllAliases } from '../../shared/resolveAlias';
import type {
  WorkflowStageIndicatorItem,
  WorkflowStageTone,
} from './WorkflowStageIndicators';

export type SyncWorkflowStage = 'preflight' | 'compare' | 'apply';

export type SyncWorkflowTone = WorkflowStageTone;
export type SyncWorkflowItem = WorkflowStageIndicatorItem<SyncWorkflowStage>;

export type PublishPreflightStage = 'idle' | 'running' | 'blocked' | 'advisory' | 'ready';

export type PublishPreflightSeverity = 'blocking' | 'advisory';

export type PublishPreflightActionId =
  | 'push-missing-variables'
  | 'delete-orphan-variables'
  | 'review-variable-scopes'
  | 'add-token-descriptions'
  | 'review-draft-tokens'
  | 'review-generator-issues'
  | 'review-health-findings';

export interface PublishPreflightCluster {
  id: string;
  label: string;
  status: 'pass' | 'fail';
  severity: PublishPreflightSeverity;
  affectedCount?: number;
  detail?: string;
  recommendedActionLabel?: string;
  recommendedActionId?: PublishPreflightActionId;
  recommendedGeneratorId?: string;
  recommendedGeneratorDiagnosticId?: string;
  recommendedGeneratorNodeId?: string;
  recommendedGeneratorEdgeId?: string;
}

export interface PublishPreflightState {
  stage: PublishPreflightStage;
  isOutdated: boolean;
  blockingCount: number;
  advisoryCount: number;
  canProceed: boolean;
  targetDirty: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const DEFAULT_PUBLISH_PREFLIGHT_STATE: PublishPreflightState = {
  stage: 'idle',
  isOutdated: false,
  blockingCount: 0,
  advisoryCount: 0,
  canProceed: false,
  targetDirty: false,
};

export type SyncDirection = 'push' | 'pull' | 'skip';
export type VariablePublishCompareMode = 'standard' | 'resolver-publish';

export interface SyncFailure {
  path: string;
  error: string;
}

export interface SyncSkippedToken {
  path: string;
  $type: string;
}

export interface SyncApplyResultBase {
  count: number;
  total: number;
  failures: SyncFailure[];
  skipped: SyncSkippedToken[];
  created?: number;
  overwritten?: number;
}

export interface SyncApplyResult<TSnapshot> extends SyncApplyResultBase {
  snapshot?: TSnapshot;
}

export interface SyncRevertResult {
  failures: string[];
}

export interface DiffRowBase {
  id?: string;
  path: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
  localType?: string;
  figmaType?: string;
  localScopes?: string[];
  figmaScopes?: string[];
  targetLabel?: string;
  targetCollectionName?: string;
  targetModeName?: string;
  pullDisabledReason?: string;
}

export interface PublishDiffRow extends DiffRowBase {
  localValue?: string;
  figmaValue?: string;
  localRaw?: unknown;
  figmaRaw?: unknown;
}

export interface SyncEntry {
  raw: unknown;
  type: string;
  scopes?: string[];
  description?: string;
}

export interface PublishSyncEntry extends SyncEntry {
  token?: DTCGToken;
}

export interface VariableCompareToken {
  path: string;
  $type: string;
  $value: unknown;
}

export interface SyncDiffConfig<TLocal, TFigma, TRow extends DiffRowBase> {
  buildFigmaMap: (tokens: unknown[]) => Map<string, TFigma>;
  buildLocalMap: (tokens: Map<string, DTCGToken>) => Map<string, TLocal>;
  buildLocalOnlyRow: (path: string, local: TLocal) => TRow;
  buildFigmaOnlyRow: (path: string, figma: TFigma) => TRow;
  buildConflictRow: (path: string, local: TLocal, figma: TFigma) => TRow;
  isConflict: (local: TLocal, figma: TFigma) => boolean;
}

export interface SyncSnapshot<TLocal, TFigma, TRow extends DiffRowBase> {
  localTokens: Map<string, DTCGToken>;
  figmaTokens: unknown[];
  localMap: Map<string, TLocal>;
  figmaMap: Map<string, TFigma>;
  rows: TRow[];
  dirs: Record<string, SyncDirection>;
}

export interface LoadSyncSnapshotParams<TLocal, TFigma, TRow extends DiffRowBase>
  extends SyncDiffConfig<TLocal, TFigma, TRow> {
  serverUrl: string;
  currentCollectionId: string;
  readFigmaTokens: () => Promise<unknown[]>;
  signal?: AbortSignal;
  figmaTimeoutMs?: number;
  figmaTimeoutMessage?: string;
}

export interface ResolverPublishSyncMapping {
  key: string;
  label: string;
  contexts: ResolverInput;
  collectionName?: string;
  modeName: string;
}

export interface VariablePublishSnapshotParams {
  serverUrl: string;
  currentCollectionId: string;
  collections?: TokenCollection[];
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  readFigmaTokens: () => Promise<unknown[]>;
  signal?: AbortSignal;
  figmaTimeoutMs?: number;
  figmaTimeoutMessage?: string;
  resolverName?: string | null;
  resolverPublishMappings?: ResolverPublishSyncMapping[];
}

interface SyncBuildersSpec<TEntry extends SyncEntry> {
  fromFigmaToken: (token: unknown) => TEntry;
  fromLocalToken: (token: DTCGToken) => TEntry | null;
  isEqual: (a: unknown, b: unknown) => boolean;
  displayValue: (raw: unknown, type: string) => string;
}

interface BuildSyncRowsFromMapsParams<TLocal, TFigma, TRow extends DiffRowBase> {
  localMap: Map<string, TLocal>;
  figmaMap: Map<string, TFigma>;
  buildLocalOnlyRow: (path: string, local: TLocal) => TRow;
  buildFigmaOnlyRow: (path: string, figma: TFigma) => TRow;
  buildConflictRow: (path: string, local: TLocal, figma: TFigma) => TRow;
  isConflict: (local: TLocal, figma: TFigma) => boolean;
  resolvePath?: (key: string, local?: TLocal, figma?: TFigma) => string;
  decorateRow?: (row: TRow, key: string, local?: TLocal, figma?: TFigma) => TRow;
  defaultDirection?: (row: TRow, key: string, local?: TLocal, figma?: TFigma) => SyncDirection;
}

interface ResolverResolveResponse {
  tokens: Record<string, {
    $value: unknown;
    $type?: string;
    $description?: string;
    $extensions?: VariableSyncToken['$extensions'];
  }>;
}

const STYLE_TYPES = new Set(['color', 'gradient', 'typography', 'shadow']);
const DEFAULT_VARIABLE_COLLECTION_NAME = 'Token Workshop';

export interface StandardVariablePublishTarget {
  key: string;
  sourceModeName?: string;
  collectionName: string;
  modeName?: string;
  label: string;
}

export function getDiffRowId(row: DiffRowBase): string {
  return row.id ?? row.path;
}

function scopesEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const aArr = a?.length ? [...a].sort() : [];
  const bArr = b?.length ? [...b].sort() : [];
  return aArr.length === bArr.length && aArr.every((scope, index) => scope === bArr[index]);
}

function withOptionalTimeout<T>(promise: Promise<T>, timeoutMs?: number, timeoutMessage?: string): Promise<T> {
  if (!timeoutMs) return promise;
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage ?? `Timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function summarizeGradientValue(value: unknown): string | null {
  const source = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.stops)
      ? value.stops
      : null;
  if (!source) {
    return null;
  }

  const gradientType =
    isRecord(value) && typeof value.type === 'string'
      ? value.type
      : 'linear';
  const stopColors = source
    .map((stop) => (isRecord(stop) && typeof stop.color === 'string' ? stop.color : ''))
    .filter(Boolean)
    .join(' → ');

  return `${gradientType}: ${stopColors || `${source.length} stops`}`.slice(0, 48);
}

function summarizeStyleValue(value: unknown, type: string): string {
  if (type === 'color') return String(value);
  if (type === 'gradient') {
    return summarizeGradientValue(value) ?? truncateValueForDisplay(value, 28);
  }
  if (type === 'typography' && value && typeof value === 'object') {
    const typography = value as { fontFamily?: string | string[]; fontSize?: { value?: number; unit?: string } | string | number };
    const family = Array.isArray(typography.fontFamily) ? typography.fontFamily[0] : typography.fontFamily;
    const size = typeof typography.fontSize === 'object'
      ? `${typography.fontSize?.value ?? ''}${typography.fontSize?.unit ?? ''}`
      : String(typography.fontSize ?? '');
    return `${family ?? ''}${size ? ` ${size}` : ''}`.trim() || truncateValueForDisplay(value, 28);
  }
  if (type === 'shadow') {
    const layers = Array.isArray(value) ? value : [value];
    return layers
      .map((layer) => (isRecord(layer) && typeof layer.color === 'string' ? layer.color : ''))
      .filter(Boolean)
      .join(', ')
      .slice(0, 28);
  }
  return truncateValueForDisplay(value, 28);
}

function createPublishSyncBuilders<TEntry extends SyncEntry>(spec: SyncBuildersSpec<TEntry>): SyncDiffConfig<TEntry, TEntry, PublishDiffRow> {
  return {
    buildFigmaMap: (tokens) =>
      new Map(tokens.map((token) => [String((token as { path: string }).path), spec.fromFigmaToken(token)])),

    buildLocalMap: (tokens) => {
      const map = new Map<string, TEntry>();
      for (const [path, token] of tokens) {
        const entry = spec.fromLocalToken(token);
        if (entry !== null) map.set(path, entry);
      }
      return map;
    },

    buildLocalOnlyRow: (path, local) => ({
      path,
      cat: 'local-only',
      localRaw: local.raw,
      localValue: spec.displayValue(local.raw, local.type),
      localType: local.type,
      localScopes: local.scopes,
    }),

    buildFigmaOnlyRow: (path, figma) => ({
      path,
      cat: 'figma-only',
      figmaRaw: figma.raw,
      figmaValue: spec.displayValue(figma.raw, figma.type),
      figmaType: figma.type,
      figmaScopes: figma.scopes,
    }),

    buildConflictRow: (path, local, figma) => ({
      path,
      cat: 'conflict',
      localRaw: local.raw,
      figmaRaw: figma.raw,
      localValue: spec.displayValue(local.raw, local.type),
      figmaValue: spec.displayValue(figma.raw, figma.type),
      localType: local.type,
      figmaType: figma.type,
      localScopes: local.scopes,
      figmaScopes: figma.scopes,
    }),

    isConflict: (local, figma) =>
      !spec.isEqual(local.raw, figma.raw) || !scopesEqual(local.scopes, figma.scopes),
  };
}

function buildSyncRowsFromMaps<TLocal, TFigma, TRow extends DiffRowBase>({
  localMap,
  figmaMap,
  buildLocalOnlyRow,
  buildFigmaOnlyRow,
  buildConflictRow,
  isConflict,
  resolvePath,
  decorateRow,
  defaultDirection,
}: BuildSyncRowsFromMapsParams<TLocal, TFigma, TRow>): Pick<SyncSnapshot<TLocal, TFigma, TRow>, 'rows' | 'dirs'> {
  const rows: TRow[] = [];
  const dirs: Record<string, SyncDirection> = {};

  const pushRow = (key: string, row: TRow, local?: TLocal, figma?: TFigma) => {
    const nextRow = decorateRow?.(row, key, local, figma) ?? row;
    rows.push(nextRow);
    dirs[getDiffRowId(nextRow)] = defaultDirection?.(nextRow, key, local, figma) ?? (nextRow.cat === 'figma-only' ? 'pull' : 'push');
  };

  for (const [key, local] of localMap) {
    const figma = figmaMap.get(key);
    const path = resolvePath?.(key, local, figma) ?? key;
    if (!figma) {
      pushRow(key, buildLocalOnlyRow(path, local), local);
    } else if (isConflict(local, figma)) {
      pushRow(key, buildConflictRow(path, local, figma), local, figma);
    }
  }

  for (const [key, figma] of figmaMap) {
    if (localMap.has(key)) continue;
    const path = resolvePath?.(key, undefined, figma) ?? key;
    pushRow(key, buildFigmaOnlyRow(path, figma), undefined, figma);
  }

  return { rows, dirs };
}

function buildResolverTargetLabel(mapping: ResolverPublishSyncMapping): string {
  const collectionName = mapping.collectionName?.trim() || DEFAULT_VARIABLE_COLLECTION_NAME;
  return `${mapping.label} → ${collectionName} / ${mapping.modeName}`;
}

function createResolverRowKey(mappingKey: string, path: string): string {
  return `${mappingKey}::${path}`;
}

function createStandardModeRowKey(modeKey: string, path: string): string {
  return `${modeKey}::${path}`;
}

function parseStandardModeRowId(rowId: string): { modeKey: string; path: string } | null {
  const separatorIndex = rowId.indexOf('::');
  if (separatorIndex < 0) return null;
  return {
    modeKey: rowId.slice(0, separatorIndex),
    path: rowId.slice(separatorIndex + 2),
  };
}

export function buildStandardVariablePublishTargets({
  currentCollectionId,
  collection,
  collectionMap,
  modeMap,
}: {
  currentCollectionId: string;
  collection?: TokenCollection;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
}): StandardVariablePublishTarget[] {
  const collectionName = collectionMap[currentCollectionId] ?? DEFAULT_VARIABLE_COLLECTION_NAME;
  const modes = collection?.modes ?? [];

  if (modes.length > 1) {
    return modes.map((mode) => ({
      key: mode.name,
      sourceModeName: mode.name,
      collectionName,
      modeName: mode.name,
      label: `${collectionName} / ${mode.name}`,
    }));
  }

  const modeName = modeMap[currentCollectionId] || modes[0]?.name;
  return [
    {
      key: modeName || '__default__',
      sourceModeName: modes[0]?.name,
      collectionName,
      modeName,
      label: modeName ? `${collectionName} / ${modeName}` : collectionName,
    },
  ];
}

function createResolvedTokenMap(tokens: ResolverResolveResponse['tokens']): Map<string, DTCGToken> {
  const resolvedTokens = resolveAllAliases(tokens as Record<string, TokenMapEntry>);
  return new Map(
    Object.entries(resolvedTokens).map(([path, token]) => [
      path,
      {
        $value: token.$value,
        $type: token.$type ?? 'string',
        ...(token.$description ? { $description: token.$description } : {}),
        ...(token.$extensions ? { $extensions: token.$extensions } : {}),
      } as DTCGToken,
    ]),
  );
}

async function loadResolverVariablePublishSnapshot({
  serverUrl,
  resolverName,
  resolverPublishMappings,
  readFigmaTokens,
  signal,
  figmaTimeoutMs,
  figmaTimeoutMessage,
}: {
  serverUrl: string;
  resolverName: string;
  readFigmaTokens: () => Promise<unknown[]>;
} &
  Pick<VariablePublishSnapshotParams, 'signal' | 'figmaTimeoutMs' | 'figmaTimeoutMessage'> & {
    resolverPublishMappings: ResolverPublishSyncMapping[];
  }): Promise<SyncSnapshot<PublishSyncEntry, PublishSyncEntry, PublishDiffRow>> {
  const figmaTokens = await withOptionalTimeout(
    readFigmaTokens(),
    figmaTimeoutMs,
    figmaTimeoutMessage,
  );

  const typedCollections = figmaTokens as ReadVariableCollection[];
  const resolvedTargets = await Promise.all(
    resolverPublishMappings.map(async (mapping) => ({
      mapping,
      result: await apiFetch<ResolverResolveResponse>(
        `${serverUrl}/api/resolvers/${encodeURIComponent(resolverName)}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: mapping.contexts }),
          signal: createFetchSignal(signal),
        },
      ),
    })),
  );

  const localTokens = new Map<string, DTCGToken>();
  const localMap = new Map<string, PublishSyncEntry>();
  const figmaMap = new Map<string, PublishSyncEntry>();
  const pathByKey = new Map<string, string>();
  const targetLabelByKey = new Map<string, string>();
  const targetCollectionByKey = new Map<string, string>();
  const targetModeByKey = new Map<string, string>();

  for (const { mapping, result } of resolvedTargets) {
    const targetLabel = buildResolverTargetLabel(mapping);
    const resolvedTokenMap = createResolvedTokenMap(result.tokens ?? {});
    const resolverLocalMap = variablePublishDiffConfig.buildLocalMap(resolvedTokenMap);
    const resolverFigmaMap = variablePublishDiffConfig.buildFigmaMap(
      selectVariableModeTokens(
        typedCollections,
        mapping.collectionName ?? DEFAULT_VARIABLE_COLLECTION_NAME,
        mapping.modeName,
      ),
    );

    for (const [path, token] of resolvedTokenMap) {
      localTokens.set(path, token);
    }

    for (const [path, entry] of resolverLocalMap) {
      const rowKey = createResolverRowKey(mapping.key, path);
      localMap.set(rowKey, entry);
      pathByKey.set(rowKey, path);
      targetLabelByKey.set(rowKey, targetLabel);
      targetCollectionByKey.set(rowKey, mapping.collectionName?.trim() || DEFAULT_VARIABLE_COLLECTION_NAME);
      targetModeByKey.set(rowKey, mapping.modeName);
    }

    for (const [path, entry] of resolverFigmaMap) {
      const rowKey = createResolverRowKey(mapping.key, path);
      figmaMap.set(rowKey, entry);
      pathByKey.set(rowKey, path);
      targetLabelByKey.set(rowKey, targetLabel);
      targetCollectionByKey.set(rowKey, mapping.collectionName?.trim() || DEFAULT_VARIABLE_COLLECTION_NAME);
      targetModeByKey.set(rowKey, mapping.modeName);
    }
  }

  const { rows, dirs } = buildSyncRowsFromMaps({
    localMap,
    figmaMap,
    resolvePath: (key) => pathByKey.get(key) ?? key,
    decorateRow: (row, key) => ({
      ...row,
      id: key,
      targetLabel: targetLabelByKey.get(key),
      targetCollectionName: targetCollectionByKey.get(key),
      targetModeName: targetModeByKey.get(key),
    }),
    defaultDirection: (row) => (row.cat === 'figma-only' ? 'skip' : 'push'),
    ...variablePublishDiffConfig,
  });

  return {
    localTokens,
    figmaTokens,
    localMap,
    figmaMap,
    rows,
    dirs,
  };
}

export const variablePublishDiffConfig = createPublishSyncBuilders<PublishSyncEntry>({
  fromFigmaToken: (token) => ({
    raw: String((token as { reference?: unknown; $value?: unknown }).reference ?? (token as { $value?: unknown }).$value ?? ''),
    type: String((token as { $type?: unknown }).$type ?? 'string'),
    scopes: Array.isArray((token as { $scopes?: unknown[] }).$scopes)
      ? ((token as { $scopes: string[] }).$scopes)
      : undefined,
    description: typeof (token as { $description?: unknown }).$description === 'string' &&
      (token as { $description: string }).$description.trim().length > 0
      ? (token as { $description: string }).$description
      : undefined,
  }),
  fromLocalToken: (token) => {
    const scopes =
      Array.isArray(token.$extensions?.['com.figma.scopes']) ? token.$extensions['com.figma.scopes'] :
      Array.isArray((token as unknown as { $scopes?: unknown[] }).$scopes)
        ? (token as unknown as { $scopes: string[] }).$scopes
        :
      undefined;
    return {
      raw: String(token.$value),
      type: String(token.$type ?? 'string'),
      scopes,
      token,
    };
  },
  isEqual: (a, b) => a === b,
  displayValue: (raw) => String(raw),
});

export const stylePublishDiffConfig = createPublishSyncBuilders<PublishSyncEntry>({
  fromFigmaToken: (token) => ({
    raw: (token as { $value?: unknown }).$value,
    type: String((token as { $type?: unknown }).$type ?? 'string'),
  }),
  fromLocalToken: (token) => {
    const type = String(token.$type ?? 'string');
    if (!STYLE_TYPES.has(type)) return null;
    return { raw: token.$value, type, token };
  },
  isEqual: (a, b) => stableStringify(a) === stableStringify(b),
  displayValue: summarizeStyleValue,
});

export function buildPublishPullPayload(row: PublishDiffRow) {
  return { $type: row.figmaType ?? 'string', $value: row.figmaRaw };
}

export function selectVariableModeTokens(
  collections: unknown[],
  collectionName: string,
  modeName?: string,
): ReadVariableToken[] {
  const typedCollections = collections as ReadVariableCollection[];
  const matchingCollections = typedCollections.filter((collection) => collection.name === collectionName);

  return matchingCollections.flatMap((collection) => {
    const targetMode = modeName
      ? collection.modes.find((mode) => mode.modeName === modeName)
      : collection.modes[0];
    return targetMode?.tokens ?? [];
  });
}

function buildStandardVariablePublishFigmaMap({
  figmaCollections,
  currentCollectionId,
  sourceCollections,
  collectionMap,
  modeMap,
  targetByKey,
  pathByKey,
}: {
  figmaCollections: unknown[];
  currentCollectionId: string;
  sourceCollections?: TokenCollection[];
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  targetByKey?: Map<string, StandardVariablePublishTarget>;
  pathByKey?: Map<string, string>;
}): Map<string, PublishSyncEntry> {
  const collection = sourceCollections?.find((entry) => entry.id === currentCollectionId);
  const targets = buildStandardVariablePublishTargets({
    currentCollectionId,
    collection,
    collectionMap,
    modeMap,
  });
  const figmaMap = new Map<string, PublishSyncEntry>();

  for (const target of targets) {
    const modeTokens = selectVariableModeTokens(
      figmaCollections,
      target.collectionName,
      target.modeName,
    );
    const modeMapEntries = variablePublishDiffConfig.buildFigmaMap(modeTokens);
    for (const [path, entry] of modeMapEntries) {
      const rowKey = createStandardModeRowKey(target.key, path);
      figmaMap.set(rowKey, entry);
      pathByKey?.set(rowKey, path);
      targetByKey?.set(rowKey, target);
    }
  }

  return figmaMap;
}

function buildStandardVariablePublishLocalMap({
  localTokens,
  currentCollectionId,
  sourceCollections,
  collectionMap,
  modeMap,
  targetByKey,
  pathByKey,
}: {
  localTokens: Map<string, DTCGToken>;
  currentCollectionId: string;
  sourceCollections?: TokenCollection[];
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  targetByKey: Map<string, StandardVariablePublishTarget>;
  pathByKey: Map<string, string>;
}): Map<string, PublishSyncEntry> {
  const collection = sourceCollections?.find((entry) => entry.id === currentCollectionId);
  const targets = buildStandardVariablePublishTargets({
    currentCollectionId,
    collection,
    collectionMap,
    modeMap,
  });
  const keyedTokens = new Map<string, DTCGToken>();

  for (const [path, token] of localTokens) {
    const modeValues = collection
      ? readTokenModeValuesForCollection(token, collection)
      : {};

    for (const target of targets) {
      const rowKey = createStandardModeRowKey(target.key, path);
      const targetModeValue = target.sourceModeName
        ? modeValues[target.sourceModeName]
        : undefined;
      const sourceValue =
        targetModeValue !== undefined
          ? targetModeValue
          : token.$value;
      keyedTokens.set(rowKey, {
        ...token,
        $value: sourceValue,
      });
      pathByKey.set(rowKey, path);
      targetByKey.set(rowKey, target);
    }
  }

  return variablePublishDiffConfig.buildLocalMap(keyedTokens);
}

function normalizeVariableComparableValue(
  value: unknown,
  type: string,
): unknown {
  switch (type) {
    case 'dimension': {
      const raw =
        value !== null &&
        typeof value === 'object' &&
        'value' in value
          ? (value as { value: unknown }).value
          : value;
      if (typeof raw === 'number') {
        return raw;
      }
      const parsed = Number.parseFloat(String(raw));
      return Number.isNaN(parsed) ? raw : parsed;
    }
    case 'number':
    case 'fontWeight':
    case 'percentage': {
      if (typeof value === 'number') {
        return value;
      }
      if (value !== null && typeof value === 'object' && 'value' in value) {
        const raw = (value as { value: unknown }).value;
        return typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
      }
      const parsed = Number.parseFloat(String(value));
      return Number.isNaN(parsed) ? value : parsed;
    }
    case 'lineHeight':
    case 'letterSpacing': {
      if (typeof value === 'number') {
        return value;
      }
      if (value !== null && typeof value === 'object' && 'value' in value) {
        const raw = (value as { value: unknown }).value;
        return typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
      }
      const parsed = Number.parseFloat(String(value));
      return Number.isNaN(parsed) ? value : parsed;
    }
    case 'boolean':
      return coerceBooleanValue(value);
    case 'string':
    case 'fontFamily':
      return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
    default:
      return value;
  }
}

export function summarizeVariableDiff(
  localTokens: VariableCompareToken[],
  figmaTokens: ReadVariableToken[],
): { added: number; modified: number; unchanged: number } {
  const figmaValueByPath = new Map(
    figmaTokens.map((token) => [
      token.path,
      stableStringify(
        normalizeVariableComparableValue(token.reference ?? token.$value, token.$type),
      ),
    ]),
  );

  let added = 0;
  let modified = 0;
  let unchanged = 0;

  for (const token of localTokens) {
    const localValue = stableStringify(
      normalizeVariableComparableValue(token.$value, token.$type),
    );
    const figmaValue = figmaValueByPath.get(token.path);

    if (figmaValue === undefined) {
      added += 1;
    } else if (figmaValue === localValue) {
      unchanged += 1;
    } else {
      modified += 1;
    }
  }

  return { added, modified, unchanged };
}

export function buildVariablePublishFigmaMap(
  collections: unknown[],
  currentCollectionId: string,
  collectionMap: Record<string, string>,
  modeMap: Record<string, string>,
  sourceCollections?: TokenCollection[],
) {
  return buildStandardVariablePublishFigmaMap({
    figmaCollections: collections,
    currentCollectionId,
    sourceCollections,
    collectionMap,
    modeMap,
  });
}

export async function loadVariablePublishSnapshot({
  serverUrl,
  currentCollectionId,
  collections,
  collectionMap,
  modeMap,
  readFigmaTokens,
  signal,
  figmaTimeoutMs,
  figmaTimeoutMessage,
  resolverName,
  resolverPublishMappings,
}: VariablePublishSnapshotParams): Promise<SyncSnapshot<PublishSyncEntry, PublishSyncEntry, PublishDiffRow>> {
  if (resolverName && resolverPublishMappings && resolverPublishMappings.length > 0) {
    return loadResolverVariablePublishSnapshot({
      serverUrl,
      resolverName,
      resolverPublishMappings,
      readFigmaTokens,
      signal,
      figmaTimeoutMs,
      figmaTimeoutMessage,
    });
  }

  const figmaTokens = await withOptionalTimeout(
    readFigmaTokens(),
    figmaTimeoutMs,
    figmaTimeoutMessage,
  );
  const data = await apiFetch<{ tokens?: Record<string, unknown> }>(
    `${serverUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}`,
    { signal: createFetchSignal(signal) },
  );
  const localTokens = flattenTokenGroup((data.tokens ?? {}) as DTCGGroup);
  const targetByKey = new Map<string, StandardVariablePublishTarget>();
  const pathByKey = new Map<string, string>();
  const sourceCollection = collections?.find((collection) => collection.id === currentCollectionId);
  const multiModePublish = (sourceCollection?.modes.length ?? 0) > 1;
  const localMap = buildStandardVariablePublishLocalMap({
    localTokens,
    currentCollectionId,
    sourceCollections: collections,
    collectionMap,
    modeMap,
    targetByKey,
    pathByKey,
  });
  const figmaMap = buildStandardVariablePublishFigmaMap({
    figmaCollections: figmaTokens,
    currentCollectionId,
    sourceCollections: collections,
    collectionMap,
    modeMap,
    targetByKey,
    pathByKey,
  });
  const { rows, dirs } = buildSyncRowsFromMaps({
    localMap,
    figmaMap,
    resolvePath: (key) => pathByKey.get(key) ?? parseStandardModeRowId(key)?.path ?? key,
    decorateRow: (row, key) => {
      const target = targetByKey.get(key);
      return {
        ...row,
        id: key,
        targetLabel: target?.label,
        targetCollectionName: target?.collectionName,
        targetModeName: target?.modeName,
        pullDisabledReason: multiModePublish
          ? 'Import from Figma to update multi-mode collection values.'
          : undefined,
      };
    },
    defaultDirection: (row) =>
      multiModePublish && row.cat === 'figma-only' ? 'skip' : row.cat === 'figma-only' ? 'pull' : 'push',
    ...variablePublishDiffConfig,
  });

  return {
    localTokens,
    figmaTokens,
    localMap,
    figmaMap,
    rows,
    dirs,
  };
}

export async function loadSyncSnapshot<TLocal, TFigma, TRow extends DiffRowBase>({
  serverUrl,
  currentCollectionId,
  readFigmaTokens,
  signal,
  figmaTimeoutMs,
  figmaTimeoutMessage,
  buildFigmaMap,
  buildLocalMap,
  buildLocalOnlyRow,
  buildFigmaOnlyRow,
  buildConflictRow,
  isConflict,
}: LoadSyncSnapshotParams<TLocal, TFigma, TRow>): Promise<SyncSnapshot<TLocal, TFigma, TRow>> {
  const figmaTokens = await withOptionalTimeout(
    readFigmaTokens(),
    figmaTimeoutMs,
    figmaTimeoutMessage,
  );
  const data = await apiFetch<{ tokens?: Record<string, unknown> }>(
    `${serverUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}`,
    { signal: createFetchSignal(signal) },
  );
  const localTokens = flattenTokenGroup((data.tokens ?? {}) as DTCGGroup);
  const figmaMap = buildFigmaMap(figmaTokens);
  const localMap = buildLocalMap(localTokens);
  const { rows, dirs } = buildSyncRowsFromMaps({
    localMap,
    figmaMap,
    buildLocalOnlyRow,
    buildFigmaOnlyRow,
    buildConflictRow,
    isConflict,
  });

  return {
    localTokens,
    figmaTokens,
    localMap,
    figmaMap,
    rows,
    dirs,
  };
}

export function getSyncRowsByCategory<TRow extends DiffRowBase>(rows: TRow[]) {
  return {
    localOnly: rows.filter((row) => row.cat === 'local-only'),
    figmaOnly: rows.filter((row) => row.cat === 'figma-only'),
    conflicts: rows.filter((row) => row.cat === 'conflict'),
  };
}
