/**
 * Reusable template intent cards and catalog for generator creation.
 */
import type { GeneratorType } from "../../hooks/useGenerators";
import type { GraphTemplate } from "../graph-templates";
// ---------------------------------------------------------------------------
// Template icons
// ---------------------------------------------------------------------------

export function TemplateIcon({ id }: { id: string }) {
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

// ---------------------------------------------------------------------------
// Relevance scoring and sorting
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Intent card
// ---------------------------------------------------------------------------

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
  const densityClass = compact ? "p-2.5" : "p-3";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full rounded border bg-[var(--color-figma-bg)] text-left transition-all motion-reduce:transition-none group disabled:opacity-40 disabled:cursor-not-allowed ${densityClass} ${
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
            <span className="text-body font-medium text-[var(--color-figma-text)] group-hover:text-[var(--color-figma-accent)] transition-colors">
              {template.label}
            </span>
            {isSuggested && (
              <span className="text-secondary font-medium text-[var(--color-figma-accent)]">
                Suggested
              </span>
            )}
          </div>
          <p className="text-secondary leading-snug text-[var(--color-figma-text-secondary)]">
            {template.description}
          </p>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Intent catalog (list of cards)
// ---------------------------------------------------------------------------

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
        <div className="flex flex-col items-center justify-center py-3 text-center">
          <p className="mb-1 text-body text-[var(--color-figma-text-secondary)]">
            {emptyStateTitle}
          </p>
          <p className="text-secondary text-[var(--color-figma-text-tertiary)]">
            {emptyStateDescription}
          </p>
        </div>
      )}
    </div>
  );
}
