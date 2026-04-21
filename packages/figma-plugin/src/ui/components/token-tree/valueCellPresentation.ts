import type { CSSProperties } from "react";
import type { TokenMapEntry } from "../../../shared/types";
import { formatTokenValueForDisplay } from "../../shared/tokenFormatting";

export interface ValueCellPresentation {
  primary: string;
  secondary?: string;
  primaryMonospace?: boolean;
  secondaryMonospace?: boolean;
  primaryStyle?: CSSProperties;
  secondaryStyle?: CSSProperties;
}

type DimensionLike = { value: unknown; unit?: string };
type TypographyLike = {
  fontFamily?: unknown;
  fontWeight?: unknown;
  fontSize?: unknown;
  lineHeight?: unknown;
  fontStyle?: unknown;
};
type ShadowLayerLike = {
  color?: unknown;
  offsetX?: unknown;
  offsetY?: unknown;
  x?: unknown;
  y?: unknown;
  blur?: unknown;
  blurRadius?: unknown;
  type?: unknown;
};
type BorderLike = {
  width?: unknown;
  style?: unknown;
  color?: unknown;
};
type TransitionLike = {
  duration?: unknown;
  delay?: unknown;
  timingFunction?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDimensionLike(value: unknown): value is DimensionLike {
  return isRecord(value) && "value" in value;
}

function isTypographyLike(value: unknown): value is TypographyLike {
  return isRecord(value) && (
    "fontFamily" in value ||
    "fontWeight" in value ||
    "fontSize" in value ||
    "lineHeight" in value ||
    "fontStyle" in value
  );
}

function isShadowLayerLike(value: unknown): value is ShadowLayerLike {
  return isRecord(value) && (
    "offsetX" in value ||
    "offsetY" in value ||
    "x" in value ||
    "y" in value ||
    "blur" in value ||
    "blurRadius" in value ||
    "color" in value ||
    "type" in value
  );
}

function isBorderLike(value: unknown): value is BorderLike {
  return isRecord(value) && ("width" in value || "style" in value || "color" in value);
}

function isTransitionLike(value: unknown): value is TransitionLike {
  return isRecord(value) && ("duration" in value || "delay" in value || "timingFunction" in value);
}

function joinDefined(
  parts: Array<string | null | undefined>,
  separator = " · ",
): string | undefined {
  const filtered = parts
    .map((part) => (typeof part === "string" ? part.trim() : part))
    .filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join(separator) : undefined;
}

function hasDefinedValue<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function formatDimension(value: unknown, defaultUnit = "px"): string {
  if (isDimensionLike(value)) {
    const unit = typeof value.unit === "string" && value.unit.length > 0
      ? value.unit
      : defaultUnit;
    return `${String(value.value)}${unit}`;
  }
  if (typeof value === "number") {
    return `${value}${defaultUnit}`;
  }
  return String(value ?? "");
}

function formatLineHeight(value: unknown): string {
  if (isDimensionLike(value)) return formatDimension(value, "");
  if (typeof value === "number") return String(value);
  return String(value ?? "");
}

function firstFontFamily(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string");
    return typeof first === "string" ? first : null;
  }
  return typeof value === "string" ? value : null;
}

