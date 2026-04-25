import { useMemo, useState, useEffect } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import { colorDeltaE } from '@tokenmanager/core';
import { stableStringify } from '../shared/utils';

export interface NearbyMatch {
  path: string;
  resolvedValue: unknown;
  distance: number;
  label: 'Exact' | 'Close';
}

/** Numeric value from a dimension or number token. */
function extractNumeric(val: unknown): number | null {
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && val !== null && 'value' in val && typeof val.value === 'number') return val.value;
  return null;
}

function extractUnit(val: unknown, defaultUnit = ''): string {
  if (typeof val === 'object' && val !== null && 'unit' in val) {
    const unit = typeof val.unit === 'string' ? val.unit.trim() : '';
    return unit || defaultUnit;
  }
  return '';
}

function pushNumericCandidate(
  candidates: NearbyMatch[],
  params: {
    path: string;
    resolvedValue: unknown;
    inputValue: unknown;
    candidateValue: unknown;
    closeThreshold: number;
    defaultUnit?: string;
    absoluteCloseThreshold?: number;
  },
): void {
  const inputNum = extractNumeric(params.inputValue);
  const candidateNum = extractNumeric(params.candidateValue);
  if (inputNum === null || candidateNum === null) {
    return;
  }

  if (
    params.defaultUnit !== undefined &&
    extractUnit(params.inputValue, params.defaultUnit) !==
      extractUnit(params.candidateValue, params.defaultUnit)
  ) {
    return;
  }

  const diff = Math.abs(inputNum - candidateNum);
  if (diff === 0) {
    candidates.push({
      path: params.path,
      resolvedValue: params.resolvedValue,
      distance: 0,
      label: 'Exact',
    });
    return;
  }

  const maxVal = Math.max(Math.abs(inputNum), Math.abs(candidateNum));
  const isAbsoluteMatch =
    params.absoluteCloseThreshold !== undefined &&
    diff <= params.absoluteCloseThreshold;
  const isRelativeMatch = maxVal > 0 && diff / maxVal <= params.closeThreshold;
  if (isAbsoluteMatch || isRelativeMatch) {
    candidates.push({
      path: params.path,
      resolvedValue: params.resolvedValue,
      distance: diff,
      label: 'Close',
    });
  }
}

function toComparableString(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'object') {
    return stableStringify(value);
  }
  return String(value);
}

function hasComparableValue(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return true;
}

export function findNearbyTokens(
  inputValue: unknown,
  tokenType: string,
  allTokensFlat: Record<string, TokenMapEntry>,
  excludePath: string,
): NearbyMatch[] {
  if (!hasComparableValue(inputValue)) return [];

  const candidates: NearbyMatch[] = [];

  // Serialize input for string comparison fallback.
  // Use stableStringify so composite values compare by content rather than key order.
  const inputStr = toComparableString(inputValue);

  for (const [path, entry] of Object.entries(allTokensFlat)) {
    if (path === excludePath) continue;
    if (entry.$type !== tokenType) continue;
    // Skip aliases — suggest only primitives
    if (isAlias(entry.$value)) continue;

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
      pushNumericCandidate(candidates, {
        path,
        resolvedValue: resolvedVal,
        inputValue,
        candidateValue: resolvedVal,
        closeThreshold: 0.1,
        absoluteCloseThreshold: 2,
        defaultUnit: 'px',
      });
    } else if (tokenType === 'duration') {
      pushNumericCandidate(candidates, {
        path,
        resolvedValue: resolvedVal,
        inputValue,
        candidateValue: resolvedVal,
        closeThreshold: 0.05,
        defaultUnit: 'ms',
      });
    } else if (
      tokenType === 'number' ||
      tokenType === 'fontWeight' ||
      tokenType === 'percentage'
    ) {
      pushNumericCandidate(candidates, {
        path,
        resolvedValue: resolvedVal,
        inputValue,
        candidateValue: resolvedVal,
        closeThreshold: 0.05,
      });
    } else {
      // String/boolean/etc — exact match only (existing behavior)
      const entryStr = toComparableString(resolvedVal);
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
  inputValue: unknown,
  tokenType: string,
  allTokensFlat: Record<string, TokenMapEntry>,
  currentPath: string,
  enabled: boolean,
): NearbyMatch[] {
  const [matches, setMatches] = useState<NearbyMatch[]>([]);

  // Serialize input for dependency tracking
  const inputKey = useMemo(() => {
    return toComparableString(inputValue);
  }, [inputValue]);

  useEffect(() => {
    if (!enabled || !inputKey) {
      setMatches([]);
      return;
    }

    const timer = window.setTimeout(() => {
      setMatches(findNearbyTokens(inputValue, tokenType, allTokensFlat, currentPath));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [
    allTokensFlat,
    currentPath,
    enabled,
    inputKey,
    inputValue,
    tokenType,
  ]);

  return matches;
}
