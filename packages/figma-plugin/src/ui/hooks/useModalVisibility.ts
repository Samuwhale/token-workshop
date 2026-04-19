import { useState } from 'react';

export function useModalVisibility() {
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showQuickApply, setShowQuickApply] = useState(false);

  return {
    showPasteModal, setShowPasteModal,
    showCommandPalette, setShowCommandPalette,
    showQuickApply, setShowQuickApply,
  };
}
