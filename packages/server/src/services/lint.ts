import fs from 'node:fs/promises';
import path from 'node:path';
import {
  collectTokenReferencePaths,
  colorDeltaE,
  getTokenLifecycle,
  isReference,
  parseReference,
  readTokenCollectionModeValues,
  resolveCollectionIdForPath,
  type Token,
} from '@token-workshop/core';
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
   * Example: ["internal.raw"] skips paths under the "internal.raw" group.
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
  /** Server-persisted suppression keys shared across all team members. Format: JSON string [rule, collectionId, tokenPath]. */
  suppressions?: string[];
}

export interface LintViolation {
  rule: string;
  path: string;
  collectionId: string;
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

function serializeSuppressionKey(
  rule: string,
  collectionId: string,
  path: string,
): string {
  return JSON.stringify([rule, collectionId, path]);
}

function parseSuppressionKey(
  key: string,
): { rule: string; collectionId: string; path: string } | null {
  try {
    const parsed = JSON.parse(key) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 3) {
      return null;
    }

    const [rule, collectionId, path] = parsed;
    if (
      typeof rule !== 'string' ||
      rule.length === 0 ||
      typeof collectionId !== 'string' ||
      collectionId.length === 0 ||
      typeof path !== 'string' ||
      path.length === 0
    ) {
      return null;
    }

    return { rule, collectionId, path };
  } catch {
    return null;
  }
}

function canonicalizeSuppressionKey(key: string): string | null {
  const parsed = parseSuppressionKey(key);
  if (!parsed) {
    return null;
  }
  return serializeSuppressionKey(parsed.rule, parsed.collectionId, parsed.path);
}

export function normalizeSuppressionKeys(
  suppressions: readonly unknown[] | undefined,
): string[] {
  if (!Array.isArray(suppressions) || suppressions.length === 0) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const suppression of suppressions) {
    if (typeof suppression !== 'string') {
      continue;
    }

    const canonical = canonicalizeSuppressionKey(suppression);
    if (!canonical || seen.has(canonical)) {
      continue;
    }

    seen.add(canonical);
    normalized.push(canonical);
  }

  return normalized;
}

