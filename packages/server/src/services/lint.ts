import fs from 'node:fs/promises';
import path from 'node:path';
import type { Token } from '@tokenmanager/core';
import { TokenStore } from './token-store.js';

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
    if (this.config) return this.config;
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content) as LintConfig;
    } catch {
      this.config = { ...DEFAULT_LINT_CONFIG };
    }
    return this.config;
  }

  async save(config: LintConfig): Promise<void> {
    this.config = config;
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
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
  const flatTokens = await tokenStore.getFlatTokensForSet(setName);
  const allFlatTokens: Record<string, Token> = {};
  // Build all tokens map for alias resolution
  for (const s of await tokenStore.getSets()) {
    const setTokens = await tokenStore.getFlatTokensForSet(s);
    Object.assign(allFlatTokens, setTokens);
  }

  const violations: LintViolation[] = [];
  const rules = lintConfig.lintRules;

  // --- no-raw-color ---
  const noRawColor = rules['no-raw-color'];
  if (noRawColor?.enabled) {
    const severity = noRawColor.severity ?? 'warning';
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      if (token.$type === 'color' && !isAlias(token.$value)) {
        violations.push({
          rule: 'no-raw-color',
          path: tokenPath,
          severity,
          message: `Color token "${tokenPath}" uses a raw value "${token.$value}" instead of an alias.`,
          suggestedFix: 'extract-to-alias',
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
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      regex = /^[a-z][a-z0-9]*([.-][a-z0-9]+)*$/;
    }
    for (const tokenPath of Object.keys(flatTokens)) {
      // Test each segment
      const segments = tokenPath.split('.');
      for (const seg of segments) {
        if (!regex.test(seg)) {
          violations.push({
            rule: 'path-pattern',
            path: tokenPath,
            severity,
            message: `Path segment "${seg}" in "${tokenPath}" does not match pattern ${pattern}.`,
            suggestedFix: 'rename-token',
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
        violations.push({
          rule: 'max-alias-depth',
          path: tokenPath,
          severity,
          message: `Token "${tokenPath}" has alias depth ${depth} (max ${maxDepth}).`,
          suggestedFix: 'flatten-alias-chain',
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
        for (const tokenPath of paths) {
          violations.push({
            rule: 'no-duplicate-values',
            path: tokenPath,
            severity,
            message: `Token "${tokenPath}" has the same value as: ${paths.filter(p => p !== tokenPath).join(', ')}.`,
            suggestedFix: 'extract-to-alias',
          });
        }
      }
    }
  }

  return violations;
}
