import { useState } from "react";
import type { ThemeResolverAuthoringContext } from "./themeResolverContext";

interface ThemeResolverContextBannerProps {
  context: ThemeResolverAuthoringContext;
  actionLabel?: string;
  onAction?: () => void;
}

export function ThemeResolverContextBanner({
  context,
  actionLabel,
  onAction,
}: ThemeResolverContextBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const hasIssues = context.issueCount > 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${hasIssues ? "bg-amber-500" : "bg-[var(--color-figma-success,#18a058)]"}`}
          />
          <span className="truncate text-[10px] font-medium text-[var(--color-figma-text)]">
            {context.resolverName}
          </span>
          {hasIssues ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 text-[9px] text-amber-600 hover:underline"
            >
              {context.matchedAxisCount}/{context.axes.length} aligned
            </button>
          ) : (
            <span className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)]">
              Aligned
            </span>
          )}
        </div>
        {onAction && actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>

      {expanded && hasIssues && (
        <div className="flex flex-col gap-0.5 pl-3">
          {context.axes.map((axis) => (
            <div key={axis.dimensionId} className="flex items-center gap-1.5 text-[9px]">
              <span
                className={`h-1 w-1 shrink-0 rounded-full ${
                  axis.status === "matched"
                    ? "bg-[var(--color-figma-success,#18a058)]"
                    : axis.status === "warning"
                      ? "bg-amber-500"
                      : "bg-[var(--color-figma-error)]"
                }`}
              />
              <span className="text-[var(--color-figma-text-secondary)]">
                {axis.dimensionName}
                {axis.modifierLabel ? ` \u2192 ${axis.modifierLabel}` : " — no match"}
              </span>
            </div>
          ))}
          {context.unmatchedModifiers.length > 0 && (
            <div className="text-[9px] text-[var(--color-figma-text-tertiary)]">
              Config-only: {context.unmatchedModifiers.map((m) => m.modifierLabel).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
