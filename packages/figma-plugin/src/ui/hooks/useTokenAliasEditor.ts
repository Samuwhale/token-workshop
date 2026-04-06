import { useState, useRef, useCallback } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';

interface UseTokenAliasEditorParams {
  aliasMode: boolean;
  setAliasMode: (v: boolean) => void;
  value: any;
  setValue: (v: any) => void;
  reference: string;
  setReference: (v: string) => void;
  tokenType: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  preAliasValueRef: React.MutableRefObject<any>;
}

export function useTokenAliasEditor({
  aliasMode,
  setAliasMode,
  value,
  setValue,
  reference,
  setReference,
  tokenType,
  allTokensFlat,
  preAliasValueRef,
}: UseTokenAliasEditorParams) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);

  const _aliasHasCycle = (() => {
    // This is intentionally not a hook - computed inline each render
    // Moved to useTokenTypeParsing per plan
    return null;
  })();

  const handleToggleAlias = useCallback(() => {
    const next = !aliasMode;
    setAliasMode(next);
    if (next) {
      preAliasValueRef.current = value;
      if (!reference) setReference('{');
      setTimeout(() => { refInputRef.current?.focus(); }, 0);
    } else {
      let resolved: any = null;
      if (reference && isAlias(reference)) {
        const result = resolveTokenValue(reference, tokenType, allTokensFlat);
        if (result.value != null && !result.error) {
          resolved = result.value;
        }
      }
      setValue(resolved ?? preAliasValueRef.current ?? value);
      preAliasValueRef.current = null;
      setReference('');
      setShowAutocomplete(false);
    }
  }, [aliasMode, value, reference, tokenType, allTokensFlat, setAliasMode, setValue, setReference, preAliasValueRef]);

  return {
    showAutocomplete,
    setShowAutocomplete,
    refInputRef,
    handleToggleAlias,
  };
}
