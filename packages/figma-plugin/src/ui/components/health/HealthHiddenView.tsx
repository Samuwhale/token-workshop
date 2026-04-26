import { getRuleLabel, parseSuppressKey } from "../../shared/ruleLabels";
import { HealthSubViewHeader } from "./HealthSubViewHeader";

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
  const keys = [...suppressedKeys]
    .map((key) => ({ key, parsed: parseSuppressKey(key) }))
    .filter(
      (
        entry,
      ): entry is {
        key: string;
        parsed: { rule: string; collectionId: string; path: string };
      } => entry.parsed !== null,
    )
    .sort(
      (left, right) =>
        left.parsed.path.localeCompare(right.parsed.path) ||
        left.parsed.rule.localeCompare(right.parsed.rule) ||
        left.parsed.collectionId.localeCompare(right.parsed.collectionId),
    );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <HealthSubViewHeader
        title="Hidden"
        onBack={onBack}
        count={`${keys.length} issue${keys.length !== 1 ? "s" : ""}`}
      />

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
              These issues are hidden from Review. Click <strong>Show again</strong> to restore.
            </p>
            {keys.map(({ key, parsed }) => {
              const { rule, collectionId, path } = parsed;
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
                      {getRuleLabel(rule).label}
                    </div>
                  </div>
                  <button
                    onClick={() => onUnsuppress(key)}
                    disabled={suppressingKey === key}
                    className="shrink-0 text-secondary px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 disabled:opacity-40 disabled:cursor-wait"
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
