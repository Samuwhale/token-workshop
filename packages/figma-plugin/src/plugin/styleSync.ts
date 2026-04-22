import type {
  ColorValue,
  GradientStop,
  GradientValue,
  TypographyValue,
  ShadowValue,
  DimensionValue,
} from '@tokenmanager/core';
import { parseColor, rgbToHex, shadowTokenToEffects } from './colorUtils.js';
import { fontStyleToWeight, resolveFontStyle } from './fontLoading.js';
import { getErrorMessage } from '../shared/utils.js';
import type { StyleSnapshotEntry, StyleSnapshot, VarSnapshotRecord } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Token shapes flowing into applyStyles — these carry a `path` field added by
// the caller (not part of the DTCG spec itself).
// ---------------------------------------------------------------------------

interface BaseStyleToken {
  path: string;
  collectionId?: string;
  figmaCollection?: string;
  figmaMode?: string;
  primaryModeName?: string;
  resolvedValue?: unknown;
  modeValues?: Record<string, { raw: unknown; resolved: unknown }>;
}

interface ColorStyleToken extends BaseStyleToken {
  $type: 'color';
  $value: ColorValue;
}

interface GradientStyleToken extends BaseStyleToken {
  $type: 'gradient';
  $value: GradientStyleValue;
}

interface TypographyStyleToken extends BaseStyleToken {
  $type: 'typography';
  $value: TypographyValue;
}

interface ShadowStyleToken extends BaseStyleToken {
  $type: 'shadow';
  $value: ShadowValue | ShadowValue[];
}

export type StyleToken = ColorStyleToken | GradientStyleToken | TypographyStyleToken | ShadowStyleToken;

type LegacyGradientValue = {
  type?: unknown;
  stops?: unknown;
};

type GradientStyleValue = GradientValue | LegacyGradientValue;

function isStyleToken(token: BaseStyleToken & { $type: string }): token is StyleToken {
  return token.$type === 'color'
    || token.$type === 'gradient'
    || token.$type === 'typography'
    || token.$type === 'shadow';
}

// ---------------------------------------------------------------------------
// Cached style lists — fetched once per applyStyles() call.
// ---------------------------------------------------------------------------

interface StyleCache {
  paintStyles: PaintStyle[];
  textStyles: TextStyle[];
  effectStyles: EffectStyle[];
  variablesById: Map<string, Variable>;
  variablesByPath: Map<string, Variable>;
  variablesByCollectionPath: Map<string, Variable>;
  collectionsById: Map<string, VariableCollection>;
  collectionsByName: Map<string, VariableCollection>;
  backingVariableSnapshots: Map<string, VarSnapshotRecord>;
  createdBackingVariableIds: string[];
  createdBackingCollectionIds: string[];
}

const TYPOGRAPHY_BINDABLE_FIELDS = [
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'paragraphSpacing',
  'paragraphIndent',
] as const;

type TypographyBindableField = (typeof TYPOGRAPHY_BINDABLE_FIELDS)[number];
type TextStyleBoundVariableSnapshot = Partial<Record<TypographyBindableField, string>>;

type ManagedStyleSource = {
  path: string;
  $type: StyleToken['$type'];
  $value: unknown;
  collectionId?: string;
  primaryModeName?: string;
  modeValues?: Record<string, unknown>;
  usesGeneratedBackingVariables: boolean;
};

const STYLE_SOURCE_PLUGIN_DATA_KEY = 'tm.styleSource';
const STYLE_BACKING_PLUGIN_DATA_KEY = 'tm.styleBacking';
const STYLE_BACKING_PATH_SEGMENT = '__style';

function collectionPathKey(collectionId: string, path: string): string {
  return `${collectionId}\u0000${path}`;
}

const TYPOGRAPHY_FIELD_SCOPES: Partial<Record<TypographyBindableField, VariableScope[]>> = {
  fontFamily: ['FONT_FAMILY'],
  fontSize: ['FONT_SIZE'],
  fontStyle: ['FONT_STYLE'],
  fontWeight: ['FONT_WEIGHT'],
  lineHeight: ['LINE_HEIGHT'],
  letterSpacing: ['LETTER_SPACING'],
  paragraphSpacing: ['PARAGRAPH_SPACING'],
  paragraphIndent: ['PARAGRAPH_INDENT'],
};

function readManagedStyleSource(style: BaseStyleMixin): ManagedStyleSource | null {
  const raw = style.getPluginData(STYLE_SOURCE_PLUGIN_DATA_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ManagedStyleSource;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.path === 'string' &&
      typeof parsed.$type === 'string'
    ) {
      return parsed;
    }
  } catch (error) {
    console.warn('[styleSync] Failed to parse managed style source:', error);
  }

  return null;
}

function writeManagedStyleSource(style: BaseStyleMixin, token: StyleToken, usesGeneratedBackingVariables: boolean): void {
  const modeValues = token.modeValues
    ? Object.fromEntries(
        Object.entries(token.modeValues).map(([modeName, value]) => [modeName, value.raw]),
      )
    : undefined;

  const source: ManagedStyleSource = {
    path: token.path,
    $type: token.$type,
    $value: token.$value,
    collectionId: token.collectionId,
    primaryModeName: token.primaryModeName,
    modeValues,
    usesGeneratedBackingVariables,
  };

  style.setPluginData(STYLE_SOURCE_PLUGIN_DATA_KEY, JSON.stringify(source));
}

function tokenModeValues(token: BaseStyleToken): Array<{ modeName: string; resolved: unknown }> {
  const modeEntries = token.modeValues
    ? Object.entries(token.modeValues).map(([modeName, value]) => ({
        modeName,
        resolved: value.resolved,
      }))
    : [];

  if (modeEntries.length > 0) {
    return modeEntries;
  }

  return [
    {
      modeName: token.primaryModeName ?? token.figmaMode ?? 'default',
      resolved: token.resolvedValue,
    },
  ];
}

function hasAdditionalModes(token: BaseStyleToken): boolean {
  return Boolean(token.modeValues && Object.keys(token.modeValues).length > 1);
}

function generatedStyleVariablePath(path: string, ...segments: string[]): string {
  return [path, STYLE_BACKING_PATH_SEGMENT, ...segments].join('.');
}

function isGeneratedStyleBackingVariable(variable: Variable): boolean {
  return variable.getPluginData(STYLE_BACKING_PLUGIN_DATA_KEY) === '1';
}

function getOrCreateVariableCollection(cache: StyleCache, name: string): VariableCollection {
  let collection = cache.collectionsByName.get(name);
  if (!collection) {
    collection = figma.variables.createVariableCollection(name);
    cache.collectionsByName.set(name, collection);
    cache.collectionsById.set(collection.id, collection);
    cache.createdBackingCollectionIds.push(collection.id);
  }
  return collection;
}

function getOrCreateVariableMode(collection: VariableCollection, modeName: string): string {
  const existingMode = collection.modes.find((mode) => mode.name === modeName);
  if (existingMode) {
    return existingMode.modeId;
  }
  return collection.addMode(modeName);
}

function getStyleTargetCollectionName(token: BaseStyleToken): string {
  return token.figmaCollection?.trim() || 'TokenManager';
}

function getPrimaryTargetModeName(token: BaseStyleToken): string {
  return token.figmaMode?.trim() || token.primaryModeName?.trim() || 'Mode 1';
}

