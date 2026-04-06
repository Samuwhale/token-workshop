// Consistency scanner: find nodes with values close-but-not-exactly a token value
import { ALL_BINDABLE_PROPERTIES, type TokenMapEntry, type ResolvedTokenValue, type ConsistencyMatch, type ConsistencySuggestion } from '../shared/types.js';
import { PLUGIN_DATA_NAMESPACE } from './constants.js';
import { rgbToHex, parseDimValue, parseHexRaw } from './colorUtils.js';
import { walkNodes, VISUAL_TYPES } from './walkNodes.js';

export type { ConsistencyMatch, ConsistencySuggestion };

// Color: RGB Euclidean distance thresholds (out of max ~441)
// "2% off" ≈ 5.1 per channel → max dist ≈ 8.8 → use 10 for a bit of leeway
const COLOR_NEAR_MAX = 10;
// Below this is considered an exact match (floating point / rounding noise)
const COLOR_EXACT_MAX = 0.5;

// Dimension: within 1 unit (px)
const DIM_NEAR_MAX = 1;

// Opacity / number: within 2% absolute
const OPACITY_NEAR_MAX = 0.02;

function colorDist(hex1: string, hex2: string): number {
  const c1 = parseHexRaw(hex1.replace('#', ''));
  const c2 = parseHexRaw(hex2.replace('#', ''));
  if (!c1 || !c2) return Infinity;
  // parseHexRaw returns 0-1 values; scale to 0-255 for Euclidean distance
  const dr = (c1.rgb.r - c2.rgb.r) * 255;
  const dg = (c1.rgb.g - c2.rgb.g) * 255;
  const db = (c1.rgb.b - c2.rgb.b) * 255;
  return Math.sqrt(dr ** 2 + dg ** 2 + db ** 2);
}

// ---------------------------------------------------------------------------
// Reverse-index helpers — reduce per-node lookup from O(tokens) to O(1) avg
// ---------------------------------------------------------------------------

/** Spatial hash for color tokens. Buckets by quantized RGB (bucket size = COLOR_NEAR_MAX). */
interface ColorEntry { path: string; hex: string; r: number; g: number; b: number }

const COLOR_BUCKET_SIZE = COLOR_NEAR_MAX; // 10

function buildColorIndex(colorTokens: [string, TokenMapEntry][]) {
  const buckets = new Map<string, ColorEntry[]>();

  for (const [path, entry] of colorTokens) {
    const hex = typeof entry.$value === 'string' ? entry.$value : null;
    if (!hex) continue;
    const c = parseHexRaw(hex.replace('#', ''));
    if (!c) continue;
    const r = c.rgb.r * 255, g = c.rgb.g * 255, b = c.rgb.b * 255;
    const bk = bucketKey(r, g, b);
    let arr = buckets.get(bk);
    if (!arr) { arr = []; buckets.set(bk, arr); }
    arr.push({ path, hex, r, g, b });
  }

  return { buckets };
}

function bucketKey(r: number, g: number, b: number): string {
  return `${Math.floor(r / COLOR_BUCKET_SIZE)},${Math.floor(g / COLOR_BUCKET_SIZE)},${Math.floor(b / COLOR_BUCKET_SIZE)}`;
}

/** Return all color tokens within COLOR_NEAR_MAX of the given hex (excluding exact matches). */
function queryColorIndex(
  index: { buckets: Map<string, ColorEntry[]> },
  hex: string,
): ColorEntry[] {
  const c = parseHexRaw(hex.replace('#', ''));
  if (!c) return [];
  const r = c.rgb.r * 255, g = c.rgb.g * 255, b = c.rgb.b * 255;
  const br = Math.floor(r / COLOR_BUCKET_SIZE);
  const bg = Math.floor(g / COLOR_BUCKET_SIZE);
  const bb = Math.floor(b / COLOR_BUCKET_SIZE);
  const results: ColorEntry[] = [];

  // Check 3×3×3 neighboring buckets to cover the distance threshold
  for (let dr = -1; dr <= 1; dr++) {
    for (let dg = -1; dg <= 1; dg++) {
      for (let db = -1; db <= 1; db++) {
        const key = `${br + dr},${bg + dg},${bb + db}`;
        const entries = index.buckets.get(key);
        if (!entries) continue;
        for (const e of entries) {
          const dist = Math.sqrt((r - e.r) ** 2 + (g - e.g) ** 2 + (b - e.b) ** 2);
          if (dist > COLOR_EXACT_MAX && dist <= COLOR_NEAR_MAX) {
            results.push(e);
          }
        }
      }
    }
  }
  return results;
}