function joinedFontFamily(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const families = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return families.length > 0 ? families.join(", ") : undefined;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

function formatShadowLayer(layer: unknown): string | null {
  if (!isShadowLayerLike(layer)) return null;
  const x = formatDimension(layer.offsetX ?? layer.x ?? 0);
  const y = formatDimension(layer.offsetY ?? layer.y ?? 0);
  const blur = formatDimension(layer.blur ?? layer.blurRadius ?? 0);
  return `${x} ${y} ${blur}`;
}

function formatShadowColor(layer: unknown): string | null {
  if (!isShadowLayerLike(layer) || typeof layer.color !== "string") return null;
  return layer.color;
}

function readGradientType(value: unknown): string {
  if (typeof value === "string") {
    if (value.includes("radial-gradient")) return "Radial";
    if (value.includes("conic-gradient")) return "Conic";
    return "Gradient";
  }

  if (Array.isArray(value)) return "Linear";

  if (!isRecord(value)) return "Gradient";
  const rawType = value.gradientType ?? value.type;
  if (typeof rawType !== "string" || rawType.length === 0) return "Gradient";

  const normalized = rawType.toLowerCase();
  if (normalized.includes("radial")) return "Radial";
  if (normalized.includes("angular") || normalized.includes("conic")) return "Conic";
  if (normalized.includes("diamond")) return "Diamond";
  if (normalized.includes("linear")) return "Linear";
  return rawType;
}

function countGradientStops(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (!isRecord(value) || !Array.isArray(value.stops)) return 0;
  return value.stops.length;
}

function fontWeightLabel(value: unknown): string | null {
  const weight = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(weight)) return null;

  if (weight <= 200) return "Thin";
  if (weight <= 300) return "Light";
  if (weight <= 400) return "Regular";
  if (weight <= 500) return "Medium";
  if (weight <= 600) return "Semibold";
  if (weight <= 700) return "Bold";
  if (weight <= 800) return "Heavy";
  return "Black";
}

function formatPercentage(value: unknown): string {
  if (typeof value === "number") return `${value}%`;
  const text = String(value ?? "");
  return text.includes("%") ? text : `${text}%`;
}

function formatTimingFunction(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 4) {
    return `cubic-bezier(${value.map((entry) => String(entry)).join(", ")})`;
  }
  return null;
}

function basenameFromUrl(value: string): string | null {
  if (value.startsWith("data:")) return "Embedded asset";

  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.at(-1) ?? url.hostname;
  } catch {
    const segments = value.split("/").filter(Boolean);
    return segments.at(-1) ?? value;
  }
}