function normalizeLintConfig(config: LintConfig): LintConfig {
  return {
    ...config,
    suppressions: normalizeSuppressionKeys(config.suppressions),
  };
}

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
        const parsedConfig = expectJsonObject(
          parseJsonFile(content, { filePath: this.configPath }),
          {
            filePath: this.configPath,
            expectation: 'contain a top-level lint config object',
          },
        ) as unknown as LintConfig;
        this.config = normalizeLintConfig(parsedConfig);
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
    const normalizedConfig = normalizeLintConfig(config);
    this.config = structuredClone(normalizedConfig);
    const tmp = `${this.configPath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(normalizedConfig, null, 2));
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
    return normalizeSuppressionKeys(config.suppressions);
  }

  async setSuppressions(suppressions: string[]): Promise<void> {
    const config = await this.load();
    config.suppressions = normalizeSuppressionKeys(suppressions);
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
        const parsed = parseSuppressionKey(suppression);
        if (!parsed || parsed.collectionId !== oldCollectionId) {
          return suppression;
        }
        return serializeSuppressionKey(
          parsed.rule,
          newCollectionId,
          parsed.path,
        );
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
        return parseSuppressionKey(suppression)?.collectionId !== collectionId;
      });
    }

    await this.save(config);
  }
}

interface WorkspaceTokenEntry {
  path: string;
  collectionId: string;
  token: Token;
}

interface WorkspaceTokenIndex {
  flatTokensByCollection: Record<string, Record<string, Token>>;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
}

interface ResolvedWorkspaceToken {
  path: string;
  collectionId: string;
  token: Token;
}

interface DirectAliasTarget {
  modeName: string | null;
  refPath: string;
}

interface AliasDepthViolationDetail {
  modeName: string | null;
  depth: number;
  resolvedTarget: string | null;
}

interface DeprecatedAliasViolationDetail {
  modeName: string | null;
  deprecatedPath: string;
}

function buildWorkspaceTokenIndex(entries: WorkspaceTokenEntry[]): WorkspaceTokenIndex {
  const flatTokensByCollection: Record<string, Record<string, Token>> = {};
  const pathToCollectionId: Record<string, string> = {};
  const collectionIdsByPath: Record<string, string[]> = {};

  for (const entry of entries) {
    const collectionTokens = flatTokensByCollection[entry.collectionId] ?? {};
    collectionTokens[entry.path] = entry.token;
    flatTokensByCollection[entry.collectionId] = collectionTokens;

    if (!pathToCollectionId[entry.path]) {
      pathToCollectionId[entry.path] = entry.collectionId;
    }

    const collectionIds = collectionIdsByPath[entry.path] ?? [];
    if (!collectionIds.includes(entry.collectionId)) {
      collectionIds.push(entry.collectionId);
      collectionIdsByPath[entry.path] = collectionIds;
    }
  }

  return {
    flatTokensByCollection,
    pathToCollectionId,
    collectionIdsByPath,
  };
}

function resolveWorkspaceToken(
  tokenPath: string,
  preferredCollectionId: string,
  workspace: WorkspaceTokenIndex,
): ResolvedWorkspaceToken | null {
  const resolution = resolveCollectionIdForPath({
    path: tokenPath,
    preferredCollectionId,
    pathToCollectionId: workspace.pathToCollectionId,
    collectionIdsByPath: workspace.collectionIdsByPath,
  });
  if (!resolution.collectionId) {
    return null;
  }

  const token =
    workspace.flatTokensByCollection[resolution.collectionId]?.[tokenPath];
  if (!token) {
    return null;
  }

  return {
    path: tokenPath,
    collectionId: resolution.collectionId,
    token,
  };
}

function readModeScopedTokenValue(
  token: Token,
  collectionId: string,
  modeName: string | null,
): unknown {
  if (!modeName) {
    return token.$value;
  }

  const collectionModes = readTokenCollectionModeValues(token)[collectionId];
  return collectionModes &&
    Object.prototype.hasOwnProperty.call(collectionModes, modeName)
    ? collectionModes[modeName]
    : undefined;
}

function readDirectAliasTargets(
  token: Token,
  collectionId: string,
): DirectAliasTarget[] {
  const targets: DirectAliasTarget[] = [];

  const pushTarget = (modeName: string | null, value: unknown) => {
    if (!isReference(value)) {
      return;
    }
    targets.push({
      modeName,
      refPath: parseReference(value),
    });
  };

  pushTarget(null, token.$value);
  for (const [modeName, value] of Object.entries(
    readTokenCollectionModeValues(token)[collectionId] ?? {},
  )) {
    pushTarget(modeName, value);
  }

  return targets;
}

function readAliasTargetForMode(
  token: Token,
  collectionId: string,
  modeName: string | null,
): string | null {
  const value = readModeScopedTokenValue(token, collectionId, modeName);
  return isReference(value) ? parseReference(value) : null;
}

function resolveAliasTarget(
  tokenPath: string,
  collectionId: string,
  workspace: WorkspaceTokenIndex,
  modeName: string | null,
  visited = new Set<string>(),
): string | null {
  const token = workspace.flatTokensByCollection[collectionId]?.[tokenPath];
  if (!token) {
    return null;
  }

  const visitKey = `${collectionId}::${tokenPath}::${modeName ?? '__default__'}`;
  if (visited.has(visitKey)) {
    return null;
  }

  const nextPath = readAliasTargetForMode(token, collectionId, modeName);
  if (!nextPath) {
    return tokenPath;
  }

  visited.add(visitKey);
  const target = resolveWorkspaceToken(nextPath, collectionId, workspace);
  if (!target) {
    return null;
  }

  return resolveAliasTarget(
    nextPath,
    target.collectionId,
    workspace,
    modeName,
    visited,
  );
}

function findDeprecatedAliasTarget(
  tokenPath: string,
  collectionId: string,
  workspace: WorkspaceTokenIndex,
  modeName: string | null,
  visited = new Set<string>(),
): string | null {
  const token = workspace.flatTokensByCollection[collectionId]?.[tokenPath];
  if (!token) {
    return null;
  }

  const visitKey = `${collectionId}::${tokenPath}::${modeName ?? '__default__'}`;
  if (visited.has(visitKey)) {
    return null;
  }

  const nextPath = readAliasTargetForMode(token, collectionId, modeName);
  if (!nextPath) {
    return null;
  }

  visited.add(visitKey);
  const target = resolveWorkspaceToken(nextPath, collectionId, workspace);
  if (!target) {
    return null;
  }
  if (getTokenLifecycle(target.token) === 'deprecated') {
    return nextPath;
  }

  return findDeprecatedAliasTarget(
    nextPath,
    target.collectionId,
    workspace,
    modeName,
    visited,
  );
}

/** Find the closest alias color token to the given raw hex value. */
function findNearestColorAlias(
  rawHex: string,
  tokenPath: string,
  collectionId: string,
  allEntries: WorkspaceTokenEntry[],
): { path: string; deltaE: number } | null {
  let best: { path: string; deltaE: number } | null = null;
  for (const entry of allEntries) {
    if (entry.path === tokenPath && entry.collectionId === collectionId) continue;
    const candidatePath = entry.path;
    const candidateToken = entry.token;
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

function getAliasDepth(
  tokenPath: string,
  collectionId: string,
  workspace: WorkspaceTokenIndex,
  modeName: string | null,
  visited = new Set<string>(),
): number {
  const token = workspace.flatTokensByCollection[collectionId]?.[tokenPath];
  if (!token) {
    return 0;
  }

  const visitKey = `${collectionId}::${tokenPath}::${modeName ?? '__default__'}`;
  if (visited.has(visitKey)) {
    return 0;
  }

  const refPath = readAliasTargetForMode(token, collectionId, modeName);
  if (!refPath) {
    return 0;
  }

  visited.add(visitKey);
  const target = resolveWorkspaceToken(refPath, collectionId, workspace);
  if (!target) {
    return 1;
  }

  return (
    1 + getAliasDepth(refPath, target.collectionId, workspace, modeName, visited)
  );
}

function formatAliasMode(modeName: string | null): string {
  return modeName ? `mode "${modeName}"` : "default value";
}

function joinList(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function collectAliasDepthViolationDetails(
  tokenPath: string,
  collectionId: string,
  workspace: WorkspaceTokenIndex,
  maxDepth: number,
): AliasDepthViolationDetail[] {
  const token = workspace.flatTokensByCollection[collectionId]?.[tokenPath];
  if (!token) {
    return [];
  }

  const details: AliasDepthViolationDetail[] = [];
  for (const { modeName } of readDirectAliasTargets(token, collectionId)) {
    const depth = getAliasDepth(tokenPath, collectionId, workspace, modeName);
    if (depth <= maxDepth) {
      continue;
    }
    details.push({
      modeName,
      depth,
      resolvedTarget: resolveAliasTarget(
        tokenPath,
        collectionId,
        workspace,
        modeName,
      ),
    });
  }

  return details;
}

function describeAliasDepthViolation(
  tokenPath: string,
  maxDepth: number,
  details: AliasDepthViolationDetail[],
): { message: string; suggestion?: string } {
  const uniqueSuggestions = [
    ...new Set(
      details
        .map((detail) => detail.resolvedTarget)
        .filter(
          (target): target is string =>
            typeof target === 'string' && target.length > 0 && target !== tokenPath,
        ),
    ),
  ];
  const suggestion =
    uniqueSuggestions.length === 1 ? `{${uniqueSuggestions[0]}}` : undefined;

  if (details.length === 1) {
    const [detail] = details;
    const modeText = detail.modeName ? ` in mode "${detail.modeName}"` : '';
    return {
      message: `Token "${tokenPath}" has alias depth ${detail.depth}${modeText} (max ${maxDepth}).${suggestion ? ` Point directly to ${suggestion} to flatten.` : ''}`,
      suggestion,
    };
  }

  const summary = joinList(
    details.map(
      (detail) => `${formatAliasMode(detail.modeName)} (${detail.depth})`,
    ),
  );
  return {
    message: `Token "${tokenPath}" exceeds alias depth ${maxDepth} in ${summary}.${suggestion ? ` Point directly to ${suggestion} where possible.` : ''}`,
    suggestion,
  };
}

function collectDeprecatedAliasViolationDetails(
  tokenPath: string,
  collectionId: string,
  workspace: WorkspaceTokenIndex,
): DeprecatedAliasViolationDetail[] {
  const token = workspace.flatTokensByCollection[collectionId]?.[tokenPath];
  if (!token) {
    return [];
  }

  const details: DeprecatedAliasViolationDetail[] = [];
  for (const { modeName } of readDirectAliasTargets(token, collectionId)) {
    const deprecatedPath = findDeprecatedAliasTarget(
      tokenPath,
      collectionId,
      workspace,
      modeName,
    );
    if (!deprecatedPath) {
      continue;
    }
    details.push({ modeName, deprecatedPath });
  }

  return details;
}

function describeDeprecatedAliasViolation(
  tokenPath: string,
  details: DeprecatedAliasViolationDetail[],
): { message: string; suggestion?: string } {
  const uniqueTargets = [...new Set(details.map((detail) => detail.deprecatedPath))];
  const suggestion = uniqueTargets.length === 1 ? uniqueTargets[0] : undefined;

  if (details.length === 1) {
    const [detail] = details;
    return {
      message: `Token "${tokenPath}" references deprecated token "{${detail.deprecatedPath}}" in ${formatAliasMode(detail.modeName)}.`,
      suggestion,
    };
  }

  const groupedModes = new Map<string, string[]>();
  for (const detail of details) {
    const modes = groupedModes.get(detail.deprecatedPath) ?? [];
    modes.push(formatAliasMode(detail.modeName));
    groupedModes.set(detail.deprecatedPath, modes);
  }

  const segments = [...groupedModes.entries()].map(([deprecatedPath, modes]) => {
    return `{${deprecatedPath}} in ${joinList(modes)}`;
  });

  return {
    message: `Token "${tokenPath}" references deprecated tokens ${joinList(segments)}.`,
    suggestion,
  };
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

async function lintTokens(
  collectionId: string,
  tokenStore: TokenStore,
  lintConfig: LintConfig,
): Promise<LintViolation[]> {
  const allEntries = tokenStore.getAllFlatTokens();
  const workspace = buildWorkspaceTokenIndex(allEntries);
  const flatTokens = workspace.flatTokensByCollection[collectionId] ?? {};

  const violations: Omit<LintViolation, 'collectionId'>[] = [];
  const rules = lintConfig.lintRules;

  // --- no-raw-color ---
  const noRawColor = rules['no-raw-color'] ? resolveRuleForCollection(rules['no-raw-color'], collectionId) : undefined;
  if (noRawColor?.enabled) {
    const severity = noRawColor.severity ?? 'warning';
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      if (isPathExcluded(tokenPath, noRawColor.excludePaths)) continue;
      if (token.$type === 'color' && !isReference(token.$value)) {
        const rawHex = String(token.$value);
        const nearest = findNearestColorAlias(
          rawHex,
          tokenPath,
          collectionId,
          allEntries,
        );
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
      const details = collectAliasDepthViolationDetails(
        tokenPath,
        collectionId,
        workspace,
        maxDepth,
      );
      if (details.length > 0) {
        const { message, suggestion } = describeAliasDepthViolation(
          tokenPath,
          maxDepth,
          details,
        );
        violations.push({
          rule: 'max-alias-depth',
          path: tokenPath,
          severity,
          message,
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
      const details = collectDeprecatedAliasViolationDetails(
        tokenPath,
        collectionId,
        workspace,
      );
      if (details.length === 0) continue;
      const { message, suggestion } = describeDeprecatedAliasViolation(
        tokenPath,
        details,
      );
      violations.push({
        rule: 'references-deprecated-token',
        path: tokenPath,
        severity,
        message,
        suggestedFix: 'replace-deprecated-reference',
        suggestion,
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
      for (const entry of allEntries) {
        const candidatePath = entry.path;
        const candidateToken = entry.token;
        if (candidatePath === tokenPath && entry.collectionId === collectionId) continue;
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

  return violations.map(v => ({ ...v, collectionId }));
}

export async function lintAllCollections(
  tokenStore: TokenStore,
  lintConfig: LintConfig,
): Promise<LintViolation[]> {
  const collectionIds = new Set<string>();
  for (const entry of tokenStore.getAllFlatTokens()) {
    collectionIds.add(entry.collectionId);
  }
  const results: LintViolation[] = [];
  for (const cid of collectionIds) {
    const perCollection = await lintTokens(cid, tokenStore, lintConfig);
    results.push(...perCollection);
  }
  const suppressionSet = new Set(lintConfig.suppressions ?? []);
  if (suppressionSet.size === 0) return results;
  return results.filter(v => !suppressionSet.has(
    serializeSuppressionKey(v.rule, v.collectionId, v.path),
  ));
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
  targetPath?: string;
  targetCollectionId?: string;
  cyclePath?: string[];
  suggestedFix?: string;
  /** Concrete fix target — e.g. the alias path to use. */
  suggestion?: string;
  /** For no-duplicate-values: stable duplicate-group identifier shared by all tokens in the group. */
  group?: string;
}

function detectCycles(
  startPath: string,
  startCollectionId: string,
  workspace: WorkspaceTokenIndex,
  modeName: string | null,
): string[] | null {
  const chain: Array<{ path: string; collectionId: string }> = [];
  const indexMap = new Map<string, number>();

  function visit(currentPath: string, currentCollectionId: string): string[] | null {
    const visitKey = `${currentCollectionId}::${currentPath}`;
    if (indexMap.has(visitKey)) {
      const cycleStart = indexMap.get(visitKey)!;
      const cycle = chain.slice(cycleStart).map((entry) => entry.path);
      cycle.push(currentPath);
      return cycle;
    }

    const token = workspace.flatTokensByCollection[currentCollectionId]?.[currentPath];
    if (!token) return null;

    const refs = getCycleReferencePaths(token, currentCollectionId, modeName);
    if (refs.length === 0) return null;

    indexMap.set(visitKey, chain.length);
    chain.push({ path: currentPath, collectionId: currentCollectionId });
    for (const refPath of refs) {
      const target = resolveWorkspaceToken(refPath, currentCollectionId, workspace);
      if (!target) {
        continue;
      }
      const cycle = visit(refPath, target.collectionId);
      if (cycle) return cycle;
    }
    chain.pop();
    indexMap.delete(visitKey);

    return null;
  }

  return visit(startPath, startCollectionId);
}

function getStructuralReferencePaths(token: Token, collectionId: string): string[] {
  return collectTokenReferencePaths(token, {
    collectionId,
    includeExtends: true,
  });
}

function getCycleReferencePaths(
  token: Token,
  collectionId: string,
  modeName: string | null,
): string[] {
  if (!modeName) {
    return collectTokenReferencePaths(token, {
      collectionId,
      includeModeOverrides: false,
      includeExtends: true,
    });
  }

  const modeValue = readTokenCollectionModeValues(token)[collectionId]?.[modeName];
  return collectTokenReferencePaths(
    { $value: modeValue, $extensions: token.$extensions },
    {
      includeModeOverrides: false,
      includeExtends: true,
    },
  );
}

function readCycleModeNames(token: Token, collectionId: string): Array<string | null> {
  const modeNames = Object.keys(
    readTokenCollectionModeValues(token)[collectionId] ?? {},
  );
  return [null, ...modeNames];
}

const TYPE_VALUE_CHECKS: Record<string, (v: unknown) => boolean> = {
  color: v => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v),
  number: v => typeof v === 'number',
  dimension: v => typeof v === 'object' && v !== null && 'value' in v && 'unit' in v,
  fontWeight: v => typeof v === 'number' || typeof v === 'string',
  string: v => typeof v === 'string',
  boolean: v => typeof v === 'boolean',
};

function valueHasReferences(value: unknown): boolean {
  return collectTokenReferencePaths(
    { $value: value },
    {
      includeModeOverrides: false,
      includeDerivationRefs: false,
      includeExtends: false,
    },
  ).length > 0;
}

function readLiteralValuesForTypeCheck(
  token: Token,
  collectionId: string,
): Array<{ modeName: string | null; value: unknown }> {
  const values: Array<{ modeName: string | null; value: unknown }> = [
    { modeName: null, value: token.$value },
  ];
  const modeValues = readTokenCollectionModeValues(token)[collectionId];
  if (!modeValues) return values;
  for (const [modeName, value] of Object.entries(modeValues)) {
    values.push({ modeName, value });
  }
  return values;
}

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

  const allTokensList = tokenStore.getAllFlatTokens();
  const workspace = buildWorkspaceTokenIndex(allTokensList);

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

    const structuralRefs = getStructuralReferencePaths(token, collectionId);

    // Broken references
    for (const refPath of structuralRefs) {
      const target = resolveWorkspaceToken(refPath, collectionId, workspace);
      if (!target) {
        const resolution = resolveCollectionIdForPath({
          path: refPath,
          preferredCollectionId: collectionId,
          pathToCollectionId: workspace.pathToCollectionId,
          collectionIdsByPath: workspace.collectionIdsByPath,
        });
        const isAmbiguous = resolution.reason === 'ambiguous';
        issues.push({
          severity: 'error',
          collectionId,
          path: tokenPath,
          rule: 'broken-alias',
          message: isAmbiguous
            ? `Reference "{${refPath}}" is ambiguous across collections.`
            : `Reference "{${refPath}}" points to a token that does not exist.`,
          targetPath: refPath,
          suggestedFix: isAmbiguous ? undefined : 'delete-token',
        });
      }
    }

    // Direct alias checks
    const maxAliasDepthRule = cfg.lintRules['max-alias-depth'];
    if (maxAliasDepthRule?.enabled !== false) {
      const maxDepth = (maxAliasDepthRule?.options?.maxDepth as number | undefined) ?? 3;
      const details = collectAliasDepthViolationDetails(
        tokenPath,
        collectionId,
        workspace,
        maxDepth,
      );
      if (details.length > 0) {
        const { message, suggestion } = describeAliasDepthViolation(
          tokenPath,
          maxDepth,
          details,
        );
        issues.push({
          severity: maxAliasDepthRule?.severity ?? 'warning',
          collectionId,
          path: tokenPath,
          rule: 'max-alias-depth',
          message,
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
      const details = collectDeprecatedAliasViolationDetails(
        tokenPath,
        collectionId,
        workspace,
      );
      if (details.length > 0) {
        const { message, suggestion } = describeDeprecatedAliasViolation(
          tokenPath,
          details,
        );
        issues.push({
          severity: referencesDeprecatedRule.severity ?? 'warning',
          collectionId,
          path: tokenPath,
          rule: 'references-deprecated-token',
          message,
          suggestedFix: 'replace-deprecated-reference',
          suggestion,
        });
      }
    }

    if (structuralRefs.length > 0) {
      for (const modeName of readCycleModeNames(token, collectionId)) {
        const cycle = detectCycles(tokenPath, collectionId, workspace, modeName);
        if (cycle) {
          issues.push({
            severity: 'error',
            collectionId,
            path: tokenPath,
            rule: 'circular-reference',
            message: `Circular reference${modeName ? ` in mode "${modeName}"` : ''}: ${cycle.join(' → ')}`,
            cyclePath: cycle,
          });
          break;
        }
      }
    }

    if (token.$type && TYPE_VALUE_CHECKS[token.$type]) {
      const check = TYPE_VALUE_CHECKS[token.$type];
      for (const { modeName, value } of readLiteralValuesForTypeCheck(
        token,
        collectionId,
      )) {
        if (valueHasReferences(value) || check(value)) {
          continue;
        }
        const inferredType = inferTypeFromValue(value);
        const modeText = modeName ? ` in mode "${modeName}"` : '';
        issues.push({
          severity: 'error',
          collectionId,
          path: tokenPath,
          rule: 'type-mismatch',
          message: `Value${modeText} does not match declared type "${token.$type}".`,
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

  // Filter out server-persisted suppressions.
  const suppressionSet = new Set(cfg.suppressions ?? []);
  if (suppressionSet.size === 0) return issues;
  return issues.filter(i => !suppressionSet.has(
    serializeSuppressionKey(i.rule, i.collectionId, i.path),
  ));
}
