import { getTokenLifecycle, type TokenLifecycle } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";

export const FIGMA_SCOPE_OPTIONS: Record<
  string,
  Array<{ label: string; value: string; description: string }>
> = {
  color: [
    {
      label: "Fill Color",
      value: "FILL_COLOR",
      description: "Background and shape fill colors",
    },
    {
      label: "Stroke Color",
      value: "STROKE_COLOR",
      description: "Border and outline colors",
    },
    {
      label: "Text Fill",
      value: "TEXT_FILL",
      description: "Text layer colors",
    },
    {
      label: "Effect Color",
      value: "EFFECT_COLOR",
      description: "Shadow and blur effect colors",
    },
  ],
  number: [
    {
      label: "Width & Height",
      value: "WIDTH_HEIGHT",
      description: "Frame and element dimensions",
    },
    {
      label: "Gap / Spacing",
      value: "GAP",
      description: "Auto-layout gap and padding",
    },
    {
      label: "Corner Radius",
      value: "CORNER_RADIUS",
      description: "Rounded corner radius",
    },
    {
      label: "Opacity",
      value: "OPACITY",
      description: "Layer opacity (0–1)",
    },
    {
      label: "Font Size",
      value: "FONT_SIZE",
      description: "Text font size",
    },
    {
      label: "Line Height",
      value: "LINE_HEIGHT",
      description: "Text line height",
    },
    {
      label: "Letter Spacing",
      value: "LETTER_SPACING",
      description: "Text letter spacing",
    },
    {
      label: "Stroke Width",
      value: "STROKE_FLOAT",
      description: "Border and outline thickness",
    },
  ],
  dimension: [
    {
      label: "Width & Height",
      value: "WIDTH_HEIGHT",
      description: "Frame and element dimensions",
    },
    {
      label: "Gap / Spacing",
      value: "GAP",
      description: "Auto-layout gap and padding",
    },
    {
      label: "Corner Radius",
      value: "CORNER_RADIUS",
      description: "Rounded corner radius",
    },
    {
      label: "Stroke Width",
      value: "STROKE_FLOAT",
      description: "Border and outline thickness",
    },
  ],
  string: [
    {
      label: "Font Family",
      value: "FONT_FAMILY",
      description: "Typeface family name",
    },
    {
      label: "Font Style",
      value: "FONT_STYLE",
      description: "Weight and style (e.g. Bold Italic)",
    },
    {
      label: "Text Content",
      value: "TEXT_CONTENT",
      description: "Text layer content strings",
    },
  ],
  boolean: [
    {
      label: "Visibility",
      value: "SHOW_HIDE",
      description: "Toggle layer visibility",
    },
  ],
};

type TokenExtensions = Record<string, unknown> | undefined;
type TokenPresentationEntry = {
  $extensions?: Record<string, unknown>;
  $scopes?: string[];
  $lifecycle?: TokenLifecycle;
};

type TokenManagerMetadata = {
  source?: string;
  extends?: string;
};

function readTokenManagerMetadata(
  extensions: TokenExtensions,
): TokenManagerMetadata {
  const raw = extensions?.tokenmanager;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const metadata = raw as Record<string, unknown>;
  return {
    source: typeof metadata.source === "string" ? metadata.source : undefined,
    extends:
      typeof metadata.extends === "string" ? metadata.extends : undefined,
  };
}

export function readTokenPresentationMetadata(
  entry?: TokenMapEntry | TokenPresentationEntry,
): {
  scopes: string[];
  lifecycle: TokenLifecycle;
  provenance: string | null;
  extendsPath: string | null;
} {
  const metadataEntry = entry as TokenPresentationEntry | undefined;
  const extensions = metadataEntry?.$extensions;
  const scopesFromExtensions = extensions?.["com.figma.scopes"] as unknown;
  const metadata = readTokenManagerMetadata(extensions);
  const scopes = Array.isArray(metadataEntry?.$scopes)
    ? metadataEntry.$scopes
      : Array.isArray(scopesFromExtensions)
      ? scopesFromExtensions.filter(
          (value): value is string => typeof value === "string",
        )
      : [];

  return {
    scopes,
    lifecycle: readTokenLifecycle(metadataEntry),
    provenance: metadata.source ?? null,
    extendsPath: metadata.extends ?? null,
  };
}

export function normalizeTokenLifecycle(value: unknown): TokenLifecycle {
  return value === "draft" || value === "deprecated" || value === "published"
    ? value
    : "published";
}

export function compactTokenLifecycle(
  value: unknown,
): TokenMapEntry["$lifecycle"] | undefined {
  const lifecycle = normalizeTokenLifecycle(value);
  return lifecycle === "published" ? undefined : lifecycle;
}

export function readTokenLifecycle(
  entry?: TokenMapEntry | TokenPresentationEntry,
): TokenLifecycle {
  return entry?.$lifecycle ?? getTokenLifecycle(entry ?? {});
}

export function getScopeLabels(tokenType: string, scopes: string[]): string[] {
  const definitions = FIGMA_SCOPE_OPTIONS[tokenType] ?? [];
  const byValue = new Map(definitions.map((scope) => [scope.value, scope.label]));
  return scopes.map((scope) => byValue.get(scope) ?? scope);
}

export function summarizeTokenScopes(
  tokenType: string,
  scopes: string[],
  maxLabels = 2,
): string | null {
  if (scopes.length === 0) return null;
  const labels = getScopeLabels(tokenType, scopes);
  if (labels.length <= maxLabels) return labels.join(", ");
  return `${labels.slice(0, maxLabels).join(", ")} +${labels.length - maxLabels}`;
}

/**
 * Returns true when the token's scopes actually narrow its applicability —
 * i.e. scopes is non-empty and is a proper subset of the full scope set for
 * the token's type. Empty scopes ("all scopes" in Figma) or a set equal to
 * the full type set do not restrict.
 */
export function scopeRestrictsType(tokenType: string, scopes: string[]): boolean {
  const full = FIGMA_SCOPE_OPTIONS[tokenType];
  if (!full || full.length === 0) return false;
  if (scopes.length === 0) return false;
  if (scopes.length >= full.length) return false;
  return true;
}

export function getLifecycleLabel(
  lifecycle: TokenLifecycle,
): string | null {
  if (lifecycle === "published") return null;
  return lifecycle === "draft" ? "Draft" : "Deprecated";
}
