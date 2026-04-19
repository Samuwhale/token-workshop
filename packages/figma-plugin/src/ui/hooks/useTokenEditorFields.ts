import { useState, useRef, useMemo } from 'react';
import type { ColorModifierOp } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';
import { getInitialCreateValue } from '../components/token-editor/tokenEditorHelpers';
import { normalizeTokenType } from '../shared/tokenTypeCategories';
import { stableStringify } from '../shared/utils';
import type {
  TokenEditorLifecycle,
  TokenEditorModeValues,
  TokenEditorSnapshot,
  TokenEditorValue,
} from '../shared/tokenEditorTypes';

export interface FieldsSnapshot extends TokenEditorSnapshot {}

export function useTokenEditorFields(params: {
  isCreateMode: boolean;
  initialType?: string;
  initialValue?: string;
  tokenPath: string;
  editPath: string;
  allTokensFlat: Record<string, TokenMapEntry>;
}) {
  const { isCreateMode, initialType, initialValue, tokenPath, editPath, allTokensFlat } = params;
  const normalizedInitialType = normalizeTokenType(initialType);

  // initialRef tracks the server-loaded snapshot for dirty checking
  const initialRef = useRef<FieldsSnapshot | null>(null);

  const [tokenType, setTokenType] = useState(normalizedInitialType);
  const [value, setValue] = useState<TokenEditorValue>(() => {
    if (!isCreateMode) return '';
    return getInitialCreateValue(normalizedInitialType, initialValue);
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
  const [modeValues, setModeValues] = useState<TokenEditorModeValues>({});
  const [extensionsJsonText, setExtensionsJsonText] = useState('');
  const [extensionsJsonError, setExtensionsJsonError] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<TokenEditorLifecycle>('published');
  const [extendsPath, setExtendsPath] = useState('');

  // preAliasValueRef stashes pre-alias value when toggling alias mode
  const preAliasValueRef = useRef<TokenEditorValue | null>(null);

  // isDirty - tracks whether any field differs from the initial snapshot
  const isDirty = useMemo(() => {
    if (!initialRef.current) return false;
    const init = initialRef.current;
    return (
      tokenType !== init.type ||
      stableStringify(value) !== stableStringify(init.value) ||
      description !== init.description ||
      reference !== init.reference ||
      stableStringify(scopes) !== stableStringify(init.scopes) ||
      stableStringify(colorModifiers) !== stableStringify(init.colorModifiers) ||
      stableStringify(modeValues) !== stableStringify(init.modeValues) ||
      extensionsJsonText !== init.extensionsJsonText ||
      lifecycle !== init.lifecycle ||
      extendsPath !== init.extendsPath ||
      (isCreateMode && editPath.trim() !== tokenPath.trim())
    );
  }, [tokenType, value, description, reference, scopes, colorModifiers, modeValues, extensionsJsonText, lifecycle, extendsPath, isCreateMode, editPath, tokenPath]);

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
