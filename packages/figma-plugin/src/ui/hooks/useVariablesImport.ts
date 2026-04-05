import { useState, useCallback, useRef } from 'react';
import { dispatchToast } from '../shared/toastBus';
import { getErrorMessage } from '../shared/utils';
import { apiFetch, ApiError } from '../shared/apiFetch';
import {
  type ImportToken,
  type CollectionData,
  defaultSetName,
  modeKey,
} from '../components/importPanelTypes';
import type { ProgressSetters } from './useImportProgress';

interface UseVariablesImportParams {
  serverUrl: string;
  source: 'variables' | 'styles' | 'json' | 'css' | 'tailwind' | 'tokens-studio' | null;
  collectionData: CollectionData[];
  modeEnabled: Record<string, boolean>;
  modeSetNames: Record<string, string>;
  progress: ProgressSetters;
  setLastImport: (entries: { entries: { setName: string; paths: string[] }[] } | null) => void;
  onImported: () => void;
  onImportComplete: (targetSet: string) => void;
  onResetAfterImport: () => void;
}

/**
 * Builds the token payload for a single variable/tokens-studio token.
 * Extracted to eliminate the verbatim duplication between the success path
 * (sendign tokens to the API) and the failure path (building the retry batch).
 */
function buildVariableToken(
  t: ImportToken,
  source: UseVariablesImportParams['source'],
): Record<string, unknown> {
  const tok: Record<string, unknown> = { path: t.path, $type: t.$type, $value: t.$value };
  if (t.$description) tok.$description = t.$description;
  if (t.$scopes && t.$scopes.length > 0) tok.$scopes = t.$scopes;
  const srcTag = source === 'tokens-studio' ? 'tokens-studio' : 'figma-variables';
  tok.$extensions = {
    ...(t.$extensions ?? {}),
    tokenmanager: { ...(t.$extensions?.tokenmanager ?? {}), source: srcTag },
  };
  return tok;
}

