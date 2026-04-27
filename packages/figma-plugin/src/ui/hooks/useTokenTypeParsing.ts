import { useState, useRef, useMemo, useCallback } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { isAlias } from '../../shared/resolveAlias';
import type { TokenEditorModeValues, TokenEditorValue } from '../shared/tokenEditorTypes';
import { FIGMA_SCOPE_OPTIONS } from '../shared/tokenMetadata';
import { stableStringify } from '../shared/utils';
import { DEFAULT_DURATION_TOKEN_VALUE } from '../shared/tokenValueParsing';

export const DEFAULT_VALUE_FOR_TYPE: Record<string, TokenEditorValue> = {
  color: '#000000',
  dimension: { value: 0, unit: 'px' },
  typography: {},
  shadow: { x: 0, y: 0, blur: 4, spread: 0, color: '#000000', type: 'dropShadow' },
  border: {},
  number: 0,
  string: '',
  boolean: false,
  gradient: { type: 'linear', stops: [] },
  duration: { ...DEFAULT_DURATION_TOKEN_VALUE },
  fontFamily: '',
  composition: {},
  cubicBezier: [0, 0, 1, 1],
  transition: {
    duration: { ...DEFAULT_DURATION_TOKEN_VALUE },
    delay: { value: 0, unit: 'ms' },
    timingFunction: [0.25, 0.1, 0.25, 1],
  },
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

type TypographyEditorValue = {
  fontFamily?: string | string[];
  fontSize?: number | string | { value?: unknown };
};

function getTypographyEditorValue(value: TokenEditorValue): TypographyEditorValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return value as TypographyEditorValue;
}

function getTypographyFamily(value: TypographyEditorValue): string | undefined {
  const family = Array.isArray(value.fontFamily)
    ? value.fontFamily[0]
    : value.fontFamily;

  return typeof family === 'string' ? family : undefined;
}

function getTypographyFontSizeValue(value: TypographyEditorValue): unknown {
  const fontSize = value.fontSize;
  if (typeof fontSize === 'object' && fontSize !== null) {
    return fontSize.value;
  }

  return fontSize;
}

interface UseTokenTypeParsingParams {
  tokenType: string;
  setTokenType: (v: string) => void;
  value: TokenEditorValue;
  setValue: (v: TokenEditorValue) => void;
  scopes: string[];
  modeValues: TokenEditorModeValues;
  setModeValues: (v: TokenEditorModeValues) => void;
  setScopes: (v: string[]) => void;
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
  scopes,
  modeValues,
  setModeValues,
  setScopes,
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

  const valueIsAlias = typeof value === 'string' && isAlias(value);

  const aliasCycleError = useMemo((): string[] | null => {
    const cp = isCreateMode ? editPath.trim() : currentTokenPath;
    if (!cp) return null;
    if (valueIsAlias) {
      const cycle = detectAliasCycle(value as string, cp, allTokensFlat);
      if (cycle) return cycle;
    }
    for (const collectionModes of Object.values(modeValues)) {
      if (!collectionModes || typeof collectionModes !== 'object') continue;
      for (const modeVal of Object.values(collectionModes)) {
        if (typeof modeVal === 'string' && isAlias(modeVal)) {
          const cycle = detectAliasCycle(modeVal, cp, allTokensFlat);
          if (cycle) return cycle;
        }
      }
    }
    return null;
  }, [valueIsAlias, value, modeValues, isCreateMode, editPath, currentTokenPath, allTokensFlat, detectAliasCycle]);

  const duplicatePath = useMemo(() => {
    if (!isCreateMode) return false;
    const trimmed = editPath.trim();
    if (!trimmed) return false;
    return trimmed in allTokensFlat;
  }, [isCreateMode, editPath, allTokensFlat]);

  const canSave = useMemo(() => {
    if (aliasCycleError) return false;
    if (extensionsJsonError) return false;
    if (duplicatePath) return false;
    if (tokenType === 'typography' && !valueIsAlias) {
      const v = getTypographyEditorValue(value);
      const family = getTypographyFamily(v);
      if (!family || String(family).trim() === '') return false;
      const fsVal = getTypographyFontSizeValue(v);
      if (fsVal === undefined || fsVal === null || fsVal === '' || isNaN(Number(fsVal)) || Number(fsVal) <= 0) return false;
    }
    return true;
  }, [aliasCycleError, extensionsJsonError, duplicatePath, tokenType, value, valueIsAlias]);

  const saveBlockReason = useMemo(() => {
    if (aliasCycleError) return 'Circular reference';
    if (duplicatePath) return 'A token with this path already exists';
    if (extensionsJsonError) return 'Fix extensions JSON';
    if (tokenType === 'typography' && !valueIsAlias) {
      const v = getTypographyEditorValue(value);
      const family = getTypographyFamily(v);
      const fsVal = getTypographyFontSizeValue(v);
      const missingFamily = !family || String(family).trim() === '';
      const missingSize = fsVal === undefined || fsVal === null || fsVal === '' || isNaN(Number(fsVal)) || Number(fsVal) <= 0;
      if (missingFamily && missingSize) return 'Font family and size required';
      if (missingFamily) return 'Font family required';
      if (missingSize) return 'Font size required';
    }
    if (isCreateMode && !editPath.trim()) return 'Enter a token path';
    return null;
  }, [aliasCycleError, duplicatePath, extensionsJsonError, tokenType, value, valueIsAlias, isCreateMode, editPath]);

  const applyTypeChange = (newType: string) => {
    const validScopes = new Set(
      (FIGMA_SCOPE_OPTIONS[newType] ?? []).map((option) => option.value),
    );
    setTokenType(newType);
    setValue(DEFAULT_VALUE_FOR_TYPE[newType] ?? '');
    setModeValues({});
    setScopes(
      validScopes.size === 0
        ? []
        : scopes.filter((scope) => validScopes.has(scope)),
    );
    setPendingTypeChange(null);
    setShowPendingDependents(false);
  };

  const handleTypeChange = (newType: string) => {
    if (valueIsAlias) { applyTypeChange(newType); return; }
    const isDefaultValue =
      stableStringify(value) ===
      stableStringify(DEFAULT_VALUE_FOR_TYPE[tokenType] ?? '');
    if (!isDefaultValue) {
      setPendingTypeChange(newType);
    } else {
      applyTypeChange(newType);
    }
  };

  const focusBlockedField = useCallback(() => {
    if (tokenType !== 'typography' || valueIsAlias) return;
    const v = getTypographyEditorValue(value);
    const family = getTypographyFamily(v);
    const missingFamily = !family || String(family).trim() === '';
    if (missingFamily) {
      fontFamilyRef.current?.focus();
      return;
    }
    const fsVal = getTypographyFontSizeValue(v);
    const missingSize = fsVal === undefined || fsVal === null || fsVal === '' || isNaN(Number(fsVal)) || Number(fsVal) <= 0;
    if (missingSize) {
      fontSizeRef.current?.focus();
    }
  }, [tokenType, valueIsAlias, value]);

  return {
    pendingTypeChange,
    setPendingTypeChange,
    showPendingDependents,
    setShowPendingDependents,
    fontFamilyRef,
    fontSizeRef,
    aliasCycleError,
    duplicatePath,
    canSave,
    saveBlockReason,
    applyTypeChange,
    handleTypeChange,
    focusBlockedField,
  };
}
