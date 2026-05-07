import React, { useState, useCallback, useRef, useEffect, useId, useMemo } from 'react';
import type {
  ResolverFile,
  ResolverFigmaModeMapping,
  ResolverInput,
  TokenCollection,
} from '@token-workshop/core';
import { isReference, parseReference } from '@token-workshop/core';
import { dispatchToast } from '../shared/toastBus';
import { describeError } from '../shared/utils';
import { Spinner } from './Spinner';
import { ConfirmModal } from './ConfirmModal';
import { FeedbackPlaceholder } from './FeedbackPlaceholder';
import { useSyncEntity, type SyncMessages } from '../hooks/useSyncEntity';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useFigmaMessage } from '../hooks/useFigmaMessage';
import { SyncPreflightStep } from './publish/SyncPreflightStep';
import { SyncDiffSummary, VarDiffRowItem } from './publish/PublishShared';
import type { PreviewRow } from './publish/PublishShared';
import { NoticeBanner, type NoticeSeverity } from '../shared/noticeSystem';
import { useOrphanCleanup } from '../hooks/useOrphanCleanup';
import { useReadinessChecks } from '../hooks/useReadinessChecks';
import type { ValidationSnapshot } from '../hooks/useValidationCache';
import { usePublishAll, type ConfirmAction } from '../hooks/usePublishAll';
import { usePersistedJsonState } from '../hooks/usePersistedState';
import { STORAGE_KEYS } from '../shared/storage';
import { useNavigationContext } from '../contexts/NavigationContext';
import { useResolverContext } from '../contexts/CollectionContext';
import { apiFetch } from '../shared/apiFetch';
import type { PublishRoutingDraft } from '../hooks/usePublishRouting';
import type {
  ReadStyleToken,
  ReadVariableCollection,
  StyleSnapshot,
  StylesAppliedMessage,
  StylesReadMessage,
  TokenMapEntry,
  VariablesAppliedMessage,
  VariablesReadMessage,
  VariableSyncToken,
  VarSnapshot,
} from '../../shared/types';
import {
  buildVariablePublishFigmaMap,
  buildPublishPullPayload,
  loadVariablePublishSnapshot,
  getDiffRowId,
  type ResolverPublishSyncMapping,
  stylePublishDiffConfig,
  variablePublishDiffConfig,
  type VariablePublishCompareMode,
  type PublishDiffRow as DiffRow,
  type PublishSyncEntry,
  type PublishPreflightCluster,
  type PublishPreflightActionId,
  type SyncWorkflowStage,
} from '../shared/syncWorkflow';
import { buildStylePublishTokens } from '../shared/stylePublish';
import { resolveAllAliases } from '../../shared/resolveAlias';
import { CheckboxRow } from '../primitives';

// ── Static message configs (stable module-level refs required by useFigmaMessage) ──

const VAR_MESSAGES: SyncMessages<
  VarSnapshot,
  ReadVariableCollection[],
  VariablesReadMessage,
  VariablesAppliedMessage
> = {
  readSendType: 'read-variables', readResponseType: 'variables-read', readTimeout: 10000,
  extractReadResponse: (msg: VariablesReadMessage) => msg.collections ?? [],
  applySendType: 'apply-variables', applyResponseType: 'variables-applied', applyErrorType: 'apply-variables-error', applyTimeout: 30000,
  extractApplySnapshot: (msg: VariablesAppliedMessage) => msg.varSnapshot ?? undefined,
  revertSendType: 'revert-variables', revertResponseType: 'variables-reverted', revertTimeout: 30000,
};

const STYLE_MESSAGES: SyncMessages<
  StyleSnapshot,
  ReadStyleToken[],
  StylesReadMessage,
  StylesAppliedMessage
> = {
  readSendType: 'read-styles', readResponseType: 'styles-read', readErrorType: 'styles-read-error', readTimeout: 10000,
  extractReadResponse: (msg: StylesReadMessage) => msg.tokens ?? [],
  applySendType: 'apply-styles', applyResponseType: 'styles-applied', applyErrorType: 'styles-apply-error', applyTimeout: 15000,
  extractApplySnapshot: (msg: StylesAppliedMessage) => msg.styleSnapshot ?? undefined,
  revertSendType: 'revert-styles', revertResponseType: 'styles-reverted', revertTimeout: 30000,
};

const DEFAULT_RESOLVER_COLLECTION_NAME = 'Token Workshop';
const DEFAULT_VARIABLE_COLLECTION_NAME = 'Token Workshop';
type CompareTarget = 'variables' | 'styles';

interface ResolverPublishMappingDraft {
  collectionName: string;
  modeName: string;
}

interface ResolverPublishMappingRow extends ResolverPublishMappingDraft {
  key: string;
  label: string;
  contexts: ResolverInput;
  sourceCollectionName: string;
  sourceModeName: string;
  isDirty: boolean;
}

interface ResolverResolveResponse {
  tokens: Record<string, {
    $value: unknown;
    $type?: string;
    $extensions?: VariableSyncToken['$extensions'];
  }>;
}

function buildResolverContextCombinations(
  modifiers: Record<string, { contexts: string[]; default?: string }>,
): ResolverInput[] {
  const entries = Object.entries(modifiers);
  if (entries.length === 0) return [{}];

  const combinations: ResolverInput[] = [{}];
  for (const [modifierName, modifier] of entries) {
    const next: ResolverInput[] = [];
    for (const existing of combinations) {
      for (const contextName of modifier.contexts) {
        next.push({ ...existing, [modifierName]: contextName });
      }
    }
    combinations.splice(0, combinations.length, ...next);
  }
  return combinations;
}

function buildResolverContextKey(contexts: ResolverInput, modifierNames: string[]): string {
  if (modifierNames.length === 0) return '__default__';
  return modifierNames
    .map((modifierName) => `${modifierName}=${contexts[modifierName] ?? ''}`)
    .join('|');
}

function formatResolverContextLabel(contexts: ResolverInput, modifierNames: string[]): string {
  if (modifierNames.length === 0) return 'Default resolver output';
  return modifierNames
    .map((modifierName) => `${modifierName}=${contexts[modifierName] ?? ''}`)
    .join(' · ');
}

function buildResolverPublishSourceDrafts(
  file: ResolverFile | null,
  combinations: ResolverInput[],
  modifierNames: string[],
): Record<string, ResolverPublishMappingDraft> {
  const mappings = file?.$extensions?.tokenworkshop?.resolverPublish?.modeMappings ?? [];
  const mappingByKey = new Map<string, ResolverFigmaModeMapping>(
    mappings.map((mapping) => [buildResolverContextKey(mapping.contexts ?? {}, modifierNames), mapping]),
  );

  const drafts: Record<string, ResolverPublishMappingDraft> = {};
  for (const contexts of combinations) {
    const key = buildResolverContextKey(contexts, modifierNames);
    const mapping = mappingByKey.get(key);
    drafts[key] = {
      collectionName: mapping?.collectionName ?? '',
      modeName: mapping?.modeName ?? '',
    };
  }
  return drafts;
}

function resolverPublishDraftsEqual(
  left: ResolverPublishMappingDraft | undefined,
  right: ResolverPublishMappingDraft | undefined,
): boolean {
  return (
    (left?.collectionName ?? '') === (right?.collectionName ?? '') &&
    (left?.modeName ?? '') === (right?.modeName ?? '')
  );
}

function writeResolverPublishMappings(
  file: ResolverFile,
  modeMappings: ResolverFigmaModeMapping[],
): ResolverFile {
  const nextFile = structuredClone(file) as ResolverFile;
  const nextExtensions = { ...(nextFile.$extensions ?? {}) };
  const nextTokenWorkshop = { ...(nextExtensions.tokenworkshop ?? {}) };

  if (modeMappings.length > 0) {
    nextTokenWorkshop.resolverPublish = { modeMappings };
  } else {
    delete nextTokenWorkshop.resolverPublish;
  }

  if (Object.keys(nextTokenWorkshop).length > 0) {
    nextExtensions.tokenworkshop = nextTokenWorkshop;
  } else {
    delete nextExtensions.tokenworkshop;
  }

  nextFile.$extensions =
    Object.keys(nextExtensions).length > 0 ? nextExtensions : undefined;
  return nextFile;
}

