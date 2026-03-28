import { useState } from 'react';
import { flattenTokenGroup, type DTCGGroup } from '@tokenmanager/core';
import type { UndoSlot } from './useUndo';

interface UseSetMergeSplitParams {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  activeSet: string;
  setActiveSet: (set: string) => void;
  refreshTokens: () => void;
  setSuccessToast: (msg: string) => void;
  pushUndo: (slot: UndoSlot) => void;
  setTabMenuOpen: (v: string | null) => void;
}

function flattenTokensObj(obj: DTCGGroup): Record<string, any> {
  const flat: Record<string, any> = {};
  for (const [path, token] of flattenTokenGroup(obj)) {
    flat[path] = token;
  }
  return flat;
}

export function useSetMergeSplit({
  serverUrl, connected, sets,
  activeSet, setActiveSet, refreshTokens,
  setSuccessToast, pushUndo, setTabMenuOpen,
}: UseSetMergeSplitParams) {
  // Merge state
  const [mergingSet, setMergingSet] = useState<string | null>(null);
  const [mergeTargetSet, setMergeTargetSet] = useState<string>('');
  const [mergeConflicts, setMergeConflicts] = useState<Array<{ path: string; sourceValue: any; targetValue: any }>>([]);
  const [mergeResolutions, setMergeResolutions] = useState<Record<string, 'source' | 'target'>>({});
  const [mergeSrcFlat, setMergeSrcFlat] = useState<Record<string, any>>({});
  const [mergeChecked, setMergeChecked] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);

  // Split state
  const [splittingSet, setSplittingSet] = useState<string | null>(null);
  const [splitPreview, setSplitPreview] = useState<Array<{ key: string; newName: string; count: number }>>([]);
  const [splitDeleteOriginal, setSplitDeleteOriginal] = useState(false);
  const [splitLoading, setSplitLoading] = useState(false);

  // --- Merge ---

  const openMergeDialog = (setName: string) => {
    setTabMenuOpen(null);
    setMergingSet(setName);
    setMergeTargetSet(sets.find(s => s !== setName) || '');
    setMergeConflicts([]);
    setMergeResolutions({});
    setMergeSrcFlat({});
    setMergeChecked(false);
  };

  const closeMergeDialog = () => {
    setMergingSet(null);
    setMergeChecked(false);
  };

  const changeMergeTarget = (target: string) => {
    setMergeTargetSet(target);
    setMergeChecked(false);
    setMergeConflicts([]);
  };

  const handleCheckMergeConflicts = async () => {
    if (!mergingSet || !mergeTargetSet || !connected) return;
    setMergeLoading(true);
    try {
      const [srcRes, tgtRes] = await Promise.all([
        fetch(`${serverUrl}/api/sets/${encodeURIComponent(mergingSet)}`),
        fetch(`${serverUrl}/api/sets/${encodeURIComponent(mergeTargetSet)}`),
      ]);
      const srcData = await srcRes.json();
      const tgtData = await tgtRes.json();
      const srcFlat = flattenTokensObj(srcData.tokens || {});
      const tgtFlat = flattenTokensObj(tgtData.tokens || {});
      const conflicts: Array<{ path: string; sourceValue: any; targetValue: any }> = [];
      for (const [path, srcEntry] of Object.entries(srcFlat)) {
        if (tgtFlat[path]) {
          if (JSON.stringify(srcEntry.$value) !== JSON.stringify(tgtFlat[path].$value)) {
            conflicts.push({ path, sourceValue: srcEntry.$value, targetValue: tgtFlat[path].$value });
          }
        }
      }
      setMergeSrcFlat(srcFlat);
      setMergeConflicts(conflicts);
      const res: Record<string, 'source' | 'target'> = {};
      for (const c of conflicts) res[c.path] = 'target';
      setMergeResolutions(res);
      setMergeChecked(true);
    } catch {
      // ignore
    } finally {
      setMergeLoading(false);
    }
  };

  const handleConfirmMerge = async () => {
    if (!mergingSet || !mergeTargetSet || !connected) return;
    setMergeLoading(true);
    try {
      const tgtRes = await fetch(`${serverUrl}/api/sets/${encodeURIComponent(mergeTargetSet)}`);
      const tgtData = await tgtRes.json();
      const preMergeTokens: Record<string, unknown> = tgtData.tokens || {};
      const tgtFlat = flattenTokensObj(preMergeTokens);
      const writes: Promise<any>[] = [];
      for (const [path, srcEntry] of Object.entries(mergeSrcFlat)) {
        const conflict = mergeConflicts.find(c => c.path === path);
        if (conflict) {
          if (mergeResolutions[path] === 'source') {
            writes.push(fetch(`${serverUrl}/api/tokens/${encodeURIComponent(mergeTargetSet)}/${path.split('.').map(encodeURIComponent).join('/')}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ $type: srcEntry.$type, $value: srcEntry.$value, $description: srcEntry.$description }),
            }));
          }
        } else if (!tgtFlat[path]) {
          writes.push(fetch(`${serverUrl}/api/tokens/${encodeURIComponent(mergeTargetSet)}/${path.split('.').map(encodeURIComponent).join('/')}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $type: srcEntry.$type, $value: srcEntry.$value, $description: srcEntry.$description }),
          }));
        }
      }
      await Promise.all(writes);
      const srcName = mergingSet;
      const targetName = mergeTargetSet;
      setMergingSet(null);
      setMergeChecked(false);
      setActiveSet(mergeTargetSet);
      refreshTokens();
      setSuccessToast(`Merged "${srcName}" into "${targetName}"`);
      const url = serverUrl;
      pushUndo({
        description: `Merged "${srcName}" into "${targetName}"`,
        restore: async () => {
          await fetch(`${url}/api/tokens/${encodeURIComponent(targetName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(preMergeTokens),
          });
          refreshTokens();
        },
      });
    } catch {
      // ignore
    } finally {
      setMergeLoading(false);
    }
  };

  // --- Split ---

  const openSplitDialog = async (setName: string) => {
    setTabMenuOpen(null);
    if (!connected) return;
    try {
      const res = await fetch(`${serverUrl}/api/sets/${encodeURIComponent(setName)}`);
      const data = await res.json();
      const tokenRoot = data.tokens || {};
      const preview = Object.entries(tokenRoot)
        .filter(([k, v]) => !k.startsWith('$') && v && typeof v === 'object' && !('$value' in (v as object)))
        .map(([key, val]) => {
          const flat = flattenTokensObj(val as Record<string, any>);
          const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, '-');
          return { key, newName: `${setName}-${sanitized}`, count: Object.keys(flat).length };
        })
        .filter(p => p.count > 0);
      setSplittingSet(setName);
      setSplitPreview(preview);
      setSplitDeleteOriginal(false);
    } catch {
      // ignore
    }
  };

  const closeSplitDialog = () => {
    setSplittingSet(null);
  };

  const handleConfirmSplit = async () => {
    if (!splittingSet || !connected) return;
    setSplitLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/sets/${encodeURIComponent(splittingSet)}`);
      const data = await res.json();
      const tokenRoot = data.tokens || {};
      const originalTokens: Record<string, unknown> = tokenRoot;
      const createdNames: string[] = [];
      for (const { key, newName } of splitPreview) {
        if (sets.includes(newName)) continue;
        const groupTokens = tokenRoot[key];
        await fetch(`${serverUrl}/api/sets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName, tokens: groupTokens }),
        });
        createdNames.push(newName);
      }
      if (splitDeleteOriginal) {
        await fetch(`${serverUrl}/api/sets/${encodeURIComponent(splittingSet)}`, { method: 'DELETE' });
        const remaining = sets.filter(s => s !== splittingSet);
        if (activeSet === splittingSet) setActiveSet(remaining[0] ?? '');
      }
      const name = splittingSet;
      const count = splitPreview.length;
      const wasDeleted = splitDeleteOriginal;
      setSplittingSet(null);
      refreshTokens();
      setSuccessToast(`Split "${name}" into ${count} sets`);
      const url = serverUrl;
      pushUndo({
        description: `Split "${name}" into ${count} sets`,
        restore: async () => {
          await Promise.all(createdNames.map(n =>
            fetch(`${url}/api/sets/${encodeURIComponent(n)}`, { method: 'DELETE' })
          ));
          if (wasDeleted) {
            await fetch(`${url}/api/sets`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, tokens: originalTokens }),
            });
          }
          refreshTokens();
        },
      });
    } catch {
      // ignore
    } finally {
      setSplitLoading(false);
    }
  };

  return {
    // Merge
    mergingSet,
    mergeTargetSet,
    mergeConflicts,
    mergeResolutions,
    mergeChecked,
    mergeLoading,
    openMergeDialog,
    closeMergeDialog,
    changeMergeTarget,
    setMergeResolutions,
    handleCheckMergeConflicts,
    handleConfirmMerge,
    // Split
    splittingSet,
    splitPreview,
    splitDeleteOriginal,
    splitLoading,
    openSplitDialog,
    closeSplitDialog,
    setSplitDeleteOriginal,
    handleConfirmSplit,
  };
}
