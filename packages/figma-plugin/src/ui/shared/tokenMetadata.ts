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
  $lifecycle?: "draft" | "published" | "deprecated";
};

type TokenManagerMetadata = {
  lifecycle?: "draft" | "published" | "deprecated";
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
    lifecycle:
      metadata.lifecycle === "draft" || metadata.lifecycle === "deprecated"
        ? metadata.lifecycle
        : metadata.lifecycle === "published"
          ? "published"
          : undefined,
    source: typeof metadata.source === "string" ? metadata.source : undefined,
    extends:
      typeof metadata.extends === "string" ? metadata.extends : undefined,
  };
}

export function readTokenPresentationMetadata(
  entry?: TokenMapEntry | TokenPresentationEntry,
): {
  scopes: string[];
  lifecycle: "draft" | "published" | "deprecated";
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
    lifecycle: metadataEntry?.$lifecycle ?? metadata.lifecycle ?? "published",
    provenance: metadata.source ?? null,
    extendsPath: metadata.extends ?? null,
  };
}

export function getTokenProvenanceLabel(source: string | null): string | null {
  if (!source) return null;
  return (
    {
      "figma-variables": "Imported from Figma variables",
      "figma-styles": "Imported from Figma styles",
      json: "Imported from JSON",
      css: "Imported from CSS",
      tailwind: "Imported from Tailwind",
    }[source] ?? source
  );
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

export function compactTokenPath(path: string, segments = 3): string {
  const parts = path.split(".");
  if (parts.length <= segments) return path;
  return `…${parts.slice(-segments).join(".")}`;
}

export function getLifecycleLabel(
  lifecycle: "draft" | "published" | "deprecated",
): string | null {
  if (lifecycle === "published") return null;
  return lifecycle === "draft" ? "Draft" : "Deprecated";
}
