import type { TokenNode } from '../hooks/useTokens';
import { createGeneratorOwnershipKey } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { SortOrder } from './tokenListTypes';
import { isAlias } from '../../shared/resolveAlias';
import { stableStringify } from '../shared/utils';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import { TOKEN_TYPE_CATEGORIES } from '../shared/tokenTypeCategories';

// ---------------------------------------------------------------------------
// Structured query parsing
// ---------------------------------------------------------------------------

export interface ParsedQuery {
  /** Free-text portion (after extracting qualifiers) */
  text: string;
  /** type:color, type:dimension, etc. */
  types: string[];
  /** has:alias, has:direct, has:duplicate, has:description */
  has: string[];
  /** value:<substring> — search within serialized token values */
  values: string[];
  /** desc:<substring> — search within $description */
  descs: string[];
  /** path:<prefix> — match path prefix */
  paths: string[];
  /** name:<substring> — search only the leaf name */
  names: string[];
  /** generated:<name> — filter by generated group that produced the token */
  generators: string[];
  /** scope:<category> — tokens that can be applied to this Figma field category */
  scopes: string[];
}

/**
 * Designer-friendly categories that map to the raw Figma VariableScope values.
 * A token matches the category when its $scopes array contains any of the
 * mapped values, or when its $scopes is empty (unrestricted).
 */
export const SCOPE_CATEGORIES: Record<string, string[]> = {
  fill: ['FILL_COLOR'],
  stroke: ['STROKE_COLOR'],
  text: ['TEXT_FILL', 'FONT_FAMILY', 'FONT_STYLE', 'FONT_SIZE', 'LINE_HEIGHT', 'LETTER_SPACING', 'TEXT_CONTENT'],
  radius: ['CORNER_RADIUS'],
  spacing: ['GAP'],
  gap: ['GAP'],
  size: ['WIDTH_HEIGHT'],
  'stroke-width': ['STROKE_FLOAT'],
  opacity: ['OPACITY'],
  typography: ['FONT_FAMILY', 'FONT_STYLE', 'FONT_SIZE', 'LINE_HEIGHT', 'LETTER_SPACING'],
  effect: ['EFFECT_COLOR'],
  visibility: ['SHOW_HIDE'],
};

export const SCOPE_CATEGORY_KEYS = Object.keys(SCOPE_CATEGORIES);

const QUALIFIER_RE = /\b(type|has|value|desc|path|name|generated|gen|scope):(\S+)/gi;
const QUERY_TOKEN_RE = /\b([a-z]+):(\S+)/gi;

/** Recognized values for has: qualifier */
const HAS_VALUES = new Set(['alias', 'ref', 'direct', 'duplicate', 'dup', 'description', 'desc', 'extension', 'ext', 'generated', 'gen', 'unused']);
const HAS_CANONICAL_MAP: Record<string, string> = {
  alias: 'alias',
  ref: 'alias',
  direct: 'direct',
  duplicate: 'duplicate',
  dup: 'duplicate',
  description: 'description',
  desc: 'description',
  extension: 'extension',
  ext: 'extension',
  generated: 'generated',
  gen: 'generated',
  unused: 'unused',
};

export function parseStructuredQuery(raw: string): ParsedQuery {
  const types: string[] = [];
  const has: string[] = [];
  const values: string[] = [];
  const descs: string[] = [];
  const paths: string[] = [];
  const names: string[] = [];
  const generators: string[] = [];
  const scopes: string[] = [];

  const text = raw.replace(QUALIFIER_RE, (_, key: string, val: string) => {
    const k = key.toLowerCase();
    const v = val.toLowerCase();
    switch (k) {
      case 'type': types.push(v); break;
      case 'has': if (HAS_VALUES.has(v)) has.push(v); break;
      case 'value': values.push(v); break;
      case 'desc': descs.push(v); break;
      case 'path': paths.push(v); break;
      case 'name': names.push(v); break;
      case 'generated':
      case 'gen':
        generators.push(v);
        break;
      case 'scope':
        if (SCOPE_CATEGORIES[v]) scopes.push(v);
        break;
    }
    return ''; // remove qualifier from text portion
  }).trim();

  return { text, types, has, values, descs, paths, names, generators, scopes };
}

