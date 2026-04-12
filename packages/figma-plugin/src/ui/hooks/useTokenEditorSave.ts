import { useState, useRef, useEffect } from 'react';
import type { ColorModifierOp } from '@tokenmanager/core';
import { ApiError } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import {
  applyTokenMutationSuccess,
  createToken,
  createTokenBody,
  deleteToken,
  fetchToken,
  updateToken,
} from '../shared/tokenMutations';
import { clearEditorDraft } from './useTokenEditorUtils';
import type { UndoSlot } from './useUndo';
import { matchesShortcut } from '../shared/shortcutRegistry';

interface UseTokenEditorSaveParams {
  serverUrl: string;
  setName: string;
  tokenPath: string;
  isCreateMode: boolean;
  editPath: string;
  tokenType: string;
  value: any;
  reference: string;
  description: string;
  scopes: string[];
  colorModifiers: ColorModifierOp[];
  modeValues: Record<string, any>;
  extensionsJsonText: string;
  lifecycle: 'draft' | 'published' | 'deprecated';
  extendsPath: string;
  initialServerSnapshotRef: React.MutableRefObject<string | null>;
  onBack: () => void;
  onSaved?: (savedPath: string) => void;
  onSaveAndCreateAnother?: (savedPath: string, tokenType: string) => void;
  pushUndo?: (slot: UndoSlot) => void;
  // For keyboard handler
  handleToggleAlias: () => void;
  handleBack: () => void;
  showDiscardConfirm: boolean;
  setShowDiscardConfirm: (v: boolean) => void;
  showAutocomplete: boolean;
  setShowAutocomplete: (v: boolean) => void;
  isDirty: boolean;
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
  onSaved,
  onSaveAndCreateAnother,
  pushUndo,
  handleToggleAlias,
  handleBack,
  showDiscardConfirm,
  setShowDiscardConfirm,
  showAutocomplete,
  setShowAutocomplete,
  isDirty,
}: UseTokenEditorSaveParams) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConflictConfirm, setShowConflictConfirm] = useState(false);
  const [saveRetryArgs, setSaveRetryArgs] = useState<[boolean, boolean] | null>(null);
  const handleSaveRef = useRef<(forceOverwrite?: boolean, createAnother?: boolean) => void>(() => {});

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
      return;
    }
    setSaving(true);
    setSaveRetryArgs(null);
    setError(null);
    try {
      if (!isCreateMode && !forceOverwrite && initialServerSnapshotRef.current !== null) {
        try {
          const checkData = await fetchToken<{ token?: any }>(serverUrl, setName, tokenPath);
          const currentSnapshot = JSON.stringify(checkData.token ?? null);
          if (currentSnapshot !== initialServerSnapshotRef.current) {
            setShowConflictConfirm(true);
            setSaving(false);
            return;
          }
        } catch (err) {
          console.warn('[TokenEditor] conflict check failed, proceeding with save:', err);
        }
      }

      const extensions: Record<string, any> = {};
      if (scopes.length > 0) extensions['com.figma.scopes'] = scopes;
      const tmExt: Record<string, any> = {};
      if (colorModifiers.length > 0) tmExt.colorModifier = colorModifiers;
      const cleanModes = Object.fromEntries(Object.entries(modeValues).filter(([, v]) => v !== '' && v !== undefined && v !== null));
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
          return;
        }
      }
      const body = createTokenBody({
        $type: tokenType,
        $value: reference || value,
        $description: description || undefined,
        $extensions: Object.keys(extensions).length > 0 ? extensions : undefined,
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
    } catch (err) {
      if (isCreateMode && err instanceof ApiError && err.status === 409) {
        setError(`Token "${editPath.trim()}" already exists`);
      } else {
        setError(getErrorMessage(err));
      }
      setSaveRetryArgs([forceOverwrite, createAnother]);
    } finally {
      setSaving(false);
    }
  };

  handleSaveRef.current = handleSave;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showDiscardConfirm) { setShowDiscardConfirm(false); return; }
        if (showAutocomplete) { setShowAutocomplete(false); return; }
        handleBack();
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
  }, [onBack, isDirty, showDiscardConfirm, showAutocomplete, handleToggleAlias, isCreateMode, onSaveAndCreateAnother, handleBack, setShowDiscardConfirm, setShowAutocomplete]);

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
