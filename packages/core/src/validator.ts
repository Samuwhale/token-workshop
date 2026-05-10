/**
 * Token value validator.
 *
 * Validates token values against the rules defined by their `$type`,
 * following the W3C DTCG specification. References are skipped because
 * they are validated at resolution time instead.
 */

import { TOKEN_TYPES, FONT_WEIGHT_NAMES, STROKE_STYLE_KEYWORDS } from './constants.js';
import { isReference, isFormula, isDTCGToken, isDTCGGroup } from './dtcg-types.js';
import { opSupportedTypes, parseDerivationOps } from './derivation-ops.js';
import type {
  Token,
  TokenGroup,
  DimensionValue,
  DurationValue,
  ShadowValue,
  TypographyValue,
} from './types.js';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ValidationResult {
  path: string;
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const CSS_COLOR_FUNCTIONS_RE = /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|oklab|color)\s*\(/i;
const CSS_NAMED_COLORS = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige',
  'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown',
  'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral',
  'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
  'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
  'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray',
  'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
  'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite',
  'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey',
  'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki',
  'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
  'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray',
  'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen',
  'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon',
  'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
  'mediumseagreen', 'mediumslateblue', 'mediumspringgreen',
  'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive',
  'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
  'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip',
  'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple',
  'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown',
  'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver',
  'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow',
  'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato',
  'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow',
  'yellowgreen', 'transparent', 'currentcolor',
]);

function isValidColor(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (HEX_COLOR_RE.test(value)) return true;
  if (CSS_COLOR_FUNCTIONS_RE.test(value)) return true;
  if (CSS_NAMED_COLORS.has(value.toLowerCase())) return true;
  return false;
}

/** Cast a non-null object to an indexable record. Centralises the one unsafe cast. */
function toRec(v: object): Record<string, unknown> {
  return v as Record<string, unknown>;
}

function isDimensionLike(value: unknown): value is DimensionValue {
  if (typeof value !== 'object' || value === null) return false;
  const v = toRec(value);
  return typeof v.value === 'number' && typeof v.unit === 'string';
}

function isDurationLike(value: unknown): value is DurationValue {
  if (!isDimensionLike(value)) return false;
  const v = value as unknown as DurationValue;
  return v.unit === 'ms' || v.unit === 's';
}

// ---------------------------------------------------------------------------
// TokenValidator
// ---------------------------------------------------------------------------

