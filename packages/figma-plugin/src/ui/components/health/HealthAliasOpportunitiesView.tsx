import type { AliasOpportunityGroup } from "../../hooks/useHealthData";
import { Spinner } from "../Spinner";
import { HealthSubViewHeader } from "./HealthSubViewHeader";

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
      <HealthSubViewHeader
        title="Suggested references"
        onBack={onBack}
        count={
          aliasOpportunityGroups.length > 0
            ? `${aliasOpportunityGroups.length} group${aliasOpportunityGroups.length !== 1 ? "s" : ""}`
            : undefined
        }
      />

      <div className="flex-1 overflow-y-auto px-3" style={{ scrollbarWidth: "thin" }}>
        {aliasOpportunityGroups.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-body text-[color:var(--color-figma-text-secondary)]">
              No suggested references found
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
                    <span className="text-secondary font-medium font-mono text-[color:var(--color-figma-text)]">
                      {group.valueLabel}
                    </span>
                    <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
                      {group.typeLabel} · {group.tokens.length} tokens
                    </span>
                  </div>
                  <div className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
                    Promote to{" "}
                    <span className="font-mono text-[color:var(--color-figma-text)]">
                      {group.suggestedPrimitivePath}
                    </span>
                    {" "}in{" "}
                    <span className="font-mono text-[color:var(--color-figma-text)]">
                      {group.suggestedPrimitiveCollectionId}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onPromote(group)}
                  disabled={isPromoting}
                  className="shrink-0 rounded bg-[var(--color-figma-action-bg)] px-2 py-0.5 text-secondary font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40"
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
