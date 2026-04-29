import type { KeyboardEvent, MutableRefObject } from "react";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export interface InlineRenameRowProps {
  inputRef: MutableRefObject<HTMLInputElement | null>;
  value: string;
  ariaLabel: string;
  error?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  inputClassName?: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function InlineRenameRow({
  inputRef,
  value,
  ariaLabel,
  error,
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  confirmDisabled = false,
  inputClassName,
  onChange,
  onConfirm,
  onCancel,
}: InlineRenameRowProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.stopPropagation();
      onConfirm();
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="tm-inline-rename-row" onClick={(event) => event.stopPropagation()}>
      <div className="tm-inline-rename-row__field">
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabel}
          className={joinClasses(
            "tm-inline-rename-row__input rounded border bg-[var(--color-figma-bg)] px-1 text-body text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]",
            error
              ? "border-[var(--color-figma-error)]"
              : "border-[var(--color-figma-border)]",
            inputClassName,
          )}
        />
        <div className="tm-inline-rename-row__actions">
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="rounded bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-secondary font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-1.5 py-0.5 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="tm-inline-rename-row__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
