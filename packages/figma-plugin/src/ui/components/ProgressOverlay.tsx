import { useRef } from "react";
import { Spinner } from "./Spinner";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface ProgressOverlayProps {
  message: string;
  current?: number | null;
  total?: number | null;
}

export function ProgressOverlay({
  message,
  current = null,
  total = null,
}: ProgressOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const showProgress =
    typeof current === "number" && typeof total === "number" && total > 0;
  useFocusTrap(panelRef);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-overlay-title"
      aria-describedby={showProgress ? "progress-overlay-count" : undefined}
      aria-live="polite"
      aria-busy="true"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex w-full max-w-[min(320px,calc(100vw-24px))] flex-col items-center gap-2.5 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-3 text-center shadow-[var(--shadow-dialog)]"
      >
        <Spinner size="xl" className="text-[color:var(--color-figma-text-accent)]" />
        <div className="w-full space-y-1">
          <p
            id="progress-overlay-title"
            className="text-heading font-semibold text-[color:var(--color-figma-text)] break-words"
          >
            {message}
          </p>
          {showProgress && (
            <p
              id="progress-overlay-count"
              className="text-body text-[color:var(--color-figma-text-secondary)]"
            >
              {current} / {total}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
