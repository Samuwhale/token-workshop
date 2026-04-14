import type { ThemeDimension } from "@tokenmanager/core";
import type { ResolverMeta } from "../../hooks/useResolvers";

export type ThemeResolverAxisStatus = "matched" | "warning" | "error";

export interface ThemeResolverAxisContext {
  dimensionId: string;
  dimensionName: string;
  selectedOptionName: string | null;
  modifierName: string | null;
  modifierLabel: string | null;
  contexts: string[];
  matchedContextName: string | null;
  missingContexts: string[];
  extraContexts: string[];
  issueMessages: string[];
  status: ThemeResolverAxisStatus;
}

export interface ThemeResolverModifierSummary {
  modifierName: string;
  modifierLabel: string;
  contexts: string[];
}

export interface ThemeResolverAuthoringContext {
  resolverName: string;
  resolverDescription: string | null;
  resolverCount: number;
  autoSelected: boolean;
  selectionOriginLabel: string;
  matchedAxisCount: number;
  issueCount: number;
  issueAxisCount: number;
  unmatchedModifierCount: number;
  setupSummary: string;
  recommendedActionLabel: string;
  axes: ThemeResolverAxisContext[];
  unmatchedModifiers: ThemeResolverModifierSummary[];
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function slugifyLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getModifierLabel(name: string, description?: string): string {
  const label = description?.trim();
  return label && label.length > 0 ? label : name;
}

function modifierMatchesDimension(
  dimension: ThemeDimension,
  modifierName: string,
  description?: string,
): boolean {
  const dimensionNormalized = normalizeLabel(dimension.name);
  const dimensionSlug = slugifyLabel(dimension.name);
  const modifierNormalized = normalizeLabel(modifierName);
  const modifierSlug = slugifyLabel(modifierName);
  const descriptionNormalized = normalizeLabel(description ?? "");
  const descriptionSlug = slugifyLabel(description ?? "");

  return (
    dimensionNormalized === modifierNormalized ||
    dimensionNormalized === descriptionNormalized ||
    dimensionSlug === modifierSlug ||
    dimensionSlug === descriptionSlug
  );
}

function getOptionOverlapCount(
  dimension: ThemeDimension,
  modifierContexts: string[],
): number {
  const optionNames = new Set(dimension.options.map((option) => option.name));
  return modifierContexts.reduce(
    (count, contextName) => count + (optionNames.has(contextName) ? 1 : 0),
    0,
  );
}

function scoreResolverMatch(
  resolver: ResolverMeta,
  dimensions: ThemeDimension[],
  selectedOptions: Record<string, string>,
): number {
  const unusedModifierNames = new Set(Object.keys(resolver.modifiers));
  let score = 0;

  for (const dimension of dimensions) {
    const exactMatch = Array.from(unusedModifierNames).find((modifierName) =>
      modifierMatchesDimension(
        dimension,
        modifierName,
        resolver.modifiers[modifierName]?.description,
      ),
    );

    if (exactMatch) {
      score += 100;
      const selectedOptionName =
        selectedOptions[dimension.id] ?? dimension.options[0]?.name ?? null;
      if (
        selectedOptionName &&
        resolver.modifiers[exactMatch]?.contexts.includes(selectedOptionName)
      ) {
        score += 5;
      }
      unusedModifierNames.delete(exactMatch);
      continue;
    }

    let bestOverlap = 0;
    for (const modifierName of unusedModifierNames) {
      const overlapCount = getOptionOverlapCount(
        dimension,
        resolver.modifiers[modifierName]?.contexts ?? [],
      );
      if (overlapCount > bestOverlap) {
        bestOverlap = overlapCount;
      }
    }
    score += bestOverlap * 5;
  }

  score -= unusedModifierNames.size * 3;
  return score;
}

function selectResolver(
  resolvers: ResolverMeta[],
  activeResolverName: string | null | undefined,
  dimensions: ThemeDimension[],
  selectedOptions: Record<string, string>,
): { resolver: ResolverMeta; autoSelected: boolean } | null {
  if (resolvers.length === 0) return null;

  if (activeResolverName) {
    const activeResolver = resolvers.find(
      (resolver) => resolver.name === activeResolverName,
    );
    if (activeResolver) {
      return { resolver: activeResolver, autoSelected: false };
    }
  }

  const rankedResolvers = [...resolvers].sort((left, right) => {
    const scoreDelta =
      scoreResolverMatch(right, dimensions, selectedOptions) -
      scoreResolverMatch(left, dimensions, selectedOptions);
    if (scoreDelta !== 0) return scoreDelta;
    return left.name.localeCompare(right.name);
  });

  return rankedResolvers[0]
    ? { resolver: rankedResolvers[0], autoSelected: true }
    : null;
}

export function buildThemeResolverAuthoringContext({
  dimensions,
  selectedOptions,
  resolvers,
  activeResolverName,
}: {
  dimensions: ThemeDimension[];
  selectedOptions: Record<string, string>;
  resolvers: ResolverMeta[];
  activeResolverName?: string | null;
}): ThemeResolverAuthoringContext | null {
  const selectedResolver = selectResolver(
    resolvers,
    activeResolverName,
    dimensions,
    selectedOptions,
  );
  if (!selectedResolver) return null;

  const { resolver, autoSelected } = selectedResolver;
  const unmatchedModifierNames = new Set(Object.keys(resolver.modifiers));
  const axes: ThemeResolverAxisContext[] = dimensions.map((dimension) => {
    const selectedOptionName =
      selectedOptions[dimension.id] ?? dimension.options[0]?.name ?? null;
    const exactModifierName = Array.from(unmatchedModifierNames).find(
      (modifierName) =>
        modifierMatchesDimension(
          dimension,
          modifierName,
          resolver.modifiers[modifierName]?.description,
        ),
    );

    if (!exactModifierName) {
      const issueMessages = [
        `No output switch matches "${dimension.name}".`,
      ];
      return {
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        selectedOptionName,
        modifierName: null,
        modifierLabel: null,
        contexts: [],
        matchedContextName: null,
        missingContexts: dimension.options.map((option) => option.name),
        extraContexts: [],
        issueMessages,
        status: "error",
      };
    }

    unmatchedModifierNames.delete(exactModifierName);

    const modifier = resolver.modifiers[exactModifierName];
    const contexts = modifier?.contexts ?? [];
    const optionNames = dimension.options.map((option) => option.name);
    const missingContexts = optionNames.filter(
      (optionName) => !contexts.includes(optionName),
    );
    const extraContexts = contexts.filter(
      (contextName) => !optionNames.includes(contextName),
    );
    const matchedContextName =
      selectedOptionName && contexts.includes(selectedOptionName)
        ? selectedOptionName
        : null;
    const issueMessages: string[] = [];

    if (selectedOptionName && !matchedContextName) {
      issueMessages.push(
        `"${selectedOptionName}" is not available in this output.`,
      );
    }
    if (missingContexts.length > 0) {
      issueMessages.push(
        `Missing values: ${missingContexts.join(", ")}.`,
      );
    }
    if (extraContexts.length > 0) {
      issueMessages.push(
        `Output-only values: ${extraContexts.join(", ")}.`,
      );
    }

    const status: ThemeResolverAxisStatus =
      selectedOptionName && !matchedContextName
        ? "error"
        : missingContexts.length > 0
          ? "error"
          : issueMessages.length > 0
            ? "warning"
            : "matched";

    return {
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      selectedOptionName,
      modifierName: exactModifierName,
      modifierLabel: getModifierLabel(exactModifierName, modifier?.description),
      contexts,
      matchedContextName,
      missingContexts,
      extraContexts,
      issueMessages,
      status,
    };
  });

  const unmatchedModifiers = Array.from(unmatchedModifierNames).map(
    (modifierName) => ({
      modifierName,
      modifierLabel: getModifierLabel(
        modifierName,
        resolver.modifiers[modifierName]?.description,
      ),
      contexts: resolver.modifiers[modifierName]?.contexts ?? [],
    }),
  );
  const issueAxisCount = axes.filter((axis) => axis.status !== "matched").length;
  const unmatchedModifierCount = unmatchedModifiers.length;
  const issueCount =
    issueAxisCount + unmatchedModifierCount;
  const selectionOriginLabel = autoSelected
    ? "Suggested from your theme setup"
    : "Selected output";
  const setupSummary =
    issueCount === 0
      ? "Every mode is connected to an output switch."
      : `${issueCount} mapping issue${issueCount === 1 ? "" : "s"} still need review.`;
  const recommendedActionLabel =
    issueCount === 0 ? "Review output" : "Fix mappings";

  return {
    resolverName: resolver.name,
    resolverDescription: resolver.description?.trim() || null,
    resolverCount: resolvers.length,
    autoSelected,
    selectionOriginLabel,
    matchedAxisCount: axes.filter((axis) => axis.status === "matched").length,
    issueCount,
    issueAxisCount,
    unmatchedModifierCount,
    setupSummary,
    recommendedActionLabel,
    axes,
    unmatchedModifiers,
  };
}
