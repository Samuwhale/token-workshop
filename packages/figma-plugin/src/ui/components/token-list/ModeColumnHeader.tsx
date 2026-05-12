import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { MAX_MODE_COL_PX, MIN_MODE_COL_PX } from "../tokenListTypes";

interface ModeColumnHeaderProps {
  modeName: string;
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
  hasLeadingResizeHandle?: boolean;
}

type ResizeEdge = "start" | "end";

export function ModeColumnHeader({
  modeName,
  width,
  onResize,
  onReset,
  hasLeadingResizeHandle = false,
}: ModeColumnHeaderProps) {
  const [resizingEdge, setResizingEdge] = useState<ResizeEdge | null>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  const widthRef = useRef(width);
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const handleResizeMouseDown = useCallback(
    (edge: ResizeEdge, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      const multiplier = edge === "start" ? -1 : 1;
      setResizingEdge(edge);
      const onMove = (me: MouseEvent) => {
        const delta = me.clientX - startX;
        onResize(startWidth + delta * multiplier);
      };
      const onUp = () => {
        setResizingEdge(null);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [onResize],
  );

  const handleResizeDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onReset();
    },
    [onReset],
  );

  const handleResizeKeyDown = useCallback(
    (edge: ResizeEdge, e: React.KeyboardEvent) => {
      const step = 16;
      const multiplier = edge === "start" ? -1 : 1;
      let next = widthRef.current;
      if (e.key === "ArrowRight") {
        next = widthRef.current + step * multiplier;
      } else if (e.key === "ArrowLeft") {
        next = widthRef.current - step * multiplier;
      }
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

  const renderResizeHandle = (edge: ResizeEdge) => (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${modeName} column ${
        edge === "start" ? "from left edge" : "from right edge"
      }`}
      aria-valuenow={widthAriaPct}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onMouseDown={(event) => handleResizeMouseDown(edge, event)}
      onDoubleClick={handleResizeDoubleClick}
      onKeyDown={(event) => handleResizeKeyDown(edge, event)}
      className={`tm-mode-column-header__resize-handle tm-mode-column-header__resize-handle--${edge}${
        resizingEdge === edge
          ? " tm-mode-column-header__resize-handle--active"
          : ""
      }`}
    >
      <span
        aria-hidden="true"
        className="tm-mode-column-header__resize-grip"
      />
    </div>
  );

  return (
    <div
      ref={cellRef}
      className={`tm-mode-column-header group/mode-column relative min-w-0${
        resizingEdge ? " tm-mode-column-header--resizing" : ""
      }`}
    >
      {hasLeadingResizeHandle ? renderResizeHandle("start") : null}
      {renderResizeHandle("end")}
      <div className="tm-mode-column-header__content">
        <span className="tm-mode-column-header__label min-w-0" title={modeName}>
          {modeName}
        </span>
      </div>
    </div>
  );
}
