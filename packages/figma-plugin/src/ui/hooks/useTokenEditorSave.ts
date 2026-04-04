import { useState, useRef, useEffect } from 'react';
import type { ColorModifierOp } from '@tokenmanager/core';
import { apiFetch } from '../shared/apiFetch';
import { getErrorMessage, tokenPathToUrlSegment } from '../shared/utils';
import { clearEditorDraft } from './useTokenEditorUtils';

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

  const encodedTokenPath = tokenPathToUrlSegment(tokenPath);

  const handleDelete = async () => {
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTokenPath}`, { method: 'DELETE' });
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
          const checkData = await apiFetch<{ token?: any }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTokenPath}`);
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

      const body: any = {
        $type: tokenType,
        $value: reference || value,
      };
      if (description) body.$description = description;
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
      if (Object.keys(extensions).length > 0) body.$extensions = extensions;

      const targetPath = isCreateMode ? editPath.trim() : tokenPath;
      const encodedTargetPath = tokenPathToUrlSegment(targetPath);
      const method = isCreateMode ? 'POST' : 'PATCH';
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTargetPath}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const label = isCreateMode ? 'created' : 'saved';
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Token "${targetPath}" ${label}` } }, '*');
      clearEditorDraft(setName, targetPath);
      onSaved?.(targetPath);
      if (createAnother && isCreateMode && onSaveAndCreateAnother) {
        onSaveAndCreateAnother(targetPath, tokenType);
      } else {
        onBack();
      }
    } catch (err) {
      setError(getErrorMessage(err));
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
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        handleToggleAlias();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey && isCreateMode && onSaveAndCreateAnother) {
          handleSaveRef.current(false, true);
        } else {
          handleSaveRef.current();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
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
