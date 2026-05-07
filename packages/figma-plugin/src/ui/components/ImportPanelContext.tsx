import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flattenTokenGroup, isReference, parseReference, type DTCGGroup } from "@token-workshop/core";
import {
  type CollectionData,
  defaultCollectionName,
  modeKey,
  type ImportSource as ImportSourceKind,
  type ImportToken,
  type ImportWorkflowStage,
  type SourceFamily,
} from "./importPanelTypes";
import type { SkippedEntry } from "../shared/tokenParsers";
import { useImportCollections } from "../hooks/useImportCollections";
import {
  useImportSource,
  type FileImportValidation,
} from "../hooks/useImportSource";
import type { UndoSlot } from "../hooks/useUndo";
import { rollbackOperation } from "../shared/tokenMutations";
import { copyToClipboard } from "../shared/comparisonUtils";
import { apiFetch, ApiError } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import { getErrorMessage, COLLECTION_NAME_RE } from "../shared/utils";
import {
  getImportResultNextStepRecommendations,
  isWorkspaceImportNextStepRecommendation,
  type ImportNextStepRecommendation,
  type WorkspaceImportNextStepRecommendation,
} from "../shared/navigationTypes";

export interface ImportPanelProps {
  serverUrl: string;
  connected: boolean;
  workingCollectionId: string;
  onClose: () => void;
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
  collectionId: string;
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
  collectionId: string;
  changedPaths: string[];
}

export interface VariableConflictDetail {
  path: string;
  collectionId: string;
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
  destinationCollectionIds: string[];
  newCount: number;
  overwriteCount: number;
  mergeCount: number;
  keepExistingCount: number;
  totalImportedCount: number;
  hadFailures: boolean;
  sourceCollectionCount?: number;
}

