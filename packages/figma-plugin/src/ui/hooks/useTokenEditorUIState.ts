import { useState, useRef, useCallback } from 'react';
import { isAlias } from '../../shared/resolveAlias';
import type { TokenEditorValue } from '../shared/tokenEditorTypes';

interface UseTokenEditorUIStateParams {
  tokenPath: string;
}

export function useTokenEditorUIState({
  tokenPath,
}: UseTokenEditorUIStateParams) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPathAutocomplete, setShowPathAutocomplete] = useState(false);
  const [editPath, setEditPath] = useState(tokenPath);
  const pathInputWrapperRef = useRef<HTMLDivElement>(null);

  const handlePasteInValueEditor = useCallback((
    e: React.ClipboardEvent<HTMLDivElement>,
    options: {
      tokenType: string;
      value: TokenEditorValue;
      isAliasMode?: boolean;
      parsePastedValue: (type: string, text: string) => TokenEditorValue | null;
      setValue: (v: TokenEditorValue) => void;
    },
  ) => {
    const { tokenType, value, isAliasMode, parsePastedValue, setValue } = options;
    if (isAliasMode || (typeof value === 'string' && isAlias(value))) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text.trim()) return;

    const target = e.target as HTMLElement;
    const tagName = target.tagName;
    const inputType = tagName === 'INPUT' ? (target as HTMLInputElement).type : '';
    const isPlainTextInput =
      (tagName === 'INPUT' && (inputType === 'text' || inputType === 'url' || inputType === 'search' || inputType === '')) ||
      tagName === 'TEXTAREA';
    const clipboardIsJson = text.trim().startsWith('{') || text.trim().startsWith('[');

    if (isPlainTextInput && !clipboardIsJson) return;

    const parsed = parsePastedValue(tokenType, text);
    if (parsed === null) return;

    e.preventDefault();
    setValue(parsed);
  }, []);

  return {
    showDeleteConfirm,
    setShowDeleteConfirm,
    copied,
    setCopied,
    showPathAutocomplete,
    setShowPathAutocomplete,
    editPath,
    setEditPath,
    pathInputWrapperRef,
    handlePasteInValueEditor,
  };
}