export class TokenValidator {
  /**
   * Validate a single token.
   *
   * References (`{path.to.token}`) are skipped — they are validated at
   * resolution time by the `TokenResolver`.
   */
  validate(token: Token, path: string): ValidationResult {
    const errors: string[] = [];
    const value = token.$value;
    const derivation = token.$extensions?.tokenworkshop?.derivation;
    const derivationOps = parseDerivationOps(derivation?.ops);
    for (const error of derivationOps.errors) {
      errors.push(`${path}: ${error}`);
    }
    if (derivation !== undefined) {
      if (derivationOps.errors.length === 0 && derivationOps.ops.length === 0) {
        errors.push(`${path}: derivation.ops must include at least one operation`);
      }
      if (!isReference(value)) {
        errors.push(
          `${path}: derivation tokens must store an alias reference in $value`,
        );
      }
    }

    const type = token.$type;
    if (!type) {
      // Without a type we cannot validate the value shape
      return { path, valid: errors.length === 0, errors };
    }
    if (derivation !== undefined && derivationOps.errors.length === 0) {
      for (const op of derivationOps.ops) {
        if (!opSupportedTypes(op.kind).includes(type)) {
          errors.push(
            `${path}: derivation op "${op.kind}" cannot apply to type "${type}"`,
          );
        }
      }
    }

    // Skip references and formulas — they are validated during resolution
    if (isReference(value) || isFormula(value)) {
      return { path, valid: errors.length === 0, errors };
    }

    switch (type) {
      case TOKEN_TYPES.COLOR:
        this.validateColor(value, path, errors);
        break;
      case TOKEN_TYPES.DIMENSION:
        this.validateDimension(value, path, errors);
        break;
      case TOKEN_TYPES.FONT_FAMILY:
        this.validateFontFamily(value, path, errors);
        break;
      case TOKEN_TYPES.FONT_WEIGHT:
        this.validateFontWeight(value, path, errors);
        break;
      case TOKEN_TYPES.DURATION:
        this.validateDuration(value, path, errors);
        break;
      case TOKEN_TYPES.CUBIC_BEZIER:
        this.validateCubicBezier(value, path, errors);
        break;
      case TOKEN_TYPES.NUMBER:
        this.validateNumber(value, path, errors);
        break;
      case TOKEN_TYPES.SHADOW:
        this.validateShadow(value, path, errors);
        break;
      case TOKEN_TYPES.TYPOGRAPHY:
        this.validateTypography(value, path, errors);
        break;
      case TOKEN_TYPES.BORDER:
        this.validateBorder(value, path, errors);
        break;
      case TOKEN_TYPES.TRANSITION:
        this.validateTransition(value, path, errors);
        break;
      case TOKEN_TYPES.GRADIENT:
        this.validateGradient(value, path, errors);
        break;
      case TOKEN_TYPES.STROKE_STYLE:
        this.validateStrokeStyle(value, path, errors);
        break;
      case TOKEN_TYPES.BOOLEAN:
        if (typeof value !== 'boolean') {
          errors.push(`${path}: expected boolean, got ${typeof value}`);
        }
        break;
      case TOKEN_TYPES.STRING:
        if (typeof value !== 'string') {
          errors.push(`${path}: expected string, got ${typeof value}`);
        }
        break;
      case TOKEN_TYPES.PERCENTAGE:
        if (typeof value !== 'number') {
          errors.push(`${path}: expected number for percentage, got ${typeof value}`);
        }
        break;
      case TOKEN_TYPES.LINK:
        if (typeof value !== 'string') {
          errors.push(`${path}: expected string URL for link, got ${typeof value}`);
        }
        break;
      case TOKEN_TYPES.LINE_HEIGHT:
        if (typeof value !== 'number' && !isDimensionLike(value)) {
          errors.push(`${path}: lineHeight must be a number or dimension`);
        }
        break;
      case TOKEN_TYPES.LETTER_SPACING:
        this.validateDimension(value, path, errors);
        break;
      case TOKEN_TYPES.FONT_STYLE:
        if (typeof value !== 'string') {
          errors.push(`${path}: fontStyle must be a string`);
        }
        break;
      case TOKEN_TYPES.TEXT_DECORATION:
        if (typeof value !== 'string') {
          errors.push(`${path}: textDecoration must be a string`);
        }
        break;
      case TOKEN_TYPES.TEXT_TRANSFORM:
        if (typeof value !== 'string') {
          errors.push(`${path}: textTransform must be a string`);
        }
        break;
      case TOKEN_TYPES.ASSET:
        if (typeof value !== 'string') {
          errors.push(`${path}: asset must be a string (URI or data-URI), got ${typeof value}`);
        }
        break;
      // composition & custom — no strict shape, accept anything
      case TOKEN_TYPES.COMPOSITION:
      case TOKEN_TYPES.CUSTOM:
        break;
      default:
        // Unknown type — skip
        break;
    }

    return { path, valid: errors.length === 0, errors };
  }

