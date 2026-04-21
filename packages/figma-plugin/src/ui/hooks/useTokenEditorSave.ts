import { useState, useRef, useEffect } from 'react';
import type { ColorModifierOp } from '@tokenmanager/core';
import { ApiError } from '../shared/apiFetch';
import { getErrorMessage, stableStringify } from '../shared/utils';
import {
  applyTokenMutationSuccess,
  createToken,
  createTokenValueBody,
  deleteToken,
  fetchToken,
  updateToken,
} from '../shared/tokenMutations';
import { clearEditorDraft } from './useTokenEditorUtils';
import type { UndoSlot } from './useUndo';
import { matchesShortcut } from '../shared/shortcutRegistry';
import type { TokenCollection } from '@tokenmanager/core';
import { sanitizeEditorCollectionModeValues } from '../shared/collectionModeUtils';
import type {
  TokenEditorLifecycle,
  TokenEditorModeValues,
  TokenEditorTokenManagerExtension,
  TokenEditorTokenResponse,
  TokenEditorValue,
} from '../shared/tokenEditorTypes';
import { omitTokenEditorReservedExtensions } from '../shared/tokenEditorTypes';

interface UseTokenEditorSaveParams {
  serverUrl: string;
  collectionId: string;
  tokenPath: string;
  isCreateMode: boolean;
  editPath: string;
  tokenType: string;
  value: TokenEditorValue;
  description: string;
  scopes: string[];
  colorModifiers: ColorModifierOp[];
  modeValues: TokenEditorModeValues;
  extensionsJsonText: string;
  lifecycle: TokenEditorLifecycle;
  extendsPath: string;
  initialServerSnapshotRef: React.MutableRefObject<string | null>;
  passthroughTokenManagerRef: React.MutableRefObject<Record<string, unknown> | null>;
  onBack: () => void;
  requestClose: () => void;
  onSaved?: (savedPath: string) => void;
  onSaveAndCreateAnother?: (savedPath: string, tokenType: string) => void;
  pushUndo?: (slot: UndoSlot) => void;
  beforeSave?: (
    forceOverwrite: boolean,
    createAnother: boolean,
  ) => Promise<boolean> | boolean;
  collections: TokenCollection[];
}

