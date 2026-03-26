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
export function applyColorModifiers(hex: string, modifiers: ColorModifierOp[]): string {
  let current = hex;

  for (const mod of modifiers) {
    switch (mod.type) {
      case 'lighten': {
        const lab = hexToLab(current);
        if (!lab) break;
        const [L, a, b] = lab;
        current = labToHex(Math.min(100, L + mod.amount), a, b);
        break;
      }
      case 'darken': {
        const lab = hexToLab(current);
        if (!lab) break;
        const [L, a, b] = lab;
        current = labToHex(Math.max(0, L - mod.amount), a, b);
        break;
      }
      case 'alpha': {
        const alpha = Math.round(Math.max(0, Math.min(1, mod.amount)) * 255);
        current = setHexAlpha(current, alpha);
        break;
      }
      case 'mix': {
        const labA = hexToLab(current);
        const labB = hexToLab(mod.color);
        if (!labA || !labB) break;
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
