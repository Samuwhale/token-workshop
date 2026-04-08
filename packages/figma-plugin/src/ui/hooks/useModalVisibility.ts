import { useState } from 'react';

export function useModalVisibility() {
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showColorScaleGen, setShowColorScaleGen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showQuickApply, setShowQuickApply] = useState(false);
  const [showSetSwitcher, setShowSetSwitcher] = useState(false);

  return {
    showPasteModal, setShowPasteModal,
    showColorScaleGen, setShowColorScaleGen,
    showCommandPalette, setShowCommandPalette,
    showKeyboardShortcuts, setShowKeyboardShortcuts,
    showQuickApply, setShowQuickApply,
    showSetSwitcher, setShowSetSwitcher,
  };
}
