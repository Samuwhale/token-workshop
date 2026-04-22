import { useEffect, useMemo, useState } from "react";
import type { TokenMapEntry } from "../../../shared/types";
import { TokenPickerDropdown } from "../TokenPicker";
import { Spinner } from "../Spinner";

interface DeprecatedUsageDependent {
  path: string;
  collectionId: string;
}

export interface DeprecatedUsageEntry {
  deprecatedPath: string;
  collectionId: string;
  type: string;
  activeReferenceCount: number;
  dependents: DeprecatedUsageDependent[];
}

export interface HealthDeprecatedViewProps {
  entries: DeprecatedUsageEntry[];
  loading: boolean;
  error: string | null;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  onReplace: (entry: DeprecatedUsageEntry, replacementPath: string) => Promise<void>;
  onBack: () => void;
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getEntryKey(entry: Pick<DeprecatedUsageEntry, "collectionId" | "deprecatedPath">): string {
  return `${entry.collectionId}:${entry.deprecatedPath}`;
}

export function HealthDeprecatedView({
  entries,
  loading,
  error,
  allTokensFlat,
  pathToCollectionId,
  onReplace,
  onBack,
}: HealthDeprecatedViewProps) {
  const [replacementPaths, setReplacementPaths] = useState<Record<string, string>>({});
  const [openPickerKey, setOpenPickerKey] = useState<string | null>(null);
  const [replacingKey, setReplacingKey] = useState<string | null>(null);
  const entryKeys = useMemo(
    () => new Set(entries.map((entry) => getEntryKey(entry))),
    [entries],
  );

  useEffect(() => {
    setReplacementPaths((currentPaths) => {
      const nextPaths = Object.fromEntries(
        Object.entries(currentPaths).filter(([entryKey]) => entryKeys.has(entryKey)),
      );
      const changed =
        Object.keys(nextPaths).length !== Object.keys(currentPaths).length ||
        Object.keys(nextPaths).some((entryKey) => nextPaths[entryKey] !== currentPaths[entryKey]);
      return changed ? nextPaths : currentPaths;
    });
    setOpenPickerKey((currentKey) =>
      currentKey && !entryKeys.has(currentKey) ? null : currentKey,
    );
    setReplacingKey((currentKey) =>
      currentKey && !entryKeys.has(currentKey) ? null : currentKey,
    );
  }, [entryKeys]);

  const handleReplace = async (entry: DeprecatedUsageEntry) => {
    const entryKey = getEntryKey(entry);
    const replacement = replacementPaths[entryKey]?.trim();
    if (!replacement) return;
    setReplacingKey(entryKey);
    try {
      await onReplace(entry, replacement);
      setReplacementPaths((prev) => {
        const next = { ...prev };
        delete next[entryKey];
        return next;
      });
      setOpenPickerKey((currentKey) => currentKey === entryKey ? null : currentKey);
    } finally {
      setReplacingKey(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-1.5">
        <button
          onClick={onBack}
          className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          aria-label="Back"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-body font-semibold text-[var(--color-figma-text)]">Deprecated</span>
        {!loading && entries.length > 0 && (
          <span className="text-secondary text-[var(--color-figma-text-tertiary)] ml-auto">
            {entries.length} token{entries.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3" style={{ scrollbarWidth: "thin" }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="sm" />
          </div>
        ) : error ? (
          <div className="py-6 text-center">
            <p className="text-secondary text-[var(--color-figma-error)]">{error}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-body text-[var(--color-figma-text-secondary)]">
              No deprecated tokens have active references
            </p>
          </div>
        ) : (
          entries.map((entry) => {
            const entryKey = getEntryKey(entry);
            const selectedReplacement = replacementPaths[entryKey];
            const isPickerOpen = openPickerKey === entryKey;
            const isReplacing = replacingKey === entryKey;
            const dependentPreview = entry.dependents.slice(0, 3);
            const remainingDependents = entry.dependents.length - dependentPreview.length;

            return (
              <div
                key={entryKey}
                className="flex items-start gap-3 py-2 border-b border-[var(--color-figma-border)] last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-secondary font-medium font-mono text-[var(--color-figma-text)] line-through">
                      {entry.deprecatedPath}
                    </span>
                    <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                      {entry.type} · {formatCount(entry.activeReferenceCount, "active reference")}
                    </span>
                  </div>
                  <div className="mt-0.5 text-secondary text-[var(--color-figma-text-secondary)]">
                    {dependentPreview.map((dep, idx) => (
                      <span key={`${dep.collectionId}:${dep.path}`}>
                        {idx > 0 ? ", " : ""}
                        <span className="font-mono text-[var(--color-figma-text)]">{dep.path}</span>
                        {" "}
                        <span className="opacity-70">({dep.collectionId})</span>
                      </span>
                    ))}
                    {remainingDependents > 0 && (
                      <span>{dependentPreview.length > 0 ? ", " : ""}and {remainingDependents} more</span>
                    )}
                  </div>
                  {selectedReplacement && (
                    <div className="mt-1 text-secondary text-[var(--color-figma-text-secondary)]">
                      Replace with <span className="font-mono text-[var(--color-figma-text)]">{selectedReplacement}</span>
                    </div>
                  )}
                  {isPickerOpen && (
                    <div className="mt-1.5 max-w-xl">
                      <TokenPickerDropdown
                        allTokensFlat={allTokensFlat}
                        pathToCollectionId={pathToCollectionId}
                        filterType={entry.type === "unknown" ? undefined : entry.type}
                        includeDeprecated={false}
                        excludePaths={[entry.deprecatedPath]}
                        placeholder="Search replacement token…"
                        onSelect={(path) => {
                          setReplacementPaths((prev) => ({ ...prev, [entryKey]: path }));
                          setOpenPickerKey(null);
                        }}
                        onClose={() => setOpenPickerKey(null)}
                      />
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {selectedReplacement ? (
                    <>
                      <button
                        onClick={() => setOpenPickerKey(entryKey)}
                        disabled={isReplacing}
                        className="text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] disabled:opacity-40"
                      >
                        Change
                      </button>
                      <button
                        onClick={() => handleReplace(entry)}
                        disabled={isReplacing}
                        className="rounded bg-[var(--color-figma-accent)] px-2 py-0.5 text-secondary font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                      >
                        {isReplacing ? "Replacing…" : "Replace"}
                      </button>
                    </>
                  ) : isPickerOpen ? (
                    <button
                      onClick={() => setOpenPickerKey(null)}
                      className="text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={() => setOpenPickerKey(entryKey)}
                      className="text-secondary text-[var(--color-figma-accent)] hover:underline"
                    >
                      Replace
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
