import { useCallback, useEffect, useState } from "react";
import { STORAGE_KEYS, lsGet, lsRemove } from "../shared/storage";

export const POST_SETUP_HINT_EVENT = "post-setup-hint-changed";

interface LibraryPostSetupHintProps {
  onGoToCanvas: () => void;
  onGoToSync: () => void;
}

function readPending(): boolean {
  return lsGet(STORAGE_KEYS.POST_SETUP_HINT_PENDING) === "1";
}

export function LibraryPostSetupHint({
  onGoToCanvas,
  onGoToSync,
}: LibraryPostSetupHintProps) {
  const [visible, setVisible] = useState(readPending);

  useEffect(() => {
    const refresh = () => setVisible(readPending());
    window.addEventListener(POST_SETUP_HINT_EVENT, refresh);
    return () => window.removeEventListener(POST_SETUP_HINT_EVENT, refresh);
  }, []);

  const clear = useCallback(() => {
    lsRemove(STORAGE_KEYS.POST_SETUP_HINT_PENDING);
    setVisible(false);
  }, []);

  if (!visible) return null;

  const handleCanvas = () => {
    clear();
    onGoToCanvas();
  };

  const handleSync = () => {
    clear();
    onGoToSync();
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-secondary text-[var(--color-figma-text-secondary)]">
      <span className="flex-1">
        Tokens are ready. Apply them on the{" "}
        <button
          type="button"
          onClick={handleCanvas}
          className="font-medium text-[var(--color-figma-accent)] underline-offset-2 hover:underline"
        >
          Canvas
        </button>
        , or push to Figma in{" "}
        <button
          type="button"
          onClick={handleSync}
          className="font-medium text-[var(--color-figma-accent)] underline-offset-2 hover:underline"
        >
          Sync
        </button>
        .
      </span>
      <button
        type="button"
        onClick={clear}
        aria-label="Dismiss next-step hint"
        title="Dismiss"
        className="shrink-0 rounded p-1 text-[var(--color-figma-text-tertiary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text-secondary)]"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
