import { parseColor } from './colorUtils.js';
import { rgbToHex } from './colorUtils.js';

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

export function convertToFigmaValue(value: any, tokenType: string): VariableValue | null {
  switch (tokenType) {
    case 'color': {
      const color = parseColor(value);
      return color ? { r: color.rgb.r, g: color.rgb.g, b: color.rgb.b, a: color.a } : null;
    }
    case 'dimension': {
      const raw = typeof value === 'object' ? value.value : value;
      if (typeof raw === 'number') return raw;
      const parsed = parseFloat(raw);
      return isNaN(parsed) ? null : parsed;
    }
    case 'number':
    case 'fontWeight':
    case 'percentage': {
      if (typeof value === 'number') return value;
      const parsed = parseFloat(value);
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

export function convertFromFigmaValue(value: any, variableType: VariableResolvedDataType): any {
  switch (variableType) {
    case 'COLOR':
      if (value == null) return null;
      return rgbToHex(value, value.a ?? 1);
    default:
      return value;
  }
}

export function findVariableInList(variables: Variable[], collectionId: string, name: string): Variable | null {
  return variables.find(v => v.variableCollectionId === collectionId && v.name === name) || null;
}
