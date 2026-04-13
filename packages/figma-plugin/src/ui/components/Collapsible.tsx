import type { ReactNode } from 'react';

/**
 * A simple controlled collapsible section with a chevron toggle button.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <Collapsible open={open} onToggle={() => setOpen(v => !v)} label="Edit steps (3)">
 *     <div className="mt-2">…</div>
 *   </Collapsible>
 */
export function Collapsible({
  open,
  onToggle,
  label,
  children,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <button
        onClick={onToggle}
        className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] flex items-center gap-1 transition-colors"
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          <path d="M2 1l4 3-4 3" />
        </svg>
        {label}
      </button>
      {open && children}
    </div>
  );
}
