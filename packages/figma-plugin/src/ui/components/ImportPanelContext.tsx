import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useMemo,
  useState,
  useEffect,
} from "react";
import { flattenTokenGroup, type DTCGGroup } from "@tokenmanager/core";
import {
  type ImportToken,
  type CollectionData,
  type ImportSource as ImportSourceKind,
  type SourceFamily,
  type ImportWorkflowStage,
  defaultSetName,
  modeKey,
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

export interface ImportPanelContextValue {
  // Props
  serverUrl: string;
  connected: boolean;

  // Variables state
  collectionData: CollectionData[];
  modeSetNames: Record<string, string>;
  modeEnabled: Record<string, boolean>;
  setModeSetNames: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setModeEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;

  // Flat list state
  tokens: ImportToken[];
  selectedTokens: Set<string>;
  typeFilter: string | null;
  setTypeFilter: React.Dispatch<React.SetStateAction<string | null>>;

  // Shared state
  loading: boolean;
  importing: boolean;
  error: string | null;
  sourceFamily: SourceFamily | null;
  source:
    | "variables"
    | "styles"
    | "json"
    | "css"
    | "tailwind"
    | "tokens-studio"
    | null;
  workflowStage: ImportWorkflowStage;

  // Sets state
  targetSet: string;
  sets: string[];
  setsError: string | null;
  newSetInputVisible: boolean;
  newSetDraft: string;
  newSetError: string | null;
  setNewSetInputVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setNewSetDraft: React.Dispatch<React.SetStateAction<string>>;
  setNewSetError: React.Dispatch<React.SetStateAction<string | null>>;

  // Success / results state
  successMessage: string | null;
  failedImportPaths: string[];
  failedImportBatches: { setName: string; tokens: Record<string, unknown>[] }[];
  failedImportStrategy: "overwrite" | "skip" | "merge";
  succeededImportCount: number;
  retrying: boolean;
  copyFeedback: boolean;
  lastImport: { entries: { setName: string; paths: string[] }[] } | null;
  lastImportReviewSummary: LastImportReviewSummary | null;
  importNextStepRecommendations: ImportNextStepRecommendation[];
  undoing: boolean;
  failedImportGroups: ImportFailureGroup[];
  reviewActionCopy: Record<ImportReviewActionKey, ImportReviewActionCopy>;

  // Conflict state
  conflictPaths: string[] | null;
  conflictExistingValues: Map<
    string,
    { $type: string; $value: unknown }
  > | null;
  conflictDecisions: Map<string, "accept" | "merge" | "reject">;
  conflictSearch: string;
  conflictStatusFilter: "all" | "accept" | "merge" | "reject";
  conflictTypeFilter: string;
  checkingConflicts: boolean;
  setConflictSearch: React.Dispatch<React.SetStateAction<string>>;
  setConflictStatusFilter: React.Dispatch<
    React.SetStateAction<"all" | "accept" | "merge" | "reject">
  >;
  setConflictTypeFilter: React.Dispatch<React.SetStateAction<string>>;
  setConflictDecisions: React.Dispatch<
    React.SetStateAction<Map<string, "accept" | "merge" | "reject">>
  >;

  // Progress state
  importProgress: { done: number; total: number } | null;

  // Skipped entries
  skippedEntries: SkippedEntry[];
  skippedExpanded: boolean;
  setSkippedExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  fileImportValidation: FileImportValidation | null;

  // Drag
  isDragging: boolean;

  // Existing tokens cache
  existingTokenMap: Map<string, { $type: string; $value: unknown }> | null;
  existingPathsFetching: boolean;
  existingTokenMapError: string | null;

  // Variables conflict preview
  varConflictPreview: { newCount: number; overwriteCount: number } | null;
  varConflictDetails:
    | {
        path: string;
        setName: string;
        existing: { $type: string; $value: unknown };
        incoming: ImportToken;
      }[]
    | null;
  varConflictDetailsExpanded: boolean;
  setVarConflictDetailsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  checkingVarConflicts: boolean;

  // Derived values
  totalEnabledSets: number;
  totalEnabledTokens: number;
  previewNewCount: number | null;
  previewOverwriteCount: number | null;
  usesCollectionDestination: boolean;
  destinationReady: boolean;
  canContinueToPreview: boolean;

  // File input refs
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  cssFileInputRef: React.RefObject<HTMLInputElement | null>;
  tailwindFileInputRef: React.RefObject<HTMLInputElement | null>;
  tokensStudioFileInputRef: React.RefObject<HTMLInputElement | null>;

  // Callbacks
  clearConflictState: () => void;
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
  handleImportVariables: (
    strategy?: "overwrite" | "skip" | "merge",
  ) => Promise<void>;
  handleImportStyles: () => Promise<void>;
  executeImport: (
    strategy: "skip" | "overwrite",
    excludePaths?: Set<string>,
    mergePaths?: Set<string>,
  ) => Promise<void>;
  handleUndoImport: () => Promise<void>;
  handleRetryFailed: () => Promise<void>;
  handleCopyFailedPaths: () => void;
  openImportNextStep: (recommendation: ImportNextStepRecommendation) => void;
  toggleToken: (path: string) => void;
  toggleAll: () => void;
  commitNewSet: () => void;
  cancelNewSet: () => void;
  setTargetSetAndPersist: (name: string) => void;
  fetchSets: () => Promise<void>;
  clearSuccessState: () => void;
}

const ImportPanelContext = createContext<ImportPanelContextValue | null>(null);

type ExistingTokenValue = { $type: string; $value: unknown };
type ConflictDecision = "accept" | "merge" | "reject";
type ImportBatch = { setName: string; tokens: Record<string, unknown>[] };
type ImportHistory = { entries: { setName: string; paths: string[] }[] };
type ImportStrategy = "overwrite" | "skip" | "merge";
type ImportSource = ImportPanelContextValue["source"];

export const IMPORT_REVIEW_ACTION_COPY: Record<
  ImportReviewActionKey,
  ImportReviewActionCopy
> = {
  overwrite: {
    key: "overwrite",
    label: "Overwrite",
    buttonLabel: "Overwrite conflicts",
    consequence: "Replace the current value with the incoming value.",
  },
  merge: {
    key: "merge",
    label: "Merge",
    buttonLabel: "Merge conflicts",
    consequence:
      "Update the value and keep any notes or metadata already on the token.",
  },
  skip: {
    key: "skip",
    label: "Keep existing",
    buttonLabel: "Keep existing conflicts",
    consequence:
      "Skip conflicting tokens and only import tokens that are still new.",
  },
};

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
  if (token.$scopes && token.$scopes.length > 0)
    payload.$scopes = token.$scopes;
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

export function useImportPanel(): ImportPanelContextValue {
  const ctx = useContext(ImportPanelContext);
  if (!ctx)
    throw new Error("useImportPanel must be used within ImportPanelProvider");
  return ctx;
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
    | {
        path: string;
        setName: string;
        existing: ExistingTokenValue;
        incoming: ImportToken;
      }[]
    | null
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

  const setsHook = useImportSets({
    serverUrl,
    connected,
    onClearConflictState: clearConflictState,
  });

  const selectedImportTokens = useMemo(
    () => src.tokens.filter((token) => src.selectedTokens.has(token.path)),
    [src.tokens, src.selectedTokens],
  );

  const collectionImportEntries = useMemo(
    () =>
      src.collectionData.flatMap((collection) =>
        collection.modes
          .filter(
            (mode) => src.modeEnabled[modeKey(collection.name, mode.modeId)],
          )
          .map((mode) => ({
            setName:
              src.modeSetNames[modeKey(collection.name, mode.modeId)] ||
              defaultSetName(
                collection.name,
                mode.modeName,
                collection.modes.length,
              ),
            tokens: mode.tokens,
          })),
      ),
    [src.collectionData, src.modeEnabled, src.modeSetNames],
  );

  const totalEnabledSets = collectionImportEntries.length;
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
      collectionImportEntries.reduce(
        (count, entry) => count + entry.tokens.length,
        0,
      ),
    [collectionImportEntries],
  );

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
      if (cached) return cached;

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
        if (fetchId !== existingFetchIdRef.current) return;
        setExistingTokenMap(mapped);
      } catch (err) {
        if (fetchId !== existingFetchIdRef.current) return;
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
    void prefetchExistingPaths(
      setsHook.targetSetRef.current ?? setsHook.targetSet,
    );
  }, [src.tokens, prefetchExistingPaths, setsHook.targetSetRef]);

  useEffect(() => {
    clearConflictState();
    if (src.tokens.length > 0) {
      void prefetchExistingPaths(setsHook.targetSet);
    }
  }, [
    setsHook.targetSet,
    src.tokens.length,
    clearConflictState,
    prefetchExistingPaths,
  ]);

  useEffect(() => {
    if (collectionImportEntries.length === 0) {
      varConflictFetchIdRef.current += 1;
      setVarConflictPreview(null);
      setVarConflictDetails(null);
      setVarConflictDetailsExpanded(false);
      setCheckingVarConflicts(false);
      return;
    }

    const setsToCheck = collectionImportEntries.filter((entry) =>
      setsHook.sets.includes(entry.setName),
    );
    if (setsToCheck.length === 0) {
      setVarConflictPreview({
        newCount: totalEnabledTokens,
        overwriteCount: 0,
      });
      setVarConflictDetails([]);
      setVarConflictDetailsExpanded(false);
      setCheckingVarConflicts(false);
      return;
    }

    const fetchId = ++varConflictFetchIdRef.current;
    setCheckingVarConflicts(true);

    void (async () => {
      try {
        let overwriteCount = 0;
        const details: {
          path: string;
          setName: string;
          existing: ExistingTokenValue;
          incoming: ImportToken;
        }[] = [];

        for (const entry of setsToCheck) {
          const existing = await fetchSetTokenMap(entry.setName);
          if (fetchId !== varConflictFetchIdRef.current) return;

          for (const token of entry.tokens) {
            const current = existing.get(token.path);
            if (!current) continue;
            overwriteCount += 1;
            details.push({
              path: token.path,
              setName: entry.setName,
              existing: current,
              incoming: token,
            });
          }
        }

        if (fetchId !== varConflictFetchIdRef.current) return;
        setVarConflictPreview({
          newCount: totalEnabledTokens - overwriteCount,
          overwriteCount,
        });
        setVarConflictDetails(details);
        setVarConflictDetailsExpanded(details.length > 0);
      } catch {
        if (fetchId !== varConflictFetchIdRef.current) return;
        setVarConflictPreview(null);
        setVarConflictDetails(null);
        setVarConflictDetailsExpanded(false);
      } finally {
        if (fetchId === varConflictFetchIdRef.current) {
          setCheckingVarConflicts(false);
        }
      }
    })();
  }, [
    collectionImportEntries,
    totalEnabledTokens,
    setsHook.sets,
    fetchSetTokenMap,
  ]);

  const ensureSetExists = useCallback(
    async (setName: string) => {
      try {
        await apiFetch(`${serverUrl}/api/sets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: setName }),
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return;
        throw new Error(
          `Failed to create set "${setName}": ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    },
    [serverUrl],
  );

  const importPayloadBatch = useCallback(
    async (
      setName: string,
      tokens: Record<string, unknown>[],
      strategy: ImportStrategy,
    ) => {
      const result = await apiFetch<{ imported: number; skipped: number }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokens, strategy }),
        },
      );
      return result.imported;
    },
    [serverUrl],
  );

  const importTokenBatch = useCallback(
    async (setName: string, tokens: ImportToken[], strategy: ImportStrategy) =>
      importPayloadBatch(
        setName,
        tokens.map((token) => buildImportPayload(token, src.source)),
        strategy,
      ),
    [importPayloadBatch, src.source],
  );

  const deleteImportedEntries = useCallback(
    async (entries: ImportHistory["entries"]) => {
      for (const entry of entries) {
        await apiFetch(
          `${serverUrlRef.current}/api/tokens/${encodeURIComponent(entry.setName)}/batch-delete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths: entry.paths, force: true }),
          },
        );
      }
    },
    [],
  );

  const setLastImportWithUndo = useCallback(
    (entries: ImportHistory | null) => {
      setLastImport(entries);
      if (!entries || !onPushUndoRef.current) return;

      const capturedEntries = entries.entries.map((entry) => ({
        setName: entry.setName,
        paths: [...entry.paths],
      }));
      const totalPaths = capturedEntries.reduce(
        (sum, entry) => sum + entry.paths.length,
        0,
      );
      const setNames = [
        ...new Set(capturedEntries.map((entry) => entry.setName)),
      ];
      const description =
        setNames.length === 1
          ? `Import ${totalPaths} token${totalPaths !== 1 ? "s" : ""} to "${setNames[0]}"`
          : `Import ${totalPaths} token${totalPaths !== 1 ? "s" : ""} to ${setNames.length} sets`;

      onPushUndoRef.current({
        description,
        restore: async () => {
          await deleteImportedEntries(capturedEntries);
          onImportedRef.current();
          setLastImport(null);
          setLastImportReviewSummary(null);
          setSuccessMessage(null);
          clearFailedState();
          resetExistingPathsCache();
        },
      });
    },
    [clearFailedState, deleteImportedEntries, resetExistingPathsCache],
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
      src.setError(null);
      setImporting(true);
      setImportProgress({ done: 0, total: collectionImportEntries.length });
      clearConflictState();
      clearFailedState();
      setFailedImportStrategy(strategy);

      let importedSets = 0;
      let importedTokens = 0;
      const failedPaths: string[] = [];
      const failedBatches: ImportBatch[] = [];
      const rollbackEntries: ImportHistory["entries"] = [];

      try {
        for (const entry of collectionImportEntries) {
          await ensureSetExists(entry.setName);
          try {
            const imported = await importTokenBatch(
              entry.setName,
              entry.tokens,
              strategy,
            );
            importedTokens += imported;
            if (imported > 0) {
              rollbackEntries.push({
                setName: entry.setName,
                paths: entry.tokens.map((token) => token.path),
              });
            }
          } catch (err) {
            console.warn("[ImportPanel] failed to import token batch:", err);
            failedPaths.push(...entry.tokens.map((token) => token.path));
            failedBatches.push({
              setName: entry.setName,
              tokens: entry.tokens.map((token) =>
                buildImportPayload(token, src.source),
              ),
            });
          }

          importedSets += 1;
          setImportProgress({
            done: importedSets,
            total: collectionImportEntries.length,
          });
        }

        const failedCount = failedPaths.length;
        const toastMessage =
          failedCount > 0
            ? `Imported ${importedTokens} tokens across ${importedSets} set${importedSets !== 1 ? "s" : ""} (${failedCount} failed)`
            : `Imported ${importedTokens} tokens across ${importedSets} set${importedSets !== 1 ? "s" : ""}`;
        const successSummary =
          failedCount > 0
            ? `Imported ${importedTokens} token${importedTokens !== 1 ? "s" : ""} across ${importedSets} set${importedSets !== 1 ? "s" : ""} — ${failedCount} token${failedCount !== 1 ? "s" : ""} could not be saved`
            : `Imported ${importedTokens} token${importedTokens !== 1 ? "s" : ""} across ${importedSets} set${importedSets !== 1 ? "s" : ""}`;

        dispatchToast(toastMessage, failedCount > 0 ? "error" : "success");
        onImportedRef.current();
        publishImportCompletion({
          destinationSets: collectionImportEntries.map(
            (entry) => entry.setName,
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
        src.resetAfterImport();

        if (failedCount > 0) {
          setFailedImportPaths(failedPaths);
          setFailedImportBatches(failedBatches);
          setSucceededImportCount(importedTokens);
        }

        setLastImportReviewSummary({
          destinationLabel:
            collectionImportEntries.length === 1
              ? `"${collectionImportEntries[0]?.setName ?? "Unknown set"}"`
              : `${collectionImportEntries.length} sets`,
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
        setLastImportWithUndo(
          rollbackEntries.length > 0 ? { entries: rollbackEntries } : null,
        );
        setSuccessMessage(successSummary);
      } catch (err) {
        src.setError(getErrorMessage(err));
      } finally {
        setImporting(false);
        setImportProgress(null);
      }
    },
    [
      collectionImportEntries,
      clearConflictState,
      clearFailedState,
      ensureSetExists,
      importTokenBatch,
      publishImportCompletion,
      resetExistingPathsCache,
      setLastImportWithUndo,
      totalEnabledTokens,
      enabledCollectionCount,
      varConflictPreview,
      src.resetAfterImport,
      src.setError,
      src.source,
    ],
  );

  const executeImport = useCallback(
    async (
      strategy: "skip" | "overwrite",
      excludePaths?: Set<string>,
      mergePaths?: Set<string>,
    ) => {
      src.setError(null);
      setImporting(true);
      clearConflictState();
      clearFailedState();

      try {
        const tokensToImport = selectedImportTokens.filter(
          (token) => !excludePaths?.has(token.path),
        );
        setImportProgress({ done: 0, total: tokensToImport.length });

        await ensureSetExists(setsHook.targetSet);

        const mergeTokens = mergePaths
          ? tokensToImport.filter((token) => mergePaths.has(token.path))
          : [];
        const overwriteTokens = mergePaths
          ? tokensToImport.filter((token) => !mergePaths.has(token.path))
          : tokensToImport;

        let imported = 0;
        if (overwriteTokens.length > 0) {
          imported += await importTokenBatch(
            setsHook.targetSet,
            overwriteTokens,
            strategy,
          );
        }
        if (mergeTokens.length > 0) {
          imported += await importTokenBatch(
            setsHook.targetSet,
            mergeTokens,
            "merge",
          );
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
        src.resetAfterImport();
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
        setLastImportWithUndo(
          imported > 0
            ? {
                entries: [
                  {
                    setName: setsHook.targetSet,
                    paths: tokensToImport.map((token) => token.path),
                  },
                ],
              }
            : null,
        );
        setSuccessMessage(
          `Imported ${imported} token${imported !== 1 ? "s" : ""} to "${setsHook.targetSet}"`,
        );
      } catch (err) {
        src.setError(getErrorMessage(err));
      } finally {
        setImporting(false);
        setImportProgress(null);
      }
    },
    [
      clearConflictState,
      clearFailedState,
      selectedImportTokens,
      ensureSetExists,
      setsHook.targetSet,
      importTokenBatch,
      publishImportCompletion,
      resetExistingPathsCache,
      setLastImportWithUndo,
      conflictPaths,
      previewNewCount,
      previewOverwriteCount,
      src.resetAfterImport,
      src.setError,
    ],
  );

  const handleImportStyles = useCallback(async () => {
    src.setError(null);
    if (!connected || src.selectedTokens.size === 0) return;

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
          if (current) existingValues.set(path, current);
          decisions.set(path, "merge");
        }
        setConflictPaths(conflicts);
        setConflictExistingValues(existingValues);
        setConflictDecisions(decisions);
        return;
      }

      await executeImport("overwrite");
    } catch (err) {
      src.setError(getErrorMessage(err));
    } finally {
      setCheckingConflicts(false);
    }
  }, [
    connected,
    executeImport,
    fetchSetTokenMap,
    selectedImportTokens,
    setsHook.targetSet,
    src.selectedTokens.size,
    src.setError,
  ]);

  const handleUndoImport = useCallback(async () => {
    src.setError(null);
    if (!lastImport || undoingRef.current) return;

    undoingRef.current = true;
    setUndoing(true);
    try {
      await deleteImportedEntries(lastImport.entries);
      dispatchToast("Import undone", "success");
      onImportedRef.current();
      setLastImport(null);
      setLastImportResult(null);
      setLastImportReviewSummary(null);
      setSuccessMessage(null);
      clearFailedState();
      src.clearFileImportValidation();
      resetExistingPathsCache();
    } catch (err) {
      src.setError(`Undo failed: ${getErrorMessage(err)}`);
    } finally {
      undoingRef.current = false;
      setUndoing(false);
    }
  }, [
    lastImport,
    deleteImportedEntries,
    clearFailedState,
    resetExistingPathsCache,
    src.clearFileImportValidation,
    src.setError,
  ]);

  const handleRetryFailed = useCallback(async () => {
    src.setError(null);
    if (failedImportBatches.length === 0 || retryingRef.current) return;

    retryingRef.current = true;
    setRetrying(true);

    const stillFailedPaths: string[] = [];
    const stillFailedBatches: ImportBatch[] = [];
    let retried = 0;

    try {
      for (const batch of failedImportBatches) {
        try {
          retried += await importPayloadBatch(
            batch.setName,
            batch.tokens,
            failedImportStrategy,
          );
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
      src.setError(`Retry failed: ${getErrorMessage(err)}`);
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  }, [
    failedImportBatches,
    importPayloadBatch,
    failedImportStrategy,
    resetExistingPathsCache,
    src.setError,
  ]);

  const handleCopyFailedPaths = useCallback(() => {
    if (failedImportPaths.length === 0) return;
    void copyToClipboard(
      failedImportPaths.join("\n"),
      () => {
        setCopyFeedback(true);
        window.setTimeout(() => setCopyFeedback(false), 2000);
      },
      () => dispatchToast("Failed to copy failed import paths", "error"),
    );
  }, [failedImportPaths]);

  const clearSuccessState = useCallback(() => {
    setSuccessMessage(null);
    clearFailedState();
    setLastImport(null);
    setLastImportResult(null);
    setLastImportReviewSummary(null);
    src.clearFileImportValidation();
  }, [clearFailedState, src.clearFileImportValidation]);

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
      src.collectionData.some((col) =>
        col.modes.some((mode) => {
          const key = modeKey(col.name, mode.modeId);
          if (!(src.modeEnabled[key] ?? true)) return false;
          const candidate = (src.modeSetNames[key] ?? "").trim();
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
    ? totalEnabledSets > 0 && !hasInvalidModeSetNames
    : hasValidSingleSetDestination;

  const canContinueToPreview =
    src.tokens.length > 0 &&
    !usesCollectionDestination &&
    hasValidSingleSetDestination;

  // ── Context value ─────────────────────────────────────────────────────────

  const value = useMemo<ImportPanelContextValue>(
    () => ({
      serverUrl,
      connected,
      collectionData: src.collectionData,
      modeSetNames: src.modeSetNames,
      modeEnabled: src.modeEnabled,
      setModeSetNames: src.setModeSetNames,
      setModeEnabled: src.setModeEnabled,
      tokens: src.tokens,
      selectedTokens: src.selectedTokens,
      typeFilter: src.typeFilter,
      setTypeFilter: src.setTypeFilter,
      loading: src.loading,
      importing,
      error: src.error,
      sourceFamily: src.sourceFamily,
      source: src.source,
      workflowStage: src.workflowStage,
      targetSet: setsHook.targetSet,
      sets: setsHook.sets,
      setsError: setsHook.setsError,
      newSetInputVisible: setsHook.newSetInputVisible,
      newSetDraft: setsHook.newSetDraft,
      newSetError: setsHook.newSetError,
      setNewSetInputVisible: setsHook.setNewSetInputVisible,
      setNewSetDraft: setsHook.setNewSetDraft,
      setNewSetError: setsHook.setNewSetError,
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
      reviewActionCopy: IMPORT_REVIEW_ACTION_COPY,
      conflictPaths,
      conflictExistingValues,
      conflictDecisions,
      conflictSearch,
      conflictStatusFilter,
      conflictTypeFilter,
      checkingConflicts,
      setConflictSearch,
      setConflictStatusFilter,
      setConflictTypeFilter,
      setConflictDecisions,
      importProgress,
      skippedEntries: src.skippedEntries,
      skippedExpanded: src.skippedExpanded,
      setSkippedExpanded: src.setSkippedExpanded,
      fileImportValidation: src.fileImportValidation,
      isDragging: src.isDragging,
      existingTokenMap,
      existingPathsFetching,
      existingTokenMapError,
      varConflictPreview,
      varConflictDetails,
      varConflictDetailsExpanded,
      setVarConflictDetailsExpanded,
      checkingVarConflicts,
      totalEnabledSets,
      totalEnabledTokens,
      previewNewCount,
      previewOverwriteCount,
      usesCollectionDestination,
      destinationReady,
      canContinueToPreview,
      fileInputRef: src.fileInputRef,
      cssFileInputRef: src.cssFileInputRef,
      tailwindFileInputRef: src.tailwindFileInputRef,
      tokensStudioFileInputRef: src.tokensStudioFileInputRef,
      clearConflictState,
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
      handleImportVariables,
      handleImportStyles,
      executeImport,
      handleUndoImport,
      handleRetryFailed,
      handleCopyFailedPaths,
      openImportNextStep,
      toggleToken: src.toggleToken,
      toggleAll: src.toggleAll,
      commitNewSet: setsHook.commitNewSet,
      cancelNewSet: setsHook.cancelNewSet,
      setTargetSetAndPersist: setsHook.setTargetSetAndPersist,
      fetchSets: setsHook.fetchSets,
      clearSuccessState,
    }),
    [
      serverUrl,
      connected,
      src.collectionData,
      src.modeSetNames,
      src.modeEnabled,
      src.setModeSetNames,
      src.setModeEnabled,
      src.tokens,
      src.selectedTokens,
      src.typeFilter,
      src.setTypeFilter,
      src.loading,
      src.error,
      src.sourceFamily,
      src.source,
      src.workflowStage,
      src.skippedEntries,
      src.skippedExpanded,
      src.setSkippedExpanded,
      src.fileImportValidation,
      src.isDragging,
      src.fileInputRef,
      src.cssFileInputRef,
      src.tailwindFileInputRef,
      src.tokensStudioFileInputRef,
      src.handleReadVariables,
      src.handleReadStyles,
      src.handleReadJson,
      src.handleReadCSS,
      src.handleReadTailwind,
      src.handleReadTokensStudio,
      src.handleJsonFileChange,
      src.handleCSSFileChange,
      src.handleTailwindFileChange,
      src.handleTokensStudioFileChange,
      src.handleDragEnter,
      src.handleDragLeave,
      src.handleDragOver,
      src.handleDrop,
      src.handleBack,
      src.selectSourceFamily,
      src.continueToPreview,
      src.toggleToken,
      src.toggleAll,
      importing,
      importProgress,
      successMessage,
      failedImportPaths,
      failedImportBatches,
      failedImportStrategy,
      succeededImportCount,
      retrying,
      copyFeedback,
      lastImport,
      lastImportResult,
      lastImportReviewSummary,
      importNextStepRecommendations,
      undoing,
      handleCopyFailedPaths,
      clearSuccessState,
      openImportNextStep,
      setsHook.targetSet,
      setsHook.sets,
      setsHook.setsError,
      setsHook.newSetInputVisible,
      setsHook.newSetDraft,
      setsHook.newSetError,
      setsHook.setNewSetInputVisible,
      setsHook.setNewSetDraft,
      setsHook.setNewSetError,
      setsHook.fetchSets,
      setsHook.commitNewSet,
      setsHook.cancelNewSet,
      setsHook.setTargetSetAndPersist,
      conflictPaths,
      conflictExistingValues,
      conflictDecisions,
      conflictSearch,
      conflictStatusFilter,
      conflictTypeFilter,
      checkingConflicts,
      setConflictSearch,
      setConflictStatusFilter,
      setConflictTypeFilter,
      setConflictDecisions,
      existingTokenMap,
      existingPathsFetching,
      existingTokenMapError,
      varConflictPreview,
      varConflictDetails,
      varConflictDetailsExpanded,
      setVarConflictDetailsExpanded,
      checkingVarConflicts,
      clearConflictState,
      failedImportGroups,
      previewNewCount,
      previewOverwriteCount,
      totalEnabledSets,
      totalEnabledTokens,
      usesCollectionDestination,
      destinationReady,
      canContinueToPreview,
      handleImportVariables,
      handleImportStyles,
      executeImport,
      handleUndoImport,
      handleRetryFailed,
      openImportNextStep,
    ],
  );

  return (
    <ImportPanelContext.Provider value={value}>
      {children}
    </ImportPanelContext.Provider>
  );
}