function snapshotBackingVariableForRevert(variable: Variable, cache: StyleCache): void {
  if (cache.backingVariableSnapshots.has(variable.id)) {
    return;
  }

  cache.backingVariableSnapshots.set(variable.id, {
    valuesByMode: structuredClone(variable.valuesByMode),
    name: variable.name,
    description: variable.description,
    hiddenFromPublishing: variable.hiddenFromPublishing,
    scopes: [...variable.scopes],
    pluginData: {
      tokenPath: variable.getPluginData('tokenPath'),
      tokenCollection: variable.getPluginData('tokenCollection'),
      styleBacking: variable.getPluginData(STYLE_BACKING_PLUGIN_DATA_KEY),
    },
  });
}

function findOrCreateGeneratedVariable(
  token: BaseStyleToken,
  cache: StyleCache,
  path: string,
  variableType: VariableResolvedDataType,
  scopes: VariableScope[] = [],
): Variable {
  const collection = getOrCreateVariableCollection(cache, getStyleTargetCollectionName(token));
  let variable = cache.variablesByCollectionPath.get(collectionPathKey(collection.id, path)) ?? null;
  if (!variable) {
    variable = figma.variables.createVariable(path.replace(/\./g, '/'), collection, variableType);
    cache.variablesById.set(variable.id, variable);
    cache.variablesByPath.set(path, variable);
    cache.variablesByCollectionPath.set(collectionPathKey(collection.id, path), variable);
    cache.createdBackingVariableIds.push(variable.id);
  } else {
    snapshotBackingVariableForRevert(variable, cache);
  }

  variable.hiddenFromPublishing = true;
  variable.scopes = scopes;
  variable.setPluginData(STYLE_BACKING_PLUGIN_DATA_KEY, '1');
  variable.setPluginData('tokenPath', path);
  variable.setPluginData('tokenCollection', token.collectionId ?? '');

  return variable;
}

function extractReferencePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^\{(.+)\}$/);
  return match ? match[1] : null;
}

function variablePath(variable: Variable): string {
  return variable.getPluginData('tokenPath') || variable.name.replace(/\//g, '.');
}

function readVariableAuthoredDefaultValue(
  variable: Variable,
  variablesById: Map<string, Variable>,
  collectionsById: Map<string, VariableCollection>,
): string | null {
  const collection = collectionsById.get(variable.variableCollectionId);
  if (!collection) {
    return null;
  }

  const rawValue = variable.valuesByMode[collection.defaultModeId];
  if (rawValue && typeof rawValue === 'object' && 'type' in rawValue && rawValue.type === 'VARIABLE_ALIAS') {
    const target = variablesById.get(rawValue.id);
    return target ? `{${variablePath(target)}}` : null;
  }

  if (variable.resolvedType === 'COLOR' && rawValue && typeof rawValue === 'object') {
    const color = rawValue as RGBA;
    return rgbToHex(color, color.a ?? 1);
  }

  return typeof rawValue === 'string' ? rawValue : null;
}

function resolveStyleAliasVariable(
  rawValue: unknown,
  cache: Pick<StyleCache, 'variablesByPath'>,
): Variable | null {
  const path = extractReferencePath(rawValue);
  return path ? cache.variablesByPath.get(path) ?? null : null;
}

function normalizeTextDecoration(value: string | undefined): TextDecoration | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'underline') return 'UNDERLINE';
  if (normalized === 'line-through' || normalized === 'strikethrough') return 'STRIKETHROUGH';
  if (normalized === 'none') return 'NONE';
  return null;
}

function denormalizeTextDecoration(value: TextDecoration): string | undefined {
  if (value === 'UNDERLINE') return 'underline';
  if (value === 'STRIKETHROUGH') return 'line-through';
  return undefined;
}

function normalizeTextTransform(value: string | undefined): TextCase | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'uppercase' || normalized === 'upper') return 'UPPER';
  if (normalized === 'lowercase' || normalized === 'lower') return 'LOWER';
  if (normalized === 'capitalize' || normalized === 'title') return 'TITLE';
  if (normalized === 'small-caps') return 'SMALL_CAPS';
  if (normalized === 'small-caps-forced') return 'SMALL_CAPS_FORCED';
  if (normalized === 'none' || normalized === 'original') return 'ORIGINAL';
  return null;
}

function denormalizeTextTransform(value: TextCase): string | undefined {
  if (value === 'UPPER') return 'uppercase';
  if (value === 'LOWER') return 'lowercase';
  if (value === 'TITLE') return 'capitalize';
  if (value === 'SMALL_CAPS') return 'small-caps';
  if (value === 'SMALL_CAPS_FORCED') return 'small-caps-forced';
  return undefined;
}

function snapshotTextStyleBoundVariables(style: TextStyle): TextStyleBoundVariableSnapshot {
  const snapshot: TextStyleBoundVariableSnapshot = {};
  for (const field of TYPOGRAPHY_BINDABLE_FIELDS) {
    const alias = style.boundVariables?.[field];
    if (alias?.id) {
      snapshot[field] = alias.id;
    }
  }
  return snapshot;
}

async function restoreTextStyleBoundVariables(
  style: TextStyle,
  boundVariables: TextStyleBoundVariableSnapshot | undefined,
): Promise<void> {
  for (const field of TYPOGRAPHY_BINDABLE_FIELDS) {
    style.setBoundVariable(field, null);
  }

  if (!boundVariables) {
    return;
  }

  for (const [field, variableId] of Object.entries(boundVariables) as Array<[TypographyBindableField, string]>) {
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (variable) {
      style.setBoundVariable(field, variable);
    }
  }
}

function normalizeDimensionNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const raw = (value as { value: unknown }).value;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
  }
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFontFamilyValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null;
  }
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeFontWeightValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return fontStyleToWeight(value);
  }
  return null;
}

function lineHeightEncoding(value: unknown): 'percent' | 'multiplier' | 'pixels' | 'auto' | null {
  if (value === 'auto') {
    return 'auto';
  }
  if (typeof value === 'number') {
    return 'multiplier';
  }
  if (value && typeof value === 'object' && 'unit' in value) {
    const unit = String((value as { unit?: unknown }).unit ?? '').toLowerCase();
    if (unit === '%') {
      return 'percent';
    }
    if (unit === 'px') {
      return 'pixels';
    }
  }
  return null;
}

function letterSpacingEncoding(value: unknown): 'percent' | 'pixels' | null {
  if (typeof value === 'number') {
    return 'pixels';
  }
  if (value && typeof value === 'object' && 'unit' in value) {
    const unit = String((value as { unit?: unknown }).unit ?? '').toLowerCase();
    if (unit === '%') {
      return 'percent';
    }
    return 'pixels';
  }
  return null;
}

function assertConsistentEncoding(
  values: Array<{ modeName: string; resolved: unknown }>,
  getEncoding: (value: unknown) => string | null,
  label: string,
): string | null {
  const encodings = values
    .map(({ modeName, resolved }) => ({ modeName, encoding: getEncoding(resolved) }))
    .filter((entry): entry is { modeName: string; encoding: string } => entry.encoding !== null);

  if (encodings.length === 0) {
    return null;
  }

  const firstEncoding = encodings[0].encoding;
  const incompatible = encodings.find((entry) => entry.encoding !== firstEncoding);
  if (incompatible) {
    throw new Error(
      `Cannot publish multi-mode ${label} for "${values[0]?.modeName ?? 'style'}" with mixed units.`,
    );
  }

  return firstEncoding;
}

function applyResolvedFontSize(style: TextStyle, value: unknown): void {
  const numberValue = normalizeDimensionNumber(value);
  if (numberValue !== null) {
    style.fontSize = numberValue;
  }
}

function applyResolvedLineHeight(
  style: TextStyle,
  value: unknown,
): void {
  if (value === 'auto') {
    style.lineHeight = { unit: 'AUTO' };
    return;
  }

  if (typeof value === 'number') {
    style.lineHeight = { unit: 'PERCENT', value: value * 100 };
    return;
  }

  if (value && typeof value === 'object' && 'unit' in value) {
    const lineHeight = value as DimensionValue;
    if (lineHeight.unit === '%') {
      style.lineHeight = { unit: 'PERCENT', value: lineHeight.value };
      return;
    }
    style.lineHeight = { unit: 'PIXELS', value: lineHeight.value };
  }
}