/** Returns true when the raw query contains at least one recognized qualifier. */
export function hasStructuredQualifiers(raw: string): boolean {
  QUALIFIER_RE.lastIndex = 0;
  return QUALIFIER_RE.test(raw);
}

/** Canonical has: values shown in completions (no aliases like 'ref', 'dup', etc.) */
export const HAS_CANONICAL = ['alias', 'direct', 'duplicate', 'description', 'extension', 'generated', 'unused'] as const;
export type HasQualifierValue = typeof HAS_CANONICAL[number];

export interface QueryQualifierDefinition {
  key: 'type' | 'has' | 'value' | 'desc' | 'path' | 'name' | 'generator' | 'group' | 'scope';
  qualifier: string;
  desc: string;
  example: string;
  valueHint?: string;
}

export type StructuredFilterKey = Exclude<QueryQualifierDefinition['key'], 'group'>;

export interface FilterDiscoveryTemplate {
  id: string;
  label: string;
  description: string;
  qualifier: StructuredFilterKey;
  mode: 'open-builder' | 'toggle-qualifier';
  value?: string;
  keywords: string[];
}

export interface QueryQualifierSuggestion {
  id: string;
  label: string;
  desc: string;
  replacement?: string;
  kind: 'replacement' | 'hint';
}

export interface ActiveQueryToken {
  token: string;
  start: number;
  end: number;
}

/**
 * Returns dynamic value completions for a qualifier:partial suffix.
 * Used by CommandPalette to suggest values after typing e.g. "type:" or "has:al".
 */
export function getQualifierCompletions(
  qualifier: string,
  partial: string,
  tokens: Array<{ path: string; type: string; isAlias?: boolean; description?: string; generatorName?: string; value?: string }>,
  groups?: Array<{ path: string }>,
): string[] {
  const p = partial.toLowerCase();
  let candidates: string[];

  switch (qualifier.toLowerCase()) {
    case 'type': {
      const types = new Set<string>();
      for (const t of tokens) if (t.type) types.add(t.type.toLowerCase());
      candidates = Array.from(types).sort();
      break;
    }
    case 'has':
      candidates = [...HAS_CANONICAL];
      break;
    case 'generator':
    case 'generated':
    case 'gen': {
      const gens = new Set<string>();
      for (const t of tokens) if (t.generatorName) gens.add(t.generatorName.toLowerCase());
      candidates = Array.from(gens).sort();
      break;
    }
    case 'path': {
      const segs = new Set<string>();
      for (const t of tokens) {
        const dot = t.path.indexOf('.');
        segs.add(dot >= 0 ? t.path.slice(0, dot) : t.path);
      }
      candidates = Array.from(segs).sort();
      break;
    }
    case 'name': {
      const names = new Set<string>();
      for (const t of tokens) {
        const i = t.path.lastIndexOf('.');
        names.add(i >= 0 ? t.path.slice(i + 1) : t.path);
      }
      candidates = Array.from(names).sort().slice(0, 30);
      break;
    }
    case 'group': {
      candidates = groups ? groups.map(g => g.path).sort() : [];
      break;
    }
    case 'scope': {
      candidates = [...SCOPE_CATEGORY_KEYS];
      break;
    }
    case 'value': {
      const freq = new Map<string, number>();
      for (const t of tokens) {
        if (t.value) {
          const v = t.value.toLowerCase();
          freq.set(v, (freq.get(v) ?? 0) + 1);
        }
      }
      candidates = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([v]) => v)
        .slice(0, 20);
      break;
    }
    default:
      return [];
  }

  const filtered = p ? candidates.filter(c => c.startsWith(p)) : candidates;
  return filtered.slice(0, 10);
}