/** Handles the Figma Variables / Tokens Studio import workflow (multi-set, per-mode). */
export function useVariablesImport({
  serverUrl,
  source,
  collectionData,
  modeEnabled,
  modeSetNames,
  progress,
  setLastImport,
  onImported,
  onImportComplete,
  onResetAfterImport,
}: UseVariablesImportParams) {
  const [failedImportPaths, setFailedImportPaths] = useState<string[]>([]);
  const [failedImportBatches, setFailedImportBatches] = useState<
    { setName: string; tokens: Record<string, unknown>[] }[]
  >([]);
  const [failedImportStrategy, setFailedImportStrategy] = useState<'overwrite' | 'skip' | 'merge'>('overwrite');
  const [succeededImportCount, setSucceededImportCount] = useState<number>(0);
  const [retrying, setRetrying] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Synchronous guard — prevents the race condition where rapid successive clicks
  // bypass the `retrying` check before React re-renders with the updated state.
  const retryingRef = useRef(false);

  const clearFailedState = useCallback(() => {
    setFailedImportPaths([]);
    setFailedImportBatches([]);
    setSucceededImportCount(0);
  }, []);

  const handleImportVariables = useCallback(
    async (strategy: 'overwrite' | 'skip' | 'merge' = 'overwrite') => {
      progress.setImporting(true);
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
            .map(m => ({
              col,
              mode: m,
              setName:
                modeSetNames[modeKey(col.name, m.modeId)] ||
                defaultSetName(col.name, m.modeName, col.modes.length),
            })),
        );
        progress.setImportProgress({ done: 0, total: allModes.length });

        for (const { mode, setName } of allModes) {
          try {
            await apiFetch(`${serverUrl}/api/sets`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: setName }),
            });
          } catch (err) {
            if (!(err instanceof ApiError && err.status === 409)) {
              throw new Error(
                `Failed to create set "${setName}": ${err instanceof Error ? err.message : 'Unknown error'}`,
              );
            }
          }

          try {
            const { imported } = await apiFetch<{ imported: number; skipped: number }>(
              `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tokens: mode.tokens.map(t => buildVariableToken(t, source)),
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
            // Re-use the same builder so the retry batch is byte-for-byte identical
            // to what would have been sent on the first attempt.
            const batchTokens = mode.tokens.map(t => buildVariableToken(t, source));
            for (const t of mode.tokens) failedPaths.push(t.path);
            failedBatches.push({ setName, tokens: batchTokens });
          }

          importedSets++;
          progress.setImportProgress({ done: importedSets, total: allModes.length });
        }

        const failedCount = failedPaths.length;
        const notifyMsg =
          failedCount > 0
            ? `Imported ${importedTokens} tokens across ${importedSets} set${importedSets !== 1 ? 's' : ''} (${failedCount} failed)`
            : `Imported ${importedTokens} tokens across ${importedSets} set${importedSets !== 1 ? 's' : ''}`;
        dispatchToast(notifyMsg, failedCount > 0 ? 'error' : 'success');

        onImported();
        const firstSet = allModes[0]?.setName ?? '';
        if (firstSet) onImportComplete(firstSet);
        onResetAfterImport();

        if (failedCount > 0) {
          setFailedImportPaths(failedPaths);
          setFailedImportBatches(failedBatches);
          setSucceededImportCount(importedTokens);
        }
        if (rollbackEntries.length > 0) {
          setLastImport({ entries: rollbackEntries });
        }

        const successMsg =
          failedCount > 0
            ? `Imported ${importedTokens} token${importedTokens !== 1 ? 's' : ''} across ${importedSets} set${importedSets !== 1 ? 's' : ''} — ${failedCount} token${failedCount !== 1 ? 's' : ''} could not be saved`
            : `Imported ${importedTokens} token${importedTokens !== 1 ? 's' : ''} across ${importedSets} set${importedSets !== 1 ? 's' : ''}`;
        progress.setSuccessMessage(successMsg);
      } catch (err) {
        return { error: getErrorMessage(err) };
      } finally {
        progress.setImporting(false);
        progress.setImportProgress(null);
      }
      return null;
    },
    [
      collectionData,
      modeEnabled,
      modeSetNames,
      serverUrl,
      source,
      progress,
      setLastImport,
      onImported,
      onImportComplete,
      onResetAfterImport,
    ],
  );

  const handleRetryFailed = useCallback(async () => {
    // Use a ref as synchronous guard — React state updates are async so rapid clicks
    // can pass the `retrying` state check before the re-render propagates `true`.
    if (failedImportBatches.length === 0 || retryingRef.current) return null;
    retryingRef.current = true;
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
        progress.setSuccessMessage(prev =>
          prev
            ? `${prev} (${retried} recovered on retry)`
            : `Recovered ${retried} token${retried !== 1 ? 's' : ''} on retry`,
        );
        dispatchToast(`Retried: ${retried} tokens imported`, 'success');
      } else {
        setFailedImportPaths(stillFailed);
        setFailedImportBatches(stillFailedBatches);
        setSucceededImportCount(prev => prev + retried);
        dispatchToast(`Retry: ${retried} recovered, ${stillFailed.length} still failed`, 'error');
      }
      onImported();
    } catch (err) {
      return { error: `Retry failed: ${getErrorMessage(err)}` };
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
    return null;
  }, [failedImportBatches, serverUrl, failedImportStrategy, progress, onImported]);

  const handleCopyFailedPaths = useCallback(() => {
    if (failedImportPaths.length === 0) return;
    navigator.clipboard
      .writeText(failedImportPaths.join('\n'))
      .then(() => {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      })
      .catch(() => {
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
    failedImportPaths,
    failedImportBatches,
    failedImportStrategy,
    succeededImportCount,
    retrying,
    copyFeedback,
    clearFailedState,
    handleImportVariables,
    handleRetryFailed,
    handleCopyFailedPaths,
  };
}
