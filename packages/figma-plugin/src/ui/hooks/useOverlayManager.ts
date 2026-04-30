import { useState, useCallback } from "react";
import type { StartHereBranch } from "../components/WelcomePrompt";
import { STORAGE_KEYS, lsGet, lsSet } from "../shared/storage";

interface PaletteDeleteConfirm {
  paths: string[];
  label: string;
  collectionId: string;
}

export function useOverlayManager() {
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showQuickApply, setShowQuickApply] = useState(false);
  const [showCollectionCreateDialog, setShowCollectionCreateDialog] =
    useState(false);
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] =
    useState("");
  const [paletteDeleteConfirm, setPaletteDeleteConfirm] =
    useState<PaletteDeleteConfirm | null>(null);

  const initialFirstRun = !lsGet(STORAGE_KEYS.FIRST_RUN_DONE);
  const [startHereState, setStartHereState] = useState<{
    open: boolean;
    initialBranch: StartHereBranch;
  }>(() => ({
    open: initialFirstRun,
    initialBranch: "root",
  }));

  const dismissEphemeralOverlays = useCallback(() => {
    setShowCommandPalette(false);
    setShowQuickApply(false);
  }, []);

  const openStartHere = useCallback(
    (initialBranch: StartHereBranch = "root") => {
      dismissEphemeralOverlays();
      setStartHereState({ open: true, initialBranch });
    },
    [dismissEphemeralOverlays],
  );

  const closeStartHere = useCallback(() => {
    lsSet(STORAGE_KEYS.FIRST_RUN_DONE, "1");
    setStartHereState({ open: false, initialBranch: "root" });
  }, []);

  const finishStartHere = useCallback(() => {
    lsSet(STORAGE_KEYS.FIRST_RUN_DONE, "1");
    closeStartHere();
  }, [closeStartHere]);

  const openCollectionCreateDialog = useCallback(() => {
    dismissEphemeralOverlays();
    setShowCollectionCreateDialog(true);
  }, [dismissEphemeralOverlays]);

  const closeCollectionCreateDialog = useCallback(() => {
    setShowCollectionCreateDialog(false);
  }, []);

  return {
    showPasteModal,
    setShowPasteModal,
    showCommandPalette,
    setShowCommandPalette,
    showQuickApply,
    setShowQuickApply,
    showCollectionCreateDialog,
    openCollectionCreateDialog,
    closeCollectionCreateDialog,
    commandPaletteInitialQuery,
    setCommandPaletteInitialQuery,
    paletteDeleteConfirm,
    setPaletteDeleteConfirm,
    startHereState,
    setStartHereState,
    initialFirstRun,
    dismissEphemeralOverlays,
    openStartHere,
    closeStartHere,
    finishStartHere,
  };
}