function applyResolvedLetterSpacing(
  style: TextStyle,
  value: unknown,
): void {
  if (typeof value === 'number') {
    style.letterSpacing = { unit: 'PIXELS', value };
    return;
  }

  if (value && typeof value === 'object' && 'unit' in value) {
    const letterSpacing = value as DimensionValue;
    if (letterSpacing.unit === '%') {
      style.letterSpacing = { unit: 'PERCENT', value: letterSpacing.value };
      return;
    }
    style.letterSpacing = { unit: 'PIXELS', value: letterSpacing.value };
  }
}

async function applyResolvedTypographyToStyle(
  style: TextStyle,
  value: TypographyValue,
): Promise<void> {
  const resolvedFontFamily = normalizeFontFamilyValue(value.fontFamily);
  const resolvedFontWeight = normalizeFontWeightValue(value.fontWeight);
  const resolvedFontStyle =
    typeof value.fontStyle === 'string' && value.fontStyle.trim().length > 0
      ? value.fontStyle
      : undefined;

  if (resolvedFontFamily) {
    const nextFontStyle = await resolveFontStyle(resolvedFontFamily, {
      weight: resolvedFontWeight ?? undefined,
      fontStyle: resolvedFontStyle,
    });
    await figma.loadFontAsync({ family: resolvedFontFamily, style: nextFontStyle });
    style.fontName = { family: resolvedFontFamily, style: nextFontStyle };
  } else {
    await figma.loadFontAsync(style.fontName);
  }

  applyResolvedFontSize(style, value.fontSize);
  applyResolvedLineHeight(style, value.lineHeight);
  applyResolvedLetterSpacing(style, value.letterSpacing);

  const textDecoration = normalizeTextDecoration(value.textDecoration);
  style.textDecoration = textDecoration ?? 'NONE';

  const textTransform = normalizeTextTransform(value.textTransform);
  style.textCase = textTransform ?? 'ORIGINAL';
}

function bindPaintColorVariable(style: PaintStyle, variable: Variable | null, fallbackColor: string): void {
  const color = parseColor(fallbackColor);
  if (!color) {
    throw new Error(`Cannot parse color value: "${fallbackColor}"`);
  }

  const solidPaint = figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: color.rgb, opacity: color.a },
    'color',
    variable,
  );
  style.paints = [solidPaint];
}

function setGeneratedFloatVariableValues(
  variable: Variable,
  token: BaseStyleToken,
  cache: StyleCache,
  convert: (value: unknown) => number | null,
): void {
  const collection = cache.collectionsById.get(variable.variableCollectionId);
  if (!collection) {
    return;
  }

  for (const { modeName, resolved } of tokenModeValues(token)) {
    const targetModeName =
      modeName === (token.primaryModeName ?? modeName)
        ? getPrimaryTargetModeName(token)
        : modeName;
    const modeId = getOrCreateVariableMode(collection, targetModeName);
    const nextValue = convert(resolved);
    if (nextValue !== null) {
      variable.setValueForMode(modeId, nextValue);
    }
  }
}

function setGeneratedStringVariableValues(
  variable: Variable,
  token: BaseStyleToken,
  cache: StyleCache,
  convert: (value: unknown) => string | null,
): void {
  const collection = cache.collectionsById.get(variable.variableCollectionId);
  if (!collection) {
    return;
  }

  for (const { modeName, resolved } of tokenModeValues(token)) {
    const targetModeName =
      modeName === (token.primaryModeName ?? modeName)
        ? getPrimaryTargetModeName(token)
        : modeName;
    const modeId = getOrCreateVariableMode(collection, targetModeName);
    const nextValue = convert(resolved);
    if (nextValue !== null) {
      variable.setValueForMode(modeId, nextValue);
    }
  }
}

