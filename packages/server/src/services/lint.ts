import fs from 'node:fs/promises';
import path from 'node:path';
import { colorDeltaE, getTokenLifecycle, isReference, parseReference, type Token } from '@tokenmanager/core';
import { expectJsonObject, parseJsonFile } from '../utils/json-file.js';
import { isSafeRegex } from './token-tree-utils.js';
import { TokenStore } from './token-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warning' | 'info';

export interface LintRuleCollectionOverride {
  enabled?: boolean;
  severity?: Severity;
  options?: Record<string, unknown>;
}

export interface LintRuleConfig {
  enabled: boolean;
  severity?: Severity;
  /** rule-specific options */
  options?: Record<string, unknown>;
  /**
   * Exclude token paths matching these prefix patterns from this rule.
   * A pattern matches if the token path equals the pattern or starts with "<pattern>.".
   * Example: ["legacy", "internal.raw"] skips paths under the "legacy" and "internal.raw" groups.
   */
  excludePaths?: string[];
  /**
   * Per-collection overrides — merged with the global rule config when linting a specific collection.
   * Keyed by collection id. Unset fields fall back to the global values.
   * Example: { "internal": { enabled: false }, "brand-a": { severity: "error" } }
   */
  collectionOverrides?: Record<string, LintRuleCollectionOverride>;
}

export interface LintConfig {
  lintRules: {
    'no-raw-color'?: LintRuleConfig;
    'require-description'?: LintRuleConfig;
    'path-pattern'?: LintRuleConfig;
    'max-alias-depth'?: LintRuleConfig;
    'references-deprecated-token'?: LintRuleConfig;
    'no-duplicate-values'?: LintRuleConfig;
    'alias-opportunity'?: LintRuleConfig;
    'no-hardcoded-dimensions'?: LintRuleConfig;
    'require-alias-for-semantic-tokens'?: LintRuleConfig;
    'enforce-token-type-consistency'?: LintRuleConfig;
  };
  /** Server-persisted suppression keys shared across all team members. Format: "rule:collectionId:tokenPath" */
  suppressions?: string[];
}

export interface LintViolation {
  rule: string;
  path: string;
  severity: Severity;
  message: string;
  suggestedFix?: string;
  /** Concrete suggestion — e.g. the alias path to use, or a corrected name. */
  suggestion?: string;
  /** For no-duplicate-values: stable duplicate-group identifier shared by all tokens in the group. */
  group?: string;
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
    'references-deprecated-token': { enabled: true, severity: 'warning' },
    'no-duplicate-values': { enabled: true, severity: 'info' },
    'alias-opportunity': { enabled: true, severity: 'info' },
    'no-hardcoded-dimensions': { enabled: false, severity: 'warning' },
    'require-alias-for-semantic-tokens': { enabled: false, severity: 'warning' },
    'enforce-token-type-consistency': { enabled: false, severity: 'warning', options: { minGroupSize: 2 } },
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
        this.config = expectJsonObject(
          parseJsonFile(content, { filePath: this.configPath }),
          {
            filePath: this.configPath,
            expectation: 'contain a top-level lint config object',
          },
        ) as unknown as LintConfig;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          this.config = structuredClone(DEFAULT_LINT_CONFIG);
        } else {
          throw err;
        }
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

  async getSuppressions(): Promise<string[]> {
    const config = await this.load();
    return config.suppressions ?? [];
  }

  async setSuppressions(suppressions: string[]): Promise<void> {
    const config = await this.load();
    config.suppressions = suppressions;
    await this.save(config);
  }

  async reset(): Promise<void> {
    this.config = structuredClone(DEFAULT_LINT_CONFIG);
    await fs.rm(this.configPath, { force: true });
  }

  async renameCollectionId(
    oldCollectionId: string,
    newCollectionId: string,
  ): Promise<void> {
    const config = await this.load();

    for (const rule of Object.values(config.lintRules)) {
      if (!rule?.collectionOverrides?.[oldCollectionId]) {
        continue;
      }
      const override = rule.collectionOverrides[oldCollectionId];
      delete rule.collectionOverrides[oldCollectionId];
      rule.collectionOverrides[newCollectionId] = override;
    }

    if (Array.isArray(config.suppressions) && config.suppressions.length > 0) {
      config.suppressions = config.suppressions.map((suppression) => {
        const [rule, collectionId, ...pathParts] = suppression.split(":");
        if (collectionId !== oldCollectionId || pathParts.length === 0) {
          return suppression;
        }
        return [rule, newCollectionId, ...pathParts].join(":");
      });
    }

    await this.save(config);
  }

  async deleteCollectionId(collectionId: string): Promise<void> {
    const config = await this.load();

    for (const rule of Object.values(config.lintRules)) {
      if (rule?.collectionOverrides?.[collectionId]) {
        delete rule.collectionOverrides[collectionId];
      }
    }

    if (Array.isArray(config.suppressions) && config.suppressions.length > 0) {
      config.suppressions = config.suppressions.filter((suppression) => {
        const [, suppressionCollectionId] = suppression.split(":");
        return suppressionCollectionId !== collectionId;
      });
    }

    await this.save(config);
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
    if (isReference(candidateToken.$value)) continue;
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
  if (!isReference(token.$value)) return path;
  visited.add(path);
  return resolveAliasTarget(parseReference(token.$value as string), flatTokens, visited);
}

