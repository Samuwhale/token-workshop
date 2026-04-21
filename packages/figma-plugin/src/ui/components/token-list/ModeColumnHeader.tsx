import { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "../../shared/apiFetch";

interface ModeColumnHeaderProps {
  modeName: string;
  modeIndex: number;
  allModeNames: string[];
  collectionId: string;
  serverUrl: string;
  onMutated?: () => void;
  connected: boolean;
}

export function ModeColumnHeader({
  modeName,
  modeIndex,
  allModeNames,
  collectionId,
  serverUrl,
  onMutated,
  connected,
}: ModeColumnHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(modeName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setRenameValue(modeName), [modeName]);
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
      setMenuPos({ x: e.clientX, y: e.clientY });
      setMenuOpen(true);
    },
    [connected],
  );

  const handleRename = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === modeName) {
      setRenaming(false);
      setRenameValue(modeName);
      return;
    }
    setBusy(true);
    try {
      await apiFetch(
        `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/modes/${encodeURIComponent(modeName)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
      );
      setRenaming(false);
      onMutated?.();
    } catch {
      setRenaming(false);
      setRenameValue(modeName);
    } finally {
      setBusy(false);
    }
  }, [collectionId, modeName, onMutated, renameValue, serverUrl]);

  const handleDelete = useCallback(async () => {
    setBusy(true);
    try {
      await apiFetch(
        `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/modes/${encodeURIComponent(modeName)}`,
        { method: "DELETE" },
      );
      setConfirmDelete(false);
      onMutated?.();
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
      try {
        await apiFetch(
          `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/modes-order`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modes: reordered }),
          },
        );
        onMutated?.();
      } finally {
        setBusy(false);
      }
    },
    [allModeNames, collectionId, modeIndex, modeName, onMutated, serverUrl],
  );

  const canMoveUp = modeIndex > 0 && allModeNames.length > 1;
  const canMoveDown = modeIndex < allModeNames.length - 1 && allModeNames.length > 1;
  const canDelete = allModeNames.length > 1;

  return (
    <div
      ref={cellRef}
      className="min-w-0 border-l border-[var(--color-figma-border)]"
      onContextMenu={openMenu}
    >
      {renaming ? (
        <input
          ref={inputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleRename();
            if (e.key === "Escape") {
              setRenaming(false);
              setRenameValue(modeName);
            }
          }}
          onBlur={() => void handleRename()}
          disabled={busy}
          className="block w-full px-1.5 py-1 text-body font-medium bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] border border-[var(--color-figma-accent)] rounded-sm outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={openMenu}
          onDoubleClick={() => connected && setRenaming(true)}
          disabled={!connected}
          className="block w-full truncate px-1.5 py-1 text-body font-medium text-left text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] disabled:cursor-default disabled:hover:text-[var(--color-figma-text-secondary)]"
          title={`${modeName}\nRight-click or double-click for options`}
        >
          {modeName}
        </button>
      )}
      {menuOpen && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg py-1 text-body"
          style={{ top: menuPos.y, left: menuPos.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setRenaming(true);
            }}
            className="block w-full px-3 py-1 text-left text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
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
            className="block w-full px-3 py-1 text-left text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent"
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
            className="block w-full px-3 py-1 text-left text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent"
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
            className="block w-full px-3 py-1 text-left text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Delete mode
          </button>
        </div>
      )}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(false);
          }}
        >
          <div className="w-[320px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-4 shadow-xl">
            <p className="mb-3 text-body text-[var(--color-figma-text)]">
              Delete mode <span className="font-mono">{modeName}</span>? Tokens keep other mode values; this mode's values are removed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
                className="rounded px-3 py-1 text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={busy}
                className="rounded bg-[var(--color-figma-error)] px-3 py-1 text-body text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
