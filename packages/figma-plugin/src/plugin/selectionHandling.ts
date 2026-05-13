import { ALL_BINDABLE_PROPERTIES, getCompositionPropertyType } from '../shared/types.js';
import type { ExtractedTokenEntry, NodeCapabilities, NodeCurrentValues, SelectionNodeInfo, TokenMapEntry, ResolvedTokenValue, TypographyValue, DimensionValue, BorderValue, ShadowTokenValue } from '../shared/types.js';
import { isAlias, resolveTokenValue } from '../shared/resolveAlias.js';
import { cloneValue } from '../shared/clone.js';
import { coerceBooleanValue, getErrorMessage } from '../shared/utils.js';
import { PLUGIN_DATA_NAMESPACE } from './constants.js';
import { parseColor, rgbToHex, shadowTokenToEffects } from './colorUtils.js';
import { resolveFontStyle, fontStyleToWeight } from './fontLoading.js';
import { findNearestMainComponent, iconSlotLabelFromNodeName, isIconSlotCandidateNode } from './iconSlotUtils.js';
import { walkNodes } from './walkNodes.js';

let selectionDeepInspectEnabled = false;

export function setSelectionDeepInspectEnabled(enabled: boolean): void {
  selectionDeepInspectEnabled = enabled;
}

type DynamicSceneNode = SceneNode & Record<string, unknown>;

function getNodeProperty<T>(node: SceneNode, property: string): T | undefined {
  return (node as DynamicSceneNode)[property] as T | undefined;
}

function setNodeProperty(
  node: SceneNode,
  property: string,
  value: unknown,
): void {
  (node as DynamicSceneNode)[property] = value;
}

function setDimensionProperty(
  node: SceneNode,
  property: string,
  value: string | number | DimensionValue | null | undefined,
): void {
  if (property in node) {
    setNodeProperty(node, property, parseRequiredDimensionValue(value, property));
  }
}

function getFirstSolidPaint(
  node: SceneNode,
  property: 'fills' | 'strokes',
): SolidPaint | null {
  const paints = getNodeProperty<readonly Paint[]>(node, property);
  if (!Array.isArray(paints) || paints.length === 0) {
    return null;
  }
  const firstPaint = paints[0];
  return firstPaint.type === 'SOLID' ? firstPaint : null;
}

function hasStoredBinding(node: SceneNode, property: string): boolean {
  return Boolean(node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, property));
}

function clearStoredBinding(node: SceneNode, property: string): void {
  node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, property, '');
  node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, `${property}:collection`, '');
}

function setStoredBinding(
  node: SceneNode,
  property: string,
  tokenPath: string,
  collectionId?: string,
): void {
  node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, property, tokenPath);
  node.setSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    `${property}:collection`,
    collectionId ?? '',
  );
}

