import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { TokenNode } from './useTokens';
import type { UndoSlot } from './useUndo';
import { getErrorMessage } from '../shared/utils';
import { apiFetch, ApiError, createTimeoutSignal } from '../shared/apiFetch';
import type {
  FindReplaceScope,
  FindReplaceTarget,
} from '../shared/tokenListModalTypes';

/** Default timeout for bulk-rename requests (ms). */
const BULK_RENAME_TIMEOUT_MS = 30_000;

export type FindReplaceTypeFilter = 'all' | string;

export interface UseFindReplaceParams {
  connected: boolean;
  serverUrl: string;
  collectionId: string;
  tokens: TokenNode[];
  allCollectionIds?: string[];
  perCollectionFlat?: Record<string, Record<string, { $type?: string; $value?: unknown }>>;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
}

/** Flatten token tree to an array of { path, $type, $value, collectionId }. */
function flattenTokenPaths(nodes: TokenNode[], collectionId: string): Array<{ path: string; $type?: string; $value: unknown; collectionId: string }> {
  const result: Array<{ path: string; $type?: string; $value: unknown; collectionId: string }> = [];
  const walk = (list: TokenNode[]) => {
    for (const node of list) {
      if (!node.isGroup) {
        result.push({ path: node.path, $type: node.$type, $value: node.$value, collectionId });
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

/** Compute renames for a flat list of paths within a single collection. */
function computeRenamesForPaths(
  paths: string[],
  find: string,
  replace: string,
  pattern: RegExp | null,
): Array<{ oldPath: string; newPath: string; conflict: boolean; collectionId: string }> {
  const existingPathSet = new Set(paths);
  const renames: Array<{ oldPath: string; newPath: string; conflict: boolean; collectionId: string }> = [];
  const willBeFreed = new Set<string>();
  for (const oldPath of paths) {
    const newPath = pattern ? oldPath.replace(pattern, replace) : oldPath.split(find).join(replace);
    if (newPath !== oldPath) {
      willBeFreed.add(oldPath);
      renames.push({ oldPath, newPath, conflict: false, collectionId: '' });
    }
  }
  for (const r of renames) {
    if (existingPathSet.has(r.newPath) && !willBeFreed.has(r.newPath)) {
      r.conflict = true;
    }
  }
  return renames;
}

/** Serialize a token $value to a string for find/replace matching. */
function serializeValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v === null || v === undefined) return '';
  return JSON.stringify(v);
}

/** Parse a replaced string back to the appropriate type based on the original value type. */
function deserializeValue(original: unknown, replaced: string): unknown {
  if (typeof original === 'string') return replaced;
  if (typeof original === 'number') {
    const n = parseFloat(replaced);
    return isNaN(n) ? replaced : n;
  }
  if (original !== null && typeof original === 'object') {
    try { return JSON.parse(replaced); } catch { return replaced; }
  }
  return replaced;
}

/**
 * Check if a token $value contains an alias reference to any path in the given collection.
 * Handles string values, composite object values, and array values recursively.
 */
function valueHasAliasToAny(value: unknown, pathSet: Set<string>): boolean {
  if (typeof value === 'string' && value.includes('{')) {
    const refRegex = /\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = refRegex.exec(value)) !== null) {
      if (pathSet.has(m[1])) return true;
    }
  } else if (Array.isArray(value)) {
    return value.some(v => valueHasAliasToAny(v, pathSet));
  } else if (typeof value === 'object' && value !== null) {
    return Object.values(value as Record<string, unknown>).some(v => valueHasAliasToAny(v, pathSet));
  }
  return false;
}

