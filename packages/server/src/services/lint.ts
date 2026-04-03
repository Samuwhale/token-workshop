import fs from 'node:fs/promises';
import path from 'node:path';
import { colorDeltaE, type Token } from '@tokenmanager/core';
import { TokenStore } from './token-store.js';
import { isSafeRegex } from './token-tree-utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warning' | 'info';

export interface LintRuleConfig {
  enabled: boolean;
  severity?: Severity;
  /** rule-specific options */
  options?: Record<string, unknown>;
}

export interface LintConfig {
  lintRules: {
    'no-raw-color'?: LintRuleConfig;
    'require-description'?: LintRuleConfig;
    'path-pattern'?: LintRuleConfig;
    'max-alias-depth'?: LintRuleConfig;
    'no-duplicate-values'?: LintRuleConfig;
  };
}

export interface LintViolation {
  rule: string;
  path: string;
  severity: Severity;
  message: string;
  suggestedFix?: string;
  /** Concrete suggestion — e.g. the alias path to use, or a corrected name. */
  suggestion?: string;
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_LINT_CONFIG: LintConfig = {
  lintRules: {
    'no-raw-color': { enabled: true, severity: 'warning' },
    'require-description': { enabled: false, severity: 'info' },
    'path-pattern': { enabled: false, severity: 'warning', options: { pattern: '^[a-z][a-z0-9]*([.-][a-z0-9]+)*$' } },
    'max-alias-depth': { enabled: true, severity: 'warning', options: { maxDepth: 3 } },
    'no-duplicate-values': { enabled: true, severity: 'info' },
  },
};

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

export class LintConfigStore {
  private configPath: string;
  private config: LintConfig | null = null;

  constructor(tokenDir: string) {
    this.configPath = path.join(tokenDir, '$lint.json');
  }

  async load(): Promise<LintConfig> {
    if (!this.config) {
      try {
        const content = await fs.readFile(this.configPath, 'utf-8');
        this.config = JSON.parse(content) as LintConfig;
      } catch {
        this.config = structuredClone(DEFAULT_LINT_CONFIG);
      }
    }
    return structuredClone(this.config);
  }

