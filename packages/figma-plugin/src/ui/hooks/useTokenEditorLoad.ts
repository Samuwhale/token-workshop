import { useState, useRef, useEffect } from 'react';
import type { ColorModifierOp } from '@tokenmanager/core';
import { validateColorModifiers } from '@tokenmanager/core';
import { apiFetch } from '../shared/apiFetch';
import { getErrorMessage, tokenPathToUrlSegment, isAbortError, stableStringify } from '../shared/utils';
import { isAlias } from '../../shared/resolveAlias';
import type { FieldsSnapshot } from './useTokenEditorFields';
import {
  loadEditorDraft,
  clearEditorDraft,
} from './useTokenEditorUtils';
import type {
  TokenEditorDraftData,
  TokenEditorLifecycle,
  TokenEditorModeValues,
  TokenEditorServerExtensions,
  TokenEditorTokenResponse,
  TokenEditorValue,
} from '../shared/tokenEditorTypes';

function readModeValues(
  raw: unknown,
  setName: string,
): Record<string, Record<string, unknown>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const optionMap = (raw as Record<string, unknown>)[setName];
  if (!optionMap || typeof optionMap !== "object" || Array.isArray(optionMap)) {
    return {};
  }

  return { [setName]: { ...(optionMap as Record<string, unknown>) } };
}

