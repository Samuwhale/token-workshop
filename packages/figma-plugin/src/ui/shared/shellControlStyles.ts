type ShellControlSize = 'sm' | 'md';
type ShellControlShape = 'rounded' | 'pill';

interface ShellControlOptions {
  active?: boolean;
  size?: ShellControlSize;
  shape?: ShellControlShape;
  fullWidth?: boolean;
}

function joinClasses(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const BASE_CONTROL_CLASS = [
  'relative inline-flex items-center justify-center gap-2 border font-medium',
  'transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out',
  'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]/30',
  'active:translate-y-px',
  'disabled:pointer-events-none disabled:opacity-45',
].join(' ');

const SIZE_CLASS: Record<ShellControlSize, string> = {
  sm: 'min-h-[28px] px-2.5 py-1 text-[10px]',
  md: 'min-h-[32px] px-3 py-1.5 text-[11px]',
};

const SHAPE_CLASS: Record<ShellControlShape, string> = {
  rounded: 'rounded-[10px]',
  pill: 'rounded-full',
};

export function shellControlClass({
  active = false,
  size = 'md',
  shape = 'rounded',
  fullWidth = false,
}: ShellControlOptions = {}): string {
  return joinClasses(
    BASE_CONTROL_CLASS,
    SIZE_CLASS[size],
    SHAPE_CLASS[shape],
    fullWidth && 'w-full',
    active
      ? [
          'border-[var(--color-figma-accent)]/30',
          'bg-[var(--color-figma-accent)]/12',
          'text-[var(--color-figma-text)] shadow-sm',
          'hover:bg-[var(--color-figma-accent)]/16 active:bg-[var(--color-figma-accent)]/20',
        ].join(' ')
      : [
          'border-transparent bg-transparent text-[var(--color-figma-text-secondary)]',
          'hover:border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg)] hover:text-[var(--color-figma-text)]',
          'focus-visible:border-[var(--color-figma-border)] focus-visible:bg-[var(--color-figma-bg)] focus-visible:text-[var(--color-figma-text)]',
          'active:border-[var(--color-figma-border)] active:bg-[var(--color-figma-bg-hover)] active:text-[var(--color-figma-text)]',
        ].join(' '),
  );
}

export function shellMetaTextClass(active = false): string {
  return active
    ? 'text-[var(--color-figma-text-secondary)]'
    : 'text-[var(--color-figma-text-tertiary)]';
}

export function shellCountBadgeClass(active = false): string {
  return joinClasses(
    'rounded-full px-1.5 py-0.5 leading-none tabular-nums transition-colors',
    active
      ? 'bg-[var(--color-figma-bg)]/80 text-[var(--color-figma-text-secondary)]'
      : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]',
  );
}