function buildResolverPublishSyncMappings(rows: ResolverPublishMappingRow[]): ResolverPublishSyncMapping[] {
  return rows
    .filter((row) => row.sourceModeName.trim().length > 0)
    .map((row) => ({
      key: row.key,
      label: row.label,
      contexts: row.contexts,
      collectionName: row.sourceCollectionName.trim() || undefined,
      modeName: row.sourceModeName.trim(),
    }));
}

function buildPathCollectionIndex(
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
  activeCollectionId: string,
): Record<string, string> {
  const index: Record<string, string> = {};
  for (const [collectionId, collectionFlat] of Object.entries(perCollectionFlat)) {
    for (const path of Object.keys(collectionFlat)) {
      if (!(path in index)) {
        index[path] = collectionId;
      }
    }
  }
  for (const path of Object.keys(perCollectionFlat[activeCollectionId] ?? {})) {
    index[path] = activeCollectionId;
  }
  return index;
}

function getAliasTargetCollectionId(
  value: unknown,
  pathToCollectionId: Record<string, string>,
): string | undefined {
  return typeof value === 'string' && isReference(value)
    ? pathToCollectionId[parseReference(value)]
    : undefined;
}

function uniqueTextSuggestions(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push(trimmed);
  }
  return suggestions;
}


/* ── Types ───────────────────────────────────────────────────────────────── */

interface PublishPanelProps {
  serverUrl: string;
  connected: boolean;
  currentCollectionId: string;
  collections: TokenCollection[];
  collectionMap?: Record<string, string>;
  modeMap?: Record<string, string>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  savePublishRouting: (
    collectionId: string,
    routing: PublishRoutingDraft,
  ) => Promise<{ collectionName?: string; modeName?: string }>;
  refreshValidation: () => Promise<ValidationSnapshot | null>;
	  onOpenGenerator?: (
	    generatorId: string,
	    options?: {
	      preserveHandoff?: boolean;
	      focus?: {
	        diagnosticId?: string;
	        nodeId?: string;
	        edgeId?: string;
	      };
	    },
	  ) => void;
  /** Increments whenever tokens are edited — used to detect stale readiness results */
  tokenChangeKey?: number;
  publishPanelHandle?: React.MutableRefObject<PublishPanelHandle | null>;
}

export interface PublishPanelHandle {
  runReadinessChecks: () => void;
  runCompareAll: () => Promise<void>;
  focusStage: (stage: SyncWorkflowStage) => void;
  focusPublishTarget: () => void;
}

/* ── PublishPanel ─────────────────────────────────────────────────────────── */

