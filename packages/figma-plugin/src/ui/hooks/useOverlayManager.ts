import { useState, useCallback } from "react";
import type { StartHereBranch } from "../components/WelcomePrompt";
import { STORAGE_KEYS, lsSet } from "../shared/storage";

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

  const [startHereState, setStartHereState] = useState<{
    open: boolean;
    initialBranch: StartHereBranch;
  }>(() => ({
    open: false,
    initialBranch: "root",
  }));

  const dismissEphemeralOverlays = useCallback(() => {
    setShowCommandPalette(false);
    setShowQuickApply(false);
  }, []);

  const openPasteTokens = useCallback(() => {
    dismissEphemeralOverlays();
    setShowPasteModal(true);
  }, [dismissEphemeralOverlays]);

  const closeCommandPalette = useCallback(() => {
    setShowCommandPalette(false);
  }, []);

  const openCommandPalette = useCallback(
    (initialQuery = "") => {
      setShowQuickApply(false);
      setCommandPaletteInitialQuery(initialQuery);
      setShowCommandPalette(true);
    },
    [],
  );

  const toggleCommandPalette = useCallback(
    (initialQuery = "") => {
      setShowQuickApply(false);
      setCommandPaletteInitialQuery(initialQuery);
      setShowCommandPalette((open) => !open);
    },
    [],
  );

  const closeQuickApply = useCallback(() => {
    setShowQuickApply(false);
  }, []);

  const toggleQuickApply = useCallback(() => {
    setShowCommandPalette(false);
    setShowQuickApply((open) => !open);
  }, []);

  const openStartHere = useCallback(
    (initialBranch: StartHereBranch = "root") => {
      dismissEphemeralOverlays();
      setStartHereState({ open: true, initialBranch });
    },
    [dismissEphemeralOverlays],
  );

  const closeStartHere = useCallback(() => {
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
    openPasteTokens,
    showCommandPalette,
    setShowCommandPalette,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    showQuickApply,
    setShowQuickApply,
    closeQuickApply,
    toggleQuickApply,
    showCollectionCreateDialog,
    openCollectionCreateDialog,
    closeCollectionCreateDialog,
    commandPaletteInitialQuery,
    setCommandPaletteInitialQuery,
    paletteDeleteConfirm,
    setPaletteDeleteConfirm,
    startHereState,
    setStartHereState,
    dismissEphemeralOverlays,
    openStartHere,
    closeStartHere,
    finishStartHere,
  };
}