/** Compute value replacements for a list of tokens. */
function computeValueReplacements(
  tokens: Array<{ path: string; $value: unknown; collectionId: string }>,
  find: string,
  replace: string,
  pattern: RegExp | null,
): Array<{ path: string; collectionId: string; oldValue: string; newValue: string; originalValue: unknown }> {
  const results: Array<{ path: string; collectionId: string; oldValue: string; newValue: string; originalValue: unknown }> = [];
  for (const t of tokens) {
    const serialized = serializeValue(t.$value);
    if (!serialized) continue;
    const replaced = pattern ? serialized.replace(pattern, replace) : serialized.split(find).join(replace);
    if (replaced !== serialized) {
      results.push({ path: t.path, collectionId: t.collectionId, oldValue: serialized, newValue: replaced, originalValue: t.$value });
    }
  }
  return results;
}

export function useFindReplace({
  connected,
  serverUrl,
  collectionId,
  tokens,
  allCollectionIds,
  perCollectionFlat,
  onRefresh,
  onPushUndo,
}: UseFindReplaceParams) {
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [frFind, setFrFind] = useState('');
  const [frReplace, setFrReplace] = useState('');
  const [frIsRegex, setFrIsRegex] = useState(false);
  const [frScope, setFrScope] = useState<FindReplaceScope>('active');
  const [frTarget, setFrTarget] = useState<FindReplaceTarget>('names');
  const [frTypeFilter, setFrTypeFilter] = useState<FindReplaceTypeFilter>('all');
  const [frError, setFrError] = useState('');
  const [frBusy, setFrBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (connected) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setFrBusy(false);
  }, [connected]);

  const frRegexError = useMemo(() => {
    if (!frIsRegex || !frFind) return null;
    try { new RegExp(frFind); return null; }
    catch (e) { return e instanceof Error ? e.message : 'Invalid regular expression'; }
  }, [frFind, frIsRegex]);

  /** Sorted unique token types available across all relevant tokens. */
  const frAvailableTypes = useMemo(() => {
    const typeSet = new Set<string>();
    const addFromNodes = (nodes: TokenNode[]) => {
      const walk = (list: TokenNode[]) => {
        for (const n of list) {
          if (!n.isGroup && n.$type) typeSet.add(n.$type);
          if (n.children) walk(n.children);
        }
      };
      walk(nodes);
    };
    addFromNodes(tokens);
    if (frScope === 'all' && perCollectionFlat) {
      for (const [sn, flatMap] of Object.entries(perCollectionFlat)) {
        if (sn === collectionId) continue;
        for (const entry of Object.values(flatMap)) {
          if (entry.$type) typeSet.add(entry.$type);
        }
      }
    }
    return Array.from(typeSet).sort();
  }, [tokens, collectionId, frScope, perCollectionFlat]);

  const frPreview = useMemo(() => {
    if (frTarget !== 'names') return [];
    if (!frFind) return [];
    if (frIsRegex && frRegexError) return [];
    let pattern: RegExp | null = null;
    if (frIsRegex) {
      try { pattern = new RegExp(frFind, 'g'); } catch (e) { console.debug('[useFindReplace] regex compile failed (expected during typing):', e); return []; }
    }

    if (frScope === 'active') {
      const currentSetTokens = flattenTokenPaths(tokens, collectionId);
      const filtered = frTypeFilter === 'all' ? currentSetTokens : currentSetTokens.filter(t => t.$type === frTypeFilter);
      const currentSetPaths = filtered.map(t => t.path);
      return computeRenamesForPaths(currentSetPaths, frFind, frReplace, pattern).map(r => ({ ...r, collectionId }));
    }

    // All collections mode: compute per-collection renames.
    const allRenames: Array<{ oldPath: string; newPath: string; conflict: boolean; collectionId: string }> = [];
    const collectionsToScan = allCollectionIds ?? (perCollectionFlat ? Object.keys(perCollectionFlat) : [collectionId]);
    for (const currentCollectionId of collectionsToScan) {
      let paths: string[];
      if (currentCollectionId === collectionId) {
        const currentCollectionTokens = flattenTokenPaths(tokens, collectionId);
        const filtered = frTypeFilter === 'all' ? currentCollectionTokens : currentCollectionTokens.filter(t => t.$type === frTypeFilter);
        paths = filtered.map(t => t.path);
      } else {
        const flatMap = perCollectionFlat?.[currentCollectionId];
        if (!flatMap) continue;
        paths = frTypeFilter === 'all'
          ? Object.keys(flatMap)
          : Object.entries(flatMap).filter(([, e]) => e.$type === frTypeFilter).map(([p]) => p);
      }
      const collectionRenames = computeRenamesForPaths(paths, frFind, frReplace, pattern);
      for (const rename of collectionRenames) {
        allRenames.push({ ...rename, collectionId: currentCollectionId });
      }
      // Reset pattern lastIndex for stateful regex
      if (pattern) pattern.lastIndex = 0;
    }
    return allRenames;
  }, [frFind, frReplace, frIsRegex, frRegexError, frScope, frTarget, frTypeFilter, tokens, collectionId, allCollectionIds, perCollectionFlat]);

  const frValuePreview = useMemo(() => {
    if (frTarget !== 'values') return [];
    if (!frFind) return [];
    if (frIsRegex && frRegexError) return [];
    let pattern: RegExp | null = null;
    if (frIsRegex) {
      try { pattern = new RegExp(frFind, 'g'); } catch { return []; }
    }

    if (frScope === 'active') {
      const tokenList = flattenTokenPaths(tokens, collectionId);
      const filtered = frTypeFilter === 'all' ? tokenList : tokenList.filter(t => t.$type === frTypeFilter);
      return computeValueReplacements(filtered, frFind, frReplace, pattern);
    }

    // All collections mode.
    const allResults: Array<{ path: string; collectionId: string; oldValue: string; newValue: string; originalValue: unknown }> = [];
    const collectionsToScan = allCollectionIds ?? (perCollectionFlat ? Object.keys(perCollectionFlat) : [collectionId]);
    for (const currentCollectionId of collectionsToScan) {
      let tokenList: Array<{ path: string; $type?: string; $value: unknown; collectionId: string }>;
      if (currentCollectionId === collectionId) {
        tokenList = flattenTokenPaths(tokens, collectionId);
      } else {
        const flatMap = perCollectionFlat?.[currentCollectionId];
        if (!flatMap) continue;
        tokenList = Object.entries(flatMap).map(([path, entry]) => ({ path, $type: entry.$type, $value: entry.$value, collectionId: currentCollectionId }));
      }
      const filtered = frTypeFilter === 'all' ? tokenList : tokenList.filter(t => t.$type === frTypeFilter);
      const results = computeValueReplacements(filtered, frFind, frReplace, pattern);
      for (const result of results) allResults.push({ ...result, collectionId: currentCollectionId });
      if (pattern) pattern.lastIndex = 0;
    }
    return allResults;
  }, [frFind, frReplace, frIsRegex, frRegexError, frScope, frTarget, frTypeFilter, tokens, collectionId, allCollectionIds, perCollectionFlat]);

  /**
   * Tokens (in any loaded collection) whose $value contains an alias reference to a
   * path that is being renamed. These will be silently updated by the server's
   * updateBulkAliasRefs — the banner informs the user of this side-effect.
   */
  const frAliasImpact = useMemo(() => {
    if (frTarget !== 'names') return { tokenCount: 0 };
    const nonConflictRenames = frPreview.filter(r => !r.conflict);
    if (nonConflictRenames.length === 0) return { tokenCount: 0 };

    // Build a set of the old paths being renamed
    const renamedPaths = new Set(nonConflictRenames.map(r => r.oldPath));
    // Build a set of (collectionId:tokenPath) keys for tokens being renamed — skip self-references
    const renamedKeys = new Set(nonConflictRenames.map(r => `${r.collectionId}:${r.oldPath}`));

    let tokenCount = 0;
    const collectionsToScan = allCollectionIds ?? (perCollectionFlat ? Object.keys(perCollectionFlat) : [collectionId]);
    const currentCollectionFlat = Object.fromEntries(flattenTokenPaths(tokens, collectionId).map(t => [t.path, t]));

    for (const currentCollectionId of collectionsToScan) {
      const flatMap: Record<string, { $value?: unknown }> = currentCollectionId === collectionId
        ? currentCollectionFlat
        : (perCollectionFlat?.[currentCollectionId] ?? {});
      for (const [tokenPath, entry] of Object.entries(flatMap)) {
        if (renamedKeys.has(`${currentCollectionId}:${tokenPath}`)) continue; // skip the renamed tokens themselves
        if (valueHasAliasToAny(entry.$value, renamedPaths)) {
          tokenCount++;
        }
      }
    }

    return { tokenCount };
  }, [frTarget, frPreview, tokens, collectionId, allCollectionIds, perCollectionFlat]);

  const cancelFindReplace = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const handleFindReplace = useCallback(async () => {
    if (!frFind || frBusy) return;
    if (!connected || !serverUrl) {
      setFrError('Connect to the local server before running find and replace.');
      return;
    }
    setFrError('');
    setFrBusy(true);
    const capturedFind = frFind;
    const capturedReplace = frReplace;
    const capturedIsRegex = frIsRegex;
    const capturedScope = frScope;
    const capturedTarget = frTarget;

    const ac = new AbortController();
    abortRef.current = ac;
    let didTimeout = false;
    const timer = setTimeout(() => { didTimeout = true; ac.abort(); }, BULK_RENAME_TIMEOUT_MS);

    try {
      if (capturedTarget === 'names') {
        if (capturedScope === 'active') {
          const renamedCount = frPreview.filter(r => !r.conflict).length;
          const data = await apiFetch<{ ok: true; renamed?: number; skipped?: string[]; aliasesUpdated?: number }>(`${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/bulk-rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ find: capturedFind, replace: capturedReplace, isRegex: capturedIsRegex }),
            signal: ac.signal,
          });
          if ((data.renamed ?? 0) === 0) {
            const skippedCount = data.skipped?.length ?? 0;
            setFrError(skippedCount > 0
              ? `All ${skippedCount} match${skippedCount === 1 ? '' : 'es'} conflict with existing tokens and were skipped`
              : 'No token paths matched the search pattern');
            return;
          }
          if (onPushUndo && renamedCount > 0 && !capturedIsRegex && capturedReplace !== '') {
            const capturedCollectionId = collectionId;
            const capturedUrl = serverUrl;
            onPushUndo({
              description: `Rename ${renamedCount} token${renamedCount !== 1 ? 's' : ''}: "${capturedFind}" → "${capturedReplace}"`,
              restore: async () => {
                await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedCollectionId)}/bulk-rename`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ find: capturedReplace, replace: capturedFind, isRegex: false }),
                  signal: createTimeoutSignal(BULK_RENAME_TIMEOUT_MS),
                });
                onRefresh();
              },
              redo: async () => {
                await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedCollectionId)}/bulk-rename`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ find: capturedFind, replace: capturedReplace, isRegex: false }),
                  signal: createTimeoutSignal(BULK_RENAME_TIMEOUT_MS),
                });
                onRefresh();
              },
            });
          }
        } else {
          const affectedCollectionIds = [...new Set(frPreview.filter(r => !r.conflict).map(r => r.collectionId))];
          if (affectedCollectionIds.length === 0) {
            const skippedCount = frPreview.filter(r => r.conflict).length;
            setFrError(skippedCount > 0
              ? `All ${skippedCount} match${skippedCount === 1 ? '' : 'es'} conflict with existing tokens and were skipped`
              : 'No token paths matched the search pattern');
            return;
          }

          let totalRenamed = 0;
          const renamedByCollection: Record<string, number> = {};
          let renameAborted = false;
          for (const currentCollectionId of affectedCollectionIds) {
            if (ac.signal.aborted) { renameAborted = true; break; }
            try {
              const data = await apiFetch<{ ok: true; renamed?: number; skipped?: string[] }>(`${serverUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}/bulk-rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ find: capturedFind, replace: capturedReplace, isRegex: capturedIsRegex }),
                signal: ac.signal,
              });
              const count = data.renamed ?? 0;
              totalRenamed += count;
              if (count > 0) renamedByCollection[currentCollectionId] = count;
            } catch (err) {
              if (ac.signal.aborted) { renameAborted = true; break; }
              throw err;
            }
          }

          if (totalRenamed === 0) {
            setFrError(renameAborted
              ? (didTimeout
                  ? `Operation timed out after ${BULK_RENAME_TIMEOUT_MS / 1000}s — no tokens were renamed`
                  : 'Operation was cancelled — no tokens were renamed')
              : 'No token paths matched the search pattern in any collection');
            return;
          }

          if (onPushUndo && !capturedIsRegex && capturedReplace !== '') {
            const capturedUrl = serverUrl;
            const capturedCollections = Object.keys(renamedByCollection);
            const capturedTotal = totalRenamed;
            onPushUndo({
              description: `Rename ${capturedTotal} token${capturedTotal !== 1 ? 's' : ''} across ${capturedCollections.length} collection${capturedCollections.length !== 1 ? 's' : ''}: "${capturedFind}" → "${capturedReplace}"`,
              restore: async () => {
                try {
                  for (const currentCollectionId of capturedCollections) {
                    await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}/bulk-rename`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ find: capturedReplace, replace: capturedFind, isRegex: false }),
                      signal: createTimeoutSignal(BULK_RENAME_TIMEOUT_MS),
                    });
                  }
                  onRefresh();
                } catch (err) {
                  console.warn('[useFindReplace] undo bulk rename failed:', err);
                }
              },
              redo: async () => {
                try {
                  for (const currentCollectionId of capturedCollections) {
                    await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}/bulk-rename`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ find: capturedFind, replace: capturedReplace, isRegex: false }),
                      signal: createTimeoutSignal(BULK_RENAME_TIMEOUT_MS),
                    });
                  }
                  onRefresh();
                } catch (err) {
                  console.warn('[useFindReplace] redo bulk rename failed:', err);
                }
              },
            });
          }

          if (renameAborted) {
            const completedCount = Object.keys(renamedByCollection).length;
            setFrError(didTimeout
              ? `Timed out — renamed ${totalRenamed} token${totalRenamed !== 1 ? 's' : ''} in ${completedCount} of ${affectedCollectionIds.length} collection${affectedCollectionIds.length !== 1 ? 's' : ''}`
              : `Cancelled — renamed ${totalRenamed} token${totalRenamed !== 1 ? 's' : ''} in ${completedCount} of ${affectedCollectionIds.length} collection${affectedCollectionIds.length !== 1 ? 's' : ''}`);
            onRefresh();
            return;
          }
        }
      } else {
        const matchesByCollection = new Map<string, Array<{ path: string; oldValue: string; newValue: string; originalValue: unknown }>>();
        for (const item of frValuePreview) {
          if (!matchesByCollection.has(item.collectionId)) matchesByCollection.set(item.collectionId, []);
          matchesByCollection.get(item.collectionId)!.push(item);
        }

        if (matchesByCollection.size === 0) {
          setFrError('No token values matched the search pattern');
          return;
        }

        let totalUpdated = 0;
        const updatedByCollection: Record<string, Array<{ path: string; oldValue: string; newValue: string; originalValue: unknown }>> = {};
        let valuesAborted = false;

        for (const [currentCollectionId, matches] of matchesByCollection) {
          if (ac.signal.aborted) { valuesAborted = true; break; }
          try {
            const patches = matches.map(m => ({
              path: m.path,
              patch: { $value: deserializeValue(m.originalValue, m.newValue) },
            }));
            await apiFetch<{ ok: true; updated: number }>(`${serverUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}/batch-update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ patches }),
              signal: ac.signal,
            });
            totalUpdated += matches.length;
            updatedByCollection[currentCollectionId] = matches;
          } catch (err) {
            if (ac.signal.aborted) { valuesAborted = true; break; }
            throw err;
          }
        }

        if (totalUpdated === 0) {
          setFrError(valuesAborted
            ? (didTimeout
                ? `Operation timed out after ${BULK_RENAME_TIMEOUT_MS / 1000}s — no values were updated`
                : 'Operation was cancelled — no values were updated')
            : 'No token values were updated');
          return;
        }

        if (onPushUndo) {
          const capturedUrl = serverUrl;
          const capturedUpdatedByCollection = updatedByCollection;
          const capturedTotal = totalUpdated;
          const collectionCount = Object.keys(capturedUpdatedByCollection).length;
          onPushUndo({
            description: `Update ${capturedTotal} token value${capturedTotal !== 1 ? 's' : ''} across ${collectionCount} collection${collectionCount !== 1 ? 's' : ''}: "${capturedFind}" → "${capturedReplace}"`,
            restore: async () => {
              for (const [currentCollectionId, matches] of Object.entries(capturedUpdatedByCollection)) {
                const patches = matches.map(m => ({
                  path: m.path,
                  patch: { $value: m.originalValue },
                }));
                await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}/batch-update`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ patches }),
                  signal: createTimeoutSignal(BULK_RENAME_TIMEOUT_MS),
                });
              }
              onRefresh();
            },
            redo: async () => {
              for (const [currentCollectionId, matches] of Object.entries(capturedUpdatedByCollection)) {
                const patches = matches.map(m => ({
                  path: m.path,
                  patch: { $value: deserializeValue(m.originalValue, m.newValue) },
                }));
                await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}/batch-update`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ patches }),
                  signal: createTimeoutSignal(BULK_RENAME_TIMEOUT_MS),
                });
              }
              onRefresh();
            },
          });
        }

        if (valuesAborted) {
          const completedCount = Object.keys(updatedByCollection).length;
          const collectionTotal = matchesByCollection.size;
          setFrError(didTimeout
            ? `Timed out — updated ${totalUpdated} value${totalUpdated !== 1 ? 's' : ''} in ${completedCount} of ${collectionTotal} collection${collectionTotal !== 1 ? 's' : ''}`
            : `Cancelled — updated ${totalUpdated} value${totalUpdated !== 1 ? 's' : ''} in ${completedCount} of ${collectionTotal} collection${collectionTotal !== 1 ? 's' : ''}`);
          onRefresh();
          return;
        }
      }

      setShowFindReplace(false);
      setFrFind('');
      setFrReplace('');
      setFrIsRegex(false);
      setFrTypeFilter('all');
      onRefresh();
    } catch (err) {
      if (ac.signal.aborted) {
        setFrError(didTimeout ? `Operation timed out after ${BULK_RENAME_TIMEOUT_MS / 1000}s — try a narrower search pattern` : 'Operation was cancelled');
      } else if (err instanceof ApiError) {
        setFrError(err.message);
      } else {
        setFrError(getErrorMessage(err));
      }
    } finally {
      clearTimeout(timer);
      abortRef.current = null;
      setFrBusy(false);
    }
  }, [frFind, frReplace, frIsRegex, frScope, frTarget, frBusy, frPreview, frValuePreview, connected, serverUrl, collectionId, onRefresh, onPushUndo]);

  const frConflictCount = useMemo(() => frPreview.filter(r => r.conflict).length, [frPreview]);
  const frRenameCount = useMemo(() => frPreview.filter(r => !r.conflict).length, [frPreview]);
  const frValueCount = useMemo(() => frValuePreview.length, [frValuePreview]);

  return {
    showFindReplace,
    setShowFindReplace,
    frFind,
    setFrFind,
    frReplace,
    setFrReplace,
    frIsRegex,
    setFrIsRegex,
    frScope,
    setFrScope,
    frTarget,
    setFrTarget,
    frTypeFilter,
    setFrTypeFilter,
    frAvailableTypes,
    frError,
    setFrError,
    frBusy,
    frRegexError,
    frPreview,
    frValuePreview,
    frConflictCount,
    frRenameCount,
    frValueCount,
    frAliasImpact,
    handleFindReplace,
    cancelFindReplace,
  };
}
