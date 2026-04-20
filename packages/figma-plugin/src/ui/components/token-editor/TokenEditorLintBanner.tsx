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

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
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
          className={
            lintTone === "error"
              ? "text-[var(--color-figma-error)]"
              : lintTone === "warning"
                ? "text-[var(--color-figma-warning)]"
                : "text-[var(--color-figma-text-secondary)]"
          }
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
        </svg>
        <span
          className={`text-secondary font-medium ${
            lintTone === "error"
              ? "text-[var(--color-figma-error)]"
              : lintTone === "warning"
                ? "text-[var(--color-figma-warning)]"
                : "text-[var(--color-figma-text-secondary)]"
          }`}
        >
          {lintViolations.length === 1
            ? "1 issue"
            : `${lintViolations.length} issues`}
        </span>
      </div>
      {lintViolations.map((violation, index) => (
        <div
          key={`${violation.path}-${violation.message}-${index}`}
          className={`rounded border border-[var(--color-figma-border)] px-2 py-1.5 ${
            violation.severity === "error"
              ? "bg-[var(--color-figma-error)]/8"
              : violation.severity === "warning"
                ? "bg-[var(--color-figma-warning)]/8"
                : "bg-[var(--color-figma-bg-secondary)]"
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
