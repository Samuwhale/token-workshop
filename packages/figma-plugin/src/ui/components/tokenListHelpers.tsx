import type { TokenNode } from '../hooks/useTokens';
import type { TokenMapEntry } from '../../shared/types';
import { stableStringify } from '../shared/utils';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import {
  parseDimensionTokenValue,
  parseDurationTokenValue,
  parseNumericTokenValue,
} from '../shared/tokenValueParsing';

// ---------------------------------------------------------------------------
// Composition token helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a composition token's sub-properties to raw (non-alias) values,
 * ready to be sent via postMessage to the plugin controller.
 *
 * Follows aliases one level for the top-level value, then resolves each
 * property value if it is itself an alias. Falls back to the original value
 * on broken aliases so the controller always receives a complete object.
 */
export function resolveCompositeForApply(
  node: TokenNode,
  allTokensFlat: Record<string, TokenMapEntry>,
): Record<string, any> {
  const rawVal = isAlias(node.$value)
    ? resolveTokenValue(node.$value as string, 'composition', allTokensFlat).value
    : node.$value;
  const compObj = typeof rawVal === 'object' && rawVal !== null ? rawVal : {};
  const resolvedComp: Record<string, any> = {};
  for (const [prop, propVal] of Object.entries(compObj)) {
    if (isAlias(propVal)) {
      const r = resolveTokenValue(propVal as string, 'unknown', allTokensFlat);
      resolvedComp[prop] = r.error ? propVal : r.value;
    } else {
      resolvedComp[prop] = propVal;
    }
  }
  return resolvedComp;
}

// ---------------------------------------------------------------------------
// Color matching helpers for "Promote to Semantic" (US-026)
// ---------------------------------------------------------------------------

/** Find alias refs in JSON text that don't resolve to any known token path. */
export function validateJsonRefs(text: string, allTokensFlat: Record<string, any>): string[] {
  const broken: string[] = [];
  const seen = new Set<string>();
  const re = /"\{([^}]+)\}"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const ref = m[1];
    if (!seen.has(ref) && !(ref in allTokensFlat)) {
      seen.add(ref);
      broken.push(ref);
    }
  }
  return broken;
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object' && a !== null && b !== null) {
    return stableStringify(a) === stableStringify(b);
  }
  return false;
}

/** Parse an inline-edited string back to the correct token value shape.
 * Returns null if the value is invalid for the given type. */
export function parseInlineValue(type: string, str: string): unknown | null {
  const trimmed = str.trim();
  if (type === 'boolean') {
    const lower = trimmed.toLowerCase();
    if (lower !== 'true' && lower !== 'false') return null;
    return lower === 'true';
  }
  if (type === 'number' || type === 'fontWeight') {
    return parseNumericTokenValue(trimmed);
  }
  if (type === 'duration') {
    return parseDurationTokenValue(trimmed);
  }
  if (type === 'dimension') {
    return parseDimensionTokenValue(trimmed);
  }
  // color, string, fontFamily: return as-is
  return str;
}

/** Infer token type from a raw value string. Returns null if no pattern matches. */
export function inferTypeFromValue(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^#([0-9a-fA-F]{3,8})$/.test(v)) return 'color';
  if (/^(rgb|hsl|hwb|lab|lch|oklch|oklab|color)a?\s*\(/i.test(v)) return 'color';
  if (parseDimensionTokenValue(v, { requireUnit: true })) return 'dimension';
  if (parseDurationTokenValue(v, { requireUnit: true })) return 'duration';
  if (/^(true|false)$/i.test(v)) return 'boolean';
  if (parseNumericTokenValue(v) !== null) return 'number';
  return null;
}

export function inferGroupTokenType(children?: TokenNode[]): string {
  if (!children?.length) return 'color';
  const types = new Set<string>();
  const collect = (nodes: TokenNode[]) => {
    for (const n of nodes) {
      if (!n.isGroup && n.$type) types.add(n.$type);
      else if (n.children) collect(n.children);
    }
  };
  collect(children);
  return types.size === 1 ? [...types][0] : 'color';
}

// ---------------------------------------------------------------------------
// Smart name suggestions for the inline create form
// ---------------------------------------------------------------------------

const TYPE_PREFIXES: Record<string, string> = {
  color: 'color', dimension: 'size', typography: 'typography', shadow: 'shadow',
  border: 'border', gradient: 'gradient', duration: 'duration',
  fontFamily: 'font-family', fontWeight: 'font-weight', strokeStyle: 'stroke-style',
  number: 'number', string: 'string', boolean: 'boolean',
};

/** Map a hex color to a rough human-readable name. */
function hexToName(hex: string): string | null {
  const h = hex.replace('#', '').toLowerCase();
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2 / 255;
  if (max - min < 30) {
    if (l < 0.15) return 'black';
    if (l > 0.85) return 'white';
    return 'gray';
  }
  let hue = 0;
  const d = max - min;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) hue = ((b - r) / d + 2) * 60;
  else hue = ((r - g) / d + 4) * 60;
  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 160) return 'green';
  if (hue < 200) return 'teal';
  if (hue < 260) return 'blue';
  if (hue < 300) return 'purple';
  return 'pink';
}

