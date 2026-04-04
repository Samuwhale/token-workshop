import { useState, useCallback } from 'react';
import type { CompareMode } from '../components/UnifiedComparePanel';

export interface UseThemeCompareReturn {
  showCompare: boolean;
  setShowCompare: React.Dispatch<React.SetStateAction<boolean>>;
  compareMode: CompareMode;
  setCompareMode: React.Dispatch<React.SetStateAction<CompareMode>>;
  compareTokenPath: string;
  setCompareTokenPath: React.Dispatch<React.SetStateAction<string>>;
  compareTokenPaths: Set<string>;
  setCompareTokenPaths: React.Dispatch<React.SetStateAction<Set<string>>>;
  compareThemeKey: number;
  setCompareThemeKey: React.Dispatch<React.SetStateAction<number>>;
  compareThemeDefaultA: string;
  setCompareThemeDefaultA: React.Dispatch<React.SetStateAction<string>>;
  compareThemeDefaultB: string;
  setCompareThemeDefaultB: React.Dispatch<React.SetStateAction<string>>;
  navigateToCompare: (
    mode: CompareMode,
    path?: string,
    tokenPaths?: Set<string>,
    optionA?: string,
    optionB?: string,
  ) => void;
}

export function useThemeCompare(): UseThemeCompareReturn {
  const [showCompare, setShowCompare] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>('theme-options');
  const [compareTokenPath, setCompareTokenPath] = useState('');
  const [compareTokenPaths, setCompareTokenPaths] = useState<Set<string>>(new Set());
  const [compareThemeKey, setCompareThemeKey] = useState(0);
  const [compareThemeDefaultA, setCompareThemeDefaultA] = useState('');
  const [compareThemeDefaultB, setCompareThemeDefaultB] = useState('');

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
    if (optionA !== undefined) setCompareThemeDefaultA(optionA);
    if (optionB !== undefined) setCompareThemeDefaultB(optionB);
    setCompareThemeKey(k => k + 1);
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
    compareThemeKey,
    setCompareThemeKey,
    compareThemeDefaultA,
    setCompareThemeDefaultA,
    compareThemeDefaultB,
    setCompareThemeDefaultB,
    navigateToCompare,
  };
}
