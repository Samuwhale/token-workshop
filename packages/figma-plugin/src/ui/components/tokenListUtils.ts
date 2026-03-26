import type { TokenNode } from '../hooks/useTokens';
import { isAlias } from '../../shared/resolveAlias';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortOrder = 'default' | 'alpha-asc' | 'alpha-desc' | 'by-type' | 'by-value' | 'by-usage';

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
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    if ('value' in value && 'unit' in value) return `${value.value}${value.unit}`;
    if (type === 'typography') {
      const size = typeof value.fontSize === 'object'
        ? `${value.fontSize.value}${value.fontSize.unit}`
        : value.fontSize ? String(value.fontSize) : '';
      const weight = value.fontWeight != null ? String(value.fontWeight) : '';
      const family = value.fontFamily ? String(value.fontFamily) : '';
      return [family, size, weight].filter(Boolean).join(' / ');
    }
    if (type === 'shadow') {
      const s = Array.isArray(value) ? value[0] : value;
      if (s && typeof s === 'object') {
        const x = s.offsetX ?? s.x ?? '0';
        const y = s.offsetY ?? s.y ?? '0';
        const blur = s.blur ?? s.blurRadius ?? '0';
        const prefix = Array.isArray(value) && value.length > 1 ? `×${value.length} ` : '';
        return `${prefix}${x} ${y} ${blur}`;
      }
      return 'Shadow';
    }
    if (type === 'gradient') {
      if (value.gradientType) return String(value.gradientType);
      if (Array.isArray(value.stops)) return `${value.stops.length} stops`;
      return 'Gradient';
    }
    if (type === 'border') {
      const w = value.width
        ? (typeof value.width === 'object' ? `${value.width.value}${value.width.unit}` : String(value.width))
        : '';
      const style = value.style ? String(value.style) : '';
      return [w, style].filter(Boolean).join(' ') || 'Border';
    }
    return JSON.stringify(value).slice(0, 30);
  }
  return String(value);
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
): TokenNode[] {
  const q = searchQuery.toLowerCase();
  const result: TokenNode[] = [];
  for (const node of nodes) {
    if (node.isGroup) {
      const filteredChildren = filterTokenNodes(node.children ?? [], searchQuery, typeFilter, refFilter);
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
    default: return '';
  }
}