/** Detect numeric scale pattern in sibling names and suggest the next step. */
function nextScaleStep(siblingNames: string[]): string | null {
  const nums = siblingNames.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
  if (nums.length < 2) return null;
  nums.sort((a, b) => a - b);
  // Check for constant step (e.g. 100, 200, 300)
  const steps = new Set<number>();
  for (let i = 1; i < nums.length; i++) steps.add(nums[i] - nums[i - 1]);
  if (steps.size === 1) {
    const step = [...steps][0];
    return String(nums[nums.length - 1] + step);
  }
  return null;
}

const COMMON_SCALE_NAMES = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];

/** Detect named scale pattern and suggest the next entry. */
function nextNamedScaleStep(siblingNames: string[]): string | null {
  const lower = siblingNames.map(n => n.toLowerCase());
  const indices = lower.map(n => COMMON_SCALE_NAMES.indexOf(n)).filter(i => i >= 0);
  if (indices.length < 1) return null;
  indices.sort((a, b) => a - b);
  const next = indices[indices.length - 1] + 1;
  if (next < COMMON_SCALE_NAMES.length) return COMMON_SCALE_NAMES[next];
  return null;
}

/**
 * Known semantic token name sequences. Each array is an ordered progression.
 * When 2+ siblings match entries in a sequence, we suggest the next missing entry.
 */
const SEMANTIC_SEQUENCES: { name: string; values: string[] }[] = [
  { name: 'brand hierarchy', values: ['primary', 'secondary', 'tertiary', 'quaternary'] },
  { name: 'state variants', values: ['default', 'hover', 'active', 'focus', 'disabled', 'visited'] },
  { name: 'semantic roles', values: ['success', 'warning', 'error', 'info'] },
  { name: 'emphasis', values: ['subtle', 'default', 'strong', 'strongest'] },
  { name: 'lightness', values: ['lightest', 'lighter', 'light', 'base', 'dark', 'darker', 'darkest'] },
  { name: 'surface', values: ['background', 'surface', 'foreground', 'overlay'] },
  { name: 'text roles', values: ['heading', 'body', 'caption', 'label', 'placeholder'] },
  { name: 'feedback', values: ['positive', 'negative', 'caution', 'neutral'] },
  { name: 'interaction', values: ['rest', 'hover', 'pressed', 'selected', 'disabled'] },
  { name: 'contrast', values: ['low', 'medium', 'high'] },
  { name: 'density', values: ['compact', 'default', 'comfortable', 'spacious'] },
];

/**
 * Find the best semantic sequence match and return all missing entries.
 * Requires 2+ siblings to match entries in a single sequence.
 */
function nextSemanticSteps(siblingNames: string[]): { suggestions: string[]; sequenceName: string } | null {
  const lower = new Set(siblingNames.map(n => n.toLowerCase()));
  let bestMatch: { suggestions: string[]; sequenceName: string; matchCount: number } | null = null;

  for (const seq of SEMANTIC_SEQUENCES) {
    const matched = seq.values.filter(v => lower.has(v));
    if (matched.length < 2) continue;
    // Find the next entries in the sequence that aren't present
    const missing = seq.values.filter(v => !lower.has(v));
    if (missing.length === 0) continue;
    if (!bestMatch || matched.length > bestMatch.matchCount) {
      bestMatch = { suggestions: missing, sequenceName: seq.name, matchCount: matched.length };
    }
  }
  return bestMatch ? { suggestions: bestMatch.suggestions, sequenceName: bestMatch.sequenceName } : null;
}

/**
 * Detect zero-padded ordinal patterns (01, 02, 03 → 04) in siblings.
 */
function nextOrdinalStep(siblingNames: string[]): string | null {
  // Check for zero-padded numbers like 01, 02, 03
  const padded = siblingNames.filter(n => /^0\d+$/.test(n));
  if (padded.length >= 2) {
    const nums = padded.map(Number).sort((a, b) => a - b);
    const padLen = padded[0].length;
    const next = nums[nums.length - 1] + 1;
    return String(next).padStart(padLen, '0');
  }
  return null;
}

