import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

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
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-8 w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-secondary font-medium text-[color:var(--color-figma-text-secondary)] outline-none transition-colors hover:bg-[var(--surface-hover)] hover:text-[color:var(--color-figma-text)] aria-expanded:bg-[var(--surface-accent)] aria-expanded:text-[color:var(--color-figma-text)] focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)]"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ChevronRight
            size={10}
            strokeWidth={2}
            className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden
          />
          <span className="min-w-0">{label}</span>
        </span>
      </button>
      {open && children}
    </div>
  );
}
