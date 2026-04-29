import { useState, useRef, useMemo } from "react";
import type { TokenMapEntry } from "../../../shared/types";
import { LONG_TEXT_CLASSES } from "../../shared/longTextStyles";
import { useCollectionStateContext, useTokenFlatMapContext } from "../../contexts/TokenDataContext";
import {
  buildScopedTokenCandidates,
  type ScopedTokenCandidate,
} from "../../shared/scopedTokenCandidates";

/** Compact picker for selecting a token whose composite properties should be reused. */
export function ExtendsTokenPicker({
  tokenType,
  allTokensFlat,
  pathToCollectionId,
  currentPath,
  onSelect,
}: {
  tokenType: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  currentPath: string;
  onSelect: (path: string, selection?: ScopedTokenCandidate) => void;
}) {
  const { workingCollectionId } = useCollectionStateContext();
  const { perCollectionFlat, collectionIdsByPath } = useTokenFlatMapContext();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scopedCandidates = useMemo(
    () => buildScopedTokenCandidates({
      allTokensFlat,
      pathToCollectionId,
      collectionIdsByPath,
      perCollectionFlat,
    }),
    [allTokensFlat, pathToCollectionId, collectionIdsByPath, perCollectionFlat],
  );
  const candidates = useMemo(() => {
    return scopedCandidates.filter(
      (candidate) =>
        !candidate.isAmbiguousPath &&
        candidate.entry.$type === tokenType &&
        !(
          candidate.path === currentPath &&
          candidate.collectionId === workingCollectionId
        ),
    );
  }, [scopedCandidates, tokenType, currentPath, workingCollectionId]);
  const filteredAll = useMemo(() => {
    if (!search) return candidates;
    const q = search.toLowerCase();
    return candidates.filter((candidate) =>
      candidate.path.toLowerCase().includes(q),
    );
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
        className="w-full px-2 py-1.5 rounded border border-dashed border-[var(--color-figma-border)] text-secondary text-[color:var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[color:var(--color-figma-text-accent)] transition-colors text-left"
      >
        Reuse properties from token…
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
          className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-body text-[color:var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
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
          className="px-1.5 py-1 rounded text-secondary text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Cancel
        </button>
      </div>
      {filteredAll.length > 50 && (
        <p className="text-secondary text-[color:var(--color-figma-text-tertiary)] px-0.5">
          Showing 50 of {filteredAll.length} — refine search to narrow results
        </p>
      )}
      <div className="max-h-32 overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        {filtered.length === 0 && (
          <p className="px-2 py-1.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
            No matching {tokenType} tokens
          </p>
        )}
        {filtered.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            onClick={() => {
              onSelect(candidate.path, candidate);
              setOpen(false);
              setSearch("");
            }}
            className={`${LONG_TEXT_CLASSES.monoPrimary} w-full px-2 py-1 text-left text-body hover:bg-[var(--color-figma-bg-hover)]`}
            title={candidate.path}
          >
            <span>{candidate.path}</span>
          </button>
        ))}
      </div>
      {filtered.length > 0 ? (
        <p className="px-0.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
          Only tokens with unique paths can be used as property sources.
        </p>
      ) : null}
    </div>
  );
}
