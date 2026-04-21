import { Sparkles } from "lucide-react";
import type { TokenGenerator } from "../../hooks/useGenerators";
import type { TokensLibraryGeneratedGroupEditorTarget } from "../../shared/navigationTypes";
import { LONG_TEXT_CLASSES } from "../../shared/longTextStyles";
import { getGeneratedGroupTypeLabel } from "../../shared/generatedGroupUtils";
import { getSingleObviousGeneratorType } from "../generators/generatorUtils";

export interface TokenEditorDerivedGroupsProps {
  tokenPath: string;
  tokenName?: string;
  tokenType: string;
  value: any;
  existingGeneratorsForToken: TokenGenerator[];
  openGeneratedGroupEditor: (target: TokensLibraryGeneratedGroupEditorTarget) => void;
}

export function TokenEditorDerivedGroups({
  tokenPath,
  tokenName,
  tokenType,
  value,
  existingGeneratorsForToken,
  openGeneratedGroupEditor,
}: TokenEditorDerivedGroupsProps) {
  const obviousType = getSingleObviousGeneratorType(
    tokenType,
    tokenPath,
    tokenName,
    value,
  );

  const generateLabel = obviousType
    ? `Generate ${getGeneratedGroupTypeLabel(obviousType).toLowerCase()}…`
    : "Generate group from this token…";

  if (existingGeneratorsForToken.length === 0) {
    return (
      <button
        type="button"
        onClick={() => {
          openGeneratedGroupEditor({
            mode: 'create',
            sourceTokenPath: tokenPath,
            sourceTokenName: tokenName,
            sourceTokenType: tokenType,
            sourceTokenValue: value,
            ...(obviousType ? { initialDraft: { selectedType: obviousType } } : {}),
          });
        }}
        className="self-start flex items-center gap-1.5 text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors"
      >
        <Sparkles size={11} strokeWidth={2} aria-hidden />
        {generateLabel}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-secondary font-medium text-[var(--color-figma-text-secondary)]">
          Generated groups
        </span>
        <span className="text-secondary tabular-nums text-[var(--color-figma-text-tertiary)]">
          {existingGeneratorsForToken.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {existingGeneratorsForToken.map((gen) => (
          <div key={gen.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-secondary font-medium text-[var(--color-figma-text)] truncate">
                  {gen.name}
                </span>
                <span className="text-secondary text-[var(--color-figma-text-tertiary)] shrink-0">
                  {getGeneratedGroupTypeLabel(gen.type)}
                </span>
              </div>
              <span className={`${LONG_TEXT_CLASSES.monoSecondary} block`}>
                {gen.targetGroup}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openGeneratedGroupEditor({ mode: 'edit', id: gen.id });
              }}
              className="shrink-0 text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors"
            >
              Edit
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          openGeneratedGroupEditor({
            mode: 'create',
            sourceTokenPath: tokenPath,
            sourceTokenName: tokenName,
            sourceTokenType: tokenType,
            sourceTokenValue: value,
            ...(obviousType ? { initialDraft: { selectedType: obviousType } } : {}),
          });
        }}
        className="self-start flex items-center gap-1.5 text-secondary text-[var(--color-figma-accent)] hover:underline"
      >
        <Sparkles size={11} strokeWidth={2} aria-hidden />
        {generateLabel}
      </button>
    </div>
  );
}
