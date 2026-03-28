/**
 * DAG-based alias resolver with cycle detection.
 *
 * Resolves DTCG token references (`{path.to.token}`) using topological
 * ordering and depth-first search with three-color marking for cycle
 * detection (white = unvisited, gray = in-progress, black = done).
 */

import { isReference, isFormula, parseReference } from './dtcg-types.js';
import { TOKEN_TYPES, makeReferenceGlobalRegex } from './constants.js';
import { evalExpr } from './eval-expr.js';
import { applyColorModifiers, validateColorModifiers } from './color-modifier.js';
import type {
  Token,
  TokenType,
  TokenValue,
  ResolvedToken,
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
   * re-resolved on next access. Uses iterative BFS to avoid stack overflow
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
      const refs = this.collectReferences(token.$value);
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

    const refs = this.collectReferences(token.$value);
    this.dependencies.set(path, refs);

    for (const ref of refs) {
      if (!this.dependents.has(ref)) {
        this.dependents.set(ref, new Set());
      }
      this.dependents.get(ref)!.add(path);
    }
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
        refs.add(m[1]);
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

      // Apply color modifiers if present
      const tokenmanagerExt = token.$extensions?.tokenmanager as Record<string, unknown> | undefined;
      const rawModifiers = tokenmanagerExt?.colorModifier;
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
              ...(tokenmanagerExt ?? {}),
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

    // Fallback: try to infer from value shape
    return this.inferType(token.$value);
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
        const unit = (v as { unit: string }).unit;
        if (unit === 'ms' || unit === 's') return TOKEN_TYPES.DURATION;
        return TOKEN_TYPES.DIMENSION;
      }
    }

    return TOKEN_TYPES.CUSTOM;
  }
}
