import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flattenTokenGroup, type DTCGGroup } from "@tokenmanager/core";
import {
  type CollectionData,
  defaultSetName,
  modeKey,
  type ImportSource as ImportSourceKind,
  type ImportToken,
  type ImportWorkflowStage,
  type SourceFamily,
} from "./importPanelTypes";
import type { SkippedEntry } from "../shared/tokenParsers";
import { useImportSets } from "../hooks/useImportSets";
import {
  useImportSource,
  type FileImportValidation,
} from "../hooks/useImportSource";
import type { UndoSlot } from "../hooks/useUndo";
import { copyToClipboard } from "../shared/comparisonUtils";
import { apiFetch, ApiError } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import { getErrorMessage, SET_NAME_RE } from "../shared/utils";
import {
  getImportResultNextStepRecommendations,
  type ImportNextStepRecommendation,
} from "../shared/navigationTypes";

export interface ImportPanelProps {
  serverUrl: string;
  connected: boolean;
  onImported: () => void;
  onImportComplete: (result: ImportCompletionResult) => void;
  onOpenImportNextStep: (
    result: ImportCompletionResult,
    recommendation: ImportNextStepRecommendation,
  ) => void;
  onPushUndo?: (slot: UndoSlot) => void;
}

export type ImportReviewActionKey = "overwrite" | "merge" | "skip";

export interface ImportReviewActionCopy {
  key: ImportReviewActionKey;
  label: string;
  buttonLabel: string;
  consequence: string;
}

export interface ImportFailureGroup {
  setName: string;
  paths: string[];
}

export interface LastImportReviewSummary {
  destinationLabel: string;
  newCount: number;
  overwriteCount: number;
  mergeCount: number;
  keepExistingCount: number;
}

export interface ImportRollbackOperation {
  operationId: string;
  setName: string;
  changedPaths: string[];
}

export interface VariableConflictDetail {
  path: string;
  setName: string;
  existing: { $type: string; $value: unknown };
  incoming: ImportToken;
  kind: "existing" | "incoming-duplicate";
  existingLabel?: string;
  incomingLabel?: string;
  note?: string;
}

export interface ImportCompletionResult {
  sourceType: ImportSourceKind;
  sourceFamily: SourceFamily;
  destinationSets: string[];
  newCount: number;
  overwriteCount: number;
  mergeCount: number;
  keepExistingCount: number;
  totalImportedCount: number;
  hadFailures: boolean;
  sourceCollectionCount?: number;
}

export interface CollectionModeDestinationStatus {
  sharedDestinationCount: number;
  ambiguousPathCount: number;
}

type ExistingTokenValue = { $type: string; $value: unknown };
type ConflictDecision = "accept" | "merge" | "reject";
type ImportBatch = { setName: string; tokens: Record<string, unknown>[] };
type ImportHistory = { operations: ImportRollbackOperation[] };
type ImportStrategy = "overwrite" | "skip" | "merge";
type ImportSource = ImportSourceKind | null;
type CollectionImportTokenSource = {
  modeKey: string;
  sourceLabel: string;
  token: ImportToken;
};
type CollectionImportPlan = {
  setName: string;
  writeTokens: CollectionImportTokenSource[];
  duplicateConflicts: {
    path: string;
    tokens: CollectionImportTokenSource[];
  }[];
  totalPathCount: number;
  modeKeys: string[];
};