type ExistingTokenValue = { $type: string; $value: unknown };
type ConflictDecision = "accept" | "merge" | "reject";
type ImportBatch = { collectionId: string; tokens: Record<string, unknown>[] };
type ImportHistory = { operations: ImportRollbackOperation[] };
type ImportStrategy = "overwrite" | "skip" | "merge";
type ImportSource = ImportSourceKind | null;
type CollectionImportTokenSource = {
  modeKey: string;
  sourceLabel: string;
  token: ImportToken;
  originalCollectionName: string;
  originalModeName: string;
  originalModeIndex: number;
};
type CollectionImportPlan = {
  collectionId: string;
  writeTokens: CollectionImportTokenSource[];
  duplicateConflicts: {
    path: string;
    tokens: CollectionImportTokenSource[];
  }[];
  totalPathCount: number;
  secondaryModeNames: string[];
  primaryModeName: string | null;
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
  fileInputRef: React.RefObject<HTMLInputElement>;
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
  handleBrowseFile: () => void;
  handleUnifiedFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
  targetCollectionId: string;
  collectionIds: string[];
  collectionsError: string | null;
  newCollectionInputVisible: boolean;
  newCollectionDraft: string;
  newCollectionError: string | null;
  modeCollectionNames: Record<string, string>;
  modeEnabled: Record<string, boolean>;
  hasAmbiguousCollectionImport: boolean;
  ambiguousCollectionImportCount: number;
  totalEnabledCollections: number;
  totalEnabledTokens: number;
  usesCollectionDestination: boolean;
  hasInvalidModeCollectionNames: boolean;
  setNewCollectionInputVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setNewCollectionDraft: React.Dispatch<React.SetStateAction<string>>;
  setNewCollectionError: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  setModeCollectionNames: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  setModeEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  commitNewCollection: () => void;
  cancelNewCollection: () => void;
  setTargetCollectionIdAndPersist: (name: string) => void;
  fetchCollections: () => Promise<void>;
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
  importNextStepRecommendations: WorkspaceImportNextStepRecommendation[];
  undoing: boolean;
  failedImportGroups: ImportFailureGroup[];
  handleUndoImport: () => Promise<void>;
  handleRetryFailed: () => Promise<void>;
  handleCopyFailedPaths: () => void;
  openImportNextStep: (
    recommendation: WorkspaceImportNextStepRecommendation,
  ) => void;
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

// Sort plans so alias-target collections are imported before dependents.
function sortPlansByAliasDependencies(
  plans: CollectionImportPlan[],
): CollectionImportPlan[] {
  if (plans.length <= 1) return plans;

  const pathToCollection = new Map<string, string>();
  for (const plan of plans) {
    for (const source of plan.writeTokens) {
      pathToCollection.set(source.token.path, plan.collectionId);
    }
  }

  const deps = new Map<string, Set<string>>();
  for (const plan of plans) {
    const planDeps = new Set<string>();
    for (const source of plan.writeTokens) {
      const val = source.token.$value;
      if (typeof val === 'string' && isReference(val)) {
        const target = parseReference(val);
        const targetCollection = pathToCollection.get(target);
        if (targetCollection && targetCollection !== plan.collectionId) {
          planDeps.add(targetCollection);
        }
      }
    }
    deps.set(plan.collectionId, planDeps);
  }

  const sorted: CollectionImportPlan[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const planById = new Map(plans.map((p) => [p.collectionId, p]));

  function visit(id: string): boolean {
    if (visited.has(id)) return true;
    if (visiting.has(id)) return false; // cycle
    visiting.add(id);
    for (const dep of deps.get(id) ?? []) {
      if (!visit(dep)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    sorted.push(planById.get(id)!);
    return true;
  }

  for (const plan of plans) {
    if (!visit(plan.collectionId)) return plans; // cycle — fall back to original order
  }

  return sorted;
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
  const existingExtensions = token.$extensions ?? {};
  const existingTokenWorkshop =
    (existingExtensions.tokenworkshop as Record<string, unknown>) ?? {};
  if (sourceTag || Object.keys(existingTokenWorkshop).length > 0) {
    payload.$extensions = {
      ...existingExtensions,
      tokenworkshop: {
        ...existingTokenWorkshop,
        ...(sourceTag ? { source: sourceTag } : {}),
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
      collectionId: batch.collectionId,
      paths: batch.tokens
        .map((token) => token.path)
        .filter((path): path is string => typeof path === "string"),
    }))
    .filter((group) => group.paths.length > 0);
}

function toImportRollbackOperation(
  collectionId: string,
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
    collectionId,
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
  modeCollectionNames: Record<string, string>,
): {
  plans: CollectionImportPlan[];
  ambiguousPathCount: number;
} {
  const groupedPlans = new Map<
    string,
    {
      collectionId: string;
      pathSources: Map<string, CollectionImportTokenSource[]>;
    }
  >();

  for (const collection of collectionData) {
    for (let modeIndex = 0; modeIndex < collection.modes.length; modeIndex++) {
      const mode = collection.modes[modeIndex];
      const key = modeKey(collection.name, mode.modeId);
      if (!(modeEnabled[key] ?? true)) {
        continue;
      }

      const collectionId = (
        modeCollectionNames[key] ??
        defaultCollectionName(collection.name)
      ).trim();
      const sourceLabel = buildCollectionImportSourceLabel(
        collection.name,
        mode.modeName,
      );
      let plan = groupedPlans.get(collectionId);
      if (!plan) {
        plan = {
          collectionId,
          pathSources: new Map(),
        };
        groupedPlans.set(collectionId, plan);
      }

      for (const token of mode.tokens) {
        const pathSources = plan.pathSources.get(token.path) ?? [];
        pathSources.push({
          modeKey: key,
          sourceLabel,
          token,
          originalCollectionName: collection.name,
          originalModeName: mode.modeName,
          originalModeIndex: modeIndex,
        });
        plan.pathSources.set(token.path, pathSources);
      }
    }
  }

  const plans: CollectionImportPlan[] = [];
  let ambiguousPathCount = 0;

  for (const plan of groupedPlans.values()) {
    const writeTokens: CollectionImportTokenSource[] = [];
    const duplicateConflicts: CollectionImportPlan["duplicateConflicts"] = [];
    const mergedModeNames = new Set<string>();
    let primaryModeName: string | null = null;

    for (const [path, pathSources] of plan.pathSources) {
      if (pathSources.length === 1) {
        writeTokens.push(pathSources[0]);
        if (!primaryModeName) {
          primaryModeName = pathSources[0].originalModeName;
        }
        continue;
      }

      const originCollections = new Set(
        pathSources.map((s) => s.originalCollectionName),
      );
      if (originCollections.size === 1) {
        const sorted = [...pathSources].sort(
          (a, b) => a.originalModeIndex - b.originalModeIndex,
        );
        const primary = sorted[0];
        const secondaries = sorted.slice(1);

        if (!primaryModeName) {
          primaryModeName = primary.originalModeName;
        }
        for (const s of secondaries) {
          mergedModeNames.add(s.originalModeName);
        }

        const modeValues: Record<string, unknown> = {};
        for (const s of secondaries) {
          modeValues[s.originalModeName] = s.token.$value;
        }

        const existingTokenWorkshop =
          (primary.token.$extensions?.tokenworkshop as Record<string, unknown>) ?? {};
        const mergedToken: ImportToken = {
          ...primary.token,
          $extensions: {
            ...(primary.token.$extensions ?? {}),
            tokenworkshop: {
              ...existingTokenWorkshop,
              modes: {
                [plan.collectionId]: modeValues,
              },
            },
          },
        };

        writeTokens.push({ ...primary, token: mergedToken });
      } else {
        ambiguousPathCount += 1;
        duplicateConflicts.push({ path, tokens: pathSources });
      }
    }

    plans.push({
      collectionId: plan.collectionId,
      writeTokens,
      duplicateConflicts,
      totalPathCount: plan.pathSources.size,
      secondaryModeNames: [...mergedModeNames],
      primaryModeName,
    });
  }

  return {
    plans,
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
  workingCollectionId,
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
  const importCollectionData = src.collectionData;
  const setImportModeCollectionNames = src.setModeCollectionNames;
  const {
    clearFileImportValidation,
    resetAfterImport,
    selectedTokens: sourceSelectedTokens,
    setError: setSourceError,
    source: activeSource,
  } = src;

  const collectionsHook = useImportCollections({
    serverUrl,
    connected,
    workingCollectionId,
    onClearConflictState: clearConflictState,
  });

  const selectedImportTokens = useMemo(
    () => src.tokens.filter((token) => src.selectedTokens.has(token.path)),
    [src.tokens, src.selectedTokens],
  );

  const {
    plans: collectionImportPlans,
    ambiguousPathCount: ambiguousCollectionImportCount,
  } = useMemo(
    () =>
      buildCollectionImportPlans(
        src.collectionData,
        src.modeEnabled,
        src.modeCollectionNames,
      ),
    [src.collectionData, src.modeEnabled, src.modeCollectionNames],
  );

  const totalEnabledCollections = collectionImportPlans.length;
  const enabledCollectionCount = useMemo(
    () =>
      src.collectionData.filter((collection) =>
        collection.modes.some(
          (mode) => src.modeEnabled[modeKey(collection.name, mode.modeId)] ?? true,
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

  const fetchCollectionTokenMap = useCallback(
    async (collectionId: string) => {
      const cached = existingPathsCacheRef.current.get(collectionId);
      if (cached) {
        return cached;
      }

      try {
        const data = await apiFetch<{ tokens?: Record<string, unknown> }>(
          `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}`,
        );
        const mapped = flattenExistingTokens(data.tokens);
        existingPathsCacheRef.current.set(collectionId, mapped);
        return mapped;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          const empty = new Map<string, ExistingTokenValue>();
          existingPathsCacheRef.current.set(collectionId, empty);
          return empty;
        }
        throw err;
      }
    },
    [serverUrl],
  );

  const prefetchExistingPaths = useCallback(
    async (collectionId: string) => {
      const fetchId = ++existingFetchIdRef.current;
      setExistingPathsFetching(true);
      setExistingTokenMapError(null);

      try {
        const mapped = await fetchCollectionTokenMap(collectionId);
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
    [fetchCollectionTokenMap],
  );

  useEffect(() => {
    if (src.tokens.length === 0) {
      setExistingTokenMap(null);
      setExistingTokenMapError(null);
      setExistingPathsFetching(false);
      return;
    }
      void prefetchExistingPaths(collectionsHook.targetCollectionId);
  }, [prefetchExistingPaths, collectionsHook.targetCollectionId, src.tokens.length]);

  useEffect(() => {
    clearConflictState();
    if (src.tokens.length > 0) {
      void prefetchExistingPaths(collectionsHook.targetCollectionId);
    }
  }, [
    clearConflictState,
    prefetchExistingPaths,
    collectionsHook.targetCollectionId,
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
              collectionId: plan.collectionId,
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

          const existing = collectionsHook.collectionIds.includes(plan.collectionId)
            ? await fetchCollectionTokenMap(plan.collectionId)
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
              collectionId: plan.collectionId,
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
  }, [collectionImportPlans, fetchCollectionTokenMap, collectionsHook.collectionIds]);

  useEffect(() => {
    if (
      importCollectionData.length === 0 ||
      collectionsHook.collectionIds.length === 0
    ) {
      return;
    }

    setImportModeCollectionNames((previousNames) => {
      const nextNames = { ...previousNames };
      let changed = false;

      for (const collection of importCollectionData) {
        for (const mode of collection.modes) {
          const key = modeKey(collection.name, mode.modeId);
          const defaultName = defaultCollectionName(collection.name);
          const currentName = previousNames[key]?.trim() ?? "";
          const exactMatch =
            collectionsHook.collectionIds.includes(collection.name)
              ? collection.name
              : collectionsHook.collectionIds.includes(defaultName)
                ? defaultName
                : null;

          if (!exactMatch) {
            continue;
          }
          if (!currentName || currentName === defaultName) {
            nextNames[key] = exactMatch;
            changed = true;
          }
        }
      }

      return changed ? nextNames : previousNames;
    });
  }, [
    collectionsHook.collectionIds,
    importCollectionData,
    setImportModeCollectionNames,
  ]);

  const importPayloadBatch = useCallback(
    async (
      collectionId: string,
      tokens: Record<string, unknown>[],
      strategy: ImportStrategy,
    ) => {
      try {
        await apiFetch(`${serverUrl}/api/collections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: collectionId }),
        });
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) {
          throw err;
        }
      }

      return await apiFetch<{
        imported: number;
        skipped: number;
        changedPaths?: string[];
        operationId?: string;
      }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch`,
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
    async (collectionId: string, tokens: ImportToken[], strategy: ImportStrategy) =>
      importPayloadBatch(
        collectionId,
        tokens.map((token) => buildImportPayload(token, activeSource)),
        strategy,
      ),
    [activeSource, importPayloadBatch],
  );

  const rollbackImportHistory = useCallback(async (history: ImportHistory) => {
    const operations = history.operations;
    while (operations.length > 0) {
      const operation = operations[operations.length - 1];
      await rollbackOperation(serverUrlRef.current, operation.operationId);
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
          collectionId: operation.collectionId,
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
          { destination: { kind: "contextual-surface", surface: "import" } },
        );
        return;
      }

      setSourceError(null);
      setImporting(true);
      setImportProgress({ done: 0, total: collectionImportPlans.length });
      clearConflictState();
      clearFailedState();
      setFailedImportStrategy(strategy);

      let importedCollections = 0;
      let importedTokens = 0;
      const failedPaths: string[] = [];
      const failedBatches: ImportBatch[] = [];
      const rollbackOperations: ImportRollbackOperation[] = [];

      try {
        const orderedPlans = sortPlansByAliasDependencies(collectionImportPlans);
        for (const plan of orderedPlans) {
          try {
            // Create/ensure collection exists
            try {
              await apiFetch(`${serverUrl}/api/collections`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: plan.collectionId }),
              });
            } catch (err) {
              if (!(err instanceof ApiError && err.status === 409)) throw err;
            }

            // Create all modes on the collection (must exist before token import)
            const modeNamesToCreate = plan.primaryModeName
              ? [plan.primaryModeName, ...plan.secondaryModeNames]
              : plan.secondaryModeNames;
            for (const modeName of modeNamesToCreate) {
              await apiFetch(
                `${serverUrl}/api/collections/${encodeURIComponent(plan.collectionId)}/modes`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: modeName }),
                },
              );
            }

            // Import tokens (with mode values in extensions)
            const tokens = plan.writeTokens.map((source) =>
              buildImportPayload(source.token, activeSource),
            );
            const result = await apiFetch<{
              imported: number;
              skipped: number;
              changedPaths?: string[];
              operationId?: string;
            }>(
              `${serverUrl}/api/tokens/${encodeURIComponent(plan.collectionId)}/batch`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tokens, strategy }),
              },
            );
            importedTokens += result.imported;
            const rollbackOperation = toImportRollbackOperation(
              plan.collectionId,
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
              collectionId: plan.collectionId,
              tokens: plan.writeTokens.map((source) =>
                buildImportPayload(source.token, activeSource),
              ),
            });
          }

          importedCollections += 1;
          setImportProgress({
            done: importedCollections,
            total: collectionImportPlans.length,
          });
        }

        const failedCount = failedPaths.length;
        const toastMessage =
          failedCount > 0
            ? `Imported ${importedTokens} tokens across ${importedCollections} collection${importedCollections !== 1 ? "s" : ""} (${failedCount} failed)`
            : `Imported ${importedTokens} tokens across ${importedCollections} collection${importedCollections !== 1 ? "s" : ""}`;
        const successSummary =
          failedCount > 0
            ? `${importedTokens} token${importedTokens !== 1 ? "s" : ""} imported to ${importedCollections} collection${importedCollections !== 1 ? "s" : ""} — ${failedCount} failed`
            : `${importedTokens} token${importedTokens !== 1 ? "s" : ""} imported to ${importedCollections} collection${importedCollections !== 1 ? "s" : ""}`;

        dispatchToast(toastMessage, failedCount > 0 ? "error" : "success", {
          destination: { kind: "contextual-surface", surface: "import" },
        });
        onImportedRef.current();
        publishImportCompletion({
          destinationCollectionIds: collectionImportPlans.map(
            (plan) => plan.collectionId,
          ),
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
              ? `"${collectionImportPlans[0]?.collectionId ?? "Unknown collection"}"`
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
      serverUrl,
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
            collectionsHook.targetCollectionId,
            overwriteTokens,
            strategy,
          );
          imported += result.imported;
          const rollbackOperation = toImportRollbackOperation(
            collectionsHook.targetCollectionId,
            result,
          );
          if (rollbackOperation) {
            rollbackOperations.push(rollbackOperation);
          }
        }
        if (mergeTokens.length > 0) {
          const result = await importTokenBatch(
            collectionsHook.targetCollectionId,
            mergeTokens,
            "merge",
          );
          imported += result.imported;
          const rollbackOperation = toImportRollbackOperation(
            collectionsHook.targetCollectionId,
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
          `Imported ${imported} tokens to "${collectionsHook.targetCollectionId}"`,
          "success",
          { destination: { kind: "contextual-surface", surface: "import" } },
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
          destinationCollectionIds: [collectionsHook.targetCollectionId],
          newCount,
          overwriteCount,
          mergeCount,
          keepExistingCount,
          totalImportedCount: imported,
          hadFailures: false,
        });
        setLastImportReviewSummary({
          destinationLabel: `"${collectionsHook.targetCollectionId}"`,
          newCount,
          overwriteCount,
          mergeCount,
          keepExistingCount,
        });
        setCurrentImportHistory(null);
        appendImportRollbackOperations(rollbackOperations, { pushUndo: true });
        setSuccessMessage(
          `Imported ${imported} token${imported !== 1 ? "s" : ""} to "${collectionsHook.targetCollectionId}"`,
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
      collectionsHook.targetCollectionId,
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
      const existing = await fetchCollectionTokenMap(collectionsHook.targetCollectionId);
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
    fetchCollectionTokenMap,
    selectedImportTokens,
    collectionsHook.targetCollectionId,
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
      dispatchToast("Import undone", "success", {
        destination: { kind: "contextual-surface", surface: "import" },
      });
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
            batch.collectionId,
            batch.tokens,
            failedImportStrategy,
          );
          retried += result.imported;
          const rollbackOperation = toImportRollbackOperation(
            batch.collectionId,
            result,
          );
          if (rollbackOperation) {
            recoveredOperations.push(rollbackOperation);
          }
        } catch (err) {
          console.warn(
            "[ImportPanel] retry failed for batch:",
            batch.collectionId,
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
        dispatchToast(`Retried: ${retried} tokens imported`, "success", {
          destination: { kind: "contextual-surface", surface: "import" },
        });
      } else {
        setFailedImportPaths(stillFailedPaths);
        setFailedImportBatches(stillFailedBatches);
        setSucceededImportCount((prev) => prev + retried);
        dispatchToast(
          `Retry: ${retried} recovered, ${stillFailedPaths.length} still failed`,
          "error",
          { destination: { kind: "contextual-surface", surface: "import" } },
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
            isWorkspaceImportNextStepRecommendation,
          ),
    [lastImportResult],
  );
  const openImportNextStep = useCallback(
    (recommendation: WorkspaceImportNextStepRecommendation) => {
      if (lastImportResult === null) {
        return;
      }

      onOpenImportNextStepRef.current(lastImportResult, recommendation);
    },
    [lastImportResult],
  );

  const usesCollectionDestination = src.collectionData.length > 0;
  const hasInvalidModeCollectionNames = useMemo(
    () =>
      src.collectionData.some((collection) =>
        collection.modes.some((mode) => {
          const key = modeKey(collection.name, mode.modeId);
          if (!(src.modeEnabled[key] ?? true)) {
            return false;
          }
          const candidate = (
            src.modeCollectionNames[key] ??
            defaultCollectionName(collection.name)
          ).trim();
          return !candidate || !COLLECTION_NAME_RE.test(candidate);
        }),
      ),
    [src.collectionData, src.modeEnabled, src.modeCollectionNames],
  );

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
      handleBrowseFile: src.handleBrowseFile,
      handleUnifiedFileChange: src.handleUnifiedFileChange,
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
      src.handleBrowseFile,
      src.handleUnifiedFileChange,
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
      targetCollectionId: collectionsHook.targetCollectionId,
      collectionIds: collectionsHook.collectionIds,
      collectionsError: collectionsHook.collectionsError,
      newCollectionInputVisible: collectionsHook.newCollectionInputVisible,
      newCollectionDraft: collectionsHook.newCollectionDraft,
      newCollectionError: collectionsHook.newCollectionError,
      modeCollectionNames: src.modeCollectionNames,
      modeEnabled: src.modeEnabled,
      hasAmbiguousCollectionImport,
      ambiguousCollectionImportCount,
      totalEnabledCollections,
      totalEnabledTokens,
      usesCollectionDestination,
      hasInvalidModeCollectionNames,
      setNewCollectionInputVisible: collectionsHook.setNewCollectionInputVisible,
      setNewCollectionDraft: collectionsHook.setNewCollectionDraft,
      setNewCollectionError: collectionsHook.setNewCollectionError,
      setModeCollectionNames: src.setModeCollectionNames,
      setModeEnabled: src.setModeEnabled,
      commitNewCollection: collectionsHook.commitNewCollection,
      cancelNewCollection: collectionsHook.cancelNewCollection,
      setTargetCollectionIdAndPersist:
        collectionsHook.setTargetCollectionIdAndPersist,
      fetchCollections: collectionsHook.fetchCollections,
    }),
    [
      ambiguousCollectionImportCount,
      hasAmbiguousCollectionImport,
      hasInvalidModeCollectionNames,
      collectionsHook.cancelNewCollection,
      collectionsHook.collectionIds,
      collectionsHook.collectionsError,
      collectionsHook.commitNewCollection,
      collectionsHook.fetchCollections,
      collectionsHook.newCollectionDraft,
      collectionsHook.newCollectionError,
      collectionsHook.newCollectionInputVisible,
      collectionsHook.setNewCollectionDraft,
      collectionsHook.setNewCollectionError,
      collectionsHook.setNewCollectionInputVisible,
      collectionsHook.setTargetCollectionIdAndPersist,
      collectionsHook.targetCollectionId,
      src.modeEnabled,
      src.modeCollectionNames,
      src.setModeEnabled,
      src.setModeCollectionNames,
      totalEnabledCollections,
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
