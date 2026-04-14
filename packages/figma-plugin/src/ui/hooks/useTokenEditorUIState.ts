import { useState, useRef, useCallback } from 'react';
import type { TokenEditorValue } from '../shared/tokenEditorTypes';

interface UseTokenEditorUIStateParams {
  tokenPath: string;
}

export function useTokenEditorUIState({
  tokenPath,
}: UseTokenEditorUIStateParams) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pasteFlash, setPasteFlash] = useState(false);
  const [showPathAutocomplete, setShowPathAutocomplete] = useState(false);
  const [editPath, setEditPath] = useState(tokenPath);
  const [refsExpanded, setRefsExpanded] = useState(false);
  const pathInputWrapperRef = useRef<HTMLDivElement>(null);

  const handlePasteInValueEditor = useCallback((
    e: React.ClipboardEvent<HTMLDivElement>,
    options: {
      aliasMode: boolean;
      tokenType: string;
      parsePastedValue: (type: string, text: string) => TokenEditorValue | null;
      setValue: (v: TokenEditorValue) => void;
    },
  ) => {
    const { aliasMode, tokenType, parsePastedValue, setValue } = options;
    if (aliasMode) return;
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
    setPasteFlash(true);
    setTimeout(() => setPasteFlash(false), 1500);
  }, []);

  return {
    showDeleteConfirm,
    setShowDeleteConfirm,
    copied,
    setCopied,
    pasteFlash,
    setPasteFlash,
    showPathAutocomplete,
    setShowPathAutocomplete,
    editPath,
    setEditPath,
    refsExpanded,
    setRefsExpanded,
    pathInputWrapperRef,
    handlePasteInValueEditor,
  };
}