function setGeneratedColorVariableValues(
  variable: Variable,
  token: BaseStyleToken,
  cache: StyleCache,
  convert: (value: unknown) => string | null = (value) => (
    typeof value === 'string' ? value : null
  ),
): void {
  const collection = cache.collectionsById.get(variable.variableCollectionId);
  if (!collection) {
    return;
  }

  for (const { modeName, resolved } of tokenModeValues(token)) {
    const targetModeName =
      modeName === (token.primaryModeName ?? modeName)
        ? getPrimaryTargetModeName(token)
        : modeName;
    const modeId = getOrCreateVariableMode(collection, targetModeName);
    const parsedValue = convert(resolved);
    const parsed = parsedValue ? parseColor(parsedValue) : null;
    if (parsed) {
      variable.setValueForMode(modeId, {
        r: parsed.rgb.r,
        g: parsed.rgb.g,
        b: parsed.rgb.b,
        a: parsed.a,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------


export async function applyStyles(
  tokens: Array<BaseStyleToken & { $type: string; $value: unknown }>,
  correlationId?: string,
) {
  // Fetch all local styles once upfront instead of per-token.
  const [paintStyles, textStyles, effectStyles, localVariables, localCollections] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.variables.getLocalVariablesAsync(),
    figma.variables.getLocalVariableCollectionsAsync(),
  ]);
  const cache: StyleCache = {
    paintStyles,
    textStyles,
    effectStyles,
    variablesById: new Map(localVariables.map((variable) => [variable.id, variable])),
    variablesByPath: new Map(localVariables.map((variable) => [variablePath(variable), variable])),
    variablesByCollectionPath: new Map(
      localVariables.map((variable) => [
        collectionPathKey(variable.variableCollectionId, variablePath(variable)),
        variable,
      ]),
    ),
    collectionsById: new Map(localCollections.map((collection) => [collection.id, collection])),
    collectionsByName: new Map(localCollections.map((collection) => [collection.name, collection])),
    backingVariableSnapshots: new Map(),
    createdBackingVariableIds: [],
    createdBackingCollectionIds: [],
  };

  // Capture pre-sync state for each style that already exists (for revert support).
  const styleSnapshots: StyleSnapshotEntry[] = [];
  // Track IDs of styles created during this sync (to delete on revert).
  const createdStyleIds: string[] = [];

  let successCount = 0;
  const skipped: Array<{ path: string; $type: string }> = [];
  const failures: { path: string; error: string }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // Emit incremental progress so the UI can show "Syncing N / M styles…"
    if (i % 5 === 0 || i === tokens.length - 1) {
      figma.ui.postMessage({ type: 'style-sync-progress', current: i + 1, total: tokens.length, correlationId });
    }

    if (!isStyleToken(token)) {
      skipped.push({ path: token.path, $type: token.$type });
      continue;
    }

    // Snapshot existing style before modifying it (for revert support)
    const styleName = tokenPathToStyleName(token.path);
    let existingStyleId: string | null = null;
    if (token.$type === 'color' || token.$type === 'gradient') {
      const existing = cache.paintStyles.find(s => s.name === styleName);
      if (existing) {
        existingStyleId = existing.id;
        styleSnapshots.push({
          id: existing.id,
          type: 'paint',
          data: {
            paints: structuredClone(existing.paints),
            styleSource: existing.getPluginData(STYLE_SOURCE_PLUGIN_DATA_KEY),
          },
        });
      }
    } else if (token.$type === 'typography') {
      const existing = cache.textStyles.find(s => s.name === styleName);
      if (existing) {
        existingStyleId = existing.id;
        styleSnapshots.push({ id: existing.id, type: 'text', data: {
          fontName: structuredClone(existing.fontName),
          fontSize: existing.fontSize,
          lineHeight: structuredClone(existing.lineHeight),
          letterSpacing: structuredClone(existing.letterSpacing),
          textDecoration: existing.textDecoration,
          textCase: existing.textCase,
          boundVariables: snapshotTextStyleBoundVariables(existing),
          styleSource: existing.getPluginData(STYLE_SOURCE_PLUGIN_DATA_KEY),
        }});
      }
    } else if (token.$type === 'shadow') {
      const existing = cache.effectStyles.find(s => s.name === styleName);
      if (existing) {
        existingStyleId = existing.id;
        styleSnapshots.push({
          id: existing.id,
          type: 'effect',
          data: {
            effects: structuredClone(existing.effects),
            styleSource: existing.getPluginData(STYLE_SOURCE_PLUGIN_DATA_KEY),
          },
        });
      }
    }

    try {
      if (token.$type === 'color') {
        applyPaintStyle(token, cache);
      } else if (token.$type === 'gradient') {
        applyGradientPaintStyle(token, cache);
      } else if (token.$type === 'typography') {
        await applyTextStyle(token, cache);
      } else if (token.$type === 'shadow') {
        applyEffectStyle(token, cache);
      }
      successCount++;

      // Track newly created styles (no pre-existing ID → was just created)
      if (!existingStyleId) {
        const created =
          (token.$type === 'color' || token.$type === 'gradient') ? cache.paintStyles.find(s => s.name === styleName) :
          token.$type === 'typography' ? cache.textStyles.find(s => s.name === styleName) :
          token.$type === 'shadow' ? cache.effectStyles.find(s => s.name === styleName) :
          undefined;
        if (created) createdStyleIds.push(created.id);
      }
    } catch (error) {
      const message = getErrorMessage(error);
      console.error(`Failed to apply style for ${token.path}:`, error);
      failures.push({ path: token.path, error: message });
    }
  }
  figma.ui.postMessage({
    type: 'styles-applied',
    count: successCount,
    total: tokens.length,
    failures,
    skipped,
    correlationId,
    styleSnapshot: {
      snapshots: styleSnapshots,
      createdIds: createdStyleIds,
      backingVariables: {
        records: Object.fromEntries(cache.backingVariableSnapshots),
        createdIds: [...cache.createdBackingVariableIds],
        createdCollectionIds: [...cache.createdBackingCollectionIds],
      },
    },
  });
}

/** Restore Figma styles to the state captured in a prior applyStyles() call. */
export async function revertStyles(
  data: StyleSnapshot,
  correlationId?: string,
) {
  const failures: string[] = [];

  // Restore pre-sync state for every style that was modified — run in parallel
  const restoreTasks = data.snapshots.map(async (snap) => {
    const style = await figma.getStyleByIdAsync(snap.id);
    if (!style) { failures.push(`style ${snap.id} no longer exists`); return; }
    try {
      if (snap.type === 'paint') {
        const data = snap.data as {
          paints: Paint[];
          styleSource?: string;
        };
        const paintStyle = style as PaintStyle;
        paintStyle.paints = data.paints;
        paintStyle.setPluginData(STYLE_SOURCE_PLUGIN_DATA_KEY, data.styleSource ?? '');
      } else if (snap.type === 'text') {
        const ts = style as TextStyle;
        const td = snap.data as {
          fontName: FontName;
          fontSize?: number;
          lineHeight?: LineHeight;
          letterSpacing?: LetterSpacing;
          textDecoration?: TextDecoration;
          textCase?: TextCase;
          boundVariables?: TextStyleBoundVariableSnapshot;
          styleSource?: string;
        };
        await figma.loadFontAsync(td.fontName);
        ts.fontName = td.fontName;
        if (td.fontSize !== undefined) ts.fontSize = td.fontSize;
        if (td.lineHeight !== undefined) ts.lineHeight = td.lineHeight;
        if (td.letterSpacing !== undefined) ts.letterSpacing = td.letterSpacing;
        if (td.textDecoration !== undefined) ts.textDecoration = td.textDecoration;
        if (td.textCase !== undefined) ts.textCase = td.textCase;
        await restoreTextStyleBoundVariables(ts, td.boundVariables);
        ts.setPluginData(STYLE_SOURCE_PLUGIN_DATA_KEY, td.styleSource ?? '');
      } else if (snap.type === 'effect') {
        const data = snap.data as {
          effects: Effect[];
          styleSource?: string;
        };
        const effectStyle = style as EffectStyle;
        effectStyle.effects = data.effects;
        effectStyle.setPluginData(STYLE_SOURCE_PLUGIN_DATA_KEY, data.styleSource ?? '');
      }
    } catch (e) {
      failures.push(`restore(${snap.id}): ${getErrorMessage(e)}`);
    }
  });
  await Promise.allSettled(restoreTasks);

  const backingRestoreFailures = new Set<string>();
  const backingVariables = data.backingVariables;
  if (backingVariables) {
    const restoreVariableTasks = Object.entries(backingVariables.records).map(async ([varId, snapshot]) => {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (!variable) {
        failures.push(`backing variable ${varId} no longer exists`);
        backingRestoreFailures.add(varId);
        return;
      }

      let failed = false;
      for (const [modeId, value] of Object.entries(snapshot.valuesByMode)) {
        try {
          variable.setValueForMode(modeId, value as VariableValue);
        } catch (error) {
          failures.push(`backing variable setValueForMode(${varId}, ${modeId}): ${getErrorMessage(error)}`);
          failed = true;
        }
      }
      try { variable.name = snapshot.name; } catch (error) { failures.push(`backing variable name(${varId}): ${getErrorMessage(error)}`); failed = true; }
      try { variable.description = snapshot.description; } catch (error) { failures.push(`backing variable description(${varId}): ${getErrorMessage(error)}`); failed = true; }
      try { variable.hiddenFromPublishing = snapshot.hiddenFromPublishing; } catch (error) { failures.push(`backing variable hiddenFromPublishing(${varId}): ${getErrorMessage(error)}`); failed = true; }
      try { variable.scopes = snapshot.scopes as VariableScope[]; } catch (error) { failures.push(`backing variable scopes(${varId}): ${getErrorMessage(error)}`); failed = true; }
      try {
        variable.setPluginData('tokenPath', snapshot.pluginData.tokenPath);
        variable.setPluginData('tokenCollection', snapshot.pluginData.tokenCollection);
        variable.setPluginData(STYLE_BACKING_PLUGIN_DATA_KEY, snapshot.pluginData.styleBacking ?? '');
      } catch (error) {
        failures.push(`backing variable pluginData(${varId}): ${getErrorMessage(error)}`);
        failed = true;
      }

      if (failed) {
        backingRestoreFailures.add(varId);
      }
    });
    await Promise.allSettled(restoreVariableTasks);
  }

  if (failures.length > 0) {
    // Skip deletions — one or more restores failed, so deleting created styles now would
    // cause unrecoverable data loss (the originals didn't restore cleanly).
    console.error('[revertStyles] skipping deletion phase because restore(s) failed:', failures);
  } else {
    // Delete styles and backing variables that were created during the sync — run in parallel
    const deleteStyleTasks = [...data.createdIds].reverse().map(async (id) => {
      try {
        const style = await figma.getStyleByIdAsync(id);
        if (style) style.remove();
      } catch (e) {
        failures.push(`delete(${id}): ${getErrorMessage(e)}`);
      }
    });
    const deleteVariableTasks = [...(backingVariables?.createdIds ?? [])].reverse().map(async (id) => {
      if (backingRestoreFailures.has(id)) return;
      try {
        const variable = await figma.variables.getVariableByIdAsync(id);
        if (variable) variable.remove();
      } catch (e) {
        failures.push(`delete backing variable(${id}): ${getErrorMessage(e)}`);
      }
    });
    await Promise.allSettled([...deleteStyleTasks, ...deleteVariableTasks]);

    if (failures.length === 0 && backingVariables && backingVariables.createdCollectionIds.length > 0) {
      try {
        const [collections, variables] = await Promise.all([
          figma.variables.getLocalVariableCollectionsAsync(),
          figma.variables.getLocalVariablesAsync(),
        ]);
        const collectionsById = new Map(collections.map((collection) => [collection.id, collection] as const));
        for (const collectionId of [...backingVariables.createdCollectionIds].reverse()) {
          const collection = collectionsById.get(collectionId);
          if (!collection) continue;
          const hasVariables = variables.some((variable) => variable.variableCollectionId === collectionId);
          if (!hasVariables) {
            collection.remove();
          }
        }
      } catch (e) {
        failures.push(`delete backing collection: ${getErrorMessage(e)}`);
      }
    }
  }

  figma.ui.postMessage({ type: 'styles-reverted', correlationId, failures });
}

// ---------------------------------------------------------------------------
// Style name helper — tokens use dot-separated paths, Figma uses slashes
// ---------------------------------------------------------------------------

function tokenPathToStyleName(path: string): string {
  return path.replace(/\./g, '/');
}

// ---------------------------------------------------------------------------
// Per-type style applicators
// ---------------------------------------------------------------------------

function applyPaintStyle(token: ColorStyleToken, cache: StyleCache): void {
  const resolvedColorValue = String(token.resolvedValue ?? token.$value);
  const color = parseColor(resolvedColorValue);
  if (!color) {
    throw new Error(`Cannot parse color value: "${resolvedColorValue}"`);
  }
  const name = tokenPathToStyleName(token.path);
  let style = cache.paintStyles.find(s => s.name === name);
  if (!style) {
    style = figma.createPaintStyle();
    style.name = name;
    cache.paintStyles.push(style);
  }

  let boundVariable: Variable | null = null;
  if (hasAdditionalModes(token)) {
    const generatedPath = generatedStyleVariablePath(token.path, 'color');
    const generatedVariable = findOrCreateGeneratedVariable(
      token,
      cache,
      generatedPath,
      'COLOR',
      ['ALL_FILLS'],
    );
    setGeneratedColorVariableValues(generatedVariable, token, cache);
    boundVariable = generatedVariable;
  } else {
    const aliasVariable = resolveStyleAliasVariable(token.$value, cache);
    const samePathVariable = cache.variablesByPath.get(token.path) ?? null;
    boundVariable = aliasVariable ?? (samePathVariable?.resolvedType === 'COLOR' ? samePathVariable : null);
  }

  bindPaintColorVariable(style, boundVariable, resolvedColorValue);
  style.setPluginData('tokenPath', token.path);
  writeManagedStyleSource(style, token, hasAdditionalModes(token));
}

const TOKEN_TO_FIGMA_GRADIENT: Record<string, GradientPaint['type']> = {
  linear: 'GRADIENT_LINEAR',
  radial: 'GRADIENT_RADIAL',
  angular: 'GRADIENT_ANGULAR',
  diamond: 'GRADIENT_DIAMOND',
};

function isGradientStop(value: unknown): value is GradientStop {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { color?: unknown }).color === 'string' &&
    typeof (value as { position?: unknown }).position === 'number' &&
    Number.isFinite((value as { position: number }).position)
  );
}

