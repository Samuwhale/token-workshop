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
            <p className="text-body text-[color:var(--color-figma-text-secondary)]">
              No hidden issues
            </p>
          </div>
        ) : (
          <div className="px-3 py-1.5">
            <p className="text-secondary text-[color:var(--color-figma-text-secondary)] mb-3">
              These issues are hidden from Review. Click <strong>Show again</strong> to restore.
            </p>
            {keys.map(({ key, parsed }) => {
              const { rule, collectionId, path } = parsed;
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 hover:bg-[var(--surface-hover)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-secondary font-mono text-[color:var(--color-figma-text)] truncate">
                        {path}
                      </span>
                      <span className="text-secondary text-[color:var(--color-figma-text-secondary)] opacity-60 shrink-0">
                        {collectionId}
                      </span>
                    </div>
                    <div className="text-secondary text-[color:var(--color-figma-text-secondary)] opacity-70">
                      {getRuleLabel(rule).label}
                    </div>
                  </div>
                  <button
                    onClick={() => onUnsuppress(key)}
                    disabled={suppressingKey === key}
                    className="shrink-0 rounded px-1.5 py-0.5 text-secondary font-medium text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)] disabled:cursor-wait disabled:opacity-40"
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
