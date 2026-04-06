import { useState, useCallback } from 'react';
import type { TokenNode } from './useTokens';
import type { TokenMapEntry } from '../../shared/types';
import type { PromoteRow } from '../components/tokenListTypes';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import { colorDeltaE } from '@tokenmanager/core';
import { valuesEqual } from '../components/tokenListHelpers';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { tokenPathToUrlSegment } from '../shared/utils';

export interface UseTokenPromotionParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  tokens: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  selectedPaths: Set<string>;
  onRefresh: () => void;
  onClearSelection: () => void;
  onError?: (msg: string) => void;
}

export function useTokenPromotion({
  connected: _connected,
  serverUrl,
  setName,
  tokens,
  allTokensFlat,
  selectedPaths,
  onRefresh,
  onClearSelection,
  onError,
}: UseTokenPromotionParams) {
  const [promoteRows, setPromoteRows] = useState<PromoteRow[] | null>(null);
  const [promoteBusy, setPromoteBusy] = useState(false);

  const handleOpenPromoteModal = useCallback((pathsOverride?: Set<string>) => {
    const flat: Array<{ path: string; $type: string; $value: unknown; setName: string }> = [];
    const walk = (nodes: TokenNode[]) => {
      for (const node of nodes) {
        if (!node.isGroup) {
          flat.push({ path: node.path, $type: node.$type ?? '', $value: node.$value, setName });
        }
        if (node.children) walk(node.children);
      }
    };
    walk(tokens);

    const sourcePaths = pathsOverride ?? selectedPaths;
    const selectedFlat = flat.filter(t => sourcePaths.has(t.path) && !isAlias(t.$value));
    const rows: PromoteRow[] = selectedFlat.map(t => {
      const candidates = Object.entries(allTokensFlat).filter(
        ([candidatePath, entry]) => candidatePath !== t.path && entry.$type === t.$type && !isAlias(entry.$value),
      );
      if (t.$type === 'color' && typeof t.$value === 'string') {
        let bestPath: string | null = null;
        let bestDelta = Infinity;
        for (const [candidatePath, entry] of candidates) {
          if (typeof entry.$value !== 'string') continue;
          const resolved = resolveTokenValue(entry.$value, entry.$type, allTokensFlat);
          const resolvedHex = typeof resolved.value === 'string' ? resolved.value : entry.$value as string;
          const d = colorDeltaE(t.$value, resolvedHex);
          if (d !== null && d < bestDelta) {
            bestDelta = d;
            bestPath = candidatePath;
          }
        }
        return { path: t.path, $type: t.$type, $value: t.$value, proposedAlias: bestPath, deltaE: bestDelta === Infinity ? undefined : bestDelta, accepted: bestPath !== null };
      } else {
        const match = candidates.find(([, entry]) => valuesEqual(entry.$value, t.$value));
        return { path: t.path, $type: t.$type, $value: t.$value, proposedAlias: match?.[0] ?? null, accepted: match !== undefined };
      }
    });
    setPromoteRows(rows);
  }, [tokens, allTokensFlat, selectedPaths, setName]);

  const handleConfirmPromote = useCallback(async () => {
    if (!promoteRows) return;
    setPromoteBusy(true);
    const toApply = promoteRows.filter(r => r.accepted && r.proposedAlias);
    try {
      await Promise.all(
        toApply.map(r =>
          apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${tokenPathToUrlSegment(r.path)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $value: `{${r.proposedAlias}}` }),
          }),
        ),
      );
      setPromoteRows(null);
      onClearSelection();
      onRefresh();
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Promote to alias failed: network error');
    } finally {
      setPromoteBusy(false);
    }
  }, [promoteRows, serverUrl, setName, onRefresh, onClearSelection, onError]);

  return {
    promoteRows,
    setPromoteRows,
    promoteBusy,
    handleOpenPromoteModal,
    handleConfirmPromote,
  };
}
