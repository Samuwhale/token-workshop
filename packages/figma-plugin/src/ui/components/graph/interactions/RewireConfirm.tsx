import { useEffect, useMemo, useState } from "react";
import type { TokenCollection } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../../shared/types";
import { buildRewireModeRows } from "../modeRows";
import { ContextDialog, DialogActions, DialogError } from "./ContextDialog";

interface RewireConfirmProps {
  x: number;
  y: number;
  sourcePath: string;
  sourceCollectionId: string;
  sourceCollection: TokenCollection;
  sourceEntry: TokenMapEntry;
  targetPath: string;
  targetCollectionId: string;
  modeNames: string[];
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
  busy?: boolean;
  errorMessage?: string;
  onConfirm: (modeNames: string[]) => void;
  onCancel: () => void;
}

export function RewireConfirm({
  x,
  y,
  sourcePath,
  sourceCollectionId,
  sourceCollection,
  sourceEntry,
  targetPath,
  targetCollectionId,
  modeNames,
  collections,
  perCollectionFlat,
  pathToCollectionId,
  collectionIdsByPath,
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
  const modeRows = useMemo(
    () =>
      buildRewireModeRows({
        sourcePath,
        sourceCollectionId,
        sourceEntry,
        sourceCollection,
        targetPath,
        targetCollectionId,
        selectedModes: selected,
        collections,
        perCollectionFlat,
        pathToCollectionId,
        collectionIdsByPath,
      }),
    [
      collectionIdsByPath,
      collections,
      pathToCollectionId,
      perCollectionFlat,
      selected,
      sourceCollection,
      sourceCollectionId,
      sourceEntry,
      sourcePath,
      targetCollectionId,
      targetPath,
    ],
  );

  return (
    <ContextDialog
      x={x}
      y={y}
      ariaLabel="Make token use another token"
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-1">
        <div className="font-medium text-[var(--color-figma-text)]">
          Use another token
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
      <div className="mt-3 flex flex-col gap-1.5">
        {isMultiMode ? (
          <div className="flex items-center justify-between">
            <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
              Modes to update
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set(allSelected ? [] : modeNames))}
              className="text-secondary text-[var(--color-figma-accent)] hover:underline"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
        ) : null}
        <ul className="flex flex-col gap-1">
          {modeRows.map((row) => (
            <li key={row.modeName}>
              <label className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-2 rounded px-1.5 py-1 text-secondary hover:bg-[var(--color-figma-bg-hover)]">
                <input
                  type="checkbox"
                  checked={selected.has(row.modeName)}
                  onChange={() => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.modeName)) next.delete(row.modeName);
                      else next.add(row.modeName);
                      return next;
                    });
                  }}
                  className="mt-0.5"
                />
                <span className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] gap-x-2 gap-y-0.5">
                  <span className="truncate text-[var(--color-figma-text-tertiary)]">
                    {row.modeName}
                  </span>
                  <span
                    className="truncate font-mono text-[var(--color-figma-text)]"
                    title={row.authoredLabel}
                  >
                    {row.authoredLabel}
                  </span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                    Result
                  </span>
                  <span
                    className="truncate font-mono text-[10px] text-[var(--color-figma-text-secondary)]"
                    title={row.resolvedLabel}
                  >
                    {row.resolvedLabel}
                  </span>
                  <span />
                  <span className="truncate text-[10px] text-[var(--color-figma-text-tertiary)]">
                    {row.statusLabel}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      {errorMessage ? <DialogError message={errorMessage} /> : null}
      <DialogActions
        busy={busy}
        disabled={noneSelected}
        confirmLabel="Use token"
        busyLabel="Updating..."
        onCancel={onCancel}
        onConfirm={() => onConfirm(orderedSelection)}
      />
    </ContextDialog>
  );
}