export interface ImportSourceContextValue {
  loading: boolean;
  error: string | null;
  sourceFamily: SourceFamily | null;
  source: ImportSource;
  workflowStage: ImportWorkflowStage;
  collectionData: CollectionData[];
  tokens: ImportToken[];
  selectedTokens: Set<string>;
  typeFilter: string | null;
  skippedEntries: SkippedEntry[];
  skippedExpanded: boolean;
  fileImportValidation: FileImportValidation | null;
  isDragging: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  cssFileInputRef: React.RefObject<HTMLInputElement | null>;
  tailwindFileInputRef: React.RefObject<HTMLInputElement | null>;
  tokensStudioFileInputRef: React.RefObject<HTMLInputElement | null>;
  setTypeFilter: React.Dispatch<React.SetStateAction<string | null>>;
  setSkippedExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  handleReadVariables: () => void;
  handleReadStyles: () => void;
  handleReadJson: () => void;
  handleReadCSS: () => void;
  handleReadTailwind: () => void;
  handleReadTokensStudio: () => void;
  handleJsonFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCSSFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleTailwindFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleTokensStudioFileChange: (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleBack: () => void;
  selectSourceFamily: (family: SourceFamily) => void;
  continueToPreview: () => void;
  toggleToken: (path: string) => void;
  toggleAll: () => void;
}

export interface ImportDestinationContextValue {
  targetSet: string;
  sets: string[];
  setsError: string | null;
  newSetInputVisible: boolean;
  newSetDraft: string;
  newSetError: string | null;
  modeSetNames: Record<string, string>;
  modeEnabled: Record<string, boolean>;
  collectionModeDestinationStatus: Record<
    string,
    CollectionModeDestinationStatus
  >;
  hasAmbiguousCollectionImport: boolean;
  ambiguousCollectionImportCount: number;
  totalEnabledSets: number;
  totalEnabledTokens: number;
  usesCollectionDestination: boolean;
  destinationReady: boolean;
  canContinueToPreview: boolean;
  hasInvalidModeSetNames: boolean;
  setNewSetInputVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setNewSetDraft: React.Dispatch<React.SetStateAction<string>>;
  setNewSetError: React.Dispatch<React.SetStateAction<string | null>>;
  setModeSetNames: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setModeEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  commitNewSet: () => void;
  cancelNewSet: () => void;
  setTargetSetAndPersist: (name: string) => void;
  fetchSets: () => Promise<void>;
}

export interface ImportReviewContextValue {
  importing: boolean;
  importProgress: { done: number; total: number } | null;
  reviewActionCopy: Record<ImportReviewActionKey, ImportReviewActionCopy>;
  conflictPaths: string[] | null;
  conflictExistingValues: Map<string, ExistingTokenValue> | null;
  conflictDecisions: Map<string, ConflictDecision>;
  conflictSearch: string;
  conflictStatusFilter: "all" | "accept" | "merge" | "reject";
  conflictTypeFilter: string;
  checkingConflicts: boolean;
  existingTokenMap: Map<string, ExistingTokenValue> | null;
  existingPathsFetching: boolean;
  existingTokenMapError: string | null;
  previewNewCount: number | null;
  previewOverwriteCount: number | null;
  varConflictPreview: { newCount: number; overwriteCount: number } | null;
  varConflictDetails: VariableConflictDetail[] | null;
  varConflictDetailsExpanded: boolean;
  checkingVarConflicts: boolean;
  setConflictSearch: React.Dispatch<React.SetStateAction<string>>;
  setConflictStatusFilter: React.Dispatch<
    React.SetStateAction<"all" | "accept" | "merge" | "reject">
  >;
  setConflictTypeFilter: React.Dispatch<React.SetStateAction<string>>;
  setConflictDecisions: React.Dispatch<
    React.SetStateAction<Map<string, ConflictDecision>>
  >;
  setVarConflictDetailsExpanded: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  clearConflictState: () => void;
  handleImportVariables: (strategy?: ImportStrategy) => Promise<void>;
  handleImportStyles: () => Promise<void>;
  executeImport: (
    strategy: "skip" | "overwrite",
    excludePaths?: Set<string>,
    mergePaths?: Set<string>,
  ) => Promise<void>;
}

export interface ImportResultContextValue {
  successMessage: string | null;
  failedImportPaths: string[];
  failedImportBatches: ImportBatch[];
  failedImportStrategy: ImportStrategy;
  succeededImportCount: number;
  retrying: boolean;
  copyFeedback: boolean;
  lastImport: ImportHistory | null;
  lastImportReviewSummary: LastImportReviewSummary | null;
  importNextStepRecommendations: ImportNextStepRecommendation[];
  undoing: boolean;
  failedImportGroups: ImportFailureGroup[];
  handleUndoImport: () => Promise<void>;
  handleRetryFailed: () => Promise<void>;
  handleCopyFailedPaths: () => void;
  openImportNextStep: (recommendation: ImportNextStepRecommendation) => void;
  clearSuccessState: () => void;
}

export const IMPORT_REVIEW_ACTION_COPY: Record<
  ImportReviewActionKey,
  ImportReviewActionCopy
> = {
  overwrite: {
    key: "overwrite",
    label: "Overwrite",
    buttonLabel: "Overwrite conflicts",
    consequence: "Replace current value with incoming.",
  },
  merge: {
    key: "merge",
    label: "Merge",
    buttonLabel: "Merge conflicts",
    consequence: "Update value, keep existing notes and metadata.",
  },
  skip: {
    key: "skip",
    label: "Keep existing",
    buttonLabel: "Keep existing conflicts",
    consequence: "Skip conflicts, import only new tokens.",
  },
};

const ImportSourceContext = createContext<ImportSourceContextValue | null>(null);
const ImportDestinationContext =
  createContext<ImportDestinationContextValue | null>(null);
const ImportReviewContext = createContext<ImportReviewContextValue | null>(null);
const ImportResultContext = createContext<ImportResultContextValue | null>(null);

function useRequiredContext<T>(
  context: React.Context<T | null>,
  hookName: string,
): T {
  const value = useContext(context);
  if (value === null) {
    throw new Error(`${hookName} must be used within ImportPanelProvider`);
  }
  return value;
}

function getImportSourceTag(source: ImportSource): string | null {
  if (source === "variables") return "figma-variables";
  if (source === "styles") return "figma-styles";
  return source;
}

function buildImportPayload(
  token: ImportToken,
  source: ImportSource,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    path: token.path,
    $type: token.$type,
    $value: token.$value,
  };
  if (token.$description) payload.$description = token.$description;
  if (token.$scopes && token.$scopes.length > 0) {
    payload.$scopes = token.$scopes;
  }
  const sourceTag = getImportSourceTag(source);
  if (sourceTag) {
    payload.$extensions = {
      ...(token.$extensions ?? {}),
      tokenmanager: {
        ...(token.$extensions?.tokenmanager ?? {}),
        source: sourceTag,
      },
    };
  }
  return payload;
}

function flattenExistingTokens(
  tokens: Record<string, unknown> | undefined,
): Map<string, ExistingTokenValue> {
  const flat = flattenTokenGroup((tokens ?? {}) as DTCGGroup);
  const mapped = new Map<string, ExistingTokenValue>();
  for (const [path, token] of flat) {
    mapped.set(path, {
      $type: typeof token.$type === "string" ? token.$type : "unknown",
      $value: token.$value,
    });
  }
  return mapped;
}

function buildFailedImportGroups(batches: ImportBatch[]): ImportFailureGroup[] {
  return batches
    .map((batch) => ({
      setName: batch.setName,
      paths: batch.tokens
        .map((token) => token.path)
        .filter((path): path is string => typeof path === "string"),
    }))
    .filter((group) => group.paths.length > 0);
}

function toImportRollbackOperation(
  setName: string,
  result: {
    changedPaths?: string[];
    operationId?: string;
  },
): ImportRollbackOperation | null {
  if (!result.operationId) {
    return null;
  }
  const changedPaths = result.changedPaths ?? [];
  if (changedPaths.length === 0) {
    return null;
  }
  return {
    operationId: result.operationId,
    setName,
    changedPaths,
  };
}

function buildCollectionImportSourceLabel(
  collectionName: string,
  modeName: string,
): string {
  return `${collectionName} / ${modeName}`;
}

