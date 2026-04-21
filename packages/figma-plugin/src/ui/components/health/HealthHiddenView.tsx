import { LINT_RULE_BY_ID } from "../../shared/lintRules";

const VALIDATION_LABELS: Record<string, { label: string; tip: string }> = {
  "missing-type": { label: "Missing type", tip: "Add a $type for spec compliance" },
  "broken-alias": { label: "Broken reference", tip: "Referenced token missing — update or remove" },
  "circular-reference": { label: "Circular reference", tip: "Break the loop so the token resolves" },
  "max-alias-depth": { label: "Deep reference chain", tip: "Shorten the chain to the source token" },
  "references-deprecated-token": { label: "Deprecated token in use", tip: "Replace with a non-deprecated token" },
  "type-mismatch": { label: "Type / value mismatch", tip: "Value doesn't match declared $type" },
};

function getRuleLabel(rule: string): string {
  return VALIDATION_LABELS[rule]?.label ?? LINT_RULE_BY_ID[rule]?.label ?? rule;
}

export interface HealthHiddenViewProps {
  suppressedKeys: Set<string>;
  suppressingKey: string | null;
  onUnsuppress: (key: string) => void;
  onBack: () => void;
}

export function HealthHiddenView({
  suppressedKeys,
  suppressingKey,
  onUnsuppress,
  onBack,
}: HealthHiddenViewProps) {
  const keys = [...suppressedKeys];

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
        <span className="text-body font-semibold text-[var(--color-figma-text)]">Hidden</span>
        <span className="text-secondary text-[var(--color-figma-text-tertiary)] ml-auto">{keys.length} issue{keys.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {keys.length === 0 ? (
          <div className="px-3 py-12 text-center">
            <p className="text-body text-[var(--color-figma-text-secondary)]">
              No hidden issues
            </p>
          </div>
        ) : (
          <div className="px-3 py-1.5">
            <p className="text-secondary text-[var(--color-figma-text-secondary)] mb-3">
              These issues are hidden from Health. Click <strong>Show again</strong> to restore.
            </p>
            {keys.map((key) => {
              const [rule, collectionId, ...pathParts] = key.split(":");
              const path = pathParts.join(":");
              return (
                <div key={key} className="group flex items-center gap-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-secondary font-mono text-[var(--color-figma-text)] truncate">
                        {path}
                      </span>
                      <span className="text-secondary text-[var(--color-figma-text-secondary)] opacity-60 shrink-0">
                        {collectionId}
                      </span>
                    </div>
                    <div className="text-secondary text-[var(--color-figma-text-secondary)] opacity-70">
                      {getRuleLabel(rule)}
                    </div>
                  </div>
                  <button
                    onClick={() => onUnsuppress(key)}
                    disabled={suppressingKey === key}
                    className="shrink-0 text-secondary px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40 disabled:cursor-wait"
                  >
                    {suppressingKey === key ? "…" : "Show again"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
