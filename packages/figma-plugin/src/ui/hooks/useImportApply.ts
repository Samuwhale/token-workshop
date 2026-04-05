import { useState, useCallback, useRef } from 'react';
import { dispatchToast } from '../shared/toastBus';
import { getErrorMessage } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';
import type { ImportToken, CollectionData } from '../components/importPanelTypes';
import { useImportProgress } from './useImportProgress';
import { useVariablesImport } from './useVariablesImport';
import { useTokensImport } from './useTokensImport';
import type { UndoSlot } from './useUndo';

export interface UseImportApplyParams {
  serverUrl: string;
  tokens: ImportToken[];
  selectedTokens: Set<string>;
  source: 'variables' | 'styles' | 'json' | 'css' | 'tailwind' | 'tokens-studio' | null;
  targetSet: string;
  collectionData: CollectionData[];
  modeEnabled: Record<string, boolean>;
  modeSetNames: Record<string, string>;
  clearConflictState: () => void;
  setConflictPaths: (paths: string[] | null) => void;
  setConflictExistingValues: (map: Map<string, { $type: string; $value: unknown }> | null) => void;
  setConflictDecisions: (decisions: Map<string, 'accept' | 'merge' | 'reject'>) => void;
  setCheckingConflicts: (checking: boolean) => void;
  setExistingTokenMap: (map: Map<string, { $type: string; $value: unknown }> | null) => void;
  onResetExistingPathsCache: () => void;
  onResetAfterImport: () => void;
  onImported: () => void;
  onImportComplete: (targetSet: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
}

export function useImportApply({
  serverUrl,
  tokens,
  selectedTokens,
  source,
  targetSet,
  collectionData,
  modeEnabled,
  modeSetNames,
  clearConflictState,
  setConflictPaths,
  setConflictExistingValues,
  setConflictDecisions,
  setCheckingConflicts,
  setExistingTokenMap,
  onResetExistingPathsCache,
  onResetAfterImport,
  onImported,
  onImportComplete,
  onPushUndo,
}: UseImportApplyParams) {
  // ── Shared progress state ───────────────────────────────────────────────────
  const progress = useImportProgress();
  const { importing, importProgress, successMessage, setSuccessMessage } = progress;

  // ── Undo state (cross-cutting: both workflows can set a rollback) ───────────
  const [lastImport, setLastImport] = useState<{
    entries: { setName: string; paths: string[] }[];
  } | null>(null);
  const [undoing, setUndoing] = useState(false);
  // Synchronous guard — same pattern as retryingRef to prevent double-trigger.
  const undoingRef = useRef(false);

  // Late-bound refs for callbacks needed inside the undo restore closure.
  // Using refs means the restore function always calls the latest version without
  // capturing stale closures at the time the undo slot was pushed.
  const onPushUndoRef = useRef(onPushUndo);
  onPushUndoRef.current = onPushUndo;
  const onImportedRef = useRef(onImported);
  onImportedRef.current = onImported;
  const setSuccessMessageRef = useRef(setSuccessMessage);
  setSuccessMessageRef.current = setSuccessMessage;
  // clearFailedState comes from variablesWorkflow (defined after this point);
  // use a late-bound ref filled in after the sub-hooks run.
  const clearFailedStateRef = useRef<() => void>(() => {});
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  // Wrapper around setLastImport that also pushes to the main undo stack whenever
  // a successful import records rollback entries. Passed to both sub-hooks so they
  // automatically integrate with Cmd+Z after any import path.
  const setLastImportWithUndo = useCallback(
    (entries: { entries: { setName: string; paths: string[] }[] } | null) => {
      setLastImport(entries);
      if (!entries || !onPushUndoRef.current) return;
      const captured = entries;
      const totalPaths = captured.entries.reduce((sum, e) => sum + e.paths.length, 0);
      const setNames = [...new Set(captured.entries.map(e => e.setName))];
      const description =
        setNames.length === 1
          ? `Import ${totalPaths} token${totalPaths !== 1 ? 's' : ''} to "${setNames[0]}"`
          : `Import ${totalPaths} token${totalPaths !== 1 ? 's' : ''} to ${setNames.length} sets`;
      onPushUndoRef.current({
        description,
        restore: async () => {
          for (const entry of captured.entries) {
            await apiFetch(
              `${serverUrlRef.current}/api/tokens/${encodeURIComponent(entry.setName)}/batch-delete`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths: entry.paths, force: true }),
              },
            );
          }
          onImportedRef.current();
          setLastImport(null);
          setSuccessMessageRef.current(null);
          clearFailedStateRef.current();
        },
      });
    },
    // setLastImport is stable (React state setter); refs are always current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Per-workflow sub-hooks ──────────────────────────────────────────────────

  const variablesWorkflow = useVariablesImport({
    serverUrl,
    source,
    collectionData,
    modeEnabled,
    modeSetNames,
    progress,
    setLastImport: setLastImportWithUndo,
    onImported,
    onImportComplete,
    onResetAfterImport,
  });

  const tokensWorkflow = useTokensImport({
    serverUrl,
    tokens,
    selectedTokens,
    source,
    targetSet,
    progress,
    setLastImport: setLastImportWithUndo,
    clearConflictState,
    setConflictPaths,
    setConflictExistingValues,
    setConflictDecisions,
    setCheckingConflicts,
    setExistingTokenMap,
    onResetExistingPathsCache,
    onResetAfterImport,
    onImported,
    onImportComplete,
  });

  // Fill in the late-bound ref for clearFailedState now that variablesWorkflow exists.
  clearFailedStateRef.current = variablesWorkflow.clearFailedState;

  // ── Undo (owns lastImport, applies ref guard to prevent double-trigger) ─────
  const handleUndoImport = useCallback(async () => {
    if (!lastImport || undoingRef.current) return null;
    undoingRef.current = true;
    setUndoing(true);
    try {
      for (const entry of lastImport.entries) {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(entry.setName)}/batch-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: entry.paths, force: true }),
        });
      }
      dispatchToast('Import undone', 'success');
      onImported();
      setLastImport(null);
      setSuccessMessage(null);
      variablesWorkflow.clearFailedState();
    } catch (err) {
      return { error: `Undo failed: ${getErrorMessage(err)}` };
    } finally {
      undoingRef.current = false;
      setUndoing(false);
    }
    return null;
  }, [lastImport, serverUrl, onImported, setSuccessMessage, variablesWorkflow]);

  // ── Cross-workflow clear ────────────────────────────────────────────────────
  const clearSuccessState = useCallback(() => {
    setSuccessMessage(null);
    variablesWorkflow.clearFailedState();
    setLastImport(null);
  }, [setSuccessMessage, variablesWorkflow]);

  return {
    importing,
    importProgress,
    successMessage,
    setSuccessMessage,
    lastImport,
    undoing,
    failedImportPaths: variablesWorkflow.failedImportPaths,
    failedImportBatches: variablesWorkflow.failedImportBatches,
    failedImportStrategy: variablesWorkflow.failedImportStrategy,
    succeededImportCount: variablesWorkflow.succeededImportCount,
    retrying: variablesWorkflow.retrying,
    copyFeedback: variablesWorkflow.copyFeedback,
    clearSuccessState,
    executeImport: tokensWorkflow.executeImport,
    handleImportVariables: variablesWorkflow.handleImportVariables,
    handleImportStyles: tokensWorkflow.handleImportStyles,
    handleUndoImport,
    handleRetryFailed: variablesWorkflow.handleRetryFailed,
    handleCopyFailedPaths: variablesWorkflow.handleCopyFailedPaths,
  };
}