function normalizeGradientValue(value: GradientStyleValue): {
  type: GradientPaint['type'];
  stops: GradientStop[];
} {
  if (Array.isArray(value)) {
    if (!value.every(isGradientStop)) {
      throw new Error('Gradient stop list contains invalid stop data.');
    }
    return {
      type: 'GRADIENT_LINEAR',
      stops: [...value].sort((left, right) => left.position - right.position),
    };
  }

  const gradientTypeName =
    typeof value.type === 'string' ? value.type : 'linear';
  const rawStops = value.stops;
  if (!Array.isArray(rawStops)) {
    throw new Error('Gradient object payload is missing a stops array.');
  }
  if (!rawStops.every(isGradientStop)) {
    throw new Error('Gradient object payload contains invalid stop data.');
  }

  return {
    type: TOKEN_TO_FIGMA_GRADIENT[gradientTypeName] ?? 'GRADIENT_LINEAR',
    stops: [...rawStops].sort((left, right) => left.position - right.position),
  };
}

function applyGradientPaintStyle(token: GradientStyleToken, cache: StyleCache): void {
  const { type, stops } = normalizeGradientValue(
    (token.resolvedValue as GradientStyleValue | undefined) ?? token.$value,
  );
  if (stops.length < 2) {
    throw new Error(`Gradient requires at least 2 stops, got ${stops.length}`);
  }
  const parseResults = stops.map((stop, i) => ({ stop, color: parseColor(stop.color), index: i }));
  const failedStops = parseResults.filter((r: { color: ReturnType<typeof parseColor> }) => !r.color);
  if (failedStops.length > 0) {
    const indices = (failedStops as Array<{ index: number; stop: { color: string } }>).map(r => `stop ${r.index} ("${r.stop.color}")`).join(', ');
    throw new Error(`${failedStops.length} of ${stops.length} gradient stop${failedStops.length > 1 ? 's' : ''} could not be parsed: ${indices}`);
  }
  const outOfRangeStop = stops.find((stop) => stop.position < 0 || stop.position > 1);
  if (outOfRangeStop) {
    throw new Error(`Gradient stop position must be between 0 and 1. Received ${outOfRangeStop.position}.`);
  }
  const gradientStops: ColorStop[] = (parseResults as Array<{ stop: { position: number }; color: NonNullable<ReturnType<typeof parseColor>> }>).map(r => ({
    position: r.stop.position,
    color: { ...r.color.rgb, a: r.color.a },
  } as ColorStop));
  const name = tokenPathToStyleName(token.path);
  let style = cache.paintStyles.find(s => s.name === name);
  if (!style) {
    style = figma.createPaintStyle();
    style.name = name;
    cache.paintStyles.push(style);
  }
  style.paints = [{
    type,
    gradientTransform: [[1, 0, 0], [0, 1, 0]],
    gradientStops,
    opacity: 1,
  } as GradientPaint];
  style.setPluginData('tokenPath', token.path);
  writeManagedStyleSource(style, token, false);
}

