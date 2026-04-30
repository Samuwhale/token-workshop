import { useState, useRef, useEffect, useCallback } from "react";
import {
  deleteCollectionMode,
  DUPLICATE_MODE_NAME_MESSAGE,
  isModeNameTaken,
  renameCollectionMode,
  reorderCollectionModes,
} from "../../shared/collectionModes";
import { useAnchoredFloatingStyle } from "../../shared/floatingPosition";
import { getErrorMessage } from "../../shared/utils";
import { ConfirmModal } from "../ConfirmModal";
import { MAX_MODE_COL_PX, MIN_MODE_COL_PX } from "../tokenListTypes";

interface ModeColumnHeaderProps {
  modeName: string;
  modeIndex: number;
  allModeNames: string[];
  collectionId: string;
  serverUrl: string;
  onMutated?: () => void;
  connected: boolean;
  width: number;
  onResize: (width: number) => void;
}

export function ModeColumnHeader({
  modeName,
  modeIndex,
  allModeNames,
  collectionId,
  serverUrl,
  onMutated,
  connected,
  width,
  onResize,
}: ModeColumnHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(modeName);
  const [renameError, setRenameError] = useState("");
  const [actionError, setActionError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuStyle = useAnchoredFloatingStyle({
    triggerRef,
    open: menuOpen,
    preferredWidth: 180,
    preferredHeight: 220,
    align: "start",
  });

  useEffect(() => {
    setRenameValue(modeName);
    setRenameError("");
    setActionError("");
  }, [modeName]);
  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!cellRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const openMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!connected) return;
      e.preventDefault();
      setActionError("");
      setMenuOpen(true);
    },
    [connected],
  );

  const handleRename = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === modeName) {
      setRenaming(false);
      setRenameValue(modeName);
      setRenameError("");
      return;
    }
    if (isModeNameTaken(allModeNames, trimmed, modeName)) {
      setRenameError(DUPLICATE_MODE_NAME_MESSAGE);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setRenameError("");
    setActionError("");
    try {
      await renameCollectionMode({
        serverUrl,
        collectionId,
        modeName,
        name: trimmed,
      });
      setRenaming(false);
      onMutated?.();
    } catch (error) {
      setRenameError(getErrorMessage(error, "Could not rename this mode."));
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }, [allModeNames, collectionId, modeName, onMutated, renameValue, serverUrl]);

  const handleDelete = useCallback(async () => {
    setBusy(true);
    setActionError("");
    try {
      await deleteCollectionMode({ serverUrl, collectionId, modeName });
      setConfirmDelete(false);
      onMutated?.();
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not delete this mode."));
    } finally {
      setBusy(false);
    }
  }, [collectionId, modeName, onMutated, serverUrl]);

  const handleReorder = useCallback(
    async (direction: -1 | 1) => {
      const newIndex = modeIndex + direction;
      if (newIndex < 0 || newIndex >= allModeNames.length) return;
      const reordered = [...allModeNames];
      reordered.splice(modeIndex, 1);
      reordered.splice(newIndex, 0, modeName);
      setBusy(true);
      setActionError("");
      try {
        await reorderCollectionModes({
          serverUrl,
          collectionId,
          modes: reordered,
        });
        onMutated?.();
      } catch (error) {
        setActionError(getErrorMessage(error, "Could not move this mode."));
      } finally {
        setBusy(false);
      }
    },
    [allModeNames, collectionId, modeIndex, modeName, onMutated, serverUrl],
  );

  const canMoveUp = modeIndex > 0 && allModeNames.length > 1;
  const canMoveDown =
    modeIndex < allModeNames.length - 1 && allModeNames.length > 1;
  const canDelete = allModeNames.length > 1;

  const widthRef = useRef(width);
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      const onMove = (me: MouseEvent) => {
        const delta = me.clientX - startX;
        onResize(startWidth + delta);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [onResize],
  );

  const handleResizeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = 16;
      let next = widthRef.current;
      if (e.key === "ArrowRight") next = widthRef.current + step;
      else if (e.key === "ArrowLeft") next = widthRef.current - step;
      else if (e.key === "Home") next = MIN_MODE_COL_PX;
      else if (e.key === "End") next = MAX_MODE_COL_PX;
      else return;
      e.preventDefault();
      onResize(next);
    },
    [onResize],
  );

  const widthAriaPct = Math.round(
    ((width - MIN_MODE_COL_PX) / (MAX_MODE_COL_PX - MIN_MODE_COL_PX)) * 100,
  );

  return (
    <div ref={cellRef} className="tm-mode-column-header relative min-w-0">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${modeName} column`}
        aria-valuenow={widthAriaPct}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onMouseDown={handleResizeMouseDown}
        onKeyDown={handleResizeKeyDown}
        className="absolute top-0 right-0 bottom-0 z-10 w-[8px] translate-x-1/2 cursor-col-resize bg-transparent hover:bg-[var(--color-figma-accent)]/60 focus-visible:bg-[var(--color-figma-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-figma-accent)] transition-colors"
      />
      {renaming ? (
        <input
          ref={inputRef}
          type="text"
          value={renameValue}
          onChange={(e) => {
            setRenameValue(e.target.value);
            setRenameError("");
          }}
          aria-invalid={renameError ? true : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleRename();
            if (e.key === "Escape") {
              setRenaming(false);
              setRenameValue(modeName);
              setRenameError("");
            }
          }}
          onBlur={() => void handleRename()}
          disabled={busy}
          className={`block w-full px-1.5 py-1 text-body font-medium bg-[var(--color-figma-bg)] text-[color:var(--color-figma-text)] border rounded-sm outline-none ${
            renameError
              ? "border-[var(--color-figma-error)]"
              : "border-[var(--color-figma-accent)]"
          }`}
        />
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={openMenu}
          disabled={!connected}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="tm-mode-column-header__label block w-full rounded-sm px-1.5 py-1 text-body font-medium text-left text-[color:var(--color-figma-text-secondary)] outline-none transition-colors hover:text-[color:var(--color-figma-text)] focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] disabled:cursor-default disabled:hover:text-[color:var(--color-figma-text-secondary)]"
          title={modeName}
        >
          {modeName}
        </button>
      )}
      {(renameError || actionError) && !menuOpen ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-0.5 rounded border border-[var(--color-figma-error)] bg-[var(--color-figma-bg)] px-2 py-1 text-secondary text-[color:var(--color-figma-text-error)] shadow-lg">
          {renameError || actionError}
        </div>
      ) : null}
      {menuOpen && (
        <div
          className="z-50 overflow-y-auto rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg py-1 text-body"
          style={menuStyle ?? { visibility: "hidden" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setRenaming(true);
            }}
            className="block w-full px-3 py-1 text-left text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Rename
          </button>
          <button
            type="button"
            disabled={!canMoveUp || busy}
            onClick={() => {
              setMenuOpen(false);
              void handleReorder(-1);
            }}
            className="block w-full px-3 py-1 text-left text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Move left
          </button>
          <button
            type="button"
            disabled={!canMoveDown || busy}
            onClick={() => {
              setMenuOpen(false);
              void handleReorder(1);
            }}
            className="block w-full px-3 py-1 text-left text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Move right
          </button>
          <div className="my-1 h-px bg-[var(--color-figma-border)]" />
          <button
            type="button"
            disabled={!canDelete || busy}
            onClick={() => {
              setMenuOpen(false);
              setConfirmDelete(true);
            }}
            className="block w-full px-3 py-1 text-left text-[color:var(--color-figma-text-error)] hover:bg-[var(--color-figma-error)]/10 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Delete mode
          </button>
        </div>
      )}
      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${modeName}" mode?`}
          description="This removes the mode column from every token in this collection. Other mode values stay intact."
          confirmLabel="Delete mode"
          danger
          onConfirm={handleDelete}
          onCancel={() => {
            setConfirmDelete(false);
            setActionError("");
          }}
        >
          <p className="font-mono text-body text-[color:var(--color-figma-text)] [overflow-wrap:anywhere]">
            {modeName}
          </p>
          {actionError ? (
            <p className="text-secondary text-[color:var(--color-figma-text-error)]">
              {actionError}
            </p>
          ) : null}
        </ConfirmModal>
      )}
    </div>
  );
}