  /**
   * Validate every token in a `TokenGroup` recursively.
   * Returns one `ValidationResult` per token found.
   */
  validateSet(tokens: TokenGroup, parentPath = ''): ValidationResult[] {
    const results: ValidationResult[] = [];
    const inheritedType = tokens.$type;

    for (const [key, node] of Object.entries(tokens)) {
      if (key.startsWith('$')) continue; // skip meta keys

      const currentPath = parentPath ? `${parentPath}.${key}` : key;

      if (isDTCGToken(node)) {
        // Apply inherited type if the token doesn't specify one
        const token: Token = inheritedType && !node.$type
          ? { ...node, $type: inheritedType }
          : (node as Token);
        results.push(this.validate(token, currentPath));
      } else if (isDTCGGroup(node)) {
        // Propagate inherited type to child group if it doesn't define its own
        const group: TokenGroup = inheritedType && !node.$type
          ? { ...(node as TokenGroup), $type: inheritedType }
          : (node as TokenGroup);
        results.push(...this.validateSet(group, currentPath));
      }
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Individual validators
  // -----------------------------------------------------------------------

  private validateColor(value: unknown, path: string, errors: string[]): void {
    if (!isValidColor(value)) {
      errors.push(
        `${path}: invalid color value. Expected hex (#RGB, #RRGGBB, #RRGGBBAA) or CSS color string, got ${JSON.stringify(value)}`,
      );
    }
  }

  private validateDimension(value: unknown, path: string, errors: string[]): void {
    if (!isDimensionLike(value)) {
      errors.push(
        `${path}: dimension must be an object with { value: number, unit: string }`,
      );
    }
  }

  private validateFontFamily(value: unknown, path: string, errors: string[]): void {
    const valid =
      typeof value === 'string' ||
      (Array.isArray(value) && value.every((v) => typeof v === 'string'));
    if (!valid) {
      errors.push(`${path}: fontFamily must be a string or array of strings`);
    }
  }

  private validateFontWeight(value: unknown, path: string, errors: string[]): void {
    if (typeof value === 'number') {
      if (value < 1 || value > 999) {
        errors.push(`${path}: numeric fontWeight must be between 1 and 999, got ${value}`);
      }
    } else if (typeof value === 'string') {
      if (!(value.toLowerCase() in FONT_WEIGHT_NAMES)) {
        errors.push(
          `${path}: unknown fontWeight name "${value}". ` +
            `Expected one of: ${Object.keys(FONT_WEIGHT_NAMES).join(', ')}`,
        );
      }
    } else {
      errors.push(`${path}: fontWeight must be a number (1-999) or a named weight string`);
    }
  }

  private validateDuration(value: unknown, path: string, errors: string[]): void {
    if (!isDurationLike(value)) {
      errors.push(
        `${path}: duration must be { value: number, unit: 'ms' | 's' }`,
      );
    }
  }

  private validateCubicBezier(value: unknown, path: string, errors: string[]): void {
    if (!Array.isArray(value) || value.length !== 4) {
      errors.push(`${path}: cubicBezier must be an array of exactly 4 numbers`);
      return;
    }
    if (!value.every((v) => typeof v === 'number')) {
      errors.push(`${path}: all cubicBezier values must be numbers`);
      return;
    }
    // x1, x2 (indices 0 and 2) must be in [0, 1]
    const [x1, , x2] = value as [number, number, number, number];
    if (x1 < 0 || x1 > 1) {
      errors.push(`${path}: cubicBezier x1 must be between 0 and 1, got ${x1}`);
    }
    if (x2 < 0 || x2 > 1) {
      errors.push(`${path}: cubicBezier x2 must be between 0 and 1, got ${x2}`);
    }
  }

  private validateNumber(value: unknown, path: string, errors: string[]): void {
    if (typeof value !== 'number') {
      errors.push(`${path}: expected number, got ${typeof value}`);
    }
  }

  private validateShadow(value: unknown, path: string, errors: string[]): void {
    if (typeof value !== 'object' || value === null) {
      errors.push(`${path}: shadow must be an object`);
      return;
    }
    const v = toRec(value);
    const required: (keyof ShadowValue)[] = ['color', 'offsetX', 'offsetY', 'blur', 'spread'];
    for (const field of required) {
      if (!(field in v)) {
        errors.push(`${path}: shadow missing required field "${field}"`);
      }
    }
    if ('color' in v && !isReference(v.color) && !isValidColor(v.color)) {
      errors.push(`${path}.color: invalid color in shadow`);
    }
    for (const dim of ['offsetX', 'offsetY', 'blur', 'spread'] as const) {
      if (dim in v && !isReference(v[dim]) && !isDimensionLike(v[dim])) {
        errors.push(`${path}.${dim}: must be a dimension { value, unit }`);
      }
    }
    if ('type' in v && v.type !== 'dropShadow' && v.type !== 'innerShadow') {
      errors.push(`${path}.type: must be "dropShadow" or "innerShadow"`);
    }
  }

  private validateTypography(value: unknown, path: string, errors: string[]): void {
    if (typeof value !== 'object' || value === null) {
      errors.push(`${path}: typography must be an object`);
      return;
    }
    const v = toRec(value);
    const required: (keyof TypographyValue)[] = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'letterSpacing',
    ];
    for (const field of required) {
      if (!(field in v)) {
        errors.push(`${path}: typography missing required field "${field}"`);
      }
    }
    if ('fontSize' in v && !isReference(v.fontSize) && !isDimensionLike(v.fontSize)) {
      errors.push(`${path}.fontSize: must be a dimension`);
    }
    if ('letterSpacing' in v && !isReference(v.letterSpacing) && !isDimensionLike(v.letterSpacing)) {
      errors.push(`${path}.letterSpacing: must be a dimension`);
    }
  }

  private validateBorder(value: unknown, path: string, errors: string[]): void {
    if (typeof value !== 'object' || value === null) {
      errors.push(`${path}: border must be an object`);
      return;
    }
    const v = toRec(value);
    for (const field of ['color', 'width', 'style'] as const) {
      if (!(field in v)) {
        errors.push(`${path}: border missing required field "${field}"`);
      }
    }
    if ('color' in v && !isReference(v.color) && !isValidColor(v.color)) {
      errors.push(`${path}.color: invalid color in border`);
    }
    if ('width' in v && !isReference(v.width) && !isDimensionLike(v.width)) {
      errors.push(`${path}.width: must be a dimension`);
    }
    if ('style' in v && !isReference(v.style) && typeof v.style !== 'string') {
      errors.push(`${path}.style: must be a string`);
    }
  }

  private validateTransition(value: unknown, path: string, errors: string[]): void {
    if (typeof value !== 'object' || value === null) {
      errors.push(`${path}: transition must be an object`);
      return;
    }
    const v = toRec(value);
    for (const field of ['duration', 'delay', 'timingFunction'] as const) {
      if (!(field in v)) {
        errors.push(`${path}: transition missing required field "${field}"`);
      }
    }
    if ('duration' in v && !isReference(v.duration) && !isDurationLike(v.duration)) {
      errors.push(`${path}.duration: must be a duration { value, unit: 'ms'|'s' }`);
    }
    if ('delay' in v && !isReference(v.delay) && !isDurationLike(v.delay)) {
      errors.push(`${path}.delay: must be a duration { value, unit: 'ms'|'s' }`);
    }
    if ('timingFunction' in v && !isReference(v.timingFunction)) {
      const tf = v.timingFunction;
      if (!Array.isArray(tf) || tf.length !== 4 || !tf.every((n) => typeof n === 'number')) {
        errors.push(`${path}.timingFunction: must be a cubicBezier [x1, y1, x2, y2]`);
      } else {
        const [x1, , x2] = tf as [number, number, number, number];
        if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
          errors.push(`${path}.timingFunction: cubic bezier x-values must be in [0, 1]`);
        }
      }
    }
  }

