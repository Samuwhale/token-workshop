import { NoticePill } from "../../shared/noticeSystem";
import type { ThemeResolverAuthoringContext } from "./themeResolverContext";

interface ThemeResolverContextBannerProps {
  context: ThemeResolverAuthoringContext;
  actionLabel?: string;
  description?: string;
  title?: string;
  onAction?: () => void;
}

function getBannerDescription(context: ThemeResolverAuthoringContext): string {
  if (context.issueCount === 0) {
    if (context.autoSelected && context.resolverCount > 1) {
      return "Showing the closest resolver match because no resolver is currently selected.";
    }
    return "The current modes and selected variants align with this resolver.";
  }

  const reviewTargets: string[] = [];
  if (context.issueAxisCount > 0) {
    reviewTargets.push(
      `${context.issueAxisCount} mode mismatch${context.issueAxisCount === 1 ? "" : "es"}`,
    );
  }
  if (context.unmatchedModifierCount > 0) {
    reviewTargets.push(
      `${context.unmatchedModifierCount} resolver-only mode${context.unmatchedModifierCount === 1 ? "" : "s"}`,
    );
  }
  const mappedAxes = `${context.matchedAxisCount}/${context.axes.length} modes aligned`;

  return `${mappedAxes}. Review ${reviewTargets.join(" and ")} here before publishing.`;
}

function getAxisTone(status: "matched" | "warning" | "error"): string {
  if (status === "error") {
    return "border-[var(--color-figma-error)]/25 bg-[var(--color-figma-error)]/8";
  }
  if (status === "warning") {
    return "border-amber-500/30 bg-amber-500/10";
  }
  return "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]";
}

export function ThemeResolverContextBanner({
  context,
  actionLabel,
  description,
  title = "Resolver review",
  onAction,
}: ThemeResolverContextBannerProps) {
  const bannerDescription = description ?? getBannerDescription(context);

  return (
    <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/65 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
              {title}
            </span>
            <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
              {context.resolverName}
            </span>
            {context.issueCount > 0 ? (
              <NoticePill severity="warning">
                {context.issueCount} issue{context.issueCount === 1 ? "" : "s"}
              </NoticePill>
            ) : (
              <NoticePill severity="success">Aligned</NoticePill>
            )}
            {context.autoSelected && (
              <NoticePill severity="info">Closest match</NoticePill>
            )}
          </div>
          <p className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            {context.resolverDescription
              ? `${context.resolverDescription}. ${bannerDescription}`
              : bannerDescription}
          </p>
        </div>
        {onAction && actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>

      <div className="mt-2 grid gap-1.5">
        {context.axes.map((axis) => (
          <div
            key={axis.dimensionId}
            className={`rounded border px-2 py-1.5 ${getAxisTone(axis.status)}`}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                {axis.dimensionName}
              </span>
              {axis.modifierLabel ? (
                <NoticePill
                  severity={
                    axis.status === "matched"
                      ? "info"
                      : axis.status === "warning"
                        ? "warning"
                        : "error"
                  }
                >
                  {axis.modifierLabel}
                </NoticePill>
              ) : (
                <NoticePill severity="error">Missing resolver dimension</NoticePill>
              )}
            </div>
            <p className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              {axis.matchedContextName
                ? `Active option "${axis.selectedOptionName}" maps to resolver context "${axis.matchedContextName}".`
                : axis.selectedOptionName
                  ? `Active option "${axis.selectedOptionName}" does not map to this resolver yet.`
                  : "Select an option to confirm the resolver mapping."}
            </p>
            {axis.issueMessages.length > 0 && (
              <p className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                {axis.issueMessages.join(" ")}
              </p>
            )}
          </div>
        ))}
      </div>

      {context.unmatchedModifiers.length > 0 && (
        <div className="mt-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5">
          <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
            Resolver-only dimensions
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            {context.unmatchedModifiers
              .map((modifier) => modifier.modifierLabel)
              .join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
