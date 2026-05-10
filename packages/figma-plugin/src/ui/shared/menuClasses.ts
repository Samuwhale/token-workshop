export const FLOATING_MENU_CLASS =
  "z-50 w-full max-w-[min(320px,calc(100vw-16px))] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-[var(--shadow-popover)]";

export const FLOATING_MENU_WIDE_CLASS =
  "z-50 w-full max-w-[min(360px,calc(100vw-16px))] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-[var(--shadow-popover)]";

const FLOATING_MENU_ITEM_BASE_CLASS =
  "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1 text-left text-secondary outline-none transition-colors focus-visible:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export const FLOATING_MENU_ITEM_CLASS =
  `${FLOATING_MENU_ITEM_BASE_CLASS} text-[color:var(--color-figma-text)] hover:bg-[var(--surface-hover)]`;

export const FLOATING_MENU_DANGER_ITEM_CLASS =
  `${FLOATING_MENU_ITEM_BASE_CLASS} text-[color:var(--color-figma-text-error)] hover:bg-[var(--color-figma-error)]/10 focus-visible:bg-[var(--color-figma-error)]/10`;
