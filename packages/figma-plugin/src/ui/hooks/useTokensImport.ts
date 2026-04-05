import { useCallback } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import { getErrorMessage } from '../shared/utils';
import { apiFetch, ApiError } from '../shared/apiFetch';
import type { ImportToken } from '../components/importPanelTypes';
import type { ProgressSetters } from './useImportProgress';

interface UseTokensImportParams {
  serverUrl: string;
  tokens: ImportToken[];
  selectedTokens: Set<string>;
  source: 'variables' | 'styles' | 'json' | 'css' | 'tailwind' | 'tokens-studio' | null;
  targetSet: string;
  progress: ProgressSetters;
  setLastImport: (entries: { entries: { setName: string; paths: string[] }[] } | null) => void;
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

/** Handles the JSON / CSS / Tailwind / Styles import workflows (single-set, flat token list). */
export function useTokensImport({
  serverUrl,
  tokens,
  selectedTokens,
  source,
  targetSet,
  progress,
  setLastImport,
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
}: UseTokensImportParams) {
  const executeImport = useCallback(
    async (strategy: 'skip' | 'overwrite', excludePaths?: Set<string>, mergePaths?: Set<string>) => {
      progress.setImporting(true);
      clearConflictState();

      try {
        const tokensToImport = tokens.filter(
          t => selectedTokens.has(t.path) && !excludePaths?.has(t.path),
        );
        progress.setImportProgress({ done: 0, total: tokensToImport.length });

        try {
          await apiFetch(`${serverUrl}/api/sets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: targetSet }),
          });
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409)) {
            throw new Error(
              `Failed to create set "${targetSet}": ${err instanceof Error ? err.message : 'Unknown error'}`,
            );
          }
        }

        const buildTok = (t: ImportToken) => {
          const tok: Record<string, unknown> = { path: t.path, $type: t.$type, $value: t.$value };
          if (source)
            tok.$extensions = {
              tokenmanager: {
                source:
                  source === 'variables'
                    ? 'figma-variables'
                    : source === 'styles'
                      ? 'figma-styles'
                      : source,
              },
            };
          return tok;
        };

        const mergeTokens = mergePaths ? tokensToImport.filter(t => mergePaths.has(t.path)) : [];
        const overwriteTokens = mergePaths
          ? tokensToImport.filter(t => !mergePaths.has(t.path))
          : tokensToImport;

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

        progress.setImportProgress({ done: tokensToImport.length, total: tokensToImport.length });

        parent.postMessage(
          {
            pluginMessage: {
              type: 'notify',
              message: `Imported ${imported} tokens to "${targetSet}"`,
            },
          },
          '*',
        );
        onImported();
        onImportComplete(targetSet);
        onResetExistingPathsCache();
        setExistingTokenMap(null);
        if (imported > 0) {
          setLastImport({ entries: [{ setName: targetSet, paths: tokensToImport.map(t => t.path) }] });
        }
        onResetAfterImport();
        progress.setSuccessMessage(
          `Imported ${imported} token${imported !== 1 ? 's' : ''} to "${targetSet}"`,
        );
      } catch (err) {
        return { error: getErrorMessage(err) };
      } finally {
        progress.setImporting(false);
        progress.setImportProgress(null);
      }
      return null;
    },
    [
      tokens,
      selectedTokens,
      serverUrl,
      targetSet,
      source,
      progress,
      setLastImport,
      clearConflictState,
      onImported,
      onImportComplete,
      onResetAfterImport,
      onResetExistingPathsCache,
      setExistingTokenMap,
    ],
  );

  const handleImportStyles = useCallback(async () => {
    if (selectedTokens.size === 0) return null;
    setCheckingConflicts(true);
    const checkingForSet = targetSet;

    try {
      let flat = new Map<string, unknown>();
      try {
        const data = await apiFetch<{ tokens?: Record<string, unknown> }>(
          `${serverUrl}/api/tokens/${encodeURIComponent(checkingForSet)}`,
        );
        flat = flattenTokenGroup(data.tokens || {});
      } catch (fetchErr) {
        if (!(fetchErr instanceof ApiError && fetchErr.status === 404)) {
          throw fetchErr;
        }
      }

      const existingKeys = new Set(flat.keys());
      const tokensToImport = tokens.filter(t => selectedTokens.has(t.path));
      const conflicts = tokensToImport
        .filter(t => existingKeys.has(t.path))
        .map(t => t.path);

      if (conflicts.length > 0) {
        setConflictPaths(conflicts);
        const existingVals = new Map<string, { $type: string; $value: unknown }>();
        for (const p of conflicts) {
          const tok = flat.get(p);
          if (tok)
            existingVals.set(p, {
              $type: (tok as any).$type ?? 'unknown',
              $value: (tok as any).$value,
            });
        }
        setConflictExistingValues(existingVals);
        const decisions = new Map<string, 'accept' | 'reject'>();
        for (const p of conflicts) decisions.set(p, 'accept');
        setConflictDecisions(decisions as Map<string, 'accept' | 'merge' | 'reject'>);
        return null;
      }

      return await executeImport('overwrite');
    } catch (err) {
      return { error: getErrorMessage(err) };
    } finally {
      setCheckingConflicts(false);
    }
  }, [
    selectedTokens,
    targetSet,
    serverUrl,
    tokens,
    executeImport,
    setConflictPaths,
    setConflictExistingValues,
    setConflictDecisions,
    setCheckingConflicts,
  ]);

  return {
    executeImport,
    handleImportStyles,
  };
}
