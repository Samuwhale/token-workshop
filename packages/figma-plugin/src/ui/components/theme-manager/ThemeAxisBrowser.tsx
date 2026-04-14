import React from "react";
import { useThemeAuthoringContext } from "./ThemeAuthoringContext";
import type { ThemeResolverAuthoringContext } from "./themeResolverContext";

interface ThemeAxisBrowserProps {
  dimensionsCount: number;
  valueCount: number;
  issueCount: number;
  canCompare: boolean;
  onCreateMode: () => void;
  onOpenCompare: () => void;
  onOpenResolver: () => void;
  resolverContext?: ThemeResolverAuthoringContext | null;
}

export function ThemeAxisBrowser({
  dimensionsCount,
  valueCount,
  issueCount,
  canCompare,
  onCreateMode,
  onOpenCompare,
  onOpenResolver,
  resolverContext,
}: ThemeAxisBrowserProps) {
  const { dimSearch, setDimSearch, dimSearchRef } = useThemeAuthoringContext();
  const outputLabel = resolverContext
    ? resolverContext.issueCount > 0
      ? `${resolverContext.issueCount} output issue${resolverContext.issueCount === 1 ? "" : "s"}`
      : "Output ready"
    : "Set up output";

  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/35 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
            Build theme modes
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            Define the switching model first, then map the right token sets into each value.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateMode}
          className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-accent)]"
        >
          Add mode
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
        <span>{dimensionsCount} mode{dimensionsCount === 1 ? "" : "s"}</span>
        <span aria-hidden="true">•</span>
        <span>{valueCount} value{valueCount === 1 ? "" : "s"}</span>
        <span aria-hidden="true">•</span>
        <span>
          {issueCount > 0
            ? `${issueCount} need attention`
            : "No setup issues"}
        </span>
      </div>

      <div className="mt-2 flex gap-2">
        <div className="relative min-w-0 flex-1">
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
            ref={dimSearchRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={dimSearch}
            onChange={(event) => setDimSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDimSearch("");
                dimSearchRef.current?.blur();
              }
            }}
            placeholder={`Search ${dimensionsCount} mode${dimensionsCount === 1 ? "" : "s"}…`}
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 pl-6 pr-6 text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)]"
          />
          {dimSearch && (
            <button
              type="button"
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

        <button
          type="button"
          onClick={onOpenCompare}
          disabled={!canCompare}
          className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Compare
        </button>
        <button
          type="button"
          onClick={onOpenResolver}
          className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
        >
          {outputLabel}
        </button>
      </div>
    </div>
  );
}
