import { useEffect, useMemo, useState } from "react";
import { ContextDialog, DialogActions, DialogError } from "./ContextDialog";

interface RewireConfirmProps {
  x: number;
  y: number;
  sourcePath: string;
  targetPath: string;
  modeNames: string[];
  busy?: boolean;
  errorMessage?: string;
  onConfirm: (modeNames: string[]) => void;
  onCancel: () => void;
}

export function RewireConfirm({
  x,
  y,
  sourcePath,
  targetPath,
  modeNames,
  busy,
  errorMessage,
  onConfirm,
  onCancel,
}: RewireConfirmProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(modeNames),
  );

  useEffect(() => {
    setSelected(new Set(modeNames));
  }, [modeNames]);

  const isMultiMode = modeNames.length > 1;
  const allSelected = selected.size === modeNames.length;
  const noneSelected = selected.size === 0;

  const orderedSelection = useMemo(
    () => modeNames.filter((mode) => selected.has(mode)),
    [modeNames, selected],
  );

  return (
    <ContextDialog x={x} y={y} ariaLabel="Rewire alias" onCancel={onCancel}>
      <div className="flex flex-col gap-1">
        <div className="font-medium text-[var(--color-figma-text)]">
          Rewire alias
        </div>
        <div className="text-secondary text-[var(--color-figma-text-secondary)]">
          <span
            className="font-mono text-[var(--color-figma-text)] break-all"
            title={sourcePath}
          >
            {sourcePath}
          </span>{" "}
          will reference{" "}
          <span
            className="font-mono text-[var(--color-figma-text)] break-all"
            title={targetPath}
          >
            {targetPath}
          </span>
          .
        </div>
      </div>
      {isMultiMode ? (
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
              Modes
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set(allSelected ? [] : modeNames))}
              className="text-secondary text-[var(--color-figma-accent)] hover:underline"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <ul className="flex flex-col">
            {modeNames.map((mode) => (
              <li key={mode}>
                <label className="flex h-7 cursor-pointer items-center gap-2 rounded px-1 text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">
                  <input
                    type="checkbox"
                    checked={selected.has(mode)}
                    onChange={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(mode)) next.delete(mode);
                        else next.add(mode);
                        return next;
                      });
                    }}
                  />
                  <span>{mode}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {errorMessage ? <DialogError message={errorMessage} /> : null}
      <DialogActions
        busy={busy}
        disabled={noneSelected}
        confirmLabel="Rewire"
        busyLabel="Rewiring…"
        onCancel={onCancel}
        onConfirm={() => onConfirm(orderedSelection)}
      />
    </ContextDialog>
  );
}