export function getValueCellPresentation(
  entry: Pick<TokenMapEntry, "$type" | "$value">,
): ValueCellPresentation {
  const { $type: type, $value: value } = entry;
  const fallback = formatTokenValueForDisplay(type, value, {
    emptyPlaceholder: "—",
  });

  if (value === undefined || value === null) {
    return { primary: "—" };
  }

  switch (type) {
    case "color":
      return { primary: String(value), primaryMonospace: true };

    case "dimension":
      return { primary: formatDimension(value), primaryMonospace: true };

    case "duration":
      return {
        primary: formatDimension(value, "ms"),
        primaryMonospace: true,
      };

    case "number":
      return { primary: String(value), primaryMonospace: true };

    case "percentage":
      return { primary: formatPercentage(value), primaryMonospace: true };

    case "typography": {
      if (!isTypographyLike(value)) break;
      const size = hasDefinedValue(value.fontSize)
        ? formatDimension(value.fontSize)
        : null;
      const lineHeight = hasDefinedValue(value.lineHeight)
        ? formatLineHeight(value.lineHeight)
        : null;
      const family = firstFontFamily(value.fontFamily);
      const fontFamily = joinedFontFamily(value.fontFamily);
      const weight = hasDefinedValue(value.fontWeight)
        ? String(value.fontWeight)
        : null;
      const fontStyle =
        typeof value.fontStyle === "string" && value.fontStyle !== "normal"
          ? value.fontStyle
          : null;

      return {
        primary: joinDefined(
          [size, lineHeight ? `/ ${lineHeight}` : null],
          " ",
        ) ?? family ?? "Typography",
        secondary: joinDefined([family, weight, fontStyle]),
        primaryMonospace: Boolean(size),
        secondaryStyle: fontFamily
          ? {
              fontFamily,
              fontWeight:
                typeof value.fontWeight === "number" ||
                typeof value.fontWeight === "string"
                  ? String(value.fontWeight)
                  : undefined,
              fontStyle:
                typeof value.fontStyle === "string"
                  ? value.fontStyle
                  : undefined,
            }
          : undefined,
      };
    }

    case "shadow": {
      const layers = Array.isArray(value) ? value : [value];
      const firstLayer = layers[0];
      const summary = formatShadowLayer(firstLayer);
      const color = formatShadowColor(firstLayer);

      if (layers.length > 1) {
        return {
          primary: `${layers.length} layers`,
          secondary: joinDefined([summary, color]),
          secondaryMonospace: Boolean(summary),
        };
      }

      return {
        primary: summary ?? "Shadow",
        secondary: joinDefined([
          color,
          isShadowLayerLike(firstLayer) && firstLayer.type === "innerShadow"
            ? "Inner"
            : null,
        ]),
        primaryMonospace: Boolean(summary),
      };
    }

    case "border": {
      if (!isBorderLike(value)) break;
      return {
        primary:
          joinDefined(
            [
              hasDefinedValue(value.width) ? formatDimension(value.width) : null,
              typeof value.style === "string" ? value.style : null,
            ],
            " ",
          ) ?? "Border",
        secondary:
          typeof value.color === "string" ? value.color : undefined,
        primaryMonospace: hasDefinedValue(value.width),
        secondaryMonospace: typeof value.color === "string",
      };
    }

    case "gradient": {
      const stopCount = countGradientStops(value);
      return {
        primary: readGradientType(value),
        secondary:
          stopCount > 0
            ? `${stopCount} stop${stopCount === 1 ? "" : "s"}`
            : undefined,
      };
    }

    case "composition": {
      if (!isRecord(value)) break;
      const keys = Object.keys(value).filter((key) => !key.startsWith("$"));
      return {
        primary: `${keys.length} propert${keys.length === 1 ? "y" : "ies"}`,
        secondary: joinDefined([
          keys.slice(0, 2).join(" · "),
          keys.length > 2 ? `+${keys.length - 2}` : null,
        ]),
      };
    }

    case "boolean":
      return { primary: value === true || value === "true" ? "True" : "False" };

    case "string":
      return { primary: String(value) };

    case "fontFamily": {
      const family = firstFontFamily(value);
      const fallbackCount = Array.isArray(value) ? Math.max(value.length - 1, 0) : 0;
      const fontFamily = joinedFontFamily(value);
      return {
        primary: family ?? "Font family",
        secondary:
          fallbackCount > 0
            ? `+${fallbackCount} fallback${fallbackCount === 1 ? "" : "s"}`
            : undefined,
        primaryStyle: fontFamily ? { fontFamily } : undefined,
      };
    }

    case "fontWeight": {
      const weight = String(value);
      return {
        primary: weight,
        secondary: fontWeightLabel(value) ?? undefined,
        primaryMonospace: true,
        secondaryStyle: {
          fontWeight: weight,
          color: "var(--color-figma-text-secondary)",
        },
      };
    }

    case "strokeStyle":
      return { primary: String(value) };

    case "cubicBezier":
      return {
        primary: "Bezier",
        secondary: Array.isArray(value)
          ? value.map((entry) => String(entry)).join(", ")
          : undefined,
        secondaryMonospace: Array.isArray(value),
      };

    case "transition": {
      if (!isTransitionLike(value)) break;
      const duration = hasDefinedValue(value.duration)
        ? formatDimension(value.duration, "ms")
        : null;
      const delay = hasDefinedValue(value.delay)
        ? formatDimension(value.delay, "ms")
        : null;
      const timing = formatTimingFunction(value.timingFunction);
      return {
        primary: duration ?? "Transition",
        secondary: joinDefined([
          timing,
          delay && delay !== "0ms" && delay !== "0s" ? `delay ${delay}` : null,
        ]),
        primaryMonospace: Boolean(duration),
      };
    }

    case "asset": {
      const label = typeof value === "string" ? basenameFromUrl(value) : null;
      return {
        primary: label ?? "Asset",
        secondary: typeof value === "string" ? value : undefined,
      };
    }

    default:
      return {
        primary: fallback,
        primaryMonospace:
          type === "color" ||
          type === "dimension" ||
          type === "duration" ||
          type === "number" ||
          type === "percentage",
      };
  }

  return { primary: fallback };
}
