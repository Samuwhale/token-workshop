/**
 * Color modifier engine.
 *
 * Applies a chain of lighten/darken/alpha/mix operations to a hex color.
 * All operations work in CIELAB space for perceptual correctness.
 */

import { hexToLab, labToHex, setHexAlpha } from './color-math.js';
import type { ColorModifierOp } from './types.js';

/**
 * Apply a chain of color modifiers to a hex color string.
 *
 * @param hex - Source color (6 or 8 char hex, with or without #)
 * @param modifiers - Ordered list of operations to apply
 * @returns Modified hex color string
 */
/**
 * Validate and filter an array of raw modifier objects, returning only well-formed ops.
 * Silently drops entries that are missing required fields or have wrong types.
 */
export function validateColorModifiers(raw: unknown[]): ColorModifierOp[] {
  const valid: ColorModifierOp[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const type = obj.type;
    if (type === 'lighten' || type === 'darken' || type === 'alpha') {
      if (typeof obj.amount === 'number' && isFinite(obj.amount)) {
        valid.push({ type, amount: obj.amount });
      }
    } else if (type === 'mix') {
      if (
        typeof obj.color === 'string' && obj.color.length > 0 &&
        typeof obj.ratio === 'number' && isFinite(obj.ratio)
      ) {
        valid.push({ type: 'mix', color: obj.color, ratio: obj.ratio });
      }
    }
  }
  return valid;
}

export function applyColorModifiers(hex: string, modifiers: ColorModifierOp[]): string {
  let current = hex;

  for (const mod of modifiers) {
    switch (mod.type) {
      case 'lighten': {
        const lab = hexToLab(current);
        if (!lab) throw new Error(`Color modifier 'lighten': invalid source color "${current}"`);
        const [L, a, b] = lab;
        current = labToHex(Math.min(100, L + mod.amount), a, b);
        break;
      }
      case 'darken': {
        const lab = hexToLab(current);
        if (!lab) throw new Error(`Color modifier 'darken': invalid source color "${current}"`);
        const [L, a, b] = lab;
        current = labToHex(Math.max(0, L - mod.amount), a, b);
        break;
      }
      case 'alpha': {
        const alpha = Math.round(Math.max(0, Math.min(1, mod.amount)) * 255);
        const result = setHexAlpha(current, alpha);
        if (!result) throw new Error(`Color modifier 'alpha': invalid source color "${current}"`);
        current = result;
        break;
      }
      case 'mix': {
        const labA = hexToLab(current);
        const labB = hexToLab(mod.color);
        if (!labA) throw new Error(`Color modifier 'mix': invalid source color "${current}"`);
        if (!labB) throw new Error(`Color modifier 'mix': invalid mix color "${mod.color}"`);
        const r = Math.max(0, Math.min(1, mod.ratio));
        const L = labA[0] * (1 - r) + labB[0] * r;
        const a = labA[1] * (1 - r) + labB[1] * r;
        const b = labA[2] * (1 - r) + labB[2] * r;
        current = labToHex(L, a, b);
        break;
      }
    }
  }

  return current;
}
