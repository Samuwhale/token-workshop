import { useState, useRef, useCallback } from 'react';

interface UseTokenEditorUIStateParams {
  isDirty: boolean;
  onBack: () => void;
  setShowDiscardConfirm: (v: boolean) => void;
  tokenType: string;
  aliasMode: boolean;
  value: any;
  tokenPath: string;
  setName: string;
}

export function useTokenEditorUIState({
  isDirty,
  onBack,
  setShowDiscardConfirm,
  tokenType,
  aliasMode,
  value: _value,
  tokenPath,
  setName: _setName,
}: UseTokenEditorUIStateParams) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pasteFlash, setPasteFlash] = useState(false);
  const [showPathAutocomplete, setShowPathAutocomplete] = useState(false);
  const [editPath, setEditPath] = useState(tokenPath);
  const [refsExpanded, setRefsExpanded] = useState(false);
  const pathInputWrapperRef = useRef<HTMLDivElement>(null);

  const handleBack = useCallback(() => {
    if (isDirty) { setShowDiscardConfirm(true); } else { onBack(); }
  }, [isDirty, onBack, setShowDiscardConfirm]);

  const handlePasteInValueEditor = useCallback((e: React.ClipboardEvent<HTMLDivElement>, parsePastedValue: (type: string, text: string) => any | null, setValue: (v: any) => void) => {
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
  }, [aliasMode, tokenType]);

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
    handleBack,
    handlePasteInValueEditor,
  };
}
