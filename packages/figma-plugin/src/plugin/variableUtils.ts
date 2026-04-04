import { parseColor } from './colorUtils.js';
import { rgbToHex } from './colorUtils.js';
import type { ResolvedTokenValue } from '../shared/types.js';

export function mapTokenTypeToVariableType(tokenType: string): VariableResolvedDataType | null {
  switch (tokenType) {
    case 'color': return 'COLOR';
    case 'dimension':
    case 'number':
    case 'fontWeight':
    case 'lineHeight':
    case 'letterSpacing':
    case 'percentage':
      return 'FLOAT';
    case 'string':
    case 'fontFamily':
      return 'STRING';
    case 'boolean':
      return 'BOOLEAN';
    default:
      return null;
  }
}

export function mapVariableTypeToTokenType(variableType: VariableResolvedDataType): string {
  switch (variableType) {
    case 'COLOR': return 'color';
    case 'FLOAT': return 'number';
    case 'STRING': return 'string';
    case 'BOOLEAN': return 'boolean';
    default: return 'string';
  }
}

export function convertToFigmaValue(value: ResolvedTokenValue, tokenType: string): VariableValue | null {
  switch (tokenType) {
    case 'color': {
      const color = parseColor(typeof value === 'string' ? value : String(value));
      return color ? { r: color.rgb.r, g: color.rgb.g, b: color.rgb.b, a: color.a } : null;
    }
    case 'dimension': {
      const raw = (value !== null && typeof value === 'object' && 'value' in value)
        ? (value as { value: unknown }).value
        : value;
      if (typeof raw === 'number') return raw;
      const parsed = parseFloat(String(raw));
      return isNaN(parsed) ? null : parsed;
    }
    case 'number':
    case 'fontWeight':
    case 'percentage':
    case 'lineHeight':
    case 'letterSpacing': {
      if (typeof value === 'number') return value;
      const parsed = parseFloat(String(value));
      return isNaN(parsed) ? null : parsed;
    }
    case 'boolean':
      return Boolean(value);
    case 'string':
    case 'fontFamily':
      return Array.isArray(value) ? value[0] : String(value);
    default:
      return null;
  }
}

export function convertFromFigmaValue(value: VariableValue, variableType: VariableResolvedDataType): string | number | boolean | null {
  switch (variableType) {
    case 'COLOR': {
      if (value == null) return null;
      const c = value as RGBA;
      return rgbToHex(c, c.a ?? 1);
    }
    default:
      return value as string | number | boolean;
  }
}

export function findVariableInList(variables: Variable[], collectionId: string, name: string): Variable | null {
  return variables.find(v => v.variableCollectionId === collectionId && v.name === name) || null;
}
