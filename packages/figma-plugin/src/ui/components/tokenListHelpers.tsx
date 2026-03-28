import type { TokenNode } from '../hooks/useTokens';
import type { TokenMapEntry } from '../../shared/types';
import { stableStringify } from '../shared/utils';

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

/** Get a human-editable string representation of a token value for the inline input. */
export function getEditableString(type: string | undefined, value: any): string {
  if (value === undefined || value === null) return '';
  if (type === 'dimension' && typeof value === 'object' && value !== null && 'value' in value && 'unit' in value) {
    return `${value.value}${value.unit}`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return String(value);
}

/** Parse an inline-edited string back to the correct token value shape.
 * Returns null if the value is invalid for the given type. */
export function parseInlineValue(type: string, str: string): any {
  if (type === 'boolean') {
    const lower = str.trim().toLowerCase();
    if (lower !== 'true' && lower !== 'false') return null;
    return lower === 'true';
  }
  if (type === 'number' || type === 'fontWeight' || type === 'duration') {
    const n = parseFloat(str);
    return isNaN(n) ? str : n;
  }
  if (type === 'dimension') {
    const m = str.trim().match(/^(-?\d*\.?\d+)\s*(px|rem|em|%|vw|vh|pt|dp|sp|cm|mm|fr|ch|ex)?$/);
    if (m) return { value: parseFloat(m[1]), unit: m[2] || 'px' };
    return str;
  }
  // color, string, fontFamily: return as-is
  return str;
}

/** Infer token type from a raw value string. Returns null if no pattern matches. */
export function inferTypeFromValue(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^#([0-9a-fA-F]{3,8})$/.test(v)) return 'color';
  if (/^(rgb|hsl)a?\s*\(/.test(v)) return 'color';
  if (/^(-?\d+(\.\d+)?)(px|em|rem|%|vh|vw|pt|dp|sp|cm|mm|fr|ch|ex)$/.test(v)) return 'dimension';
  if (/^(-?\d+(\.\d+)?)(ms|s)$/.test(v)) return 'duration';
  if (/^(true|false)$/i.test(v)) return 'boolean';
  if (/^-?\d+(\.\d+)?$/.test(v)) return 'number';
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

/** Sanitize a Figma layer name into a valid token name segment. */
function sanitizeLayerName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

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

  // 5. Figma layer name
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
