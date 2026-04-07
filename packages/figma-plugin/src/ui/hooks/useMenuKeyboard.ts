/**
 * Keyboard navigation utilities for ARIA menus.
 *
 * Usage:
 *   import { getMenuItems, handleMenuArrowKeys } from '../hooks/useMenuKeyboard';
 *
 * In the menu's keydown handler:
 *   if (!handleMenuArrowKeys(e, menuEl)) {
 *     // fall through to letter-key shortcuts, etc.
 *   }
 *
 * Auto-focus first item when menu opens:
 *   getMenuItems(menuEl)[0]?.focus();
 */

/** Returns all non-disabled [role="menuitem"] elements within a container. */
export function getMenuItems(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[role="menuitem"]')
  ).filter(el => !(el as HTMLButtonElement).disabled);
}

type MenuKeyHandlers = {
  onOpenSubmenu?: () => void;
  onCloseSubmenu?: () => void;
};

/**
 * Handles ArrowDown / ArrowUp / Home / End within a menu container.
 * Optionally handles ArrowRight / ArrowLeft for submenu open/close.
 * Moves focus between non-disabled menuitems and wraps at the ends.
 * @returns true if the event was consumed (caller should skip further handling)
 */
export function handleMenuArrowKeys(
  e: KeyboardEvent,
  container: HTMLElement,
  handlers?: MenuKeyHandlers,
): boolean {
  if (
    e.key !== 'ArrowDown' &&
    e.key !== 'ArrowUp' &&
    e.key !== 'Home' &&
    e.key !== 'End' &&
    e.key !== 'ArrowRight' &&
    e.key !== 'ArrowLeft'
  ) {
    return false;
  }
  if (e.key === 'ArrowRight') {
    if (!handlers?.onOpenSubmenu) return false;
    e.preventDefault();
    handlers.onOpenSubmenu();
    return true;
  }
  if (e.key === 'ArrowLeft') {
    if (!handlers?.onCloseSubmenu) return false;
    e.preventDefault();
    handlers.onCloseSubmenu();
    return true;
  }
  const items = getMenuItems(container);
  if (!items.length) return false;

  const focused = document.activeElement as HTMLElement;
  const idx = items.indexOf(focused);

  e.preventDefault();
  if (e.key === 'ArrowDown') {
    items[idx < items.length - 1 ? idx + 1 : 0].focus();
  } else if (e.key === 'ArrowUp') {
    items[idx > 0 ? idx - 1 : items.length - 1].focus();
  } else if (e.key === 'Home') {
    items[0].focus();
  } else { // End
    items[items.length - 1].focus();
  }
  return true;
}
