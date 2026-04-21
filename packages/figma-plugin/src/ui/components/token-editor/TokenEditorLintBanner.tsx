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
      ? "text-[var(--color-figma-error)]"
      : lintTone === "warning"
        ? "text-[var(--color-figma-warning)]"
        : "text-[var(--color-figma-text-secondary)]";

  const Icon = lintTone === "info" ? Info : AlertTriangle;

  return (
    <div className="flex flex-col gap-1.5">
      <div className={`flex items-center gap-1.5 ${toneClass}`}>
        <Icon size={11} strokeWidth={2} aria-hidden />
        <span className="text-secondary font-medium">
          {lintViolations.length === 1
            ? "1 issue"
            : `${lintViolations.length} issues`}
        </span>
      </div>
      {lintViolations.map((violation, index) => (
        <div
          key={`${violation.path}-${violation.message}-${index}`}
          className={`rounded px-2 py-1.5 ring-1 ${
            violation.severity === "error"
              ? "ring-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/5"
              : violation.severity === "warning"
                ? "ring-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/5"
                : "ring-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40"
          }`}
        >
          <div className="text-secondary text-[var(--color-figma-text)]">
            {violation.message}
          </div>
          {violation.suggestion && (
            <div className="mt-0.5 text-secondary text-[var(--color-figma-text-secondary)]">
              {violation.suggestion}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