/** Sorted numeric index for dimension/number tokens — supports range queries via binary search. */
interface NumericEntry { path: string; rawValue: ResolvedTokenValue; num: number }

function buildSortedNumericIndex(
  tokens: [string, TokenMapEntry][],
  parseValue: (v: ResolvedTokenValue) => number,
): NumericEntry[] {
  const entries: NumericEntry[] = [];
  for (const [path, entry] of tokens) {
    const val = entry.$value as ResolvedTokenValue;
    const num = parseValue(val);
    if (Number.isNaN(num) || num <= 0) continue;
    entries.push({ path, rawValue: val, num });
  }
  entries.sort((a, b) => a.num - b.num);
  return entries;
}

/** Binary search: index of first entry with num >= target. */
function lowerBound(arr: NumericEntry[], target: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].num < target) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** Return all entries within (0, threshold] of val. */
function queryNumericIndex(
  sorted: NumericEntry[],
  val: number,
  threshold: number,
): NumericEntry[] {
  const lo = lowerBound(sorted, val - threshold);
  const hi = lowerBound(sorted, val + threshold + 1e-9); // +epsilon to include boundary
  const results: NumericEntry[] = [];
  for (let i = lo; i < hi; i++) {
    const diff = Math.abs(val - sorted[i].num);
    if (diff > 0 && diff <= threshold) results.push(sorted[i]);
  }
  return results;
}

// ---------------------------------------------------------------------------

