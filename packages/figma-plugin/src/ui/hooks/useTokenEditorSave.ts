import { useState, useRef, useEffect } from 'react';
import type { ColorModifierOp } from '@tokenmanager/core';
import { ApiError } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
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
import type {
  TokenEditorLifecycle,
  TokenEditorModeValues,
  TokenEditorTokenResponse,
  TokenEditorValue,
} from '../shared/tokenEditorTypes';

interface UseTokenEditorSaveParams {
  serverUrl: string;
  setName: string;
  tokenPath: string;
  isCreateMode: boolean;
  editPath: string;
  tokenType: string;
  value: TokenEditorValue;
  reference: string;
  description: string;
  scopes: string[];
  colorModifiers: ColorModifierOp[];
  modeValues: TokenEditorModeValues;
  extensionsJsonText: string;
  lifecycle: TokenEditorLifecycle;
  extendsPath: string;
  initialServerSnapshotRef: React.MutableRefObject<string | null>;
  onBack: () => void;
  requestClose: () => void;
  onSaved?: (savedPath: string) => void;
  onSaveAndCreateAnother?: (savedPath: string, tokenType: string) => void;
  pushUndo?: (slot: UndoSlot) => void;
  // For keyboard handler
  handleToggleAlias: () => void;
  showAutocomplete: boolean;
  setShowAutocomplete: (v: boolean) => void;
}

export function useTokenEditorSave({
  serverUrl,
  setName,
  tokenPath,
  isCreateMode,
  editPath,
  tokenType,
  value,
  reference,
  description,
  scopes,
  colorModifiers,
  modeValues,
  extensionsJsonText,
  lifecycle,
  extendsPath,
  initialServerSnapshotRef,
  onBack,
  requestClose,
  onSaved,
  onSaveAndCreateAnother,
  pushUndo,
  handleToggleAlias,
  showAutocomplete,
  setShowAutocomplete,
}: UseTokenEditorSaveParams) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConflictConfirm, setShowConflictConfirm] = useState(false);
  const [saveRetryArgs, setSaveRetryArgs] = useState<[boolean, boolean] | null>(null);
  const handleSaveRef = useRef<(forceOverwrite?: boolean, createAnother?: boolean) => Promise<boolean>>(async () => false);

  const handleDelete = async () => {
    try {
      await deleteToken(serverUrl, setName, tokenPath);
      onBack();
    } catch (err) {
      setError(getErrorMessage(err, 'Delete failed'));
    }
  };

  const handleSave = async (forceOverwrite = false, createAnother = false) => {
    if (isCreateMode && !editPath.trim()) {
      setSaveRetryArgs(null);
      setError('Token path cannot be empty');
      return false;
    }
    setSaving(true);
    setSaveRetryArgs(null);
    setError(null);
    try {
      if (!isCreateMode && !forceOverwrite && initialServerSnapshotRef.current !== null) {
        try {
          const checkData = await fetchToken<TokenEditorTokenResponse>(serverUrl, setName, tokenPath);
          const currentSnapshot = JSON.stringify(checkData.token ?? null);
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
      const tmExt: Record<string, any> = {};
      if (colorModifiers.length > 0) tmExt.colorModifier = colorModifiers;
      const cleanModes: Record<string, Record<string, unknown>> = {};
      for (const [dimId, opts] of Object.entries(modeValues)) {
        if (!opts || typeof opts !== 'object') continue;
        const cleanOpts = Object.fromEntries(
          Object.entries(opts).filter(([, v]) => v !== '' && v !== undefined && v !== null),
        );
        if (Object.keys(cleanOpts).length > 0) cleanModes[dimId] = cleanOpts;
      }
      if (Object.keys(cleanModes).length > 0) tmExt.modes = cleanModes;
      if (lifecycle !== 'published') tmExt.lifecycle = lifecycle;
      if (extendsPath) tmExt.extends = extendsPath;
      if (Object.keys(tmExt).length > 0) extensions.tokenmanager = tmExt;
      const trimmedExtJson = extensionsJsonText.trim();
      if (trimmedExtJson && trimmedExtJson !== '{}') {
        try {
          const parsed = JSON.parse(trimmedExtJson);
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.assign(extensions, parsed);
          }
        } catch (err) {
          console.debug('[TokenEditor] invalid extensions JSON:', err);
          setSaveRetryArgs(null);
          setError('Invalid JSON in Extensions — fix before saving');
          setSaving(false);
          return false;
        }
      }
      if (initialServerSnapshotRef.current) {
        try {
          const initialToken = JSON.parse(initialServerSnapshotRef.current) as {
            $extensions?: Record<string, unknown>;
          } | null;
          const generatorOwnership =
            initialToken?.$extensions?.['com.tokenmanager.generator'];
          if (generatorOwnership !== undefined) {
            extensions['com.tokenmanager.generator'] = generatorOwnership;
          }
        } catch (err) {
          console.debug('[TokenEditor] failed to preserve generator ownership extension:', err);
        }
      }
      const body = createTokenValueBody({
        type: tokenType,
        value: reference || value,
        description: description || undefined,
        extensions,
      });

      const targetPath = isCreateMode ? editPath.trim() : tokenPath;
      if (isCreateMode) {
        await createToken(serverUrl, setName, targetPath, body);
      } else {
        await updateToken(serverUrl, setName, targetPath, body);
      }
      await applyTokenMutationSuccess({
        onAfterSave: () => {
          clearEditorDraft(setName, targetPath);
          if (pushUndo) {
            if (isCreateMode) {
              pushUndo({
                description: `Created token "${targetPath}"`,
                restore: async () => {
                  await deleteToken(serverUrl, setName, targetPath);
                },
              });
            } else if (initialServerSnapshotRef.current !== null) {
              const previousTokenJson = initialServerSnapshotRef.current;
              const previousBody = JSON.parse(previousTokenJson);
              pushUndo({
                description: `Edited token "${targetPath}"`,
                restore: async () => {
                  await updateToken(serverUrl, setName, targetPath, previousBody);
                },
                redo: async () => {
                  await updateToken(serverUrl, setName, targetPath, body);
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
        if (showAutocomplete) { setShowAutocomplete(false); return; }
        requestClose();
      }
      if (matchesShortcut(e, 'EDITOR_TOGGLE_ALIAS')) {
        e.preventDefault();
        handleToggleAlias();
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
        // ⌘S: undocumented alternative save shortcut (not in registry)
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [requestClose, showAutocomplete, handleToggleAlias, isCreateMode, onSaveAndCreateAnother, setShowAutocomplete]);

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
