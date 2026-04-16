import { useState, useCallback } from 'react';
import type { CompareMode } from '../components/UnifiedComparePanel';

export interface UseModeCompareReturn {
  showCompare: boolean;
  setShowCompare: React.Dispatch<React.SetStateAction<boolean>>;
  compareMode: CompareMode;
  setCompareMode: React.Dispatch<React.SetStateAction<CompareMode>>;
  compareTokenPath: string;
  setCompareTokenPath: React.Dispatch<React.SetStateAction<string>>;
  compareTokenPaths: Set<string>;
  setCompareTokenPaths: React.Dispatch<React.SetStateAction<Set<string>>>;
  compareModeKey: number;
  setCompareModeKey: React.Dispatch<React.SetStateAction<number>>;
  compareModeDefaultA: string;
  setCompareModeDefaultA: React.Dispatch<React.SetStateAction<string>>;
  compareModeDefaultB: string;
  setCompareModeDefaultB: React.Dispatch<React.SetStateAction<string>>;
  navigateToCompare: (
    mode: CompareMode,
    path?: string,
    tokenPaths?: Set<string>,
    optionA?: string,
    optionB?: string,
  ) => void;
}

export function useModeCompare(): UseModeCompareReturn {
  const [showCompare, setShowCompare] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>('mode-options');
  const [compareTokenPath, setCompareTokenPath] = useState('');
  const [compareTokenPaths, setCompareTokenPaths] = useState<Set<string>>(new Set());
  const [compareModeKey, setCompareModeKey] = useState(0);
  const [compareModeDefaultA, setCompareModeDefaultA] = useState('');
  const [compareModeDefaultB, setCompareModeDefaultB] = useState('');

  const navigateToCompare = useCallback((
    mode: CompareMode,
    path?: string,
    tokenPaths?: Set<string>,
    optionA?: string,
    optionB?: string,
  ) => {
    setCompareMode(mode);
    if (path !== undefined) setCompareTokenPath(path);
    if (tokenPaths !== undefined) setCompareTokenPaths(tokenPaths);
    if (optionA !== undefined) setCompareModeDefaultA(optionA);
    if (optionB !== undefined) setCompareModeDefaultB(optionB);
    setCompareModeKey(k => k + 1);
    setShowCompare(true);
  }, []);

  return {
    showCompare,
    setShowCompare,
    compareMode,
    setCompareMode,
    compareTokenPath,
    setCompareTokenPath,
    compareTokenPaths,
    setCompareTokenPaths,
    compareModeKey,
    setCompareModeKey,
    compareModeDefaultA,
    setCompareModeDefaultA,
    compareModeDefaultB,
    setCompareModeDefaultB,
    navigateToCompare,
  };
}
