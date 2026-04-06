import type { TokenNode } from '../hooks/useTokens';
import type { TokenMapEntry } from '../../shared/types';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { SortOrder } from './tokenListTypes';
import { isAlias } from '../../shared/resolveAlias';
import { stableStringify } from '../shared/utils';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';

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
  /** generator:<name> — filter by generator that produced the token */
  generators: string[];
}

const QUALIFIER_RE = /\b(type|has|value|desc|path|name|generator|gen):(\S+)/gi;

/** Recognized values for has: qualifier */
const HAS_VALUES = new Set(['alias', 'ref', 'direct', 'duplicate', 'dup', 'description', 'desc', 'extension', 'ext', 'generated', 'gen', 'unused']);

export function parseStructuredQuery(raw: string): ParsedQuery {
  const types: string[] = [];
  const has: string[] = [];
  const values: string[] = [];
  const descs: string[] = [];
  const paths: string[] = [];
  const names: string[] = [];
  const generators: string[] = [];

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
      case 'generator': case 'gen': generators.push(v); break;
    }
    return ''; // remove qualifier from text portion
  }).trim();

  return { text, types, has, values, descs, paths, names, generators };
}

/** Returns true when the raw query contains at least one recognized qualifier. */
export function hasStructuredQualifiers(raw: string): boolean {
  QUALIFIER_RE.lastIndex = 0;
  return QUALIFIER_RE.test(raw);
}

/** Canonical has: values shown in completions (no aliases like 'ref', 'dup', etc.) */
const HAS_CANONICAL = ['alias', 'direct', 'duplicate', 'description', 'extension', 'generated', 'unused'];

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
      candidates = HAS_CANONICAL;
      break;
    case 'generator':
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
export const QUERY_QUALIFIERS = [
  { qualifier: 'type:', desc: 'Filter by token type', example: 'type:color' },
  { qualifier: 'has:alias', desc: 'Only reference tokens', example: '' },
  { qualifier: 'has:direct', desc: 'Only direct-value tokens', example: '' },
  { qualifier: 'has:duplicate', desc: 'Only tokens with duplicate values', example: '' },
  { qualifier: 'has:description', desc: 'Only tokens with a description', example: '' },
  { qualifier: 'has:extension', desc: 'Only tokens with extensions', example: '' },
  { qualifier: 'has:generated', desc: 'Only generator-produced tokens', example: '' },
  { qualifier: 'has:unused', desc: 'Tokens with no Figma usage and no alias dependents', example: '' },
  { qualifier: 'value:', desc: 'Search within token values', example: 'value:#ff0000' },
  { qualifier: 'desc:', desc: 'Search within descriptions', example: 'desc:primary' },
  { qualifier: 'path:', desc: 'Filter by path prefix', example: 'path:colors.brand' },
  { qualifier: 'name:', desc: 'Search by leaf name only', example: 'name:500' },
  { qualifier: 'generator:', desc: 'Filter by generator name', example: 'generator:color-ramp' },
  { qualifier: 'group:', desc: 'Navigate to a group path', example: 'group:colors.brand' },
];

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
    || parsed.generators.length > 0;

  if (hasQualifiers) {
    return filterTokenNodesStructured(nodes, parsed, typeFilter, refFilter, duplicateValuePaths, derivedTokenPaths, unusedTokenPaths);
  }

  // Fast path: plain text search (no qualifiers)
  const q = parsed.text.toLowerCase();
  const result: TokenNode[] = [];
  for (const node of nodes) {
    if (node.isGroup) {
      const filteredChildren = filterTokenNodes(node.children ?? [], searchQuery, typeFilter, refFilter, duplicateValuePaths, derivedTokenPaths, unusedTokenPaths);
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
      const filtered = filterTokenNodesStructured(node.children ?? [], parsed, typeFilter, refFilter, duplicateValuePaths, derivedTokenPaths, unusedTokenPaths);
      if (filtered.length > 0) result.push({ ...node, children: filtered });
    } else {
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
        if ((h === 'generated' || h === 'gen') && !derivedTokenPaths?.has(node.path)) { hasMatch = false; break; }
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

      // generator: qualifier — match by generator name
      if (parsed.generators.length > 0) {
        const gen = derivedTokenPaths?.get(node.path);
        if (!gen) continue;
        const gn = gen.name.toLowerCase();
        if (!parsed.generators.some(g => gn === g || gn.includes(g))) continue;
      }

      result.push(node);
    }
  }
  return result;
}

export function sortTokenNodes(nodes: TokenNode[], order: SortOrder): TokenNode[] {
  if (order === 'default' || order === 'by-usage') return nodes;
  const sorted = [...nodes].sort((a, b) => {
    switch (order) {
      case 'alpha-asc': return a.name.localeCompare(b.name);
      case 'alpha-desc': return b.name.localeCompare(a.name);
      case 'by-type': {
        const tc = (a.$type || '').localeCompare(b.$type || '');
        return tc !== 0 ? tc : a.name.localeCompare(b.name);
      }
      case 'by-value': {
        const av = typeof a.$value === 'string' ? a.$value : JSON.stringify(a.$value ?? '');
        const bv = typeof b.$value === 'string' ? b.$value : JSON.stringify(b.$value ?? '');
        return av.localeCompare(bv);
      }
      default: return 0;
    }
  });
  return sorted.map(node => ({
    ...node,
    children: node.children ? sortTokenNodes(node.children, order) : undefined,
  }));
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
  allTokensFlat: Record<string, TokenMapEntry>,
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

/**
 * Build a tree of TokenNodes grouped by $type from a flat token map.
 * Used in "simple mode" to merge all tokens across sets by type.
 */
export function buildTreeByType(flat: Record<string, TokenMapEntry>): TokenNode[] {
  const byType = new Map<string, TokenNode[]>();
  for (const [path, entry] of Object.entries(flat)) {
    const t = entry.$type || 'unknown';
    if (!byType.has(t)) byType.set(t, []);
    const parts = path.split('.');
    byType.get(t)!.push({
      path,
      name: parts[parts.length - 1],
      $type: entry.$type,
      $value: entry.$value,
      isGroup: false,
    });
  }
  const groups: TokenNode[] = [];
  for (const [type, children] of byType) {
    groups.push({ path: type, name: type, isGroup: true, $type: type, children });
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}
