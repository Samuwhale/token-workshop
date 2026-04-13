import type { TokenGenerator } from "../../hooks/useGenerators";
import type { TokensLibraryGeneratorEditorTarget } from "../../shared/navigationTypes";
import { LONG_TEXT_CLASSES } from "../../shared/longTextStyles";

export interface TokenEditorDerivedGroupsProps {
  tokenPath: string;
  tokenName?: string;
  tokenType: string;
  value: any;
  existingGeneratorsForToken: TokenGenerator[];
  openGeneratorEditor: (target: TokensLibraryGeneratorEditorTarget) => void;
}

export function TokenEditorDerivedGroups({
  tokenPath,
  tokenName,
  tokenType,
  value,
  existingGeneratorsForToken,
  openGeneratorEditor,
}: TokenEditorDerivedGroupsProps) {
  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
      <button
        onClick={() => {
          openGeneratorEditor({
            mode: 'create',
            sourceTokenPath: tokenPath,
            sourceTokenName: tokenName,
            sourceTokenType: tokenType,
            sourceTokenValue: value,
          });
        }}
        className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="5" cy="2" r="1.5" />
            <circle cx="2" cy="8" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <path d="M5 3.5V6M5 6L2 6.5M5 6L8 6.5" />
          </svg>
          {existingGeneratorsForToken.length > 0
            ? `Derived groups (${existingGeneratorsForToken.length})`
            : "Derived groups"}
        </span>
        {existingGeneratorsForToken.length === 0 ? (
          <span className="text-[10px] text-[var(--color-figma-accent)]">
            + Create
          </span>
        ) : (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 2L3 5l4 3" />
          </svg>
        )}
      </button>
      {existingGeneratorsForToken.length > 0 && (
        <div className="px-3 py-2 flex flex-col gap-1.5 border-t border-[var(--color-figma-border)]">
          {existingGeneratorsForToken.map((gen) => (
            <div
              key={gen.id}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`px-1.5 py-0.5 rounded text-[8px] font-medium uppercase ${
                    gen.type === "colorRamp"
                      ? "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]"
                      : gen.type === "typeScale"
                        ? "bg-purple-500/15 text-purple-600"
                        : gen.type === "spacingScale"
                          ? "bg-green-500/15 text-green-600"
                          : "bg-orange-500/15 text-orange-600"
                  }`}
                >
                  {gen.type === "colorRamp"
                    ? "Ramp"
                    : gen.type === "typeScale"
                      ? "Scale"
                      : gen.type === "spacingScale"
                        ? "Spacing"
                        : "Opacity"}
                </span>
                <span className={LONG_TEXT_CLASSES.monoPrimary}>
                  {gen.targetGroup}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openGeneratorEditor({
                      mode: 'edit',
                      id: gen.id,
                    });
                  }}
                  className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openGeneratorEditor({
                      mode: 'create',
                      sourceTokenPath: tokenPath,
                      sourceTokenName: tokenName,
                      sourceTokenType: tokenType,
                      sourceTokenValue: value,
                      template: {
                        id: `dup-${gen.id}`,
                        label: `${gen.name} (copy)`,
                        description: "",
                        defaultPrefix: gen.targetGroup,
                        generatorType: gen.type,
                        config: gen.config,
                        requiresSource: false,
                      },
                    });
                  }}
                  title="Duplicate recipe"
                  className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors"
                >
                  Duplicate
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() => {
              openGeneratorEditor({
                mode: 'create',
                sourceTokenPath: tokenPath,
                sourceTokenName: tokenName,
                sourceTokenType: tokenType,
                sourceTokenValue: value,
              });
            }}
            className="mt-0.5 text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors text-left"
          >
            + Add another group
          </button>
        </div>
      )}
    </div>
  );
}
