import { useState, useRef, useMemo } from "react";
import type { TokenMapEntry } from "../../../shared/types";
import { LONG_TEXT_CLASSES } from "../../shared/longTextStyles";

/** Compact picker for selecting a base token to extend. */
export function ExtendsTokenPicker({
  tokenType,
  allTokensFlat,
  pathToSet,
  currentPath,
  onSelect,
}: {
  tokenType: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  currentPath: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const candidates = useMemo(() => {
    return Object.entries(allTokensFlat)
      .filter(([p, e]) => e.$type === tokenType && p !== currentPath)
      .map(([p]) => p);
  }, [allTokensFlat, tokenType, currentPath]);
  const filteredAll = useMemo(() => {
    if (!search) return candidates;
    const q = search.toLowerCase();
    return candidates.filter((p) => p.toLowerCase().includes(q));
  }, [candidates, search]);
  const filtered = useMemo(() => filteredAll.slice(0, 50), [filteredAll]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full px-2 py-1.5 rounded border border-dashed border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors text-left"
      >
        + Set base token to inherit from…
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${tokenType} tokens…`}
          className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setSearch("");
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSearch("");
          }}
          className="px-1.5 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Cancel
        </button>
      </div>
      {filteredAll.length > 50 && (
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)] px-0.5">
          Showing 50 of {filteredAll.length} — refine search to narrow results
        </p>
      )}
      <div className="max-h-32 overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        {filtered.length === 0 && (
          <p className="px-2 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
            No matching {tokenType} tokens
          </p>
        )}
        {filtered.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              onSelect(p);
              setOpen(false);
              setSearch("");
            }}
            className={`${LONG_TEXT_CLASSES.monoPrimary} w-full px-2 py-1 text-left text-[11px] hover:bg-[var(--color-figma-bg-hover)]`}
            title={`${p} (${pathToSet[p] || ""})`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
