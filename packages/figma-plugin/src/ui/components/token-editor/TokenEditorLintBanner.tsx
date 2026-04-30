import { AlertTriangle, Info } from "lucide-react";
import type { LintViolation } from "../../hooks/useLint";

interface TokenEditorLintBannerProps {
  lintViolations: LintViolation[];
}

export function TokenEditorLintBanner({
  lintViolations,
}: TokenEditorLintBannerProps) {
  if (lintViolations.length === 0) return null;

  const lintTone = lintViolations.some((v) => v.severity === "error")
    ? "error"
    : lintViolations.some((v) => v.severity === "warning")
      ? "warning"
      : "info";

  const toneClass =
    lintTone === "error"
      ? "text-[color:var(--color-figma-text-error)]"
      : lintTone === "warning"
        ? "text-[color:var(--color-figma-text-warning)]"
        : "text-[color:var(--color-figma-text-secondary)]";

  const Icon = lintTone === "info" ? Info : AlertTriangle;
  const issueLabel =
    lintViolations.length === 1 ? "1 issue" : `${lintViolations.length} issues`;
  const summary =
    lintTone === "error"
      ? "Review issues below before saving."
      : lintTone === "warning"
        ? "This token needs attention."
        : "Review suggestions are available.";

  return (
    <div
      className="tm-token-details__banner"
      role="status"
      aria-label={issueLabel}
    >
      <div className={`flex items-center gap-1.5 ${toneClass}`}>
        <Icon size={11} strokeWidth={2} aria-hidden />
        <span className="text-secondary font-medium">{issueLabel}</span>
      </div>
      <div className="tm-token-details__banner-description">
        {summary}
      </div>
    </div>
  );
}
