import { useState, useRef, useEffect } from 'react';
import type { ColorModifierOp } from '@tokenmanager/core';
import { validateColorModifiers } from '@tokenmanager/core';
import { apiFetch } from '../shared/apiFetch';
import { getErrorMessage, tokenPathToUrlSegment, isAbortError } from '../shared/utils';
import { isAlias } from '../../shared/resolveAlias';
import type { FieldsSnapshot } from './useTokenEditorFields';
import {
  loadEditorDraft,
  clearEditorDraft,
  type EditorDraftData,
} from './useTokenEditorUtils';

interface UseTokenEditorLoadParams {
  serverUrl: string;
  setName: string;
  tokenPath: string;
  isCreateMode: boolean;
  initialRef: React.MutableRefObject<FieldsSnapshot | null>;
  setTokenType: (v: string) => void;
  setValue: (v: any) => void;
  setDescription: (v: string) => void;
  setReference: (v: string) => void;
  setAliasMode: (v: boolean) => void;
  setScopes: (v: string[]) => void;
  setColorModifiers: (v: ColorModifierOp[]) => void;
  setModeValues: (v: Record<string, unknown>) => void;
  setExtensionsJsonText: (v: string) => void;
  setLifecycle: (v: 'draft' | 'published' | 'deprecated') => void;
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
  const [pendingDraft, setPendingDraft] = useState<EditorDraftData | null>(null);
  const initialServerSnapshotRef = useRef<string | null>(null);
  const didAutoFocusRef = useRef(false);

  const encodedTokenPath = tokenPathToUrlSegment(tokenPath);

  useEffect(() => {
    if (isCreateMode) return;
    const controller = new AbortController();
    const fetchToken = async () => {
      try {
        const data = await apiFetch<{ token?: any }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTokenPath}`, { signal: controller.signal });
        const token = data.token;
        setTokenType(token?.$type || 'string');
        setValue(token?.$value ?? '');
        setDescription(token?.$description || '');
        const savedScopes = token?.$extensions?.['com.figma.scopes'] ?? token?.$scopes;
        setScopes(Array.isArray(savedScopes) ? savedScopes : []);
        const savedModifiers = token?.$extensions?.tokenmanager?.colorModifier;
        const loadedModifiers: ColorModifierOp[] = Array.isArray(savedModifiers) ? validateColorModifiers(savedModifiers) : [];
        setColorModifiers(loadedModifiers);
        const savedModes = token?.$extensions?.tokenmanager?.modes;
        const loadedModes: Record<string, unknown> = (savedModes && typeof savedModes === 'object' && !Array.isArray(savedModes)) ? savedModes as Record<string, unknown> : {};
        setModeValues(loadedModes);
        const savedLifecycle = token?.$extensions?.tokenmanager?.lifecycle;
        const loadedLifecycle: 'draft' | 'published' | 'deprecated' = (savedLifecycle === 'draft' || savedLifecycle === 'deprecated') ? savedLifecycle : 'published';
        setLifecycle(loadedLifecycle);
        const savedExtends = token?.$extensions?.tokenmanager?.extends;
        const loadedExtends = typeof savedExtends === 'string' ? savedExtends : '';
        setExtendsPath(loadedExtends);
        const ext = token?.$extensions ?? {};
        const knownExtKeys = new Set(['com.figma.scopes', 'tokenmanager']);
        const otherExt: Record<string, any> = {};
        for (const [k, v] of Object.entries(ext)) {
          if (!knownExtKeys.has(k)) otherExt[k] = v;
        }
        const otherExtText = Object.keys(otherExt).length > 0 ? JSON.stringify(otherExt, null, 2) : '';
        setExtensionsJsonText(otherExtText);
        initialServerSnapshotRef.current = JSON.stringify(token ?? null);
        const ref = isAlias(token?.$value) ? token.$value : '';
        if (ref) setReference(ref);
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
        if (isAlias(token?.$value)) {
          setReference(token.$value);
        }
        // Check for a saved draft that differs from the current server state
        const draft = loadEditorDraft(setName, tokenPath);
        if (draft) {
          const init = initialRef.current!;
          const draftDiffers = (
            draft.tokenType !== init.type ||
            JSON.stringify(draft.value) !== JSON.stringify(init.value) ||
            draft.description !== init.description ||
            draft.reference !== init.reference ||
            JSON.stringify(draft.scopes) !== JSON.stringify(init.scopes) ||
            JSON.stringify(draft.colorModifiers) !== JSON.stringify(init.colorModifiers) ||
            JSON.stringify(draft.modeValues) !== JSON.stringify(init.modeValues) ||
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, setName, tokenPath, isCreateMode]);

  // Sync alias mode with loaded reference
  useEffect(() => {
    if (initialRef.current?.reference) setAliasMode(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return {
    loading,
    pendingDraft,
    setPendingDraft,
    initialServerSnapshotRef,
  };
}
