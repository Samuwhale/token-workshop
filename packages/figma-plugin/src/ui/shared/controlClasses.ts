export const CONTROL_FOCUS_RING =
  "focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-offset-[-1px]";

export const CONTROL_FOCUS_ACCENT =
  `${CONTROL_FOCUS_RING} focus-visible:outline-[var(--color-figma-accent)]`;

export const CONTROL_FOCUS_ERROR =
  `${CONTROL_FOCUS_RING} focus-visible:outline-[var(--color-figma-error)]`;

export const CONTROL_INPUT_DISABLED_CLASSES =
  "disabled:cursor-not-allowed disabled:border-[var(--border-muted)] disabled:bg-[var(--surface-group-quiet)] disabled:text-[color:var(--color-figma-text-tertiary)] disabled:hover:border-[var(--border-muted)] disabled:hover:bg-[var(--surface-group-quiet)] disabled:hover:text-[color:var(--color-figma-text-tertiary)]";

export const CONTROL_BUTTON_DISABLED_CLASSES =
  "disabled:cursor-not-allowed disabled:border-[var(--border-muted)] disabled:bg-[var(--surface-group-quiet)] disabled:text-[color:var(--color-figma-text-tertiary)] disabled:hover:border-[var(--border-muted)] disabled:hover:bg-[var(--surface-group-quiet)] disabled:hover:text-[color:var(--color-figma-text-tertiary)]";

export const CONTROL_CHROMELESS_DISABLED_CLASSES =
  "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-[color:var(--color-figma-text-tertiary)] disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-[color:var(--color-figma-text-tertiary)]";

export const CONTROL_INPUT_BASE_CLASSES =
  "rounded-[var(--radius-md)] border bg-[var(--color-figma-bg)] text-body text-[color:var(--color-figma-text)] outline-none transition-colors placeholder:text-[color:var(--color-figma-text-tertiary)]";

export const CONTROL_INPUT_DEFAULT_STATE_CLASSES =
  `border-[var(--color-figma-border)] hover:border-[color:var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)] ${CONTROL_FOCUS_ACCENT}`;

export const CONTROL_INPUT_INVALID_STATE_CLASSES =
  `border-[var(--color-figma-error)] bg-[color-mix(in_srgb,var(--color-figma-error)_8%,var(--color-figma-bg))] focus-visible:border-[var(--color-figma-error)] ${CONTROL_FOCUS_ERROR}`;