export function PublishPanel({
  serverUrl,
  connected,
  currentCollectionId,
  collections,
  collectionMap = {},
  modeMap = {},
  perCollectionFlat,
  savePublishRouting,
  refreshValidation,
  onOpenGenerator,
  tokenChangeKey,
  publishPanelHandle,
}: PublishPanelProps) {
  const { navigateTo, beginHandoff } = useNavigationContext();
  const {
    activeResolver,
    activeModifiers,
    getResolverFile,
    updateResolver,
  } = useResolverContext();

  // ── Rename history for variable name propagation ──
  // Eagerly fetched from the server so applyVariables can rename existing Figma
  // variables instead of creating orphans when tokens are renamed between syncs.
  const renamesRef = useRef<Array<{ oldPath: string; newPath: string }>>([]);
  useEffect(() => {
    if (!connected || !serverUrl) { renamesRef.current = []; return; }
    fetch(`${serverUrl}/api/operations/path-renames`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { renames?: Array<{ oldPath: string; newPath: string }> } | null) => {
        renamesRef.current = data?.renames ?? [];
      })
      .catch(() => { renamesRef.current = []; });
  }, [connected, serverUrl, tokenChangeKey]);

  const resolverModifierNames = useMemo(
    () => Object.keys(activeModifiers),
    [activeModifiers],
  );
  const resolverContextCombinations = useMemo(
    () => buildResolverContextCombinations(activeModifiers),
    [activeModifiers],
  );
  const [resolverPublishFile, setResolverPublishFile] = useState<ResolverFile | null>(null);
  const [resolverPublishDrafts, setResolverPublishDrafts] = useState<Record<string, ResolverPublishMappingDraft>>({});
  const [resolverPublishLoading, setResolverPublishLoading] = useState(false);
  const [resolverPublishSaving, setResolverPublishSaving] = useState(false);
  const [resolverPublishSyncing, setResolverPublishSyncing] = useState(false);
  const [resolverPublishError, setResolverPublishError] = useState<string | null>(null);
  const [standardRoutingDraft, setStandardRoutingDraft] = useState<PublishRoutingDraft>({});
  const [standardRoutingSaving, setStandardRoutingSaving] = useState(false);
  const [standardRoutingError, setStandardRoutingError] = useState<string | null>(null);

  const sendResolverVariableApply = useFigmaMessage<{
    count: number;
    total: number;
    failures: { path: string; error: string }[];
    skipped: Array<{ path: string; $type: string }>;
    created?: number;
    overwritten?: number;
  }, VariablesAppliedMessage>({
    responseType: 'variables-applied',
    errorType: 'apply-variables-error',
    timeout: 30000,
    extractResponse: (msg: VariablesAppliedMessage) => ({
      count: msg.count ?? 0,
      total: msg.total ?? msg.count ?? 0,
      failures: msg.failures ?? [],
      skipped: msg.skipped ?? [],
      created: msg.created,
      overwritten: msg.overwritten,
    }),
  });

  const [preflightActionBusyId, setPreflightActionBusyId] = useState<PublishPreflightActionId | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const preflightRef = useRef<HTMLDivElement | null>(null);
  const compareRef = useRef<HTMLDivElement | null>(null);
  const applyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!connected || !activeResolver) {
      setResolverPublishFile(null);
      setResolverPublishDrafts({});
      setResolverPublishError(null);
      setResolverPublishLoading(false);
      return;
    }

    let cancelled = false;
    setResolverPublishLoading(true);
    setResolverPublishError(null);

    void getResolverFile(activeResolver)
      .then((file) => {
        if (cancelled) return;
        setResolverPublishFile(file);
        setResolverPublishDrafts(
          buildResolverPublishSourceDrafts(file, resolverContextCombinations, resolverModifierNames),
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setResolverPublishFile(null);
        setResolverPublishDrafts({});
        setResolverPublishError(describeError(error));
      })
      .finally(() => {
        if (!cancelled) setResolverPublishLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeResolver,
    connected,
    getResolverFile,
    resolverContextCombinations,
    resolverModifierNames,
  ]);

  const resolverPublishSourceDrafts = useMemo(
    () => buildResolverPublishSourceDrafts(resolverPublishFile, resolverContextCombinations, resolverModifierNames),
    [resolverContextCombinations, resolverModifierNames, resolverPublishFile],
  );

  const resolverPublishRows = useMemo<ResolverPublishMappingRow[]>(
    () =>
      resolverContextCombinations.map((contexts) => {
        const key = buildResolverContextKey(contexts, resolverModifierNames);
        const source = resolverPublishSourceDrafts[key] ?? { collectionName: '', modeName: '' };
        const draft = resolverPublishDrafts[key] ?? source;
        return {
          key,
          label: formatResolverContextLabel(contexts, resolverModifierNames),
          contexts,
          collectionName: draft.collectionName,
          modeName: draft.modeName,
          sourceCollectionName: source.collectionName,
          sourceModeName: source.modeName,
          isDirty: !resolverPublishDraftsEqual(draft, source),
        };
      }),
    [resolverContextCombinations, resolverModifierNames, resolverPublishDrafts, resolverPublishSourceDrafts],
  );

  const resolverPublishDirtyCount = useMemo(
    () => resolverPublishRows.filter((row) => row.isDirty).length,
    [resolverPublishRows],
  );

  const resolverPublishMappedCount = useMemo(
    () => resolverPublishRows.filter((row) => row.modeName.trim().length > 0).length,
    [resolverPublishRows],
  );

  const resolverPublishSyncMappings = useMemo(
    () => buildResolverPublishSyncMappings(resolverPublishRows),
    [resolverPublishRows],
  );
  const savedCollectionName = collectionMap[currentCollectionId] ?? '';
  const savedModeName = modeMap[currentCollectionId] ?? '';
  const resolvedCollectionName =
    savedCollectionName || DEFAULT_VARIABLE_COLLECTION_NAME;
  const resolvedModeName = savedModeName || 'First Figma mode';
  const currentCollection = useMemo(
    () => collections.find((collection) => collection.id === currentCollectionId),
    [collections, currentCollectionId],
  );
  const standardCollectionSuggestions = useMemo(
    () =>
      uniqueTextSuggestions([
        savedCollectionName,
        currentCollectionId,
        DEFAULT_VARIABLE_COLLECTION_NAME,
        ...Object.values(collectionMap),
      ]),
    [collectionMap, currentCollectionId, savedCollectionName],
  );
  const standardModeSuggestions = useMemo(
    () =>
      uniqueTextSuggestions([
        savedModeName,
        ...(currentCollection?.modes.map((mode) => mode.name) ?? []),
        ...Object.values(modeMap),
      ]),
    [currentCollection, modeMap, savedModeName],
  );
  const resolverCollectionSuggestions = useMemo(
    () =>
      uniqueTextSuggestions([
        DEFAULT_RESOLVER_COLLECTION_NAME,
        ...Object.values(collectionMap),
        ...collections.map((collection) => collection.id),
        ...resolverPublishRows.map((row) => row.sourceCollectionName),
      ]),
    [collectionMap, collections, resolverPublishRows],
  );
  const resolverModeSuggestions = useMemo(
    () =>
      uniqueTextSuggestions([
        ...Object.values(modeMap),
        ...collections.flatMap((collection) =>
          collection.modes.map((mode) => mode.name),
        ),
        ...resolverPublishRows.map((row) => row.sourceModeName),
      ]),
    [collections, modeMap, resolverPublishRows],
  );
  const standardRoutingDirty =
    (standardRoutingDraft.collectionName ?? '') !== savedCollectionName ||
    (standardRoutingDraft.modeName ?? '') !== savedModeName;
  const variableCompareMode: VariablePublishCompareMode =
    activeResolver && resolverPublishSyncMappings.length > 0 ? 'resolver-publish' : 'standard';
  const isResolverPublishCompareActive = variableCompareMode === 'resolver-publish';

  useEffect(() => {
    setStandardRoutingDraft({
      collectionName: savedCollectionName,
      modeName: savedModeName,
    });
    setStandardRoutingError(null);
  }, [currentCollectionId, savedCollectionName, savedModeName]);

  const updateResolverPublishDraft = useCallback(
    (key: string, field: keyof ResolverPublishMappingDraft, value: string) => {
      setResolverPublishDrafts((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] ?? resolverPublishSourceDrafts[key] ?? { collectionName: '', modeName: '' }),
          [field]: value,
        },
      }));
    },
    [resolverPublishSourceDrafts],
  );

  const resetResolverPublishDrafts = useCallback(() => {
    setResolverPublishDrafts(resolverPublishSourceDrafts);
    setResolverPublishError(null);
  }, [resolverPublishSourceDrafts]);

  const saveResolverPublishMappings = useCallback(async () => {
    if (!activeResolver || !resolverPublishFile) return;

    setResolverPublishSaving(true);
    setResolverPublishError(null);
    try {
      const modeMappings: ResolverFigmaModeMapping[] = resolverPublishRows
        .filter((row) => row.modeName.trim().length > 0)
        .map((row) => ({
          contexts: row.contexts,
          collectionName: row.collectionName.trim() || undefined,
          modeName: row.modeName.trim(),
        }));
      const nextFile = writeResolverPublishMappings(resolverPublishFile, modeMappings);
      await updateResolver(activeResolver, nextFile);
      setResolverPublishFile(nextFile);
      setResolverPublishDrafts(
        buildResolverPublishSourceDrafts(nextFile, resolverContextCombinations, resolverModifierNames),
      );
      dispatchToast(
        modeMappings.length > 0
          ? `Saved ${modeMappings.length} Figma mode target${modeMappings.length === 1 ? '' : 's'}`
          : 'Cleared Figma mode targets',
        'success',
        {
          destination: { kind: "workspace", topTab: "publish", subTab: "publish-figma" },
        },
      );
    } catch (error) {
      setResolverPublishError(describeError(error));
    } finally {
      setResolverPublishSaving(false);
    }
  }, [
    activeResolver,
    resolverModifierNames,
    resolverContextCombinations,
    resolverPublishFile,
    resolverPublishRows,
    updateResolver,
  ]);

  const updateStandardRoutingDraft = useCallback(
    (field: keyof PublishRoutingDraft, value: string) => {
      setStandardRoutingDraft((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    [],
  );

  const resetStandardRoutingDraft = useCallback(() => {
    setStandardRoutingDraft({
      collectionName: savedCollectionName,
      modeName: savedModeName,
    });
    setStandardRoutingError(null);
  }, [savedCollectionName, savedModeName]);

  const saveStandardRouting = useCallback(async () => {
    setStandardRoutingSaving(true);
    setStandardRoutingError(null);
    try {
      await savePublishRouting(currentCollectionId, {
        collectionName: standardRoutingDraft.collectionName?.trim() || undefined,
        modeName: standardRoutingDraft.modeName?.trim() || undefined,
      });
      dispatchToast('Saved Figma target', 'success', {
        destination: { kind: "workspace", topTab: "publish", subTab: "publish-figma" },
      });
    } catch (error) {
      setStandardRoutingError(describeError(error));
    } finally {
      setStandardRoutingSaving(false);
    }
  }, [currentCollectionId, savePublishRouting, standardRoutingDraft]);


  // ── Extracted hooks ──
  const varSync = useSyncEntity<
    DiffRow,
    VarSnapshot,
    ReadVariableCollection[],
    VariablesReadMessage,
    VariablesAppliedMessage,
    PublishSyncEntry,
    PublishSyncEntry
  >(serverUrl, currentCollectionId, connected, VAR_MESSAGES, {
    progressEventType: 'variable-sync-progress',
    ...variablePublishDiffConfig,
    loadSnapshot: ({ signal, readFigmaTokens }) =>
      loadVariablePublishSnapshot({
        serverUrl,
        currentCollectionId,
        collectionMap,
        modeMap,
        readFigmaTokens,
        signal,
        resolverName: isResolverPublishCompareActive ? activeResolver : null,
        resolverPublishMappings: isResolverPublishCompareActive ? resolverPublishSyncMappings : [],
      }),
    buildFigmaMap: (collections) => buildVariablePublishFigmaMap(collections, currentCollectionId, collectionMap, modeMap),
    buildPullPayload: buildPublishPullPayload,
    buildApplyPayload: (rows) => ({
      tokens: rows.map(r => {
        const extensions = r.localScopes?.length ? { 'com.figma.scopes': r.localScopes } : {};
        return {
          path: r.path,
          $type: r.localType ?? 'string',
          $value: r.localRaw ?? '',
          $extensions: extensions,
          collectionId: currentCollectionId,
          aliasTargetCollectionId: getAliasTargetCollectionId(r.localRaw, pathToCollectionId),
        };
      }),
      collectionMap, modeMap,
      renames: renamesRef.current.length > 0 ? renamesRef.current : undefined,
    }),
    buildRevertPayload: (snapshot) => ({ varSnapshot: snapshot }),
    onApplySuccess: (result) => {
      if ((result.overwritten ?? 0) > 0) {
        const skippedCount = result.skipped?.length ?? 0;
        const skippedNote = skippedCount > 0 ? ` · ${skippedCount} skipped (unsupported type)` : '';
        dispatchToast(
          `Variables synced — ${result.created ?? 0} created, ${result.overwritten} updated${skippedNote}`,
          'success',
          {
            destination: { kind: "workspace", topTab: "publish", subTab: "publish-figma" },
          },
        );
      }
    },
    successMessage: 'Variables synced', compareErrorLabel: 'Compare variables', applyErrorLabel: 'Sync variables',
    revertSuccessMessage: 'Variables reverted', revertErrorMessage: 'Failed to revert variables',
  });

  const styleSync = useSyncEntity<
    DiffRow,
    StyleSnapshot,
    ReadStyleToken[],
    StylesReadMessage,
    StylesAppliedMessage,
    PublishSyncEntry,
    PublishSyncEntry
  >(serverUrl, currentCollectionId, connected, STYLE_MESSAGES, {
    progressEventType: 'style-sync-progress',
    ...stylePublishDiffConfig,
    buildPullPayload: buildPublishPullPayload,
    buildApplyPayload: (rows) => ({
      tokens: buildStylePublishTokens({
        targets: rows.map((row) => ({
          path: row.path,
          collectionId: currentCollectionId,
        })),
        collections,
        perCollectionFlat,
        collectionMap,
        modeMap,
      }),
    }),
    buildRevertPayload: (snapshot) => ({ styleSnapshot: snapshot }),
    successMessage: 'Styles synced', compareErrorLabel: 'Compare styles', applyErrorLabel: 'Sync styles',
    revertSuccessMessage: 'Styles reverted', revertErrorMessage: 'Failed to revert styles',
  });

  // ── Shared diff filter ──
  const [, setActiveCompareTarget] = useState<CompareTarget>('variables');

  // ── Confirmation modal state ──
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  // ── Late-bound trampoline refs (breaks circular hook dependency) ──
  const onOrphanDeletionCompleteRef = useRef<() => void>(() => {});
  const stableOnOrphanDeletionComplete = useCallback(() => onOrphanDeletionCompleteRef.current(), []);
  const setReadinessErrorRef = useRef<(msg: string | null) => void>(() => {});
  const stableSetReadinessError = useCallback((msg: string | null) => setReadinessErrorRef.current(msg), []);
  const markChecksStaleRef = useRef<() => void>(() => {});
  const stableMarkChecksStale = useCallback(() => markChecksStaleRef.current(), []);

  const orphanCleanup = useOrphanCleanup({
    collectionMap,
    onDeletionComplete: stableOnOrphanDeletionComplete,
    setReadinessError: stableSetReadinessError,
  });

  const readiness = useReadinessChecks({
    serverUrl, currentCollectionId, connected,
    collectionMap, modeMap, tokenChangeKey,
    readFigmaTokens: varSync.readFigmaTokens,
    setOrphanConfirm: orphanCleanup.setOrphanConfirm,
    refreshValidation,
    resolverName: isResolverPublishCompareActive ? activeResolver : null,
    resolverPublishMappings: isResolverPublishCompareActive ? resolverPublishSyncMappings : [],
    compareMode: variableCompareMode,
  });

  const {
    readinessChecks,
    blockingReadinessChecks,
    advisoryReadinessChecks,
    preflightStage,
    readinessLoading,
    readinessError,
    setChecksStale,
    runReadinessChecks,
    triggerReadinessAction,
    missingVariablesConfirm,
    setMissingVariablesConfirm,
    confirmMissingVariablesPush,
    readinessBlockingFails,
    isReadinessOutdated,
  } = readiness;

  const canProceedToCompare =
    !readinessLoading &&
    !isReadinessOutdated &&
    (preflightStage === 'advisory' || preflightStage === 'ready');
  const canProceedToSync = canProceedToCompare && !standardRoutingDirty;
  const compareLockedMessage = !readinessChecks.length
    ? 'Check Figma changes to run readiness checks first.'
    : standardRoutingDirty
      ? 'Save the sync target before comparing or applying changes.'
    : isReadinessOutdated
      ? 'Token data changed. Re-sync to compare differences.'
      : readinessBlockingFails > 0
        ? 'Resolve the blocking issues before comparing or applying Figma changes.'
        : 'Readiness checks must finish before compare is available.';
  const pathToCollectionId = useMemo(
    () => buildPathCollectionIndex(perCollectionFlat, currentCollectionId),
    [currentCollectionId, perCollectionFlat],
  );

  const syncResolverPublishModes = useCallback(async () => {
    if (!activeResolver || !resolverPublishFile) return;
    if (resolverPublishDirtyCount > 0) {
      setResolverPublishError('Save Figma mode targets before syncing.');
      return;
    }

    const modeMappings = resolverPublishFile.$extensions?.tokenworkshop?.resolverPublish?.modeMappings ?? [];
    if (modeMappings.length === 0) {
      setResolverPublishError('Add at least one Figma mode target before syncing.');
      return;
    }

    setResolverPublishSyncing(true);
    setResolverPublishError(null);
    try {
      const resolvedTargets = await Promise.all(
        modeMappings.map(async (mapping) => {
          const result = await apiFetch<ResolverResolveResponse>(
            `${serverUrl}/api/resolvers/${encodeURIComponent(activeResolver)}/resolve`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ input: mapping.contexts }),
            },
          );
          return { mapping, result };
        }),
      );

      const tokens: VariableSyncToken[] = [];
      for (const { mapping, result } of resolvedTargets) {
        const resolvedTokens = resolveAllAliases(
          (result.tokens ?? {}) as Record<string, TokenMapEntry>,
        );
        for (const [path, token] of Object.entries(resolvedTokens)) {
          tokens.push({
            path,
            $type: token.$type ?? 'string',
            $value: token.$value as VariableSyncToken['$value'],
            collectionId: activeResolver,
            figmaCollection: mapping.collectionName,
            figmaMode: mapping.modeName,
            $extensions: token.$extensions,
          });
        }
      }

      if (tokens.length === 0) {
        setResolverPublishError('No generated tokens were available to publish.');
        return;
      }

      const result = await sendResolverVariableApply('apply-variables', {
        tokens,
        renames: renamesRef.current.length > 0 ? renamesRef.current : undefined,
      });
      const skippedCount = result.skipped.length;
      const failureCount = result.failures.length;
      dispatchToast(
        `Published generated outputs — ${tokens.length} writes across ${modeMappings.length} mode${modeMappings.length === 1 ? '' : 's'}`
        + (skippedCount > 0 ? ` · ${skippedCount} skipped` : '')
        + (failureCount > 0 ? ` · ${failureCount} failed` : ''),
        failureCount > 0 ? 'error' : 'success',
        {
          destination: { kind: "workspace", topTab: "publish", subTab: "publish-figma" },
        },
      );
      setChecksStale(true);
    } catch (error) {
      setResolverPublishError(describeError(error));
    } finally {
      setResolverPublishSyncing(false);
    }
  }, [
    activeResolver,
    resolverPublishDirtyCount,
    resolverPublishFile,
    sendResolverVariableApply,
    serverUrl,
    setChecksStale,
  ]);

  const publishAllVarSync = useMemo(() => (
    isResolverPublishCompareActive
      ? {
        ...varSync,
        syncCount: 0,
        pushCount: 0,
        pullCount: 0,
        applyDiff: async () => {},
      }
      : varSync
  ), [isResolverPublishCompareActive, varSync]);

  const [createStylesPref, setCreateStylesPref] = usePersistedJsonState<boolean>(
    STORAGE_KEYS.PUBLISH_CREATE_STYLES,
    true,
  );

  const publishAll = usePublishAll({
    varSync: publishAllVarSync,
    styleSync,
    setConfirmAction,
    markChecksStale: stableMarkChecksStale,
    canProceed: canProceedToSync,
    blockedMessage: compareLockedMessage,
  });

  // Wire trampolines to real implementations (runs every render — that's intentional)
  onOrphanDeletionCompleteRef.current = readiness.runReadinessChecks;
  setReadinessErrorRef.current = readiness.setReadinessError;
  markChecksStaleRef.current = () => readiness.setChecksStale(true);

  const { orphansDeleting, orphanConfirm, setOrphanConfirm, executeOrphanDeletion } = orphanCleanup;
  const {
    publishAllStep,
    publishAllError,
    compareAllLoading,
    hasVarChanges,
    hasStyleChanges,
    publishAllAvailable,
    publishAllBusy,
    handleOpenPublishAll,
    compareAll,
    runPublishAll,
  } = publishAll;
  const hasComparedAnything = varSync.checked || styleSync.checked;
  const publishPreflightState = useMemo(() => ({
    stage: preflightStage,
    isOutdated: isReadinessOutdated,
    blockingCount: blockingReadinessChecks.length,
    advisoryCount: advisoryReadinessChecks.length,
    canProceed: canProceedToSync,
    targetDirty: standardRoutingDirty,
  }), [
    advisoryReadinessChecks.length,
    blockingReadinessChecks.length,
    canProceedToSync,
    isReadinessOutdated,
    preflightStage,
    standardRoutingDirty,
  ]);
  const totalDiffCount = varSync.rows.length + styleSync.rows.length;
  const totalConflictCount =
    varSync.rows.filter((row) => row.cat === 'conflict').length +
    styleSync.rows.filter((row) => row.cat === 'conflict').length;
  const savedResolverPublishCount = useMemo(
    () => resolverPublishRows.filter((row) => row.sourceModeName.trim().length > 0).length,
    [resolverPublishRows],
  );
  const standardRoutingShouldExpand =
    standardRoutingDirty ||
    standardRoutingSaving ||
    standardRoutingError !== null;
  const [standardRoutingExpanded, setStandardRoutingExpanded] = useState(
    standardRoutingShouldExpand,
  );
  useEffect(() => {
    if (standardRoutingShouldExpand) {
      setStandardRoutingExpanded(true);
    }
  }, [standardRoutingShouldExpand]);

  const resolverRoutingShouldExpand =
    (activeResolver !== null && savedResolverPublishCount > 0) ||
    resolverPublishDirtyCount > 0 ||
    resolverPublishSyncing ||
    isResolverPublishCompareActive;

  const [resolverRoutingExpanded, setResolverRoutingExpanded] = useState(
    resolverRoutingShouldExpand,
  );

  useEffect(() => {
    if (resolverRoutingShouldExpand) {
      setResolverRoutingExpanded(true);
    }
  }, [resolverRoutingShouldExpand]);

  const focusStage = useCallback((stage: SyncWorkflowStage) => {
    const target =
      stage === 'preflight' ? preflightRef.current :
      stage === 'compare' ? compareRef.current :
      applyRef.current;
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  const focusPublishTarget = useCallback(() => {
    setStandardRoutingExpanded(true);
    requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, []);

  const handlePreflightAction = useCallback(async (
    actionId: PublishPreflightActionId,
	    cluster?: {
	      recommendedGeneratorId?: string;
	      recommendedGeneratorDiagnosticId?: string;
	      recommendedGeneratorNodeId?: string;
	      recommendedGeneratorEdgeId?: string;
	    },
  ) => {
    setPreflightActionBusyId(actionId);
    try {
      if (isResolverPublishCompareActive && actionId === 'push-missing-variables') {
        await syncResolverPublishModes();
        focusStage('compare');
        return;
      }

      if (actionId === 'review-draft-tokens') {
        beginHandoff({
          reason:
            'Review the draft tokens flagged during sync, then return.',
          onReturn: () => focusStage('preflight'),
        });
        navigateTo('library', 'tokens', { preserveHandoff: true });
        return;
      }

      if (actionId === 'review-health-findings') {
        beginHandoff({
          reason:
            'Review the validation findings behind these blockers, then return to Sync.',
          onReturn: () => focusStage('preflight'),
        });
        navigateTo('library', 'health', { preserveHandoff: true });
        return;
      }

      if (actionId === 'review-generator-issues') {
        beginHandoff({
          reason:
            'Review the generator outputs behind these blockers, then return to Sync.',
          onReturn: () => focusStage('preflight'),
        });
	        if (cluster?.recommendedGeneratorId && onOpenGenerator) {
	          onOpenGenerator(cluster.recommendedGeneratorId, {
	            preserveHandoff: true,
	            focus: {
	              diagnosticId: cluster.recommendedGeneratorDiagnosticId,
	              nodeId: cluster.recommendedGeneratorNodeId,
	              edgeId: cluster.recommendedGeneratorEdgeId,
	            },
	          });
	          return;
	        }
        navigateTo('library', 'generators', { preserveHandoff: true });
        return;
      }

      if (actionId === 'review-variable-scopes') {
        setActiveCompareTarget('variables');
        await varSync.computeDiff();
        focusStage('compare');
        return;
      }

      if (actionId === 'add-token-descriptions') {
        dispatchToast('Add descriptions in Library, then re-sync.', 'success', {
          destination: { kind: "workspace", topTab: "library", subTab: "tokens" },
        });
        beginHandoff({
          reason:
            'Add descriptions in Library, then return to Sync.',
          onReturn: () => focusStage('preflight'),
        });
        navigateTo('library', 'tokens', { preserveHandoff: true });
        return;
      }

      await triggerReadinessAction(actionId);
      focusStage('preflight');
    } finally {
      setPreflightActionBusyId(null);
    }
  }, [
    focusStage,
    beginHandoff,
    isResolverPublishCompareActive,
    navigateTo,
    onOpenGenerator,
    syncResolverPublishModes,
    triggerReadinessAction,
    varSync,
  ]);

  const preflightActionHandlers = useMemo<
    Partial<Record<PublishPreflightActionId, (cluster: PublishPreflightCluster) => void>>
  >(() => ({
    'push-missing-variables': (cluster) => void handlePreflightAction('push-missing-variables', cluster),
    'delete-orphan-variables': (cluster) => void handlePreflightAction('delete-orphan-variables', cluster),
    'review-variable-scopes': (cluster) => void handlePreflightAction('review-variable-scopes', cluster),
    'add-token-descriptions': (cluster) => void handlePreflightAction('add-token-descriptions', cluster),
    'review-draft-tokens': (cluster) => void handlePreflightAction('review-draft-tokens', cluster),
    'review-generator-issues': (cluster) => void handlePreflightAction('review-generator-issues', cluster),
    'review-health-findings': (cluster) => void handlePreflightAction('review-health-findings', cluster),
  }), [handlePreflightAction]);

  const handleSync = useCallback(async () => {
    await runReadinessChecks();
  }, [runReadinessChecks]);

  useEffect(() => {
    if (canProceedToSync && !varSync.checked && !styleSync.checked && !varSync.loading && !styleSync.loading) {
      void compareAll();
    }
  }, [canProceedToSync, varSync.checked, styleSync.checked, varSync.loading, styleSync.loading, compareAll]);


  useEffect(() => {
    if (!publishPanelHandle) return;
    publishPanelHandle.current = {
      runReadinessChecks: () => void handleSync(),
      runCompareAll: compareAll,
      focusStage,
      focusPublishTarget,
    };
    return () => {
      publishPanelHandle.current = null;
    };
  }, [compareAll, focusPublishTarget, focusStage, handleSync, publishPanelHandle]);

  // ── Broadcast pending count to Sync tab badge ────────────────────────────
  // Fires whenever either check completes (or resets). Clears on unmount.
  useEffect(() => {
    const varCount = canProceedToSync && varSync.checked && !isResolverPublishCompareActive ? varSync.syncCount : 0;
    const styleCount = canProceedToSync && styleSync.checked ? styleSync.syncCount : 0;
    window.dispatchEvent(new CustomEvent('publish-pending-count', { detail: { total: varCount + styleCount } }));
    return () => {
      window.dispatchEvent(new CustomEvent('publish-pending-count', { detail: { total: 0 } }));
    };
  }, [
    canProceedToSync,
    isResolverPublishCompareActive,
    varSync.checked,
    varSync.syncCount,
    styleSync.checked,
    styleSync.syncCount,
  ]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('publish-preflight-state', { detail: publishPreflightState }));
    return () => {
      window.dispatchEvent(new CustomEvent('publish-preflight-state', {
        detail: { stage: 'idle', isOutdated: false, blockingCount: 0, advisoryCount: 0, canProceed: false, targetDirty: false },
      }));
    };
  }, [publishPreflightState]);

  /* ── Derived UI state ─────────────────────────────────────────────────── */

  const isSyncing = readinessLoading || compareAllLoading || varSync.loading || styleSync.loading;
  const isApplying = publishAllBusy;
  const isInSync = hasComparedAnything && totalDiffCount === 0 && !isSyncing;
  const hasBlockers = preflightStage === 'blocked';
  const hasIssues = preflightStage === 'blocked' || preflightStage === 'advisory';
  const showChanges = hasComparedAnything && totalDiffCount > 0 && !isSyncing;
  const allConflictRows = useMemo(() => [
    ...varSync.rows.filter(r => r.cat === 'conflict').map(r => ({ ...r, _source: 'variable' as const })),
    ...styleSync.rows.filter(r => r.cat === 'conflict').map(r => ({ ...r, _source: 'style' as const })),
  ], [varSync.rows, styleSync.rows]);
  const nonConflictCount = totalDiffCount - allConflictRows.length;

  /* ── Not connected ─────────────────────────────────────────────────────── */

  if (!connected) {
    return (
      <div className="flex h-full">
        <FeedbackPlaceholder
          variant="disconnected"
          title="Connect to sync with Figma"
          description="Publish and compare require an active token server connection."
          align="start"
        />
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <>
    <div className="flex h-full flex-col bg-[var(--color-figma-bg)]">
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex min-w-0 flex-col gap-3">

          {/* ── Publish target ──────────────────────────────────────── */}
          <div ref={targetRef} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start gap-1.5">
              <span className="shrink-0 text-secondary text-[color:var(--color-figma-text-secondary)]">Target</span>
              <span className="min-w-0 flex-[1_1_220px] text-secondary font-medium text-[color:var(--color-figma-text)] [overflow-wrap:anywhere]">
                {resolvedCollectionName} / {resolvedModeName}
              </span>
              <button
                type="button"
                onClick={() => setStandardRoutingExpanded((c) => !c)}
                className="rounded px-1.5 py-0.5 text-secondary font-medium text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-accent)]/10"
                aria-expanded={standardRoutingExpanded}
              >
                {standardRoutingExpanded ? 'Hide target settings' : 'Change target'}
              </button>
            </div>
            {standardRoutingExpanded && (
              <div className="flex flex-col gap-3 px-1 py-2">
                <StandardPublishRoutingCard
                  currentCollectionId={currentCollectionId}
                  draft={standardRoutingDraft}
                  dirty={standardRoutingDirty}
                  saving={standardRoutingSaving}
                  error={standardRoutingError}
                  collectionSuggestions={standardCollectionSuggestions}
                  modeSuggestions={standardModeSuggestions}
                  onFieldChange={updateStandardRoutingDraft}
                  onReset={resetStandardRoutingDraft}
                  onSave={() => void saveStandardRouting()}
                />
                <CheckboxRow
                  checked={createStylesPref}
                  onChange={setCreateStylesPref}
                  title="Create Figma styles for applicable tokens"
                  description="Colors, typography, shadows, and gradients appear in the Figma style picker. Turn off for a variables-only workflow."
                  className="px-0"
                />
              </div>
            )}
          </div>

          {/* ── Progress indicator ────────────────────────────────────── */}
          {(isSyncing || isApplying) && (
            <div className="flex items-center gap-2 text-secondary text-[color:var(--color-figma-text-secondary)]">
              <Spinner size="sm" className="text-[color:var(--color-figma-text-accent)]" />
              <span>
                {readinessLoading && 'Checking readiness…'}
                {!readinessLoading && (compareAllLoading || varSync.loading || styleSync.loading) && 'Comparing with Figma…'}
                {isApplying && publishAllStep === 'variables' && 'Updating variables…'}
                {isApplying && publishAllStep === 'styles' && 'Updating styles…'}
              </span>
            </div>
          )}

          {/* ── In sync state ─────────────────────────────────────────── */}
          {isInSync && !hasBlockers && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-figma-success)]/20 bg-[var(--color-figma-success)]/5 px-4 py-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--color-figma-text-success)] shrink-0">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="text-body text-[color:var(--color-figma-text)]">Everything in sync</span>
              {(varSync.snapshot || styleSync.snapshot) && (
                <button
                  onClick={varSync.snapshot ? varSync.revert : styleSync.revert}
                  disabled={varSync.reverting || styleSync.reverting}
                  className="ml-auto text-secondary text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text)] transition-colors"
                >
                  {varSync.reverting || styleSync.reverting ? 'Reverting…' : 'Undo last sync'}
                </button>
              )}
            </div>
          )}

          {!hasComparedAnything && !isSyncing && !isApplying && !hasIssues && preflightStage === 'idle' && !readinessError && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body font-medium text-[color:var(--color-figma-text)]">
                  Check Figma changes
                </span>
                <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
                  Compare this collection before Token Workshop writes variables or styles.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (standardRoutingDirty) {
                    void saveStandardRouting();
                    return;
                  }
                  if (canProceedToSync) {
                    void compareAll();
                    return;
                  }
                  void handleSync();
                }}
                disabled={readinessLoading || compareAllLoading || standardRoutingSaving}
                title={standardRoutingDirty || readinessChecks.length > 0 ? compareLockedMessage : undefined}
                className="shrink-0 rounded-md bg-[var(--color-figma-action-bg)] px-3 py-1.5 text-secondary font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40"
              >
                {standardRoutingSaving
                  ? 'Saving…'
                  : standardRoutingDirty
                  ? 'Save target'
                  : canProceedToSync
                    ? 'Review changes'
                    : 'Check Figma changes'}
              </button>
            </div>
          )}

          {/*── Issues section (from preflight) ───────────────────────── */}
          {hasIssues && !isSyncing && (
            <div ref={preflightRef}>
              <SyncPreflightStep
                stage={preflightStage}
                isOutdated={isReadinessOutdated}
                error={readinessError}
                blockingClusters={blockingReadinessChecks}
                advisoryClusters={advisoryReadinessChecks}
                running={readinessLoading}
                actionHandlers={preflightActionHandlers}
                actionBusyId={orphansDeleting ? 'delete-orphan-variables' : preflightActionBusyId}
              />
            </div>
          )}

          {readinessError && !hasIssues && (
            <NoticeBanner severity="error">{readinessError}</NoticeBanner>
          )}

          {/* ── Changes found ─────────────────────────────────────────── */}
          {showChanges && (
              <div ref={compareRef} className="flex flex-col gap-3">
                {/* Summary card + apply button */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-body font-medium text-[color:var(--color-figma-text)]">
                      {totalDiffCount} change{totalDiffCount !== 1 ? 's' : ''} found
                    </span>
                    <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
                      {[
                        (varSync.pushCount + styleSync.pushCount) > 0 ? `${varSync.pushCount + styleSync.pushCount} to update in Figma` : null,
                        (varSync.pullCount + styleSync.pullCount) > 0 ? `${varSync.pullCount + styleSync.pullCount} to update locally` : null,
                        totalConflictCount > 0 ? `${totalConflictCount} conflict${totalConflictCount !== 1 ? 's' : ''}` : null,
                      ].filter(Boolean).join(' \u00b7 ')}
                    </span>
                  </div>
                  {publishAllAvailable && (
                    <button
                      onClick={() => void handleOpenPublishAll()}
                      disabled={isApplying}
                      className="rounded-md bg-[var(--color-figma-action-bg)] px-3 py-1.5 text-secondary font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40"
                    >
                      {totalConflictCount > 0 ? 'Review & apply' : 'Apply all'}
                    </button>
                  )}
                </div>

                {publishAllError && (
                  <NoticeBanner severity="error">Apply failed: {publishAllError}</NoticeBanner>
                )}

                {/* Conflict rows only — direction must be chosen */}
                {allConflictRows.length > 0 && (
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-2 px-1 py-1.5">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--color-figma-text-warning)] shrink-0" aria-hidden="true">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span className="text-secondary font-medium text-[color:var(--color-figma-text)]">
                        {allConflictRows.length} conflict{allConflictRows.length !== 1 ? 's' : ''} — choose direction
                      </span>
                    </div>
                    <div className="divide-y divide-[var(--color-figma-border)]">
                      {allConflictRows.map(row => (
                        <VarDiffRowItem
                          key={getDiffRowId(row)}
                          row={row}
                          dir={(row._source === 'variable' ? varSync.dirs : styleSync.dirs)[getDiffRowId(row)] ?? 'push'}
                          onChange={d => {
                            const setDirs = row._source === 'variable' ? varSync.setDirs : styleSync.setDirs;
                            setDirs(prev => ({ ...prev, [getDiffRowId(row)]: d }));
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Non-conflict summary */}
                {nonConflictCount > 0 && (
                  <div className="text-secondary text-[color:var(--color-figma-text-secondary)] px-1">
                    {nonConflictCount} non-conflicting change{nonConflictCount !== 1 ? 's' : ''} will be applied automatically.
                  </div>
                )}
              </div>
          )}

          {activeResolver && (
            <DisclosureSection
              title="Generated outputs to Figma modes"
              summary={savedResolverPublishCount > 0
                ? `${savedResolverPublishCount} Figma mode target${savedResolverPublishCount === 1 ? '' : 's'}`
                : 'Map generated outputs to Figma modes'}
              expanded={resolverRoutingExpanded}
              onToggle={() => setResolverRoutingExpanded((current) => !current)}
              statusLabel={resolverRoutingShouldExpand ? 'Needs save' : 'Optional'}
              statusSeverity="info"
            >
              <ResolverModePublishCard
                activeResolver={activeResolver}
                loading={resolverPublishLoading}
                saving={resolverPublishSaving}
                syncing={resolverPublishSyncing}
                error={resolverPublishError}
                rows={resolverPublishRows}
                dirtyCount={resolverPublishDirtyCount}
                mappedCount={resolverPublishMappedCount}
                collectionSuggestions={resolverCollectionSuggestions}
                modeSuggestions={resolverModeSuggestions}
                onFieldChange={updateResolverPublishDraft}
                onReset={resetResolverPublishDrafts}
                onSave={() => void saveResolverPublishMappings()}
                onSync={() => void syncResolverPublishModes()}
              />
            </DisclosureSection>
          )}
        </div>
      </div>
    </div>

    {/* ── Confirmation modals ── */}
    {confirmAction === 'publish-all' && (
      <PublishAllPreviewModal
        hasVarChanges={hasVarChanges}
        hasStyleChanges={hasStyleChanges && createStylesPref}
        varRows={varSync.rows}
        varDirs={varSync.dirs}
        varPushCount={varSync.pushCount}
        varPullCount={varSync.pullCount}
        styleRows={styleSync.rows}
        styleDirs={styleSync.dirs}
        stylePushCount={createStylesPref ? styleSync.pushCount : 0}
        stylePullCount={createStylesPref ? styleSync.pullCount : 0}
        publishTargetLabel={`${resolvedCollectionName} / ${resolvedModeName}`}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await runPublishAll({ vars: true, styles: createStylesPref });
        }}
      />
    )}
    {orphanConfirm && (
      <ConfirmModal
        title={`Delete ${orphanConfirm.orphanPaths.length} orphan variable${orphanConfirm.orphanPaths.length !== 1 ? 's' : ''}?`}
        description="These variables have no matching local token. Deletion may break references in other files."
        confirmLabel="Delete"
        danger
        wide
        onCancel={() => setOrphanConfirm(null)}
        onConfirm={executeOrphanDeletion}
      >
        <div className="mt-2 max-h-[160px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {orphanConfirm.orphanPaths.map(p => (
            <div key={p} className="px-3 py-1 text-secondary font-mono text-[color:var(--color-figma-text)] border-b border-[var(--color-figma-border)] last:border-b-0 truncate" title={p}>
              {p}
            </div>
          ))}
        </div>
      </ConfirmModal>
    )}
    {missingVariablesConfirm && (
      <ConfirmModal
        title={`Create ${missingVariablesConfirm.tokens.length} Figma variable${missingVariablesConfirm.tokens.length !== 1 ? 's' : ''}?`}
        description={`Token Workshop will create the missing variables in ${missingVariablesConfirm.targetLabel}, then re-run the Figma check.`}
        confirmLabel="Create variables"
        wide
        onCancel={() => setMissingVariablesConfirm(null)}
        onConfirm={confirmMissingVariablesPush}
      >
        <div className="mt-2 max-h-[180px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {missingVariablesConfirm.tokens.slice(0, 10).map((token) => (
            <div
              key={`${token.collectionId ?? ''}:${token.path}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--color-figma-border)] px-3 py-1 text-secondary last:border-b-0"
            >
              <span className="truncate font-mono text-[color:var(--color-figma-text)]" title={token.path}>
                {token.path}
              </span>
              <span className="text-[color:var(--color-figma-text-tertiary)]">
                {token.$type}
              </span>
            </div>
          ))}
          {missingVariablesConfirm.tokens.length > 10 ? (
            <div className="px-3 py-1 text-secondary text-[color:var(--color-figma-text-tertiary)]">
              {missingVariablesConfirm.tokens.length - 10} more variable{missingVariablesConfirm.tokens.length - 10 === 1 ? '' : 's'}
            </div>
          ) : null}
        </div>
      </ConfirmModal>
    )}
    </>
  );
}

function StandardPublishRoutingCard({
  currentCollectionId,
  draft,
  dirty,
  saving,
  error,
  collectionSuggestions,
  modeSuggestions,
  onFieldChange,
  onReset,
  onSave,
}: {
  currentCollectionId: string;
  draft: PublishRoutingDraft;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  collectionSuggestions: string[];
  modeSuggestions: string[];
  onFieldChange: (field: keyof PublishRoutingDraft, value: string) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-body font-medium text-[color:var(--color-figma-text)]">
            {currentCollectionId}
          </div>
          <p className="mt-1 max-w-[520px] text-secondary leading-relaxed text-[color:var(--color-figma-text-secondary)]">
            Choose where this collection syncs in Figma. This only changes the
            Figma destination, not the authored modes in your token files.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onReset}
            disabled={saving || !dirty}
            className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)] disabled:opacity-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty}
            className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1 text-secondary font-medium text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : dirty ? 'Save target' : 'Saved'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <PublishTargetTextField
          label="Figma collection"
          value={draft.collectionName ?? ''}
          onChange={(value) => onFieldChange('collectionName', value)}
          placeholder={DEFAULT_VARIABLE_COLLECTION_NAME}
          disabled={saving}
          suggestions={collectionSuggestions}
        />

        <PublishTargetTextField
          label="Figma mode"
          value={draft.modeName ?? ''}
          onChange={(value) => onFieldChange('modeName', value)}
          placeholder="First Figma mode"
          disabled={saving}
          suggestions={modeSuggestions}
        />
      </div>

      <div className="text-secondary leading-relaxed text-[color:var(--color-figma-text-secondary)]">
        Leave the collection blank to sync into{' '}
        <span className="text-[color:var(--color-figma-text)]">
          {DEFAULT_VARIABLE_COLLECTION_NAME}
        </span>
        . Leave the mode blank to target the first mode in that Figma collection.
      </div>

      {dirty ? (
        <NoticeBanner severity="warning">
          Save this Figma target before comparing or applying variable changes.
        </NoticeBanner>
      ) : null}
      {error ? <NoticeBanner severity="error">{error}</NoticeBanner> : null}
    </div>
  );
}

function PublishTargetTextField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  suggestions,
  ariaLabel,
  labelClassName = "text-secondary text-[color:var(--color-figma-text-secondary)]",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
  suggestions: string[];
  ariaLabel?: string;
  labelClassName?: string;
}) {
  const rawListId = useId();
  const listId = `publish-target-${rawListId.replace(/:/g, '')}`;
  const filteredSuggestions = useMemo(
    () => suggestions.filter((suggestion) => suggestion !== value.trim()),
    [suggestions, value],
  );

  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={labelClassName}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        list={filteredSuggestions.length > 0 ? listId : undefined}
        aria-label={ariaLabel ?? label}
        className="min-w-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-body text-[color:var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
      />
      {filteredSuggestions.length > 0 ? (
        <datalist id={listId}>
          {filteredSuggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      ) : null}
    </label>
  );
}

function ResolverModePublishCard({
  activeResolver,
  loading,
  saving,
  syncing,
  error,
  rows,
  dirtyCount,
  mappedCount,
  collectionSuggestions,
  modeSuggestions,
  onFieldChange,
  onReset,
  onSave,
  onSync,
}: {
  activeResolver: string | null;
  loading: boolean;
  saving: boolean;
  syncing: boolean;
  error: string | null;
  rows: ResolverPublishMappingRow[];
  dirtyCount: number;
  mappedCount: number;
  collectionSuggestions: string[];
  modeSuggestions: string[];
  onFieldChange: (
    key: string,
    field: keyof ResolverPublishMappingDraft,
    value: string,
  ) => void;
  onReset: () => void;
  onSave: () => void;
  onSync: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {activeResolver ? (
            <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
              {activeResolver}
            </span>
          ) : null}
        </div>
        {activeResolver ? (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            <button
              onClick={onReset}
              disabled={loading || saving || syncing || dirtyCount === 0}
              className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)] disabled:opacity-50"
              title="Reset Figma mode target changes"
            >
              Reset
            </button>
            <button
              onClick={onSave}
              disabled={loading || saving || syncing || dirtyCount === 0}
              className="min-w-0 rounded bg-[var(--color-figma-bg-hover)] px-2.5 py-1 text-secondary font-medium text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-selected)] disabled:opacity-50"
            >
              {saving ? 'Saving…' : dirtyCount > 0 ? `Save ${dirtyCount}` : 'Saved'}
            </button>
            <button
              onClick={onSync}
              disabled={loading || saving || syncing || dirtyCount > 0 || mappedCount === 0}
              className="min-w-0 rounded bg-[var(--color-figma-action-bg)] px-2.5 py-1 text-secondary font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-50"
            >
              {syncing ? 'Publishing…' : 'Publish generated outputs'}
            </button>
          </div>
        ) : null}
      </div>

      {!activeResolver ? (
        <div className="mt-3 text-secondary leading-relaxed text-[color:var(--color-figma-text-secondary)]">
          Select generated outputs to choose which Figma mode each one updates.
        </div>
      ) : loading ? (
        <div className="mt-3 flex items-center gap-2 text-secondary text-[color:var(--color-figma-text-secondary)]">
          <Spinner size="sm" />
          Loading…
        </div>
      ) : (
        <>
          <div className="tm-publish-mapping mt-3 overflow-hidden">
            <div
              className="tm-publish-mapping__header items-center px-1 py-1.5 text-secondary font-medium text-[color:var(--color-figma-text-secondary)]"
            >
              <span>Generated output</span>
              <span>Collection</span>
              <span>Mode</span>
            </div>
            <div className="max-h-72 overflow-y-auto border-t border-[var(--color-figma-border)]">
              {rows.map((row) => (
                <div
                  key={row.key}
                  className={`tm-publish-mapping__row border-b border-[var(--color-figma-border)] px-1 py-2.5 last:border-b-0 ${row.isDirty ? 'bg-[var(--color-figma-accent)]/5' : ''}`}
                >
                  <div className="min-w-0 flex items-center gap-1.5">
                    <div className="tm-publish-mapping__resolver-label text-body font-medium text-[color:var(--color-figma-text)]" title={row.label}>
                      {row.label}
                    </div>
                    {row.isDirty && (
                      <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-[var(--color-figma-accent)]" title="Edited" />
                    )}
                  </div>

                  <div className="tm-publish-mapping__field">
                    <PublishTargetTextField
                      label="Collection"
                      value={row.collectionName}
                      onChange={(value) =>
                        onFieldChange(row.key, 'collectionName', value)
                      }
                      placeholder={`Default ${DEFAULT_RESOLVER_COLLECTION_NAME} collection`}
                      disabled={saving || syncing}
                      suggestions={collectionSuggestions}
                      ariaLabel={`Collection for ${row.label}`}
                      labelClassName="tm-publish-mapping__field-label"
                    />
                  </div>

                  <div className="tm-publish-mapping__field">
                    <PublishTargetTextField
                      label="Mode"
                      value={row.modeName}
                      onChange={(value) =>
                        onFieldChange(row.key, 'modeName', value)
                      }
                      placeholder="Required mode name"
                      disabled={saving || syncing}
                      suggestions={modeSuggestions}
                      ariaLabel={`Mode for ${row.label}`}
                      labelClassName="tm-publish-mapping__field-label"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {error ? (
        <div className="mt-2">
          <NoticeBanner severity="error">{error}</NoticeBanner>
        </div>
      ) : null}
    </div>
  );
}

/* ── PublishAllPreviewModal ─────────────────────────────────────────────── */

function PublishAllPreviewModal({
  hasVarChanges,
  hasStyleChanges,
  varRows,
  varDirs,
  varPushCount,
  varPullCount,
  styleRows,
  styleDirs,
  stylePushCount,
  stylePullCount,
  publishTargetLabel,
  onCancel,
  onConfirm,
}: {
  hasVarChanges: boolean;
  hasStyleChanges: boolean;
  varRows: PreviewRow[];
  varDirs: Record<string, 'push' | 'pull' | 'skip'>;
  varPushCount: number;
  varPullCount: number;
  styleRows: PreviewRow[];
  styleDirs: Record<string, 'push' | 'pull' | 'skip'>;
  stylePushCount: number;
  stylePullCount: number;
  publishTargetLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const hasAnyChanges = hasVarChanges || hasStyleChanges;
  const totalPush = varPushCount + stylePushCount;
  const totalPull = varPullCount + stylePullCount;

  const handleConfirm = async () => {
    setBusy(true);
    setConfirmError(null);
    try {
      await onConfirm();
    } catch (err) {
      setConfirmError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="tm-modal-shell"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={dialogRef}
        className="tm-modal-panel tm-modal-panel--publish-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-all-modal-title"
      >
        <div className="tm-modal-header border-b border-[var(--color-figma-border)]">
          <h3 id="publish-all-modal-title" className="text-heading font-semibold text-[color:var(--color-figma-text)]">
            Review changes
          </h3>
          {hasAnyChanges && (
            <div className="flex flex-col gap-0.5">
              <p className="text-secondary text-[color:var(--color-figma-text-secondary)] [overflow-wrap:anywhere]">
                {[
                  totalPush > 0 ? `↑ ${totalPush} to update in Figma` : null,
                  totalPull > 0 ? `↓ ${totalPull} to update locally` : null,
                ].filter(Boolean).join(' · ')}
              </p>
              <p className="text-secondary text-[color:var(--color-figma-text-secondary)] [overflow-wrap:anywhere]">
                Target: <span className="font-medium text-[color:var(--color-figma-text)]">{publishTargetLabel}</span>
              </p>
            </div>
          )}
        </div>

        <div className="tm-modal-body gap-3 pb-2">
          {/* All in sync — shown when auto-compare found no pending changes */}
          {!hasAnyChanges && (
            <div className="py-3 text-secondary text-[color:var(--color-figma-text-secondary)] text-center">
              Everything in sync.
            </div>
          )}

          {hasVarChanges && (
            <SyncDiffSummary rows={varRows} dirs={varDirs} />
          )}

          {hasStyleChanges && (
            <SyncDiffSummary rows={styleRows} dirs={styleDirs} />
          )}
        </div>

        {confirmError && (
          <p className="px-4 pb-2 text-secondary text-[color:var(--color-figma-text-error)] break-words" role="alert">{confirmError}</p>
        )}
        <div className="tm-modal-footer border-t border-[var(--color-figma-border)] pt-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-3 py-1.5 rounded text-body font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          {hasAnyChanges ? (
            <button
              onClick={handleConfirm}
              disabled={busy}
              className="flex-1 px-3 py-1.5 rounded text-body font-medium bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-action-bg-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy && <Spinner size="sm" className="text-white" />}
              {busy ? 'Applying\u2026' : 'Apply selected changes'}
            </button>
          ) : (
            <button
              onClick={onCancel}
              className="flex-1 px-3 py-1.5 rounded text-body font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function stageStatusTextClass(severity: NoticeSeverity): string {
  if (severity === 'error') return 'text-[color:var(--color-figma-text-error)]';
  if (severity === 'warning' || severity === 'stale') {
    return 'text-[color:var(--color-figma-text-warning)]';
  }
  if (severity === 'success') return 'text-[color:var(--color-figma-text-success)]';
  return 'text-[color:var(--color-figma-text-secondary)]';
}

function DisclosureSection({
  title,
  summary,
  statusLabel,
  statusSeverity,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  statusLabel: string;
  statusSeverity: NoticeSeverity;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="py-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <h2 className="text-heading font-semibold text-[color:var(--color-figma-text)]">{title}</h2>
          <p className={`mt-1 text-secondary ${stageStatusTextClass(statusSeverity)}`}>
            {statusLabel}
            <span className="mx-1 text-[color:var(--color-figma-text-tertiary)]">·</span>
            <span className="text-[color:var(--color-figma-text-secondary)]">{summary}</span>
          </p>
        </div>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`mt-1 shrink-0 text-[color:var(--color-figma-text-tertiary)] ${expanded ? 'rotate-90' : ''} transition-transform`} aria-hidden="true">
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>

      {expanded ? (
        <div className="mt-3 pl-3">{children}</div>
      ) : null}
    </section>
  );
}