function findDeprecatedAliasTarget(
  path: string,
  flatTokens: Record<string, Token>,
  visited = new Set<string>(),
): string | null {
  if (visited.has(path)) return null;
  const token = flatTokens[path];
  if (!token || !isReference(token.$value)) return null;

  visited.add(path);
  const referencedPath = parseReference(token.$value as string);
  const referencedToken = flatTokens[referencedPath];
  if (!referencedToken) return null;
  if (getTokenLifecycle(referencedToken) === 'deprecated') {
    return referencedPath;
  }
  return findDeprecatedAliasTarget(referencedPath, flatTokens, visited);
}

// ---------------------------------------------------------------------------
// Scope filter helpers
// ---------------------------------------------------------------------------

/**
 * Merge a global rule config with its per-collection override (if any), returning
 * the effective config for the given collection id.
 */
function resolveRuleForCollection(rule: LintRuleConfig, collectionId: string): LintRuleConfig {
  const override = rule.collectionOverrides?.[collectionId];
  if (!override) return rule;
  return {
    ...rule,
    enabled: override.enabled ?? rule.enabled,
    severity: override.severity ?? rule.severity,
    options: override.options ? { ...rule.options, ...override.options } : rule.options,
  };
}

/**
 * Returns true if the token path should be excluded by the rule's excludePaths list.
 * A pattern matches if tokenPath === pattern or tokenPath starts with "<pattern>.".
 */
function isPathExcluded(tokenPath: string, excludePaths: string[] | undefined): boolean {
  if (!excludePaths || excludePaths.length === 0) return false;
  return excludePaths.some(p => tokenPath === p || tokenPath.startsWith(p + '.'));
}

// ---------------------------------------------------------------------------
// Rules engine
// ---------------------------------------------------------------------------

