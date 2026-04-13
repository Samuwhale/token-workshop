import type { GeneratorType } from "../hooks/useGenerators";
import type { GraphTemplate } from "./graph-templates";
import {
  getTemplateSemanticCount,
  getTemplateStepCount,
} from "./graph-templates";
import { getGeneratorTypeLabel } from "./GeneratorPipelineCard";

function PipelineStages({ stages }: { stages: string[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((stage, index) => (
        <div key={stage} className="flex items-center gap-1">
          <span className="whitespace-nowrap rounded bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
            {stage}
          </span>
          {index < stages.length - 1 && (
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="currentColor"
              className="shrink-0 text-[var(--color-figma-text-tertiary)]"
              aria-hidden="true"
            >
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

function TemplateIcon({ id }: { id: string }) {
  switch (id) {
    case "brand-color-palette":
      return (
        <div className="flex gap-0.5 h-5 items-center">
          {[97, 80, 60, 40, 20, 8].map((lightness) => (
            <div
              key={lightness}
              className="h-full w-2.5 rounded-sm"
              style={{ background: `hsl(220, 60%, ${lightness}%)` }}
            />
          ))}
        </div>
      );
    case "spacing-foundation":
      return (
        <div className="flex items-end gap-0.5 h-5">
          {[20, 35, 50, 65, 80, 100].map((height, index) => (
            <div
              key={height}
              className="w-1.5 rounded-sm bg-[var(--color-figma-accent)]"
              style={{ height: `${height}%`, opacity: 0.5 + index * 0.08 }}
            />
          ))}
        </div>
      );
    case "type-scale":
      return (
        <div className="flex items-baseline gap-1 h-5 overflow-hidden">
          {[7, 9, 11, 13, 16].map((size) => (
            <span
              key={size}
              className="font-medium leading-none text-[var(--color-figma-text)]"
              style={{ fontSize: `${size}px` }}
            >
              A
            </span>
          ))}
        </div>
      );
    case "corner-radius":
      return (
        <div className="flex items-center gap-1 h-5">
          {[0, 2, 4, 8, 999].map((radius) => (
            <div
              key={radius}
              className="h-3 w-3 border border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/20"
              style={{ borderRadius: Math.min(radius, 6) }}
            />
          ))}
        </div>
      );
    case "opacity-states":
      return (
        <div className="flex items-center gap-0.5 h-5">
          {[0.1, 0.25, 0.5, 0.75, 1].map((opacity) => (
            <div
              key={opacity}
              className="h-3 w-3 rounded-sm bg-[var(--color-figma-accent)]"
              style={{ opacity }}
            />
          ))}
        </div>
      );
    case "layer-stack":
      return (
        <div className="relative h-5 w-12">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="absolute h-3 w-6 rounded-sm border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)]"
              style={{ bottom: index * 3, left: index * 3, zIndex: index }}
            />
          ))}
        </div>
      );
    case "elevation-shadows":
      return (
        <div className="flex items-end gap-1 h-5">
          {["sm", "md", "lg"].map((key, index) => (
            <div
              key={key}
              className="rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]"
              style={{
                width: 10 + index * 2,
                height: 8 + index * 2,
                boxShadow: `0 ${index + 1}px ${4 + index * 2}px rgba(0,0,0,${0.08 + index * 0.05})`,
              }}
            />
          ))}
        </div>
      );
    case "accessible-color-pair":
      return (
        <div className="flex items-center gap-1 h-5">
          <div
            className="flex h-full w-5 items-center justify-center rounded-sm"
            style={{ background: "hsl(240, 55%, 40%)" }}
          >
            <span className="text-[7px] font-bold leading-none text-white">
              Aa
            </span>
          </div>
          <div className="flex h-full flex-col justify-center gap-0.5">
            <div className="text-[7px] font-medium leading-none text-[var(--color-figma-text-secondary)]">
              4.5:1
            </div>
            <div className="text-[6.5px] leading-none text-[var(--color-figma-text-tertiary)]">
              AA
            </div>
          </div>
        </div>
      );
    case "dark-mode-palette":
      return (
        <div className="flex items-center gap-0.5 h-5">
          <div className="flex h-full gap-0.5">
            {[97, 70, 40].map((lightness) => (
              <div
                key={lightness}
                className="h-full w-2 rounded-sm"
                style={{ background: `hsl(220, 50%, ${lightness}%)` }}
              />
            ))}
          </div>
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="currentColor"
            className="mx-0.5 shrink-0 text-[var(--color-figma-text-tertiary)]"
            aria-hidden="true"
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          <div className="flex h-full gap-0.5">
            {[8, 20, 50].map((lightness) => (
              <div
                key={lightness}
                className="h-full w-2 rounded-sm"
                style={{ background: `hsl(220, 50%, ${lightness}%)` }}
              />
            ))}
          </div>
        </div>
      );
    default:
      return (
        <div className="flex h-5 w-10 items-center justify-center text-[var(--color-figma-text-tertiary)]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="5" cy="12" r="3" />
            <path d="M8 12h8" />
            <circle cx="19" cy="12" r="3" />
          </svg>
        </div>
      );
  }
}

function getRelevanceScore(
  template: GraphTemplate,
  sourceTokenType?: string,
  recommendedType?: GeneratorType,
): number {
  let score = 0;
  if (recommendedType && template.generatorType === recommendedType) score += 2;
  if (sourceTokenType && template.sourceTokenTypes?.includes(sourceTokenType)) {
    score += 3;
  }
  if (!template.requiresSource) score += 1;
  return score;
}

export function sortTemplatesForIntentPicker(
  templates: GraphTemplate[],
  sourceTokenType?: string,
  recommendedType?: GeneratorType,
  suggestedTemplateId?: string | null,
): GraphTemplate[] {
  return [...templates].sort((left, right) => {
    if (suggestedTemplateId) {
      if (left.id === suggestedTemplateId) return -1;
      if (right.id === suggestedTemplateId) return 1;
    }
    const scoreDelta =
      getRelevanceScore(right, sourceTokenType, recommendedType) -
      getRelevanceScore(left, sourceTokenType, recommendedType);
    if (scoreDelta !== 0) return scoreDelta;
    return left.label.localeCompare(right.label);
  });
}

export function GeneratorIntentCard({
  template,
  onSelect,
  disabled,
  compact = false,
  isSuggested = false,
}: {
  template: GraphTemplate;
  onSelect: () => void;
  disabled: boolean;
  compact?: boolean;
  isSuggested?: boolean;
}) {
  const stepCount = getTemplateStepCount(template);
  const semanticCount = getTemplateSemanticCount(template);
  const densityClass = compact ? "p-2.5" : "p-3";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full rounded border bg-[var(--color-figma-bg)] text-left transition-all group disabled:opacity-40 disabled:cursor-not-allowed ${densityClass} ${
        isSuggested
          ? "border-[var(--color-figma-accent)]/40 bg-[var(--color-figma-accent)]/5"
          : "border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] hover:border-[var(--color-figma-accent)]"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">
          <TemplateIcon id={template.id} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-[var(--color-figma-text)] group-hover:text-[var(--color-figma-accent)] transition-colors">
              {template.label}
            </span>
            {isSuggested && (
              <span className="rounded-full bg-[var(--color-figma-accent)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-accent)]">
                Suggested
              </span>
            )}
            <span className="rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1 py-px text-[9px] text-[var(--color-figma-text-secondary)]">
              {getGeneratorTypeLabel(template.generatorType)}
            </span>
          </div>
          <p className="text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            {template.description}
          </p>
          <p className="mt-1 text-[9.5px] leading-snug text-[var(--color-figma-text-tertiary)]">
            {template.whenToUse}
          </p>
          {!compact && (
            <div className="mt-2">
              <PipelineStages stages={template.stages} />
            </div>
          )}
          <div className="mt-2 grid gap-1">
            <div className="flex items-start gap-1.5 text-[9.5px] text-[var(--color-figma-text-secondary)]">
              <span className="font-medium text-[var(--color-figma-text)]">
                Needs
              </span>
              <span className="leading-snug">{template.sourceRequirement}</span>
            </div>
            <div className="flex items-start gap-1.5 text-[9.5px] text-[var(--color-figma-text-secondary)]">
              <span className="font-medium text-[var(--color-figma-text)]">
                Seeds
              </span>
              <span className="leading-snug">{template.starterPreset}</span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
            <span>
              {stepCount} starter step{stepCount === 1 ? "" : "s"}
            </span>
            {semanticCount > 0 && (
              <>
                <span aria-hidden="true">•</span>
                <span>
                  {semanticCount} semantic starter
                  {semanticCount === 1 ? "" : "s"}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export function GeneratorIntentCatalog({
  templates,
  connected,
  onSelectTemplate,
  sourceTokenType,
  recommendedType,
  suggestedTemplateId,
  compact = false,
  emptyStateTitle = "No intents match",
  emptyStateDescription = "Try a different search term.",
}: {
  templates: GraphTemplate[];
  connected: boolean;
  onSelectTemplate: (template: GraphTemplate) => void;
  sourceTokenType?: string;
  recommendedType?: GeneratorType;
  suggestedTemplateId?: string | null;
  compact?: boolean;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
}) {
  const sortedTemplates = sortTemplatesForIntentPicker(
    templates,
    sourceTokenType,
    recommendedType,
    suggestedTemplateId,
  );

  return (
    <div className="flex flex-col gap-2">
      {sortedTemplates.length > 0 ? (
        sortedTemplates.map((template) => (
          <GeneratorIntentCard
            key={template.id}
            template={template}
            onSelect={() => onSelectTemplate(template)}
            disabled={!connected}
            compact={compact}
            isSuggested={template.id === suggestedTemplateId}
          />
        ))
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="mb-1 text-[11px] text-[var(--color-figma-text-secondary)]">
            {emptyStateTitle}
          </p>
          <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {emptyStateDescription}
          </p>
        </div>
      )}
    </div>
  );
}

export interface TemplatePickerProps {
  templates: GraphTemplate[];
  connected: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectTemplate: (template: GraphTemplate) => void;
  browsingTemplates: boolean;
  onBack: () => void;
  activeSet: string;
  justApplied: string | null;
  sourceTokenType?: string;
  recommendedType?: GeneratorType;
  suggestedTemplateId?: string | null;
}

export function TemplatePicker({
  templates,
  connected,
  searchQuery,
  onSearchChange,
  onSelectTemplate,
  browsingTemplates,
  onBack,
  activeSet,
  justApplied,
  sourceTokenType,
  recommendedType,
  suggestedTemplateId,
}: TemplatePickerProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-start gap-2 px-3 pt-4 pb-3 shrink-0">
        {browsingTemplates && (
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 shrink-0 rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            aria-label="Back to pipeline"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M7.5 9.5L4 6l3.5-3.5" />
            </svg>
          </button>
        )}
        <div className="flex-1">
          <div className="mb-0.5 text-[12px] font-medium text-[var(--color-figma-text)]">
            Generator intents
          </div>
          <p className="text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            Start from the outcome you want, then open the shared generator composer pre-seeded for{" "}
            <span className="font-mono">{activeSet}</span>.
          </p>
        </div>
      </div>

      <div className="px-3 pb-2 shrink-0">
        <div className="relative">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)]"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search intents…"
            aria-label="Search intents"
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] py-1 pl-6 pr-6 text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-figma-text-tertiary)] transition-colors hover:text-[var(--color-figma-text)]"
              aria-label="Clear search"
            >
              <svg
                width="8"
                height="8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {justApplied && (
        <div className="mx-3 mb-2 flex items-center gap-1.5 rounded border border-[var(--color-figma-success,#22c55e)]/20 bg-[var(--color-figma-success,#22c55e)]/10 px-2.5 py-2 text-[10px] text-[var(--color-figma-success,#16a34a)]">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <span>
            <strong>{justApplied}</strong> applied
          </span>
        </div>
      )}

      <div className="px-3 pb-3">
        <GeneratorIntentCatalog
          templates={templates}
          connected={connected}
          onSelectTemplate={onSelectTemplate}
          sourceTokenType={sourceTokenType}
          recommendedType={recommendedType}
          suggestedTemplateId={suggestedTemplateId}
        />
      </div>

      {!connected && (
        <div className="px-3 pb-3">
          <p className="text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
            Connect to the server to create generators.
          </p>
        </div>
      )}
    </div>
  );
}
