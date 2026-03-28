// Consistency scanner: find nodes with values close-but-not-exactly a token value
import { ALL_BINDABLE_PROPERTIES } from '../shared/types.js';
import { PLUGIN_DATA_NAMESPACE } from './constants.js';
import { rgbToHex, parseDimValue } from './colorUtils.js';

export interface ConsistencyMatch {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  property: string;
  actualValue: string | number;
  tokenValue: string | number;
}

export interface ConsistencySuggestion {
  tokenPath: string;
  tokenType: string;
  tokenValue: any;
  property: string;
  matches: ConsistencyMatch[];
}

// Color: RGB Euclidean distance thresholds (out of max ~441)
// "2% off" ≈ 5.1 per channel → max dist ≈ 8.8 → use 10 for a bit of leeway
const COLOR_NEAR_MAX = 10;
// Below this is considered an exact match (floating point / rounding noise)
const COLOR_EXACT_MAX = 0.5;

// Dimension: within 1 unit (px)
const DIM_NEAR_MAX = 1;

// Opacity / number: within 2% absolute
const OPACITY_NEAR_MAX = 0.02;

function hexToRgb255(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '');
  if (h.length < 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function colorDist(hex1: string, hex2: string): number {
  const c1 = hexToRgb255(hex1);
  const c2 = hexToRgb255(hex2);
  if (!c1 || !c2) return Infinity;
  return Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2);
}

export async function scanConsistency(
  tokenMap: Record<string, { $value: any; $type: string }>,
  scope: 'selection' | 'page',
) {
  try {
    const VISUAL_TYPES = new Set([
      'FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE',
      'RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'VECTOR', 'LINE', 'TEXT',
    ]);

    // Collect nodes
    const nodes: SceneNode[] = [];
    if (scope === 'selection') {
      const stack: SceneNode[] = [...figma.currentPage.selection];
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (VISUAL_TYPES.has(node.type)) nodes.push(node);
        if ('children' in node) {
          for (const child of (node as ChildrenMixin).children) {
            stack.push(child as SceneNode);
          }
        }
      }
    } else {
      const BATCH_SIZE = 200;
      const walkStack: SceneNode[] = [...figma.currentPage.children];
      let walkCount = 0;
      while (walkStack.length > 0) {
        const current = walkStack.pop()!;
        if (VISUAL_TYPES.has(current.type)) nodes.push(current);
        if ('children' in current) {
          const c = current as ChildrenMixin & SceneNode;
          for (let i = c.children.length - 1; i >= 0; i--) {
            walkStack.push(c.children[i] as SceneNode);
          }
        }
        walkCount++;
        if (walkCount % BATCH_SIZE === 0) {
          await new Promise<void>(r => setTimeout(r, 0));
        }
      }
    }

    // Pre-bucket tokens by type
    const colorTokens: [string, { $value: any; $type: string }][] = [];
    const dimTokens: [string, { $value: any; $type: string }][] = [];
    const numTokens: [string, { $value: any; $type: string }][] = [];
    for (const [path, entry] of Object.entries(tokenMap)) {
      if (entry.$type === 'color') colorTokens.push([path, entry]);
      else if (entry.$type === 'dimension') dimTokens.push([path, entry]);
      else if (entry.$type === 'number') numTokens.push([path, entry]);
    }

    // key = `${tokenPath}::${property}`
    const suggestionMap = new Map<string, ConsistencySuggestion>();

    const addMatch = (
      tokenPath: string,
      tokenType: string,
      tokenValue: any,
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

      // --- Fill color ---
      if (!bound.has('fill') && !bound.has('fills') && 'fills' in node) {
        const fills = n['fills'];
        if (Array.isArray(fills) && fills.length > 0 && fills[0].type === 'SOLID') {
          const hex = rgbToHex(fills[0].color as RGB, fills[0].opacity ?? 1);
          for (const [tokenPath, entry] of colorTokens) {
            const tokenHex = typeof entry.$value === 'string' ? entry.$value : null;
            if (!tokenHex) continue;
            const dist = colorDist(hex, tokenHex);
            if (dist > COLOR_EXACT_MAX && dist <= COLOR_NEAR_MAX) {
              addMatch(tokenPath, 'color', tokenHex, 'fill', {
                nodeId: node.id, nodeName: node.name, nodeType: node.type,
                property: 'fill', actualValue: hex, tokenValue: tokenHex,
              });
            }
          }
        }
      }

      // --- Stroke color ---
      if (!bound.has('stroke') && !bound.has('strokes') && 'strokes' in node) {
        const strokes = n['strokes'];
        if (Array.isArray(strokes) && strokes.length > 0 && strokes[0].type === 'SOLID') {
          const hex = rgbToHex(strokes[0].color as RGB, strokes[0].opacity ?? 1);
          for (const [tokenPath, entry] of colorTokens) {
            const tokenHex = typeof entry.$value === 'string' ? entry.$value : null;
            if (!tokenHex) continue;
            const dist = colorDist(hex, tokenHex);
            if (dist > COLOR_EXACT_MAX && dist <= COLOR_NEAR_MAX) {
              addMatch(tokenPath, 'color', tokenHex, 'stroke', {
                nodeId: node.id, nodeName: node.name, nodeType: node.type,
                property: 'stroke', actualValue: hex, tokenValue: tokenHex,
              });
            }
          }
        }
      }

      // --- Numeric dimension properties ---
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
        // Skip Figma's "mixed" symbol (which is a Symbol, not a number)
        for (const [tokenPath, entry] of dimTokens) {
          const tokenNum = parseDimValue(entry.$value);
          if (tokenNum <= 0) continue;
          const diff = Math.abs(val - tokenNum);
          if (diff > 0 && diff <= DIM_NEAR_MAX) {
            addMatch(tokenPath, 'dimension', entry.$value, bindKey, {
              nodeId: node.id, nodeName: node.name, nodeType: node.type,
              property: bindKey, actualValue: val, tokenValue: tokenNum,
            });
          }
        }
      }

      // --- Opacity ---
      if (!bound.has('opacity') && 'opacity' in node) {
        const val = n['opacity'];
        if (typeof val === 'number' && val < 1) {
          for (const [tokenPath, entry] of numTokens) {
            const tokenNum = typeof entry.$value === 'number'
              ? entry.$value
              : parseFloat(String(entry.$value));
            if (Number.isNaN(tokenNum)) continue;
            const diff = Math.abs(val - tokenNum);
            if (diff > 0 && diff <= OPACITY_NEAR_MAX) {
              addMatch(tokenPath, 'number', entry.$value, 'opacity', {
                nodeId: node.id, nodeName: node.name, nodeType: node.type,
                property: 'opacity', actualValue: val, tokenValue: tokenNum,
              });
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
  }
}
