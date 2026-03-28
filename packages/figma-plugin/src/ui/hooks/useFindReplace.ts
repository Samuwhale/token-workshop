import { useState, useCallback, useMemo } from 'react';
import type { TokenNode } from './useTokens';
import type { UndoSlot } from './useUndo';
import { getErrorMessage } from '../shared/utils';

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
      try { pattern = new RegExp(frFind, 'g'); } catch { return []; }
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

  const handleFindReplace = useCallback(async () => {
    if (!frFind || frBusy) return;
    setFrError('');
    setFrBusy(true);
    const capturedFind = frFind;
    const capturedReplace = frReplace;
    const capturedIsRegex = frIsRegex;
    const renamedCount = frPreview.filter(r => !r.conflict).length;
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/bulk-rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ find: capturedFind, replace: capturedReplace, isRegex: capturedIsRegex }),
      });
      const data = await res.json() as { renamed?: number; skipped?: string[]; aliasesUpdated?: number; error?: string };
      if (!res.ok) { setFrError(data.error ?? 'Rename failed'); return; }
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
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/bulk-rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ find: capturedReplace, replace: capturedFind, isRegex: false }),
            });
            onRefresh();
          },
          redo: async () => {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/bulk-rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ find: capturedFind, replace: capturedReplace, isRegex: false }),
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
      setFrError(getErrorMessage(err));
    } finally {
      setFrBusy(false);
    }
  }, [frFind, frReplace, frIsRegex, frBusy, frPreview, serverUrl, setName, onRefresh, onPushUndo]);

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
    handleFindReplace,
  };
}
