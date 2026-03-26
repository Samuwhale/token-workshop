
interface UndoToastProps {
  description: string;
  onUndo: () => void;
  onDismiss: () => void;
  canRedo?: boolean;
  redoDescription?: string;
  onRedo?: () => void;
  undoCount?: number;
}

export function UndoToast({ description, onUndo, onDismiss, canRedo, redoDescription, onRedo, undoCount }: UndoToastProps) {
  return (
    <div className="fixed bottom-4 left-3 right-3 flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-figma-text)] text-[var(--color-figma-bg)] text-[11px] shadow-lg z-50">
      <span className="flex-1 truncate min-w-0">
        {undoCount && undoCount > 1 ? `[${undoCount}] ` : ''}{description}
      </span>
      {canRedo && onRedo && (
        <button
          onClick={onRedo}
          title={redoDescription ? `Redo: ${redoDescription}` : 'Redo'}
          className="shrink-0 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 font-medium text-[10px] transition-colors"
        >
          Redo
        </button>
      )}
      <button
        onClick={onUndo}
        className="shrink-0 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 font-medium text-[10px] transition-colors"
      >
        Undo
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 p-0.5 rounded hover:bg-white/20 text-white/60 hover:text-white transition-colors"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M1 1l6 6M7 1L1 7" />
        </svg>
      </button>
    </div>
  );
}