/** Available qualifier suggestions for the autocomplete hint. */
export const QUERY_QUALIFIERS: QueryQualifierDefinition[] = [
  { key: 'type', qualifier: 'type:', desc: 'Filter by token type', example: 'type:color', valueHint: 'Choose a token type such as color, dimension, or typography.' },
  { key: 'has', qualifier: 'has:alias', desc: 'Only reference tokens', example: 'has:alias', valueHint: 'Choose a token property like alias, duplicate, generated, or unused.' },
  { key: 'has', qualifier: 'has:direct', desc: 'Only direct-value tokens', example: 'has:direct', valueHint: 'Choose a token property like alias, duplicate, generated, or unused.' },
  { key: 'has', qualifier: 'has:duplicate', desc: 'Only tokens with duplicate values', example: 'has:duplicate', valueHint: 'Choose a token property like alias, duplicate, generated, or unused.' },
  { key: 'has', qualifier: 'has:description', desc: 'Only tokens with a description', example: 'has:description', valueHint: 'Choose a token property like alias, duplicate, generated, or unused.' },
  { key: 'has', qualifier: 'has:extension', desc: 'Only tokens with extensions', example: 'has:extension', valueHint: 'Choose a token property like alias, duplicate, generated, or unused.' },
  { key: 'has', qualifier: 'has:generated', desc: 'Only generated tokens', example: 'has:generated', valueHint: 'Choose a token property like alias, duplicate, generated, or unused.' },
  { key: 'has', qualifier: 'has:unused', desc: 'Tokens with no Figma usage and no alias dependents', example: 'has:unused', valueHint: 'Choose a token property like alias, duplicate, generated, or unused.' },
  { key: 'value', qualifier: 'value:', desc: 'Search within token values', example: 'value:#ff0000', valueHint: 'Enter a value fragment, for example #ff0000 or 16px.' },
  { key: 'desc', qualifier: 'desc:', desc: 'Search within descriptions', example: 'desc:primary', valueHint: 'Enter words from the token description.' },
  { key: 'path', qualifier: 'path:', desc: 'Filter by path prefix', example: 'path:colors.brand', valueHint: 'Enter a path segment like colors.brand or spacing.' },
  { key: 'name', qualifier: 'name:', desc: 'Search by leaf name only', example: 'name:500', valueHint: 'Enter the token leaf name, such as 500 or primary.' },
  { key: 'generator', qualifier: 'generated:', desc: 'Filter by generated group name', example: 'generated:brand-palette', valueHint: 'Enter the generated group that produced the token.' },
  { key: 'scope', qualifier: 'scope:', desc: 'Can apply to a Figma field', example: 'scope:fill', valueHint: 'Pick where the token can be applied, e.g. fill, stroke, radius, spacing, typography.' },
  { key: 'group', qualifier: 'group:', desc: 'Navigate to a group path', example: 'group:colors.brand', valueHint: 'Enter a group path like colors.brand.' },
];

const FILTER_DISCOVERY_TEMPLATES: FilterDiscoveryTemplate[] = [
  {
    id: 'type',
    label: 'Type filters',
    description: 'Browse by token type without typing type: clauses.',
    qualifier: 'type',
    mode: 'open-builder',
    keywords: ['type', 'color', 'spacing', 'dimension', 'typography'],
  },
  {
    id: 'has-alias',
    label: 'Aliases',
    description: 'Show reference tokens only.',
    qualifier: 'has',
    mode: 'toggle-qualifier',
    value: 'alias',
    keywords: ['alias', 'reference', 'ref'],
  },
  {
    id: 'has-generated',
    label: 'Generated',
    description: 'Show generated tokens.',
    qualifier: 'has',
    mode: 'toggle-qualifier',
    value: 'generated',
    keywords: ['generated', 'generator', 'derived'],
  },
  {
    id: 'has-unused',
    label: 'Unused',
    description: 'Show tokens with no usage or alias dependents.',
    qualifier: 'has',
    mode: 'toggle-qualifier',
    value: 'unused',
    keywords: ['unused', 'orphan', 'cleanup'],
  },
  {
    id: 'path',
    label: 'Path filters',
    description: 'Limit results to a group path like colors.brand.',
    qualifier: 'path',
    mode: 'open-builder',
    keywords: ['path', 'group', 'folder', 'colors.brand'],
  },
  {
    id: 'desc',
    label: 'Descriptions',
    description: 'Search within token descriptions.',
    qualifier: 'desc',
    mode: 'open-builder',
    keywords: ['description', 'desc', 'notes', 'documentation'],
  },
  {
    id: 'value',
    label: 'Values',
    description: 'Match a color, number, or string value.',
    qualifier: 'value',
    mode: 'open-builder',
    keywords: ['value', 'hex', 'number', 'string'],
  },
];

export function isStructuredFilterDiscoveryQuery(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (hasStructuredQualifiers(trimmed)) return false;
  const terms = trimmed.split(/\s+/).filter(Boolean);
  return terms.length <= 2 && trimmed.length <= 32;
}

