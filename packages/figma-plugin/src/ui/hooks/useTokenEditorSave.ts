import { useState, useRef, useEffect } from 'react';
import { TokenValidator, type DerivationOp, type Token } from '@tokenmanager/core';
import { ApiError } from '../shared/apiFetch';
import { getErrorMessage, stableStringify } from '../shared/utils';
import {
  applyTokenMutationSuccess,
  createToken,
  createTokenMutationBodyFromSnapshot,
  type TokenMutationBody,
  deleteToken,
  fetchToken,
  updateToken,
} from '../shared/tokenMutations';
import { clearEditorDraft } from './useTokenEditorUtils';
import type { UndoSlot } from './useUndo';
import { matchesShortcut } from '../shared/shortcutRegistry';
import type { TokenCollection } from '@tokenmanager/core';
import { buildTokenEditorValueBody } from '../shared/tokenEditorPayload';
import type {
  TokenEditorLifecycle,
  TokenEditorServerToken,
  TokenEditorModeValues,
  TokenEditorTokenResponse,
  TokenEditorValue,
} from '../shared/tokenEditorTypes';

const tokenValidator = new TokenValidator();

function isTokenSnapshotWithValue(
  token: TokenEditorServerToken | null,
): token is TokenEditorServerToken & Pick<Token, '$value'> {
  return Boolean(token) && Object.prototype.hasOwnProperty.call(token, '$value');
}

function getModeValueValidationError(
  tokenType: string,
  modeName: string,
  value: unknown,
): string | null {
  if (value === undefined || value === null) {
    return `All modes must have a value (${modeName} is empty)`;
  }

  const result = tokenValidator.validate(
    {
      $type: tokenType as Token['$type'],
      $value: value as Token['$value'],
    },
    modeName,
  );
  if (result.valid) {
    return null;
  }

  const [firstError] = result.errors;
  return firstError ?? `Invalid value for mode "${modeName}"`;
}

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
  derivationOps: DerivationOp[];
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
  derivationOps,
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
      const collectionModes = modeValues[collectionId] ?? {};
      for (let i = 0; i < collection.modes.length; i++) {
        const modeName = collection.modes[i].name;
        const modeValue = i === 0 ? value : collectionModes[modeName];
        const modeValueError = getModeValueValidationError(
          tokenType,
          modeName,
          modeValue,
        );
        if (modeValueError) {
          setSaveRetryArgs(null);
          setError(modeValueError);
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

      let body: TokenMutationBody;
      try {
        body = buildTokenEditorValueBody({
          tokenType,
          value,
          description,
          scopes,
          derivationOps,
          modeValues,
          collection,
          passthroughTokenManager: passthroughTokenManagerRef.current,
          lifecycle,
          extendsPath,
          extensionsJsonText,
          clearEmptyDescription: !isCreateMode,
          clearEmptyExtensions: !isCreateMode,
        });
      } catch (err) {
        console.debug('[TokenEditor] invalid extensions JSON:', err);
        setSaveRetryArgs(null);
        setError('Invalid JSON in Extensions — fix before saving');
        setSaving(false);
        return false;
      }

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
              const previousSnapshot = JSON.parse(
                initialServerSnapshotRef.current,
              ) as TokenEditorServerToken | null;
              if (!isTokenSnapshotWithValue(previousSnapshot)) {
                throw new Error('Token editor undo snapshot is missing $value');
              }
              const previousBody = createTokenMutationBodyFromSnapshot(
                previousSnapshot,
              );
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
