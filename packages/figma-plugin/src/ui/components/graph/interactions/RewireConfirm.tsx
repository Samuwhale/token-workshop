import { useEffect, useMemo, useRef, useState } from "react";

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(modeNames),
  );

  useEffect(() => {
    setSelected(new Set(modeNames));
  }, [modeNames]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      onCancel();
    };
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [onCancel]);

  const isMultiMode = modeNames.length > 1;
  const allSelected = selected.size === modeNames.length;
  const noneSelected = selected.size === 0;

  const orderedSelection = useMemo(
    () => modeNames.filter((mode) => selected.has(mode)),
    [modeNames, selected],
  );

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Rewire alias"
      style={{ left: x, top: y }}
      className="fixed z-50 w-[280px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3 shadow-lg"
    >
      <div className="text-secondary text-[var(--color-figma-text)]">
        Make <span className="font-mono">{sourcePath}</span> alias{" "}
        <span className="font-mono">{targetPath}</span>?
      </div>
      {isMultiMode ? (
        <div className="mt-2 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              setSelected(new Set(allSelected ? [] : modeNames));
            }}
            className="text-secondary text-[var(--color-figma-accent)] hover:underline self-start"
          >
            {allSelected ? "Deselect all" : "Apply to all modes"}
          </button>
          <ul className="flex flex-col gap-1 pt-1">
            {modeNames.map((mode) => (
              <li key={mode}>
                <label className="flex cursor-pointer items-center gap-2 text-secondary text-[var(--color-figma-text)]">
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
      {errorMessage ? (
        <div className="mt-2 text-secondary text-[var(--color-figma-error)]">
          {errorMessage}
        </div>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-[var(--color-figma-border)] bg-transparent px-2 py-1 text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || noneSelected}
          onClick={() => onConfirm(orderedSelection)}
          className="rounded-md bg-[var(--color-figma-accent)] px-2 py-1 text-secondary font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
        >
          {busy ? "Rewiring…" : "Rewire"}
        </button>
      </div>
    </div>
  );
}
