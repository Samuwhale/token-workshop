import { flattenTokenGroup, type DTCGGroup } from '@tokenmanager/core';
import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ReadVariableCollection, ReadVariableToken } from '../../shared/types';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { dispatchToast } from '../shared/toastBus';
import { getErrorMessage } from '../shared/utils';
import type { UndoSlot } from './useUndo';

export interface ExportedModeValue {
  resolvedValue: any;
  reference?: string;
  isAlias: boolean;
}

export interface ExportedVariable {
  path: string;
  $type: string;
  description?: string;
  hiddenFromPublishing: boolean;
  scopes: string[];
  modeValues: Record<string, ExportedModeValue>;
}

export interface ExportedCollection {
  name: string;
  modes: string[];
  variables: ExportedVariable[];
}

export type SaveMergeStrategy = 'overwrite' | 'merge' | 'skip';

export interface SavePreviewDiff {
  totalCount: number;
  newCount: number;
  changedCount: number;
  skippedCount: number;
  unchangedCount: number;
}

export interface SavePreviewItem {
  collectionName: string;
  slug: string;
  action: 'create' | 'overwrite';
  varCount: number;
  modeName?: string;
  itemKey: string;
  destinationSet: string;
  destinationExists: boolean;
  destinationTokenCount: number;
  mergeStrategy: SaveMergeStrategy;
  appendPath: string;
  diff: SavePreviewDiff;
}

export interface SavePreviewRow extends SavePreviewItem {
  effectiveDestination: string;
  effectiveMergeStrategy: SaveMergeStrategy;
  effectiveAppendPath: string;
  destinationChanged: boolean;
  actionLabel: 'Existing set' | 'New set';
  destinationError: string | null;
  appendPathError: string | null;
}

export type SavePhase = 'idle' | 'preview-loading' | 'preview';
export type SaveExecutionStatus = 'pending' | 'saving' | 'saved' | 'failed';

export interface SaveRunState {
  active: boolean;
  totalCount: number;
  completedCount: number;
  currentItemKey: string | null;
  itemStatuses: Record<string, SaveExecutionStatus>;
  error: string | null;
}