function parseRequiredDimensionValue(
  value: string | number | DimensionValue | null | undefined,
  property: string,
): number {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string') {
    parsed = Number.parseFloat(value);
  } else if (value != null && typeof value === 'object' && 'value' in value) {
    parsed = Number((value as DimensionValue).value);
  } else {
    parsed = Number.NaN;
  }
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${property} value`);
  }
  return parsed;
}

// Apply a resolved token value to a specific node property
export async function applyTokenValue(node: SceneNode, property: string, value: ResolvedTokenValue, tokenType: string) {
  switch (property) {
    case 'fill':
      if ('fills' in node) {
        const colorVal = value as (Record<string, unknown> | string | null);
        const color = parseColor(typeof value === 'string' ? value : (colorVal as { color?: string })?.color as string || value as string);
        if (!color) {
          throw new Error('Invalid fill color value');
        }
        (node as GeometryMixin & SceneNode).fills = [{ type: 'SOLID', color: color.rgb, opacity: color.a }];
      }
      break;

    case 'stroke':
      if ('strokes' in node) {
        const strokeNode = node as GeometryMixin & SceneNode;
        if (tokenType === 'border' && typeof value === 'object' && value !== null) {
          const borderVal = value as BorderValue;
          const color = parseColor(borderVal.color);
          if (!color) {
            throw new Error('Invalid border color value');
          }
          strokeNode.strokes = [{ type: 'SOLID', color: color.rgb, opacity: color.a }];
          if (borderVal.width != null) {
            setDimensionProperty(node, 'strokeWeight', borderVal.width);
          }
          if ('dashPattern' in node) {
            setNodeProperty(node, 'dashPattern', borderVal.style === 'dashed' ? [8, 8] : []);
          }
        } else {
          const colorVal = value as (Record<string, unknown> | string | null);
          const color = parseColor(typeof value === 'string' ? value : (colorVal as { color?: string })?.color as string || value as string);
          if (!color) {
            throw new Error('Invalid stroke color value');
          }
          strokeNode.strokes = [{ type: 'SOLID', color: color.rgb, opacity: color.a }];
        }
      }
      break;

    case 'width':
      if ('resize' in node) {
        const w = parseRequiredDimensionValue(value as string | number | DimensionValue | null, 'width');
        const resizableW = node as SceneNode & { resize(w: number, h: number): void; height: number };
        resizableW.resize(w, resizableW.height);
      }
      break;

    case 'height':
      if ('resize' in node) {
        const h = parseRequiredDimensionValue(value as string | number | DimensionValue | null, 'height');
        const resizableH = node as SceneNode & { resize(w: number, h: number): void; width: number };
        resizableH.resize(resizableH.width, h);
      }
      break;

    case 'paddingTop':
      setDimensionProperty(node, 'paddingTop', value as string | number | DimensionValue | null);
      break;
    case 'paddingRight':
      setDimensionProperty(node, 'paddingRight', value as string | number | DimensionValue | null);
      break;
    case 'paddingBottom':
      setDimensionProperty(node, 'paddingBottom', value as string | number | DimensionValue | null);
      break;
    case 'paddingLeft':
      setDimensionProperty(node, 'paddingLeft', value as string | number | DimensionValue | null);
      break;

    case 'itemSpacing':
      setDimensionProperty(node, 'itemSpacing', value as string | number | DimensionValue | null);
      break;

    case 'cornerRadius':
      setDimensionProperty(node, 'cornerRadius', value as string | number | DimensionValue | null);
      break;

    case 'strokeWeight':
      setDimensionProperty(node, 'strokeWeight', value as string | number | DimensionValue | null);
      break;

    case 'opacity':
      if ('opacity' in node) {
        let num = typeof value === 'number' ? value : parseFloat(String(value));
        // DTCG number tokens for opacity should be 0–1, but values > 1 indicate
        // a percentage (0–100) — normalize to 0–1 to avoid silent clamping.
        if (!isNaN(num)) {
          if (num > 1) num = num / 100;
          setNodeProperty(node, 'opacity', Math.max(0, Math.min(1, num)));
        }
      }
      break;

    case 'typography':
      if (node.type === 'TEXT') {
        const textNode = node as TextNode;
        if (value == null || typeof value !== 'object' || Array.isArray(value)) break;
        const val = value as TypographyValue;
        try {
          const family = (Array.isArray(val.fontFamily) ? val.fontFamily[0] : val.fontFamily) || 'Inter';
          const style = await resolveFontStyle(family, {
            weight: val.fontWeight,
            fontStyle: val.fontStyle,
          });
          await figma.loadFontAsync({ family, style });
          textNode.fontName = { family, style };
          if (val.fontSize != null) textNode.fontSize = typeof val.fontSize === 'object' ? val.fontSize.value : val.fontSize;
          if (val.lineHeight != null) {
            if (typeof val.lineHeight === 'number') {
              // DTCG spec: unitless lineHeight is a multiplier (1.5 = 150%)
              textNode.lineHeight = { unit: 'PERCENT', value: val.lineHeight * 100 };
            } else if (val.lineHeight?.unit === 'px') {
              textNode.lineHeight = { unit: 'PIXELS', value: val.lineHeight.value };
            } else if (val.lineHeight?.unit === '%') {
              textNode.lineHeight = { unit: 'PERCENT', value: val.lineHeight.value };
            }
          }
          if (val.letterSpacing != null) {
            textNode.letterSpacing = { unit: 'PIXELS', value: typeof val.letterSpacing === 'object' ? val.letterSpacing.value : val.letterSpacing };
          }
        } catch (err) {
          throw new Error(`Font not available: ${getErrorMessage(err)}`);
        }
      }
      break;

    case 'shadow':
      if ('effects' in node) {
        setNodeProperty(node, 'effects', shadowTokenToEffects(value as ShadowTokenValue | ShadowTokenValue[]));
      }
      break;

    case 'visible':
      node.visible = coerceBooleanValue(value);
      break;

    case 'composition': {
      const compVal = value != null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
      for (const [prop, propVal] of Object.entries(compVal)) {
        await applyTokenValue(node, prop, propVal, getCompositionPropertyType(prop));
      }
      break;
    }
  }
}

// Apply token to selected nodes
export async function applyToSelection(
  tokenPath: string,
  tokenType: string,
  targetProperty: string,
  resolvedValue: ResolvedTokenValue,
  collectionId?: string,
) {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify('Select a layer first');
    return;
  }

  let applied = 0;
  const errors: string[] = [];
  for (const node of selection) {
    // Snapshot the relevant property before mutating so we can roll back on failure
    const snap = captureNodeProps(node, [targetProperty]);
    try {
      await applyTokenValue(node, targetProperty, resolvedValue, tokenType);
      setStoredBinding(node, targetProperty, tokenPath, collectionId);
      applied++;
    } catch (err) {
      const msg = getErrorMessage(err);
      errors.push(`${node.name}: ${msg}`);
      console.error(`Failed to apply ${tokenPath} to ${node.name}:`, err);
      // Roll back any partial mutation on this node
      await restoreNodeProps(node, snap).catch(re =>
        console.error('[applyToSelection] rollback failed for', node.name, re)
      );
    }
  }

  if (applied === 0 && errors.length > 0) {
    figma.notify(`Failed to apply ${tokenPath}: ${errors[0]}`, { error: true });
  } else if (errors.length > 0) {
    figma.notify(`Applied ${tokenPath} to ${applied} layer(s); ${errors.length} failed`);
  } else {
    figma.notify(`Applied ${tokenPath} to ${applied} layer(s)`);
  }
  figma.ui.postMessage({ type: 'applied-to-selection', count: applied, errors, targetProperty });
  await getSelection();
}

// Remove a token binding from selected nodes
export async function removeBinding(property: string) {
  const selection = figma.currentPage.selection;
  const errors: string[] = [];
  for (const node of selection) {
    try {
      clearStoredBinding(node, property);
    } catch (err) {
      const msg = getErrorMessage(err);
      errors.push(`${node.name}: ${msg}`);
      console.error(`Failed to remove binding for ${property} on ${node.name}:`, err);
    }
  }
  if (errors.length > 0) {
    figma.notify(`Failed to remove binding: ${errors[0]}`, { error: true });
  }
  await getSelection();
}

// Remove all token bindings from selected nodes
export async function clearAllBindings() {
  const selection = figma.currentPage.selection;
  const errors: string[] = [];
  for (const node of selection) {
    for (const prop of ALL_BINDABLE_PROPERTIES) {
      try {
        node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, prop, '');
        node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, `${prop}:collection`, '');
      } catch (err) {
        const msg = getErrorMessage(err);
        if (!errors.includes(msg)) errors.push(msg);
      }
    }
  }
  if (errors.length > 0) {
    figma.notify(`Failed to clear some bindings: ${errors[0]}`, { error: true });
  }
  await getSelection();
}

// Get node capabilities for UI filtering
function getNodeCapabilities(node: SceneNode): NodeCapabilities {
  return {
    hasFills: 'fills' in node,
    hasStrokes: 'strokes' in node,
    hasAutoLayout: 'paddingTop' in node,
    isText: node.type === 'TEXT',
    hasEffects: 'effects' in node,
  };
}

function readTypographyCurrentValue(node: SceneNode): TypographyValue | undefined {
  if (node.type !== 'TEXT') return undefined;

  const textNode = node as TextNode;
  const { fontName, fontSize } = textNode;
  if (fontName === figma.mixed || fontSize === figma.mixed) return undefined;

  const typography: TypographyValue = {
    fontFamily: fontName.family,
    fontWeight: fontStyleToWeight(fontName.style),
    fontSize: { value: fontSize, unit: 'px' },
  };

  const lineHeight = textNode.lineHeight;
  if (lineHeight !== figma.mixed) {
    if (lineHeight.unit === 'PIXELS') {
      typography.lineHeight = { value: lineHeight.value, unit: 'px' };
    } else if (lineHeight.unit === 'PERCENT') {
      typography.lineHeight = lineHeight.value / 100;
    }
  }

  const letterSpacing = textNode.letterSpacing;
  if (letterSpacing !== figma.mixed) {
    if (letterSpacing.unit === 'PERCENT' && letterSpacing.value !== 0) {
      typography.letterSpacing = { value: letterSpacing.value, unit: '%' };
    } else if (letterSpacing.unit === 'PIXELS' && letterSpacing.value !== 0) {
      typography.letterSpacing = { value: letterSpacing.value, unit: 'px' };
    }
  }

  return typography;
}

function readShadowCurrentValue(
  node: SceneNode,
): ShadowTokenValue | ShadowTokenValue[] | undefined {
  if (!('effects' in node)) return undefined;

  const effects = (node as SceneNode & { effects: readonly Effect[] }).effects;
  const shadows = effects.filter(
    (effect): effect is DropShadowEffect | InnerShadowEffect =>
      (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') &&
      effect.visible !== false,
  );
  if (shadows.length === 0) return undefined;

  const shadowValue: ShadowTokenValue[] = shadows.map((shadow): ShadowTokenValue => ({
    type: shadow.type === 'INNER_SHADOW' ? 'innerShadow' : 'dropShadow',
    color: rgbToHex(shadow.color, shadow.color.a ?? 1),
    offsetX: { value: shadow.offset.x, unit: 'px' },
    offsetY: { value: shadow.offset.y, unit: 'px' },
    blur: { value: shadow.radius, unit: 'px' },
    spread: { value: shadow.spread ?? 0, unit: 'px' },
  }));

  return shadowValue.length === 1 ? shadowValue[0] : shadowValue;
}

// Read current visual values from a node for display in the inspector
function readCurrentValues(node: SceneNode): NodeCurrentValues {
  const values: NodeCurrentValues = {};

  if ('fills' in node) {
    const fill = getFirstSolidPaint(node, 'fills');
    if (fill) {
      values.fill = rgbToHex(fill.color, fill.opacity ?? 1);
    }
  }
  if ('strokes' in node) {
    const stroke = getFirstSolidPaint(node, 'strokes');
    if (stroke) {
      values.stroke = rgbToHex(stroke.color, stroke.opacity ?? 1);
    }
  }
  if ('width' in node) values.width = getNodeProperty<number>(node, 'width');
  if ('height' in node) values.height = getNodeProperty<number>(node, 'height');
  if ('opacity' in node) values.opacity = getNodeProperty<number>(node, 'opacity');
  if ('cornerRadius' in node) values.cornerRadius = getNodeProperty<number>(node, 'cornerRadius');
  if ('strokeWeight' in node) values.strokeWeight = getNodeProperty<number>(node, 'strokeWeight');
  if ('paddingTop' in node) {
    values.paddingTop = getNodeProperty<number>(node, 'paddingTop');
    values.paddingRight = getNodeProperty<number>(node, 'paddingRight');
    values.paddingBottom = getNodeProperty<number>(node, 'paddingBottom');
    values.paddingLeft = getNodeProperty<number>(node, 'paddingLeft');
  }
  if ('itemSpacing' in node) values.itemSpacing = getNodeProperty<number>(node, 'itemSpacing');
  values.typography = readTypographyCurrentValue(node);
  values.shadow = readShadowCurrentValue(node);
  if ('visible' in node) values.visible = node.visible;

  return values;
}

function readNodeBindings(node: SceneNode): Record<string, string> {
  const bindings: Record<string, string> = {};
  for (const prop of ALL_BINDABLE_PROPERTIES) {
    const val = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop);
    if (val) bindings[prop] = val;
  }
  return bindings;
}

function readNodeBindingCollections(node: SceneNode): Record<string, string> {
  const bindingCollections: Record<string, string> = {};
  for (const prop of ALL_BINDABLE_PROPERTIES) {
    const val = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, `${prop}:collection`);
    if (val) bindingCollections[prop] = val;
  }
  return bindingCollections;
}

function collectDescendantsWithBindings(node: SceneNode, depth: number): SelectionNodeInfo[] {
  const results: SelectionNodeInfo[] = [];
  if (!('children' in node)) return results;
  for (const child of (node as SceneNode & { children: readonly SceneNode[] }).children) {
    const bindings = readNodeBindings(child);
    if (Object.keys(bindings).length > 0) {
      results.push({
        id: child.id,
        name: child.name,
        type: child.type,
        bindings,
        bindingCollections: readNodeBindingCollections(child),
        capabilities: getNodeCapabilities(child),
        currentValues: readCurrentValues(child),
        depth,
        parentId: node.id,
      });
    }
    results.push(...collectDescendantsWithBindings(child, depth + 1));
  }
  return results;
}

function readIconSwapProperties(node: SceneNode): SelectionNodeInfo['iconSwapProperties'] {
  if (node.type !== 'INSTANCE') {
    return undefined;
  }

  const properties = Object.entries(node.componentProperties)
    .filter(([, property]) => property.type === 'INSTANCE_SWAP')
    .map(([propertyName, property]) => ({
      propertyName,
      label: propertyName.replace(/#[^#]*$/, ''),
      value: String(property.value),
      preferredValues: property.preferredValues,
    }));

  return properties.length > 0 ? properties : undefined;
}

function readIconSlotCandidates(node: SceneNode): SelectionNodeInfo['iconSlotCandidates'] {
  const candidates =
    node.type === 'COMPONENT'
      ? collectIconSlotCandidates(node)
      : iconSlotCandidateForNode(node);

  return candidates.length > 0 ? candidates : undefined;
}

function collectIconSlotCandidates(component: ComponentNode): NonNullable<SelectionNodeInfo['iconSlotCandidates']> {
  const candidates: NonNullable<SelectionNodeInfo['iconSlotCandidates']> = [];

  for (const child of component.children) {
    candidates.push(...collectIconSlotCandidatesFromDescendant(child, component));
  }

  return candidates;
}

function collectIconSlotCandidatesFromDescendant(
  node: SceneNode,
  component: ComponentNode,
): NonNullable<SelectionNodeInfo['iconSlotCandidates']> {
  if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    return iconSlotCandidateForNode(node, component);
  }

  const self = iconSlotCandidateForNode(node, component);
  if (!('children' in node)) {
    return self;
  }

  return [
    ...self,
    ...node.children.flatMap((child) =>
      collectIconSlotCandidatesFromDescendant(child, component),
    ),
  ];
}

function iconSlotCandidateForNode(
  node: SceneNode,
  knownComponent?: ComponentNode,
): NonNullable<SelectionNodeInfo['iconSlotCandidates']> {
  if (!isIconSlotCandidateNode(node, { requireIconName: Boolean(knownComponent) })) {
    return [];
  }

  const component = knownComponent ?? findNearestMainComponent(node);
  if (!component || component.id === node.id || component.parent?.type === 'COMPONENT_SET') {
    return [];
  }

  if (node.componentPropertyReferences?.mainComponent) {
    return [];
  }

  return [{
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    componentId: component.id,
    componentName: component.name,
    label: iconSlotLabelFromNodeName(node.name),
  }];
}

export async function getSelection(deepInspectEnabled = selectionDeepInspectEnabled) {
  const selection = figma.currentPage.selection;
  const info: SelectionNodeInfo[] = selection.map(node => ({
    id: node.id,
    name: node.name,
    type: node.type,
    bindings: readNodeBindings(node),
    bindingCollections: readNodeBindingCollections(node),
    capabilities: getNodeCapabilities(node),
    currentValues: readCurrentValues(node),
    depth: 0,
    iconSwapProperties: readIconSwapProperties(node),
    iconSlotCandidates: readIconSlotCandidates(node),
  }));

  if (deepInspectEnabled) {
    for (const node of selection) {
      info.push(...collectDescendantsWithBindings(node, 1));
    }
  }

  figma.ui.postMessage({ type: 'selection', nodes: info });
}

// Extract tokenizable properties from the current selection
export async function extractTokensFromSelection() {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'extracted-tokens', tokens: [] });
    return;
  }

  const entries: ExtractedTokenEntry[] = [];

  function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'layer';
  }

  for (const node of selection) {
    const slug = slugify(node.name);

    // Fill color
    if ('fills' in node) {
      const fill = getFirstSolidPaint(node, 'fills');
      if (fill) {
        const hex = rgbToHex(fill.color, fill.opacity ?? 1);
        entries.push({
          property: 'fill',
          tokenType: 'color',
          suggestedName: `color.${slug}`,
          value: hex,
          layerName: node.name,
          layerId: node.id,
        });
      }
    }

    // Stroke color
    if ('strokes' in node) {
      const stroke = getFirstSolidPaint(node, 'strokes');
      if (stroke) {
        const hex = rgbToHex(stroke.color, stroke.opacity ?? 1);
        entries.push({
          property: 'stroke',
          tokenType: 'color',
          suggestedName: `color.${slug}.stroke`,
          value: hex,
          layerName: node.name,
          layerId: node.id,
        });
      }
    }

    // Dimensions: width, height
    const width = getNodeProperty<number>(node, 'width');
    if ('width' in node && typeof width === 'number') {
      entries.push({
        property: 'width',
        tokenType: 'dimension',
        suggestedName: `size.${slug}.width`,
        value: { value: Math.round(width * 100) / 100, unit: 'px' },
        layerName: node.name,
        layerId: node.id,
      });
    }
    const height = getNodeProperty<number>(node, 'height');
    if ('height' in node && typeof height === 'number') {
      entries.push({
        property: 'height',
        tokenType: 'dimension',
        suggestedName: `size.${slug}.height`,
        value: { value: Math.round(height * 100) / 100, unit: 'px' },
        layerName: node.name,
        layerId: node.id,
      });
    }

    // Corner radius
    const cornerRadius = getNodeProperty<number>(node, 'cornerRadius');
    if ('cornerRadius' in node && typeof cornerRadius === 'number' && cornerRadius > 0) {
      entries.push({
        property: 'cornerRadius',
        tokenType: 'dimension',
        suggestedName: `radius.${slug}`,
        value: { value: cornerRadius, unit: 'px' },
        layerName: node.name,
        layerId: node.id,
      });
    }

    // Stroke weight
    const strokeWeight = getNodeProperty<number>(node, 'strokeWeight');
    if ('strokeWeight' in node && typeof strokeWeight === 'number' && strokeWeight > 0) {
      entries.push({
        property: 'strokeWeight',
        tokenType: 'dimension',
        suggestedName: `border.${slug}.stroke-weight`,
        value: { value: strokeWeight, unit: 'px' },
        layerName: node.name,
        layerId: node.id,
      });
    }

    // Padding / spacing (auto-layout frames)
    if ('paddingTop' in node) {
      const pt = getNodeProperty<number>(node, 'paddingTop') ?? 0;
      const pr = getNodeProperty<number>(node, 'paddingRight') ?? 0;
      const pb = getNodeProperty<number>(node, 'paddingBottom') ?? 0;
      const pl = getNodeProperty<number>(node, 'paddingLeft') ?? 0;
      if (pt > 0) entries.push({ property: 'paddingTop', tokenType: 'dimension', suggestedName: `spacing.${slug}.padding-top`, value: { value: pt, unit: 'px' }, layerName: node.name, layerId: node.id });
      if (pr > 0) entries.push({ property: 'paddingRight', tokenType: 'dimension', suggestedName: `spacing.${slug}.padding-right`, value: { value: pr, unit: 'px' }, layerName: node.name, layerId: node.id });
      if (pb > 0) entries.push({ property: 'paddingBottom', tokenType: 'dimension', suggestedName: `spacing.${slug}.padding-bottom`, value: { value: pb, unit: 'px' }, layerName: node.name, layerId: node.id });
      if (pl > 0) entries.push({ property: 'paddingLeft', tokenType: 'dimension', suggestedName: `spacing.${slug}.padding-left`, value: { value: pl, unit: 'px' }, layerName: node.name, layerId: node.id });
    }
    const itemSpacing = getNodeProperty<number>(node, 'itemSpacing');
    if ('itemSpacing' in node && typeof itemSpacing === 'number' && itemSpacing > 0) {
      entries.push({
        property: 'itemSpacing',
        tokenType: 'dimension',
        suggestedName: `spacing.${slug}.gap`,
        value: { value: itemSpacing, unit: 'px' },
        layerName: node.name,
        layerId: node.id,
      });
    }

    // Border (stroke + strokeWeight combined)
    if ('strokes' in node && 'strokeWeight' in node) {
      const stroke = getFirstSolidPaint(node, 'strokes');
      const sw = getNodeProperty<number>(node, 'strokeWeight');
      if (stroke && typeof sw === 'number' && sw > 0) {
        const hex = rgbToHex(stroke.color, stroke.opacity ?? 1);
        entries.push({
          property: 'border',
          tokenType: 'border',
          suggestedName: `border.${slug}`,
          value: { color: hex, width: { value: sw, unit: 'px' }, style: 'solid' },
          layerName: node.name,
          layerId: node.id,
        });
      }
    }

    const typographyValue = readTypographyCurrentValue(node);
    if (typographyValue) {
      entries.push({
        property: 'typography',
        tokenType: 'typography',
        suggestedName: `typography.${slug}`,
        value: typographyValue,
        layerName: node.name,
        layerId: node.id,
      });
    }

    const shadowValue = readShadowCurrentValue(node);
    if (shadowValue) {
      entries.push({
        property: 'shadow',
        tokenType: 'shadow',
        suggestedName: `shadow.${slug}`,
        value: shadowValue,
        layerName: node.name,
        layerId: node.id,
      });
    }

    // Opacity (only if non-default)
    const opacity = getNodeProperty<number>(node, 'opacity');
    if ('opacity' in node && typeof opacity === 'number' && opacity < 1) {
      entries.push({
        property: 'opacity',
        tokenType: 'number',
        suggestedName: `opacity.${slug}`,
        value: Math.round(opacity * 100) / 100,
        layerName: node.name,
        layerId: node.id,
      });
    }
  }

  // Deduplicate entries with identical type+value: keep first, set layerCount
  const deduped: ExtractedTokenEntry[] = [];
  const seen = new Map<string, number>(); // valueKey -> index in deduped
  for (const entry of entries) {
    const valueKey = `${entry.tokenType}::${JSON.stringify(entry.value)}`;
    const existing = seen.get(valueKey);
    if (existing !== undefined) {
      deduped[existing].layerCount = (deduped[existing].layerCount ?? 1) + 1;
      deduped[existing].layerIds!.push(entry.layerId);
    } else {
      seen.set(valueKey, deduped.length);
      deduped.push({ ...entry, layerCount: 1, layerIds: [entry.layerId] });
    }
  }

  figma.ui.postMessage({ type: 'extracted-tokens', tokens: deduped });
}

// Select canvas layers that are bound to a specific token path
export async function highlightLayersByToken(tokenPath: string) {
  const nodes = figma.currentPage.findAll(node => {
    for (const prop of ALL_BINDABLE_PROPERTIES) {
      if (node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop) === tokenPath) return true;
    }
    return false;
  });
  if (nodes.length > 0) {
    figma.currentPage.selection = nodes as SceneNode[];
    figma.viewport.scrollAndZoomIntoView(nodes as SceneNode[]);
  }
}

// Remap stored binding paths from old token paths to new token paths.
export async function remapBindings(remapMap: Record<string, string>, scope: 'selection' | 'page', deepInspectEnabled: boolean) {
  const entries = Object.entries(remapMap).filter(([oldPath, newPath]) => oldPath && newPath && oldPath !== newPath);
  if (entries.length === 0) {
    figma.ui.postMessage({
      type: 'remap-complete',
      updatedBindings: 0,
      updatedNodes: 0,
      scannedNodes: 0,
      nodesWithBindings: 0,
    });
    return;
  }

  // Pre-operation snapshot: captures current binding paths for each node before any mutation.
  // Keyed by node id; used to restore original paths if the operation fails mid-way through.
  const nodeSnapshots = new Map<string, { node: SceneNode; bindings: Record<string, string> }>();

  try {
    const nodes = collectNodesForScope(scope);
    const total = nodes.length;

    let updatedBindings = 0;
    let updatedNodes = 0;
    let nodesWithBindings = 0;
    const REMAP_BATCH = 100;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      let nodeUpdated = false;

      // Capture current binding paths for this node before any mutation
      const currentBindings: Record<string, string> = {};
      for (const prop of ALL_BINDABLE_PROPERTIES) {
        const val = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop);
        if (val) currentBindings[prop] = val;
      }
      if (Object.keys(currentBindings).length > 0) {
        nodesWithBindings++;
      }
      nodeSnapshots.set(node.id, { node, bindings: currentBindings });

      for (const prop of ALL_BINDABLE_PROPERTIES) {
        const current = currentBindings[prop];
        if (!current) continue;
        const next = remapMap[current];
        if (next) {
          node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, prop, next);
          updatedBindings++;
          nodeUpdated = true;
        }
      }
      if (nodeUpdated) updatedNodes++;
      // Report progress every REMAP_BATCH nodes so UI stays responsive
      if ((i + 1) % REMAP_BATCH === 0 || i === nodes.length - 1) {
        figma.ui.postMessage({ type: 'remap-progress', processed: i + 1, total });
      }
    }

    figma.ui.postMessage({
      type: 'remap-complete',
      updatedBindings,
      updatedNodes,
      scannedNodes: total,
      nodesWithBindings,
    });

    const label = `Remapped ${updatedBindings} binding${updatedBindings !== 1 ? 's' : ''} across ${updatedNodes} layer${updatedNodes !== 1 ? 's' : ''}`;
    if (updatedBindings > 0) {
      figma.notify(label);
    } else if (nodesWithBindings === 0) {
      figma.notify(
        scope === 'selection'
          ? 'No selected layers had token bindings to remap'
          : 'No layers on this page had token bindings to remap',
      );
    } else {
      figma.notify('No bound layers used the selected source paths');
    }

    // Refresh selection so the inspector shows updated paths
    await getSelection(deepInspectEnabled);
  } catch (err) {
    // Restore all binding paths to their pre-operation values
    for (const { node, bindings } of nodeSnapshots.values()) {
      for (const prop of ALL_BINDABLE_PROPERTIES) {
        const original = bindings[prop] ?? '';
        try {
          node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, prop, original);
        } catch (re) {
          console.error('[remapBindings] rollback failed for', node.name, prop, re);
        }
      }
    }
    const message = getErrorMessage(err, 'Unknown error');
    figma.ui.postMessage({
      type: 'remap-complete',
      updatedBindings: 0,
      updatedNodes: 0,
      scannedNodes: nodeSnapshots.size,
      nodesWithBindings: 0,
      error: message,
    });
    figma.notify(`Remap failed: ${message}`, { error: true });
  }
}

// Collect nodes for a scope-based operation.
// 'selection' includes the selected nodes and all their descendants.
// 'page' collects all nodes on the current page, optionally filtered.
function collectNodesForScope(
  scope: 'selection' | 'page',
  filter?: (node: SceneNode) => boolean,
): SceneNode[] {
  if (scope === 'selection') {
    const roots = [...figma.currentPage.selection];
    const all: SceneNode[] = [];
    for (const root of roots) {
      if (!filter || filter(root)) all.push(root);
      if ('findAll' in root) {
        (root as FrameNode).findAll(filter ?? (() => true)).forEach(n => all.push(n));
      }
    }
    return all;
  }
  return figma.currentPage.findAll(filter ?? (() => true));
}

// Maps binding key names (used as plugin data keys) to the actual Figma node
// property names that must be read/written for snapshot and restore.
// Keys not listed here map 1-to-1 (binding key === Figma property name).
const BINDING_TO_FIGMA_PROPS: Record<string, string[]> = {
  fill:       ['fills'],
  stroke:     ['strokes'],
  shadow:     ['effects'],
  typography: ['fontName', 'fontSize', 'lineHeight', 'letterSpacing'],
};

// Snapshot readable properties of a node for the given binding keys.
// Snapshots are keyed by Figma property name (not binding key) so that
// restoreNodeProps can assign them back directly.
function captureNodeProps(node: SceneNode, bindingProps: string[]): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const bindingProp of bindingProps) {
    const figmaProps = BINDING_TO_FIGMA_PROPS[bindingProp] ?? [bindingProp];
    for (const prop of figmaProps) {
      try {
        const val = getNodeProperty(node, prop);
        if (val === undefined) continue;
        // figma.mixed is a Symbol — JSON.stringify silently drops Symbols, losing the value.
        // Store the reference directly so restoreNodeProps can assign it back.
        if (val === figma.mixed) {
          snap[prop] = figma.mixed;
          continue;
        }
        snap[prop] = cloneValue(val);
      } catch (e) { console.debug('[selectionHandling] skip unreadable or unserializable property:', prop, e); }
    }
  }
  return snap;
}

// Restore previously captured node properties.
async function restoreNodeProps(node: SceneNode, snap: Record<string, unknown>): Promise<void> {
  for (const [prop, val] of Object.entries(snap)) {
    try {
      if ((prop === 'width' || prop === 'height') && 'resize' in node) {
        const rn = node as SceneNode & { resize(w: number, h: number): void; width: number; height: number };
        if (prop === 'width') rn.resize(val as number, rn.height);
        else rn.resize(rn.width, val as number);
      } else {
        setNodeProperty(node, prop, val);
      }
    } catch (e) { console.debug('[selectionHandling] restoreNodeProps: failed to restore property:', prop, e); }
  }
}

// Scan the current page and build a map of tokenPath → number of layers using it
export async function scanTokenUsageMap(signal?: { aborted: boolean }, requestId?: string) {
  const usageMap: Record<string, number> = {};
  for await (const node of walkNodes(figma.currentPage.children, { signal })) {
    if (signal?.aborted) {
      figma.ui.postMessage({ type: 'token-usage-map-cancelled', requestId });
      return;
    }
    const seen = new Set<string>();
    for (const prop of ALL_BINDABLE_PROPERTIES) {
      const tokenPath = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop);
      if (tokenPath && !seen.has(tokenPath)) {
        seen.add(tokenPath);
        usageMap[tokenPath] = (usageMap[tokenPath] || 0) + 1;
      }
    }
  }
  if (signal?.aborted) {
    figma.ui.postMessage({ type: 'token-usage-map-cancelled', requestId });
    return;
  }
  figma.ui.postMessage({ type: 'token-usage-map', usageMap, requestId });
}

// Sync all bindings on the page or selection with latest token values
export async function syncBindings(tokenMap: Record<string, TokenMapEntry>, scope: 'page' | 'selection') {
  const nodes = collectNodesForScope(scope, node => {
    for (const prop of ALL_BINDABLE_PROPERTIES) {
      if (node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop)) return true;
    }
    return false;
  });

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const missingTokens = new Set<string>();
  const BATCH_SIZE = 50;

  // Pre-operation snapshots: keyed by node id so we can restore on unexpected failure
  const nodeSnapshots = new Map<string, { node: SceneNode; props: Record<string, unknown> }>();

  try {
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);

      for (const node of batch) {
        // Collect the current stored bindings for this node.
        const bindings: Record<string, string> = {};
        for (const prop of ALL_BINDABLE_PROPERTIES) {
          const val = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop);
          if (val) bindings[prop] = val;
        }

        // Snapshot current property values before any mutations on this node
        if (!nodeSnapshots.has(node.id)) {
          nodeSnapshots.set(node.id, { node, props: captureNodeProps(node, Object.keys(bindings)) });
        }

        let nodeUpdated = 0;
        let nodeErrors = 0;
        for (const [prop, tokenPath] of Object.entries(bindings)) {
          const entry = tokenMap[tokenPath];
          if (!entry) {
            // Track missing tokens distinctly — do not count them as skipped.
            // The missingTokens array is sent in the sync-complete message.
            missingTokens.add(tokenPath);
            continue;
          }
          // Resolve alias references before applying
          let value = entry.$value;
          let type = entry.$type;
          if (isAlias(value)) {
            const resolved = resolveTokenValue(value, type, tokenMap);
            if (resolved.error || resolved.value === null) {
              console.warn(`Alias resolution failed for ${tokenPath}: ${resolved.error}`);
              skipped++;
              continue;
            }
            value = resolved.value;
            type = resolved.$type;
          }
          try {
            await applyTokenValue(node, prop, value as ResolvedTokenValue, type);
            nodeUpdated++;
          } catch (err) {
            console.error(`Sync error on ${node.name}.${prop}:`, err);
            nodeErrors++;
          }
        }

        if (nodeErrors > 0) {
          // Any property failure means the node is left in a partial state — roll it back entirely
          const snap = nodeSnapshots.get(node.id);
          if (snap) {
            await restoreNodeProps(snap.node, snap.props).catch(re =>
              console.error('[syncBindings] per-node rollback failed:', re)
            );
            nodeSnapshots.delete(node.id); // prevent double-restore in outer catch
          }
          errors += nodeErrors;
        } else {
          updated += nodeUpdated;
        }
      }

      // Report progress
      figma.ui.postMessage({
        type: 'sync-progress',
        processed: Math.min(i + BATCH_SIZE, nodes.length),
        total: nodes.length,
      });

      // Note: do NOT yield with setTimeout between batches here — it breaks Figma's
      // automatic undo grouping, causing each batch to become a separate undo step.
      // The await calls to applyTokenValue (which uses Figma async APIs like
      // loadFontAsync) already yield to the runtime without breaking the undo group.
    }

    const missingArr = [...missingTokens];
    figma.ui.postMessage({
      type: 'sync-complete',
      updated,
      skipped,
      errors,
      missingTokens: missingArr,
    });

    const summaryParts = [`${updated} updated`];
    if (skipped > 0) summaryParts.push(`${skipped} skipped`);
    if (missingArr.length > 0) summaryParts.push(`${missingArr.length} missing token${missingArr.length !== 1 ? 's' : ''}`);
    if (errors > 0) summaryParts.push(`${errors} error${errors !== 1 ? 's' : ''}`);
    figma.notify(`Synced: ${summaryParts.join(', ')}`);
  } catch (outerError) {
    // An unexpected error broke out of the batch loop — roll back all node changes applied so far
    let rolledBack = false;
    try {
      for (const { node, props } of nodeSnapshots.values()) {
        await restoreNodeProps(node, props);
      }
      rolledBack = true;
    } catch (rollbackError) {
      console.error('[syncSelectionTokens] rollback failed:', rollbackError);
    }

    figma.ui.postMessage({
      type: 'sync-complete',
      updated: 0,
      skipped: 0,
      errors: nodes.length,
      missingTokens: [],
      error: String(outerError),
      rolledBack,
      rollbackError: rolledBack ? undefined : 'Rollback failed — partial changes may persist. Check console for details.',
    });

    figma.notify(`Sync failed — ${rolledBack ? 'changes rolled back' : 'partial changes may persist'}`, { error: true });
  }
}

// Search layers on the current page by name, type, or component name
export function searchLayers(query: string, correlationId?: string) {
  const q = query.toLowerCase().trim();
  if (!q) {
    figma.ui.postMessage({ type: 'search-layers-result', results: [], correlationId });
    return;
  }

  const results: Array<{ id: string; name: string; type: string; parentName?: string; boundCount: number }> = [];
  const MAX_RESULTS = 50;
  let totalSearched = 0;

  const stack: SceneNode[] = [...figma.currentPage.children];
  while (stack.length > 0 && results.length < MAX_RESULTS) {
    const node = stack.pop()!;
    totalSearched++;

    // Check match: name or type
    const nameMatch = node.name.toLowerCase().includes(q);
    const typeMatch = node.type.toLowerCase().includes(q);
    // For component instances, also match the main component name
    let componentMatch = false;
    if (node.type === 'INSTANCE') {
      const inst = node as InstanceNode;
      if (inst.mainComponent?.name?.toLowerCase().includes(q)) {
        componentMatch = true;
      }
    }

    if (nameMatch || typeMatch || componentMatch) {
      let boundCount = 0;
      for (const prop of ALL_BINDABLE_PROPERTIES) {
        if (node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop)) boundCount++;
      }
      const parentName = node.parent && node.parent.type !== 'PAGE' ? node.parent.name : undefined;
      results.push({ id: node.id, name: node.name, type: node.type, parentName, boundCount });
    }

    // Push children (depth-first)
    if ('children' in node) {
      const children = (node as ChildrenMixin & SceneNode).children;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }
  }

  figma.ui.postMessage({ type: 'search-layers-result', results, totalSearched, correlationId });
}

// Check if a node supports a given bindable property
function nodeSupportsProperty(node: SceneNode, property: string): boolean {
  switch (property) {
    case 'fill': return 'fills' in node;
    case 'stroke': return 'strokes' in node;
    case 'width': case 'height': return 'resize' in node;
    case 'paddingTop': case 'paddingRight': case 'paddingBottom': case 'paddingLeft':
    case 'itemSpacing': return 'paddingTop' in node;
    case 'cornerRadius': return 'cornerRadius' in node;
    case 'strokeWeight': return 'strokeWeight' in node;
    case 'opacity': return 'opacity' in node;
    case 'typography': return node.type === 'TEXT';
    case 'shadow': return 'effects' in node;
    case 'visible': return 'visible' in node;
    default: return false;
  }
}

// Find sibling layers (same parent) that support the given property and don't already have it bound
export function findPeersForProperty(nodeId: string, property: string) {
  let sourceNode: BaseNode | null = null;
  try {
    sourceNode = figma.getNodeById(nodeId);
  } catch (e) {
    console.debug('[selectionHandling] findPeersForProperty: node lookup failed for', nodeId, e);
    figma.ui.postMessage({ type: 'peers-for-property-result', nodeIds: [], property });
    return;
  }
  if (!sourceNode || !('parent' in sourceNode) || !sourceNode.parent) {
    figma.ui.postMessage({ type: 'peers-for-property-result', nodeIds: [], property });
    return;
  }

  const parent = sourceNode.parent;
  if (!('children' in parent)) {
    figma.ui.postMessage({ type: 'peers-for-property-result', nodeIds: [], property });
    return;
  }

  const peerIds: string[] = [];
  for (const child of (parent as ChildrenMixin).children) {
    if (child.id === nodeId) continue;
    if (!nodeSupportsProperty(child as SceneNode, property)) continue;
    // Skip if already bound to this property
    if (hasStoredBinding(child as SceneNode, property)) continue;
    peerIds.push(child.id);
  }

  figma.ui.postMessage({ type: 'peers-for-property-result', nodeIds: peerIds, property });
}

// Apply a token binding to specific nodes by ID (without changing the current selection)
export async function applyToNodes(
  nodeIds: string[],
  tokenPath: string,
  tokenType: string,
  targetProperty: string,
  resolvedValue: ResolvedTokenValue,
  collectionId?: string,
) {
  let applied = 0;
  const errors: string[] = [];
  const total = nodeIds.length;

  for (let i = 0; i < nodeIds.length; i++) {
    const id = nodeIds[i];
    try {
      const node = await figma.getNodeByIdAsync(id);
      if (!node || !('parent' in node)) {
        errors.push('Layer not found');
        continue;
      }
      const sceneNode = node as SceneNode;
      const snapshot = captureNodeProps(sceneNode, [targetProperty]);
      try {
        await applyTokenValue(sceneNode, targetProperty, resolvedValue, tokenType);
      } catch (error) {
        await restoreNodeProps(sceneNode, snapshot);
        throw error;
      }
      setStoredBinding(sceneNode, targetProperty, tokenPath, collectionId);
      applied++;
    } catch (err) {
      errors.push(getErrorMessage(err));
    }
    if (total > 1) {
      figma.ui.postMessage({ type: 'apply-progress', processed: i + 1, total });
    }
  }

  if (applied > 0) {
    figma.notify(`Applied ${tokenPath} to ${applied} additional layer${applied !== 1 ? 's' : ''}`);
  } else if (errors.length > 0) {
    figma.notify(`Failed to apply: ${errors[0]}`, { error: true });
  }

  figma.ui.postMessage({ type: 'applied-to-nodes', count: applied, errors });
  // Refresh selection so bindings show correctly
  await getSelection();
}

// Remove a token binding from a specific node by ID (without changing the current selection)
export async function removeBindingFromNode(nodeId: string, property: string) {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || !('parent' in node)) {
      figma.ui.postMessage({ type: 'removed-binding-from-node', success: false, error: 'Node not found' });
      return;
    }
    const sceneNode = node as SceneNode;
    clearStoredBinding(sceneNode, property);
    figma.ui.postMessage({ type: 'removed-binding-from-node', success: true, nodeId, property });
  } catch (err) {
    const msg = getErrorMessage(err);
    figma.notify(`Failed to remove binding: ${msg}`, { error: true });
    figma.ui.postMessage({ type: 'removed-binding-from-node', success: false, error: msg });
  }
  await getSelection();
}
