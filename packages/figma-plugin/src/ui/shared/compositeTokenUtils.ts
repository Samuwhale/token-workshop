import { formatTokenValueForDisplay } from './tokenFormatting';
import { formatUnitTokenValue } from './tokenValueParsing';

import type {
  ShadowTokenValue,
  TypographyValue,
} from '../../shared/types';

interface GradientStop {
  color: string;
  position?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function truncateLabel(value: string, maxLength = 40): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function normalizeGradientStops(value: unknown): GradientStop[] {
  const source = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.stops)
      ? value.stops
      : [];

  const stops = source
    .filter((stop): stop is GradientStop => (
      isRecord(stop) &&
      typeof stop.color === 'string' &&
      (stop.position === undefined || typeof stop.position === 'number')
    ));

  return stops.sort((left: GradientStop, right: GradientStop) => (
    (left.position ?? 0) - (right.position ?? 0)
  ));
}

function normalizeShadowLayers(value: unknown): ShadowTokenValue[] {
  const source = Array.isArray(value) ? value : [value];
  return source.filter((layer): layer is ShadowTokenValue => isRecord(layer));
}

export function formatDimensionCss(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value;
  }

  const label = formatUnitTokenValue(value, { type: 'dimension', fallback: '' });
  return label || fallback;
}

export function formatDurationCss(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value;
  }

  const label = formatUnitTokenValue(value, { type: 'duration', fallback: '' });
  return label || fallback;
}

export function buildGradientCss(value: unknown): string | null {
  if (typeof value === 'string' && value.includes('gradient')) {
    return value;
  }

  const stops = normalizeGradientStops(value);
  if (stops.length === 0) {
    return null;
  }

  const stopList = stops
    .map((stop) => `${stop.color}${stop.position != null ? ` ${Math.round(stop.position * 100)}%` : ''}`)
    .join(', ');

  const gradientType =
    isRecord(value) && typeof value.type === 'string'
      ? value.type
      : isRecord(value) && typeof value.gradientType === 'string'
        ? value.gradientType
        : 'linear';

  if (gradientType === 'radial') {
    return `radial-gradient(circle, ${stopList})`;
  }

  if (gradientType === 'angular' || gradientType === 'conic') {
    return `conic-gradient(${stopList})`;
  }

  if (gradientType === 'diamond') {
    return `linear-gradient(45deg, ${stopList})`;
  }

  return `linear-gradient(to right, ${stopList})`;
}

export function formatGradientSummary(value: unknown): string {
  if (typeof value === 'string') {
    return truncateLabel(value);
  }

  const stops = normalizeGradientStops(value);
  if (stops.length === 0) {
    return '—';
  }

  if (!isRecord(value)) {
    return `${stops.length} stops`;
  }

  const gradientType =
    typeof value.type === 'string'
      ? value.type
      : typeof value.gradientType === 'string'
        ? value.gradientType
        : 'linear';

  return `${gradientType} · ${stops.length} stop${stops.length === 1 ? '' : 's'}`;
}

export function buildBoxShadowCss(value: unknown): string | null {
  const parts = normalizeShadowLayers(value).map((layer) => {
    const color = typeof layer.color === 'string' ? layer.color : '#00000040';
    const offsetX = formatDimensionCss(layer.offsetX ?? 0, '0px');
    const offsetY = formatDimensionCss(layer.offsetY ?? 0, '0px');
    const blur = formatDimensionCss(layer.blur ?? 0, '0px');
    const spread = formatDimensionCss(layer.spread ?? 0, '0px');
    const inset = layer.type === 'innerShadow' ? 'inset ' : '';
    return `${inset}${offsetX} ${offsetY} ${blur} ${spread} ${color}`;
  });

  return parts.length > 0 ? parts.join(', ') : null;
}

export function formatShadowSummary(value: unknown): string {
  const layers = normalizeShadowLayers(value);
  if (layers.length === 0) {
    return '—';
  }

  const prefix = layers.length > 1 ? `×${layers.length} ` : '';
  const first = layers[0];
  const offsetX = formatDimensionCss(first.offsetX ?? 0, '0px');
  const offsetY = formatDimensionCss(first.offsetY ?? 0, '0px');
  const blur = formatDimensionCss(first.blur ?? 0, '0px');
  const spread = formatDimensionCss(first.spread ?? 0, '0px');
  const color = typeof first.color === 'string' ? first.color : '#00000040';
  const inset = first.type === 'innerShadow' ? 'inset ' : '';
  return `${prefix}${inset}${offsetX} ${offsetY} ${blur} ${spread} ${color}`.trim();
}

export function formatBorderSummary(value: unknown): string {
  if (!isRecord(value)) {
    return '—';
  }

  const width = formatDimensionCss(value.width, '');
  const style = typeof value.style === 'string' ? value.style : '';
  const color = typeof value.color === 'string' ? value.color : '';
  return [width, style, color].filter(Boolean).join(' ') || '—';
}

export function getTypographyFontFamily(value: unknown): string {
  if (!isRecord(value)) {
    return '';
  }

  const typography = value as TypographyValue;
  if (Array.isArray(typography.fontFamily)) {
    return typography.fontFamily
      .map((family) => String(family))
      .join(', ');
  }

  return typeof typography.fontFamily === 'string' ? typography.fontFamily : '';
}

export function getTypographySummary(value: unknown): string {
  return formatTokenValueForDisplay('typography', value);
}