function getAliasDepth(path: string, flatTokens: Record<string, Token>, visited = new Set<string>()): number {
  if (visited.has(path)) return 0; // cycle — do not recurse
  const token = flatTokens[path];
  if (!token || !isReference(token.$value)) return 0;
  const refPath = parseReference(token.$value as string);
  visited.add(path);
  return 1 + getAliasDepth(refPath, flatTokens, visited);
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

interface DuplicateGroupEntry {
  path: string;
  collectionId: string;
  severity?: Severity;
}

function formatDuplicateEntryLabel(entry: DuplicateGroupEntry, includeCollectionId: boolean): string {
  return includeCollectionId ? `${entry.path} (${entry.collectionId})` : entry.path;
}

function formatDuplicatePeerSummary(entries: DuplicateGroupEntry[], current: DuplicateGroupEntry): string {
  const includeCollectionId = new Set(entries.map(entry => entry.collectionId)).size > 1;
  const peers = entries
    .filter(entry => !(entry.path === current.path && entry.collectionId === current.collectionId))
    .map(entry => formatDuplicateEntryLabel(entry, includeCollectionId));

  if (peers.length <= 3) {
    return peers.join(', ');
  }

  return `${peers.slice(0, 3).join(', ')}, and ${peers.length - 3} more`;
}

function buildDuplicateGroupId(entries: DuplicateGroupEntry[]): string {
  const stableKeys = entries
    .map(entry => `${entry.collectionId}:${entry.path}`)
    .sort((a, b) => a.localeCompare(b));
  return JSON.stringify(stableKeys);
}

function buildRawValueGroupKey(token: Token): string | null {
  if (isReference(token.$value)) return null;
  return `${token.$type ?? ''}:${serializeValue(token.$value)}`;
}

interface WorkspaceRawValueEntry extends DuplicateGroupEntry {
  token: Token;
  severity: Severity;
}

function collectWorkspaceRawValueGroups(
  allEntries: Array<{ path: string; collectionId: string; token: Token }>,
  resolveEntrySeverity: (entry: {
    path: string;
    collectionId: string;
    token: Token;
  }) => Severity | null,
): WorkspaceRawValueEntry[][] {
  const groups = new Map<string, WorkspaceRawValueEntry[]>();

  for (const entry of allEntries) {
    const severity = resolveEntrySeverity(entry);
    if (!severity) continue;
    const groupKey = buildRawValueGroupKey(entry.token);
    if (!groupKey) continue;
    const nextEntry: WorkspaceRawValueEntry = {
      path: entry.path,
      collectionId: entry.collectionId,
      token: entry.token,
      severity,
    };
    const existing = groups.get(groupKey);
    if (existing) {
      existing.push(nextEntry);
      continue;
    }
    groups.set(groupKey, [nextEntry]);
  }

  return [...groups.values()].filter(entries => entries.length > 1);
}

export async function lintTokens(
  collectionId: string,
  tokenStore: TokenStore,
  lintConfig: LintConfig,
): Promise<LintViolation[]> {
  const allEntries = tokenStore.getAllFlatTokens();
  // Tokens for the target collection only
  const flatTokens: Record<string, Token> = {};
  // All tokens for cross-collection alias resolution
  const allFlatTokens: Record<string, Token> = {};
  for (const entry of allEntries) {
    allFlatTokens[entry.path] = entry.token;
    if (entry.collectionId === collectionId) {
      flatTokens[entry.path] = entry.token;
    }
  }

  const violations: LintViolation[] = [];
  const rules = lintConfig.lintRules;

  // --- no-raw-color ---
  const noRawColor = rules['no-raw-color'] ? resolveRuleForCollection(rules['no-raw-color'], collectionId) : undefined;
  if (noRawColor?.enabled) {
    const severity = noRawColor.severity ?? 'warning';
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      if (isPathExcluded(tokenPath, noRawColor.excludePaths)) continue;
      if (token.$type === 'color' && !isReference(token.$value)) {
        const rawHex = String(token.$value);
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
  const requireDesc = rules['require-description'] ? resolveRuleForCollection(rules['require-description'], collectionId) : undefined;
  if (requireDesc?.enabled) {
    const severity = requireDesc.severity ?? 'info';
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      if (isPathExcluded(tokenPath, requireDesc.excludePaths)) continue;
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
  const pathPattern = rules['path-pattern'] ? resolveRuleForCollection(rules['path-pattern'], collectionId) : undefined;
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
      if (isPathExcluded(tokenPath, pathPattern.excludePaths)) continue;
      // Test each segment
      const segments = tokenPath.split('.');
      for (let idx = 0; idx < segments.length; idx++) {
        const seg = segments[idx];
        if (!regex.test(seg)) {
          // Suggest a kebab-case version of the segment
          const suggested = seg
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/[^a-z0-9.-]+/gi, '-')
            .toLowerCase()
            .replace(/^-+|-+$/g, '');
          // suggestion is the full corrected path (not just the segment) so callers can rename directly
          const suggestedSeg = suggested && suggested !== seg ? suggested : undefined;
          const suggestedPath = suggestedSeg
            ? segments.map((s, i) => (i === idx ? suggestedSeg : s)).join('.')
            : undefined;
          const hint = suggestedSeg ? ` Try "${suggestedSeg}".` : '';
          violations.push({
            rule: 'path-pattern',
            path: tokenPath,
            severity,
            message: `Path segment "${seg}" in "${tokenPath}" does not match pattern ${pattern}.${hint}`,
            suggestedFix: 'rename-token',
            suggestion: suggestedPath,
          });
          break;
        }
      }
    }
  }

  // --- max-alias-depth ---
  const maxAliasDepth = rules['max-alias-depth'] ? resolveRuleForCollection(rules['max-alias-depth'], collectionId) : undefined;
  if (maxAliasDepth?.enabled) {
    const maxDepth = (maxAliasDepth.options?.maxDepth as number | undefined) ?? 3;
    const severity = maxAliasDepth.severity ?? 'warning';
    for (const [tokenPath] of Object.entries(flatTokens)) {
      if (isPathExcluded(tokenPath, maxAliasDepth.excludePaths)) continue;
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

  // --- references-deprecated-token ---
  const referencesDeprecatedToken = rules['references-deprecated-token']
    ? resolveRuleForCollection(rules['references-deprecated-token'], collectionId)
    : undefined;
  if (referencesDeprecatedToken?.enabled) {
    const severity = referencesDeprecatedToken.severity ?? 'warning';
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      if (isPathExcluded(tokenPath, referencesDeprecatedToken.excludePaths)) continue;
      if (getTokenLifecycle(token) === 'deprecated') continue;
      const deprecatedPath = findDeprecatedAliasTarget(tokenPath, allFlatTokens);
      if (!deprecatedPath) continue;
      violations.push({
        rule: 'references-deprecated-token',
        path: tokenPath,
        severity,
        message: `Token "${tokenPath}" references deprecated token "{${deprecatedPath}}" in its alias chain.`,
        suggestedFix: 'replace-deprecated-reference',
        suggestion: deprecatedPath,
      });
    }
  }

  // --- no-duplicate-values ---
  const duplicateGroups = collectWorkspaceRawValueGroups(
    allEntries,
    entry => {
      const rule = rules['no-duplicate-values']
        ? resolveRuleForCollection(rules['no-duplicate-values'], entry.collectionId)
        : undefined;
      if (!rule?.enabled) return null;
      if (isPathExcluded(entry.path, rule.excludePaths)) return null;
      return rule.severity ?? 'info';
    },
  );
  for (const groupEntries of duplicateGroups) {
    const groupId = buildDuplicateGroupId(groupEntries);
    for (const entry of groupEntries) {
      if (entry.collectionId !== collectionId) continue;
      const peers = formatDuplicatePeerSummary(groupEntries, entry);
      violations.push({
        rule: 'no-duplicate-values',
        path: entry.path,
        severity: entry.severity,
        message: `Token "${entry.path}" shares the same direct value as ${peers}. Choose one canonical token before converting the rest to aliases.`,
        group: groupId,
      });
    }
  }

  // --- alias-opportunity ---
  const aliasOpportunityGroups = collectWorkspaceRawValueGroups(
    allEntries,
    entry => {
      const rule = rules['alias-opportunity']
        ? resolveRuleForCollection(rules['alias-opportunity'], entry.collectionId)
        : undefined;
      if (!rule?.enabled) return null;
      if (isPathExcluded(entry.path, rule.excludePaths)) return null;
      return rule.severity ?? 'info';
    },
  );
  for (const groupEntries of aliasOpportunityGroups) {
    const groupId = buildDuplicateGroupId(groupEntries);
    const includeCollectionId = new Set(groupEntries.map(entry => entry.collectionId)).size > 1;
    const tokenLabels = groupEntries
      .map(entry => formatDuplicateEntryLabel(entry, includeCollectionId))
      .sort((a, b) => a.localeCompare(b));
    const labelSummary = tokenLabels.length <= 3
      ? tokenLabels.join(', ')
      : `${tokenLabels.slice(0, 3).join(', ')}, and ${tokenLabels.length - 3} more`;

    for (const entry of groupEntries) {
      if (entry.collectionId !== collectionId) continue;
      violations.push({
        rule: 'alias-opportunity',
        path: entry.path,
        severity: entry.severity,
        message: `Raw-value group "${labelSummary}" can be promoted into one shared alias token.`,
        suggestedFix: 'promote-to-shared-alias',
        group: groupId,
      });
    }
  }

  // --- no-hardcoded-dimensions ---
  const noHardcodedDims = rules['no-hardcoded-dimensions'] ? resolveRuleForCollection(rules['no-hardcoded-dimensions'], collectionId) : undefined;
  if (noHardcodedDims?.enabled) {
    const severity = noHardcodedDims.severity ?? 'warning';
    const types = (noHardcodedDims.options?.types as string[] | undefined) ?? ['dimension', 'number'];
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      if (isPathExcluded(tokenPath, noHardcodedDims.excludePaths)) continue;
      if (!token.$type || !types.includes(token.$type)) continue;
      if (isReference(token.$value)) continue;
      // Look for an existing raw token with the same value to suggest as alias target
      const rawVal = token.$value;
      let suggestion: string | undefined;
      for (const [candidatePath, candidateToken] of Object.entries(allFlatTokens)) {
        if (candidatePath === tokenPath) continue;
        if (candidateToken.$type !== token.$type) continue;
        if (isReference(candidateToken.$value)) continue;
        if (serializeValue(candidateToken.$value) === serializeValue(rawVal)) {
          if (!suggestion || candidatePath.length < suggestion.length) {
            suggestion = candidatePath;
          }
        }
      }
      const hint = suggestion ? ` Consider aliasing to {${suggestion}}.` : '';
      violations.push({
        rule: 'no-hardcoded-dimensions',
        path: tokenPath,
        severity,
        message: `Token "${tokenPath}" (${token.$type}) uses a raw value instead of an alias.${hint}`,
        suggestedFix: 'extract-to-alias',
        suggestion: suggestion ? `{${suggestion}}` : undefined,
      });
    }
  }

  // --- require-alias-for-semantic-tokens ---
  const requireAliasSemantic = rules['require-alias-for-semantic-tokens'] ? resolveRuleForCollection(rules['require-alias-for-semantic-tokens'], collectionId) : undefined;
  if (requireAliasSemantic?.enabled) {
    const severity = requireAliasSemantic.severity ?? 'warning';
    const rawPrefixes = requireAliasSemantic.options?.semanticPrefixes;
    const semanticPrefixes: string[] = Array.isArray(rawPrefixes)
      ? rawPrefixes as string[]
      : typeof rawPrefixes === 'string' && rawPrefixes.trim()
        ? rawPrefixes.split(',').map(s => s.trim()).filter(Boolean)
        : ['semantic', 'component', 'alias'];
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      if (isPathExcluded(tokenPath, requireAliasSemantic.excludePaths)) continue;
      const isSemanticPath = semanticPrefixes.some(
        prefix => tokenPath === prefix || tokenPath.startsWith(prefix + '.'),
      );
      if (!isSemanticPath) continue;
      if (isReference(token.$value)) continue;
      violations.push({
        rule: 'require-alias-for-semantic-tokens',
        path: tokenPath,
        severity,
        message: `Semantic token "${tokenPath}" uses a raw value. Semantic tokens should reference primitive tokens via aliases.`,
        suggestedFix: 'extract-to-alias',
      });
    }
  }

  // --- enforce-token-type-consistency ---
  const enforceTypeConsistency = rules['enforce-token-type-consistency'] ? resolveRuleForCollection(rules['enforce-token-type-consistency'], collectionId) : undefined;
  if (enforceTypeConsistency?.enabled) {
    const severity = enforceTypeConsistency.severity ?? 'warning';
    const minGroupSize = (enforceTypeConsistency.options?.minGroupSize as number | undefined) ?? 2;
    // Group tokens by immediate parent path
    const groupMap = new Map<string, Array<{ path: string; type: string | undefined }>>();
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      if (isPathExcluded(tokenPath, enforceTypeConsistency.excludePaths)) continue;
      const lastDot = tokenPath.lastIndexOf('.');
      if (lastDot === -1) continue; // top-level tokens have no group
      const parentPath = tokenPath.slice(0, lastDot);
      if (!groupMap.has(parentPath)) groupMap.set(parentPath, []);
      groupMap.get(parentPath)!.push({ path: tokenPath, type: token.$type });
    }
    for (const [groupPath, members] of groupMap) {
      if (members.length < minGroupSize) continue;
      // Count types (skip untyped tokens)
      const typeCounts = new Map<string, number>();
      for (const { type } of members) {
        if (!type) continue;
        typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      }
      if (typeCounts.size <= 1) continue; // all same type — no issue
      // Find majority type
      let majorityType = '';
      let maxCount = 0;
      for (const [type, count] of typeCounts) {
        if (count > maxCount) { maxCount = count; majorityType = type; }
      }
      // Flag minority-type tokens
      for (const { path: tokenPath, type } of members) {
        if (!type || type === majorityType) continue;
        violations.push({
          rule: 'enforce-token-type-consistency',
          path: tokenPath,
          severity,
          message: `Token "${tokenPath}" has type "${type}" but most tokens in group "${groupPath}" are "${majorityType}".`,
          suggestedFix: 'fix-type',
          suggestion: majorityType,
        });
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
  collectionId: string;
  path: string;
  rule: string;
  message: string;
  suggestedFix?: string;
  /** Concrete fix target — e.g. the alias path to use. */
  suggestion?: string;
  /** For no-duplicate-values: stable duplicate-group identifier shared by all tokens in the group. */
  group?: string;
}

function detectCycles(
  startPath: string,
  allTokens: Record<string, { token: Token; collectionId: string }>,
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
    if (!entry || !isReference(entry.token.$value)) return null;
    indexMap.set(current, chain.length);
    chain.push(current);
    current = parseReference(entry.token.$value as string);
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

/** Guess the most appropriate DTCG type from a raw value. Returns undefined if ambiguous. */
function inferTypeFromValue(v: unknown): string | undefined {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') {
    if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return 'color';
    return 'string';
  }
  if (typeof v === 'object' && v !== null && 'value' in v && 'unit' in v) return 'dimension';
  return undefined;
}

export async function validateAllTokens(tokenStore: TokenStore, config?: LintConfig): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  // Use the already-merged flat token map instead of rebuilding per-collection
  const allTokensList = tokenStore.getAllFlatTokens();
  // Build keyed lookup for alias resolution and cycle detection
  const allTokensMap: Record<string, { token: Token; collectionId: string }> = {};
  for (const entry of allTokensList) {
    // Keep first entry per path for lookup (all collections have the path)
    if (!allTokensMap[entry.path]) {
      allTokensMap[entry.path] = { token: entry.token, collectionId: entry.collectionId };
    }
  }
  // Flat token map for alias resolution helpers
  const allFlatTokens: Record<string, Token> = Object.fromEntries(
    Object.entries(allTokensMap).map(([k, v]) => [k, v.token])
  );

  const cfg = config ?? DEFAULT_LINT_CONFIG;

  for (const { path: tokenPath, token, collectionId } of allTokensList) {
    // Missing $type
    if (!token.$type) {
        issues.push({
          severity: 'warning',
          collectionId,
          path: tokenPath,
        rule: 'missing-type',
        message: `Token is missing a $type declaration.`,
      });
    }

    // Alias checks
    if (isReference(token.$value)) {
      const refPath = parseReference(token.$value as string);

      // Broken alias
      if (!allTokensMap[refPath]) {
        issues.push({
          severity: 'error',
          collectionId,
          path: tokenPath,
          rule: 'broken-alias',
          message: `Alias "${token.$value}" references non-existent token "${refPath}".`,
          suggestedFix: 'delete-token',
        });
      }

      // Circular reference
      const cycle = detectCycles(tokenPath, allTokensMap);
      if (cycle) {
        issues.push({
          severity: 'error',
          collectionId,
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
            collectionId,
            path: tokenPath,
            rule: 'max-alias-depth',
            message: `Alias chain depth is ${depth} (recommended max: ${maxDepth}).${suggestion ? ` Point directly to ${suggestion} to flatten.` : ''}`,
            suggestedFix: 'flatten-alias-chain',
            suggestion,
          });
        }
      }

      const referencesDeprecatedRule = cfg.lintRules['references-deprecated-token']
        ? resolveRuleForCollection(cfg.lintRules['references-deprecated-token'], collectionId)
        : undefined;
      if (
        referencesDeprecatedRule?.enabled &&
        !isPathExcluded(tokenPath, referencesDeprecatedRule.excludePaths) &&
        getTokenLifecycle(token) !== 'deprecated'
      ) {
        const deprecatedPath = findDeprecatedAliasTarget(tokenPath, allFlatTokens);
        if (deprecatedPath) {
          issues.push({
            severity: referencesDeprecatedRule.severity ?? 'warning',
            collectionId,
            path: tokenPath,
            rule: 'references-deprecated-token',
            message: `Token "${tokenPath}" references deprecated token "{${deprecatedPath}}" in its alias chain.`,
            suggestedFix: 'replace-deprecated-reference',
            suggestion: deprecatedPath,
          });
        }
      }
    } else if (token.$type && TYPE_VALUE_CHECKS[token.$type]) {
      // Value/type mismatch
      const check = TYPE_VALUE_CHECKS[token.$type];
      if (!check(token.$value)) {
        const inferredType = inferTypeFromValue(token.$value);
        issues.push({
          severity: 'error',
          collectionId,
          path: tokenPath,
          rule: 'type-mismatch',
          message: `Value does not match declared type "${token.$type}".`,
          suggestedFix: 'fix-type',
          suggestion: inferredType,
        });
      }
    }

    // require-description
    const requireDescRule = cfg.lintRules['require-description'];
    if (requireDescRule?.enabled) {
      if (!token.$description) {
        issues.push({
          severity: requireDescRule.severity ?? 'info',
          collectionId,
          path: tokenPath,
          rule: 'require-description',
          message: `Token "${tokenPath}" is missing a $description.`,
          suggestedFix: 'add-description',
        });
      }
    }
  }

  // no-duplicate-values (needs all tokens seen first)
  const duplicateGroups = collectWorkspaceRawValueGroups(
    allTokensList,
    entry => {
      const rule = cfg.lintRules['no-duplicate-values']
        ? resolveRuleForCollection(cfg.lintRules['no-duplicate-values'], entry.collectionId)
        : undefined;
      if (!rule?.enabled) return null;
      if (isPathExcluded(entry.path, rule.excludePaths)) return null;
      return rule.severity ?? 'info';
    },
  );
  for (const entries of duplicateGroups) {
    const groupId = buildDuplicateGroupId(entries);
    for (const entry of entries) {
      const peers = formatDuplicatePeerSummary(entries, entry);
      issues.push({
        severity: entry.severity,
        collectionId: entry.collectionId,
        path: entry.path,
        rule: 'no-duplicate-values',
        message: `Token "${entry.path}" shares the same direct value as ${peers}. Choose one canonical token before converting the rest to aliases.`,
        group: groupId,
      });
    }
  }

  const aliasOpportunityGroups = collectWorkspaceRawValueGroups(
    allTokensList,
    entry => {
      const rule = cfg.lintRules['alias-opportunity']
        ? resolveRuleForCollection(cfg.lintRules['alias-opportunity'], entry.collectionId)
        : undefined;
      if (!rule?.enabled) return null;
      if (isPathExcluded(entry.path, rule.excludePaths)) return null;
      return rule.severity ?? 'info';
    },
  );
  for (const entries of aliasOpportunityGroups) {
    const groupId = buildDuplicateGroupId(entries);
    const includeCollectionId = new Set(entries.map(entry => entry.collectionId)).size > 1;
    const tokenLabels = entries
      .map(entry => formatDuplicateEntryLabel(entry, includeCollectionId))
      .sort((a, b) => a.localeCompare(b));
    const labelSummary = tokenLabels.length <= 3
      ? tokenLabels.join(', ')
      : `${tokenLabels.slice(0, 3).join(', ')}, and ${tokenLabels.length - 3} more`;

    for (const entry of entries) {
      issues.push({
        severity: entry.severity,
        collectionId: entry.collectionId,
        path: entry.path,
        rule: 'alias-opportunity',
        message: `Raw-value group "${labelSummary}" can be promoted into one shared alias token.`,
        suggestedFix: 'promote-to-shared-alias',
        group: groupId,
      });
    }
  }

  // Filter out server-persisted suppressions. Format: "rule:collectionId:tokenPath"
  const suppressionSet = new Set(cfg.suppressions ?? []);
  if (suppressionSet.size === 0) return issues;
  return issues.filter(i => !suppressionSet.has(`${i.rule}:${i.collectionId}:${i.path}`));
}
