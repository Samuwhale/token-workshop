import { TOKEN_TYPE_BADGE_CLASS } from "../../shared/types";

export interface WhereIsResult {
  collectionId: string;
  $type: string;
  $value: unknown;
  $description?: string;
  isAlias: boolean;
  isDifferentFromFirst: boolean;
}

export interface WhereIsOverlayProps {
  whereIsPath: string;
  whereIsResults: WhereIsResult[] | null;
  whereIsLoading: boolean;
  onClose: () => void;
  onNavigateToSet?: (collectionId: string, path: string) => void;
}

export function WhereIsOverlay({
  whereIsPath,
  whereIsResults,
  whereIsLoading,
  onClose,
  onNavigateToSet,
}: WhereIsOverlayProps) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[var(--color-figma-bg)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
        <button
          onClick={onClose}
          className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] shrink-0"
          title="Close"
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M1 1l6 6M7 1L1 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
        <span
          className="flex-1 min-w-0 font-mono text-[10px] text-[var(--color-figma-text)] truncate"
          title={whereIsPath}
        >
          {whereIsPath}
        </span>
        {!whereIsLoading && whereIsResults !== null && (
          <span className="shrink-0 text-[10px] text-[var(--color-figma-text-tertiary)]">
            {whereIsResults.length} collection
            {whereIsResults.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {whereIsLoading ? (
          <div className="py-3 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
            Searching\u2026
          </div>
        ) : whereIsResults !== null && whereIsResults.length === 0 ? (
          <div className="py-3 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
            Token not found in any collection
          </div>
        ) : whereIsResults !== null ? (
          <div>
            {whereIsResults.map((def, i) => {
              const isColor =
                def.$type === "color" && typeof def.$value === "string";
              const colorHex = isColor
                ? (def.$value as string).slice(0, 7)
                : null;
              const valueLabel = def.isAlias
                ? String(def.$value)
                : typeof def.$value === "string"
                  ? def.$value
                  : JSON.stringify(def.$value);
              return (
                <div
                  key={def.collectionId}
                  className="flex items-center gap-2 px-2 py-2 border-b border-[var(--color-figma-border)]/50 hover:bg-[var(--color-figma-bg-hover)] group"
                >
                  {/* Color swatch */}
                  {colorHex ? (
                    <span
                      className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                      style={{ background: colorHex }}
                    />
                  ) : (
                    <span className="shrink-0 w-3 h-3" />
                  )}
                  {/* Set name + value */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-[var(--color-figma-text)] truncate">
                        {def.collectionId}
                      </span>
                      {i === 0 && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] shrink-0">
                          base
                        </span>
                      )}
                      {def.isDifferentFromFirst && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-warning)] shrink-0">
                          override
                        </span>
                      )}
                    </div>
                    <div
                      className="font-mono text-[10px] text-[var(--color-figma-text-secondary)] truncate"
                      title={valueLabel}
                    >
                      {valueLabel}
                      {def.$description && (
                        <span className="ml-1 text-[var(--color-figma-text-tertiary)] not-italic">
                          {def.$description}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Type badge */}
                  <span
                    className={`shrink-0 text-[8px] px-1 py-0.5 rounded ${TOKEN_TYPE_BADGE_CLASS[def.$type] ?? "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]"}`}
                  >
                    {def.$type}
                  </span>
                  {/* Navigate button */}
                  <button
                    className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[9px] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]"
                    onClick={() =>
                      onNavigateToSet?.(def.collectionId, whereIsPath)
                    }
                    title={`Go to ${def.collectionId}`}
                  >
                    Go
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
