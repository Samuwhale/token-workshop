import { apiFetch } from '../../shared/apiFetch';

export type NumericOpMode = 'multiply' | 'divide' | 'add' | 'subtract';
export type ColorAdjustOp = 'lighten' | 'darken' | 'saturate' | 'desaturate' | 'hue';

export function applyColorOpacity(colorValue: unknown, opacityPercent: number): string | null {
  if (typeof colorValue !== 'string') return null;
  const hex = colorValue.replace('#', '');
  if (hex.length !== 6 && hex.length !== 8) return null;
  const rgb = hex.slice(0, 6);
  const alphaHex = Math.round(Math.max(0, Math.min(100, opacityPercent)) / 100 * 255)
    .toString(16).padStart(2, '0');
  if (alphaHex === 'ff' && hex.length === 6) return `#${rgb}`;
  return `#${rgb}${alphaHex}`;
}

export function applyNumericTransform(value: unknown, op: NumericOpMode, operand: number): unknown {
  if (typeof value === 'number') {
    let result: number;
    switch (op) {
      case 'multiply': result = value * operand; break;
      case 'divide': result = value / operand; break;
      case 'add': result = value + operand; break;
      case 'subtract': result = value - operand; break;
    }
    return parseFloat(result!.toFixed(6));
  }
  if (typeof value === 'object' && value !== null && 'value' in value && 'unit' in value) {
    const dim = value as { value: number; unit: string };
    const transformed = applyNumericTransform(dim.value, op, operand) as number;
    return { value: transformed, unit: dim.unit };
  }
  if (typeof value === 'string') {
    const match = value.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (match) {
      const transformed = applyNumericTransform(parseFloat(match[1]), op, operand) as number;
      return `${parseFloat(transformed.toFixed(6))}${match[2]}`;
    }
  }
  return null;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6; break;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue2rgb(h + 1 / 3), g: hue2rgb(h), b: hue2rgb(h - 1 / 3) };
}

export function applyColorAdjust(colorValue: unknown, op: ColorAdjustOp, amount: number): string | null {
  if (typeof colorValue !== 'string') return null;
  const raw = colorValue.replace('#', '');
  if (raw.length !== 6 && raw.length !== 8) return null;
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const alphaHex = raw.length === 8 ? raw.slice(6, 8) : '';
  let { h, s, l } = rgbToHsl(r, g, b);
  const delta = amount / 100;
  switch (op) {
    case 'lighten': l = Math.min(1, l + delta); break;
    case 'darken': l = Math.max(0, l - delta); break;
    case 'saturate': s = Math.min(1, s + delta); break;
    case 'desaturate': s = Math.max(0, s - delta); break;
    case 'hue': h = ((h + amount / 360) % 1 + 1) % 1; break;
  }
  const { r: nr, g: ng, b: nb } = hslToRgb(h, s, l);
  const toHex2 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, '0');
  return `#${toHex2(nr)}${toHex2(ng)}${toHex2(nb)}${alphaHex}`;
}

export const COMPOSITE_SUB_PROPS_BY_TYPE: Record<string, Array<{ key: string; kind: 'color' | 'numeric' }>> = {
  shadow: [
    { key: 'color', kind: 'color' },
    { key: 'offsetX', kind: 'numeric' },
    { key: 'offsetY', kind: 'numeric' },
    { key: 'blur', kind: 'numeric' },
    { key: 'spread', kind: 'numeric' },
  ],
  typography: [
    { key: 'fontSize', kind: 'numeric' },
    { key: 'fontWeight', kind: 'numeric' },
    { key: 'lineHeight', kind: 'numeric' },
    { key: 'letterSpacing', kind: 'numeric' },
  ],
  border: [
    { key: 'color', kind: 'color' },
    { key: 'width', kind: 'numeric' },
  ],
  transition: [
    { key: 'duration', kind: 'numeric' },
    { key: 'delay', kind: 'numeric' },
  ],
};

export const COMPOSITE_TOKEN_TYPES = new Set(Object.keys(COMPOSITE_SUB_PROPS_BY_TYPE));

export const PREVIEW_MAX = 8;

export function formatBatchValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export async function rollbackOperation(serverUrl: string, operationId: string) {
  await apiFetch(`${serverUrl}/api/operations/${operationId}/rollback`, { method: 'POST' });
}