/**
 * Detect common prefix+suffix patterns in siblings and suggest next.
 * E.g. "btn-sm", "btn-md", "btn-lg" with known scale embedded.
 */
function nextPrefixSuffixPattern(siblingNames: string[]): { suggestion: string; source: string } | null {
  if (siblingNames.length < 2) return null;
  // Find common prefix (by hyphen/underscore segments)
  const splitByDelim = (s: string) => s.split(/[-_]/);
  const segments0 = splitByDelim(siblingNames[0]);
  if (segments0.length < 2) return null;

  // Check if all siblings share the same prefix segment(s)
  for (let prefixLen = 1; prefixLen < segments0.length; prefixLen++) {
    const prefix = segments0.slice(0, prefixLen).join('-');
    const suffixes: string[] = [];
    let allMatch = true;
    for (const name of siblingNames) {
      if (!name.startsWith(prefix + '-') && !name.startsWith(prefix + '_')) {
        allMatch = false;
        break;
      }
      suffixes.push(name.slice(prefix.length + 1));
      // Only consider single-segment suffixes
      if (splitByDelim(name.slice(prefix.length + 1)).length > 1) { allMatch = false; break; }
    }
    if (!allMatch || suffixes.length < 2) continue;

    // Check if suffixes follow a known scale
    const scaleIdx = suffixes.map(s => COMMON_SCALE_NAMES.indexOf(s.toLowerCase())).filter(i => i >= 0);
    if (scaleIdx.length >= 2) {
      scaleIdx.sort((a, b) => a - b);
      const next = scaleIdx[scaleIdx.length - 1] + 1;
      if (next < COMMON_SCALE_NAMES.length) {
        const delim = siblingNames[0][prefix.length];
        return { suggestion: `${prefix}${delim}${COMMON_SCALE_NAMES[next]}`, source: `Next size: ${prefix}-*` };
      }
    }
  }
  return null;
}

/** Sanitize a Figma layer name into a valid token name segment. */
function sanitizeLayerName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

export { nextSemanticSteps, nextScaleStep, nextNamedScaleStep, nextOrdinalStep };

export interface NameSuggestion {
  label: string;    // Display text for the chip
  value: string;    // Full path to insert
  source: string;   // Why this was suggested (tooltip)
}

/**
 * Generate name suggestions for the inline create form.
 * @param tokenType   Current selected token type
 * @param value       Current value input
 * @param prefix      Group prefix (siblingPrefix or '')
 * @param siblingNames Names of sibling tokens in the target group
 * @param layerName   Figma selection layer name, if any
 */
export function generateNameSuggestions(
  tokenType: string,
  value: string,
  prefix: string,
  siblingNames: string[],
  layerName: string | null,
): NameSuggestion[] {
  const suggestions: NameSuggestion[] = [];
  const seen = new Set<string>();
  const add = (label: string, val: string, source: string) => {
    if (seen.has(val)) return;
    seen.add(val);
    suggestions.push({ label, value: val, source });
  };

  const dot = prefix && !prefix.endsWith('.') ? '.' : '';

  // 1. Type-based prefix (only when no prefix already set)
  if (!prefix) {
    const typePrefix = TYPE_PREFIXES[tokenType] || tokenType;
    add(`${typePrefix}.`, `${typePrefix}.`, 'Based on token type');
  }

  // 2. Value-based name (colors)
  const trimVal = value.trim();
  if (trimVal && /^#[0-9a-fA-F]{6,8}$/.test(trimVal)) {
    const colorName = hexToName(trimVal);
    if (colorName) {
      const full = prefix ? `${prefix}${dot}${colorName}` : `color.${colorName}`;
      add(colorName, full, `Color name for ${trimVal}`);
    }
  }

  // 3. Sibling pattern — numeric scale
  if (siblingNames.length >= 2) {
    const nextNum = nextScaleStep(siblingNames);
    if (nextNum) {
      add(nextNum, `${prefix}${dot}${nextNum}`, `Next in scale: ${siblingNames.slice(-2).join(', ')}, …`);
    }
  }

  // 4. Sibling pattern — named scale (xs, sm, md, lg, xl)
  if (siblingNames.length >= 1) {
    const nextNamed = nextNamedScaleStep(siblingNames);
    if (nextNamed) {
      add(nextNamed, `${prefix}${dot}${nextNamed}`, `Next size in scale`);
    }
  }

  // 5. Sibling pattern — semantic sequences (primary/secondary/tertiary, etc.)
  if (siblingNames.length >= 2) {
    const semantic = nextSemanticSteps(siblingNames);
    if (semantic) {
      // Add up to 3 suggestions from the sequence
      for (const s of semantic.suggestions.slice(0, 3)) {
        add(s, `${prefix}${dot}${s}`, `Next in ${semantic.sequenceName}: ${siblingNames.filter(n => SEMANTIC_SEQUENCES.find(seq => seq.name === semantic.sequenceName)?.values.includes(n.toLowerCase())).join(', ')}, …`);
      }
    }
  }

  // 6. Sibling pattern — zero-padded ordinals (01, 02, 03 → 04)
  if (siblingNames.length >= 2) {
    const nextOrd = nextOrdinalStep(siblingNames);
    if (nextOrd) {
      add(nextOrd, `${prefix}${dot}${nextOrd}`, `Next ordinal: ${siblingNames.slice(-2).join(', ')}, …`);
    }
  }

  // 7. Sibling pattern — prefix+suffix (btn-sm, btn-md → btn-lg)
  if (siblingNames.length >= 2) {
    const prefixSuffix = nextPrefixSuffixPattern(siblingNames);
    if (prefixSuffix) {
      add(prefixSuffix.suggestion, `${prefix}${dot}${prefixSuffix.suggestion}`, prefixSuffix.source);
    }
  }

  // 8. Figma layer name
  if (layerName) {
    const sanitized = sanitizeLayerName(layerName);
    if (sanitized && sanitized.length > 0 && sanitized.length < 60) {
      const full = prefix ? `${prefix}${dot}${sanitized}` : sanitized;
      add(sanitized, full, `From Figma layer "${layerName}"`);
    }
  }

  return suggestions;
}

