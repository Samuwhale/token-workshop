import type { TokenMapEntry } from "../../../shared/types";
import { isAlias, extractAliasPath } from "../../../shared/resolveAlias";
import type { TokenEditorValue } from "../../shared/tokenEditorTypes";

/**
 * Returns the cycle path (e.g. ["a", "b", "c", "a"]) if following `ref`
 * from `currentTokenPath` would create a cycle, or null if no cycle.
 */
export function detectAliasCycle(
  ref: string,
  currentTokenPath: string,
  allTokensFlat: Record<string, TokenMapEntry>,
): string[] | null {
  const visited = new Set<string>([currentTokenPath]);
  const chain: string[] = [currentTokenPath];
  let current = isAlias(ref) ? extractAliasPath(ref)! : ref;
  while (true) {
    if (visited.has(current)) {
      const cycleStart = chain.indexOf(current);
      return [...chain.slice(cycleStart), current];
    }
    visited.add(current);
    chain.push(current);
    const entry = allTokensFlat[current];
    if (!entry) return null;
    const v = entry.$value;
    if (isAlias(v)) {
      current = extractAliasPath(v)!;
    } else {
      return null;
    }
  }
}

/** Parse a raw clipboard/initial string value into the shape the editor expects for the given type. */
export function parseInitialValueForType(
  type: string,
  raw: string,
): TokenEditorValue {
  const v = raw.trim();
  if (type === "color") return v;
  if (type === "dimension") {
    const m = v.match(
      /^(-?\d*\.?\d+)\s*(px|rem|em|%|vw|vh|pt|dp|sp|cm|mm|fr|ch|ex)?$/,
    );
    if (m) return { value: parseFloat(m[1]), unit: m[2] || "px" };
    return v;
  }
  if (type === "duration") {
    const m = v.match(/^(-?\d*\.?\d+)\s*(ms|s)?$/);
    if (m) return { value: parseFloat(m[1]), unit: m[2] || "ms" };
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  if (type === "number" || type === "fontWeight") {
    const n = parseFloat(v);
    return isNaN(n) ? v : n;
  }
  if (type === "boolean") {
    return v.toLowerCase() === "true";
  }
  return v;
}

export function getInitialCreateValue(
  type: string,
  raw?: string,
): TokenEditorValue {
  if (raw && isAlias(raw)) {
    return raw;
  }
  if (raw) {
    return parseInitialValueForType(type, raw);
  }
  if (type === "color") return "#000000";
  if (type === "dimension") return { value: 0, unit: "px" };
  if (type === "number" || type === "duration") return 0;
  if (type === "boolean") return false;
  if (type === "shadow") {
    return {
      x: 0,
      y: 0,
      blur: 4,
      spread: 0,
      color: "#000000",
      type: "dropShadow",
    };
  }
  return "";
}

/**
 * Try to parse clipboard text as a structured value for the given token type.
 * Returns the parsed value on success, or null if no valid parse was found.
 * Used by the container-level onPaste handler in TokenEditor.
 */
export function parsePastedValue(
  type: string,
  text: string,
): TokenEditorValue | null {
  const v = text.trim();
  if (!v) return null;

  // Try JSON parse first (DTCG export format or raw object)
  if (v.startsWith("{") || v.startsWith("[")) {
    try {
      const parsed = JSON.parse(v);
      // DTCG token format: { $value: ..., $type: ... }
      const rawValue =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.$value !== undefined
          ? parsed.$value
          : parsed;
      // Complex types accept the parsed object/array directly
      if (
        [
          "typography",
          "shadow",
          "border",
          "gradient",
          "transition",
          "composition",
        ].includes(type)
      ) {
        return typeof rawValue === "object" ? rawValue : null;
      }
      if (
        type === "cubicBezier" &&
        Array.isArray(rawValue) &&
        rawValue.length === 4
      ) {
        return rawValue;
      }
      // Primitive types: convert rawValue via string parsing
      if (rawValue !== undefined && rawValue !== null) {
        return parseInitialValueForType(
          type,
          typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue),
        );
      }
      return null;
    } catch {
      // Not valid JSON — fall through to string parsing
    }
  }

  // String parsing per type
  switch (type) {
    case "color":
      if (
        /^#[0-9a-fA-F]{3,8}$/.test(v) ||
        /^rgba?\s*\(/.test(v) ||
        /^hsla?\s*\(/.test(v) ||
        /^oklch\s*\(/.test(v) ||
        /^oklab\s*\(/.test(v) ||
        /^color\s*\(/.test(v)
      )
        return v;
      return null;

    case "dimension": {
      const m = v.match(
        /^(-?\d*\.?\d+)\s*(px|rem|em|%|vw|vh|pt|dp|sp|cm|mm|fr|ch|ex)?$/,
      );
      if (m) return { value: parseFloat(m[1]), unit: m[2] || "px" };
      return null;
    }

    case "duration": {
      const m = v.match(/^(-?\d*\.?\d+)\s*(ms|s)$/);
      if (m) return { value: parseFloat(m[1]), unit: m[2] };
      return null;
    }

    case "letterSpacing": {
      const m = v.match(/^(-?\d*\.?\d+)\s*(px|em|rem|%)?$/);
      if (m) return { value: parseFloat(m[1]), unit: m[2] || "px" };
      return null;
    }

    case "cubicBezier": {
      // Accept "x1,y1,x2,y2" comma-separated format
      const parts = v.split(",").map((s) => parseFloat(s.trim()));
      if (parts.length === 4 && parts.every((n) => !isNaN(n))) return parts;
      return null;
    }

    case "number":
    case "fontWeight":
    case "lineHeight":
    case "percentage": {
      const cleaned =
        type === "percentage" && v.endsWith("%") ? v.slice(0, -1) : v;
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    }

    case "boolean":
      if (v.toLowerCase() === "true") return true;
      if (v.toLowerCase() === "false") return false;
      return null;

    case "string":
    case "fontFamily":
    case "link":
    case "asset":
    case "fontStyle":
    case "textDecoration":
    case "textTransform":
    case "strokeStyle":
    case "custom":
      return v || null;

    default:
      return null;
  }
}

export function buildTypographyPreviewStyle(value: Record<string, unknown>): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (typeof value.fontFamily === "string" && value.fontFamily) {
    style.fontFamily = value.fontFamily;
  }
  if (value.fontSize != null) {
    const fs = value.fontSize;
    if (typeof fs === "object" && fs !== null && "value" in fs) {
      const { value: v, unit } = fs as { value: number; unit?: string };
      style.fontSize = `${Math.min(v, 48)}${unit || "px"}`;
    } else if (typeof fs === "number") {
      style.fontSize = `${Math.min(fs, 48)}px`;
    }
  }
  if (typeof value.fontWeight === "number" || typeof value.fontWeight === "string") {
    style.fontWeight = value.fontWeight as React.CSSProperties["fontWeight"];
  }
  if (typeof value.lineHeight === "number") {
    style.lineHeight = value.lineHeight;
  }
  if (value.letterSpacing != null) {
    const ls = value.letterSpacing;
    if (typeof ls === "object" && ls !== null && "value" in ls) {
      const { value: v, unit } = ls as { value: number; unit?: string };
      style.letterSpacing = `${v}${unit || "px"}`;
    }
  }
  return style;
}

export function getTypographyPreviewValue(
  value: TokenEditorValue,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const previewValue = value as Record<string, unknown>;
  const hasPreviewContent =
    typeof previewValue.fontFamily === "string" || previewValue.fontSize != null;

  return hasPreviewContent ? previewValue : null;
}

/** Suggested namespace prefixes per token type to help new users build consistent hierarchies. */
export const NAMESPACE_SUGGESTIONS: Record<
  string,
  { prefixes: string[]; example: string }
> = {
  color: { prefixes: ["color."], example: "color.brand.primary" },
  dimension: {
    prefixes: ["spacing.", "sizing.", "radius."],
    example: "spacing.md",
  },
  typography: { prefixes: ["typography."], example: "typography.heading.lg" },
  shadow: { prefixes: ["shadow."], example: "shadow.md" },
  border: { prefixes: ["border."], example: "border.default" },
  gradient: { prefixes: ["gradient."], example: "gradient.brand" },
  duration: { prefixes: ["duration."], example: "duration.fast" },
  fontFamily: { prefixes: ["fontFamily."], example: "fontFamily.body" },
  fontWeight: { prefixes: ["fontWeight."], example: "fontWeight.bold" },
  number: { prefixes: ["scale.", "opacity."], example: "scale.ratio" },
  string: { prefixes: [], example: "label.heading" },
  boolean: { prefixes: [], example: "feature.darkMode" },
  strokeStyle: { prefixes: ["strokeStyle."], example: "strokeStyle.dashed" },
};