async function applyTextStyle(token: TypographyStyleToken, cache: StyleCache): Promise<void> {
  const name = tokenPathToStyleName(token.path);
  let style = cache.textStyles.find(s => s.name === name);
  if (!style) {
    style = figma.createTextStyle();
    style.name = name;
    cache.textStyles.push(style);
  }
  const rawValue = token.$value;
  const resolvedValue = (token.resolvedValue as TypographyValue | undefined) ?? rawValue;

  await applyResolvedTypographyToStyle(style, resolvedValue);

  for (const field of TYPOGRAPHY_BINDABLE_FIELDS) {
    style.setBoundVariable(field, null);
  }

  if (hasAdditionalModes(token)) {
    const lineHeightModeValues = tokenModeValues(token).filter((entry) => {
      const typography = entry.resolved as TypographyValue | undefined;
      return typography?.lineHeight !== undefined;
    });
    const lineHeightModeEncoding = assertConsistentEncoding(
      lineHeightModeValues.map((entry) => ({
        modeName: entry.modeName,
        resolved: (entry.resolved as TypographyValue).lineHeight,
      })),
      lineHeightEncoding,
      'line height',
    );
    const letterSpacingModeValues = tokenModeValues(token).filter((entry) => {
      const typography = entry.resolved as TypographyValue | undefined;
      return typography?.letterSpacing !== undefined;
    });
    const letterSpacingModeEncoding = assertConsistentEncoding(
      letterSpacingModeValues.map((entry) => ({
        modeName: entry.modeName,
        resolved: (entry.resolved as TypographyValue).letterSpacing,
      })),
      letterSpacingEncoding,
      'letter spacing',
    );

    const fieldVariables: Partial<Record<TypographyBindableField, Variable>> = {};

    if (resolvedValue.fontFamily !== undefined) {
      const variable = findOrCreateGeneratedVariable(
        token,
        cache,
        generatedStyleVariablePath(token.path, 'fontFamily'),
        'STRING',
        TYPOGRAPHY_FIELD_SCOPES.fontFamily,
      );
      setGeneratedStringVariableValues(variable, token, cache, (value) => {
        const typography = value as TypographyValue | undefined;
        return normalizeFontFamilyValue(typography?.fontFamily);
      });
      fieldVariables.fontFamily = variable;
    }

    if (resolvedValue.fontStyle !== undefined) {
      const variable = findOrCreateGeneratedVariable(
        token,
        cache,
        generatedStyleVariablePath(token.path, 'fontStyle'),
        'STRING',
        TYPOGRAPHY_FIELD_SCOPES.fontStyle,
      );
      setGeneratedStringVariableValues(variable, token, cache, (value) => {
        const typography = value as TypographyValue | undefined;
        return typeof typography?.fontStyle === 'string' ? typography.fontStyle : null;
      });
      fieldVariables.fontStyle = variable;
    }

    if (resolvedValue.fontWeight !== undefined) {
      const variable = findOrCreateGeneratedVariable(
        token,
        cache,
        generatedStyleVariablePath(token.path, 'fontWeight'),
        'FLOAT',
        TYPOGRAPHY_FIELD_SCOPES.fontWeight,
      );
      setGeneratedFloatVariableValues(variable, token, cache, (value) => {
        const typography = value as TypographyValue | undefined;
        return normalizeFontWeightValue(typography?.fontWeight);
      });
      fieldVariables.fontWeight = variable;
    }

    if (resolvedValue.fontSize !== undefined) {
      const variable = findOrCreateGeneratedVariable(
        token,
        cache,
        generatedStyleVariablePath(token.path, 'fontSize'),
        'FLOAT',
        TYPOGRAPHY_FIELD_SCOPES.fontSize,
      );
      setGeneratedFloatVariableValues(variable, token, cache, (value) => {
        const typography = value as TypographyValue | undefined;
        return normalizeDimensionNumber(typography?.fontSize);
      });
      fieldVariables.fontSize = variable;
    }

    if (resolvedValue.lineHeight !== undefined && lineHeightModeEncoding && lineHeightModeEncoding !== 'auto') {
      const variable = findOrCreateGeneratedVariable(
        token,
        cache,
        generatedStyleVariablePath(token.path, 'lineHeight'),
        'FLOAT',
        TYPOGRAPHY_FIELD_SCOPES.lineHeight,
      );
      setGeneratedFloatVariableValues(variable, token, cache, (value) => {
        const typography = value as TypographyValue | undefined;
        const lineHeight = typography?.lineHeight;
        if (typeof lineHeight === 'number') {
          return lineHeight * 100;
        }
        if (lineHeight && typeof lineHeight === 'object') {
          return lineHeight.value;
        }
        return null;
      });
      fieldVariables.lineHeight = variable;
    }

    if (resolvedValue.letterSpacing !== undefined && letterSpacingModeEncoding) {
      const variable = findOrCreateGeneratedVariable(
        token,
        cache,
        generatedStyleVariablePath(token.path, 'letterSpacing'),
        'FLOAT',
        TYPOGRAPHY_FIELD_SCOPES.letterSpacing,
      );
      setGeneratedFloatVariableValues(variable, token, cache, (value) => {
        const typography = value as TypographyValue | undefined;
        return normalizeDimensionNumber(typography?.letterSpacing);
      });
      fieldVariables.letterSpacing = variable;
    }

    for (const [field, variable] of Object.entries(fieldVariables) as Array<[TypographyBindableField, Variable]>) {
      style.setBoundVariable(field, variable);
    }
  } else {
    style.setBoundVariable('fontFamily', resolveStyleAliasVariable(rawValue.fontFamily, cache));
    style.setBoundVariable('fontStyle', resolveStyleAliasVariable(rawValue.fontStyle, cache));
    style.setBoundVariable('fontWeight', resolveStyleAliasVariable(rawValue.fontWeight, cache));
    style.setBoundVariable('fontSize', resolveStyleAliasVariable(rawValue.fontSize, cache));
    style.setBoundVariable('lineHeight', resolveStyleAliasVariable(rawValue.lineHeight, cache));
    style.setBoundVariable('letterSpacing', resolveStyleAliasVariable(rawValue.letterSpacing, cache));
  }

  style.setPluginData('tokenPath', token.path);
  writeManagedStyleSource(style, token, hasAdditionalModes(token));
}