/**
 * Highlight all occurrences of any term in `terms` within `text`.
 * Returns plain text when nothing matches; JSX fragments with <mark> otherwise.
 */
export function highlightMatch(text: string, terms: string[]): React.ReactNode {
  if (!terms.length) return text;
  // Build a single regex matching any of the terms (longest-first to avoid partial overlap)
  const escaped = terms
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return text;
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(re);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} style={{ background: 'rgba(255, 200, 0, 0.45)', color: 'inherit', borderRadius: '2px', padding: '0 1px' }}>{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Per-type format hints shown below the value input for complex types
// ---------------------------------------------------------------------------

const VALUE_FORMAT_HINTS: Record<string, string> = {
  color: '#RRGGBB, #RRGGBBAA, rgb(r g b), oklch(L C H), color(display-p3 r g b)',
  typography: 'JSON object: { "fontFamily": "Inter", "fontSize": "16px", "fontWeight": 400, "lineHeight": "1.5", "letterSpacing": "0.01em" }',
  shadow: 'JSON object or array: { "offsetX": "0px", "offsetY": "4px", "blur": "8px", "spread": "0px", "color": "#00000040" } — use [ ] for multiple shadows',
  border: 'JSON object: { "color": "#000000", "width": "1px", "style": "solid" } — style: solid | dashed | dotted',
  gradient: 'CSS gradient string, e.g. linear-gradient(180deg, #000 0%, #fff 100%)',
  strokeStyle: 'String ("solid", "dashed", "dotted") or JSON object: { "dashArray": ["2px","4px"], "lineCap": "round" }',
  dimension: 'Number with unit: 16px, 1rem, 0.5em',
  duration: 'Number with unit: 200ms, 0.3s',
  fontFamily: 'Font name or comma-separated list: Inter, Arial, sans-serif',
  fontWeight: 'Number (100–900) or name: 400, bold, semi-bold',
  lineHeight: 'Unitless ratio (1.5) or value with unit: 24px, 150%',
  letterSpacing: 'Number with unit: 0.01em, 1px',
  cubicBezier: 'Array of 4 numbers [x1, y1, x2, y2] between 0 and 1: [0.25, 0.1, 0.25, 1]',
  transition: 'JSON object: { "duration": { "value": 200, "unit": "ms" }, "delay": { "value": 0, "unit": "ms" }, "timingFunction": [0.25, 0.1, 0.25, 1] }',
  composition: 'JSON object of token properties: { "opacity": 1, "borderRadius": "4px" }',
  number: 'Plain number: 1.5, 4, 100',
  percentage: 'Plain number (0–100): 50, 100',
  boolean: 'true or false',
};

export function valueFormatHint(type: string): string | null {
  return VALUE_FORMAT_HINTS[type] ?? null;
}