function buildCollectionImportPlans(
  collectionData: CollectionData[],
  modeEnabled: Record<string, boolean>,
  modeSetNames: Record<string, string>,
): {
  plans: CollectionImportPlan[];
  modeStatus: Record<string, CollectionModeDestinationStatus>;
  ambiguousPathCount: number;
} {
  const groupedPlans = new Map<
    string,
    {
      setName: string;
      pathSources: Map<string, CollectionImportTokenSource[]>;
      modeKeys: Set<string>;
    }
  >();

  for (const collection of collectionData) {
    for (const mode of collection.modes) {
      const key = modeKey(collection.name, mode.modeId);
      if (!(modeEnabled[key] ?? true)) {
        continue;
      }

      const setName = (
        modeSetNames[key] ??
        defaultSetName(collection.name, mode.modeName, collection.modes.length)
      ).trim();
      const sourceLabel = buildCollectionImportSourceLabel(
        collection.name,
        mode.modeName,
      );
      let plan = groupedPlans.get(setName);
      if (!plan) {
        plan = {
          setName,
          pathSources: new Map(),
          modeKeys: new Set(),
        };
        groupedPlans.set(setName, plan);
      }

      plan.modeKeys.add(key);
      for (const token of mode.tokens) {
        const pathSources = plan.pathSources.get(token.path) ?? [];
        pathSources.push({
          modeKey: key,
          sourceLabel,
          token,
        });
        plan.pathSources.set(token.path, pathSources);
      }
    }
  }

  const modeStatus: Record<string, CollectionModeDestinationStatus> = {};
  const plans: CollectionImportPlan[] = [];
  let ambiguousPathCount = 0;

  for (const plan of groupedPlans.values()) {
    const modeKeys = [...plan.modeKeys];
    for (const modeKeyValue of modeKeys) {
      modeStatus[modeKeyValue] = {
        sharedDestinationCount: modeKeys.length,
        ambiguousPathCount: 0,
      };
    }

    const writeTokens: CollectionImportTokenSource[] = [];
    const duplicateConflicts: CollectionImportPlan["duplicateConflicts"] = [];

    for (const [path, pathSources] of plan.pathSources) {
      if (pathSources.length === 1) {
        writeTokens.push(pathSources[0]);
        continue;
      }

      ambiguousPathCount += 1;
      duplicateConflicts.push({ path, tokens: pathSources });
      const conflictingModes = new Set(
        pathSources.map((source) => source.modeKey),
      );
      for (const modeKeyValue of conflictingModes) {
        const currentStatus = modeStatus[modeKeyValue] ?? {
          sharedDestinationCount: modeKeys.length,
          ambiguousPathCount: 0,
        };
        currentStatus.ambiguousPathCount += 1;
        modeStatus[modeKeyValue] = currentStatus;
      }
    }

    plans.push({
      setName: plan.setName,
      writeTokens,
      duplicateConflicts,
      totalPathCount: plan.pathSources.size,
      modeKeys,
    });
  }

  return {
    plans,
    modeStatus,
    ambiguousPathCount,
  };
}

export function useImportSourceContext(): ImportSourceContextValue {
  return useRequiredContext(ImportSourceContext, "useImportSourceContext");
}

export function useImportDestinationContext(): ImportDestinationContextValue {
  return useRequiredContext(
    ImportDestinationContext,
    "useImportDestinationContext",
  );
}

export function useImportReviewContext(): ImportReviewContextValue {
  return useRequiredContext(ImportReviewContext, "useImportReviewContext");
}

export function useImportResultContext(): ImportResultContextValue {
  return useRequiredContext(ImportResultContext, "useImportResultContext");
}

