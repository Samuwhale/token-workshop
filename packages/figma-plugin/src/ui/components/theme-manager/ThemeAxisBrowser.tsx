import { useThemeAuthoringContext } from "./ThemeAuthoringContext";

interface ThemeAxisBrowserProps {
  dimensionsCount: number;
}

export function ThemeAxisBrowser({ dimensionsCount }: ThemeAxisBrowserProps) {
  const {
    dimSearch,
    setDimSearch,
    dimSearchRef,
  } = useThemeAuthoringContext();

  if (dimensionsCount < 4) return null;

  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/35 px-3 py-2">
      <div className="relative">
        <svg
          className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)]"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={dimSearchRef}
          type="text"
          value={dimSearch}
          onChange={(event) => setDimSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDimSearch("");
              dimSearchRef.current?.blur();
            }
          }}
          placeholder="Filter axes or options…"
          className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 pl-6 pr-6 text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
        />
        {dimSearch && (
          <button
            onClick={() => {
              setDimSearch("");
              dimSearchRef.current?.focus();
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
            title="Clear search"
            aria-label="Clear search"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