  private validateGradient(value: unknown, path: string, errors: string[]): void {
    if (!Array.isArray(value)) {
      errors.push(`${path}: gradient must be an array of stops`);
      return;
    }
    if (value.length < 2) {
      errors.push(`${path}: gradient must include at least 2 stops`);
    }
    for (let i = 0; i < value.length; i++) {
      const stopRaw: unknown = value[i];
      if (typeof stopRaw !== 'object' || stopRaw === null) {
        errors.push(`${path}[${i}]: gradient stop must be an object`);
        continue;
      }
      const stop = toRec(stopRaw);
      if (!('color' in stop)) {
        errors.push(`${path}[${i}]: gradient stop missing "color"`);
      } else if (!isReference(stop.color) && !isValidColor(stop.color)) {
        errors.push(`${path}[${i}].color: invalid color in gradient stop`);
      }
      if (!('position' in stop)) {
        errors.push(`${path}[${i}]: gradient stop missing "position"`);
      } else if (typeof stop.position !== 'number' || !Number.isFinite(stop.position)) {
        errors.push(`${path}[${i}].position: must be a finite number`);
      } else if (stop.position < 0 || stop.position > 1) {
        errors.push(`${path}[${i}].position: must be between 0 and 1`);
      }
    }
  }

  private validateStrokeStyle(value: unknown, path: string, errors: string[]): void {
    if (typeof value === 'string') {
      if (!(STROKE_STYLE_KEYWORDS as readonly string[]).includes(value)) {
        errors.push(
          `${path}: unknown strokeStyle keyword "${value}". ` +
            `Expected one of: ${STROKE_STYLE_KEYWORDS.join(', ')}`,
        );
      }
      return;
    }
    if (typeof value === 'object' && value !== null) {
      const v = toRec(value);
      if (!('dashArray' in v)) {
        errors.push(`${path}: strokeStyle object missing "dashArray"`);
      } else if (!Array.isArray(v.dashArray) || !v.dashArray.every((d: unknown) => isReference(d) || isDimensionLike(d))) {
        errors.push(`${path}.dashArray: must be an array of dimensions`);
      }
      if (!('lineCap' in v)) {
        errors.push(`${path}: strokeStyle object missing "lineCap"`);
      } else if (!['round', 'butt', 'square'].includes(v.lineCap as string)) {
        errors.push(`${path}.lineCap: must be "round", "butt", or "square"`);
      }
      return;
    }
    errors.push(`${path}: strokeStyle must be a keyword string or { dashArray, lineCap }`);
  }

}
