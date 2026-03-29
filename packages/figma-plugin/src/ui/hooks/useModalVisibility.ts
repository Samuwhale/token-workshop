import { useState } from 'react';

export function useModalVisibility() {
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showScaffoldWizard, setShowScaffoldWizard] = useState(false);
  const [showGuidedSetup, setShowGuidedSetup] = useState(false);
  const [showColorScaleGen, setShowColorScaleGen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showQuickApply, setShowQuickApply] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSetSwitcher, setShowSetSwitcher] = useState(false);

  return {
    showPasteModal, setShowPasteModal,
    showScaffoldWizard, setShowScaffoldWizard,
    showGuidedSetup, setShowGuidedSetup,
    showColorScaleGen, setShowColorScaleGen,
    showCommandPalette, setShowCommandPalette,
    showKeyboardShortcuts, setShowKeyboardShortcuts,
    showQuickApply, setShowQuickApply,
    showClearConfirm, setShowClearConfirm,
    showSetSwitcher, setShowSetSwitcher,
  };
}
