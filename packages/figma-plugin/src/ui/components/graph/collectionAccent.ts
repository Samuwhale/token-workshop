// Stable per-collection accent hues for the focus-mode collection lanes.
// Hash the collection id so the same id always gets the same hue across
// reloads. Hues are picked to read clearly against both Figma light and dark
// plugin themes; chroma is intentionally low so the focus-node accent ring
// still wins visual priority.

const PALETTE = [
  "#5B8DEF", // blue
  "#E9A23B", // amber
  "#7AB87A", // green
  "#C268C6", // magenta
  "#3FB6B6", // teal
  "#E07A7A", // coral
  "#9B7AD6", // violet
  "#B0995F", // olive
];

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function collectionAccentHue(collectionId: string): string {
  return PALETTE[hashString(collectionId) % PALETTE.length];
}

export function collectionAccentPalette(): readonly string[] {
  return PALETTE;
}
