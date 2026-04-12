import { flattenTokenGroup, type DTCGGroup, type DTCGToken } from '@tokenmanager/core';
import type { ReadVariableCollection, ReadVariableToken } from '../../shared/types';
import { apiFetch, createFetchSignal } from './apiFetch';
import { stableStringify } from './utils';

export type SyncWorkflowStage = 'preflight' | 'compare' | 'apply';

export type SyncWorkflowTone = 'current' | 'complete' | 'pending' | 'blocked';

export type PublishPreflightStage = 'idle' | 'running' | 'blocked' | 'advisory' | 'ready';

export type PublishPreflightSeverity = 'blocking' | 'advisory';

export type PublishPreflightActionId =
  | 'push-missing-variables'
  | 'delete-orphan-variables'
  | 'review-variable-scopes'
  | 'add-token-descriptions'
  | 'review-draft-tokens'
  | 'review-audit-findings';

export interface PublishPreflightCluster {
  id: string;
  label: string;
  status: 'pass' | 'fail';
  severity: PublishPreflightSeverity;
  affectedCount?: number;
  detail?: string;
  recommendedActionLabel?: string;
  recommendedActionId?: PublishPreflightActionId;
}

export interface PublishPreflightState {
  stage: PublishPreflightStage;
  isOutdated: boolean;
  blockingCount: number;
  advisoryCount: number;
  canProceed: boolean;
}

export const DEFAULT_PUBLISH_PREFLIGHT_STATE: PublishPreflightState = {
  stage: 'idle',
  isOutdated: false,
  blockingCount: 0,
  advisoryCount: 0,
  canProceed: false,
};

export type SyncDirection = 'push' | 'pull' | 'skip';

export interface DiffRowBase {
  path: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
  localType?: string;
  figmaType?: string;
  localScopes?: string[];
  figmaScopes?: string[];
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

export interface LoadSyncSnapshotParams<TLocal, TFigma, TRow extends DiffRowBase> extends SyncDiffConfig<TLocal, TFigma, TRow> {
  serverUrl: string;
  activeSet: string;
  readFigmaTokens: () => Promise<unknown[]>;
  signal?: AbortSignal;
  figmaTimeoutMs?: number;
  figmaTimeoutMessage?: string;
}

interface SyncBuildersSpec<TEntry extends SyncEntry> {
  fromFigmaToken: (token: any) => TEntry;
  fromLocalToken: (token: DTCGToken) => TEntry | null;
  isEqual: (a: unknown, b: unknown) => boolean;
  displayValue: (raw: unknown, type: string) => string;
}

const STYLE_TYPES = new Set(['color', 'gradient', 'typography', 'shadow']);
const DEFAULT_VARIABLE_COLLECTION_NAME = 'TokenManager';

function scopesEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const aArr = a?.length ? [...a].sort() : [];
  const bArr = b?.length ? [...b].sort() : [];
  return aArr.length === bArr.length && aArr.every((scope, index) => scope === bArr[index]);
}

function withOptionalTimeout<T>(promise: Promise<T>, timeoutMs?: number, timeoutMessage?: string): Promise<T> {
  if (!timeoutMs) return promise;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage ?? `Timed out after ${timeoutMs} ms.`)), timeoutMs);
    }),
  ]);
}

function summarizeStyleValue(value: unknown, type: string): string {
  if (type === 'color') return String(value);
  if (type === 'gradient' && value && typeof value === 'object' && Array.isArray((value as { stops?: unknown[] }).stops)) {
    const gradient = value as { type?: string; stops: Array<{ color?: string }> };
    const gradientType = gradient.type ?? 'linear';
    const stopColors = gradient.stops.map((stop) => stop?.color ?? '').filter(Boolean).join(' → ');
    return `${gradientType}: ${stopColors}`.slice(0, 48);
  }
  if (type === 'typography' && value && typeof value === 'object') {
    const typography = value as { fontFamily?: string | string[]; fontSize?: { value?: number; unit?: string } | string | number };
    const family = Array.isArray(typography.fontFamily) ? typography.fontFamily[0] : typography.fontFamily;
    const size = typeof typography.fontSize === 'object'
      ? `${typography.fontSize?.value ?? ''}${typography.fontSize?.unit ?? ''}`
      : String(typography.fontSize ?? '');
    return `${family ?? ''}${size ? ` ${size}` : ''}`.trim() || JSON.stringify(value).slice(0, 28);
  }
  if (type === 'shadow') {
    const layers = Array.isArray(value) ? value : [value];
    return layers.map((layer: any) => layer?.color ?? '').join(', ').slice(0, 28);
  }
  return JSON.stringify(value).slice(0, 28);
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

export const variablePublishDiffConfig = createPublishSyncBuilders<PublishSyncEntry>({
  fromFigmaToken: (token) => ({
    raw: String(token.$value ?? ''),
    type: String(token.$type ?? 'string'),
    scopes: Array.isArray(token.$scopes) ? token.$scopes : undefined,
    description: typeof token.$description === 'string' && token.$description.trim().length > 0 ? token.$description : undefined,
  }),
  fromLocalToken: (token) => {
    const scopes =
      Array.isArray(token.$extensions?.['com.figma.scopes']) ? token.$extensions['com.figma.scopes'] :
      Array.isArray((token as { $scopes?: unknown[] }).$scopes) ? (token as { $scopes: string[] }).$scopes :
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
    raw: token.$value,
    type: String(token.$type ?? 'string'),
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

export function selectVariableCollectionTokens(
  collections: unknown[],
  activeSet: string,
  collectionMap: Record<string, string>,
  modeMap: Record<string, string>,
): ReadVariableToken[] {
  const typedCollections = collections as ReadVariableCollection[];
  const desiredCollectionName = collectionMap[activeSet] ?? DEFAULT_VARIABLE_COLLECTION_NAME;
  const desiredModeName = modeMap[activeSet];
  const matchingCollections = typedCollections.filter((collection) => collection.name === desiredCollectionName);

  return matchingCollections.flatMap((collection) => {
    const targetMode = desiredModeName
      ? collection.modes.find((mode) => mode.modeName === desiredModeName)
      : collection.modes[0];
    return targetMode?.tokens ?? [];
  });
}

export function buildVariablePublishFigmaMap(
  collections: unknown[],
  activeSet: string,
  collectionMap: Record<string, string>,
  modeMap: Record<string, string>,
) {
  const tokens = selectVariableCollectionTokens(collections, activeSet, collectionMap, modeMap);
  return variablePublishDiffConfig.buildFigmaMap(tokens);
}

export async function loadSyncSnapshot<TLocal, TFigma, TRow extends DiffRowBase>({
  serverUrl,
  activeSet,
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
    `${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`,
    { signal: createFetchSignal(signal) },
  );
  const localTokens = flattenTokenGroup((data.tokens ?? {}) as DTCGGroup);
  const figmaMap = buildFigmaMap(figmaTokens);
  const localMap = buildLocalMap(localTokens);

  const rows: TRow[] = [];
  for (const [path, local] of localMap) {
    const figma = figmaMap.get(path);
    if (!figma) {
      rows.push(buildLocalOnlyRow(path, local));
    } else if (isConflict(local, figma)) {
      rows.push(buildConflictRow(path, local, figma));
    }
  }
  for (const [path, figma] of figmaMap) {
    if (!localMap.has(path)) {
      rows.push(buildFigmaOnlyRow(path, figma));
    }
  }

  const dirs: Record<string, SyncDirection> = {};
  for (const row of rows) {
    dirs[row.path] = row.cat === 'figma-only' ? 'pull' : 'push';
  }

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
