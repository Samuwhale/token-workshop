import { useState, useRef, useMemo, useCallback } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { isAlias } from '../../shared/resolveAlias';

export const DEFAULT_VALUE_FOR_TYPE: Record<string, any> = {
  color: '#000000',
  dimension: { value: 0, unit: 'px' },
  typography: {},
  shadow: { x: 0, y: 0, blur: 4, spread: 0, color: '#000000', type: 'dropShadow' },
  border: {},
  number: 0,
  string: '',
  boolean: false,
  gradient: { type: 'linear', stops: [] },
  duration: 0,
  fontFamily: '',
  composition: {},
  cubicBezier: [0, 0, 1, 1],
  transition: { duration: { value: 200, unit: 'ms' }, delay: { value: 0, unit: 'ms' }, timingFunction: [0.25, 0.1, 0.25, 1] },
  fontStyle: 'normal',
  lineHeight: 1.5,
  letterSpacing: { value: 0, unit: 'px' },
  percentage: 0,
  link: '',
  textDecoration: 'none',
  textTransform: 'none',
  custom: '',
  fontWeight: 400,
  strokeStyle: 'solid',
  asset: '',
};

interface UseTokenTypeParsingParams {
  tokenType: string;
  setTokenType: (v: string) => void;
  value: any;
  setValue: (v: any) => void;
  aliasMode: boolean;
  reference: string;
  setReference: (v: string) => void;
  setAliasMode: (v: boolean) => void;
  setShowAutocomplete: (v: boolean) => void;
  setScopes: (v: string[]) => void;
  setExtendsPath: (v: string) => void;
  extensionsJsonError: string | null;
  isCreateMode: boolean;
  editPath: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  currentTokenPath: string;
  detectAliasCycle: (ref: string, currentPath: string, allTokensFlat: Record<string, TokenMapEntry>) => string[] | null;
}

export function useTokenTypeParsing({
  tokenType,
  setTokenType,
  value,
  setValue,
  aliasMode,
  reference,
  setReference,
  setAliasMode,
  setShowAutocomplete,
  setScopes,
  setExtendsPath,
  extensionsJsonError,
  isCreateMode,
  editPath,
  allTokensFlat,
  currentTokenPath,
  detectAliasCycle,
}: UseTokenTypeParsingParams) {
  const [pendingTypeChange, setPendingTypeChange] = useState<string | null>(null);
  const [showPendingDependents, setShowPendingDependents] = useState(false);
  const fontFamilyRef = useRef<HTMLInputElement>(null);
  const fontSizeRef = useRef<HTMLInputElement>(null);

  const aliasHasCycle = useMemo((): string[] | null => {
    if (!aliasMode || !isAlias(reference)) return null;
    const cp = isCreateMode ? editPath.trim() : currentTokenPath;
    if (!cp) return null;
    return detectAliasCycle(reference, cp, allTokensFlat);
  }, [aliasMode, reference, isCreateMode, editPath, currentTokenPath, allTokensFlat, detectAliasCycle]);

  const duplicatePath = useMemo(() => {
    if (!isCreateMode) return false;
    const trimmed = editPath.trim();
    if (!trimmed) return false;
    return trimmed in allTokensFlat;
  }, [isCreateMode, editPath, allTokensFlat]);

  const canSave = useMemo(() => {
    if (aliasHasCycle) return false;
    if (extensionsJsonError) return false;
    if (duplicatePath) return false;
    if (tokenType === 'typography' && !aliasMode) {
      const v = typeof value === 'object' && value !== null ? value : {};
      const family = Array.isArray(v.fontFamily) ? v.fontFamily[0] : v.fontFamily;
      if (!family || String(family).trim() === '') return false;
      const fsVal = typeof v.fontSize === 'object' ? v.fontSize?.value : v.fontSize;
      if (fsVal === undefined || fsVal === null || fsVal === '' || isNaN(Number(fsVal)) || Number(fsVal) <= 0) return false;
    }
    return true;
  }, [aliasHasCycle, extensionsJsonError, duplicatePath, tokenType, value, aliasMode]);

  const saveBlockReason = useMemo(() => {
    if (aliasHasCycle) return 'Circular reference';
    if (duplicatePath) return 'A token with this path already exists';
    if (extensionsJsonError) return 'Fix extensions JSON';
    if (tokenType === 'typography' && !aliasMode) {
      const v = typeof value === 'object' && value !== null ? value : {};
      const family = Array.isArray(v.fontFamily) ? v.fontFamily[0] : v.fontFamily;
      const fsVal = typeof v.fontSize === 'object' ? v.fontSize?.value : v.fontSize;
      const missingFamily = !family || String(family).trim() === '';
      const missingSize = fsVal === undefined || fsVal === null || fsVal === '' || isNaN(Number(fsVal)) || Number(fsVal) <= 0;
      if (missingFamily && missingSize) return 'Font family and size required';
      if (missingFamily) return 'Font family required';
      if (missingSize) return 'Font size required';
    }
    if (isCreateMode && !editPath.trim()) return 'Enter a token path';
    return null;
  }, [aliasHasCycle, duplicatePath, extensionsJsonError, tokenType, value, aliasMode, isCreateMode, editPath]);

  const applyTypeChange = (newType: string) => {
    setTokenType(newType);
    setValue(DEFAULT_VALUE_FOR_TYPE[newType] ?? '');
    setScopes([]);
    setReference('');
    setAliasMode(false);
    setShowAutocomplete(false);
    setPendingTypeChange(null);
    setShowPendingDependents(false);
    setExtendsPath('');
  };

  const handleTypeChange = (newType: string) => {
    if (aliasMode) { applyTypeChange(newType); return; }
    const isDefaultValue = JSON.stringify(value) === JSON.stringify(DEFAULT_VALUE_FOR_TYPE[tokenType] ?? '');
    if (!isDefaultValue) {
      setPendingTypeChange(newType);
    } else {
      applyTypeChange(newType);
    }
  };

  const focusBlockedField = useCallback(() => {
    if (tokenType !== 'typography' || aliasMode) return;
    const v = typeof value === 'object' && value !== null ? value : {};
    const family = Array.isArray(v.fontFamily) ? v.fontFamily[0] : v.fontFamily;
    const missingFamily = !family || String(family).trim() === '';
    if (missingFamily) {
      fontFamilyRef.current?.focus();
      return;
    }
    const fsVal = typeof v.fontSize === 'object' ? v.fontSize?.value : v.fontSize;
    const missingSize = fsVal === undefined || fsVal === null || fsVal === '' || isNaN(Number(fsVal)) || Number(fsVal) <= 0;
    if (missingSize) {
      fontSizeRef.current?.focus();
    }
  }, [tokenType, aliasMode, value]);

  return {
    pendingTypeChange,
    setPendingTypeChange,
    showPendingDependents,
    setShowPendingDependents,
    fontFamilyRef,
    fontSizeRef,
    aliasHasCycle,
    duplicatePath,
    canSave,
    saveBlockReason,
    applyTypeChange,
    handleTypeChange,
    focusBlockedField,
  };
}
