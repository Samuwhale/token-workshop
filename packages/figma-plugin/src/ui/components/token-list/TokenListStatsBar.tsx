import { TOKEN_TYPE_FAMILY, type TokenFamily } from "../../../shared/types";

const FAMILY_ORDER: TokenFamily[] = ["color", "size", "type", "effect", "motion", "other"];

interface TokenListStatsBarProps {
  statsTotalTokens: number;
  statsByType: [string, number][];
  onClose: () => void;
}

function aggregateByFamily(statsByType: [string, number][]): [TokenFamily, number][] {
  const counts: Record<TokenFamily, number> = {
    color: 0, size: 0, type: 0, effect: 0, motion: 0, other: 0,
  };
  for (const [type, count] of statsByType) {
    const family = TOKEN_TYPE_FAMILY[type] ?? "other";
    counts[family] += count;
  }
  return FAMILY_ORDER
    .map((family) => [family, counts[family]] as [TokenFamily, number])
    .filter(([, count]) => count > 0);
}

export function TokenListStatsBar({
  statsTotalTokens,
  statsByType,
  onClose,
}: TokenListStatsBarProps) {
  if (statsTotalTokens === 0) return null;

  const segments = aggregateByFamily(statsByType);

  return (
    <div className="shrink-0 border-b border-[var(--color-figma-border)] flex items-center gap-2 px-3 py-1 text-secondary text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]">
      <span className="font-medium text-[var(--color-figma-text)]">
        {statsTotalTokens}
      </span>
      <span>token{statsTotalTokens !== 1 ? "s" : ""}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden flex gap-px">
        {segments.map(([family, count]) => (
          <div
            key={family}
            style={{
              width: `${(count / statsTotalTokens) * 100}%`,
              backgroundColor: `var(--color-token-family-${family})`,
            }}
            title={`${family}: ${count}`}
          />
        ))}
      </div>
      <button
        onClick={onClose}
        className="p-1 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        aria-label="Hide token statistics"
        title="Hide token statistics"
      >
        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
