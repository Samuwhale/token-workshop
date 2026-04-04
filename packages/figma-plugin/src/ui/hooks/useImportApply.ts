import { useState, useCallback } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import { getErrorMessage } from '../shared/utils';
import { apiFetch, ApiError } from '../shared/apiFetch';
import {
  type ImportToken,
  type CollectionData,
  defaultSetName,
  modeKey,
} from '../components/importPanelTypes';

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
}: UseImportApplyParams) {
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [failedImportPaths, setFailedImportPaths] = useState<string[]>([]);
  const [failedImportBatches, setFailedImportBatches] = useState<{ setName: string; tokens: Record<string, unknown>[] }[]>([]);
  const [failedImportStrategy, setFailedImportStrategy] = useState<'overwrite' | 'skip' | 'merge'>('overwrite');
  const [succeededImportCount, setSucceededImportCount] = useState<number>(0);
  const [retrying, setRetrying] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [lastImport, setLastImport] = useState<{ entries: { setName: string; paths: string[] }[] } | null>(null);
  const [undoing, setUndoing] = useState(false);

  const clearSuccessState = useCallback(() => {
    setSuccessMessage(null);
    setFailedImportPaths([]);
    setFailedImportBatches([]);
    setSucceededImportCount(0);
    setLastImport(null);
  }, []);

  const executeImport = useCallback(async (strategy: 'skip' | 'overwrite', excludePaths?: Set<string>, mergePaths?: Set<string>) => {
    setImporting(true);
    clearConflictState();
    const currentError: string | null = null;
    void currentError;

    try {
      const tokensToImport = tokens.filter(t => selectedTokens.has(t.path) && !excludePaths?.has(t.path));
      setImportProgress({ done: 0, total: tokensToImport.length });

      try {
        await apiFetch(`${serverUrl}/api/sets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: targetSet }),
        });
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) {
          throw new Error(`Failed to create set "${targetSet}": ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      const buildTok = (t: ImportToken) => {
        const tok: Record<string, unknown> = { path: t.path, $type: t.$type, $value: t.$value };
        if (source) tok.$extensions = { tokenmanager: { source: source === 'variables' ? 'figma-variables' : source === 'styles' ? 'figma-styles' : source } };
        return tok;
      };

      const mergeTokens = mergePaths ? tokensToImport.filter(t => mergePaths.has(t.path)) : [];
      const overwriteTokens = mergePaths ? tokensToImport.filter(t => !mergePaths.has(t.path)) : tokensToImport;

      let imported = 0;

      if (overwriteTokens.length > 0) {
        const result = await apiFetch<{ imported: number; skipped: number }>(
          `${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/batch`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens: overwriteTokens.map(buildTok), strategy }),
          },
        );
        imported += result.imported;
      }

      if (mergeTokens.length > 0) {
        const result = await apiFetch<{ imported: number; skipped: number }>(
          `${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/batch`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens: mergeTokens.map(buildTok), strategy: 'merge' }),
          },
        );
        imported += result.imported;
      }

      setImportProgress({ done: tokensToImport.length, total: tokensToImport.length });

      parent.postMessage({ pluginMessage: { type: 'notify', message: `Imported ${imported} tokens to "${targetSet}"` } }, '*');
      onImported();
      onImportComplete(targetSet);
      onResetExistingPathsCache();
      setExistingTokenMap(null);
      if (imported > 0) {
        setLastImport({ entries: [{ setName: targetSet, paths: tokensToImport.map(t => t.path) }] });
      }
      onResetAfterImport();
      setSuccessMessage(`Imported ${imported} token${imported !== 1 ? 's' : ''} to "${targetSet}"`);
    } catch (err) {
      return { error: getErrorMessage(err) };
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
    return null;
  }, [tokens, selectedTokens, serverUrl, targetSet, source, clearConflictState, onImported, onImportComplete, onResetAfterImport, onResetExistingPathsCache, setExistingTokenMap]);

  const handleImportVariables = useCallback(async (strategy: 'overwrite' | 'skip' | 'merge' = 'overwrite') => {
    setImporting(true);
    setFailedImportPaths([]);
    setFailedImportBatches([]);
    setFailedImportStrategy(strategy);
    let importedSets = 0;
    let importedTokens = 0;
    const failedPaths: string[] = [];
    const failedBatches: { setName: string; tokens: Record<string, unknown>[] }[] = [];
    const rollbackEntries: { setName: string; paths: string[] }[] = [];
    try {
      const allModes = collectionData.flatMap(col =>
        col.modes
          .filter(m => modeEnabled[modeKey(col.name, m.modeId)])
          .map(m => ({ col, mode: m, setName: modeSetNames[modeKey(col.name, m.modeId)] || defaultSetName(col.name, m.modeName, col.modes.length) }))
      );
      setImportProgress({ done: 0, total: allModes.length });

      for (const { mode, setName } of allModes) {
        try {
          await apiFetch(`${serverUrl}/api/sets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: setName }),
          });
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409)) {
            throw new Error(`Failed to create set "${setName}": ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        }

        try {
          const { imported } = await apiFetch<{ imported: number; skipped: number }>(
            `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tokens: mode.tokens.map(t => {
                  const tok: Record<string, unknown> = { path: t.path, $type: t.$type, $value: t.$value };
                  if (t.$description) tok.$description = t.$description;
                  if (t.$scopes && t.$scopes.length > 0) tok.$scopes = t.$scopes;
                  const srcTag = source === 'tokens-studio' ? 'tokens-studio' : 'figma-variables';
                  tok.$extensions = { ...(t.$extensions ?? {}), tokenmanager: { ...(t.$extensions?.tokenmanager ?? {}), source: srcTag } };
                  return tok;
                }),
                strategy,
              }),
            },
          );
          importedTokens += imported;
          if (imported > 0) {
            rollbackEntries.push({ setName, paths: mode.tokens.map(t => t.path) });
          }
        } catch (err) {
          console.warn('[ImportPanel] failed to import token batch:', err);
          const batchTokens = mode.tokens.map(t => {
            const tok: Record<string, unknown> = { path: t.path, $type: t.$type, $value: t.$value };
            if (t.$description) tok.$description = t.$description;
            if (t.$scopes && t.$scopes.length > 0) tok.$scopes = t.$scopes;
            const srcTag = source === 'tokens-studio' ? 'tokens-studio' : 'figma-variables';
            tok.$extensions = { ...(t.$extensions ?? {}), tokenmanager: { ...(t.$extensions?.tokenmanager ?? {}), source: srcTag } };
            return tok;
          });
          for (const t of mode.tokens) failedPaths.push(t.path);
          failedBatches.push({ setName, tokens: batchTokens });
        }
        importedSets++;
        setImportProgress({ done: importedSets, total: allModes.length });
      }

      const failedCount = failedPaths.length;
      const notifyMsg = failedCount > 0
        ? `Imported ${importedTokens} tokens across ${importedSets} set${importedSets !== 1 ? 's' : ''} (${failedCount} failed)`
        : `Imported ${importedTokens} tokens across ${importedSets} set${importedSets !== 1 ? 's' : ''}`;
      parent.postMessage({ pluginMessage: { type: 'notify', message: notifyMsg } }, '*');
      onImported();
      const firstSet = allModes[0]?.setName ?? '';
      if (firstSet) onImportComplete(firstSet);
      onResetAfterImport();
      if (failedCount > 0) { setFailedImportPaths(failedPaths); setFailedImportBatches(failedBatches); setSucceededImportCount(importedTokens); }
      if (rollbackEntries.length > 0) setLastImport({ entries: rollbackEntries });
      const successMsg = failedCount > 0
        ? `Imported ${importedTokens} token${importedTokens !== 1 ? 's' : ''} across ${importedSets} set${importedSets !== 1 ? 's' : ''} — ${failedCount} token${failedCount !== 1 ? 's' : ''} could not be saved`
        : `Imported ${importedTokens} token${importedTokens !== 1 ? 's' : ''} across ${importedSets} set${importedSets !== 1 ? 's' : ''}`;
      setSuccessMessage(successMsg);
    } catch (err) {
      return { error: getErrorMessage(err) };
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
    return null;
  }, [collectionData, modeEnabled, modeSetNames, serverUrl, source, onImported, onImportComplete, onResetAfterImport]);

  const handleImportStyles = useCallback(async () => {
    if (selectedTokens.size === 0) return null;
    setCheckingConflicts(true);
    const checkingForSet = targetSet;

    try {
      let flat = new Map<string, unknown>();
      try {
        const data = await apiFetch<{ tokens?: Record<string, unknown> }>(`${serverUrl}/api/tokens/${encodeURIComponent(checkingForSet)}`);
        flat = flattenTokenGroup(data.tokens || {});
      } catch (fetchErr) {
        if (!(fetchErr instanceof ApiError && fetchErr.status === 404)) {
          throw fetchErr;
        }
      }
      const existingKeys = new Set(flat.keys());
      const tokensToImport = tokens.filter(t => selectedTokens.has(t.path));
      const conflicts = tokensToImport.filter(t => existingKeys.has(t.path)).map(t => t.path);
      if (conflicts.length > 0) {
        setConflictPaths(conflicts);
        const existingVals = new Map<string, { $type: string; $value: unknown }>();
        for (const p of conflicts) {
          const tok = flat.get(p);
          if (tok) existingVals.set(p, { $type: (tok as any).$type ?? 'unknown', $value: (tok as any).$value });
        }
        setConflictExistingValues(existingVals);
        const decisions = new Map<string, 'accept' | 'reject'>();
        for (const p of conflicts) decisions.set(p, 'accept');
        setConflictDecisions(decisions as Map<string, 'accept' | 'merge' | 'reject'>);
        return null;
      }
      const result = await executeImport('overwrite');
      return result;
    } catch (err) {
      return { error: getErrorMessage(err) };
    } finally {
      setCheckingConflicts(false);
    }
  }, [selectedTokens, targetSet, serverUrl, tokens, executeImport, setConflictPaths, setConflictExistingValues, setConflictDecisions, setCheckingConflicts]);

  const handleUndoImport = useCallback(async () => {
    if (!lastImport || undoing) return null;
    setUndoing(true);
    try {
      for (const entry of lastImport.entries) {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(entry.setName)}/bulk-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: entry.paths, force: true }),
        });
      }
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Import undone' } }, '*');
      onImported();
      setLastImport(null);
      setSuccessMessage(null);
      setFailedImportPaths([]);
      setFailedImportBatches([]);
      setSucceededImportCount(0);
    } catch (err) {
      return { error: `Undo failed: ${getErrorMessage(err)}` };
    } finally {
      setUndoing(false);
    }
    return null;
  }, [lastImport, undoing, serverUrl, onImported]);

  const handleRetryFailed = useCallback(async () => {
    if (failedImportBatches.length === 0 || retrying) return null;
    setRetrying(true);
    const stillFailed: string[] = [];
    const stillFailedBatches: { setName: string; tokens: Record<string, unknown>[] }[] = [];
    let retried = 0;
    try {
      for (const batch of failedImportBatches) {
        try {
          const { imported } = await apiFetch<{ imported: number; skipped: number }>(
            `${serverUrl}/api/tokens/${encodeURIComponent(batch.setName)}/batch`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokens: batch.tokens, strategy: failedImportStrategy }),
            },
          );
          retried += imported;
        } catch (err) {
          console.warn('[ImportPanel] retry failed for batch:', batch.setName, err);
          for (const t of batch.tokens) stillFailed.push(t.path as string);
          stillFailedBatches.push(batch);
        }
      }
      if (stillFailed.length === 0) {
        setFailedImportPaths([]);
        setFailedImportBatches([]);
        setSucceededImportCount(prev => prev + retried);
        setSuccessMessage(prev => prev ? `${prev} (${retried} recovered on retry)` : `Recovered ${retried} token${retried !== 1 ? 's' : ''} on retry`);
        parent.postMessage({ pluginMessage: { type: 'notify', message: `Retried: ${retried} tokens imported` } }, '*');
      } else {
        setFailedImportPaths(stillFailed);
        setFailedImportBatches(stillFailedBatches);
        setSucceededImportCount(prev => prev + retried);
        parent.postMessage({ pluginMessage: { type: 'notify', message: `Retry: ${retried} recovered, ${stillFailed.length} still failed` } }, '*');
      }
      onImported();
    } catch (err) {
      return { error: `Retry failed: ${getErrorMessage(err)}` };
    } finally {
      setRetrying(false);
    }
    return null;
  }, [failedImportBatches, retrying, serverUrl, failedImportStrategy, onImported]);

  const handleCopyFailedPaths = useCallback(() => {
    if (failedImportPaths.length === 0) return;
    navigator.clipboard.writeText(failedImportPaths.join('\n')).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = failedImportPaths.join('\n');
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }, [failedImportPaths]);

  return {
    importing,
    importProgress,
    successMessage,
    setSuccessMessage,
    failedImportPaths,
    failedImportBatches,
    failedImportStrategy,
    succeededImportCount,
    retrying,
    copyFeedback,
    lastImport,
    undoing,
    clearSuccessState,
    executeImport,
    handleImportVariables,
    handleImportStyles,
    handleUndoImport,
    handleRetryFailed,
    handleCopyFailedPaths,
  };
}
