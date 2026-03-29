import { useState, useCallback, useMemo, useRef } from 'react';
import type { TokenNode } from './useTokens';
import type { UndoSlot } from './useUndo';
import { getErrorMessage } from '../shared/utils';
import { apiFetch, ApiError } from '../shared/apiFetch';

/** Default timeout for bulk-rename requests (ms). */
const BULK_RENAME_TIMEOUT_MS = 30_000;

export interface UseFindReplaceParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  tokens: TokenNode[];
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

export function useFindReplace({
  connected,
  serverUrl,
  setName,
  tokens,
  onRefresh,
  onPushUndo,
}: UseFindReplaceParams) {
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [frFind, setFrFind] = useState('');
  const [frReplace, setFrReplace] = useState('');
  const [frIsRegex, setFrIsRegex] = useState(false);
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
    const currentSetPaths = flattenTokenPaths(tokens, setName).map(t => t.path);
    const existingPathSet = new Set(currentSetPaths);
    let pattern: RegExp | null = null;
    if (frIsRegex) {
      try { pattern = new RegExp(frFind, 'g'); } catch (e) { console.debug('[useFindReplace] regex compile failed (expected during typing):', e); return []; }
    }
    const renames: Array<{ oldPath: string; newPath: string; conflict: boolean }> = [];
    const willBeFreed = new Set<string>();
    for (const oldPath of currentSetPaths) {
      const newPath = pattern ? oldPath.replace(pattern, frReplace) : oldPath.split(frFind).join(frReplace);
      if (newPath !== oldPath) {
        willBeFreed.add(oldPath);
        renames.push({ oldPath, newPath, conflict: false });
      }
    }
    for (const r of renames) {
      if (existingPathSet.has(r.newPath) && !willBeFreed.has(r.newPath)) {
        r.conflict = true;
      }
    }
    return renames;
  }, [frFind, frReplace, frIsRegex, frRegexError, tokens, setName]);

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
    const renamedCount = frPreview.filter(r => !r.conflict).length;

    const ac = new AbortController();
    abortRef.current = ac;
    let didTimeout = false;
    const timer = setTimeout(() => { didTimeout = true; ac.abort(); }, BULK_RENAME_TIMEOUT_MS);

    try {
      const data = await apiFetch<{ renamed?: number; skipped?: string[]; aliasesUpdated?: number }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/bulk-rename`, {
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
  }, [frFind, frReplace, frIsRegex, frBusy, frPreview, serverUrl, setName, onRefresh, onPushUndo]);

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
