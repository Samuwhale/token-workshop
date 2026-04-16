import { useState } from 'react';
import type { CompareMode } from '../components/UnifiedComparePanel';

export function useCompareState() {
  const [compareMode, setCompareMode] = useState<CompareMode>('mode-options');
  const [compareTokenPaths, setCompareTokenPaths] = useState<Set<string>>(new Set());
  const [compareTokenPath, setCompareTokenPath] = useState('');
  const [compareModeKey, setCompareModeKey] = useState(0);
  const [compareModeDefaultA, setCompareModeDefaultA] = useState('');
  const [compareModeDefaultB, setCompareModeDefaultB] = useState('');

  return {
    compareMode, setCompareMode,
    compareTokenPaths, setCompareTokenPaths,
    compareTokenPath, setCompareTokenPath,
    compareModeKey, setCompareModeKey,
    compareModeDefaultA, setCompareModeDefaultA,
    compareModeDefaultB, setCompareModeDefaultB,
  };
}