interface UseTokenEditorLoadParams {
  serverUrl: string;
  setName: string;
  tokenPath: string;
  isCreateMode: boolean;
  initialRef: React.MutableRefObject<FieldsSnapshot | null>;
  setTokenType: (v: string) => void;
  setValue: (v: TokenEditorValue) => void;
  setDescription: (v: string) => void;
  setReference: (v: string) => void;
  setAliasMode: (v: boolean) => void;
  setScopes: (v: string[]) => void;
  setColorModifiers: (v: ColorModifierOp[]) => void;
  setModeValues: (v: TokenEditorModeValues) => void;
  setExtensionsJsonText: (v: string) => void;
  setLifecycle: (v: TokenEditorLifecycle) => void;
  setExtendsPath: (v: string) => void;
  setError: (v: string | null) => void;
  refInputRef: React.RefObject<HTMLInputElement | null>;
  valueEditorContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function useTokenEditorLoad({
  serverUrl,
  setName,
  tokenPath,
  isCreateMode,
  initialRef,
  setTokenType,
  setValue,
  setDescription,
  setReference,
  setAliasMode,
  setScopes,
  setColorModifiers,
  setModeValues,
  setExtensionsJsonText,
  setLifecycle,
  setExtendsPath,
  setError,
  refInputRef,
  valueEditorContainerRef,
}: UseTokenEditorLoadParams) {
  const [loading, setLoading] = useState(!isCreateMode);
  const [pendingDraft, setPendingDraft] = useState<TokenEditorDraftData | null>(null);
  const initialServerSnapshotRef = useRef<string | null>(null);
  const didAutoFocusRef = useRef(false);

  const encodedTokenPath = tokenPathToUrlSegment(tokenPath);

  useEffect(() => {
    didAutoFocusRef.current = false;
    initialServerSnapshotRef.current = null;
    setPendingDraft(null);
    setError(null);
    setLoading(!isCreateMode);
  }, [isCreateMode, setError, setName, tokenPath]);

  useEffect(() => {
    if (isCreateMode) return;
    const controller = new AbortController();
    const fetchToken = async () => {
      try {
        const data = await apiFetch<TokenEditorTokenResponse>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTokenPath}`, { signal: controller.signal });
        const token = data.token;
        const extensions: TokenEditorServerExtensions = token?.$extensions ?? {};
        setTokenType(token?.$type || 'string');
        setValue(token?.$value ?? '');
        setDescription(token?.$description || '');
        const savedScopes = extensions['com.figma.scopes'] ?? token?.$scopes;
        setScopes(Array.isArray(savedScopes) ? savedScopes : []);
        const savedModifiers = extensions.tokenmanager?.colorModifier;
        const loadedModifiers: ColorModifierOp[] = Array.isArray(savedModifiers) ? validateColorModifiers(savedModifiers) : [];
        setColorModifiers(loadedModifiers);
        const savedModes = extensions.tokenmanager?.modes;
        const loadedModes = readModeValues(savedModes, setName);
        setModeValues(loadedModes);
        const savedLifecycle = extensions.tokenmanager?.lifecycle;
        const loadedLifecycle: TokenEditorLifecycle = (savedLifecycle === 'draft' || savedLifecycle === 'deprecated') ? savedLifecycle : 'published';
        setLifecycle(loadedLifecycle);
        const savedExtends = extensions.tokenmanager?.extends;
        const loadedExtends = typeof savedExtends === 'string' ? savedExtends : '';
        setExtendsPath(loadedExtends);
        const ext = extensions;
        const knownExtKeys = new Set([
          'com.figma.scopes',
          'tokenmanager',
          'com.tokenmanager.recipe',
        ]);
        const otherExt: Record<string, any> = {};
        for (const [k, v] of Object.entries(ext)) {
          if (!knownExtKeys.has(k)) otherExt[k] = v;
        }
        const otherExtText = Object.keys(otherExt).length > 0 ? JSON.stringify(otherExt, null, 2) : '';
        setExtensionsJsonText(otherExtText);
        initialServerSnapshotRef.current = JSON.stringify(token ?? null);
        const ref = isAlias(token?.$value) ? token.$value : '';
        setReference(ref);
        setAliasMode(Boolean(ref));
        initialRef.current = {
          value: token?.$value ?? '',
          description: token?.$description || '',
          reference: ref,
          scopes: Array.isArray(savedScopes) ? savedScopes : [],
          type: token?.$type || 'string',
          colorModifiers: loadedModifiers,
          modeValues: loadedModes,
          extensionsJsonText: otherExtText,
          lifecycle: loadedLifecycle,
          extendsPath: loadedExtends,
        };
        // Check for a saved draft that differs from the current server state
        const draft = loadEditorDraft(setName, tokenPath);
        if (draft) {
          const init = initialRef.current!;
          const draftDiffers = (
            draft.tokenType !== init.type ||
            stableStringify(draft.value) !== stableStringify(init.value) ||
            draft.description !== init.description ||
            draft.reference !== init.reference ||
            stableStringify(draft.scopes) !== stableStringify(init.scopes) ||
            stableStringify(draft.colorModifiers) !== stableStringify(init.colorModifiers) ||
            stableStringify(draft.modeValues) !== stableStringify(init.modeValues) ||
            draft.extensionsJsonText !== init.extensionsJsonText ||
            draft.lifecycle !== init.lifecycle ||
            draft.extendsPath !== init.extendsPath
          );
          if (draftDiffers) {
            setPendingDraft(draft);
          } else {
            clearEditorDraft(setName, tokenPath);
          }
        }
      } catch (err) {
        if (isAbortError(err)) return;
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    fetchToken();
    return () => controller.abort();
  }, [
    encodedTokenPath,
    initialRef,
    isCreateMode,
    serverUrl,
    setColorModifiers,
    setDescription,
    setAliasMode,
    setError,
    setExtensionsJsonText,
    setExtendsPath,
    setLifecycle,
    setModeValues,
    setName,
    setReference,
    setScopes,
    setTokenType,
    setValue,
    tokenPath,
  ]);

  // Auto-focus the appropriate field once edit mode data finishes loading
  useEffect(() => {
    if (isCreateMode || loading || didAutoFocusRef.current) return;
    didAutoFocusRef.current = true;
    if (initialRef.current?.reference) {
      setTimeout(() => refInputRef.current?.focus(), 0);
    } else {
      const input = valueEditorContainerRef.current?.querySelector<HTMLElement>(
        'input:not([type="color"]):not([type="checkbox"]):not([type="hidden"]):not([type="radio"]), textarea'
      );
      input?.focus();
    }
  }, [initialRef, isCreateMode, loading, refInputRef, valueEditorContainerRef]);

  return {
    loading,
    pendingDraft,
    setPendingDraft,
    initialServerSnapshotRef,
  };
}
