/**
 * DAG-based alias resolver with cycle detection.
 *
 * Resolves DTCG token references (`{path.to.token}`) using topological
 * ordering and depth-first search with three-color marking for cycle
 * detection (white = unvisited, gray = in-progress, black = done).
 */

import { isReference, isFormula, parseReference } from './dtcg-types.js';
import { TOKEN_TYPES, COMPOSITE_TOKEN_TYPES, makeReferenceGlobalRegex } from './constants.js';
import { evalExpr } from './eval-expr.js';
import { applyColorModifiers, validateColorModifiers } from './color-modifier.js';
import type {
  Token,
  TokenType,
  TokenValue,
  ResolvedToken,
  DimensionValue,
  DurationValue,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RESOLVE_DEPTH = 32;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

enum Color {
  White = 0, // unvisited
  Gray = 1, // in current DFS path
  Black = 2, // fully resolved
}

// ---------------------------------------------------------------------------
// TokenResolver
// ---------------------------------------------------------------------------

export class TokenResolver {
  /** Input tokens keyed by dot-path. */
  private tokens: Map<string, Token>;

  /** Resolved value cache. */
  private resolved: Map<string, ResolvedToken> = new Map();

  /** path -> set of paths this token references */
  private dependencies: Map<string, Set<string>> = new Map();

  /** path -> set of paths that reference this token */
  private dependents: Map<string, Set<string>> = new Map();

  /** DFS coloring for cycle detection. */
  private color: Map<string, Color> = new Map();

  /** Current DFS recursion stack (for cycle path reconstruction). */
  private dfsStack: string[] = [];

  /** Name of the token set (attached to every ResolvedToken). */
  private setName: string;

  constructor(tokens: Record<string, Token>, setName = 'default') {
    this.tokens = new Map(Object.entries(tokens));
    this.setName = setName;
    this.buildGraph();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Resolve a single token by path. Returns cached value when available. */
  resolve(path: string): ResolvedToken {
    const cached = this.resolved.get(path);
    if (cached) return cached;

    const token = this.tokens.get(path);
    if (!token) {
      throw new Error(`Token not found: "${path}"`);
    }

    // Seed color map: mark already-resolved tokens as Black so cycle
    // detection is consistent with resolveAll() (which does the same).
    this.color = new Map();
    for (const p of this.tokens.keys()) {
      if (this.resolved.has(p)) {
        this.color.set(p, Color.Black);
      }
    }
    this.dfsResolve(path);
    const result = this.resolved.get(path);
    if (!result) {
      throw new Error(`Failed to resolve token "${path}" — resolution completed but produced no value.`);
    }
    return result;
  }

  /** Get all token paths that directly reference this token (reverse dependencies). */
  getDependents(path: string): Set<string> {
    return new Set(this.dependents.get(path) ?? []);
  }

  /** Resolve every token. Returns a map of path -> ResolvedToken. */
  resolveAll(): Map<string, ResolvedToken> {
    // Initialise colors
    this.color = new Map();
    for (const path of this.tokens.keys()) {
      this.color.set(path, this.resolved.has(path) ? Color.Black : Color.White);
    }

    for (const path of this.tokens.keys()) {
      if (this.color.get(path) !== Color.Black) {
        this.dfsResolve(path);
      }
    }

    return new Map(this.resolved);
  }

  /**
   * Invalidate a token and every downstream dependent so they will be
   * re-resolved on next access. Uses iterative DFS to avoid stack overflow
   * on deep or circular dependency chains.
   */
  invalidate(path: string): void {
    const queue: string[] = [path];
    while (queue.length > 0) {
      const current = queue.pop()!;
      this.resolved.delete(current);
      const deps = this.dependents.get(current);
      if (deps) {
        for (const dep of deps) {
          if (this.resolved.has(dep)) {
            queue.push(dep);
          }
        }
      }
    }
  }

  /**
   * Update or add a token in the resolver. Automatically invalidates
   * the token and all of its dependents, and rebuilds the graph edges.
   */
  updateToken(path: string, token: Token): void {
    this.invalidate(path);
    this.tokens.set(path, token);
    this.rebuildEdgesFor(path);
  }

  // -----------------------------------------------------------------------
  // Graph construction
  // -----------------------------------------------------------------------

  private buildGraph(): void {
    this.dependencies.clear();
    this.dependents.clear();

    for (const [path, token] of this.tokens) {
      const refs = this.collectAllDependencies(token);
      this.dependencies.set(path, refs);

      for (const ref of refs) {
        if (!this.dependents.has(ref)) {
          this.dependents.set(ref, new Set());
        }
        this.dependents.get(ref)!.add(path);
      }
    }
  }

  private rebuildEdgesFor(path: string): void {
    // Remove old forward edges
    const oldDeps = this.dependencies.get(path);
    if (oldDeps) {
      for (const dep of oldDeps) {
        this.dependents.get(dep)?.delete(path);
      }
    }

    const token = this.tokens.get(path);
    if (!token) {
      this.dependencies.delete(path);
      return;
    }

    const refs = this.collectAllDependencies(token);
    this.dependencies.set(path, refs);

    for (const ref of refs) {
      if (!this.dependents.has(ref)) {
        this.dependents.set(ref, new Set());
      }
      this.dependents.get(ref)!.add(path);
    }
  }

  /**
   * Collect all dependency paths for a token: value references + $extends target.
   */
  private collectAllDependencies(token: Token): Set<string> {
    const refs = this.collectReferences(token.$value);
    const extendsPath = TokenResolver.getExtendsPath(token);
    if (extendsPath) {
      refs.add(extendsPath);
    }
    return refs;
  }

  /**
   * Extract the `$extends` path from a token's `$extensions.tokenmanager.extends`.
   */
  static getExtendsPath(token: Token): string | null {
    const ext = token.$extensions?.tokenmanager?.extends;
    return typeof ext === 'string' && ext.length > 0 ? ext : null;
  }

  /**
   * Recursively collect all reference paths from a token value.
   * Handles top-level references as well as references nested inside
   * composite values (typography, shadow, border, transition, gradient).
   */
  private collectReferences(value: unknown): Set<string> {
    const refs = new Set<string>();

    if (isReference(value)) {
      refs.add(parseReference(value));
      return refs;
    }

    // Extract all {ref} tokens from formula strings
    if (typeof value === 'string' && isFormula(value)) {
      const matches = value.matchAll(makeReferenceGlobalRegex());
      for (const m of matches) {
        // Guard against empty/undefined capture groups (e.g. malformed `{.}` or `{}`)
        if (m[1]) {
          refs.add(m[1]);
        }
      }
      return refs;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) {
          for (const r of this.collectReferences(item)) refs.add(r);
        }
      }
      return refs;
    }

    if (typeof value === 'object' && value !== null) {
      for (const v of Object.values(value)) {
        if (v != null) {
          for (const r of this.collectReferences(v)) refs.add(r);
        }
      }
    }

    return refs;
  }

  // -----------------------------------------------------------------------
  // DFS Resolution
  // -----------------------------------------------------------------------

  private dfsResolve(path: string): void {
    const token = this.tokens.get(path);
    if (!token) {
      throw new Error(`Token not found: "${path}"`);
    }

    this.color.set(path, Color.Gray);
    this.dfsStack.push(path);

    try {
      // Visit all dependencies first
      const deps = this.dependencies.get(path) ?? new Set<string>();
      for (const dep of deps) {
        const depColor = this.color.get(dep);
        if (depColor === Color.Gray) {
          // Reconstruct the cycle from the stack
          const cycleStart = this.dfsStack.indexOf(dep);
          const cyclePath = cycleStart >= 0
            ? [...this.dfsStack.slice(cycleStart), dep]
            : [path, dep];
          throw new Error(
            `Circular reference: ${cyclePath.join(' → ')}`,
          );
        }
        if ((depColor === Color.White || depColor === undefined) && !this.resolved.has(dep)) {
          this.dfsResolve(dep);
        }
      }

      // All deps are resolved — resolve this token
      let resolvedValue = this.resolveValue(token.$value, path);
      const $type = this.resolveType(token, path);

      // Dimension and duration tokens must always carry an explicit {value, unit}
      // object so that downstream formula references can reliably inherit the unit
      // via extractFormulaUnit (which inspects the resolved $value for a 'unit' key).
      //
      // Two sub-cases both produce a plain number that needs wrapping:
      //   1. Formula tokens — evalExpr strips the unit; reconstruct it by walking
      //      the resolved dependencies of each {ref} in the formula.
      //   2. Bare-number tokens — e.g. {$type:"dimension", $value:8}. The W3C DTCG
      //      spec treats a bare dimension number as pixels; wrap it explicitly so the
      //      resolved value is consistent with object-format tokens.
      if (typeof resolvedValue === 'number' && ($type === 'dimension' || $type === 'duration')) {
        const isFormulaSrc = typeof token.$value === 'string' && isFormula(token.$value);
        if ($type === 'dimension') {
          const unit = isFormulaSrc ? (this.extractFormulaUnit(token.$value) ?? 'px') : 'px';
          resolvedValue = { value: resolvedValue, unit } as DimensionValue;
        } else {
          const unit = isFormulaSrc ? (this.extractFormulaUnit(token.$value) ?? 'ms') : 'ms';
          resolvedValue = { value: resolvedValue, unit } as DurationValue;
        }
      }

      // Composite token types (shadow, typography, border, etc.) must resolve to
      // plain objects. Catch misuse early — e.g. a shadow token aliasing a color
      // token produces a string value, which would silently corrupt downstream
      // consumers or throw a cryptic error during spread / property access.
      if (COMPOSITE_TOKEN_TYPES.has($type)) {
        this.assertCompositeValue(resolvedValue, $type, path);
      }

      // Apply $extends inheritance: merge base token value with local overrides
      const extendsPath = TokenResolver.getExtendsPath(token);
      if (extendsPath) {
        const baseResolved = this.resolved.get(extendsPath);
        if (!baseResolved) {
          throw new Error(
            `Token "${path}" extends "${extendsPath}" but that token could not be found or resolved.`,
          );
        }

        // Validate that the base token is a composite type that supports $extends
        if (!COMPOSITE_TOKEN_TYPES.has(baseResolved.$type)) {
          throw new Error(
            `Token "${path}" extends "${extendsPath}" but the base token's type "${baseResolved.$type}" ` +
            `is not a composite type. Only composite types (${[...COMPOSITE_TOKEN_TYPES].join(', ')}) support $extends.`,
          );
        }

        // Validate type compatibility between base and extending token
        if ($type !== baseResolved.$type) {
          throw new Error(
            `Token "${path}" (type "${$type}") extends "${extendsPath}" (type "${baseResolved.$type}") ` +
            `but their types do not match. The extending token must have the same type as its base.`,
          );
        }

        // Both values must be plain objects (assertCompositeValue already ran for
        // resolvedValue above; repeat for the base to get a precise error location).
        this.assertCompositeValue(baseResolved.$value, baseResolved.$type, extendsPath, 'base value (from $extends target)');

        resolvedValue = { ...(baseResolved.$value as Record<string, unknown>), ...(resolvedValue as Record<string, unknown>) };
      }

      // Apply color modifiers if present
      const rawModifiers = token.$extensions?.tokenmanager?.colorModifier;
      if (Array.isArray(rawModifiers) && $type === 'color' && typeof resolvedValue === 'string') {
        const modifiers = validateColorModifiers(rawModifiers);
        if (modifiers.length > 0) {
          resolvedValue = applyColorModifiers(resolvedValue, modifiers);
        }
      }

      // Store formula metadata in $extensions so export can output calc() expressions
      const isFormulaToken = typeof token.$value === 'string' && isFormula(token.$value);
      const extensions = isFormulaToken
        ? {
            ...token.$extensions,
            tokenmanager: {
              ...(token.$extensions?.tokenmanager ?? {}),
              formula: token.$value,
            },
          }
        : token.$extensions;

      this.resolved.set(path, {
        path,
        $type,
        $value: resolvedValue as TokenValue,
        $description: token.$description,
        $extensions: extensions,
        rawValue: token.$value,
        setName: this.setName,
      });

      this.color.set(path, Color.Black);
    } finally {
      this.dfsStack.pop();
    }
  }

  // -----------------------------------------------------------------------
  // Value resolution
  // -----------------------------------------------------------------------

  /**
   * Recursively resolve a value. If it is a reference, return the resolved
   * value of the referenced token. For formula strings, substitute all refs
   * with their numeric values and evaluate the arithmetic expression.
   * For composite objects/arrays, recurse into each field.
   */
  private resolveValue(value: unknown, contextPath: string, depth = 0): unknown {
    if (depth > MAX_RESOLVE_DEPTH) {
      throw new Error(
        `Maximum nesting depth (${MAX_RESOLVE_DEPTH}) exceeded resolving token "${contextPath}". ` +
          `The token value is nested too deeply or contains a circular structure.`,
      );
    }

    if (isReference(value)) {
      const refPath = parseReference(value);
      const resolved = this.resolved.get(refPath);
      if (!resolved) {
        throw new Error(
          `Unresolved reference "${value}" in token "${contextPath}". ` +
            `Token "${refPath}" could not be found or resolved.`,
        );
      }
      return resolved.$value;
    }

    // Formula evaluation: substitute all {ref} tokens with their numeric values
    if (typeof value === 'string' && isFormula(value)) {
      const substituted = value.replace(makeReferenceGlobalRegex(), (_match, refPath: string) => {
        const resolved = this.resolved.get(refPath);
        if (!resolved) {
          throw new Error(
            `Unresolved reference "{${refPath}}" in formula at "${contextPath}". ` +
              `Token "${refPath}" could not be found or resolved.`,
          );
        }
        const num = this.extractNumeric(resolved.$value);
        if (num === null) {
          throw new Error(
            `Reference "{${refPath}}" in formula at "${contextPath}" does not resolve to a number. ` +
              `Got: ${JSON.stringify(resolved.$value)}`,
          );
        }
        return String(num);
      });
      return evalExpr(substituted);
    }

    if (Array.isArray(value)) {
      return value.map((item) => (item != null ? this.resolveValue(item, contextPath, depth + 1) : item));
    }

    if (typeof value === 'object' && value !== null) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = v != null ? this.resolveValue(v, contextPath, depth + 1) : v;
      }
      return out;
    }

    return value;
  }

  /**
   * Extract a numeric value from a resolved token value.
   * Handles raw numbers and dimension objects { value: number, unit: string }.
   */
  private extractNumeric(value: unknown): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && value !== null && 'value' in value) {
      const v = (value as { value: unknown }).value;
      return typeof v === 'number' ? v : null;
    }
    return null;
  }

  /**
   * Walk all {ref} tokens in a formula and return the unit of the first
   * resolved reference that carries dimensional information. Two strategies:
   *
   *   1. Structured value — resolved.$value is a {value, unit} object.
   *      Return its unit directly (covers explicit dimension/duration tokens
   *      and previously-normalised formula results).
   *
   *   2. Type-based inference — resolved.$value is a plain number but the
   *      resolved token has $type 'dimension' or 'duration'. Inherit the
   *      DTCG-default unit for that type ('px' / 'ms') rather than falling
   *      back to a hardcoded constant at the call site.
   *
   * Returns null only when no reference in the formula carries any
   * dimensional type information (e.g. pure-number arithmetic formulas).
   */
  private extractFormulaUnit(formula: string): string | null {
    const matches = formula.matchAll(makeReferenceGlobalRegex());
    for (const m of matches) {
      if (!m[1]) continue;
      const resolved = this.resolved.get(m[1]);
      if (!resolved) continue;
      const val = resolved.$value;
      // Strategy 1: resolved value already carries an explicit unit
      if (typeof val === 'object' && val !== null && 'unit' in val) {
        return (val as { unit: string }).unit;
      }
      // Strategy 2: plain-number value — infer unit from the token's resolved $type
      if (typeof val === 'number') {
        if (resolved.$type === 'dimension') return 'px';
        if (resolved.$type === 'duration') return 'ms';
      }
    }
    return null;
  }

  /**
   * Determine the effective $type for a token. If the token itself
   * declares a type, use it. Otherwise follow the reference chain.
   */
  private resolveType(token: Token, path: string): TokenType {
    if (token.$type) return token.$type;

    // If the value is a direct reference, inherit the type from the target
    if (isReference(token.$value)) {
      const refPath = parseReference(token.$value as string);
      const resolved = this.resolved.get(refPath);
      if (resolved) return resolved.$type;
    }

    // Inherit type from $extends base token
    const extendsPath = TokenResolver.getExtendsPath(token);
    if (extendsPath) {
      const baseResolved = this.resolved.get(extendsPath);
      if (baseResolved) return baseResolved.$type;
    }

    // Fallback: try to infer from value shape
    return this.inferType(token.$value);
  }

  /**
   * Asserts that `value` is a non-null, non-array plain object — the shape
   * required by all composite token types (shadow, typography, border,
   * transition, composition).
   *
   * Throws a descriptive resolution error when the value is a primitive or
   * array, for example when a user accidentally aliases a composite token to a
   * color token, causing the resolved value to be a string instead of an
   * object. Without this guard the spread/property-access at the call site
   * would silently produce wrong output or throw a cryptic JS error.
   *
   * @param value   - The resolved value to check.
   * @param type    - The expected composite token type (used in the message).
   * @param path    - The token path being resolved (used in the message).
   * @param role    - Optional label describing which value is being checked
   *                  (e.g. "base value (from $extends target)").
   */
  private assertCompositeValue(
    value: unknown,
    type: TokenType,
    path: string,
    role = 'resolved value',
  ): asserts value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(
        `Token "${path}" has type "${type}" but its ${role} is not a plain object ` +
        `(got ${JSON.stringify(value)}). ` +
        `Composite token types (${[...COMPOSITE_TOKEN_TYPES].join(', ')}) must resolve to ` +
        `an object — check that any alias resolves to a compatible composite type, not a primitive.`,
      );
    }
  }

  private inferType(value: unknown): TokenType {
    if (typeof value === 'string') return TOKEN_TYPES.STRING;
    if (typeof value === 'number') return TOKEN_TYPES.NUMBER;
    if (typeof value === 'boolean') return TOKEN_TYPES.BOOLEAN;

    if (Array.isArray(value)) {
      if (
        value.length === 4 &&
        value.every((v) => typeof v === 'number')
      ) {
        return TOKEN_TYPES.CUBIC_BEZIER;
      }
      if (
        value.length > 0 &&
        typeof value[0] === 'object' &&
        value[0] !== null &&
        'color' in value[0] &&
        'position' in value[0]
      ) {
        return TOKEN_TYPES.GRADIENT;
      }
    }

    if (typeof value === 'object' && value !== null) {
      const v = value as Record<string, unknown>;
      const keys = Object.keys(v);

      // Shadow: require offsetX or offsetY (unique to shadow); blur/spread alone are ambiguous
      if ('offsetX' in v || 'offsetY' in v) return TOKEN_TYPES.SHADOW;

      // Typography: require fontFamily or fontSize (distinctive to typography)
      if ('fontFamily' in v || 'fontSize' in v) return TOKEN_TYPES.TYPOGRAPHY;

      // Border: require style (the DTCG strokeStyle key) alongside color or width;
      // width+color alone is ambiguous (could be a composition)
      if ('style' in v && ('color' in v || 'width' in v)) return TOKEN_TYPES.BORDER;

      // Transition: require timingFunction (distinctive) or at least 2 of duration/delay/timingFunction
      const transitionKeys = ['duration', 'delay', 'timingFunction'];
      const transitionHits = keys.filter((k) => transitionKeys.includes(k)).length;
      if ('timingFunction' in v || transitionHits >= 2) return TOKEN_TYPES.TRANSITION;

      if ('value' in v && 'unit' in v) {
        const unit = v['unit'];
        if (typeof unit === 'string') {
          if (unit === 'ms' || unit === 's') return TOKEN_TYPES.DURATION;
          return TOKEN_TYPES.DIMENSION;
        }
      }
    }

    return TOKEN_TYPES.CUSTOM;
  }
}
