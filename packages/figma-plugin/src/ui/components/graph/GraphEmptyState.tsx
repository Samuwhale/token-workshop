import type { ReactNode } from "react";

interface GraphEmptyStateProps {
  kind: "no-tokens" | "no-connections" | "scope-empty";
  onAddToken?: () => void;
  onAddGenerator?: () => void;
  onClearSearch?: () => void;
}

export function GraphEmptyState({
  kind,
  onAddToken,
  onAddGenerator,
  onClearSearch,
}: GraphEmptyStateProps): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-secondary text-[var(--color-figma-text-secondary)]">
      <p>{copyFor(kind)}</p>
      {kind === "no-tokens" && onAddToken ? (
        <button
          type="button"
          onClick={onAddToken}
          className="rounded-md bg-[var(--color-figma-accent)] px-3 py-1.5 text-body font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
        >
          Add token
        </button>
      ) : null}
      {kind === "no-connections" ? (
        <div className="flex gap-3">
          {onAddGenerator ? (
            <button
              type="button"
              onClick={onAddGenerator}
              className="text-body font-medium text-[var(--color-figma-accent)] transition-colors hover:text-[var(--color-figma-accent-hover)]"
            >
              Add a generator
            </button>
          ) : null}
        </div>
      ) : null}
      {kind === "scope-empty" && onClearSearch ? (
        <button
          type="button"
          onClick={onClearSearch}
          className="text-body font-medium text-[var(--color-figma-accent)] transition-colors hover:text-[var(--color-figma-accent-hover)]"
        >
          Clear search
        </button>
      ) : null}
    </div>
  );
}

function copyFor(kind: GraphEmptyStateProps["kind"]): string {
  if (kind === "no-tokens") return "No tokens in this collection yet.";
  if (kind === "no-connections")
    return "Nothing is aliased or generated here yet.";
  return "Nothing matches the current graph search.";
}
