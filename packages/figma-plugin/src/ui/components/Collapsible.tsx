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
        className="text-secondary font-medium text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] flex items-center gap-1 transition-colors"
      >
        <ChevronRight
          size={10}
          strokeWidth={2}
          className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
        {label}
      </button>
      {open && children}
    </div>
  );
}
