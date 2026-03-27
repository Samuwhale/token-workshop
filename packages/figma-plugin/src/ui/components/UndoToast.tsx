import { modKey, shiftKey } from '../shared/utils';

interface UndoToastProps {
  description: string | null;
  onUndo: () => void;
  onDismiss: () => void;
  canUndo: boolean;
  canRedo?: boolean;
  redoDescription?: string;
  onRedo?: () => void;
  undoCount?: number;
}


export function UndoToast({ description, onUndo, onDismiss, canUndo, canRedo, redoDescription, onRedo, undoCount }: UndoToastProps) {
  // Show the most relevant description: undo description if available, otherwise redo description
  const displayDesc = description ?? redoDescription;
  const undoLabel = undoCount && undoCount > 1 ? `${undoCount} actions` : displayDesc;

  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 left-3 right-3 flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-figma-text)] text-[var(--color-figma-bg)] text-[11px] shadow-lg z-50">
      <span className="flex-1 truncate min-w-0">
        {undoLabel}
      </span>
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title={`Undo (${modKey}Z)`}
        className="shrink-0 px-2 py-0.5 rounded font-medium text-[10px] transition-colors disabled:opacity-30 disabled:cursor-default bg-white/20 hover:bg-white/30 disabled:hover:bg-white/20"
      >
        Undo
        <kbd className="ml-1 opacity-50 font-normal">{modKey}Z</kbd>
      </button>
      {onRedo && (
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title={redoDescription ? `Redo: ${redoDescription} (${modKey}{shiftKey}Z)` : `Redo (${modKey}{shiftKey}Z)`}
          className="shrink-0 px-2 py-0.5 rounded font-medium text-[10px] transition-colors disabled:opacity-30 disabled:cursor-default bg-white/20 hover:bg-white/30 disabled:hover:bg-white/20"
        >
          Redo
          <kbd className="ml-1 opacity-50 font-normal">{modKey}{shiftKey}Z</kbd>
        </button>
      )}
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
