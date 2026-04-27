import {
  DIMENSION_UNITS,
  type DimensionUnit,
  type DimensionValue,
  type DurationValue,
} from '@tokenmanager/core';

export type DurationUnit = DurationValue['unit'];
export type UnitTokenValue<TUnit extends string> = { value: number; unit: TUnit };

export const DEFAULT_DURATION_TOKEN_VALUE: DurationValue = {
  value: 200,
  unit: 'ms',
};
export const DEFAULT_DIMENSION_TOKEN_VALUE: DimensionValue = {
  value: 0,
  unit: 'px',
};

const DURATION_UNITS: readonly DurationUnit[] = ['ms', 's'];
const DECIMAL_PATTERN = '-?(?:\\d+\\.?\\d*|\\.\\d+)';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildUnitPattern(units: readonly string[]): string {
  return units.map(escapeRegExp).join('|');
}

function parseUnitValue<TUnit extends string>(
  raw: string,
  units: readonly TUnit[],
  defaultUnit: TUnit,
  requireUnit: boolean,
): { value: number; unit: TUnit } | null {
  const unitPattern = buildUnitPattern(units);
  const match = raw
    .trim()
    .match(new RegExp(`^(${DECIMAL_PATTERN})\\s*(${unitPattern})?$`));
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = match[2] as TUnit | undefined;
  if (requireUnit && unit === undefined) {
    return null;
  }

  return {
    value,
    unit: unit ?? defaultUnit,
  };
}

export function parseDimensionTokenValue(
  raw: string,
  options: {
    defaultUnit?: DimensionUnit;
    requireUnit?: boolean;
  } = {},
): DimensionValue | null {
  return parseUnitValue(
    raw,
    DIMENSION_UNITS,
    options.defaultUnit ?? 'px',
    options.requireUnit ?? false,
  );
}

export function parseDurationTokenValue(
  raw: string,
  options: {
    defaultUnit?: DurationUnit;
    requireUnit?: boolean;
  } = {},
): DurationValue | null {
  return parseUnitValue(
    raw,
    DURATION_UNITS,
    options.defaultUnit ?? DEFAULT_DURATION_TOKEN_VALUE.unit,
    options.requireUnit ?? false,
  );
}

export function parseNumericTokenValue(raw: string): number | null {
  const match = raw.trim().match(new RegExp(`^${DECIMAL_PATTERN}$`));
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}

function isUnitTokenValue<TUnit extends string>(
  value: unknown,
  units: readonly TUnit[],
): value is UnitTokenValue<TUnit> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as {
    value?: unknown;
    unit?: unknown;
  };
  return (
    typeof candidate.value === 'number' &&
    Number.isFinite(candidate.value) &&
    typeof candidate.unit === 'string' &&
    units.includes(candidate.unit as TUnit)
  );
}

function normalizeUnitTokenValue<TUnit extends string>(
  value: unknown,
  units: readonly TUnit[],
  fallback: UnitTokenValue<TUnit>,
  defaultUnit: TUnit,
  parser: (raw: string, options?: { defaultUnit?: TUnit; requireUnit?: boolean }) => UnitTokenValue<TUnit> | null,
): UnitTokenValue<TUnit> {
  if (typeof value === 'string') {
    const parsed = parser(value, { defaultUnit });
    if (parsed) {
      return parsed;
    }
  }

  if (isUnitTokenValue(value, units)) {
    return {
      value: value.value,
      unit: value.unit,
    };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return { value, unit: defaultUnit };
  }

  return { ...fallback };
}

function readUnitTokenValue<TUnit extends string>(
  value: unknown,
  units: readonly TUnit[],
  defaultUnit: TUnit,
  parser: (raw: string, options?: { defaultUnit?: TUnit; requireUnit?: boolean }) => UnitTokenValue<TUnit> | null,
): UnitTokenValue<TUnit> | null {
  if (typeof value === 'string') {
    return parser(value, { defaultUnit });
  }

  if (isUnitTokenValue(value, units)) {
    return {
      value: value.value,
      unit: value.unit,
    };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return { value, unit: defaultUnit };
  }

  return null;
}

export function normalizeDimensionTokenValue(
  value: unknown,
  fallback: DimensionValue = DEFAULT_DIMENSION_TOKEN_VALUE,
): DimensionValue {
  return normalizeUnitTokenValue(
    value,
    DIMENSION_UNITS,
    fallback,
    fallback.unit,
    parseDimensionTokenValue,
  );
}

export function normalizeDurationTokenValue(
  value: unknown,
  fallback: DurationValue = DEFAULT_DURATION_TOKEN_VALUE,
): DurationValue {
  return normalizeUnitTokenValue(
    value,
    DURATION_UNITS,
    fallback,
    fallback.unit,
    parseDurationTokenValue,
  );
}

export function readDimensionTokenValue(
  value: unknown,
  options: {
    defaultUnit?: DimensionUnit;
  } = {},
): DimensionValue | null {
  return readUnitTokenValue(
    value,
    DIMENSION_UNITS,
    options.defaultUnit ?? DEFAULT_DIMENSION_TOKEN_VALUE.unit,
    parseDimensionTokenValue,
  );
}

export function readDurationTokenValue(
  value: unknown,
  options: {
    defaultUnit?: DurationUnit;
  } = {},
): DurationValue | null {
  return readUnitTokenValue(
    value,
    DURATION_UNITS,
    options.defaultUnit ?? DEFAULT_DURATION_TOKEN_VALUE.unit,
    parseDurationTokenValue,
  );
}

export function formatUnitTokenValue(
  value: unknown,
  options: {
    type: 'dimension' | 'duration';
    fallback?: string;
  },
): string {
  if (typeof value === 'string') {
    const parsed = options.type === 'duration'
      ? parseDurationTokenValue(value)
      : parseDimensionTokenValue(value);
    return parsed ? `${parsed.value}${parsed.unit}` : value;
  }

  if (typeof value === 'number') {
    return options.type === 'duration'
      ? `${value}${DEFAULT_DURATION_TOKEN_VALUE.unit}`
      : `${value}${DEFAULT_DIMENSION_TOKEN_VALUE.unit}`;
  }

  if (options.type === 'duration' && isUnitTokenValue(value, DURATION_UNITS)) {
    return `${value.value}${value.unit}`;
  }

  if (options.type === 'dimension' && isUnitTokenValue(value, DIMENSION_UNITS)) {
    return `${value.value}${value.unit}`;
  }

  return options.fallback ?? '';
}

export function convertDurationTokenValueToMilliseconds(value: unknown): number {
  const normalized = normalizeDurationTokenValue(value);
  return normalized.unit === 's'
    ? normalized.value * 1000
    : normalized.value;
}

export function tryConvertDurationTokenValueToMilliseconds(
  value: unknown,
): number | null {
  const parsed = readDurationTokenValue(value);
  if (!parsed) {
    return null;
  }

  return parsed.unit === 's' ? parsed.value * 1000 : parsed.value;
}
