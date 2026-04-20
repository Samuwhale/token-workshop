import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../shared/apiFetch";
import { MODE_COLUMN_WIDTH } from "../tokenListTypes";

interface ModeColumnHeaderProps {
  modeName: string;
  collectionId: string;
  serverUrl: string;
  connected: boolean;
  onMutated: () => void;
  allModeNames?: string[];
  modeIndex?: number;
}

export function ModeColumnHeader({
  modeName,
  collectionId,
  serverUrl,
  connected,
  onMutated,
  allModeNames = [],
  modeIndex = 0,
}: ModeColumnHeaderProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(modeName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (!showMenu) {
      setConfirmingDelete(false);
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setShowMenu(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showMenu]);

  const handleRename = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === modeName) {
      setRenaming(false);
      setRenameValue(modeName);
      return;
    }
    setSaving(true);
    setError("");
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
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSaving(false);
    }
  }, [collectionId, modeName, onMutated, renameValue, serverUrl]);

  const handleDelete = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      await apiFetch(
        `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/modes/${encodeURIComponent(modeName)}`,
        { method: "DELETE" },
      );
      setShowMenu(false);
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }, [collectionId, modeName, onMutated, serverUrl]);

  const canMoveLeft = modeIndex > 0 && allModeNames.length > 1;
  const canMoveRight = modeIndex < allModeNames.length - 1 && allModeNames.length > 1;

  const handleReorder = useCallback(
    async (direction: -1 | 1) => {
      const newIndex = modeIndex + direction;
      if (newIndex < 0 || newIndex >= allModeNames.length) return;
      const reordered = [...allModeNames];
      reordered.splice(modeIndex, 1);
      reordered.splice(newIndex, 0, modeName);
      setSaving(true);
      setError("");
      try {
        await apiFetch(
          `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/modes-order`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modes: reordered }),
          },
        );
        setShowMenu(false);
        onMutated();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reorder failed");
      } finally {
        setSaving(false);
      }
    },
    [allModeNames, collectionId, modeIndex, modeName, onMutated, serverUrl],
  );

  if (renaming) {
    return (
      <div className={`relative ${MODE_COLUMN_WIDTH} shrink-0 px-1 py-0.5 border-l border-[var(--color-figma-border)]`}>
        <input
          ref={inputRef}
          type="text"
          value={renameValue}
          onChange={(e) => {
            setRenameValue(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleRename();
            if (e.key === "Escape") {
              setRenaming(false);
              setRenameValue(modeName);
            }
          }}
          onBlur={() => void handleRename()}
          disabled={saving}
          className="w-full rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] px-1 py-0.5 text-[11px] text-[var(--color-figma-text)] outline-none"
        />
        {error && (
          <div className="absolute mt-0.5 text-[8px] text-[var(--color-figma-error)] whitespace-nowrap">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`group relative ${MODE_COLUMN_WIDTH} shrink-0 border-l border-[var(--color-figma-border)]`}>
      <button
        type="button"
        onContextMenu={(e) => {
          e.preventDefault();
          if (connected) setShowMenu(true);
        }}
        onDoubleClick={() => {
          if (connected) {
            setRenameValue(modeName);
            setRenaming(true);
          }
        }}
        className="w-full px-1.5 py-1 pr-4 text-[11px] font-medium text-[var(--color-figma-text-secondary)] text-left truncate hover:text-[var(--color-figma-text)] transition-colors"
        title={modeName}
      >
        {modeName}
      </button>
      {connected && (
        <button
          type="button"
          onClick={() => setShowMenu(true)}
          tabIndex={-1}
          className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
          aria-label={`${modeName} options`}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {showMenu && (
        <div
          ref={menuRef}
          className="absolute left-0 top-full z-50 mt-0.5 w-[120px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-0.5 shadow-lg"
        >
          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              setRenameValue(modeName);
              setRenaming(true);
            }}
            className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Rename
          </button>
          {canMoveLeft && (
            <button
              type="button"
              onClick={() => void handleReorder(-1)}
              disabled={saving}
              className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
            >
              Move left
            </button>
          )}
          {canMoveRight && (
            <button
              type="button"
              onClick={() => void handleReorder(1)}
              disabled={saving}
              className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
            >
              Move right
            </button>
          )}
          {confirmingDelete ? (
            <div className="px-2.5 py-1.5">
              <p className="text-[10px] text-[var(--color-figma-text)] mb-1.5">
                Delete "{modeName}"?
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={saving}
                  className="rounded px-2 py-0.5 text-[10px] font-medium bg-[var(--color-figma-error)] text-white hover:bg-[var(--color-figma-error)]/90 disabled:opacity-50"
                >
                  {saving ? "Deleting..." : "Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded px-2 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving}
              className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-error)]/10 disabled:opacity-50"
            >
              Delete mode
            </button>
          )}
          {error && (
            <div className="px-2.5 py-1 text-[9px] text-[var(--color-figma-error)]">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
