import { useState, useCallback, useMemo, useRef } from 'react';
import type { TokenNode } from './useTokens';
import type { UndoSlot } from './useUndo';
import { getErrorMessage } from '../shared/utils';
import { apiFetch, ApiError } from '../shared/apiFetch';

/** Default timeout for bulk-rename requests (ms). */
const BULK_RENAME_TIMEOUT_MS = 30_000;

export type FindReplaceScope = 'active' | 'all';

export interface UseFindReplaceParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  tokens: TokenNode[];
  allSets?: string[];
  perSetFlat?: Record<string, Record<string, { $type?: string; $value?: unknown }>>;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
}

/** Flatten token tree to an array of { path, $type, $value, setName }. */
function flattenTokenPaths(nodes: TokenNode[], setName: string): Array<{ path: string; $type?: string; $value: unknown; setName: string }> {
  const result: Array<{ path: string; $type?: string; $value: unknown; setName: string }> = [];
  const walk = (list: TokenNode[]) => {
    for (const node of list) {
      if (!node.isGroup) {
        result.push({ path: node.path, $type: node.$type, $value: node.$value, setName });
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

/** Compute renames for a flat list of paths within a single set. */
function computeRenamesForPaths(
  paths: string[],
  find: string,
  replace: string,
  pattern: RegExp | null,
): Array<{ oldPath: string; newPath: string; conflict: boolean; setName: string }> {
  const existingPathSet = new Set(paths);
  const renames: Array<{ oldPath: string; newPath: string; conflict: boolean; setName: string }> = [];
  const willBeFreed = new Set<string>();
  for (const oldPath of paths) {
    const newPath = pattern ? oldPath.replace(pattern, replace) : oldPath.split(find).join(replace);
    if (newPath !== oldPath) {
      willBeFreed.add(oldPath);
      renames.push({ oldPath, newPath, conflict: false, setName: '' });
    }
  }
  for (const r of renames) {
    if (existingPathSet.has(r.newPath) && !willBeFreed.has(r.newPath)) {
      r.conflict = true;
    }
  }
  return renames;
}

export function useFindReplace({
  connected,
  serverUrl,
  setName,
  tokens,
  allSets,
  perSetFlat,
  onRefresh,
  onPushUndo,
}: UseFindReplaceParams) {
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [frFind, setFrFind] = useState('');
  const [frReplace, setFrReplace] = useState('');
  const [frIsRegex, setFrIsRegex] = useState(false);
  const [frScope, setFrScope] = useState<FindReplaceScope>('active');
  const [frError, setFrError] = useState('');
  const [frBusy, setFrBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const frRegexError = useMemo(() => {
    if (!frIsRegex || !frFind) return null;
    try { new RegExp(frFind); return null; }
    catch (e) { return e instanceof Error ? e.message : 'Invalid regular expression'; }
  }, [frFind, frIsRegex]);

  const frPreview = useMemo(() => {
    if (!frFind) return [];
    if (frIsRegex && frRegexError) return [];
    let pattern: RegExp | null = null;
    if (frIsRegex) {
      try { pattern = new RegExp(frFind, 'g'); } catch (e) { console.debug('[useFindReplace] regex compile failed (expected during typing):', e); return []; }
    }

    if (frScope === 'active') {
      const currentSetPaths = flattenTokenPaths(tokens, setName).map(t => t.path);
      return computeRenamesForPaths(currentSetPaths, frFind, frReplace, pattern).map(r => ({ ...r, setName }));
    }

    // All sets mode: compute per-set renames
    const allRenames: Array<{ oldPath: string; newPath: string; conflict: boolean; setName: string }> = [];
    const setsToScan = allSets ?? (perSetFlat ? Object.keys(perSetFlat) : [setName]);
    for (const sn of setsToScan) {
      const flatMap = sn === setName
        ? Object.fromEntries(flattenTokenPaths(tokens, setName).map(t => [t.path, t]))
        : perSetFlat?.[sn];
      if (!flatMap) continue;
      const paths = Object.keys(flatMap);
      const setRenames = computeRenamesForPaths(paths, frFind, frReplace, pattern);
      for (const r of setRenames) {
        allRenames.push({ ...r, setName: sn });
      }
      // Reset pattern lastIndex for stateful regex
      if (pattern) pattern.lastIndex = 0;
    }
    return allRenames;
  }, [frFind, frReplace, frIsRegex, frRegexError, frScope, tokens, setName, allSets, perSetFlat]);

  const cancelFindReplace = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const handleFindReplace = useCallback(async () => {
    if (!frFind || frBusy) return;
    setFrError('');
    setFrBusy(true);
    const capturedFind = frFind;
    const capturedReplace = frReplace;
    const capturedIsRegex = frIsRegex;
    const capturedScope = frScope;

    const ac = new AbortController();
    abortRef.current = ac;
    let didTimeout = false;
    const timer = setTimeout(() => { didTimeout = true; ac.abort(); }, BULK_RENAME_TIMEOUT_MS);

    try {
      if (capturedScope === 'active') {
        const renamedCount = frPreview.filter(r => !r.conflict).length;
        const data = await apiFetch<{ ok: true; renamed?: number; skipped?: string[]; aliasesUpdated?: number }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/bulk-rename`, {
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
          const capturedSet = setName;
          const capturedUrl = serverUrl;
          onPushUndo({
            description: `Rename ${renamedCount} token${renamedCount !== 1 ? 's' : ''}: "${capturedFind}" → "${capturedReplace}"`,
            restore: async () => {
              await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/bulk-rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ find: capturedReplace, replace: capturedFind, isRegex: false }),
                signal: AbortSignal.timeout(BULK_RENAME_TIMEOUT_MS),
              });
              onRefresh();
            },
            redo: async () => {
              await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/bulk-rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ find: capturedFind, replace: capturedReplace, isRegex: false }),
                signal: AbortSignal.timeout(BULK_RENAME_TIMEOUT_MS),
              });
              onRefresh();
            },
          });
        }
      } else {
        // All sets mode: call bulk-rename per set that has matches
        const setNames = [...new Set(frPreview.filter(r => !r.conflict).map(r => r.setName))];
        if (setNames.length === 0) {
          const skippedCount = frPreview.filter(r => r.conflict).length;
          setFrError(skippedCount > 0
            ? `All ${skippedCount} match${skippedCount === 1 ? '' : 'es'} conflict with existing tokens and were skipped`
            : 'No token paths matched the search pattern');
          return;
        }

        let totalRenamed = 0;
        const renamedBySet: Record<string, number> = {};
        for (const sn of setNames) {
          if (ac.signal.aborted) break;
          const data = await apiFetch<{ ok: true; renamed?: number; skipped?: string[] }>(`${serverUrl}/api/tokens/${encodeURIComponent(sn)}/bulk-rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ find: capturedFind, replace: capturedReplace, isRegex: capturedIsRegex }),
            signal: ac.signal,
          });
          const count = data.renamed ?? 0;
          totalRenamed += count;
          if (count > 0) renamedBySet[sn] = count;
        }

        if (totalRenamed === 0) {
          setFrError('No token paths matched the search pattern in any set');
          return;
        }

        if (onPushUndo && !capturedIsRegex && capturedReplace !== '') {
          const capturedUrl = serverUrl;
          const capturedSets = Object.keys(renamedBySet);
          const capturedTotal = totalRenamed;
          onPushUndo({
            description: `Rename ${capturedTotal} token${capturedTotal !== 1 ? 's' : ''} across ${capturedSets.length} set${capturedSets.length !== 1 ? 's' : ''}: "${capturedFind}" → "${capturedReplace}"`,
            restore: async () => {
              for (const sn of capturedSets) {
                await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(sn)}/bulk-rename`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ find: capturedReplace, replace: capturedFind, isRegex: false }),
                  signal: AbortSignal.timeout(BULK_RENAME_TIMEOUT_MS),
                });
              }
              onRefresh();
            },
            redo: async () => {
              for (const sn of capturedSets) {
                await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(sn)}/bulk-rename`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ find: capturedFind, replace: capturedReplace, isRegex: false }),
                  signal: AbortSignal.timeout(BULK_RENAME_TIMEOUT_MS),
                });
              }
              onRefresh();
            },
          });
        }
      }

      setShowFindReplace(false);
      setFrFind('');
      setFrReplace('');
      setFrIsRegex(false);
      onRefresh();
    } catch (err) {
      if (ac.signal.aborted) {
        setFrError(didTimeout ? `Bulk rename timed out after ${BULK_RENAME_TIMEOUT_MS / 1000}s — try a narrower search pattern` : 'Bulk rename was cancelled');
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
  }, [frFind, frReplace, frIsRegex, frScope, frBusy, frPreview, serverUrl, setName, onRefresh, onPushUndo]);

  const frConflictCount = useMemo(() => frPreview.filter(r => r.conflict).length, [frPreview]);
  const frRenameCount = useMemo(() => frPreview.filter(r => !r.conflict).length, [frPreview]);

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
    frError,
    setFrError,
    frBusy,
    frRegexError,
    frPreview,
    frConflictCount,
    frRenameCount,
    handleFindReplace,
    cancelFindReplace,
  };
}
