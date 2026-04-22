import type { AliasOpportunityGroup } from "../../hooks/useHealthData";
import { Spinner } from "../Spinner";

export interface HealthAliasOpportunitiesViewProps {
  aliasOpportunityGroups: AliasOpportunityGroup[];
  promotingGroupId: string | null;
  onPromote: (group: AliasOpportunityGroup) => void;
  onBack: () => void;
}

export function HealthAliasOpportunitiesView({
  aliasOpportunityGroups,
  promotingGroupId,
  onPromote,
  onBack,
}: HealthAliasOpportunitiesViewProps) {
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
        <span className="text-body font-semibold text-[var(--color-figma-text)]">Suggested aliases</span>
        {aliasOpportunityGroups.length > 0 && (
          <span className="text-secondary text-[var(--color-figma-text-tertiary)] ml-auto">
            {aliasOpportunityGroups.length} group{aliasOpportunityGroups.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3" style={{ scrollbarWidth: "thin" }}>
        {aliasOpportunityGroups.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-body text-[var(--color-figma-text-secondary)]">
              No suggested aliases found
            </p>
          </div>
        ) : (
          aliasOpportunityGroups.map((group) => {
            const isPromoting = promotingGroupId === group.id;
            return (
              <div
                key={group.id}
                className="flex items-start gap-2 py-2 border-b border-[var(--color-figma-border)] last:border-b-0"
              >
                {group.colorHex && (
                  <div
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border border-[var(--color-figma-border)]"
                    style={{ background: group.colorHex }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-secondary font-medium font-mono text-[var(--color-figma-text)]">
                      {group.valueLabel}
                    </span>
                    <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                      {group.typeLabel} · {group.tokens.length} tokens
                    </span>
                  </div>
                  <div className="mt-0.5 text-secondary text-[var(--color-figma-text-secondary)]">
                    Promote to{" "}
                    <span className="font-mono text-[var(--color-figma-text)]">
                      {group.suggestedPrimitivePath}
                    </span>
                    {" "}in{" "}
                    <span className="font-mono text-[var(--color-figma-text)]">
                      {group.suggestedPrimitiveCollectionId}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onPromote(group)}
                  disabled={isPromoting}
                  className="shrink-0 rounded bg-[var(--color-figma-accent)] px-2 py-0.5 text-secondary font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                >
                  {isPromoting ? <Spinner size="xs" /> : "Promote"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
