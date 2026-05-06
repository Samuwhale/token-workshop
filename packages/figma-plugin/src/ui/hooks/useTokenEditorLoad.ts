import { useState, useRef, useEffect } from 'react';
import type { DerivationOp, TokenCollection } from '@token-workshop/core';
import { readTokenScopes, validateDerivationOps } from '@token-workshop/core';
import { apiFetch } from '../shared/apiFetch';
import { readEditorCollectionModeValues } from '../shared/collectionModeUtils';
import { getErrorMessage, tokenPathToUrlSegment, isAbortError, stableStringify } from '../shared/utils';
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
  TokenEditorTokenWorkshopExtension,
  TokenEditorTokenResponse,
  TokenEditorValue,
} from '../shared/tokenEditorTypes';
import {
  omitTokenEditorReservedExtensions,
  splitTokenWorkshopExtension,
} from '../shared/tokenEditorTypes';
import { normalizeTokenLifecycle } from '../shared/tokenMetadata';

interface UseTokenEditorLoadParams {
  serverUrl: string;
  collectionId: string;
  collections: TokenCollection[];
  tokenPath: string;
  isCreateMode: boolean;
  initialRef: React.MutableRefObject<FieldsSnapshot | null>;
  setTokenType: (v: string) => void;
  setValue: (v: TokenEditorValue) => void;
  setDescription: (v: string) => void;
  setScopes: (v: string[]) => void;
  setDerivationOps: (v: DerivationOp[]) => void;
  setModeValues: (v: TokenEditorModeValues) => void;
  setExtensionsJsonText: (v: string) => void;
  setExtensionsJsonError: (v: string | null) => void;
  setLifecycle: (v: TokenEditorLifecycle) => void;
  setExtendsPath: (v: string) => void;
  setError: (v: string | null) => void;
  passthroughTokenWorkshopRef: React.MutableRefObject<Record<string, unknown> | null>;
  valueEditorContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function useTokenEditorLoad({
  serverUrl,
  collectionId,
  collections,
  tokenPath,
  isCreateMode,
  initialRef,
  setTokenType,
  setValue,
  setDescription,
  setScopes,
  setDerivationOps,
  setModeValues,
  setExtensionsJsonText,
  setExtensionsJsonError,
  setLifecycle,
  setExtendsPath,
  setError,
  passthroughTokenWorkshopRef,
  valueEditorContainerRef,
}: UseTokenEditorLoadParams) {
  const [loading, setLoading] = useState(!isCreateMode);
  const [pendingDraft, setPendingDraft] = useState<TokenEditorDraftData | null>(null);
  const initialServerSnapshotRef = useRef<string | null>(null);
  const didAutoFocusRef = useRef(false);

  const encodedTokenPath = tokenPathToUrlSegment(tokenPath);
  const collection = collections.find((entry) => entry.id === collectionId) ?? null;

  useEffect(() => {
    didAutoFocusRef.current = false;
    initialServerSnapshotRef.current = null;
    passthroughTokenWorkshopRef.current = null;
    setPendingDraft(null);
    setError(null);
    setExtensionsJsonError(null);
    setLoading(!isCreateMode);
  }, [
    collectionId,
    isCreateMode,
    passthroughTokenWorkshopRef,
    setError,
    setExtensionsJsonError,
    tokenPath,
  ]);

  useEffect(() => {
    if (isCreateMode) return;
    const controller = new AbortController();
    const fetchToken = async () => {
      try {
        const data = await apiFetch<TokenEditorTokenResponse>(`${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/${encodedTokenPath}`, { signal: controller.signal });
        const token = data.token;
        const extensions: TokenEditorServerExtensions = token?.$extensions ?? {};
        const { managed: tokenWorkshopExtension, passthrough: passthroughTokenWorkshop } = splitTokenWorkshopExtension(
          extensions.tokenworkshop as TokenEditorTokenWorkshopExtension | undefined,
        );
        passthroughTokenWorkshopRef.current =
          Object.keys(passthroughTokenWorkshop).length > 0
            ? passthroughTokenWorkshop
            : null;
        setTokenType(token?.$type || 'string');
        setValue(token?.$value ?? '');
        setDescription(token?.$description || '');
        const savedScopes = readTokenScopes({ $extensions: extensions });
        setScopes(savedScopes);
        const savedDerivation = tokenWorkshopExtension.derivation;
        const loadedDerivationOps: DerivationOp[] = savedDerivation && Array.isArray(savedDerivation.ops)
          ? validateDerivationOps(savedDerivation.ops)
          : [];
        setDerivationOps(loadedDerivationOps);
        const savedModes = tokenWorkshopExtension.modes;
        const loadedModes = readEditorCollectionModeValues(savedModes, collection);
        setModeValues(loadedModes);
        const loadedLifecycle: TokenEditorLifecycle = normalizeTokenLifecycle(tokenWorkshopExtension.lifecycle);
        setLifecycle(loadedLifecycle);
        const savedExtends = tokenWorkshopExtension.extends;
        const loadedExtends = typeof savedExtends === 'string' ? savedExtends : '';
        setExtendsPath(loadedExtends);
        const otherExt = omitTokenEditorReservedExtensions(extensions);
        const otherExtText = Object.keys(otherExt).length > 0 ? JSON.stringify(otherExt, null, 2) : '';
        setExtensionsJsonText(otherExtText);
        setExtensionsJsonError(null);
        initialServerSnapshotRef.current = stableStringify(token ?? null);
        initialRef.current = {
          value: token?.$value ?? '',
          description: token?.$description || '',
          scopes: savedScopes,
          type: token?.$type || 'string',
          derivationOps: loadedDerivationOps,
          modeValues: loadedModes,
          extensionsJsonText: otherExtText,
          lifecycle: loadedLifecycle,
          extendsPath: loadedExtends,
        };
        const draft = loadEditorDraft(collectionId, tokenPath);
        if (draft) {
          const init = initialRef.current!;
          const draftDiffers = (
            draft.tokenType !== init.type ||
            stableStringify(draft.value) !== stableStringify(init.value) ||
            draft.description !== init.description ||
            stableStringify(draft.scopes) !== stableStringify(init.scopes) ||
            stableStringify(draft.derivationOps) !== stableStringify(init.derivationOps) ||
            stableStringify(draft.modeValues) !== stableStringify(init.modeValues) ||
            draft.extensionsJsonText !== init.extensionsJsonText ||
            draft.lifecycle !== init.lifecycle ||
            draft.extendsPath !== init.extendsPath
          );
          if (draftDiffers) {
            setPendingDraft(draft);
          } else {
            clearEditorDraft(collectionId, tokenPath);
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
    setDerivationOps,
    setDescription,
    setError,
    setExtensionsJsonText,
    setExtensionsJsonError,
    setExtendsPath,
    setLifecycle,
    setModeValues,
    passthroughTokenWorkshopRef,
    collectionId,
    collection,
    setScopes,
    setTokenType,
    setValue,
    tokenPath,
  ]);

  useEffect(() => {
    if (isCreateMode || loading || didAutoFocusRef.current) return;
    didAutoFocusRef.current = true;
    const input = valueEditorContainerRef.current?.querySelector<HTMLElement>(
      'input:not([type="color"]):not([type="checkbox"]):not([type="hidden"]):not([type="radio"]), textarea'
    );
    input?.focus();
  }, [initialRef, isCreateMode, loading, valueEditorContainerRef]);

  return {
    loading,
    pendingDraft,
    setPendingDraft,
    initialServerSnapshotRef,
  };
}