  async save(config: LintConfig): Promise<void> {
    this.config = structuredClone(config);
    const tmp = `${this.configPath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(config, null, 2));
    await fs.rename(tmp, this.configPath);
  }

  async get(): Promise<LintConfig> {
    return this.load();
  }

  async update(partial: Partial<LintConfig>): Promise<LintConfig> {
    const current = await this.load();
    const updated: LintConfig = {
      ...current,
      ...partial,
      lintRules: {
        ...current.lintRules,
        ...(partial.lintRules ?? {}),
      },
    };
    await this.save(updated);
    return updated;
  }
}


/** Find the closest alias color token to the given raw hex value. */
function findNearestColorAlias(
  rawHex: string,
  tokenPath: string,
  allFlatTokens: Record<string, Token>,
): { path: string; deltaE: number } | null {
  let best: { path: string; deltaE: number } | null = null;
  for (const [candidatePath, candidateToken] of Object.entries(allFlatTokens)) {
    if (candidatePath === tokenPath) continue;
    if (candidateToken.$type !== 'color') continue;
    // Only suggest tokens that are themselves raw values (primitives to alias to)
    if (isAlias(candidateToken.$value)) continue;
    const candidateHex = candidateToken.$value;
    if (typeof candidateHex !== 'string') continue;
    const dE = colorDeltaE(rawHex, candidateHex);
    if (dE === null) continue;
    if (!best || dE < best.deltaE) {
      best = { path: candidatePath, deltaE: dE };
    }
  }
  return best;
}

/** Resolve an alias chain to the final non-alias value, returning that token's path. */
function resolveAliasTarget(path: string, flatTokens: Record<string, Token>, visited = new Set<string>()): string | null {
  if (visited.has(path)) return null; // cycle
  const token = flatTokens[path];
  if (!token) return null;
  if (!isAlias(token.$value)) return path;
  visited.add(path);
  return resolveAliasTarget((token.$value as string).slice(1, -1), flatTokens, visited);
}

// ---------------------------------------------------------------------------
// Rules engine
// ---------------------------------------------------------------------------

function isAlias(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('{') && value.endsWith('}');
}

function getAliasDepth(path: string, flatTokens: Record<string, Token>, visited = new Set<string>()): number {
  if (visited.has(path)) return 0; // cycle — do not recurse
  const token = flatTokens[path];
  if (!token || !isAlias(token.$value)) return 0;
  const refPath = (token.$value as string).slice(1, -1);
  visited.add(path);
  return 1 + getAliasDepth(refPath, flatTokens, visited);
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

export async function lintTokens(
  setName: string,
  tokenStore: TokenStore,
  lintConfig: LintConfig,
): Promise<LintViolation[]> {
  const allEntries = tokenStore.getAllFlatTokens();
  // Tokens for the target set only
  const flatTokens: Record<string, Token> = {};
  // All tokens for cross-set alias resolution
  const allFlatTokens: Record<string, Token> = {};
  for (const entry of allEntries) {
    allFlatTokens[entry.path] = entry.token;
    if (entry.setName === setName) {
      flatTokens[entry.path] = entry.token;
    }
  }

  const violations: LintViolation[] = [];
  const rules = lintConfig.lintRules;

  // --- no-raw-color ---
  const noRawColor = rules['no-raw-color'];
  if (noRawColor?.enabled) {
    const severity = noRawColor.severity ?? 'warning';
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      if (token.$type === 'color' && !isAlias(token.$value)) {
        const rawHex = token.$value as string;
        const nearest = findNearestColorAlias(rawHex, tokenPath, allFlatTokens);
        let suggestion: string | undefined;
        let hint = '';
        if (nearest && nearest.deltaE < 1) {
          suggestion = `{${nearest.path}}`;
          hint = ` Exact match: {${nearest.path}}`;
        } else if (nearest && nearest.deltaE < 5) {
          suggestion = `{${nearest.path}}`;
          hint = ` Close match: {${nearest.path}} (ΔE ${nearest.deltaE.toFixed(1)})`;
        }
        violations.push({
          rule: 'no-raw-color',
          path: tokenPath,
          severity,
          message: `Color token "${tokenPath}" uses a raw value "${rawHex}" instead of an alias.${hint}`,
          suggestedFix: 'extract-to-alias',
          suggestion,
        });
      }
    }
  }

  // --- require-description ---
  const requireDesc = rules['require-description'];
  if (requireDesc?.enabled) {
    const severity = requireDesc.severity ?? 'info';
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      if (!token.$description) {
        violations.push({
          rule: 'require-description',
          path: tokenPath,
          severity,
          message: `Token "${tokenPath}" is missing a $description.`,
          suggestedFix: 'add-description',
        });
      }
    }
  }

  // --- path-pattern ---
  const pathPattern = rules['path-pattern'];
  if (pathPattern?.enabled) {
    const pattern = (pathPattern.options?.pattern as string | undefined) ?? '^[a-z][a-z0-9]*([.-][a-z0-9]+)*$';
    const severity = pathPattern.severity ?? 'warning';
    let regex: RegExp | null = null;
    try {
      if (!isSafeRegex(pattern)) {
        throw new Error('Pattern is potentially unsafe (catastrophic backtracking)');
      }
      regex = new RegExp(pattern);
    } catch (err) {
      violations.push({
        rule: 'path-pattern',
        path: '',
        severity: 'error',
        message: `Invalid path-pattern regex "${pattern}": ${(err as Error).message}`,
      });
    }
    if (!regex) {
      // Skip path-pattern checks — the regex is invalid
    } else for (const tokenPath of Object.keys(flatTokens)) {
      // Test each segment
      const segments = tokenPath.split('.');
      for (const seg of segments) {
        if (!regex.test(seg)) {
          // Suggest a kebab-case version of the segment
          const suggested = seg
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/[^a-z0-9.-]+/gi, '-')
            .toLowerCase()
            .replace(/^-+|-+$/g, '');
          const suggestion = suggested && suggested !== seg ? suggested : undefined;
          const hint = suggestion ? ` Try "${suggestion}".` : '';
          violations.push({
            rule: 'path-pattern',
            path: tokenPath,
            severity,
            message: `Path segment "${seg}" in "${tokenPath}" does not match pattern ${pattern}.${hint}`,
            suggestedFix: 'rename-token',
            suggestion,
          });
          break;
        }
      }
    }
  }

  // --- max-alias-depth ---
  const maxAliasDepth = rules['max-alias-depth'];
  if (maxAliasDepth?.enabled) {
    const maxDepth = (maxAliasDepth.options?.maxDepth as number | undefined) ?? 3;
    const severity = maxAliasDepth.severity ?? 'warning';
    for (const [tokenPath] of Object.entries(flatTokens)) {
      const depth = getAliasDepth(tokenPath, allFlatTokens);
      if (depth > maxDepth) {
        const resolvedTarget = resolveAliasTarget(tokenPath, allFlatTokens);
        const suggestion = resolvedTarget && resolvedTarget !== tokenPath ? `{${resolvedTarget}}` : undefined;
        const hint = suggestion ? ` Point directly to ${suggestion} to flatten.` : '';
        violations.push({
          rule: 'max-alias-depth',
          path: tokenPath,
          severity,
          message: `Token "${tokenPath}" has alias depth ${depth} (max ${maxDepth}).${hint}`,
          suggestedFix: 'flatten-alias-chain',
          suggestion,
        });
      }
    }
  }

  // --- no-duplicate-values ---
  const noDuplicates = rules['no-duplicate-values'];
  if (noDuplicates?.enabled) {
    const severity = noDuplicates.severity ?? 'info';
    const valueMap = new Map<string, string[]>();
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      if (isAlias(token.$value)) continue; // aliases are expected to share values
      const key = `${token.$type ?? ''}:${serializeValue(token.$value)}`;
      if (!valueMap.has(key)) valueMap.set(key, []);
      valueMap.get(key)!.push(tokenPath);
    }
    for (const [, paths] of valueMap) {
      if (paths.length > 1) {
        // Suggest aliasing to the shortest-path token (likely the primitive)
        const sortedByLength = [...paths].sort((a, b) => a.length - b.length);
        const canonical = sortedByLength[0];
        for (const tokenPath of paths) {
          const others = paths.filter(p => p !== tokenPath);
          const aliasTarget = tokenPath === canonical ? sortedByLength[1] : canonical;
          violations.push({
            rule: 'no-duplicate-values',
            path: tokenPath,
            severity,
            message: `Token "${tokenPath}" has the same value as: ${others.join(', ')}. Consider aliasing to {${aliasTarget}}.`,
            suggestedFix: 'extract-to-alias',
            suggestion: `{${aliasTarget}}`,
          });
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Structural validation (broken aliases, circular refs, missing type, etc.)
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  severity: Severity;
  setName: string;
  path: string;
  rule: string;
  message: string;
  suggestedFix?: string;
  /** Concrete fix target — e.g. the alias path to use. */
  suggestion?: string;
}

function detectCycles(
  startPath: string,
  allTokens: Record<string, { token: Token; setName: string }>,
): string[] | null {
  const chain: string[] = [];
  const indexMap = new Map<string, number>(); // path → index in chain
  let current = startPath;
  while (true) {
    if (indexMap.has(current)) {
      const cycleStart = indexMap.get(current)!;
      const cycle = chain.slice(cycleStart);
      cycle.push(current); // close the loop: e.g. [a, b, c, a]
      return cycle;
    }
    const entry = allTokens[current];
    if (!entry || !isAlias(entry.token.$value)) return null;
    indexMap.set(current, chain.length);
    chain.push(current);
    current = (entry.token.$value as string).slice(1, -1);
  }
}

const TYPE_VALUE_CHECKS: Record<string, (v: unknown) => boolean> = {
  color: v => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v),
  number: v => typeof v === 'number',
  dimension: v => typeof v === 'object' && v !== null && 'value' in v && 'unit' in v,
  fontWeight: v => typeof v === 'number' || typeof v === 'string',
  string: v => typeof v === 'string',
  boolean: v => typeof v === 'boolean',
};

export async function validateAllTokens(tokenStore: TokenStore, config?: LintConfig): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  // Use the already-merged flat token map instead of rebuilding per-set
  const allTokensList = tokenStore.getAllFlatTokens();
  // Build keyed lookup for alias resolution and cycle detection
  const allTokensMap: Record<string, { token: Token; setName: string }> = {};
  for (const entry of allTokensList) {
    // Keep first entry per path for lookup (all sets have the path)
    if (!allTokensMap[entry.path]) {
      allTokensMap[entry.path] = { token: entry.token, setName: entry.setName };
    }
  }
  // Flat token map for alias resolution helpers
  const allFlatTokens: Record<string, Token> = Object.fromEntries(
    Object.entries(allTokensMap).map(([k, v]) => [k, v.token])
  );

  const cfg = config ?? DEFAULT_LINT_CONFIG;

  for (const { path: tokenPath, token, setName } of allTokensList) {
    // Missing $type
    if (!token.$type) {
      issues.push({
        severity: 'warning',
        setName,
        path: tokenPath,
        rule: 'missing-type',
        message: `Token is missing a $type declaration.`,
      });
    }

    // Alias checks
    if (isAlias(token.$value)) {
      const refPath = (token.$value as string).slice(1, -1);

      // Broken alias
      if (!allTokensMap[refPath]) {
        issues.push({
          severity: 'error',
          setName,
          path: tokenPath,
          rule: 'broken-alias',
          message: `Alias "${token.$value}" references non-existent token "${refPath}".`,
        });
      }

      // Circular reference
      const cycle = detectCycles(tokenPath, allTokensMap);
      if (cycle) {
        issues.push({
          severity: 'error',
          setName,
          path: tokenPath,
          rule: 'circular-reference',
          message: `Circular reference: ${cycle.join(' → ')}`,
        });
      }

      // Alias depth
      const maxAliasDepthRule = cfg.lintRules['max-alias-depth'];
      if (maxAliasDepthRule?.enabled !== false) {
        const maxDepth = (maxAliasDepthRule?.options?.maxDepth as number | undefined) ?? 3;
        const depth = getAliasDepth(tokenPath, allFlatTokens);
        if (depth > maxDepth) {
          const resolvedTarget = resolveAliasTarget(tokenPath, allFlatTokens);
          const suggestion = resolvedTarget && resolvedTarget !== tokenPath ? `{${resolvedTarget}}` : undefined;
          issues.push({
            severity: maxAliasDepthRule?.severity ?? 'warning',
            setName,
            path: tokenPath,
            rule: 'max-alias-depth',
            message: `Alias chain depth is ${depth} (recommended max: ${maxDepth}).${suggestion ? ` Point directly to ${suggestion} to flatten.` : ''}`,
            suggestedFix: 'flatten-alias-chain',
            suggestion,
          });
        }
      }
    } else if (token.$type && TYPE_VALUE_CHECKS[token.$type]) {
      // Value/type mismatch
      const check = TYPE_VALUE_CHECKS[token.$type];
      if (!check(token.$value)) {
        issues.push({
          severity: 'error',
          setName,
          path: tokenPath,
          rule: 'type-mismatch',
          message: `Value does not match declared type "${token.$type}".`,
        });
      }
    }

    // require-description
    const requireDescRule = cfg.lintRules['require-description'];
    if (requireDescRule?.enabled) {
      if (!token.$description) {
        issues.push({
          severity: requireDescRule.severity ?? 'info',
          setName,
          path: tokenPath,
          rule: 'require-description',
          message: `Token "${tokenPath}" is missing a $description.`,
          suggestedFix: 'add-description',
        });
      }
    }
  }

  // no-duplicate-values (needs all tokens seen first)
  const noDupRule = cfg.lintRules['no-duplicate-values'];
  if (noDupRule?.enabled) {
    const severity = noDupRule.severity ?? 'info';
    const valueMap = new Map<string, Array<{ path: string; setName: string }>>();
    for (const { path: tokenPath, token, setName } of allTokensList) {
      if (isAlias(token.$value)) continue;
      const key = `${token.$type ?? ''}:${serializeValue(token.$value)}`;
      if (!valueMap.has(key)) valueMap.set(key, []);
      valueMap.get(key)!.push({ path: tokenPath, setName });
    }
    for (const [, entries] of valueMap) {
      if (entries.length > 1) {
        const sortedByLength = [...entries].sort((a, b) => a.path.length - b.path.length);
        const canonical = sortedByLength[0].path;
        for (const { path: tokenPath, setName } of entries) {
          const others = entries.filter(e => e.path !== tokenPath).map(e => e.path);
          const aliasTarget = tokenPath === canonical ? sortedByLength[1].path : canonical;
          issues.push({
            severity,
            setName,
            path: tokenPath,
            rule: 'no-duplicate-values',
            message: `Token "${tokenPath}" has the same value as: ${others.join(', ')}. Consider aliasing to {${aliasTarget}}.`,
            suggestedFix: 'extract-to-alias',
            suggestion: `{${aliasTarget}}`,
          });
        }
      }
    }
  }

  return issues;
}
