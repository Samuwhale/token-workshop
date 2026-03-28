import { useMemo, useRef, useState, useEffect } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import { colorDeltaE } from '@tokenmanager/core';

export interface NearbyMatch {
  path: string;
  resolvedValue: any;
  distance: number;
  label: 'Exact' | 'Close';
}

/** Numeric value from a dimension or number token. */
function extractNumeric(val: any): number | null {
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && val !== null && 'value' in val && typeof val.value === 'number') return val.value;
  return null;
}

function extractUnit(val: any): string {
  if (typeof val === 'object' && val !== null && 'unit' in val) return val.unit || 'px';
  return '';
}

function findNearbyTokens(
  inputValue: any,
  tokenType: string,
  allTokensFlat: Record<string, TokenMapEntry>,
  excludePath: string,
): NearbyMatch[] {
  if (inputValue == null) return [];

  const candidates: NearbyMatch[] = [];

  // Serialize input for string comparison fallback
  const inputStr = typeof inputValue === 'object' ? JSON.stringify(inputValue) : String(inputValue);
  if (inputStr === '' || inputStr === '0' || inputStr === '#000000' || inputStr === 'false') return [];

  for (const [path, entry] of Object.entries(allTokensFlat)) {
    if (path === excludePath) continue;
    if (entry.$type !== tokenType) continue;
    // Skip aliases — suggest only primitives
    if (typeof entry.$value === 'string' && entry.$value.startsWith('{') && entry.$value.endsWith('}')) continue;

    // Resolve the candidate's value
    const resolved = resolveTokenValue(entry.$value, entry.$type || tokenType, allTokensFlat);
    const resolvedVal = resolved.value;

    if (tokenType === 'color') {
      const inputHex = typeof inputValue === 'string' ? inputValue : null;
      const candidateHex = typeof resolvedVal === 'string' ? resolvedVal : null;
      if (!inputHex || !candidateHex) continue;
      const dE = colorDeltaE(inputHex, candidateHex);
      if (dE === null) continue;
      if (dE < 1) {
        candidates.push({ path, resolvedValue: resolvedVal, distance: dE, label: 'Exact' });
      } else if (dE < 5) {
        candidates.push({ path, resolvedValue: resolvedVal, distance: dE, label: 'Close' });
      }
    } else if (tokenType === 'dimension') {
      const inputNum = extractNumeric(inputValue);
      const candidateNum = extractNumeric(resolvedVal);
      if (inputNum === null || candidateNum === null) continue;
      // Only match same unit
      if (extractUnit(inputValue) !== extractUnit(resolvedVal)) continue;
      const diff = Math.abs(inputNum - candidateNum);
      const maxVal = Math.max(Math.abs(inputNum), Math.abs(candidateNum));
      if (diff === 0) {
        candidates.push({ path, resolvedValue: resolvedVal, distance: 0, label: 'Exact' });
      } else if (maxVal > 0 && (diff <= 2 || diff / maxVal <= 0.1)) {
        candidates.push({ path, resolvedValue: resolvedVal, distance: diff, label: 'Close' });
      }
    } else if (tokenType === 'number' || tokenType === 'fontWeight' || tokenType === 'duration') {
      const inputNum = extractNumeric(inputValue);
      const candidateNum = extractNumeric(resolvedVal);
      if (inputNum === null || candidateNum === null) continue;
      const diff = Math.abs(inputNum - candidateNum);
      if (diff === 0) {
        candidates.push({ path, resolvedValue: resolvedVal, distance: 0, label: 'Exact' });
      } else {
        const maxVal = Math.max(Math.abs(inputNum), Math.abs(candidateNum));
        if (maxVal > 0 && diff / maxVal <= 0.05) {
          candidates.push({ path, resolvedValue: resolvedVal, distance: diff, label: 'Close' });
        }
      }
    } else {
      // String/boolean/etc — exact match only (existing behavior)
      const entryStr = typeof resolvedVal === 'object' ? JSON.stringify(resolvedVal) : String(resolvedVal);
      if (entryStr === inputStr) {
        candidates.push({ path, resolvedValue: resolvedVal, distance: 0, label: 'Exact' });
      }
    }
  }

  // Sort by distance, take top 3
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, 3);
}

/**
 * Hook that finds tokens whose resolved values are near the given input value.
 * Debounces the search by 150ms to avoid blocking on every keystroke.
 */
export function useNearbyTokenMatch(
  inputValue: any,
  tokenType: string,
  allTokensFlat: Record<string, TokenMapEntry>,
  currentPath: string,
  enabled: boolean,
): NearbyMatch[] {
  const [matches, setMatches] = useState<NearbyMatch[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Serialize input for dependency tracking
  const inputKey = useMemo(() => {
    if (inputValue == null) return '';
    return typeof inputValue === 'object' ? JSON.stringify(inputValue) : String(inputValue);
  }, [inputValue]);

  useEffect(() => {
    if (!enabled || !inputKey) {
      setMatches([]);
      return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setMatches(findNearbyTokens(inputValue, tokenType, allTokensFlat, currentPath));
    }, 150);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, inputKey, tokenType, currentPath]);

  return matches;
}
