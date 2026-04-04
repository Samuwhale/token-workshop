import { useState } from 'react';
import type { CompareMode } from '../components/UnifiedComparePanel';

export function useCompareState() {
  const [compareMode, setCompareMode] = useState<CompareMode>('theme-options');
  const [compareTokenPaths, setCompareTokenPaths] = useState<Set<string>>(new Set());
  const [compareTokenPath, setCompareTokenPath] = useState('');
  const [compareThemeKey, setCompareThemeKey] = useState(0);
  const [compareThemeDefaultA, setCompareThemeDefaultA] = useState('');
  const [compareThemeDefaultB, setCompareThemeDefaultB] = useState('');

  return {
    compareMode, setCompareMode,
    compareTokenPaths, setCompareTokenPaths,
    compareTokenPath, setCompareTokenPath,
    compareThemeKey, setCompareThemeKey,
    compareThemeDefaultA, setCompareThemeDefaultA,
    compareThemeDefaultB, setCompareThemeDefaultB,
  };
}