interface TokenPayload {
  path: string;
  $type: string;
  $value: unknown;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

interface ExistingTokenSnapshot {
  $type?: string;
  $value: unknown;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

interface SaveTargetPlan {
  itemKey: string;
  collectionName: string;
  modeName: string | null;
  destinationSet: string;
}

interface UseFigmaVariablesOptions {
  connected: boolean;
  serverUrl: string;
  sets: string[];
  addSetToState: (name: string, count: number) => void;
  refreshTokens: () => void;
  pushUndo?: (slot: UndoSlot) => void;
  setError: Dispatch<SetStateAction<string | null>>;
}

export interface FigmaVariablesState {
  figmaLoading: boolean;
  figmaCollections: ExportedCollection[];
  expandedCollection: string | null;
  setExpandedCollection: Dispatch<SetStateAction<string | null>>;
  expandedVar: string | null;
  setExpandedVar: Dispatch<SetStateAction<string | null>>;
  copiedAll: boolean;
  selectedExportMode: string | null;
  setSelectedExportMode: Dispatch<SetStateAction<string | null>>;
  savePerMode: boolean;
  setSavePerMode: Dispatch<SetStateAction<boolean>>;
  savePhase: SavePhase;
  setSavePhase: Dispatch<SetStateAction<SavePhase>>;
  savePreviewItems: SavePreviewItem[];
  setSavePreviewItems: Dispatch<SetStateAction<SavePreviewItem[]>>;
  savePreviewRows: SavePreviewRow[];
  savePreviewRefreshing: boolean;
  saveRun: SaveRunState;
  saveDestinationMap: Record<string, string>;
  setSaveDestinationMap: Dispatch<SetStateAction<Record<string, string>>>;
  slugRenames: Record<string, string>;
  setSlugRenames: Dispatch<SetStateAction<Record<string, string>>>;
  saveMergeStrategies: Record<string, SaveMergeStrategy>;
  setSaveMergeStrategies: Dispatch<SetStateAction<Record<string, SaveMergeStrategy>>>;
  saveAppendPaths: Record<string, string>;
  setSaveAppendPaths: Dispatch<SetStateAction<Record<string, string>>>;
  handleExportFigmaVariables: () => void;
  buildDTCGJson: (modeOverride?: string | null) => string;
  handleCopyAll: () => Promise<void>;
  handlePreviewSave: () => Promise<void>;
  handleConfirmSave: () => Promise<void>;
  resetSavePreview: () => void;
  formatModeValue: (modeVal: ExportedModeValue) => string;
}

const IDLE_SAVE_RUN: SaveRunState = {
  active: false,
  totalCount: 0,
  completedCount: 0,
  currentItemKey: null,
  itemStatuses: {},
  error: null,
};

function toExportedCollections(readCollections: ReadVariableCollection[]): ExportedCollection[] {
  return readCollections.map((collection) => {
    const modeNames = collection.modes.map(mode => mode.modeName);
    const variableOrder: string[] = [];
    const variablesByPath = new Map<string, ExportedVariable>();

    for (const mode of collection.modes) {
      for (const token of mode.tokens) {
        let variable = variablesByPath.get(token.path);
        if (!variable) {
          variable = {
            path: token.path,
            $type: token.$type,
            description: token.$description || undefined,
            hiddenFromPublishing: token.hiddenFromPublishing,
            scopes: [...token.$scopes],
            modeValues: {},
          };
          variablesByPath.set(token.path, variable);
          variableOrder.push(token.path);
        }

        if (!variable.description && token.$description) {
          variable.description = token.$description;
        }
        if (variable.scopes.length === 0 && token.$scopes.length > 0) {
          variable.scopes = [...token.$scopes];
        }
        variable.hiddenFromPublishing = variable.hiddenFromPublishing || token.hiddenFromPublishing;
        variable.modeValues[mode.modeName] = toExportedModeValue(token);
      }
    }

    return {
      name: collection.name,
      modes: modeNames,
      variables: variableOrder.map(path => variablesByPath.get(path)!),
    };
  });
}

function toExportedModeValue(token: ReadVariableToken): ExportedModeValue {
  if (token.isAlias) {
    return {
      resolvedValue: null,
      reference: token.reference ?? (typeof token.$value === 'string' ? token.$value : undefined),
      isAlias: true,
    };
  }

  return {
    resolvedValue: token.$value,
    isAlias: false,
  };
}

function slugifySetName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
}

function buildSaveTargetPlans(
  collections: ExportedCollection[],
  savePerMode: boolean,
): SaveTargetPlan[] {
  return collections.flatMap<SaveTargetPlan>((collection) => {
    const baseSlug = slugifySetName(collection.name);
    const isMultiMode = collection.modes.length > 1;

    if (savePerMode && isMultiMode) {
      return collection.modes.map((modeName, index) => {
        const modeSlug = slugifySetName(modeName);
        return {
          itemKey: `${collection.name}::${modeName}`,
          collectionName: collection.name,
          modeName,
          destinationSet: index === 0 ? baseSlug : `${baseSlug}-${modeSlug}`,
        };
      });
    }

    return [
      {
        itemKey: collection.name,
        collectionName: collection.name,
        modeName: null,
        destinationSet: baseSlug,
      },
    ];
  });
}

function normalizeAppendPath(value: string): string {
  const normalized = value.trim().replace(/^\.+|\.+$/g, '').replace(/\.+/g, '.');
  if (!normalized) return '';
  const segments = normalized.split('.');
  for (const segment of segments) {
    if (!segment) {
      throw new Error(`Invalid append path "${value}"`);
    }
    if (segment.startsWith('$')) {
      throw new Error(`Invalid append path "${value}": "${segment}" starts with "$"`);
    }
    if (segment.includes('/') || segment.includes('\\')) {
      throw new Error(`Invalid append path "${value}": "${segment}" contains a slash`);
    }
  }
  return normalized;
}

function getAppendPathError(value: string): string | null {
  try {
    normalizeAppendPath(value);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function prefixTokenPath(tokenPath: string, appendPath: string): string {
  return appendPath ? `${appendPath}.${tokenPath}` : tokenPath;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function areJsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (!areJsonValuesEqual(left[i], right[i])) return false;
    }
    return true;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
      if (!areJsonValuesEqual(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

function areTokensEquivalent(
  incoming: TokenPayload,
  existing: ExistingTokenSnapshot | undefined,
): boolean {
  if (!existing) return false;
  return (
    incoming.$type === existing.$type &&
    areJsonValuesEqual(incoming.$value, existing.$value) &&
    (incoming.$description ?? undefined) === (existing.$description ?? undefined) &&
    areJsonValuesEqual(incoming.$extensions ?? undefined, existing.$extensions ?? undefined)
  );
}

function areTokensEquivalentForStrategy(
  incoming: TokenPayload,
  existing: ExistingTokenSnapshot | undefined,
  strategy: SaveMergeStrategy,
): boolean {
  if (!existing) return false;
  if (strategy === 'merge') {
    return (
      incoming.$type === existing.$type &&
      areJsonValuesEqual(incoming.$value, existing.$value)
    );
  }
  return areTokensEquivalent(incoming, existing);
}

function toExistingTokenSnapshot(token: TokenPayload): ExistingTokenSnapshot {
  return {
    $type: token.$type,
    $value: token.$value,
    $description: token.$description,
    $extensions: token.$extensions,
  };
}

function applyTokensToExistingMap(
  existingTokens: Map<string, ExistingTokenSnapshot>,
  tokens: TokenPayload[],
): Map<string, ExistingTokenSnapshot> {
  const next = new Map(existingTokens);
  for (const token of tokens) {
    next.set(token.path, toExistingTokenSnapshot(token));
  }
  return next;
}

function buildTokenPayloads(
  collection: ExportedCollection,
  modeName: string | null,
  appendPath: string,
): TokenPayload[] {
  const isMultiMode = collection.modes.length > 1;

  return collection.variables.map((variable) => {
    let $value: unknown;
    if (modeName !== null) {
      const modeVal = variable.modeValues[modeName];
      $value = modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue;
    } else {
      const defaultVal = variable.modeValues[collection.modes[0]];
      $value = defaultVal.isAlias ? defaultVal.reference : defaultVal.resolvedValue;
    }

    const token: TokenPayload = {
      path: prefixTokenPath(variable.path, appendPath),
      $type: variable.$type,
      $value,
    };

    if (variable.description) token.$description = variable.description;

    if (modeName === null && isMultiMode) {
      const modeExtensions: Record<string, unknown> = {};
      for (const currentModeName of collection.modes) {
        const modeVal = variable.modeValues[currentModeName];
        modeExtensions[currentModeName] = modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue;
      }
      token.$extensions = {
        'com.figma': {
          collection: collection.name,
          hiddenFromPublishing: variable.hiddenFromPublishing,
          scopes: variable.scopes,
          modes: modeExtensions,
        },
      };
    }

    return token;
  });
}

function buildExistingTokenMap(
  tokenGroup: DTCGGroup | undefined,
): Map<string, ExistingTokenSnapshot> {
  if (!tokenGroup) return new Map();
  const flat = flattenTokenGroup(tokenGroup);
  const result = new Map<string, ExistingTokenSnapshot>();

  for (const [path, token] of flat.entries()) {
    result.set(path, {
      $type: (token as { $type?: string }).$type,
      $value: (token as { $value: unknown }).$value,
      $description: (token as { $description?: string }).$description,
      $extensions: (token as { $extensions?: Record<string, unknown> }).$extensions,
    });
  }

  return result;
}

function summarizeDiff(
  incomingTokens: TokenPayload[],
  existingTokens: Map<string, ExistingTokenSnapshot>,
  strategy: SaveMergeStrategy,
): SavePreviewDiff {
  let newCount = 0;
  let changedCount = 0;
  let skippedCount = 0;
  let unchangedCount = 0;

  for (const token of incomingTokens) {
    const existing = existingTokens.get(token.path);
    if (!existing) {
      newCount++;
      continue;
    }
    if (areTokensEquivalentForStrategy(token, existing, strategy)) {
      unchangedCount++;
      continue;
    }

    if (strategy === 'skip') {
      skippedCount++;
      continue;
    }

    changedCount++;
  }

  return {
    totalCount: incomingTokens.length,
    newCount,
    changedCount,
    skippedCount,
    unchangedCount,
  };
}

function buildSavePreviewRows(
  items: SavePreviewItem[],
  collectionsByName: Map<string, ExportedCollection>,
  existingSetNames: Set<string>,
  existingSetMaps: Map<string, Map<string, ExistingTokenSnapshot>>,
  saveDestinationMap: Record<string, string>,
  saveMergeStrategies: Record<string, SaveMergeStrategy>,
  saveAppendPaths: Record<string, string>,
): SavePreviewRow[] {
  const draftRows = items.map<SavePreviewRow>((item) => {
    const collection = collectionsByName.get(item.collectionName);
    if (!collection) {
      throw new Error(`Collection "${item.collectionName}" is no longer available`);
    }

    const effectiveDestination =
      (saveDestinationMap[item.itemKey] ?? item.destinationSet ?? item.slug).trim();
    const effectiveAppendPath = saveAppendPaths[item.itemKey] ?? item.appendPath;
    const appendPathError = getAppendPathError(effectiveAppendPath);
    const destinationExists =
      effectiveDestination.length > 0 && existingSetNames.has(effectiveDestination);
    const existingTokens = destinationExists
      ? (existingSetMaps.get(effectiveDestination) ?? new Map<string, ExistingTokenSnapshot>())
      : new Map<string, ExistingTokenSnapshot>();
    const incomingTokens = appendPathError
      ? []
      : buildTokenPayloads(
          collection,
          item.modeName ?? null,
          normalizeAppendPath(effectiveAppendPath),
        );
    const baseDiff = appendPathError
      ? item.diff
      : summarizeDiff(incomingTokens, existingTokens, 'overwrite');
    const defaultMergeStrategy: SaveMergeStrategy =
      destinationExists && baseDiff.changedCount > 0 ? 'merge' : 'overwrite';
    const effectiveMergeStrategy: SaveMergeStrategy = destinationExists
      ? (saveMergeStrategies[item.itemKey] ?? defaultMergeStrategy)
      : 'overwrite';
    const diff = appendPathError
      ? item.diff
      : summarizeDiff(incomingTokens, existingTokens, effectiveMergeStrategy);

    return {
      ...item,
      action: destinationExists ? 'overwrite' : 'create',
      destinationExists,
      destinationTokenCount: existingTokens.size,
      diff,
      effectiveDestination,
      effectiveMergeStrategy,
      effectiveAppendPath,
      destinationChanged: effectiveDestination !== item.destinationSet,
      actionLabel: destinationExists ? 'Existing set' : 'New set',
      destinationError: null,
      appendPathError,
    };
  });

  const destinationCounts = new Map<string, number>();
  for (const item of draftRows) {
    if (!item.effectiveDestination) continue;
    destinationCounts.set(
      item.effectiveDestination,
      (destinationCounts.get(item.effectiveDestination) ?? 0) + 1,
    );
  }

  return draftRows.map((item) => {
    const duplicateCount = item.effectiveDestination
      ? (destinationCounts.get(item.effectiveDestination) ?? 0)
      : 0;

    return {
      ...item,
      destinationError: !item.effectiveDestination
        ? 'Destination set is required'
        : duplicateCount > 1
          ? 'Destination is assigned more than once'
          : null,
    };
  });
}

export function useFigmaVariables({
  connected,
  serverUrl,
  sets,
  addSetToState,
  refreshTokens,
  pushUndo,
  setError,
}: UseFigmaVariablesOptions): FigmaVariablesState {
  const [figmaLoading, setFigmaLoading] = useState(false);
  const figmaLoadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const figmaReadCorrelationIdRef = useRef<string | null>(null);
  const [figmaCollections, setFigmaCollections] = useState<ExportedCollection[]>([]);
  const [expandedCollection, setExpandedCollection] = useState<string | null>(null);
  const [expandedVar, setExpandedVar] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [selectedExportMode, setSelectedExportMode] = useState<string | null>(null);
  const [savePerMode, setSavePerMode] = useState(true);
  const [savePhase, setSavePhase] = useState<SavePhase>('idle');
  const [savePreviewItems, setSavePreviewItems] = useState<SavePreviewItem[]>([]);
  const [savePreviewRows, setSavePreviewRows] = useState<SavePreviewRow[]>([]);
  const [savePreviewRefreshing, setSavePreviewRefreshing] = useState(false);
  const [saveRun, setSaveRun] = useState<SaveRunState>(IDLE_SAVE_RUN);
  const [saveDestinationMap, setSaveDestinationMap] = useState<Record<string, string>>({});
  const [saveMergeStrategies, setSaveMergeStrategies] = useState<Record<string, SaveMergeStrategy>>({});
  const [saveAppendPaths, setSaveAppendPaths] = useState<Record<string, string>>({});
  const savePreviewDestinationCacheRef = useRef<Map<string, Map<string, ExistingTokenSnapshot>>>(
    new Map(),
  );
  const savePreviewRequestIdRef = useRef(0);

  const resetSavePreview = () => {
    setSavePhase('idle');
    setSavePreviewItems([]);
    setSavePreviewRows([]);
    setSavePreviewRefreshing(false);
    setSaveDestinationMap({});
    setSaveMergeStrategies({});
    setSaveAppendPaths({});
    savePreviewDestinationCacheRef.current = new Map();
    setSaveRun(IDLE_SAVE_RUN);
  };

  // Listen for messages from the plugin sandbox
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === 'variables-read' && msg.correlationId === figmaReadCorrelationIdRef.current) {
        if (figmaLoadingTimeoutRef.current !== null) {
          clearTimeout(figmaLoadingTimeoutRef.current);
          figmaLoadingTimeoutRef.current = null;
        }
        figmaReadCorrelationIdRef.current = null;
        const collections = toExportedCollections(msg.collections || []);
        setFigmaCollections(collections);
        setFigmaLoading(false);
        if (collections.length > 0) {
          setExpandedCollection(collections[0].name);
        }
      }
      if (msg.type === 'variables-read-error' && msg.correlationId === figmaReadCorrelationIdRef.current) {
        if (figmaLoadingTimeoutRef.current !== null) {
          clearTimeout(figmaLoadingTimeoutRef.current);
          figmaLoadingTimeoutRef.current = null;
        }
        figmaReadCorrelationIdRef.current = null;
        setError(msg.error);
        setFigmaLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [setError]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (figmaLoadingTimeoutRef.current !== null) {
        clearTimeout(figmaLoadingTimeoutRef.current);
        figmaLoadingTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (savePhase !== 'preview' || savePreviewItems.length === 0) {
      setSavePreviewRows([]);
      setSavePreviewRefreshing(false);
      return;
    }

    let cancelled = false;
    const requestId = ++savePreviewRequestIdRef.current;
    const collectionsByName = new Map(figmaCollections.map(collection => [collection.name, collection]));
    const existingSetNames = new Set(sets);
    const requestedExistingDestinations = [...new Set(
      savePreviewItems
        .map(item => (saveDestinationMap[item.itemKey] ?? item.destinationSet ?? item.slug).trim())
        .filter(destination => destination.length > 0 && existingSetNames.has(destination)),
    )];
    const destinationsToFetch = requestedExistingDestinations.filter(
      destination => !savePreviewDestinationCacheRef.current.has(destination),
    );

    const applyPreviewRows = () => {
      if (cancelled || requestId !== savePreviewRequestIdRef.current) return;
      setSavePreviewRows(
        buildSavePreviewRows(
          savePreviewItems,
          collectionsByName,
          existingSetNames,
          savePreviewDestinationCacheRef.current,
          saveDestinationMap,
          saveMergeStrategies,
          saveAppendPaths,
        ),
      );
      setSavePreviewRefreshing(false);
    };

    if (destinationsToFetch.length === 0) {
      applyPreviewRows();
      return () => {
        cancelled = true;
      };
    }

    setSavePreviewRefreshing(true);

    Promise.all(
      destinationsToFetch.map(async (destinationSet) => {
        try {
          const data = await apiFetch<{ tokens?: DTCGGroup }>(
            `${serverUrl}/api/tokens/${encodeURIComponent(destinationSet)}`,
          );
          savePreviewDestinationCacheRef.current.set(
            destinationSet,
            buildExistingTokenMap(data.tokens),
          );
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            savePreviewDestinationCacheRef.current.set(destinationSet, new Map());
            return;
          }
          throw new Error(
            `Failed to inspect destination "${destinationSet}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    )
      .then(() => {
        applyPreviewRows();
      })
      .catch((err) => {
        if (cancelled || requestId !== savePreviewRequestIdRef.current) return;
        setError(getErrorMessage(err));
        setSavePreviewRows([]);
        setSavePreviewRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    figmaCollections,
    saveAppendPaths,
    saveDestinationMap,
    saveMergeStrategies,
    savePhase,
    savePreviewItems,
    serverUrl,
    setError,
    sets,
  ]);

  const handleExportFigmaVariables = () => {
    setFigmaLoading(true);
    setFigmaCollections([]);
    setError(null);
    if (figmaLoadingTimeoutRef.current !== null) {
      clearTimeout(figmaLoadingTimeoutRef.current);
    }
    const correlationId = `export-vars-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    figmaReadCorrelationIdRef.current = correlationId;
    figmaLoadingTimeoutRef.current = setTimeout(() => {
      figmaLoadingTimeoutRef.current = null;
      figmaReadCorrelationIdRef.current = null;
      setFigmaLoading(false);
      setError('No response from Figma — make sure a Figma document is open and the plugin is running.');
    }, 10000);
    parent.postMessage({ pluginMessage: { type: 'read-variables', correlationId } }, '*');
  };

  const buildDTCGJson = (modeOverride?: string | null): string => {
    const targetMode = modeOverride !== undefined ? modeOverride : selectedExportMode;
    const output: Record<string, any> = {};

    for (const collection of figmaCollections) {
      const collectionObj: Record<string, any> = {};

      for (const variable of collection.variables) {
        const parts = variable.path.split('.');
        let current = collectionObj;

        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }

        const lastKey = parts[parts.length - 1];

        if (targetMode !== null && collection.modes.includes(targetMode)) {
          const modeVal = variable.modeValues[targetMode];
          const token: Record<string, any> = {
            $type: variable.$type,
            $value: modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue,
          };
          if (variable.description) token.$description = variable.description;
          current[lastKey] = token;
        } else if (collection.modes.length === 1) {
          const modeVal = variable.modeValues[collection.modes[0]];
          const token: Record<string, any> = {
            $type: variable.$type,
            $value: modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue,
          };
          if (variable.description) token.$description = variable.description;
          current[lastKey] = token;
        } else {
          const defaultMode = collection.modes[0];
          const defaultVal = variable.modeValues[defaultMode];
          const token: Record<string, any> = {
            $type: variable.$type,
            $value: defaultVal.isAlias ? defaultVal.reference : defaultVal.resolvedValue,
          };
          if (variable.description) token.$description = variable.description;

          const modeExtensions: Record<string, any> = {};
          for (const modeName of collection.modes) {
            const modeVal = variable.modeValues[modeName];
            modeExtensions[modeName] = modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue;
          }
          token.$extensions = {
            'com.figma': {
              collection: collection.name,
              hiddenFromPublishing: variable.hiddenFromPublishing,
              scopes: variable.scopes,
              modes: modeExtensions,
            },
          };

          current[lastKey] = token;
        }
      }

      output[collection.name] = collectionObj;
    }

    return JSON.stringify(output, null, 2);
  };

  const handleCopyAll = async () => {
    const json = buildDTCGJson();
    try {
      await navigator.clipboard.writeText(json);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
      dispatchToast('Copied all variables as DTCG JSON', 'success');
    } catch (err) {
      console.warn('[useFigmaVariables] clipboard write failed:', err);
      dispatchToast('Clipboard access denied', 'error');
    }
  };

  const handlePreviewSave = async () => {
    if (!connected) return;
    setSavePhase('preview-loading');
    setError(null);
    setSavePreviewRows([]);
    setSavePreviewRefreshing(false);
    setSaveRun(IDLE_SAVE_RUN);
    setSaveDestinationMap({});
    setSaveMergeStrategies({});
    setSaveAppendPaths({});
    savePreviewDestinationCacheRef.current = new Map();

    try {
      const existingSetNames = new Set(sets);
      const plans = buildSaveTargetPlans(figmaCollections, savePerMode);
      const collectionsByName = new Map(figmaCollections.map(collection => [collection.name, collection]));
      const existingSetMaps = new Map<string, Map<string, ExistingTokenSnapshot>>();

      await Promise.all(
        [...new Set(plans.map(plan => plan.destinationSet))]
          .filter(destinationSet => existingSetNames.has(destinationSet))
          .map(async (destinationSet) => {
            try {
              const data = await apiFetch<{ tokens?: DTCGGroup }>(
                `${serverUrl}/api/tokens/${encodeURIComponent(destinationSet)}`,
              );
              existingSetMaps.set(destinationSet, buildExistingTokenMap(data.tokens));
            } catch (err) {
              if (err instanceof ApiError && err.status === 404) {
                existingSetMaps.set(destinationSet, new Map());
                return;
              }
              throw new Error(
                `Failed to inspect destination "${destinationSet}": ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }),
      );

      const items: SavePreviewItem[] = plans.map((plan) => {
        const collection = collectionsByName.get(plan.collectionName);
        if (!collection) {
          throw new Error(`Collection "${plan.collectionName}" is no longer available`);
        }

        const destinationExists = existingSetNames.has(plan.destinationSet);
        const existingTokens = existingSetMaps.get(plan.destinationSet) ?? new Map();
        const incomingTokens = buildTokenPayloads(collection, plan.modeName, '');
        const mergeStrategy: SaveMergeStrategy =
          destinationExists
            && summarizeDiff(incomingTokens, existingTokens, 'overwrite').changedCount > 0
            ? 'merge'
            : 'overwrite';
        const diff = summarizeDiff(incomingTokens, existingTokens, mergeStrategy);

        return {
          collectionName: plan.collectionName,
          slug: plan.destinationSet,
          destinationSet: plan.destinationSet,
          destinationExists,
          destinationTokenCount: existingTokens.size,
          action: destinationExists ? 'overwrite' : 'create',
          varCount: incomingTokens.length,
          modeName: plan.modeName ?? undefined,
          itemKey: plan.itemKey,
          mergeStrategy,
          appendPath: '',
          diff,
        };
      });

      savePreviewDestinationCacheRef.current = existingSetMaps;
      setSavePreviewItems(items);
      setSavePreviewRows(
        buildSavePreviewRows(
          items,
          collectionsByName,
          existingSetNames,
          existingSetMaps,
          {},
          {},
          {},
        ),
      );
      setSavePhase('preview');
    } catch (err) {
      setError(getErrorMessage(err));
      setSavePhase('idle');
    }
  };

  const handleConfirmSave = async () => {
    if (!connected) return;

    let totalVarsSaved = 0;
    let failedItemKey: string | null = null;
    try {
      if (savePreviewRefreshing || savePreviewRows.length !== savePreviewItems.length) {
        throw new Error('Wait for the save preview to finish refreshing');
      }

      const collectionsByName = new Map(figmaCollections.map(collection => [collection.name, collection]));
      const destinationUsage = new Map<string, string>();
      const nextKnownSetNames = new Set(sets);
      const initialStatuses = Object.fromEntries(
        savePreviewRows.map(item => [item.itemKey, 'pending' as const]),
      );
      const undoGroupKey = `figma-variable-save-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      setSaveRun({
        active: true,
        totalCount: savePreviewRows.length,
        completedCount: 0,
        currentItemKey: null,
        itemStatuses: initialStatuses,
        error: null,
      });

      for (const [index, previewItem] of savePreviewRows.entries()) {
        failedItemKey = previewItem.itemKey;
        if (previewItem.destinationError || previewItem.appendPathError) {
          throw new Error(`Resolve validation issues for "${previewItem.collectionName}" before saving`);
        }

        const collection = collectionsByName.get(previewItem.collectionName);
        if (!collection) {
          throw new Error(`Collection "${previewItem.collectionName}" is no longer available`);
        }

        const setName = previewItem.effectiveDestination;
        if (!setName) {
          throw new Error(`Destination set is required for "${previewItem.collectionName}"`);
        }
        const duplicateOwner = destinationUsage.get(setName);
        if (duplicateOwner && duplicateOwner !== previewItem.itemKey) {
          throw new Error(`Destination "${setName}" is assigned more than once`);
        }
        destinationUsage.set(setName, previewItem.itemKey);

        setSaveRun(prev => ({
          ...prev,
          currentItemKey: previewItem.itemKey,
          itemStatuses: { ...prev.itemStatuses, [previewItem.itemKey]: 'saving' },
        }));

        const appendPath = normalizeAppendPath(previewItem.effectiveAppendPath);
        const mergeStrategy = previewItem.effectiveMergeStrategy;
        const incomingTokens = buildTokenPayloads(collection, previewItem.modeName ?? null, appendPath);

        let existingTokens = new Map<string, ExistingTokenSnapshot>();
        if (previewItem.destinationExists) {
          try {
            const data = await apiFetch<{ tokens?: DTCGGroup }>(
              `${serverUrl}/api/tokens/${encodeURIComponent(setName)}`,
            );
            existingTokens = buildExistingTokenMap(data.tokens);
          } catch (err) {
            if (!(err instanceof ApiError && err.status === 404)) {
              throw new Error(
                `Failed to inspect destination "${setName}": ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        }

        const tokensToWrite = incomingTokens.filter((token) => {
          const existing = existingTokens.get(token.path);
          if (!existing) return true;
          if (mergeStrategy === 'skip') return false;
          return !areTokensEquivalentForStrategy(token, existing, mergeStrategy);
        });

        if (tokensToWrite.length === 0) {
          setSaveRun(prev => ({
            ...prev,
            completedCount: prev.completedCount + 1,
            currentItemKey: null,
            itemStatuses: { ...prev.itemStatuses, [previewItem.itemKey]: 'saved' },
          }));
          continue;
        }

        const result = await apiFetch<{ imported: number; skipped: number; operationId?: string }>(
          `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens: tokensToWrite, strategy: mergeStrategy }),
          },
        ).catch((err) => {
          throw new Error(`Failed to save tokens for "${setName}": ${err instanceof Error ? err.message : String(err)}`);
        });

        if (!previewItem.destinationExists) {
          nextKnownSetNames.add(setName);
          addSetToState(setName, result.imported);
        }
        if (pushUndo && result.operationId) {
          const opId = result.operationId;
          const url = serverUrl;
          pushUndo({
            description: `Saved "${setName}" from Figma variables`,
            groupKey: undoGroupKey,
            groupSummary: (count) => `Saved ${count} Figma variable collection${count === 1 ? '' : 's'}`,
            restore: async () => {
              await apiFetch(`${url}/api/operations/${encodeURIComponent(opId)}/rollback`, { method: 'POST' });
              refreshTokens();
            },
          });
        }
        savePreviewDestinationCacheRef.current.set(
          setName,
          applyTokensToExistingMap(
            existingTokens,
            mergeStrategy === 'skip' ? tokensToWrite : incomingTokens,
          ),
        );
        setSavePreviewRows(
          buildSavePreviewRows(
            savePreviewItems,
            collectionsByName,
            nextKnownSetNames,
            savePreviewDestinationCacheRef.current,
            saveDestinationMap,
            saveMergeStrategies,
            saveAppendPaths,
          ),
        );
        totalVarsSaved += result.imported;
        setSaveRun(prev => ({
          ...prev,
          completedCount: index + 1,
          currentItemKey: null,
          itemStatuses: { ...prev.itemStatuses, [previewItem.itemKey]: 'saved' },
        }));
        failedItemKey = null;
      }

      dispatchToast(`Saved ${totalVarsSaved} variable${totalVarsSaved !== 1 ? 's' : ''} to server`, 'success');
      resetSavePreview();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveRun(prev => ({
        ...prev,
        active: false,
        currentItemKey: null,
        itemStatuses: failedItemKey
          ? { ...prev.itemStatuses, [failedItemKey]: 'failed' }
          : prev.itemStatuses,
        error: message,
      }));
      dispatchToast(
        totalVarsSaved > 0
          ? `Saved ${totalVarsSaved} variable${totalVarsSaved !== 1 ? 's' : ''} before error — ${message}`
          : message,
        'error',
      );
      setSavePhase('preview');
    }
  };

  const formatModeValue = (modeVal: ExportedModeValue): string => {
    if (modeVal.isAlias) return modeVal.reference || '';
    if (modeVal.resolvedValue === null || modeVal.resolvedValue === undefined) return 'null';
    return String(modeVal.resolvedValue);
  };

  return {
    figmaLoading,
    figmaCollections,
    expandedCollection,
    setExpandedCollection,
    expandedVar,
    setExpandedVar,
    copiedAll,
    selectedExportMode,
    setSelectedExportMode,
    savePerMode,
    setSavePerMode,
    savePhase,
    setSavePhase,
    savePreviewItems,
    setSavePreviewItems,
    savePreviewRows,
    savePreviewRefreshing,
    saveRun,
    saveDestinationMap,
    setSaveDestinationMap,
    slugRenames: saveDestinationMap,
    setSlugRenames: setSaveDestinationMap,
    saveMergeStrategies,
    setSaveMergeStrategies,
    saveAppendPaths,
    setSaveAppendPaths,
    handleExportFigmaVariables,
    buildDTCGJson,
    handleCopyAll,
    handlePreviewSave,
    handleConfirmSave,
    resetSavePreview,
    formatModeValue,
  };
}