function applyEffectStyle(token: ShadowStyleToken, cache: StyleCache): void {
  const name = tokenPathToStyleName(token.path);
  let style = cache.effectStyles.find(s => s.name === name);
  if (!style) {
    style = figma.createEffectStyle();
    style.name = name;
    cache.effectStyles.push(style);
  }
  const resolvedEffects = shadowTokenToEffects(
    (token.resolvedValue as ShadowValue | ShadowValue[] | undefined) ?? token.$value,
  );

  if (hasAdditionalModes(token)) {
    const boundEffects = resolvedEffects.map((effect, index) => {
      let nextEffect: Effect = effect;

      if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
        const colorVariable = findOrCreateGeneratedVariable(
          token,
          cache,
          generatedStyleVariablePath(token.path, 'effects', String(index), 'color'),
          'COLOR',
          ['EFFECT_COLOR'],
        );
        setGeneratedColorVariableValues(colorVariable, token, cache, (value) => {
          const layers = Array.isArray(value) ? value : [value];
          const layer = layers[index] as ShadowValue | undefined;
          return typeof layer?.color === 'string' ? layer.color : null;
        });
        nextEffect = figma.variables.setBoundVariableForEffect(nextEffect, 'color', colorVariable);

        const radiusVariable = findOrCreateGeneratedVariable(
          token,
          cache,
          generatedStyleVariablePath(token.path, 'effects', String(index), 'radius'),
          'FLOAT',
          ['EFFECT_FLOAT'],
        );
        setGeneratedFloatVariableValues(radiusVariable, token, cache, (value) => {
          const layers = Array.isArray(value) ? value : [value];
          const layer = layers[index] as ShadowValue | undefined;
          return normalizeDimensionNumber(layer?.blur);
        });
        nextEffect = figma.variables.setBoundVariableForEffect(nextEffect, 'radius', radiusVariable);

        const spreadVariable = findOrCreateGeneratedVariable(
          token,
          cache,
          generatedStyleVariablePath(token.path, 'effects', String(index), 'spread'),
          'FLOAT',
          ['EFFECT_FLOAT'],
        );
        setGeneratedFloatVariableValues(spreadVariable, token, cache, (value) => {
          const layers = Array.isArray(value) ? value : [value];
          const layer = layers[index] as ShadowValue | undefined;
          return normalizeDimensionNumber(layer?.spread);
        });
        nextEffect = figma.variables.setBoundVariableForEffect(nextEffect, 'spread', spreadVariable);

        const offsetXVariable = findOrCreateGeneratedVariable(
          token,
          cache,
          generatedStyleVariablePath(token.path, 'effects', String(index), 'offsetX'),
          'FLOAT',
          ['EFFECT_FLOAT'],
        );
        setGeneratedFloatVariableValues(offsetXVariable, token, cache, (value) => {
          const layers = Array.isArray(value) ? value : [value];
          const layer = layers[index] as ShadowValue | undefined;
          return normalizeDimensionNumber(layer?.offsetX);
        });
        nextEffect = figma.variables.setBoundVariableForEffect(nextEffect, 'offsetX', offsetXVariable);

        const offsetYVariable = findOrCreateGeneratedVariable(
          token,
          cache,
          generatedStyleVariablePath(token.path, 'effects', String(index), 'offsetY'),
          'FLOAT',
          ['EFFECT_FLOAT'],
        );
        setGeneratedFloatVariableValues(offsetYVariable, token, cache, (value) => {
          const layers = Array.isArray(value) ? value : [value];
          const layer = layers[index] as ShadowValue | undefined;
          return normalizeDimensionNumber(layer?.offsetY);
        });
        nextEffect = figma.variables.setBoundVariableForEffect(nextEffect, 'offsetY', offsetYVariable);
      }

      return nextEffect;
    });
    style.effects = boundEffects;
  } else {
    const rawLayers = Array.isArray(token.$value) ? token.$value : [token.$value];
    style.effects = resolvedEffects.map((effect, index) => {
      let nextEffect: Effect = effect;
      if (effect.type !== 'DROP_SHADOW' && effect.type !== 'INNER_SHADOW') {
        return nextEffect;
      }

      const rawLayer = rawLayers[index] as ShadowValue | undefined;
      const colorVariable = resolveStyleAliasVariable(rawLayer?.color, cache);
      if (colorVariable) {
        nextEffect = figma.variables.setBoundVariableForEffect(nextEffect, 'color', colorVariable);
      }

      const radiusVariable = resolveStyleAliasVariable(rawLayer?.blur, cache);
      if (radiusVariable) {
        nextEffect = figma.variables.setBoundVariableForEffect(nextEffect, 'radius', radiusVariable);
      }

      const spreadVariable = resolveStyleAliasVariable(rawLayer?.spread, cache);
      if (spreadVariable) {
        nextEffect = figma.variables.setBoundVariableForEffect(nextEffect, 'spread', spreadVariable);
      }

      const offsetXVariable = resolveStyleAliasVariable(rawLayer?.offsetX, cache);
      if (offsetXVariable) {
        nextEffect = figma.variables.setBoundVariableForEffect(nextEffect, 'offsetX', offsetXVariable);
      }

      const offsetYVariable = resolveStyleAliasVariable(rawLayer?.offsetY, cache);
      if (offsetYVariable) {
        nextEffect = figma.variables.setBoundVariableForEffect(nextEffect, 'offsetY', offsetYVariable);
      }

      return nextEffect;
    });
  }
  style.setPluginData('tokenPath', token.path);
  writeManagedStyleSource(style, token, hasAdditionalModes(token));
}

// ---------------------------------------------------------------------------
// Read styles from Figma (reverse direction)
// ---------------------------------------------------------------------------

interface ReadColorToken {
  path: string;
  $type: 'color';
  $value: string;
  _warning?: string;
  $extensions?: Record<string, unknown>;
}

interface ReadGradientToken {
  path: string;
  $type: 'gradient';
  $value: { type: string; stops: Array<{ color: string; position: number }> };
  _warning?: string;
  $extensions?: Record<string, unknown>;
}

interface ReadTypographyToken {
  path: string;
  $type: 'typography';
  $value: {
    fontFamily: string;
    fontSize: string | { value: number; unit: 'px' };
    fontWeight: string | number;
    lineHeight: string | { value: number; unit: 'px' } | number | 'auto';
    letterSpacing: string | { value: number; unit: 'px' | '%' };
    fontStyle: string;
    textDecoration?: string;
    textTransform?: string;
  };
  $extensions?: Record<string, unknown>;
}

interface ReadShadowToken {
  path: string;
  $type: 'shadow';
  $value: Array<{
    color: string;
    offsetX: string | { value: number; unit: 'px' };
    offsetY: string | { value: number; unit: 'px' };
    blur: string | { value: number; unit: 'px' };
    spread: string | { value: number; unit: 'px' };
    type: 'innerShadow' | 'dropShadow';
  }>;
  $extensions?: Record<string, unknown>;
}

type ReadStyleToken = ReadColorToken | ReadGradientToken | ReadTypographyToken | ReadShadowToken;

function toReadStyleTokenFromManagedSource(source: ManagedStyleSource): ReadStyleToken {
  const secondaryModes = source.modeValues
    ? Object.fromEntries(
        Object.entries(source.modeValues).filter(([modeName]) => modeName !== source.primaryModeName),
      )
    : undefined;

  const extensions =
    source.collectionId && secondaryModes && Object.keys(secondaryModes).length > 0
      ? {
          tokenmanager: {
            modes: {
              [source.collectionId]: secondaryModes,
            },
          },
        }
      : undefined;

  return {
    path: source.path,
    $type: source.$type,
    $value: source.$value as ReadStyleToken['$value'],
    ...(extensions ? { $extensions: extensions } : {}),
  } as ReadStyleToken;
}

function getPaintBoundColorVariable(paint: Paint, variableById: Map<string, Variable>): Variable | null {
  const boundVariableId =
    paint &&
    typeof paint === 'object' &&
    'boundVariables' in paint &&
    (paint as { boundVariables?: { color?: { id?: string } } }).boundVariables?.color?.id;
  return boundVariableId ? variableById.get(boundVariableId) ?? null : null;
}

function hasGeneratedTextStyleBindings(style: TextStyle, variableById: Map<string, Variable>): boolean {
  return TYPOGRAPHY_BINDABLE_FIELDS.some((field) => {
    const variableId = style.boundVariables?.[field]?.id;
    if (!variableId) {
      return false;
    }
    const variable = variableById.get(variableId);
    return Boolean(variable && isGeneratedStyleBackingVariable(variable));
  });
}

