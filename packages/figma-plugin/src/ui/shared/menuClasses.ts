export const FLOATING_MENU_CLASS =
  "z-50 w-full max-w-[min(320px,calc(100vw-16px))] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)]";

export const FLOATING_MENU_WIDE_CLASS =
  "z-50 w-full max-w-[min(360px,calc(100vw-16px))] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)]";

const FLOATING_MENU_ITEM_BASE_CLASS =
  "flex w-full items-center gap-2 px-2.5 py-1 text-left text-secondary transition-colors disabled:opacity-40";

export const FLOATING_MENU_ITEM_CLASS =
  `${FLOATING_MENU_ITEM_BASE_CLASS} text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]`;

export const FLOATING_MENU_DANGER_ITEM_CLASS =
  `${FLOATING_MENU_ITEM_BASE_CLASS} text-[color:var(--color-figma-text-error)] hover:bg-[var(--color-figma-error)]/10`;
