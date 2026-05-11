import { useState, useRef, useEffect, useCallback } from "react";
import { Settings2 } from "lucide-react";
import { MAX_MODE_COL_PX, MIN_MODE_COL_PX } from "../tokenListTypes";

interface ModeColumnHeaderProps {
  modeName: string;
  modeIndex: number;
  allModeNames: string[];
  collectionId: string;
  onManageModes?: (collectionId: string) => void;
  connected: boolean;
  width: number;
  onResize: (width: number) => void;
}

export function ModeColumnHeader({
  modeName,
  collectionId,
  onManageModes,
  connected,
  width,
  onResize,
}: ModeColumnHeaderProps) {
  const [isResizing, setIsResizing] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const handleManageModes = useCallback(
    (e: React.MouseEvent) => {
      if (!connected || !onManageModes) return;
      e.preventDefault();
      onManageModes(collectionId);
    },
    [collectionId, connected, onManageModes],
  );

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
      setIsResizing(true);
      const onMove = (me: MouseEvent) => {
        const delta = me.clientX - startX;
        onResize(startWidth + delta);
      };
      const onUp = () => {
        setIsResizing(false);
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
    <div
      ref={cellRef}
      className={`tm-mode-column-header group/mode-column relative min-w-0${isResizing ? " tm-mode-column-header--resizing" : ""}`}
    >
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
        className="tm-mode-column-header__resize-handle"
      >
        <span
          aria-hidden="true"
          className="tm-mode-column-header__resize-grip"
        />
      </div>
      <div className="tm-mode-column-header__button">
        <span className="tm-mode-column-header__label min-w-0" title={modeName}>
          {modeName}
        </span>
        {onManageModes ? (
          <button
            type="button"
            onClick={handleManageModes}
            disabled={!connected}
            aria-label={`Manage modes for ${modeName}`}
            className="tm-mode-column-header__button-icon tm-mode-column-header__manage-button"
            title={
              connected
                ? `Manage modes for ${modeName}`
                : "Connect to the token library before managing modes"
            }
          >
            <Settings2 size={12} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