export function useTokenEditorSave({
  serverUrl,
  collectionId,
  tokenPath,
  isCreateMode,
  editPath,
  tokenType,
  value,
  description,
  scopes,
  colorModifiers,
  modeValues,
  extensionsJsonText,
  lifecycle,
  extendsPath,
  collections,
  initialServerSnapshotRef,
  passthroughTokenManagerRef,
  onBack,
  requestClose,
  onSaved,
  onSaveAndCreateAnother,
  pushUndo,
  beforeSave,
}: UseTokenEditorSaveParams) {
  const collection = collections.find((c) => c.id === collectionId) ?? null;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConflictConfirm, setShowConflictConfirm] = useState(false);
  const [saveRetryArgs, setSaveRetryArgs] = useState<[boolean, boolean] | null>(null);
  const handleSaveRef = useRef<(forceOverwrite?: boolean, createAnother?: boolean) => Promise<boolean>>(async () => false);

  const handleDelete = async () => {
    try {
      await deleteToken(serverUrl, collectionId, tokenPath);
      onBack();
    } catch (err) {
      setError(getErrorMessage(err, 'Delete failed'));
    }
  };

  const handleSave = async (forceOverwrite = false, createAnother = false) => {
    if (beforeSave) {
      const shouldContinue = await beforeSave(forceOverwrite, createAnother);
      if (!shouldContinue) {
        return false;
      }
    }
    if (isCreateMode && !editPath.trim()) {
      setSaveRetryArgs(null);
      setError('Token path cannot be empty');
      return false;
    }
    if (collection && collection.modes.length >= 2) {
      const isEmpty = (v: unknown) => v === '' || v === undefined || v === null;
      if (isEmpty(value)) {
        setSaveRetryArgs(null);
        setError(`All modes must have a value (${collection.modes[0].name} is empty)`);
        return false;
      }
      const collectionModes = modeValues[collectionId] ?? {};
      for (let i = 1; i < collection.modes.length; i++) {
        const modeName = collection.modes[i].name;
        if (isEmpty(collectionModes[modeName])) {
          setSaveRetryArgs(null);
          setError(`All modes must have a value (${modeName} is empty)`);
          return false;
        }
      }
    }
    setSaving(true);
    setSaveRetryArgs(null);
    setError(null);
    try {
      if (!isCreateMode && !forceOverwrite && initialServerSnapshotRef.current !== null) {
        try {
          const checkData = await fetchToken<TokenEditorTokenResponse>(serverUrl, collectionId, tokenPath);
          const currentSnapshot = stableStringify(checkData.token ?? null);
          if (currentSnapshot !== initialServerSnapshotRef.current) {
            setShowConflictConfirm(true);
            setSaving(false);
            return false;
          }
        } catch (err) {
          console.warn('[TokenEditor] conflict check failed, proceeding with save:', err);
        }
      }

      const extensions: Record<string, any> = {};
      if (scopes.length > 0) extensions['com.figma.scopes'] = scopes;
      const tmExt: TokenEditorTokenManagerExtension = passthroughTokenManagerRef.current
        ? { ...passthroughTokenManagerRef.current }
        : {};
      if (colorModifiers.length > 0) {
        tmExt.colorModifier = colorModifiers;
      } else {
        delete tmExt.colorModifier;
      }
      const cleanModes = sanitizeEditorCollectionModeValues(modeValues, collection);
      if (Object.keys(cleanModes).length > 0) {
        tmExt.modes = cleanModes;
      } else {
        delete tmExt.modes;
      }
      if (lifecycle !== 'published') {
        tmExt.lifecycle = lifecycle;
      } else {
        delete tmExt.lifecycle;
      }
      if (extendsPath) {
        tmExt.extends = extendsPath;
      } else {
        delete tmExt.extends;
      }
      if (Object.keys(tmExt).length > 0) extensions.tokenmanager = tmExt;
      const trimmedExtJson = extensionsJsonText.trim();
      if (trimmedExtJson && trimmedExtJson !== '{}') {
        try {
          const parsed = JSON.parse(trimmedExtJson);
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.assign(extensions, omitTokenEditorReservedExtensions(parsed));
          }
        } catch (err) {
          console.debug('[TokenEditor] invalid extensions JSON:', err);
          setSaveRetryArgs(null);
          setError('Invalid JSON in Extensions — fix before saving');
          setSaving(false);
          return false;
        }
      }
      const body = createTokenValueBody({
        type: tokenType,
        value,
        description: description || undefined,
        extensions,
      });

      const targetPath = isCreateMode ? editPath.trim() : tokenPath;
      if (isCreateMode) {
        await createToken(serverUrl, collectionId, targetPath, body);
      } else {
        await updateToken(serverUrl, collectionId, targetPath, body);
      }
      await applyTokenMutationSuccess({
        onAfterSave: () => {
          clearEditorDraft(collectionId, targetPath);
          if (pushUndo) {
            if (isCreateMode) {
              pushUndo({
                description: `Created token "${targetPath}"`,
                restore: async () => {
                  await deleteToken(serverUrl, collectionId, targetPath);
                },
              });
            } else if (initialServerSnapshotRef.current !== null) {
              const previousTokenJson = initialServerSnapshotRef.current;
              const previousBody = JSON.parse(previousTokenJson);
              pushUndo({
                description: `Edited token "${targetPath}"`,
                restore: async () => {
                  await updateToken(serverUrl, collectionId, targetPath, previousBody);
                },
                redo: async () => {
                  await updateToken(serverUrl, collectionId, targetPath, body);
                },
              });
            }
          }
          onSaved?.(targetPath);
        },
        successMessage: `Token "${targetPath}" ${isCreateMode ? 'created' : 'saved'}`,
      });
      if (createAnother && isCreateMode && onSaveAndCreateAnother) {
        onSaveAndCreateAnother(targetPath, tokenType);
      } else {
        onBack();
      }
      return true;
    } catch (err) {
      if (isCreateMode && err instanceof ApiError && err.status === 409) {
        setError(`Token "${editPath.trim()}" already exists`);
      } else {
        setError(getErrorMessage(err));
      }
      setSaveRetryArgs([forceOverwrite, createAnother]);
      return false;
    } finally {
      setSaving(false);
    }
  };

  handleSaveRef.current = handleSave;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      }
      if (matchesShortcut(e, 'EDITOR_SAVE_AND_NEW')) {
        e.preventDefault();
        if (isCreateMode && onSaveAndCreateAnother) {
          handleSaveRef.current(false, true);
        } else {
          handleSaveRef.current();
        }
      }
      if (matchesShortcut(e, 'EDITOR_SAVE')) {
        e.preventDefault();
        handleSaveRef.current();
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [requestClose, isCreateMode, onSaveAndCreateAnother]);

  return {
    saving,
    error,
    setError,
    showConflictConfirm,
    setShowConflictConfirm,
    saveRetryArgs,
    setSaveRetryArgs,
    handleSaveRef,
    handleSave,
    handleDelete,
  };
}
