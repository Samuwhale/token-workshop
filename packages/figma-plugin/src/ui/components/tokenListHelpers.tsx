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

export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(255, 200, 0, 0.45)', color: 'inherit', borderRadius: '2px', padding: '0 1px' }}>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
