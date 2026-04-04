import { useState, useRef, useMemo } from 'react';
import type { ColorModifierOp } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';

export interface FieldsSnapshot {
  value: any;
  description: string;
  reference: string;
  scopes: string[];
  type: string;
  colorModifiers: ColorModifierOp[];
  modeValues: Record<string, any>;
  extensionsJsonText: string;
  lifecycle: 'draft' | 'published' | 'deprecated';
  extendsPath: string;
}

function parseInitialValueForType(type: string, raw: string): any {
  const v = raw.trim();
  if (type === 'color') return v;
  if (type === 'dimension') {
    const m = v.match(/^(-?\d*\.?\d+)\s*(px|rem|em|%|vw|vh|pt|dp|sp|cm|mm|fr|ch|ex)?$/);
    if (m) return { value: parseFloat(m[1]), unit: m[2] || 'px' };
    return v;
  }
  if (type === 'duration') {
    const m = v.match(/^(-?\d*\.?\d+)\s*(ms|s)?$/);
    if (m) return { value: parseFloat(m[1]), unit: m[2] || 'ms' };
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  if (type === 'number' || type === 'fontWeight') {
    const n = parseFloat(v);
    return isNaN(n) ? v : n;
  }
  if (type === 'boolean') {
    return v.toLowerCase() === 'true';
  }
  return v;
}

export function useTokenEditorFields(params: {
  isCreateMode: boolean;
  initialType?: string;
  initialValue?: string;
  tokenPath: string;
  allTokensFlat: Record<string, TokenMapEntry>;
}) {
  const { isCreateMode, initialType, initialValue, tokenPath, allTokensFlat } = params;

  // initialRef tracks the server-loaded snapshot for dirty checking
  const initialRef = useRef<FieldsSnapshot | null>(null);

  const [tokenType, setTokenType] = useState(initialType || 'color');
  const [value, setValue] = useState<any>(() => {
    if (!isCreateMode) return '';
    const t = initialType || 'color';
    if (initialValue && !isAlias(initialValue)) {
      return parseInitialValueForType(t, initialValue);
    }
    if (t === 'color') return '#000000';
    if (t === 'dimension') return { value: 0, unit: 'px' };
    if (t === 'number' || t === 'duration') return 0;
    if (t === 'boolean') return false;
    if (t === 'shadow') return { x: 0, y: 0, blur: 4, spread: 0, color: '#000000', type: 'dropShadow' };
    return '';
  });
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState(() => {
    if (isCreateMode && initialValue && isAlias(initialValue)) return initialValue;
    return '';
  });
  const [aliasMode, setAliasMode] = useState(() => {
    if (isCreateMode && initialValue && isAlias(initialValue)) return true;
    return false;
  });
  const [scopes, setScopes] = useState<string[]>([]);
  const [colorModifiers, setColorModifiers] = useState<ColorModifierOp[]>([]);
  const [modeValues, setModeValues] = useState<Record<string, any>>({});
  const [extensionsJsonText, setExtensionsJsonText] = useState('');
  const [extensionsJsonError, setExtensionsJsonError] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<'draft' | 'published' | 'deprecated'>('published');
  const [extendsPath, setExtendsPath] = useState('');

  // preAliasValueRef stashes pre-alias value when toggling alias mode
  const preAliasValueRef = useRef<any>(null);

  // isDirty - tracks whether any field differs from the initial snapshot
  const isDirty = useMemo(() => {
    if (!initialRef.current) return false;
    const init = initialRef.current;
    return (
      tokenType !== init.type ||
      value !== init.value ||
      description !== init.description ||
      reference !== init.reference ||
      JSON.stringify(scopes) !== JSON.stringify(init.scopes) ||
      JSON.stringify(colorModifiers) !== JSON.stringify(init.colorModifiers) ||
      JSON.stringify(modeValues) !== JSON.stringify(init.modeValues) ||
      extensionsJsonText !== init.extensionsJsonText ||
      lifecycle !== init.lifecycle ||
      extendsPath !== init.extendsPath
    );
  }, [tokenType, value, description, reference, scopes, colorModifiers, modeValues, extensionsJsonText, lifecycle, extendsPath]);

  // colorFlatMap - flat map of color token string values for reference resolution
  const colorFlatMap = useMemo(() => {
    const map: Record<string, unknown> = {};
    for (const [p, e] of Object.entries(allTokensFlat)) {
      if (e.$type === 'color') map[p] = e.$value;
    }
    if (tokenType === 'color' && !isCreateMode) {
      map[tokenPath] = reference || value;
    }
    return map;
  }, [allTokensFlat, tokenType, tokenPath, isCreateMode, reference, value]);

  // outgoingRefs - alias paths that this token references
  const outgoingRefs = useMemo((): string[] => {
    if (aliasMode && reference) {
      const p = extractAliasPath(reference);
      return p ? [p] : [];
    }
    if (!aliasMode && value && typeof value === 'object') {
      const refs: string[] = [];
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        if (item && typeof item === 'object') {
          for (const v of Object.values(item as Record<string, unknown>)) {
            if (typeof v === 'string') {
              const p = extractAliasPath(v);
              if (p) refs.push(p);
            }
          }
        }
      }
      return refs;
    }
    return [];
  }, [aliasMode, reference, value]);

  return {
    initialRef,
    tokenType, setTokenType,
    value, setValue,
    description, setDescription,
    reference, setReference,
    aliasMode, setAliasMode,
    scopes, setScopes,
    colorModifiers, setColorModifiers,
    modeValues, setModeValues,
    extensionsJsonText, setExtensionsJsonText,
    extensionsJsonError, setExtensionsJsonError,
    lifecycle, setLifecycle,
    extendsPath, setExtendsPath,
    preAliasValueRef,
    isDirty,
    colorFlatMap,
    outgoingRefs,
  };
}
