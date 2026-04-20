import { Spinner } from "./Spinner";

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
  const showProgress =
    typeof current === "number" && typeof total === "number" && total > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex w-[240px] flex-col items-center gap-3 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-4 py-4 text-center shadow-xl">
        <Spinner size="xl" className="text-[var(--color-figma-accent)]" />
        <div className="space-y-1">
          <p className="text-heading font-semibold text-[var(--color-figma-text)]">
            {message}
          </p>
          {showProgress && (
            <p className="text-body text-[var(--color-figma-text-secondary)]">
              {current} / {total}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
