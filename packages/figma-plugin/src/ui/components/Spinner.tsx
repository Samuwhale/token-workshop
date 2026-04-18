interface SpinnerProps {
  /** Visual size of the spinner. Default: 'sm' (10px). */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Additional Tailwind classes (e.g. color, opacity, shrink-0). */
  className?: string;
}

const sizeMap: Record<NonNullable<SpinnerProps['size']>, number> = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
};

/**
 * Shared loading spinner. Uses `currentColor` so callers set color via `text-*` or `className`.
 * Renders an SVG with `aria-hidden="true"` — pair with visually-hidden text when needed.
 */
export function Spinner({ size = 'sm', className }: SpinnerProps) {
  const px = sizeMap[size];
  return (
    <svg
      className={`animate-spin shrink-0${className ? ` ${className}` : ''}`}
      width={px}
      height={px}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="7"
        cy="7"
        r="5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="22 10"
      />
    </svg>
  );
}
