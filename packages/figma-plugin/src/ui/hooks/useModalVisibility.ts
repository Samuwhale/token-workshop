import { useState } from 'react';

export function useModalVisibility() {
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showColorScaleGen, setShowColorScaleGen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showQuickApply, setShowQuickApply] = useState(false);
  const [showSetSwitcher, setShowSetSwitcher] = useState(false);

  return {
    showPasteModal, setShowPasteModal,
    showColorScaleGen, setShowColorScaleGen,
    showCommandPalette, setShowCommandPalette,
    showQuickApply, setShowQuickApply,
    showSetSwitcher, setShowSetSwitcher,
  };
}
