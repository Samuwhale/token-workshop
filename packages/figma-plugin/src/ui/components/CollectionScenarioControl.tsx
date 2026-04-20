import { useEffect, useMemo, useRef, useState } from "react";
import type { TokenCollection } from "@tokenmanager/core";
import {
  buildSelectionLabel,
  normalizeModeSelections,
} from "../shared/collectionModeUtils";

interface CollectionScenarioControlProps {
  collections: TokenCollection[];
  selectedModes: Record<string, string>;
  setSelectedModes: (selectedModes: Record<string, string>) => void;
}

export function CollectionScenarioControl({
  collections,
  selectedModes,
  setSelectedModes,
}: CollectionScenarioControlProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const multiModeCollections = useMemo(
    () => collections.filter((c) => c.modes.length > 1),
    [collections],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const normalizedSelections = useMemo(
    () => normalizeModeSelections(collections, selectedModes),
    [collections, selectedModes],
  );

  const currentLabel =
    Object.keys(normalizedSelections).length > 0
      ? buildSelectionLabel(collections, normalizedSelections)
      : "Default";

  if (multiModeCollections.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
      >
        <span className="max-w-[180px] truncate font-medium text-[var(--color-figma-text)]">
          {currentLabel}
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
          <path
            d="M1 3l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-[240px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3 shadow-lg">
          <div className="flex items-center justify-between pb-3">
            <h3 className="text-[11px] font-semibold text-[var(--color-figma-text)]">
              Active modes
            </h3>
            {Object.keys(normalizedSelections).length > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedModes({})}
                className="text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
              >
                Reset
              </button>
            ) : null}
          </div>

          <div className="space-y-2 border-t border-[var(--color-figma-border)] py-3">
            {multiModeCollections.map((collection) => (
              <div key={collection.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--color-figma-text)]">
                  {collection.id}
                </span>
                <select
                  value={normalizedSelections[collection.id] ?? ""}
                  onChange={(event) => {
                    const nextSelections = { ...normalizedSelections };
                    if (event.target.value) {
                      nextSelections[collection.id] = event.target.value;
                    } else {
                      delete nextSelections[collection.id];
                    }
                    setSelectedModes(nextSelections);
                  }}
                  className="w-[100px] shrink-0 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                >
                  <option value="">Default</option>
                  {collection.modes.map((mode) => (
                    <option key={mode.name} value={mode.name}>
                      {mode.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
