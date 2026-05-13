import { iconNameFromPath, normalizeIconPath } from "@token-workshop/core";

const SVG_FRAME_EPSILON = 1e-6;

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function formatIconDimension(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatIconFrame(width: number, height: number): string {
  return `${formatIconDimension(width)}x${formatIconDimension(height)}`;
}

export function iconFrameDimensionMatches(left: number, right: number): boolean {
  return Math.abs(left - right) <= SVG_FRAME_EPSILON;
}

export function iconPathKey(path: string): string {
  try {
    return normalizeIconPath(path);
  } catch {
    return "";
  }
}

export function displayNameFromIconPath(path: string): string {
  try {
    return iconNameFromPath(path);
  } catch {
    return "";
  }
}