export function ImportPanelProvider({
  serverUrl,
  connected,
  onImported,
  onImportComplete,
  onOpenImportNextStep,
  onPushUndo,
  children,
}: ImportPanelProps & { children: React.ReactNode }) {
  const [conflictPaths, setConflictPaths] = useState<string[] | null>(null);
  const [conflictExistingValues, setConflictExistingValues] = useState<Map<
    string,
    ExistingTokenValue
  > | null>(null);
  const [conflictDecisions, setConflictDecisions] = useState<
    Map<string, ConflictDecision>
  >(new Map());
  const [conflictSearch, setConflictSearch] = useState("");
  const [conflictStatusFilter, setConflictStatusFilter] = useState<
    "all" | "accept" | "merge" | "reject"
  >("all");
  const [conflictTypeFilter, setConflictTypeFilter] = useState("all");
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [existingTokenMap, setExistingTokenMap] = useState<Map<
    string,
    ExistingTokenValue
  > | null>(null);
  const [existingPathsFetching, setExistingPathsFetching] = useState(false);
  const [existingTokenMapError, setExistingTokenMapError] = useState<
    string | null
  >(null);
  const [varConflictPreview, setVarConflictPreview] = useState<{
    newCount: number;
    overwriteCount: number;
  } | null>(null);
  const [varConflictDetails, setVarConflictDetails] = useState<
    VariableConflictDetail[] | null
  >(null);
  const [varConflictDetailsExpanded, setVarConflictDetailsExpanded] =
    useState(false);
  const [checkingVarConflicts, setCheckingVarConflicts] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [failedImportPaths, setFailedImportPaths] = useState<string[]>([]);
  const [failedImportBatches, setFailedImportBatches] = useState<ImportBatch[]>(
    [],
  );
  const [failedImportStrategy, setFailedImportStrategy] =
    useState<ImportStrategy>("overwrite");
  const [succeededImportCount, setSucceededImportCount] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [lastImport, setLastImport] = useState<ImportHistory | null>(null);
  const [lastImportResult, setLastImportResult] =
    useState<ImportCompletionResult | null>(null);
  const [lastImportReviewSummary, setLastImportReviewSummary] =
    useState<LastImportReviewSummary | null>(null);
  const [undoing, setUndoing] = useState(false);

  const existingPathsCacheRef = useRef<
    Map<string, Map<string, ExistingTokenValue>>
  >(new Map());
  const lastImportRef = useRef<ImportHistory | null>(null);
  const existingFetchIdRef = useRef(0);
  const varConflictFetchIdRef = useRef(0);
  const retryingRef = useRef(false);
  const undoingRef = useRef(false);
  const onPushUndoRef = useRef(onPushUndo);
  const onImportedRef = useRef(onImported);
  const onImportCompleteRef = useRef(onImportComplete);
  const onOpenImportNextStepRef = useRef(onOpenImportNextStep);
  const serverUrlRef = useRef(serverUrl);
  onPushUndoRef.current = onPushUndo;
  onImportedRef.current = onImported;
  onImportCompleteRef.current = onImportComplete;
  onOpenImportNextStepRef.current = onOpenImportNextStep;
  serverUrlRef.current = serverUrl;

  const clearFailedState = useCallback(() => {
    setFailedImportPaths([]);
    setFailedImportBatches([]);
    setSucceededImportCount(0);
  }, []);

  const clearConflictState = useCallback(() => {
    setConflictPaths(null);
    setConflictExistingValues(null);
    setConflictDecisions(new Map());
    setConflictSearch("");
    setConflictStatusFilter("all");
    setConflictTypeFilter("all");
  }, []);

  const resetExistingPathsCache = useCallback(() => {
    existingFetchIdRef.current += 1;
    existingPathsCacheRef.current.clear();
    setExistingTokenMap(null);
    setExistingTokenMapError(null);
    setExistingPathsFetching(false);
  }, []);

  const src = useImportSource({
    onClearConflictState: clearConflictState,
    onResetExistingPathsCache: resetExistingPathsCache,
  });
  const {
    clearFileImportValidation,
    resetAfterImport,
    selectedTokens: sourceSelectedTokens,
    setError: setSourceError,
    source: activeSource,
  } = src;

  const setsHook = useImportSets({
    serverUrl,
    connected,
    onClearConflictState: clearConflictState,
  });

  const selectedImportTokens = useMemo(
    () => src.tokens.filter((token) => src.selectedTokens.has(token.path)),
    [src.tokens, src.selectedTokens],
  );

  const {
    plans: collectionImportPlans,
    modeStatus: collectionModeDestinationStatus,
    ambiguousPathCount: ambiguousCollectionImportCount,
  } = useMemo(
    () =>
      buildCollectionImportPlans(
        src.collectionData,
        src.modeEnabled,
        src.modeSetNames,
      ),
    [src.collectionData, src.modeEnabled, src.modeSetNames],
  );

  const totalEnabledSets = collectionImportPlans.length;
  const enabledCollectionCount = useMemo(
    () =>
      src.collectionData.filter((collection) =>
        collection.modes.some(
          (mode) => src.modeEnabled[modeKey(collection.name, mode.modeId)],
        ),
      ).length,
    [src.collectionData, src.modeEnabled],
  );
  const totalEnabledTokens = useMemo(
    () =>
      collectionImportPlans.reduce(
        (count, plan) => count + plan.totalPathCount,
        0,
      ),
    [collectionImportPlans],
  );
  const hasAmbiguousCollectionImport = ambiguousCollectionImportCount > 0;

  const previewNewCount = useMemo(
    () =>
      existingTokenMap !== null
        ? [...src.selectedTokens].filter((path) => !existingTokenMap.has(path))
            .length
        : null,
    [existingTokenMap, src.selectedTokens],
  );

  const previewOverwriteCount = useMemo(
    () =>
      existingTokenMap !== null
        ? [...src.selectedTokens].filter((path) => existingTokenMap.has(path))
            .length
        : null,
    [existingTokenMap, src.selectedTokens],
  );

  const fetchSetTokenMap = useCallback(
    async (setName: string) => {
      const cached = existingPathsCacheRef.current.get(setName);
      if (cached) {
        return cached;
      }

      try {
        const data = await apiFetch<{ tokens?: Record<string, unknown> }>(
          `${serverUrl}/api/tokens/${encodeURIComponent(setName)}`,
        );
        const mapped = flattenExistingTokens(data.tokens);
        existingPathsCacheRef.current.set(setName, mapped);
        return mapped;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          const empty = new Map<string, ExistingTokenValue>();
          existingPathsCacheRef.current.set(setName, empty);
          return empty;
        }
        throw err;
      }
    },
    [serverUrl],
  );

  const prefetchExistingPaths = useCallback(
    async (setName: string) => {
      const fetchId = ++existingFetchIdRef.current;
      setExistingPathsFetching(true);
      setExistingTokenMapError(null);

      try {
        const mapped = await fetchSetTokenMap(setName);
        if (fetchId !== existingFetchIdRef.current) {
          return;
        }
        setExistingTokenMap(mapped);
      } catch (err) {
        if (fetchId !== existingFetchIdRef.current) {
          return;
        }
        setExistingTokenMap(null);
        setExistingTokenMapError(
          getErrorMessage(err, "Failed to load existing tokens"),
        );
      } finally {
        if (fetchId === existingFetchIdRef.current) {
          setExistingPathsFetching(false);
        }
      }
    },
    [fetchSetTokenMap],
  );

  useEffect(() => {
    if (src.tokens.length === 0) {
      setExistingTokenMap(null);
      setExistingTokenMapError(null);
      setExistingPathsFetching(false);
      return;
    }
    void prefetchExistingPaths(setsHook.targetSet);
  }, [prefetchExistingPaths, setsHook.targetSet, src.tokens.length]);

  useEffect(() => {
    clearConflictState();
    if (src.tokens.length > 0) {
      void prefetchExistingPaths(setsHook.targetSet);
    }
  }, [
    clearConflictState,
    prefetchExistingPaths,
    setsHook.targetSet,
    src.tokens.length,
  ]);

  useEffect(() => {
    if (collectionImportPlans.length === 0) {
      varConflictFetchIdRef.current += 1;
      setVarConflictPreview(null);
      setVarConflictDetails(null);
      setVarConflictDetailsExpanded(false);
      setCheckingVarConflicts(false);
      return;
    }

    const fetchId = ++varConflictFetchIdRef.current;
    setCheckingVarConflicts(true);

    void (async () => {
      try {
        let newCount = 0;
        let overwriteCount = 0;
        const details: VariableConflictDetail[] = [];

        for (const plan of collectionImportPlans) {
          for (const conflict of plan.duplicateConflicts) {
            const [firstSource, lastSource] = [
              conflict.tokens[0],
              conflict.tokens[conflict.tokens.length - 1],
            ];
            if (!firstSource || !lastSource) {
              continue;
            }

            overwriteCount += 1;
            details.push({
              path: conflict.path,
              setName: plan.setName,
              existing: {
                $type: firstSource.token.$type,
                $value: firstSource.token.$value,
              },
              incoming: lastSource.token,
              kind: "incoming-duplicate",
              existingLabel: firstSource.sourceLabel,
              incomingLabel: lastSource.sourceLabel,
              note:
                conflict.tokens.length === 2
                  ? "Two enabled modes target this path."
                  : `${conflict.tokens.length} enabled modes target this path.`,
            });
          }

          const existing = setsHook.sets.includes(plan.setName)
            ? await fetchSetTokenMap(plan.setName)
            : new Map<string, ExistingTokenValue>();
          if (fetchId !== varConflictFetchIdRef.current) {
            return;
          }

          for (const source of plan.writeTokens) {
            const current = existing.get(source.token.path);
            if (!current) {
              newCount += 1;
              continue;
            }

            overwriteCount += 1;
            details.push({
              path: source.token.path,
              setName: plan.setName,
              existing: current,
              incoming: source.token,
              kind: "existing",
              existingLabel: "Current token",
              incomingLabel: source.sourceLabel,
            });
          }
        }

        if (fetchId !== varConflictFetchIdRef.current) {
          return;
        }
        setVarConflictPreview({
          newCount,
          overwriteCount,
        });
        setVarConflictDetails(details);
        setVarConflictDetailsExpanded(details.length > 0);
      } catch {
        if (fetchId !== varConflictFetchIdRef.current) {
          return;
        }
        setVarConflictPreview(null);
        setVarConflictDetails(null);
        setVarConflictDetailsExpanded(false);
      } finally {
        if (fetchId === varConflictFetchIdRef.current) {
          setCheckingVarConflicts(false);
        }
      }
    })();
  }, [collectionImportPlans, fetchSetTokenMap, setsHook.sets]);

  const importPayloadBatch = useCallback(
    async (
      setName: string,
      tokens: Record<string, unknown>[],
      strategy: ImportStrategy,
    ) => {
      return await apiFetch<{
        imported: number;
        skipped: number;
        changedPaths?: string[];
        operationId?: string;
      }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokens, strategy }),
        },
      );
    },
    [serverUrl],
  );

  const importTokenBatch = useCallback(
    async (setName: string, tokens: ImportToken[], strategy: ImportStrategy) =>
      importPayloadBatch(
        setName,
        tokens.map((token) => buildImportPayload(token, activeSource)),
        strategy,
      ),
    [activeSource, importPayloadBatch],
  );

  const rollbackImportHistory = useCallback(async (history: ImportHistory) => {
    const operations = history.operations;
    while (operations.length > 0) {
      const operation = operations[operations.length - 1];
      await apiFetch(
        `${serverUrlRef.current}/api/operations/${encodeURIComponent(operation.operationId)}/rollback`,
        {
          method: "POST",
        },
      );
      operations.pop();
    }
  }, []);

  const setCurrentImportHistory = useCallback((history: ImportHistory | null) => {
    lastImportRef.current = history;
    setLastImport(history);
  }, []);

  const appendImportRollbackOperations = useCallback(
    (
      operations: ImportRollbackOperation[],
      options?: { pushUndo?: boolean },
    ) => {
      if (operations.length === 0) {
        return;
      }

      const currentHistory = lastImportRef.current;
      const history =
        currentHistory ?? {
          operations: [],
        };
      history.operations.push(
        ...operations.map((operation) => ({
          operationId: operation.operationId,
          setName: operation.setName,
          changedPaths: [...operation.changedPaths],
        })),
      );
      setCurrentImportHistory(history);

      if (!options?.pushUndo || currentHistory || !onPushUndoRef.current) {
        return;
      }

      onPushUndoRef.current({
        description: "Undo import",
        restore: async () => {
          await rollbackImportHistory(history);
          onImportedRef.current();
          setCurrentImportHistory(null);
          setLastImportReviewSummary(null);
          setSuccessMessage(null);
          clearFailedState();
          resetExistingPathsCache();
        },
      });
    },
    [
      clearFailedState,
      resetExistingPathsCache,
      rollbackImportHistory,
      setCurrentImportHistory,
    ],
  );

  const publishImportCompletion = useCallback(
    (result: Omit<ImportCompletionResult, "sourceType" | "sourceFamily">) => {
      if (!src.source || !src.sourceFamily) {
        console.warn("[ImportPanel] import completion metadata missing");
        return;
      }

      const completionResult: ImportCompletionResult = {
        sourceType: src.source,
        sourceFamily: src.sourceFamily,
        ...result,
      };
      setLastImportResult(completionResult);
      onImportCompleteRef.current(completionResult);
    },
    [src.source, src.sourceFamily],
  );

  const handleImportVariables = useCallback(
    async (strategy: ImportStrategy = "overwrite") => {
      if (hasAmbiguousCollectionImport) {
        dispatchToast(
          ambiguousCollectionImportCount === 1
            ? "Duplicate token paths in one collection. Change the mapping or disable a mode."
            : `${ambiguousCollectionImportCount} duplicate paths across modes. Change mappings or disable conflicting modes.`,
          "error",
        );
        return;
      }

      setSourceError(null);
      setImporting(true);
      setImportProgress({ done: 0, total: collectionImportPlans.length });
      clearConflictState();
      clearFailedState();
      setFailedImportStrategy(strategy);

      let importedSets = 0;
      let importedTokens = 0;
      const failedPaths: string[] = [];
      const failedBatches: ImportBatch[] = [];
      const rollbackOperations: ImportRollbackOperation[] = [];

      try {
        for (const plan of collectionImportPlans) {
          try {
            const result = await importTokenBatch(
              plan.setName,
              plan.writeTokens.map((source) => source.token),
              strategy,
            );
            importedTokens += result.imported;
            const rollbackOperation = toImportRollbackOperation(
              plan.setName,
              result,
            );
            if (rollbackOperation) {
              rollbackOperations.push(rollbackOperation);
            }
          } catch (err) {
            console.warn("[ImportPanel] failed to import token batch:", err);
            failedPaths.push(
              ...plan.writeTokens.map((source) => source.token.path),
            );
            failedBatches.push({
              setName: plan.setName,
              tokens: plan.writeTokens.map((source) =>
                buildImportPayload(source.token, activeSource),
              ),
            });
          }

          importedSets += 1;
          setImportProgress({
            done: importedSets,
            total: collectionImportPlans.length,
          });
        }

        const failedCount = failedPaths.length;
        const toastMessage =
          failedCount > 0
            ? `Imported ${importedTokens} tokens across ${importedSets} collection${importedSets !== 1 ? "s" : ""} (${failedCount} failed)`
            : `Imported ${importedTokens} tokens across ${importedSets} collection${importedSets !== 1 ? "s" : ""}`;
        const successSummary =
          failedCount > 0
            ? `${importedTokens} token${importedTokens !== 1 ? "s" : ""} imported to ${importedSets} collection${importedSets !== 1 ? "s" : ""} — ${failedCount} failed`
            : `${importedTokens} token${importedTokens !== 1 ? "s" : ""} imported to ${importedSets} collection${importedSets !== 1 ? "s" : ""}`;

        dispatchToast(toastMessage, failedCount > 0 ? "error" : "success");
        onImportedRef.current();
        publishImportCompletion({
          destinationSets: collectionImportPlans.map((plan) => plan.setName),
          newCount: varConflictPreview?.newCount ?? totalEnabledTokens,
          overwriteCount:
            strategy === "overwrite"
              ? (varConflictPreview?.overwriteCount ?? 0)
              : 0,
          mergeCount:
            strategy === "merge"
              ? (varConflictPreview?.overwriteCount ?? 0)
              : 0,
          keepExistingCount:
            strategy === "skip" ? (varConflictPreview?.overwriteCount ?? 0) : 0,
          totalImportedCount: importedTokens,
          hadFailures: failedCount > 0,
          sourceCollectionCount: enabledCollectionCount,
        });
        resetExistingPathsCache();
        resetAfterImport();

        if (failedCount > 0) {
          setFailedImportPaths(failedPaths);
          setFailedImportBatches(failedBatches);
          setSucceededImportCount(importedTokens);
        }

        setLastImportReviewSummary({
          destinationLabel:
            collectionImportPlans.length === 1
              ? `"${collectionImportPlans[0]?.setName ?? "Unknown collection"}"`
              : `${collectionImportPlans.length} collections`,
          newCount: varConflictPreview?.newCount ?? totalEnabledTokens,
          overwriteCount:
            strategy === "overwrite"
              ? (varConflictPreview?.overwriteCount ?? 0)
              : 0,
          mergeCount:
            strategy === "merge"
              ? (varConflictPreview?.overwriteCount ?? 0)
              : 0,
          keepExistingCount:
            strategy === "skip" ? (varConflictPreview?.overwriteCount ?? 0) : 0,
        });
        setCurrentImportHistory(null);
        appendImportRollbackOperations(rollbackOperations, { pushUndo: true });
        setSuccessMessage(successSummary);
      } catch (err) {
        setSourceError(getErrorMessage(err));
      } finally {
        setImporting(false);
        setImportProgress(null);
      }
    },
    [
      ambiguousCollectionImportCount,
      appendImportRollbackOperations,
      clearConflictState,
      clearFailedState,
      collectionImportPlans,
      enabledCollectionCount,
      hasAmbiguousCollectionImport,
      importTokenBatch,
      publishImportCompletion,
      resetExistingPathsCache,
      setCurrentImportHistory,
      totalEnabledTokens,
      varConflictPreview,
      activeSource,
      resetAfterImport,
      setSourceError,
    ],
  );

  const executeImport = useCallback(
    async (
      strategy: "skip" | "overwrite",
      excludePaths?: Set<string>,
      mergePaths?: Set<string>,
    ) => {
      setSourceError(null);
      setImporting(true);
      clearConflictState();
      clearFailedState();

      try {
        const tokensToImport = selectedImportTokens.filter(
          (token) => !excludePaths?.has(token.path),
        );
        setImportProgress({ done: 0, total: tokensToImport.length });

        const mergeTokens = mergePaths
          ? tokensToImport.filter((token) => mergePaths.has(token.path))
          : [];
        const overwriteTokens = mergePaths
          ? tokensToImport.filter((token) => !mergePaths.has(token.path))
          : tokensToImport;

        let imported = 0;
        const rollbackOperations: ImportRollbackOperation[] = [];
        if (overwriteTokens.length > 0) {
          const result = await importTokenBatch(
            setsHook.targetSet,
            overwriteTokens,
            strategy,
          );
          imported += result.imported;
          const rollbackOperation = toImportRollbackOperation(
            setsHook.targetSet,
            result,
          );
          if (rollbackOperation) {
            rollbackOperations.push(rollbackOperation);
          }
        }
        if (mergeTokens.length > 0) {
          const result = await importTokenBatch(
            setsHook.targetSet,
            mergeTokens,
            "merge",
          );
          imported += result.imported;
          const rollbackOperation = toImportRollbackOperation(
            setsHook.targetSet,
            result,
          );
          if (rollbackOperation) {
            rollbackOperations.push(rollbackOperation);
          }
        }

        setImportProgress({
          done: tokensToImport.length,
          total: tokensToImport.length,
        });
        dispatchToast(
          `Imported ${imported} tokens to "${setsHook.targetSet}"`,
          "success",
        );
        onImportedRef.current();
        resetExistingPathsCache();
        resetAfterImport();
        const mergeCount = mergePaths?.size ?? 0;
        const keepExistingCount = excludePaths?.size ?? 0;
        const reviewedConflictCount =
          conflictPaths?.length ?? previewOverwriteCount ?? 0;
        const newCount =
          previewNewCount ??
          Math.max(0, selectedImportTokens.length - reviewedConflictCount);
        const overwriteCount = Math.max(
          0,
          reviewedConflictCount - mergeCount - keepExistingCount,
        );
        publishImportCompletion({
          destinationSets: [setsHook.targetSet],
          newCount,
          overwriteCount,
          mergeCount,
          keepExistingCount,
          totalImportedCount: imported,
          hadFailures: false,
        });
        setLastImportReviewSummary({
          destinationLabel: `"${setsHook.targetSet}"`,
          newCount,
          overwriteCount,
          mergeCount,
          keepExistingCount,
        });
        setCurrentImportHistory(null);
        appendImportRollbackOperations(rollbackOperations, { pushUndo: true });
        setSuccessMessage(
          `Imported ${imported} token${imported !== 1 ? "s" : ""} to "${setsHook.targetSet}"`,
        );
      } catch (err) {
        setSourceError(getErrorMessage(err));
      } finally {
        setImporting(false);
        setImportProgress(null);
      }
    },
    [
      appendImportRollbackOperations,
      clearConflictState,
      clearFailedState,
      conflictPaths,
      importTokenBatch,
      previewNewCount,
      previewOverwriteCount,
      publishImportCompletion,
      resetExistingPathsCache,
      selectedImportTokens,
      setCurrentImportHistory,
      setsHook.targetSet,
      resetAfterImport,
      setSourceError,
    ],
  );

  const handleImportStyles = useCallback(async () => {
    setSourceError(null);
    if (!connected || sourceSelectedTokens.size === 0) {
      return;
    }

    setCheckingConflicts(true);
    try {
      const existing = await fetchSetTokenMap(setsHook.targetSet);
      const conflicts = selectedImportTokens
        .filter((token) => existing.has(token.path))
        .map((token) => token.path);

      if (conflicts.length > 0) {
        const existingValues = new Map<string, ExistingTokenValue>();
        const decisions = new Map<string, ConflictDecision>();
        for (const path of conflicts) {
          const current = existing.get(path);
          if (current) {
            existingValues.set(path, current);
          }
          decisions.set(path, "merge");
        }
        setConflictPaths(conflicts);
        setConflictExistingValues(existingValues);
        setConflictDecisions(decisions);
        return;
      }

      await executeImport("overwrite");
    } catch (err) {
      setSourceError(getErrorMessage(err));
    } finally {
      setCheckingConflicts(false);
    }
  }, [
    connected,
    executeImport,
    fetchSetTokenMap,
    selectedImportTokens,
    setsHook.targetSet,
    setSourceError,
    sourceSelectedTokens.size,
  ]);

  const handleUndoImport = useCallback(async () => {
    setSourceError(null);
    const history = lastImportRef.current;
    if (!history || undoingRef.current) {
      return;
    }

    undoingRef.current = true;
    setUndoing(true);
    try {
      await rollbackImportHistory(history);
      dispatchToast("Import undone", "success");
      onImportedRef.current();
      setCurrentImportHistory(null);
      setLastImportResult(null);
      setLastImportReviewSummary(null);
      setSuccessMessage(null);
      clearFailedState();
      clearFileImportValidation();
      resetExistingPathsCache();
    } catch (err) {
      setSourceError(`Undo failed: ${getErrorMessage(err)}`);
    } finally {
      undoingRef.current = false;
      setUndoing(false);
    }
  }, [
    clearFailedState,
    resetExistingPathsCache,
    rollbackImportHistory,
    setCurrentImportHistory,
    clearFileImportValidation,
    setSourceError,
  ]);

  const handleRetryFailed = useCallback(async () => {
    setSourceError(null);
    if (failedImportBatches.length === 0 || retryingRef.current) {
      return;
    }

    retryingRef.current = true;
    setRetrying(true);

    const stillFailedPaths: string[] = [];
    const stillFailedBatches: ImportBatch[] = [];
    let retried = 0;
    const recoveredOperations: ImportRollbackOperation[] = [];

    try {
      for (const batch of failedImportBatches) {
        try {
          const result = await importPayloadBatch(
            batch.setName,
            batch.tokens,
            failedImportStrategy,
          );
          retried += result.imported;
          const rollbackOperation = toImportRollbackOperation(
            batch.setName,
            result,
          );
          if (rollbackOperation) {
            recoveredOperations.push(rollbackOperation);
          }
        } catch (err) {
          console.warn(
            "[ImportPanel] retry failed for batch:",
            batch.setName,
            err,
          );
          stillFailedPaths.push(
            ...batch.tokens
              .map((token) => token.path)
              .filter((path): path is string => typeof path === "string"),
          );
          stillFailedBatches.push(batch);
        }
      }

      appendImportRollbackOperations(recoveredOperations, { pushUndo: true });
      resetExistingPathsCache();
      if (stillFailedPaths.length === 0) {
        setFailedImportPaths([]);
        setFailedImportBatches([]);
        setSucceededImportCount((prev) => prev + retried);
        setSuccessMessage((prev) =>
          prev
            ? `${prev} (${retried} recovered on retry)`
            : `Recovered ${retried} token${retried !== 1 ? "s" : ""} on retry`,
        );
        dispatchToast(`Retried: ${retried} tokens imported`, "success");
      } else {
        setFailedImportPaths(stillFailedPaths);
        setFailedImportBatches(stillFailedBatches);
        setSucceededImportCount((prev) => prev + retried);
        dispatchToast(
          `Retry: ${retried} recovered, ${stillFailedPaths.length} still failed`,
          "error",
        );
      }
      onImportedRef.current();
    } catch (err) {
      setSourceError(`Retry failed: ${getErrorMessage(err)}`);
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  }, [
    appendImportRollbackOperations,
    failedImportBatches,
    failedImportStrategy,
    importPayloadBatch,
    resetExistingPathsCache,
    setSourceError,
  ]);

  const handleCopyFailedPaths = useCallback(() => {
    if (failedImportPaths.length === 0) {
      return;
    }
    void copyToClipboard(
      failedImportPaths.join("\n"),
      () => {
        setCopyFeedback(true);
        window.setTimeout(() => setCopyFeedback(false), 2000);
      },
      () => dispatchToast("Copy failed", "error"),
    );
  }, [failedImportPaths]);

  const clearSuccessState = useCallback(() => {
    setSuccessMessage(null);
    clearFailedState();
    setCurrentImportHistory(null);
    setLastImportResult(null);
    setLastImportReviewSummary(null);
    clearFileImportValidation();
  }, [clearFailedState, clearFileImportValidation, setCurrentImportHistory]);

  const failedImportGroups = useMemo(
    () => buildFailedImportGroups(failedImportBatches),
    [failedImportBatches],
  );
  const importNextStepRecommendations = useMemo(
    () =>
      lastImportResult === null
        ? []
        : getImportResultNextStepRecommendations(lastImportResult).filter(
            (recommendation) => recommendation.target.kind === "workspace",
          ),
    [lastImportResult],
  );
  const openImportNextStep = useCallback(
    (recommendation: ImportNextStepRecommendation) => {
      if (lastImportResult === null) {
        return;
      }

      onOpenImportNextStepRef.current(lastImportResult, recommendation);
    },
    [lastImportResult],
  );

  const usesCollectionDestination = src.collectionData.length > 0;
  const hasInvalidModeSetNames = useMemo(
    () =>
      src.collectionData.some((collection) =>
        collection.modes.some((mode) => {
          const key = modeKey(collection.name, mode.modeId);
          if (!(src.modeEnabled[key] ?? true)) {
            return false;
          }
          const candidate = (
            src.modeSetNames[key] ??
            defaultSetName(collection.name, mode.modeName, collection.modes.length)
          ).trim();
          return !candidate || !SET_NAME_RE.test(candidate);
        }),
      ),
    [src.collectionData, src.modeEnabled, src.modeSetNames],
  );

  const hasValidSingleSetDestination = useMemo(() => {
    const trimmedTarget = setsHook.targetSet.trim();
    return (
      !setsHook.newSetInputVisible &&
      !!trimmedTarget &&
      SET_NAME_RE.test(trimmedTarget)
    );
  }, [setsHook.newSetInputVisible, setsHook.targetSet]);

  const destinationReady = usesCollectionDestination
    ? totalEnabledSets > 0 &&
      !hasInvalidModeSetNames &&
      !hasAmbiguousCollectionImport
    : hasValidSingleSetDestination;

  const canContinueToPreview =
    src.tokens.length > 0 &&
    !usesCollectionDestination &&
    hasValidSingleSetDestination;

  const sourceValue = useMemo<ImportSourceContextValue>(
    () => ({
      loading: src.loading,
      error: src.error,
      sourceFamily: src.sourceFamily,
      source: src.source,
      workflowStage: src.workflowStage,
      collectionData: src.collectionData,
      tokens: src.tokens,
      selectedTokens: src.selectedTokens,
      typeFilter: src.typeFilter,
      skippedEntries: src.skippedEntries,
      skippedExpanded: src.skippedExpanded,
      fileImportValidation: src.fileImportValidation,
      isDragging: src.isDragging,
      fileInputRef: src.fileInputRef,
      cssFileInputRef: src.cssFileInputRef,
      tailwindFileInputRef: src.tailwindFileInputRef,
      tokensStudioFileInputRef: src.tokensStudioFileInputRef,
      setTypeFilter: src.setTypeFilter,
      setSkippedExpanded: src.setSkippedExpanded,
      handleReadVariables: src.handleReadVariables,
      handleReadStyles: src.handleReadStyles,
      handleReadJson: src.handleReadJson,
      handleReadCSS: src.handleReadCSS,
      handleReadTailwind: src.handleReadTailwind,
      handleReadTokensStudio: src.handleReadTokensStudio,
      handleJsonFileChange: src.handleJsonFileChange,
      handleCSSFileChange: src.handleCSSFileChange,
      handleTailwindFileChange: src.handleTailwindFileChange,
      handleTokensStudioFileChange: src.handleTokensStudioFileChange,
      handleDragEnter: src.handleDragEnter,
      handleDragLeave: src.handleDragLeave,
      handleDragOver: src.handleDragOver,
      handleDrop: src.handleDrop,
      handleBack: src.handleBack,
      selectSourceFamily: src.selectSourceFamily,
      continueToPreview: src.continueToPreview,
      toggleToken: src.toggleToken,
      toggleAll: src.toggleAll,
    }),
    [
      src.collectionData,
      src.cssFileInputRef,
      src.error,
      src.fileImportValidation,
      src.fileInputRef,
      src.handleBack,
      src.handleCSSFileChange,
      src.handleDragEnter,
      src.handleDragLeave,
      src.handleDragOver,
      src.handleDrop,
      src.handleJsonFileChange,
      src.handleReadCSS,
      src.handleReadJson,
      src.handleReadStyles,
      src.handleReadTailwind,
      src.handleReadTokensStudio,
      src.handleReadVariables,
      src.handleTailwindFileChange,
      src.handleTokensStudioFileChange,
      src.isDragging,
      src.loading,
      src.selectSourceFamily,
      src.selectedTokens,
      src.setSkippedExpanded,
      src.setTypeFilter,
      src.skippedEntries,
      src.skippedExpanded,
      src.source,
      src.sourceFamily,
      src.tailwindFileInputRef,
      src.toggleAll,
      src.toggleToken,
      src.tokens,
      src.tokensStudioFileInputRef,
      src.typeFilter,
      src.workflowStage,
      src.continueToPreview,
    ],
  );

  const destinationValue = useMemo<ImportDestinationContextValue>(
    () => ({
      targetSet: setsHook.targetSet,
      sets: setsHook.sets,
      setsError: setsHook.setsError,
      newSetInputVisible: setsHook.newSetInputVisible,
      newSetDraft: setsHook.newSetDraft,
      newSetError: setsHook.newSetError,
      modeSetNames: src.modeSetNames,
      modeEnabled: src.modeEnabled,
      collectionModeDestinationStatus,
      hasAmbiguousCollectionImport,
      ambiguousCollectionImportCount,
      totalEnabledSets,
      totalEnabledTokens,
      usesCollectionDestination,
      destinationReady,
      canContinueToPreview,
      hasInvalidModeSetNames,
      setNewSetInputVisible: setsHook.setNewSetInputVisible,
      setNewSetDraft: setsHook.setNewSetDraft,
      setNewSetError: setsHook.setNewSetError,
      setModeSetNames: src.setModeSetNames,
      setModeEnabled: src.setModeEnabled,
      commitNewSet: setsHook.commitNewSet,
      cancelNewSet: setsHook.cancelNewSet,
      setTargetSetAndPersist: setsHook.setTargetSetAndPersist,
      fetchSets: setsHook.fetchSets,
    }),
    [
      ambiguousCollectionImportCount,
      canContinueToPreview,
      collectionModeDestinationStatus,
      destinationReady,
      hasAmbiguousCollectionImport,
      hasInvalidModeSetNames,
      setsHook.cancelNewSet,
      setsHook.commitNewSet,
      setsHook.fetchSets,
      setsHook.newSetDraft,
      setsHook.newSetError,
      setsHook.newSetInputVisible,
      setsHook.setNewSetDraft,
      setsHook.setNewSetError,
      setsHook.setNewSetInputVisible,
      setsHook.setTargetSetAndPersist,
      setsHook.sets,
      setsHook.setsError,
      setsHook.targetSet,
      src.modeEnabled,
      src.modeSetNames,
      src.setModeEnabled,
      src.setModeSetNames,
      totalEnabledSets,
      totalEnabledTokens,
      usesCollectionDestination,
    ],
  );

  const reviewValue = useMemo<ImportReviewContextValue>(
    () => ({
      importing,
      importProgress,
      reviewActionCopy: IMPORT_REVIEW_ACTION_COPY,
      conflictPaths,
      conflictExistingValues,
      conflictDecisions,
      conflictSearch,
      conflictStatusFilter,
      conflictTypeFilter,
      checkingConflicts,
      existingTokenMap,
      existingPathsFetching,
      existingTokenMapError,
      previewNewCount,
      previewOverwriteCount,
      varConflictPreview,
      varConflictDetails,
      varConflictDetailsExpanded,
      checkingVarConflicts,
      setConflictSearch,
      setConflictStatusFilter,
      setConflictTypeFilter,
      setConflictDecisions,
      setVarConflictDetailsExpanded,
      clearConflictState,
      handleImportVariables,
      handleImportStyles,
      executeImport,
    }),
    [
      checkingConflicts,
      checkingVarConflicts,
      clearConflictState,
      conflictDecisions,
      conflictExistingValues,
      conflictPaths,
      conflictSearch,
      conflictStatusFilter,
      conflictTypeFilter,
      executeImport,
      existingPathsFetching,
      existingTokenMap,
      existingTokenMapError,
      handleImportStyles,
      handleImportVariables,
      importProgress,
      importing,
      previewNewCount,
      previewOverwriteCount,
      varConflictDetails,
      varConflictDetailsExpanded,
      varConflictPreview,
    ],
  );

  const resultValue = useMemo<ImportResultContextValue>(
    () => ({
      successMessage,
      failedImportPaths,
      failedImportBatches,
      failedImportStrategy,
      succeededImportCount,
      retrying,
      copyFeedback,
      lastImport,
      lastImportReviewSummary,
      importNextStepRecommendations,
      undoing,
      failedImportGroups,
      handleUndoImport,
      handleRetryFailed,
      handleCopyFailedPaths,
      openImportNextStep,
      clearSuccessState,
    }),
    [
      clearSuccessState,
      copyFeedback,
      failedImportBatches,
      failedImportGroups,
      failedImportPaths,
      failedImportStrategy,
      handleCopyFailedPaths,
      handleRetryFailed,
      handleUndoImport,
      importNextStepRecommendations,
      lastImport,
      lastImportReviewSummary,
      openImportNextStep,
      retrying,
      successMessage,
      succeededImportCount,
      undoing,
    ],
  );

  return (
    <ImportSourceContext.Provider value={sourceValue}>
      <ImportDestinationContext.Provider value={destinationValue}>
        <ImportReviewContext.Provider value={reviewValue}>
          <ImportResultContext.Provider value={resultValue}>
            {children}
          </ImportResultContext.Provider>
        </ImportReviewContext.Provider>
      </ImportDestinationContext.Provider>
    </ImportSourceContext.Provider>
  );
}
