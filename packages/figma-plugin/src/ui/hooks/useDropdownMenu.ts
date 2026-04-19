import { useState, useRef, useEffect, useCallback } from "react";
import { getMenuItems, handleMenuArrowKeys } from "./useMenuKeyboard";

interface UseDropdownMenuOptions {
  onClose?: () => void;
}

interface CloseMenuOptions {
  restoreFocus?: boolean;
}

export function useDropdownMenu(options?: UseDropdownMenuOptions) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onClose = options?.onClose;

  const close = useCallback((closeOptions?: CloseMenuOptions) => {
    const shouldRestoreFocus = closeOptions?.restoreFocus ?? true;
    setOpen(false);
    onClose?.();
    if (shouldRestoreFocus) {
      triggerRef.current?.focus();
    }
  }, [onClose]);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (menuRef.current) handleMenuArrowKeys(e, menuRef.current);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    // Auto-focus first menu item
    requestAnimationFrame(() => {
      if (menuRef.current) getMenuItems(menuRef.current)[0]?.focus();
    });
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return { open, setOpen, toggle, close, menuRef, triggerRef };
}
