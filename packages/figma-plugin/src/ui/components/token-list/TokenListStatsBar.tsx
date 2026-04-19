const TOKEN_TYPE_COLORS: Record<string, string> = {
  color: "var(--color-token-type-color)",
  dimension: "var(--color-token-type-dimension)",
  spacing: "var(--color-token-type-spacing)",
  typography: "var(--color-token-type-typography)",
  fontFamily: "var(--color-token-type-fontFamily)",
  fontSize: "var(--color-token-type-fontSize)",
  fontWeight: "var(--color-token-type-fontWeight)",
  lineHeight: "var(--color-token-type-lineHeight)",
  number: "var(--color-token-type-number)",
  string: "var(--color-token-type-string)",
  shadow: "var(--color-token-type-shadow)",
  border: "var(--color-token-type-border)",
};

interface TokenListStatsBarProps {
  statsTotalTokens: number;
  statsByType: [string, number][];
  onClose: () => void;
}

export function TokenListStatsBar({
  statsTotalTokens,
  statsByType,
  onClose,
}: TokenListStatsBarProps) {
  if (statsTotalTokens === 0) return null;

  return (
    <div className="shrink-0 border-b border-[var(--color-figma-border)]">
      <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]">
        <span className="font-medium text-[var(--color-figma-text)]">
          {statsTotalTokens}
        </span>
        <span>token{statsTotalTokens !== 1 ? "s" : ""}</span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden flex gap-px">
          {statsByType.map(([type, count]) => (
            <div
              key={type}
              style={{
                width: `${(count / statsTotalTokens) * 100}%`,
                backgroundColor:
                  TOKEN_TYPE_COLORS[type] ?? "var(--color-token-type-fallback)",
              }}
              title={`${type}: ${count}`}
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
    </div>
  );
}
