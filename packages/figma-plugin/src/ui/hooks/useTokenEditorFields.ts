import { useState, useRef, useMemo } from 'react';
import type { DerivationOp } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
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

  const initialRef = useRef<FieldsSnapshot | null>(null);

  const [tokenType, setTokenType] = useState(normalizedInitialType);
  const [value, setValue] = useState<TokenEditorValue>(() => {
    if (!isCreateMode) return '';
    return getInitialCreateValue(normalizedInitialType, initialValue);
  });
  const [description, setDescription] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [derivationOps, setDerivationOps] = useState<DerivationOp[]>([]);
  const [modeValues, setModeValues] = useState<TokenEditorModeValues>({});
  const [extensionsJsonText, setExtensionsJsonText] = useState('');
  const [extensionsJsonError, setExtensionsJsonError] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<TokenEditorLifecycle>('published');
  const [extendsPath, setExtendsPath] = useState('');

  const isDirty = useMemo(() => {
    if (!initialRef.current) return false;
    const init = initialRef.current;
    return (
      tokenType !== init.type ||
      stableStringify(value) !== stableStringify(init.value) ||
      description !== init.description ||
      stableStringify(scopes) !== stableStringify(init.scopes) ||
      stableStringify(derivationOps) !== stableStringify(init.derivationOps) ||
      stableStringify(modeValues) !== stableStringify(init.modeValues) ||
      extensionsJsonText !== init.extensionsJsonText ||
      lifecycle !== init.lifecycle ||
      extendsPath !== init.extendsPath ||
      (isCreateMode && editPath.trim() !== tokenPath.trim())
    );
  }, [tokenType, value, description, scopes, derivationOps, modeValues, extensionsJsonText, lifecycle, extendsPath, isCreateMode, editPath, tokenPath]);

  const colorFlatMap = useMemo(() => {
    const map: Record<string, unknown> = {};
    for (const [p, e] of Object.entries(allTokensFlat)) {
      if (e.$type === 'color') map[p] = e.$value;
    }
    if (tokenType === 'color' && !isCreateMode) {
      map[tokenPath] = value;
    }
    return map;
  }, [allTokensFlat, tokenType, tokenPath, isCreateMode, value]);

  return {
    initialRef,
    tokenType, setTokenType,
    value, setValue,
    description, setDescription,
    scopes, setScopes,
    derivationOps, setDerivationOps,
    modeValues, setModeValues,
    extensionsJsonText, setExtensionsJsonText,
    extensionsJsonError, setExtensionsJsonError,
    lifecycle, setLifecycle,
    extendsPath, setExtendsPath,
    isDirty,
    colorFlatMap,
  };
}
