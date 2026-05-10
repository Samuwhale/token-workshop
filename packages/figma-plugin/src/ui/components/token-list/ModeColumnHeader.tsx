import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { useAnchoredFloatingStyle } from "../../shared/floatingPosition";
import {
  FLOATING_MENU_ITEM_CLASS,
} from "../../shared/menuClasses";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuStyle = useAnchoredFloatingStyle({
    triggerRef,
    open: menuOpen,
    preferredWidth: 180,
    preferredHeight: 220,
    align: "start",
  });

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!cellRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const firstItem = menuRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]:not([disabled])',
    );
    firstItem?.focus();
  }, [menuOpen]);

  const openMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!connected || !onManageModes) return;
      e.preventDefault();
      setMenuOpen(true);
    },
    [connected, onManageModes],
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

  const handleMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([disabled])',
        ) ?? [],
      );
      if (items.length === 0) {
        return;
      }

      const currentIndex = items.findIndex((item) => item === document.activeElement);

      const focusItem = (index: number) => {
        items[(index + items.length) % items.length]?.focus();
      };

      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusItem(currentIndex >= 0 ? currentIndex + 1 : 0);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusItem(currentIndex >= 0 ? currentIndex - 1 : items.length - 1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        focusItem(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        focusItem(items.length - 1);
      }
    },
    [],
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
      <button
        ref={triggerRef}
        type="button"
        onClick={openMenu}
        disabled={!connected || !onManageModes}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Manage ${modeName} mode`}
        className="tm-mode-column-header__button w-full rounded-sm py-1 text-body font-medium text-[color:var(--color-figma-text-secondary)] outline-none transition-colors hover:text-[color:var(--color-figma-text)] focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] disabled:cursor-default disabled:hover:text-[color:var(--color-figma-text-secondary)]"
        title={`Manage ${modeName} mode`}
      >
        <span className="tm-mode-column-header__label min-w-0">
          {modeName}
        </span>
        <ChevronDown
          size={10}
          strokeWidth={1.5}
          aria-hidden
          className="tm-mode-column-header__button-icon shrink-0 text-[color:var(--color-figma-text-tertiary)]"
        />
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${modeName} mode actions`}
          className="z-50 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 text-body shadow-[var(--shadow-popover)]"
          style={menuStyle ?? { visibility: "hidden" }}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={handleMenuKeyDown}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onManageModes?.(collectionId);
            }}
            className={FLOATING_MENU_ITEM_CLASS}
          >
            Manage modes
          </button>
        </div>
      )}
    </div>
  );
}
