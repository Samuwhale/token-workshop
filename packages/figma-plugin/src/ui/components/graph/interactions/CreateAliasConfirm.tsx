import { useEffect, useRef, useState } from "react";
import { ContextDialog, DialogActions, DialogError } from "./ContextDialog";

interface CreateAliasConfirmProps {
  x: number;
  y: number;
  sourcePath: string;
  collectionLabel: string;
  initialPath: string;
  isPathTaken: (path: string) => boolean;
  busy?: boolean;
  errorMessage?: string;
  onConfirm: (path: string) => void;
  onCancel: () => void;
}

export function CreateAliasConfirm({
  x,
  y,
  sourcePath,
  collectionLabel,
  initialPath,
  isPathTaken,
  busy,
  errorMessage,
  onConfirm,
  onCancel,
}: CreateAliasConfirmProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [path, setPath] = useState(initialPath);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const trimmed = path.trim();
  const taken = trimmed.length > 0 && isPathTaken(trimmed);
  const invalid = trimmed.length === 0 || taken;
  const validationMessage = taken
    ? `A token at "${trimmed}" already exists in ${collectionLabel}.`
    : null;

  return (
    <ContextDialog
      x={x}
      y={y}
      ariaLabel="Create token referencing source"
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-1">
        <div className="font-medium text-[var(--color-figma-text)]">
          New reference token
        </div>
        <div className="text-secondary text-[var(--color-figma-text-secondary)]">
          In{" "}
          <span className="font-medium text-[var(--color-figma-text)]">
            {collectionLabel}
          </span>
          , linked to{" "}
          <span className="font-mono text-[var(--color-figma-text)]">
            {sourcePath}
          </span>
          .
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-secondary">
        <span className="text-[var(--color-figma-text-tertiary)]">Source</span>
        <span className="truncate font-mono text-[var(--color-figma-text)]" title={sourcePath}>
          {sourcePath}
        </span>
        <span className="text-[var(--color-figma-text-tertiary)]">Creates</span>
        <span className="truncate font-mono text-[var(--color-figma-text)]" title={trimmed}>
          {trimmed || "token.path"}
        </span>
      </div>
      <label className="mt-3 flex flex-col gap-1 text-secondary text-[var(--color-figma-text-tertiary)]">
        New token path
      <input
        ref={inputRef}
        type="text"
        value={path}
        onChange={(event) => setPath(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !invalid && !busy) {
            event.preventDefault();
            onConfirm(trimmed);
          }
        }}
        placeholder="token.path"
        spellCheck={false}
          className="h-7 w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-input-bg)] px-2 font-mono text-secondary text-[var(--color-figma-text)] focus:border-[var(--color-figma-accent)] focus:outline-none"
      />
      </label>
      {validationMessage || errorMessage ? (
        <DialogError message={validationMessage ?? errorMessage ?? ""} />
      ) : null}
      <DialogActions
        busy={busy}
        disabled={invalid}
        confirmLabel="Create reference token"
        busyLabel="Creating…"
        onCancel={onCancel}
        onConfirm={() => onConfirm(trimmed)}
      />
    </ContextDialog>
  );
}