export function getStructuredFilterDiscoveryTemplates(raw: string): FilterDiscoveryTemplate[] {
  const query = raw.trim().toLowerCase();
  if (!query) return FILTER_DISCOVERY_TEMPLATES;

  const scored = FILTER_DISCOVERY_TEMPLATES
    .map((template) => {
      const haystacks = [
        template.label.toLowerCase(),
        template.description.toLowerCase(),
        ...(template.value ? [template.value.toLowerCase()] : []),
        ...template.keywords.map((keyword) => keyword.toLowerCase()),
      ];
      let score = 0;
      for (const haystack of haystacks) {
        if (haystack.startsWith(query)) score = Math.max(score, 3);
        else if (haystack.includes(query)) score = Math.max(score, 1);
      }
      if (template.value?.toLowerCase() === query) score = 4;
      return { template, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.template.label.localeCompare(right.template.label));

  return scored.map((entry) => entry.template);
}

export function normalizeHasQualifier(value: string): HasQualifierValue | null {
  return (HAS_CANONICAL_MAP[value.toLowerCase()] as HasQualifierValue | undefined) ?? null;
}

export function getActiveQueryToken(raw: string): ActiveQueryToken {
  const trailingWhitespace = raw.match(/\s+$/)?.[0].length ?? 0;
  const effectiveEnd = raw.length - trailingWhitespace;
  const trimmed = raw.slice(0, effectiveEnd);
  const lastSpace = trimmed.lastIndexOf(' ');
  const start = lastSpace >= 0 ? lastSpace + 1 : 0;
  return { token: trimmed.slice(start), start, end: effectiveEnd };
}

export function replaceQueryToken(raw: string, activeToken: ActiveQueryToken, replacement: string): string {
  const before = raw.slice(0, activeToken.start).replace(/\s+$/, '');
  const after = raw.slice(activeToken.end).replace(/^\s+/, '');
  return [before, replacement.trim(), after].filter(Boolean).join(' ').trim();
}

export function removeQueryQualifierValues(raw: string, qualifier: QueryQualifierDefinition['key']): string {
  const keys = qualifier === 'generator' ? ['generated', 'gen'] : [qualifier];
  const pattern = new RegExp(`\\b(?:${keys.join('|')}):\\S+`, 'gi');
  return raw.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
}

export function setQueryQualifierValues(
  raw: string,
  qualifier: QueryQualifierDefinition['key'],
  values: string[],
): string {
  const base = removeQueryQualifierValues(raw, qualifier);
  const prefix = qualifier === 'generator' ? 'generated' : qualifier;
  const additions = values.map(value => `${prefix}:${value}`);
  return [base, ...additions].filter(Boolean).join(' ').trim();
}

export function getQueryQualifierValues(raw: string, qualifier: QueryQualifierDefinition['key']): string[] {
  const keys =
    qualifier === 'generator'
      ? new Set(['generated', 'gen'])
      : new Set([qualifier]);
  const values: string[] = [];
  raw.replace(QUERY_TOKEN_RE, (_, key: string, value: string) => {
    if (keys.has(key.toLowerCase())) values.push(value.toLowerCase());
    return '';
  });
  return values;
}

export function getQualifierDefinitionForToken(token: string): QueryQualifierDefinition | null {
  const match = token.match(/^([a-z]+):/i);
  if (!match) return null;
  const key = match[1].toLowerCase();
  if (key === 'generated' || key === 'gen') {
    return QUERY_QUALIFIERS.find(def => def.key === 'generator') ?? null;
  }
  return QUERY_QUALIFIERS.find(def => def.key === key) ?? null;
}

export type { SortOrder } from './tokenListTypes';

// ---------------------------------------------------------------------------
// Virtual scroll helpers
// ---------------------------------------------------------------------------

/** Flatten the visible portion of a token tree into a depth-annotated list for virtual scrolling. */
export function flattenVisible(
  nodes: TokenNode[],
  expandedPaths: Set<string>,
  depth = 0
): Array<{ node: TokenNode; depth: number }> {
  const result: Array<{ node: TokenNode; depth: number }> = [];
  for (const node of nodes) {
    result.push({ node, depth });
    if (node.isGroup && expandedPaths.has(node.path) && node.children) {
      result.push(...flattenVisible(node.children, expandedPaths, depth + 1));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function countTokensInGroup(node: TokenNode): number {
  if (!node.isGroup) return 1;
  return (node.children ?? []).reduce((sum, c) => sum + countTokensInGroup(c), 0);
}

/**
 * Returns a display path where the leaf segment is quoted if it contains a dot,
 * making literal dots in segment names visually distinguishable from path separators.
 * e.g. formatDisplayPath("spacing.1.5", "1.5") → 'spacing."1.5"'
 */
export function formatDisplayPath(path: string, leafName: string): string {
  if (!leafName.includes('.')) return path;
  const parent = path.length > leafName.length ? path.slice(0, path.length - leafName.length - 1) : '';
  const quoted = `"${leafName}"`;
  return parent ? `${parent}.${quoted}` : quoted;
}

/** Returns the parent group path of a node, correctly handling dots in segment names. */
export function nodeParentPath(nodePath: string, nodeName: string): string {
  if (nodePath.length <= nodeName.length) return '';
  return nodePath.slice(0, nodePath.length - nodeName.length - 1);
}

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

export function formatValue(type?: string, value?: any): string {
  return formatTokenValueForDisplay(type, value, { emptyPlaceholder: '' });
}

// ---------------------------------------------------------------------------
// Tree manipulation
// ---------------------------------------------------------------------------

export function pruneDeletedPaths(nodes: TokenNode[], deletedPaths: Set<string>): TokenNode[] {
  const result: TokenNode[] = [];
  for (const node of nodes) {
    if (deletedPaths.has(node.path)) continue;
    if (node.isGroup) {
      const children = pruneDeletedPaths(node.children ?? [], deletedPaths);
      if (children.length > 0) result.push({ ...node, children });
    } else {
      result.push(node);
    }
  }
  return result;
}

export function filterByDuplicatePaths(nodes: TokenNode[], paths: Set<string>): TokenNode[] {
  const result: TokenNode[] = [];
  for (const node of nodes) {
    if (node.isGroup) {
      const filtered = filterByDuplicatePaths(node.children ?? [], paths);
      if (filtered.length > 0) result.push({ ...node, children: filtered });
    } else if (paths.has(node.path)) {
      result.push(node);
    }
  }
  return result;
}

export function filterTokenNodes(
  nodes: TokenNode[],
  collectionId: string,
  searchQuery: string,
  typeFilter: string,
  refFilter: 'all' | 'aliases' | 'direct',
  duplicateValuePaths?: Set<string>,
  derivedTokenPaths?: Map<string, TokenGenerator>,
  unusedTokenPaths?: Set<string>,
): TokenNode[] {
  const parsed = parseStructuredQuery(searchQuery);
  const hasQualifiers = parsed.types.length > 0 || parsed.has.length > 0 || parsed.values.length > 0
    || parsed.descs.length > 0 || parsed.paths.length > 0 || parsed.names.length > 0
    || parsed.generators.length > 0 || parsed.scopes.length > 0;

  if (hasQualifiers) {
    return filterTokenNodesStructured(nodes, collectionId, parsed, typeFilter, refFilter, duplicateValuePaths, derivedTokenPaths, unusedTokenPaths);
  }

  // Fast path: plain text search (no qualifiers)
  const q = parsed.text.toLowerCase();
  const result: TokenNode[] = [];
  for (const node of nodes) {
    if (node.isGroup) {
      const filteredChildren = filterTokenNodes(node.children ?? [], collectionId, searchQuery, typeFilter, refFilter, duplicateValuePaths, derivedTokenPaths, unusedTokenPaths);
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    } else {
      const matchesSearch = !q || node.path.toLowerCase().includes(q) || node.name.toLowerCase().includes(q);
      const matchesType = !typeFilter || node.$type === typeFilter;
      const matchesRef = refFilter === 'all'
        || (refFilter === 'aliases' && isAlias(node.$value))
        || (refFilter === 'direct' && !isAlias(node.$value));
      if (matchesSearch && matchesType && matchesRef) result.push(node);
    }
  }
  return result;
}

function filterTokenNodesStructured(
  nodes: TokenNode[],
  collectionId: string,
  parsed: ParsedQuery,
  typeFilter: string,
  refFilter: 'all' | 'aliases' | 'direct',
  duplicateValuePaths?: Set<string>,
  derivedTokenPaths?: Map<string, TokenGenerator>,
  unusedTokenPaths?: Set<string>,
): TokenNode[] {
  const q = parsed.text.toLowerCase();
  const result: TokenNode[] = [];
  for (const node of nodes) {
    if (node.isGroup) {
      const filtered = filterTokenNodesStructured(node.children ?? [], collectionId, parsed, typeFilter, refFilter, duplicateValuePaths, derivedTokenPaths, unusedTokenPaths);
      if (filtered.length > 0) result.push({ ...node, children: filtered });
    } else {
      const generatorKey = createGeneratorOwnershipKey(collectionId, node.path);
      // Free-text match (on path, name, or description)
      if (q && !node.path.toLowerCase().includes(q) && !node.name.toLowerCase().includes(q) && !(node.$description || '').toLowerCase().includes(q)) continue;

      // type: qualifier (OR within multiple type: values)
      if (parsed.types.length > 0) {
        const nt = (node.$type || '').toLowerCase();
        if (!parsed.types.some(t => nt === t || nt.includes(t))) continue;
      }
      // Also respect the dropdown type filter
      if (typeFilter && node.$type !== typeFilter) continue;

      // has: qualifiers (all must match)
      let hasMatch = true;
      for (const h of parsed.has) {
        if ((h === 'alias' || h === 'ref') && !isAlias(node.$value)) { hasMatch = false; break; }
        if (h === 'direct' && isAlias(node.$value)) { hasMatch = false; break; }
        if ((h === 'duplicate' || h === 'dup') && (!duplicateValuePaths || !duplicateValuePaths.has(node.path))) { hasMatch = false; break; }
        if ((h === 'description' || h === 'desc') && !node.$description) { hasMatch = false; break; }
        if ((h === 'extension' || h === 'ext') && (!node.$extensions || Object.keys(node.$extensions).length === 0)) { hasMatch = false; break; }
        if ((h === 'generated' || h === 'gen') && !derivedTokenPaths?.has(generatorKey)) { hasMatch = false; break; }
        if (h === 'unused' && (!unusedTokenPaths || !unusedTokenPaths.has(node.path))) { hasMatch = false; break; }
      }
      if (!hasMatch) continue;

      // Dropdown ref filter
      if (refFilter !== 'all') {
        if (refFilter === 'aliases' && !isAlias(node.$value)) continue;
        if (refFilter === 'direct' && isAlias(node.$value)) continue;
      }

      // value: qualifier — match serialized $value
      if (parsed.values.length > 0) {
        const sv = stableStringify(node.$value).toLowerCase();
        if (!parsed.values.some(v => sv.includes(v))) continue;
      }

      // desc: qualifier — match $description
      if (parsed.descs.length > 0) {
        const d = (node.$description || '').toLowerCase();
        if (!parsed.descs.some(ds => d.includes(ds))) continue;
      }

      // path: qualifier — match path prefix
      if (parsed.paths.length > 0) {
        const lp = node.path.toLowerCase();
        if (!parsed.paths.some(p => lp.startsWith(p) || lp.includes(p))) continue;
      }

      // name: qualifier — match leaf name only
      if (parsed.names.length > 0) {
        const ln = node.name.toLowerCase();
        if (!parsed.names.some(n => ln.includes(n))) continue;
      }

      // generated: qualifier — match by generated group name
      if (parsed.generators.length > 0) {
        const gen = derivedTokenPaths?.get(generatorKey);
        if (!gen) continue;
        const gn = gen.name.toLowerCase();
        if (!parsed.generators.some(g => gn === g || gn.includes(g))) continue;
      }

      // scope: qualifier — token permits application to the category's Figma field(s)
      if (parsed.scopes.length > 0) {
        const tokenScopes = node.$scopes ?? [];
        // Empty scopes = unrestricted: matches every category
        if (tokenScopes.length > 0) {
          const scopeMatch = parsed.scopes.some(category => {
            const allowed = SCOPE_CATEGORIES[category];
            if (!allowed) return false;
            return allowed.some(s => tokenScopes.includes(s));
          });
          if (!scopeMatch) continue;
        }
      }

      result.push(node);
    }
  }
  return result;
}

export function sortTokenNodes(nodes: TokenNode[], order: SortOrder): TokenNode[] {
  if (order === 'default') return nodes;
  const sorted = [...nodes].sort((a, b) => {
    switch (order) {
      case 'alpha-asc': return a.name.localeCompare(b.name);
      case 'by-type': {
        const tc = (a.$type || '').localeCompare(b.$type || '');
        return tc !== 0 ? tc : a.name.localeCompare(b.name);
      }
      default: return 0;
    }
  });
  return sorted.map(node => ({
    ...node,
    children: node.children ? sortTokenNodes(node.children, order) : undefined,
  }));
}

const TOKEN_TYPE_TO_GROUP = new Map(
  TOKEN_TYPE_CATEGORIES.flatMap((category) =>
    category.options.map((option) => [option.value, category.group] as const),
  ),
);

function createTypeGroupPath(group: string): string {
  return `__type/${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export function groupTokenNodesByType(nodes: TokenNode[]): TokenNode[] {
  const grouped = new Map<string, TokenNode[]>();
  const orderedGroups = TOKEN_TYPE_CATEGORIES.map((category) => category.group);
  const fallbackGroup = orderedGroups.includes('Other') ? 'Other' : orderedGroups[orderedGroups.length - 1];

  for (const node of flattenLeafNodes(nodes)) {
    const group = TOKEN_TYPE_TO_GROUP.get(node.$type ?? '') ?? fallbackGroup;
    const bucket = grouped.get(group);
    if (bucket) {
      bucket.push(node);
    } else {
      grouped.set(group, [node]);
    }
  }

  const result: TokenNode[] = [];
  for (const group of orderedGroups) {
    const children = grouped.get(group);
    if (!children || children.length === 0) continue;
    result.push({
      path: createTypeGroupPath(group),
      name: group,
      children,
      isGroup: true,
    });
  }
  return result;
}

export function collectGroupPathsByDepth(nodes: TokenNode[], maxExpandDepth: number, depth = 0): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.isGroup && depth < maxExpandDepth) {
      paths.push(node.path);
      if (node.children) {
        paths.push(...collectGroupPathsByDepth(node.children, maxExpandDepth, depth + 1));
      }
    }
  }
  return paths;
}

export function collectAllGroupPaths(nodes: TokenNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.isGroup) {
      paths.push(node.path);
      if (node.children) paths.push(...collectAllGroupPaths(node.children));
    }
  }
  return paths;
}

export function countLeaves(node: TokenNode): number {
  if (!node.isGroup || !node.children) return node.isGroup ? 0 : 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

export function flattenLeafNodes(nodes: TokenNode[]): TokenNode[] {
  const result: TokenNode[] = [];
  const walk = (list: TokenNode[]) => {
    for (const node of list) {
      if (!node.isGroup) result.push(node);
      else if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

export interface FlatLeafNodeWithAncestors {
  node: TokenNode;
  ancestors: Array<{ name: string; path: string }>;
}

export function flattenLeafNodesWithAncestors(
  nodes: TokenNode[],
): FlatLeafNodeWithAncestors[] {
  const result: FlatLeafNodeWithAncestors[] = [];
  const walk = (
    list: TokenNode[],
    ancestors: Array<{ name: string; path: string }>,
  ) => {
    for (const node of list) {
      if (!node.isGroup) {
        result.push({ node, ancestors });
        continue;
      }
      if (!node.children) continue;
      walk(node.children, [...ancestors, { name: node.name, path: node.path }]);
    }
  };
  walk(nodes, []);
  return result;
}

export function findLeafByPath(nodes: TokenNode[], path: string): TokenNode | null {
  for (const node of nodes) {
    if (!node.isGroup && node.path === path) return node;
    if (node.children) {
      const found = findLeafByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

/** Walk the token tree and return the group node at the given path, or null. */
export function findGroupByPath(nodes: TokenNode[], path: string): TokenNode | null {
  for (const node of nodes) {
    if (node.isGroup && node.path === path) return node;
    if (node.children) {
      const found = findGroupByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Build breadcrumb segments from a zoom root path by walking the actual tree structure.
 * Handles segment names containing dots correctly (by matching tree nodes, not splitting on '.').
 */
export function buildZoomBreadcrumb(
  zoomPath: string,
  nodes: TokenNode[],
): Array<{ name: string; path: string }> {
  const segments: Array<{ name: string; path: string }> = [];
  let searchNodes = nodes;
  let consumed = '';
  while (consumed.length < zoomPath.length) {
    const remaining = consumed ? zoomPath.slice(consumed.length + 1) : zoomPath;
    const match = searchNodes.find(
      n => n.isGroup && (remaining === n.name || remaining.startsWith(n.name + '.'))
    );
    if (!match) break;
    consumed = consumed ? `${consumed}.${match.name}` : match.name;
    segments.push({ name: match.name, path: match.path });
    searchNodes = match.children ?? [];
  }
  return segments;
}

export interface ZoomBranchNavigation {
  breadcrumb: Array<{ name: string; path: string }>;
  current: { name: string; path: string };
  parent: { name: string; path: string } | null;
  siblings: Array<{ name: string; path: string }>;
}

export function buildZoomBranchNavigation(
  zoomPath: string,
  nodes: TokenNode[],
): ZoomBranchNavigation | null {
  const breadcrumb = buildZoomBreadcrumb(zoomPath, nodes);
  const current = breadcrumb[breadcrumb.length - 1];
  if (!current) return null;

  const parent = breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2] : null;
  const siblingSource = parent
    ? (findGroupByPath(nodes, parent.path)?.children ?? [])
    : nodes;

  const siblings = siblingSource
    .filter(
      (node): node is TokenNode =>
        node.isGroup && node.path !== current.path,
    )
    .map((node) => ({ name: node.name, path: node.path }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    breadcrumb,
    current,
    parent,
    siblings,
  };
}

export function collectGroupLeaves(nodes: TokenNode[], groupPath: string): Array<{ path: string; data: { $type?: string; $value?: any; $description?: string } }> {
  const result: Array<{ path: string; data: { $type?: string; $value?: any; $description?: string } }> = [];
  const walk = (list: TokenNode[]) => {
    for (const node of list) {
      if (!node.isGroup && (node.path === groupPath || node.path.startsWith(`${groupPath}.`))) {
        result.push({ path: node.path, data: { $type: node.$type, $value: node.$value, $description: node.$description } });
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

export function getDefaultValue(type: string): any {
  switch (type) {
    case 'color': return '#000000';
    case 'dimension': return { value: 16, unit: 'px' };
    case 'typography': return { fontFamily: 'Inter', fontSize: { value: 16, unit: 'px' }, fontWeight: 400, lineHeight: 1.5, letterSpacing: { value: 0, unit: 'px' } };
    case 'shadow': return { color: '#00000040', offsetX: { value: 0, unit: 'px' }, offsetY: { value: 4, unit: 'px' }, blur: { value: 8, unit: 'px' }, spread: { value: 0, unit: 'px' }, type: 'dropShadow' };
    case 'border': return { color: '#000000', width: { value: 1, unit: 'px' }, style: 'solid' };
    case 'gradient': return { type: 'linear', stops: [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 1 }] };
    case 'duration': return { value: 200, unit: 'ms' };
    case 'fontFamily': return 'Inter';
    case 'fontWeight': return 400;
    case 'strokeStyle': return 'solid';
    case 'number': return 0;
    case 'string': return '';
    case 'boolean': return false;
    case 'asset': return '';
    default: return '';
  }
}

// ---------------------------------------------------------------------------
// Table view sort for flat leaf nodes
// ---------------------------------------------------------------------------

import type { TableSortField, TableSortDir } from './tokenListTypes';


export function sortLeafNodes(
  nodes: TokenNode[],
  field: TableSortField,
  dir: TableSortDir,
  _allTokensFlat: Record<string, TokenMapEntry>,
  resolvedCache: Map<string, string>,
): TokenNode[] {
  const sorted = [...nodes];
  const mul = dir === 'asc' ? 1 : -1;

  const getString = (node: TokenNode): string => {
    switch (field) {
      case 'name': return node.path;
      case 'type': return node.$type ?? '';
      case 'value': return typeof node.$value === 'object' ? stableStringify(node.$value) : String(node.$value ?? '');
      case 'resolvedValue': return resolvedCache.get(node.path) ?? '';
      case 'description': return (node.$description ?? '') as string;
    }
  };

  sorted.sort((a, b) => {
    const av = getString(a);
    const bv = getString(b);
    return mul * av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
  });

  return sorted;
}
