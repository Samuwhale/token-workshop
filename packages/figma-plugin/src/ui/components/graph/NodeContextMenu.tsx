import { useEffect, useRef } from "react";

export interface NodeContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface NodeContextMenuProps {
  x: number;
  y: number;
  items: NodeContextMenuItem[];
  onClose: () => void;
}

export function NodeContextMenu({ x, y, items, onClose }: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(event.target as Node)) return;
      onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  if (items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-[160px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-0.5 shadow-lg"
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          type="button"
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onClick();
            onClose();
          }}
          className={`w-full px-3 py-1.5 text-left text-secondary transition-colors ${
            item.danger
              ? "text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10"
              : "text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
          } disabled:opacity-40`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