export async function readFigmaStyles(correlationId?: string) {
  const tokens: ReadStyleToken[] = [];
  const [localVariables, localCollections] = await Promise.all([
    figma.variables.getLocalVariablesAsync(),
    figma.variables.getLocalVariableCollectionsAsync(),
  ]);
  const variableById = new Map(localVariables.map((variable) => [variable.id, variable]));
  const collectionsById = new Map(localCollections.map((collection) => [collection.id, collection]));

  const FIGMA_GRADIENT_TYPE: Record<string, string> = {
    GRADIENT_LINEAR: 'linear',
    GRADIENT_RADIAL: 'radial',
    GRADIENT_ANGULAR: 'angular',
    GRADIENT_DIAMOND: 'diamond',
  };

  const paintStyles = await figma.getLocalPaintStylesAsync();
  for (const style of paintStyles) {
    if (style.paints.length === 0) continue;
    const visiblePaints = style.paints.filter(p => p.visible !== false);
    if (visiblePaints.length === 0) continue;
    const managedSource = readManagedStyleSource(style);

    const solidPaint = visiblePaints.find(p => p.type === 'SOLID') as SolidPaint | undefined;
    const gradientPaints = visiblePaints.filter(p =>
      p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL' ||
      p.type === 'GRADIENT_ANGULAR' || p.type === 'GRADIENT_DIAMOND'
    ) as GradientPaint[];
    const imgCount = visiblePaints.filter(p => p.type === 'IMAGE').length;

    if (solidPaint) {
      const boundColorVariable = getPaintBoundColorVariable(solidPaint, variableById);
      const stylePath = style.name.replace(/\//g, '.');
      if (
        managedSource &&
        (
          managedSource.usesGeneratedBackingVariables ||
          (boundColorVariable ? variablePath(boundColorVariable) === stylePath : false)
        )
      ) {
        tokens.push(toReadStyleTokenFromManagedSource(managedSource));
        continue;
      }

      // Solid paint wins — emit color token, warn about skipped layers
      const warnings: string[] = [];
      const solidCount = visiblePaints.filter(p => p.type === 'SOLID').length;
      if (solidCount > 1) warnings.push(`${solidCount - 1} additional solid fill(s) skipped`);
      if (gradientPaints.length > 0) warnings.push(`${gradientPaints.length} gradient fill(s) skipped`);
      if (imgCount > 0) warnings.push(`${imgCount} image fill(s) skipped`);

      const boundVariablePath = boundColorVariable ? variablePath(boundColorVariable) : null;
      const hex = boundColorVariable
        ? boundVariablePath === stylePath
          ? readVariableAuthoredDefaultValue(boundColorVariable, variableById, collectionsById) ?? rgbToHex(solidPaint.color, solidPaint.opacity ?? 1)
          : `{${boundVariablePath}}`
        : rgbToHex(solidPaint.color, solidPaint.opacity ?? 1);
      const token: ReadColorToken = {
        path: style.name.replace(/\//g, '.'),
        $type: 'color',
        $value: hex,
      };
      if (warnings.length > 0) token._warning = warnings.join('; ');
      tokens.push(token);
    } else if (gradientPaints.length > 0) {
      // No solid — emit gradient token preserving all stops
      const gradPaint = gradientPaints[0];
      if (gradPaint.gradientStops.length < 2) continue; // degenerate gradient, skip

      const gradientType = FIGMA_GRADIENT_TYPE[gradPaint.type] ?? 'linear';
      const stops = gradPaint.gradientStops.map(s => ({
        color: rgbToHex(s.color, s.color.a ?? 1),
        position: s.position,
      }));

      const warnings: string[] = [];
      if (gradientPaints.length > 1) warnings.push(`${gradientPaints.length - 1} additional gradient fill(s) skipped`);
      if (imgCount > 0) warnings.push(`${imgCount} image fill(s) skipped`);

      const token: ReadGradientToken = {
        path: style.name.replace(/\//g, '.'),
        $type: 'gradient',
        $value: { type: gradientType, stops },
      };
      if (warnings.length > 0) token._warning = warnings.join('; ');
      tokens.push(token);
    }
    // else: no solid or gradient paints (e.g. image-only) — skip this style
  }

  const textStyles = await figma.getLocalTextStylesAsync();
  for (const style of textStyles) {
    const managedSource = readManagedStyleSource(style);
    if (managedSource && managedSource.usesGeneratedBackingVariables && hasGeneratedTextStyleBindings(style, variableById)) {
      tokens.push(toReadStyleTokenFromManagedSource(managedSource));
      continue;
    }

    const fontFamilyAlias = style.boundVariables?.fontFamily
      ? variableById.get(style.boundVariables.fontFamily.id)
      : null;
    const fontSizeAlias = style.boundVariables?.fontSize
      ? variableById.get(style.boundVariables.fontSize.id)
      : null;
    const fontStyleAlias = style.boundVariables?.fontStyle
      ? variableById.get(style.boundVariables.fontStyle.id)
      : null;
    const fontWeightAlias = style.boundVariables?.fontWeight
      ? variableById.get(style.boundVariables.fontWeight.id)
      : null;
    const lineHeightAlias = style.boundVariables?.lineHeight
      ? variableById.get(style.boundVariables.lineHeight.id)
      : null;
    const letterSpacingAlias = style.boundVariables?.letterSpacing
      ? variableById.get(style.boundVariables.letterSpacing.id)
      : null;

    tokens.push({
      path: style.name.replace(/\//g, '.'),
      $type: 'typography',
      $value: {
        fontFamily: fontFamilyAlias ? `{${variablePath(fontFamilyAlias)}}` : style.fontName.family,
        fontSize: fontSizeAlias
          ? `{${variablePath(fontSizeAlias)}}`
          : { value: style.fontSize, unit: 'px' },
        fontWeight: fontWeightAlias
          ? `{${variablePath(fontWeightAlias)}}`
          : fontStyleToWeight(style.fontName.style),
        lineHeight: lineHeightAlias
          ? `{${variablePath(lineHeightAlias)}}`
          : style.lineHeight.unit === 'PIXELS'
          ? { value: style.lineHeight.value, unit: 'px' }
          : style.lineHeight.unit === 'PERCENT'
          ? style.lineHeight.value / 100
          : 'auto',
        letterSpacing: letterSpacingAlias
          ? `{${variablePath(letterSpacingAlias)}}`
          : style.letterSpacing.unit === 'PERCENT'
          ? { value: style.letterSpacing.value, unit: '%' }
          : { value: style.letterSpacing.value, unit: 'px' },
        fontStyle: fontStyleAlias
          ? `{${variablePath(fontStyleAlias)}}`
          : style.fontName.style.toLowerCase().includes('italic') ? 'italic' : 'normal',
        ...(denormalizeTextDecoration(style.textDecoration)
          ? { textDecoration: denormalizeTextDecoration(style.textDecoration) }
          : {}),
        ...(denormalizeTextTransform(style.textCase)
          ? { textTransform: denormalizeTextTransform(style.textCase) }
          : {}),
      },
    });
  }

  const effectStyles = await figma.getLocalEffectStylesAsync();
  for (const style of effectStyles) {
    const managedSource = readManagedStyleSource(style);
    if (managedSource && managedSource.usesGeneratedBackingVariables) {
      tokens.push(toReadStyleTokenFromManagedSource(managedSource));
      continue;
    }

    const shadows = style.effects.filter(e => e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW');
    if (shadows.length > 0) {
      tokens.push({
        path: style.name.replace(/\//g, '.'),
        $type: 'shadow',
        $value: shadows.map(s => {
          const shadow = s as DropShadowEffect;
          const boundVariables =
            (shadow as DropShadowEffect & {
              boundVariables?: {
                color?: { id?: string };
                radius?: { id?: string };
                spread?: { id?: string };
                offsetX?: { id?: string };
                offsetY?: { id?: string };
              };
            }).boundVariables ?? {};
          const colorAlias = boundVariables.color?.id
            ? variableById.get(boundVariables.color.id)
            : null;
          const radiusAlias = boundVariables.radius?.id
            ? variableById.get(boundVariables.radius.id)
            : null;
          const spreadAlias = boundVariables.spread?.id
            ? variableById.get(boundVariables.spread.id)
            : null;
          const offsetXAlias = boundVariables.offsetX?.id
            ? variableById.get(boundVariables.offsetX.id)
            : null;
          const offsetYAlias = boundVariables.offsetY?.id
            ? variableById.get(boundVariables.offsetY.id)
            : null;
          return {
            color: colorAlias ? `{${variablePath(colorAlias)}}` : rgbToHex(shadow.color, shadow.color.a),
            offsetX: offsetXAlias ? `{${variablePath(offsetXAlias)}}` : { value: shadow.offset.x, unit: 'px' as const },
            offsetY: offsetYAlias ? `{${variablePath(offsetYAlias)}}` : { value: shadow.offset.y, unit: 'px' as const },
            blur: radiusAlias ? `{${variablePath(radiusAlias)}}` : { value: shadow.radius, unit: 'px' as const },
            spread: spreadAlias ? `{${variablePath(spreadAlias)}}` : { value: shadow.spread || 0, unit: 'px' as const },
            type: s.type === 'INNER_SHADOW' ? 'innerShadow' as const : 'dropShadow' as const,
          };
        }),
      });
    }
  }

  figma.ui.postMessage({ type: 'styles-read', tokens, correlationId });
}
