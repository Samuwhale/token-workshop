/**
 * DAG-based alias resolver with cycle detection.
 *
 * Resolves DTCG token references (`{path.to.token}`) using topological
 * ordering and depth-first search with three-color marking for cycle
 * detection (white = unvisited, gray = in-progress, black = done).
 */

import { isReference, parseReference } from './dtcg-types.js';
import { TOKEN_TYPES } from './constants.js';
import type {
  Token,
  TokenType,
  TokenValue,
  ResolvedToken,
} from './types.js';

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

    // Reset colors for a fresh DFS from this node
    this.color = new Map();
    for (const p of this.tokens.keys()) {
      this.color.set(p, this.resolved.has(p) ? Color.Black : Color.White);
    }

    this.dfsResolve(path);
    return this.resolved.get(path)!;
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
   * re-resolved on next access.
   */
  invalidate(path: string): void {
    this.resolved.delete(path);
    const deps = this.dependents.get(path);
    if (deps) {
      for (const dep of deps) {
        if (this.resolved.has(dep)) {
          this.invalidate(dep); // recurse into dependents
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

    if (Array.isArray(value)) {
      for (const item of value) {
        for (const r of this.collectReferences(item)) refs.add(r);
      }
      return refs;
    }

    if (typeof value === 'object' && value !== null) {
      for (const v of Object.values(value)) {
        for (const r of this.collectReferences(v)) refs.add(r);
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

    // Visit all dependencies first
    const deps = this.dependencies.get(path) ?? new Set<string>();
    for (const dep of deps) {
      const depColor = this.color.get(dep);
      if (depColor === Color.Gray) {
        throw new Error(
          `Circular reference detected: "${path}" -> "${dep}". ` +
            `Resolution would cause an infinite loop.`,
        );
      }
      if (depColor === Color.White || depColor === undefined) {
        this.dfsResolve(dep);
      }
    }

    // All deps are resolved — resolve this token
    const resolvedValue = this.resolveValue(token.$value, path);
    const $type = this.resolveType(token, path);

    this.resolved.set(path, {
      path,
      $type,
      $value: resolvedValue as TokenValue,
      $description: token.$description,
      $extensions: token.$extensions,
      rawValue: token.$value,
      setName: this.setName,
    });

    this.color.set(path, Color.Black);
  }

  // -----------------------------------------------------------------------
  // Value resolution
  // -----------------------------------------------------------------------

  /**
   * Recursively resolve a value. If it is a reference, return the resolved
   * value of the referenced token. For composite objects/arrays, recurse
   * into each field.
   */
  private resolveValue(value: unknown, contextPath: string): unknown {
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

    if (Array.isArray(value)) {
      return value.map((item) => this.resolveValue(item, contextPath));
    }

    if (typeof value === 'object' && value !== null) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = this.resolveValue(v, contextPath);
      }
      return out;
    }

    return value;
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
      if ('fontFamily' in v && 'fontSize' in v) return TOKEN_TYPES.TYPOGRAPHY;
      if ('offsetX' in v && 'blur' in v) return TOKEN_TYPES.SHADOW;
      if ('color' in v && 'width' in v && 'style' in v) return TOKEN_TYPES.BORDER;
      if ('duration' in v && 'timingFunction' in v) return TOKEN_TYPES.TRANSITION;
      if ('value' in v && 'unit' in v) {
        const unit = (v as { unit: string }).unit;
        if (unit === 'ms' || unit === 's') return TOKEN_TYPES.DURATION;
        return TOKEN_TYPES.DIMENSION;
      }
    }

    return TOKEN_TYPES.CUSTOM;
  }
}