export async function scanConsistency(
  tokenMap: Record<string, TokenMapEntry>,
  scope: 'selection' | 'page' | 'all-pages',
  signal?: { aborted: boolean },
) {
  // Abort if the user navigates to a different page mid-scan (only relevant for
  // page/selection scopes where figma.currentPage is captured at scan start).
  let pageChangeHandler: (() => void) | null = null;
  if (scope !== 'all-pages' && signal) {
    pageChangeHandler = () => { signal.aborted = true; };
    figma.on('currentpagechange', pageChangeHandler);
  }
  try {
    // Collect nodes
    const nodes: SceneNode[] = [];
    if (scope === 'all-pages') {
      for (const page of figma.root.children) {
        for await (const node of walkNodes(page.children, { filter: VISUAL_TYPES, signal })) {
          nodes.push(node);
        }
        if (signal?.aborted) break;
      }
    } else {
      const roots = scope === 'selection'
        ? figma.currentPage.selection
        : figma.currentPage.children;
      for await (const node of walkNodes(roots, { filter: VISUAL_TYPES, signal })) {
        nodes.push(node);
      }
    }

    if (signal?.aborted) {
      figma.ui.postMessage({ type: 'consistency-scan-cancelled' });
      return;
    }

    // Build reverse indexes upfront — O(tokens) once, then O(1) or O(log tokens) per lookup
    const colorTokens: [string, TokenMapEntry][] = [];
    const dimTokens: [string, TokenMapEntry][] = [];
    const numTokens: [string, TokenMapEntry][] = [];
    const fontWeightTokens: [string, TokenMapEntry][] = [];
    // fontFamily: string exact-match index — normalized lowercase → [{path, value}]
    const fontFamilyIndex = new Map<string, { path: string; value: string }[]>();
    for (const [path, entry] of Object.entries(tokenMap)) {
      if (entry.$type === 'color') colorTokens.push([path, entry]);
      // dimension + specific typography subtypes all feed the numeric dimension index
      else if (['dimension', 'fontSize', 'lineHeight', 'letterSpacing'].includes(entry.$type)) dimTokens.push([path, entry]);
      else if (entry.$type === 'number') numTokens.push([path, entry]);
      else if (entry.$type === 'fontWeight') fontWeightTokens.push([path, entry]);
      else if (entry.$type === 'fontFamily' && typeof entry.$value === 'string') {
        const key = entry.$value.toLowerCase();
        let arr = fontFamilyIndex.get(key);
        if (!arr) { arr = []; fontFamilyIndex.set(key, arr); }
        arr.push({ path, value: entry.$value });
      }
    }

    const colorIndex = buildColorIndex(colorTokens);
    const dimIndex = buildSortedNumericIndex(dimTokens, (v) => parseDimValue(v as Parameters<typeof parseDimValue>[0]));
    const numIndex = buildSortedNumericIndex(numTokens, (v) =>
      typeof v === 'number' ? v : parseFloat(String(v)),
    );
    const fontWeightIndex = buildSortedNumericIndex(fontWeightTokens, (v) =>
      typeof v === 'number' ? v : parseFloat(String(v)),
    );

    // key = `${tokenPath}::${property}`
    const suggestionMap = new Map<string, ConsistencySuggestion>();

    const addMatch = (
      tokenPath: string,
      tokenType: string,
      tokenValue: ResolvedTokenValue,
      property: string,
      match: ConsistencyMatch,
    ) => {
      const key = `${tokenPath}::${property}`;
      if (!suggestionMap.has(key)) {
        suggestionMap.set(key, { tokenPath, tokenType, tokenValue, property, matches: [] });
      }
      suggestionMap.get(key)!.matches.push(match);
    };

    const BATCH_SIZE = 100;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const n = node as Record<string, unknown>;

      // Read existing bindings to skip already-tokenized properties
      const bound = new Set<string>();
      for (const prop of ALL_BINDABLE_PROPERTIES) {
        const val = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop);
        if (val) bound.add(prop);
      }
      // Also consider Figma native variable bindings
      const nativeBound = (node as Record<string, unknown>)['boundVariables'] as Record<string, unknown> | undefined;
      if (nativeBound) {
        for (const k of Object.keys(nativeBound)) {
          const v = nativeBound[k];
          if (v && (typeof v === 'object') && ('id' in (v as object) || Array.isArray(v))) {
            bound.add(k);
          }
        }
      }

      // --- Fill color (spatial hash lookup) ---
      if (!bound.has('fill') && !bound.has('fills') && 'fills' in node) {
        const fills = n['fills'];
        if (Array.isArray(fills) && fills.length > 0 && fills[0].type === 'SOLID') {
          const hex = rgbToHex(fills[0].color as RGB, fills[0].opacity ?? 1);
          for (const hit of queryColorIndex(colorIndex, hex)) {
            addMatch(hit.path, 'color', hit.hex, 'fill', {
              nodeId: node.id, nodeName: node.name, nodeType: node.type,
              property: 'fill', actualValue: hex, tokenValue: hit.hex,
            });
          }
        }
      }

      // --- Stroke color (spatial hash lookup) ---
      if (!bound.has('stroke') && !bound.has('strokes') && 'strokes' in node) {
        const strokes = n['strokes'];
        if (Array.isArray(strokes) && strokes.length > 0 && strokes[0].type === 'SOLID') {
          const hex = rgbToHex(strokes[0].color as RGB, strokes[0].opacity ?? 1);
          for (const hit of queryColorIndex(colorIndex, hex)) {
            addMatch(hit.path, 'color', hit.hex, 'stroke', {
              nodeId: node.id, nodeName: node.name, nodeType: node.type,
              property: 'stroke', actualValue: hex, tokenValue: hit.hex,
            });
          }
        }
      }

      // --- Numeric dimension properties (binary search lookup) ---
      const dimBindProps: { figmaProp: string; bindKey: string }[] = [
        { figmaProp: 'cornerRadius', bindKey: 'cornerRadius' },
        { figmaProp: 'strokeWeight', bindKey: 'strokeWeight' },
        { figmaProp: 'paddingTop', bindKey: 'paddingTop' },
        { figmaProp: 'paddingRight', bindKey: 'paddingRight' },
        { figmaProp: 'paddingBottom', bindKey: 'paddingBottom' },
        { figmaProp: 'paddingLeft', bindKey: 'paddingLeft' },
        { figmaProp: 'itemSpacing', bindKey: 'itemSpacing' },
      ];
      for (const { figmaProp, bindKey } of dimBindProps) {
        if (bound.has(bindKey)) continue;
        if (!(figmaProp in node)) continue;
        const val = n[figmaProp];
        if (typeof val !== 'number' || val <= 0) continue;
        for (const hit of queryNumericIndex(dimIndex, val, DIM_NEAR_MAX)) {
          addMatch(hit.path, 'dimension', hit.rawValue, bindKey, {
            nodeId: node.id, nodeName: node.name, nodeType: node.type,
            property: bindKey, actualValue: val, tokenValue: hit.num,
          });
        }
      }

      // --- Opacity (binary search lookup) ---
      if (!bound.has('opacity') && 'opacity' in node) {
        const val = n['opacity'];
        if (typeof val === 'number' && val < 1) {
          for (const hit of queryNumericIndex(numIndex, val, OPACITY_NEAR_MAX)) {
            addMatch(hit.path, 'number', hit.rawValue, 'opacity', {
              nodeId: node.id, nodeName: node.name, nodeType: node.type,
              property: 'opacity', actualValue: val, tokenValue: hit.num,
            });
          }
        }
      }

      // --- Typography properties (TEXT nodes only) ---
      if (node.type === 'TEXT') {
        // Font family (exact string match)
        if (!bound.has('fontFamily') && !bound.has('typography') && 'fontName' in node) {
          const fontName = n['fontName'];
          if (fontName && typeof fontName === 'object' && !Array.isArray(fontName) && 'family' in (fontName as object)) {
            const family = (fontName as { family: string }).family;
            const hits = fontFamilyIndex.get(family.toLowerCase());
            if (hits) {
              for (const hit of hits) {
                addMatch(hit.path, 'fontFamily', hit.value, 'fontFamily', {
                  nodeId: node.id, nodeName: node.name, nodeType: node.type,
                  property: 'fontFamily', actualValue: family, tokenValue: hit.value,
                });
              }
            }
          }
        }

        // Font size
        if (!bound.has('fontSize') && 'fontSize' in node) {
          const val = n['fontSize'];
          if (typeof val === 'number' && val > 0) {
            for (const hit of queryNumericIndex(dimIndex, val, DIM_NEAR_MAX)) {
              addMatch(hit.path, 'dimension', hit.rawValue, 'fontSize', {
                nodeId: node.id, nodeName: node.name, nodeType: node.type,
                property: 'fontSize', actualValue: val, tokenValue: hit.num,
              });
            }
          }
        }

        // Font weight
        if (!bound.has('fontWeight') && 'fontWeight' in node) {
          const val = n['fontWeight'];
          if (typeof val === 'number' && val > 0) {
            // Font weight values are multiples of 100; threshold of 50 covers rounding
            for (const hit of queryNumericIndex(fontWeightIndex, val, 50)) {
              addMatch(hit.path, 'fontWeight', hit.rawValue, 'fontWeight', {
                nodeId: node.id, nodeName: node.name, nodeType: node.type,
                property: 'fontWeight', actualValue: val, tokenValue: hit.num,
              });
            }
          }
        }

        // Line height (pixels only)
        if (!bound.has('lineHeight') && 'lineHeight' in node) {
          const lh = n['lineHeight'];
          if (lh && typeof lh === 'object' && !Array.isArray(lh)) {
            const lineHeight = lh as { unit: string; value?: number };
            if (lineHeight.unit === 'PIXELS' && typeof lineHeight.value === 'number' && lineHeight.value > 0) {
              for (const hit of queryNumericIndex(dimIndex, lineHeight.value, DIM_NEAR_MAX)) {
                addMatch(hit.path, 'dimension', hit.rawValue, 'lineHeight', {
                  nodeId: node.id, nodeName: node.name, nodeType: node.type,
                  property: 'lineHeight', actualValue: lineHeight.value, tokenValue: hit.num,
                });
              }
            }
          }
        }

        // Letter spacing (pixels only)
        if (!bound.has('letterSpacing') && 'letterSpacing' in node) {
          const ls = n['letterSpacing'];
          if (ls && typeof ls === 'object' && !Array.isArray(ls)) {
            const letterSpacing = ls as { unit: string; value: number };
            if (letterSpacing.unit === 'PIXELS' && typeof letterSpacing.value === 'number' && letterSpacing.value !== 0) {
              const absVal = Math.abs(letterSpacing.value);
              for (const hit of queryNumericIndex(dimIndex, absVal, DIM_NEAR_MAX)) {
                addMatch(hit.path, 'dimension', hit.rawValue, 'letterSpacing', {
                  nodeId: node.id, nodeName: node.name, nodeType: node.type,
                  property: 'letterSpacing', actualValue: letterSpacing.value, tokenValue: hit.num,
                });
              }
            }
          }
        }
      }

      // Progress
      if ((i + 1) % BATCH_SIZE === 0) {
        figma.ui.postMessage({
          type: 'consistency-scan-progress',
          processed: i + 1,
          total: nodes.length,
        });
        await new Promise<void>(r => setTimeout(r, 0));
        if (signal?.aborted) {
          figma.ui.postMessage({ type: 'consistency-scan-cancelled' });
          return;
        }
      }
    }

    const suggestions = Array.from(suggestionMap.values())
      .sort((a, b) => b.matches.length - a.matches.length);

    figma.ui.postMessage({
      type: 'consistency-scan-result',
      suggestions,
      totalNodes: nodes.length,
    });
  } catch (error) {
    figma.ui.postMessage({ type: 'consistency-scan-error', error: String(error) });
  } finally {
    if (pageChangeHandler) figma.off('currentpagechange', pageChangeHandler);
  }
}
