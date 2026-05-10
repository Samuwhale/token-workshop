import { Check, X } from "lucide-react";
import type { KeyboardEvent, MutableRefObject } from "react";
import { IconButton } from "./IconButton";
import { TextInput } from "./TextInput";

export interface InlineRenameRowProps {
  inputRef: MutableRefObject<HTMLInputElement | null>;
  value: string;
  ariaLabel: string;
  error?: string;
  inputTitle?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  showActions?: boolean;
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
  inputTitle,
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  confirmDisabled = false,
  showActions = true,
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
        <div className="tm-inline-rename-row__input">
          <TextInput
            ref={inputRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label={ariaLabel}
            title={inputTitle}
            size="sm"
            invalid={Boolean(error)}
            className={inputClassName}
          />
        </div>
        {showActions ? (
          <div className="tm-inline-rename-row__actions">
            <IconButton
              size="sm"
              onClick={onConfirm}
              disabled={confirmDisabled}
              title={confirmLabel}
              aria-label={confirmLabel}
              className="bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-action-bg-hover)] hover:text-[color:var(--color-figma-text-onbrand)] aria-expanded:bg-[var(--color-figma-action-bg-hover)] aria-expanded:text-[color:var(--color-figma-text-onbrand)]"
            >
              <Check size={12} strokeWidth={1.8} aria-hidden />
            </IconButton>
            <IconButton
              size="sm"
              onClick={onCancel}
              title={cancelLabel}
              aria-label={cancelLabel}
            >
              <X size={12} strokeWidth={1.8} aria-hidden />
            </IconButton>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="tm-inline-rename-row__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
