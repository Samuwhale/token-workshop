import { createContext, useContext, useRef, useCallback, useMemo } from 'react';
import {
  type ImportToken,
  type CollectionData,
  modeKey,
} from './importPanelTypes';
import type { SkippedEntry } from '../shared/tokenParsers';
import { useImportSets } from '../hooks/useImportSets';
import { useImportSource } from '../hooks/useImportSource';
import { useImportConflicts } from '../hooks/useImportConflicts';
import { useImportApply } from '../hooks/useImportApply';
import type { UndoSlot } from '../hooks/useUndo';

export interface ImportPanelProps {
  serverUrl: string;
  connected: boolean;
  onImported: () => void;
  onImportComplete: (targetSet: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
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
  source: 'variables' | 'styles' | 'json' | 'css' | 'tailwind' | 'tokens-studio' | null;

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
  failedImportStrategy: 'overwrite' | 'skip' | 'merge';
  succeededImportCount: number;
  retrying: boolean;
  copyFeedback: boolean;
  lastImport: { entries: { setName: string; paths: string[] }[] } | null;
  undoing: boolean;

  // Conflict state
  conflictPaths: string[] | null;
  conflictExistingValues: Map<string, { $type: string; $value: unknown }> | null;
  conflictDecisions: Map<string, 'accept' | 'merge' | 'reject'>;
  conflictSearch: string;
  conflictStatusFilter: 'all' | 'accept' | 'merge' | 'reject';
  conflictTypeFilter: string;
  checkingConflicts: boolean;
  setConflictSearch: React.Dispatch<React.SetStateAction<string>>;
  setConflictStatusFilter: React.Dispatch<React.SetStateAction<'all' | 'accept' | 'merge' | 'reject'>>;
  setConflictTypeFilter: React.Dispatch<React.SetStateAction<string>>;
  setConflictDecisions: React.Dispatch<React.SetStateAction<Map<string, 'accept' | 'merge' | 'reject'>>>;

  // Progress state
  importProgress: { done: number; total: number } | null;

  // Skipped entries
  skippedEntries: SkippedEntry[];
  skippedExpanded: boolean;
  setSkippedExpanded: React.Dispatch<React.SetStateAction<boolean>>;

  // Drag
  isDragging: boolean;

  // Existing tokens cache
  existingTokenMap: Map<string, { $type: string; $value: unknown }> | null;
  existingPathsFetching: boolean;
  existingTokenMapError: string | null;

  // Variables conflict preview
  varConflictPreview: { newCount: number; overwriteCount: number } | null;
  varConflictDetails: { path: string; setName: string; existing: { $type: string; $value: unknown }; incoming: ImportToken }[] | null;
  varConflictDetailsExpanded: boolean;
  setVarConflictDetailsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  checkingVarConflicts: boolean;

  // Derived values
  totalEnabledSets: number;
  totalEnabledTokens: number;
  previewNewCount: number | null;
  previewOverwriteCount: number | null;

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
  handleTokensStudioFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleBack: () => void;
  handleImportVariables: (strategy?: 'overwrite' | 'skip' | 'merge') => Promise<void>;
  handleImportStyles: () => Promise<void>;
  executeImport: (strategy: 'skip' | 'overwrite', excludePaths?: Set<string>, mergePaths?: Set<string>) => Promise<void>;
  handleUndoImport: () => Promise<void>;
  handleRetryFailed: () => Promise<void>;
  handleCopyFailedPaths: () => void;
  toggleToken: (path: string) => void;
  toggleAll: () => void;
  commitNewSet: () => void;
  cancelNewSet: () => void;
  setTargetSetAndPersist: (name: string) => void;
  fetchSets: () => Promise<void>;
  clearSuccessState: () => void;
}

const ImportPanelContext = createContext<ImportPanelContextValue | null>(null);

export function useImportPanel(): ImportPanelContextValue {
  const ctx = useContext(ImportPanelContext);
  if (!ctx) throw new Error('useImportPanel must be used within ImportPanelProvider');
  return ctx;
}

export function ImportPanelProvider({
  serverUrl,
  connected,
  onImported,
  onImportComplete,
  onPushUndo,
  children,
}: ImportPanelProps & { children: React.ReactNode }) {
  // Late-bound refs for cross-domain callbacks, following the stable-callback-ref pattern.
  // useImportSource and useImportSets need clearConflictState / resetExistingPathsCache from
  // useImportConflicts, but conflicts needs state from source/sets. We break the cycle by
  // passing stable wrappers backed by refs that are assigned after all hooks run.
  const clearConflictRef = useRef<() => void>(() => {});
  const resetCacheRef = useRef<() => void>(() => {});

  const onClearConflict = useCallback(() => clearConflictRef.current(), []);
  const onResetCache = useCallback(() => resetCacheRef.current(), []);

  // ── Domain hooks ──────────────────────────────────────────────────────────

  const src = useImportSource({
    onClearConflictState: onClearConflict,
    onResetExistingPathsCache: onResetCache,
  });

  const setsHook = useImportSets({
    serverUrl,
    connected,
    onClearConflictState: onClearConflict,
  });

  const conflicts = useImportConflicts({
    serverUrl,
    tokens: src.tokens,
    selectedTokens: src.selectedTokens,
    targetSet: setsHook.targetSet,
    targetSetRef: setsHook.targetSetRef,
    sets: setsHook.sets,
    collectionData: src.collectionData,
    modeEnabled: src.modeEnabled,
    modeSetNames: src.modeSetNames,
  });

  // Assign late-bound implementations after all hooks have run
  clearConflictRef.current = conflicts.clearConflictState;
  resetCacheRef.current = conflicts.resetExistingPathsCache;

  // Wrap apply callbacks to forward errors to src.setError
  const applyErrorRef = useRef<string | null>(null);
  void applyErrorRef;

  const apply = useImportApply({
    serverUrl,
    tokens: src.tokens,
    selectedTokens: src.selectedTokens,
    source: src.source,
    targetSet: setsHook.targetSet,
    collectionData: src.collectionData,
    modeEnabled: src.modeEnabled,
    modeSetNames: src.modeSetNames,
    clearConflictState: conflicts.clearConflictState,
    setConflictPaths: conflicts.setConflictPaths,
    setConflictExistingValues: conflicts.setConflictExistingValues,
    setConflictDecisions: conflicts.setConflictDecisions,
    setCheckingConflicts: conflicts.setCheckingConflicts,
    setExistingTokenMap: conflicts.setExistingTokenMap,
    onResetExistingPathsCache: conflicts.resetExistingPathsCache,
    onResetAfterImport: src.resetAfterImport,
    onImported,
    onImportComplete,
    onPushUndo,
  });

  // Wrap async apply methods to propagate errors to src.setError (preserving original behaviour)
  const handleImportVariables = useCallback(async (strategy?: 'overwrite' | 'skip' | 'merge') => {
    src.setError(null);
    const result = await apply.handleImportVariables(strategy);
    if (result?.error) src.setError(result.error);
  }, [apply, src]);

  const handleImportStyles = useCallback(async () => {
    src.setError(null);
    if (!connected || src.selectedTokens.size === 0) return;
    const result = await apply.handleImportStyles();
    if (result?.error) src.setError(result.error);
  }, [apply, src, connected]);

  const executeImport = useCallback(async (strategy: 'skip' | 'overwrite', excludePaths?: Set<string>, mergePaths?: Set<string>) => {
    src.setError(null);
    const result = await apply.executeImport(strategy, excludePaths, mergePaths);
    if (result?.error) src.setError(result.error);
  }, [apply, src]);

  const handleUndoImport = useCallback(async () => {
    src.setError(null);
    const result = await apply.handleUndoImport();
    if (result?.error) src.setError(result.error);
  }, [apply, src]);

  const handleRetryFailed = useCallback(async () => {
    src.setError(null);
    const result = await apply.handleRetryFailed();
    if (result?.error) src.setError(result.error);
  }, [apply, src]);

  // ── Derived values ────────────────────────────────────────────────────────

  const { totalEnabledSets, totalEnabledTokens } = useMemo(() => {
    const enabledModes = src.collectionData.flatMap(col =>
      col.modes.filter(m => src.modeEnabled[modeKey(col.name, m.modeId)])
    );
    const enabledSetCount = enabledModes.length;
    const toks = src.collectionData.reduce((acc, col) =>
      acc + col.modes
        .filter(m => src.modeEnabled[modeKey(col.name, m.modeId)])
        .reduce((a, m) => a + m.tokens.length, 0), 0);
    return { totalEnabledSets: enabledSetCount, totalEnabledTokens: toks };
  }, [src.collectionData, src.modeEnabled]);

  // ── Context value ─────────────────────────────────────────────────────────

  const value = useMemo<ImportPanelContextValue>(() => ({
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
    importing: apply.importing,
    error: src.error,
    source: src.source,
    targetSet: setsHook.targetSet,
    sets: setsHook.sets,
    setsError: setsHook.setsError,
    newSetInputVisible: setsHook.newSetInputVisible,
    newSetDraft: setsHook.newSetDraft,
    newSetError: setsHook.newSetError,
    setNewSetInputVisible: setsHook.setNewSetInputVisible,
    setNewSetDraft: setsHook.setNewSetDraft,
    setNewSetError: setsHook.setNewSetError,
    successMessage: apply.successMessage,
    failedImportPaths: apply.failedImportPaths,
    failedImportBatches: apply.failedImportBatches,
    failedImportStrategy: apply.failedImportStrategy,
    succeededImportCount: apply.succeededImportCount,
    retrying: apply.retrying,
    copyFeedback: apply.copyFeedback,
    lastImport: apply.lastImport,
    undoing: apply.undoing,
    conflictPaths: conflicts.conflictPaths,
    conflictExistingValues: conflicts.conflictExistingValues,
    conflictDecisions: conflicts.conflictDecisions,
    conflictSearch: conflicts.conflictSearch,
    conflictStatusFilter: conflicts.conflictStatusFilter,
    conflictTypeFilter: conflicts.conflictTypeFilter,
    checkingConflicts: conflicts.checkingConflicts,
    setConflictSearch: conflicts.setConflictSearch,
    setConflictStatusFilter: conflicts.setConflictStatusFilter,
    setConflictTypeFilter: conflicts.setConflictTypeFilter,
    setConflictDecisions: conflicts.setConflictDecisions,
    importProgress: apply.importProgress,
    skippedEntries: src.skippedEntries,
    skippedExpanded: src.skippedExpanded,
    setSkippedExpanded: src.setSkippedExpanded,
    isDragging: src.isDragging,
    existingTokenMap: conflicts.existingTokenMap,
    existingPathsFetching: conflicts.existingPathsFetching,
    existingTokenMapError: conflicts.existingTokenMapError,
    varConflictPreview: conflicts.varConflictPreview,
    varConflictDetails: conflicts.varConflictDetails,
    varConflictDetailsExpanded: conflicts.varConflictDetailsExpanded,
    setVarConflictDetailsExpanded: conflicts.setVarConflictDetailsExpanded,
    checkingVarConflicts: conflicts.checkingVarConflicts,
    totalEnabledSets,
    totalEnabledTokens,
    previewNewCount: conflicts.previewNewCount,
    previewOverwriteCount: conflicts.previewOverwriteCount,
    fileInputRef: src.fileInputRef,
    cssFileInputRef: src.cssFileInputRef,
    tailwindFileInputRef: src.tailwindFileInputRef,
    tokensStudioFileInputRef: src.tokensStudioFileInputRef,
    clearConflictState: conflicts.clearConflictState,
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
    handleImportVariables,
    handleImportStyles,
    executeImport,
    handleUndoImport,
    handleRetryFailed,
    handleCopyFailedPaths: apply.handleCopyFailedPaths,
    toggleToken: src.toggleToken,
    toggleAll: src.toggleAll,
    commitNewSet: setsHook.commitNewSet,
    cancelNewSet: setsHook.cancelNewSet,
    setTargetSetAndPersist: setsHook.setTargetSetAndPersist,
    fetchSets: setsHook.fetchSets,
    clearSuccessState: apply.clearSuccessState,
  }), [
    serverUrl, connected,
    src.collectionData, src.modeSetNames, src.modeEnabled, src.setModeSetNames, src.setModeEnabled,
    src.tokens, src.selectedTokens, src.typeFilter, src.setTypeFilter,
    src.loading, src.error, src.source, src.skippedEntries, src.skippedExpanded, src.setSkippedExpanded,
    src.isDragging, src.fileInputRef, src.cssFileInputRef, src.tailwindFileInputRef, src.tokensStudioFileInputRef,
    src.handleReadVariables, src.handleReadStyles, src.handleReadJson, src.handleReadCSS,
    src.handleReadTailwind, src.handleReadTokensStudio, src.handleJsonFileChange, src.handleCSSFileChange,
    src.handleTailwindFileChange, src.handleTokensStudioFileChange, src.handleDragEnter, src.handleDragLeave,
    src.handleDragOver, src.handleDrop, src.handleBack, src.toggleToken, src.toggleAll,
    apply.importing, apply.importProgress, apply.successMessage, apply.failedImportPaths,
    apply.failedImportBatches, apply.failedImportStrategy, apply.succeededImportCount,
    apply.retrying, apply.copyFeedback, apply.lastImport, apply.undoing,
    apply.handleCopyFailedPaths, apply.clearSuccessState,
    setsHook.targetSet, setsHook.sets, setsHook.setsError, setsHook.newSetInputVisible,
    setsHook.newSetDraft, setsHook.newSetError, setsHook.setNewSetInputVisible, setsHook.setNewSetDraft,
    setsHook.setNewSetError, setsHook.fetchSets, setsHook.commitNewSet, setsHook.cancelNewSet,
    setsHook.setTargetSetAndPersist,
    conflicts.conflictPaths, conflicts.conflictExistingValues, conflicts.conflictDecisions,
    conflicts.conflictSearch, conflicts.conflictStatusFilter, conflicts.conflictTypeFilter,
    conflicts.checkingConflicts, conflicts.setConflictSearch, conflicts.setConflictStatusFilter,
    conflicts.setConflictTypeFilter, conflicts.setConflictDecisions,
    conflicts.existingTokenMap, conflicts.existingPathsFetching, conflicts.existingTokenMapError,
    conflicts.varConflictPreview, conflicts.varConflictDetails, conflicts.varConflictDetailsExpanded,
    conflicts.setVarConflictDetailsExpanded, conflicts.checkingVarConflicts,
    conflicts.clearConflictState, conflicts.previewNewCount, conflicts.previewOverwriteCount,
    totalEnabledSets, totalEnabledTokens,
    handleImportVariables, handleImportStyles, executeImport, handleUndoImport, handleRetryFailed,
  ]);

  return (
    <ImportPanelContext.Provider value={value}>
      {children}
    </ImportPanelContext.Provider>
  );
}
