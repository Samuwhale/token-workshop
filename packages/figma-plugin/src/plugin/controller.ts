// This runs in Figma's sandbox (no DOM access)

import type { PluginMessage } from '../shared/types.js';
import { getErrorMessage } from '../shared/utils.js';
import { applyVariables, readFigmaVariables, deleteOrphanVariables, scanTokenVariableBindings, revertVariables } from './variableSync.js';
import { applyStyles, readFigmaStyles, revertStyles } from './styleSync.js';
import { getAvailableFontData, invalidateFontCache } from './fontLoading.js';
import { applyToSelection, getSelection, removeBinding, clearAllBindings, syncBindings, remapBindings, highlightLayersByToken, extractTokensFromSelection, scanTokenUsageMap, searchLayers, findPeersForProperty, applyToNodes, removeBindingFromNode, setSelectionDeepInspectEnabled } from './selectionHandling.js';
import { selectNode, selectNextSibling, batchBindHeatmapNodes } from './heatmapScanning.js';
import { createSelectionIconSlots, insertIconInstance, replaceSelectionWithIcon, setSelectionIconSwapProperty } from './iconCanvas.js';
import { readSelectedIconsForImport } from './iconSelectionImport.js';
import { publishIcons } from './iconSync.js';
import { scanIconUsage } from './iconUsageAudit.js';

figma.showUI(__html__, { width: 680, height: 720, themeColors: true });

let deepInspectEnabled = false;
setSelectionDeepInspectEnabled(false);

// ---------------------------------------------------------------------------
// Sync operation mutex
// ---------------------------------------------------------------------------
// Figma's plugin runtime allows concurrent async message handling — if the
// user triggers a second sync while the first is still in-flight, both
// applyVariables calls would mutate Figma variables concurrently, causing
// interleaved writes and potential data corruption. The promise-chain lock
// below serialises all destructive sync operations (apply-variables,
// apply-styles, delete-orphan-variables) so they execute one at a time.
// Read-only operations (read-variables, get-selection, etc.) bypass the lock.
// ---------------------------------------------------------------------------
let _syncChain: Promise<void> = Promise.resolve();

function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = _syncChain.then(() => fn());
  // Absorb rejections on the chain tail so a failed op doesn't block
  // subsequent queued operations — the original promise still rejects for
  // the caller.
  _syncChain = result.then(() => undefined, () => undefined);
  return result;
}

// ---------------------------------------------------------------------------
// Scan cancellation
// ---------------------------------------------------------------------------
// Long-running token-usage scans each keep their own active signal. Starting a
// new scan of the same kind aborts the older one without touching unrelated
// scans. The UI sends `cancel-scan` to abort either the matching requestId or
// all active scans when no requestId is supplied.
// ---------------------------------------------------------------------------

type ScanKind = 'token-usage-map';

type ActiveScanState = {
  kind: ScanKind;
  signal: { aborted: boolean };
  requestId?: string;
};

const _activeScans = new Map<ScanKind, ActiveScanState>();

/** Abort any in-flight scan of the same kind and return a fresh signal for the next one. */
function createScanSignal(kind: ScanKind, requestId?: string): { aborted: boolean } {
  const existing = _activeScans.get(kind);
  if (existing) {
    existing.signal.aborted = true;
  }
  const signal = { aborted: false };
  _activeScans.set(kind, { kind, signal, requestId });
  return signal;
}

/** Abort the matching in-flight scan, or all scans when no requestId is provided. */
function cancelActiveScan(requestId?: string): void {
  if (_activeScans.size === 0) {
    return;
  }

  if (!requestId) {
    for (const activeScan of _activeScans.values()) {
      activeScan.signal.aborted = true;
    }
    _activeScans.clear();
    return;
  }

  for (const [kind, activeScan] of _activeScans.entries()) {
    if (activeScan.requestId !== requestId) {
      continue;
    }
    activeScan.signal.aborted = true;
    _activeScans.delete(kind);
  }
}

/** Clear the active signal after a scan completes, but only if it's still ours. */
function clearScanSignal(kind: ScanKind, signal: { aborted: boolean }): void {
  if (_activeScans.get(kind)?.signal === signal) {
    _activeScans.delete(kind);
  }
}

/** Post a generic error back to the UI so it doesn't hang waiting for a response. */
function reportError(handler: string, e: unknown): void {
  const message = getErrorMessage(e, `Unexpected error in ${handler}`);
  console.error(`[controller] ${handler} failed:`, e);
  figma.notify(`Error: ${message}`, { error: true });
  figma.ui.postMessage({ type: 'error', message, handler });
}

// ---------------------------------------------------------------------------
// Runtime message validation
// ---------------------------------------------------------------------------
// TypeScript's discriminated union only guarantees types at compile time.
// A malformed postMessage (e.g. from a stale UI build or a third-party
// integration) can arrive with missing or wrong-typed properties, causing
// silent misbehaviour or crashes (especially figma.ui.resize with non-numbers).
//
// Each entry maps a message type to an array of [propertyName, expectedType]
// checks.  "object" also passes arrays; use "array" for strict array checks.
// ---------------------------------------------------------------------------

type Check = [prop: string, expected: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'function' | 'any'];

const MESSAGE_SCHEMA: Record<string, Check[]> = {
  'apply-variables':            [['tokens', 'array']],
  'apply-styles':               [['tokens', 'array']],
  'read-variables':             [],
  'read-styles':                [],
  'apply-to-selection':         [['tokenPath', 'string'], ['tokenType', 'string'], ['targetProperty', 'string'], ['resolvedValue', 'any']],
  'get-selection':              [],
  'set-deep-inspect':           [['enabled', 'boolean']],
  'remove-binding':             [['property', 'string']],
  'clear-all-bindings':         [],
  'sync-bindings':              [['tokenMap', 'object'], ['scope', 'string']],
  'remap-bindings':             [['remapMap', 'object'], ['scope', 'string']],
  'highlight-layer-by-token':   [['tokenPath', 'string']],
  'notify':                     [['message', 'string']],
  'resize':                     [['width', 'number'], ['height', 'number']],
  'delete-orphan-variables':    [['knownPaths', 'array']],
  'scan-token-usage':           [],
  'select-node':                [['nodeId', 'string']],
  'select-next-sibling':        [],
  'batch-bind-heatmap-nodes':   [['nodeIds', 'array'], ['tokenPath', 'string'], ['tokenType', 'string'], ['targetProperty', 'string'], ['resolvedValue', 'any']],
  'scan-token-variable-bindings': [['tokenPath', 'string']],
  'extract-tokens-from-selection': [],
  'search-layers':              [['query', 'string']],
  'find-peers-for-property':    [['nodeId', 'string'], ['property', 'string']],
  'apply-to-nodes':             [['nodeIds', 'array'], ['tokenPath', 'string'], ['tokenType', 'string'], ['targetProperty', 'string'], ['resolvedValue', 'any']],
  'remove-binding-from-node':   [['nodeId', 'string'], ['property', 'string']],
  'get-available-fonts':        [],
  'eyedropper':                 [],
  'revert-variables':           [['varSnapshot', 'object']],
  'revert-styles':              [['styleSnapshot', 'object']],
  'publish-icons':              [['pageName', 'string'], ['icons', 'array']],
  'read-icon-selection':        [],
  'insert-icon':                [['icon', 'object']],
  'replace-selection-with-icon': [['icon', 'object']],
  'set-icon-swap-property':     [['icon', 'object'], ['propertyName', 'string'], ['targetNodeIds', 'array']],
  'create-icon-slot':           [['icon', 'object'], ['targetNodeIds', 'array']],
  'scan-icon-usage':            [['scope', 'string'], ['icons', 'array']],
  'cancel-scan':                [],
};

/**
 * Validate a varSnapshot object from a revert-variables message.
 * Returns null if valid, or a human-readable error string.
 */
function validateVarSnapshot(v: unknown): string | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) {
    return 'varSnapshot must be an object';
  }
  const snap = v as Record<string, unknown>;

  if (snap.records == null || typeof snap.records !== 'object' || Array.isArray(snap.records)) {
    return 'varSnapshot.records must be an object';
  }
  for (const [varId, entry] of Object.entries(snap.records as Record<string, unknown>)) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      return `varSnapshot.records["${varId}"] must be an object`;
    }
    const e = entry as Record<string, unknown>;
    if (e.valuesByMode == null || typeof e.valuesByMode !== 'object' || Array.isArray(e.valuesByMode)) {
      return `varSnapshot.records["${varId}"].valuesByMode must be an object`;
    }
    if (typeof e.name !== 'string') {
      return `varSnapshot.records["${varId}"].name must be a string`;
    }
    if (typeof e.description !== 'string') {
      return `varSnapshot.records["${varId}"].description must be a string`;
    }
    if (typeof e.hiddenFromPublishing !== 'boolean') {
      return `varSnapshot.records["${varId}"].hiddenFromPublishing must be a boolean`;
    }
    if (!Array.isArray(e.scopes)) {
      return `varSnapshot.records["${varId}"].scopes must be an array`;
    }
    if (e.pluginData == null || typeof e.pluginData !== 'object' || Array.isArray(e.pluginData)) {
      return `varSnapshot.records["${varId}"].pluginData must be an object`;
    }
    const pd = e.pluginData as Record<string, unknown>;
    if (typeof pd.tokenPath !== 'string') {
      return `varSnapshot.records["${varId}"].pluginData.tokenPath must be a string`;
    }
    if (typeof pd.tokenCollection !== 'string') {
      return `varSnapshot.records["${varId}"].pluginData.tokenCollection must be a string`;
    }
    if (pd.styleBacking !== undefined && typeof pd.styleBacking !== 'string') {
      return `varSnapshot.records["${varId}"].pluginData.styleBacking must be a string when present`;
    }
  }

  if (!Array.isArray(snap.createdIds)) {
    return 'varSnapshot.createdIds must be an array';
  }
  for (let i = 0; i < (snap.createdIds as unknown[]).length; i++) {
    if (typeof (snap.createdIds as unknown[])[i] !== 'string') {
      return `varSnapshot.createdIds[${i}] must be a string`;
    }
  }

  return null;
}

/**
 * Validate a styleSnapshot object from a revert-styles message.
 * Returns null if valid, or a human-readable error string.
 */
function validateStyleSnapshot(v: unknown): string | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) {
    return 'styleSnapshot must be an object';
  }
  const snap = v as Record<string, unknown>;

  if (!Array.isArray(snap.snapshots)) {
    return 'styleSnapshot.snapshots must be an array';
  }
  for (let i = 0; i < (snap.snapshots as unknown[]).length; i++) {
    const entry = (snap.snapshots as unknown[])[i];
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      return `styleSnapshot.snapshots[${i}] must be an object`;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string') {
      return `styleSnapshot.snapshots[${i}].id must be a string`;
    }
    if (e.type !== 'paint' && e.type !== 'text' && e.type !== 'effect') {
      return `styleSnapshot.snapshots[${i}].type must be "paint", "text", or "effect"`;
    }
    if (e.data === undefined) {
      return `styleSnapshot.snapshots[${i}].data is required`;
    }
  }

  if (!Array.isArray(snap.createdIds)) {
    return 'styleSnapshot.createdIds must be an array';
  }
  for (let i = 0; i < (snap.createdIds as unknown[]).length; i++) {
    if (typeof (snap.createdIds as unknown[])[i] !== 'string') {
      return `styleSnapshot.createdIds[${i}] must be a string`;
    }
  }

  if (snap.backingVariables !== undefined) {
    const backingVarError = validateVarSnapshot(snap.backingVariables);
    if (backingVarError) {
      return `styleSnapshot.backingVariables invalid: ${backingVarError}`;
    }

    const backing = snap.backingVariables as Record<string, unknown>;
    if (!Array.isArray(backing.createdCollectionIds)) {
      return 'styleSnapshot.backingVariables.createdCollectionIds must be an array';
    }
    for (let i = 0; i < (backing.createdCollectionIds as unknown[]).length; i++) {
      if (typeof (backing.createdCollectionIds as unknown[])[i] !== 'string') {
        return `styleSnapshot.backingVariables.createdCollectionIds[${i}] must be a string`;
      }
    }
  }

  return null;
}

/**
 * Validate a plugin message against its schema.
 * Returns null if valid, or a human-readable error string.
 */
function validateMessage(msg: Record<string, unknown>): string | null {
  if (msg == null || typeof msg !== 'object') {
    return 'Message is not an object';
  }
  const type = msg.type;
  if (typeof type !== 'string') {
    return 'Message has no "type" string property';
  }
  const checks = MESSAGE_SCHEMA[type];
  if (!checks) {
    // Unknown message type — not necessarily an error (could be from a newer UI),
    // but we can't dispatch it so treat it as a no-op.
    return `Unknown message type "${type}"`;
  }
  for (const [prop, expected] of checks) {
    const val = msg[prop];
    if (val === undefined) {
      return `${type}: missing required property "${prop}"`;
    }
    if (expected === 'any') {
      // allow any value including null — presence check only
      continue;
    }
    if (val === null) {
      return `${type}: missing required property "${prop}"`;
    }
    if (expected === 'array') {
      if (!Array.isArray(val)) {
        return `${type}: "${prop}" must be an array, got ${typeof val}`;
      }
    } else if (typeof val !== expected) {
      return `${type}: "${prop}" must be ${expected}, got ${typeof val}`;
    }
  }
  return null;
}

// Handle messages from UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  // Runtime validation — catch malformed messages before dispatch
  const validationError = validateMessage(msg as unknown as Record<string, unknown>);
  if (validationError) {
    console.error(`[controller] Invalid message:`, validationError, msg);
    figma.ui.postMessage({ type: 'error', message: validationError, handler: 'validation' });
    return;
  }

  switch (msg.type) {
    case 'apply-variables':
      try {
        await withSyncLock(() => applyVariables(msg.tokens, msg.collectionMap ?? {}, msg.modeMap ?? {}, msg.renames, msg.correlationId));
      } catch (e) {
        figma.ui.postMessage({
          type: 'apply-variables-error',
          error: getErrorMessage(e, 'Failed to apply variables'),
          correlationId: msg.correlationId,
        });
      }
      break;
    case 'apply-styles':
      try {
        await withSyncLock(() => applyStyles(msg.tokens, msg.correlationId));
      } catch (e) {
        figma.ui.postMessage({
          type: 'styles-apply-error',
          error: getErrorMessage(e, 'Failed to apply styles'),
          correlationId: msg.correlationId,
        });
      }
      break;
    case 'revert-variables': {
      const varSnapError = validateVarSnapshot(msg.varSnapshot);
      if (varSnapError) {
        console.error('[controller] revert-variables: invalid varSnapshot:', varSnapError);
        figma.ui.postMessage({
          type: 'variables-reverted',
          correlationId: msg.correlationId,
          failures: [`Invalid snapshot data: ${varSnapError}`],
        });
        break;
      }
      try {
        await withSyncLock(() => revertVariables(msg.varSnapshot, msg.correlationId));
      } catch (e) {
        figma.ui.postMessage({
          type: 'variables-reverted',
          correlationId: msg.correlationId,
          failures: [getErrorMessage(e, 'Failed to revert variables')],
        });
      }
      break;
    }
    case 'revert-styles': {
      const styleSnapError = validateStyleSnapshot(msg.styleSnapshot);
      if (styleSnapError) {
        console.error('[controller] revert-styles: invalid styleSnapshot:', styleSnapError);
        figma.ui.postMessage({
          type: 'styles-reverted',
          correlationId: msg.correlationId,
          failures: [`Invalid snapshot data: ${styleSnapError}`],
        });
        break;
      }
      try {
        await withSyncLock(() => revertStyles(msg.styleSnapshot, msg.correlationId));
      } catch (e) {
        figma.ui.postMessage({
          type: 'styles-reverted',
          correlationId: msg.correlationId,
          failures: [getErrorMessage(e, 'Failed to revert styles')],
        });
      }
      break;
    }
    case 'read-variables':
      try {
        await readFigmaVariables(msg.correlationId);
      } catch (e) {
        figma.ui.postMessage({
          type: 'variables-read-error',
          error: getErrorMessage(e, 'Failed to read Figma variables'),
          correlationId: msg.correlationId,
        });
      }
      break;
    case 'read-styles':
      try {
        await readFigmaStyles(msg.correlationId);
      } catch (e) {
        figma.ui.postMessage({
          type: 'styles-read-error',
          error: getErrorMessage(e, 'Failed to read Figma styles'),
          correlationId: msg.correlationId,
        });
      }
      break;
    case 'apply-to-selection':
      try {
        await applyToSelection(
          msg.tokenPath,
          msg.tokenType,
          msg.targetProperty,
          msg.resolvedValue,
          msg.collectionId,
        );
      } catch (e) {
        reportError('apply-to-selection', e);
      }
      break;
    case 'get-selection':
      try {
        await getSelection();
      } catch (e) {
        reportError('get-selection', e);
      }
      break;
    case 'set-deep-inspect':
      try {
        deepInspectEnabled = msg.enabled;
        setSelectionDeepInspectEnabled(msg.enabled);
        await getSelection();
      } catch (e) {
        reportError('set-deep-inspect', e);
      }
      break;
    case 'remove-binding':
      try {
        await removeBinding(msg.property);
      } catch (e) {
        reportError('remove-binding', e);
      }
      break;
    case 'clear-all-bindings':
      try {
        await clearAllBindings();
      } catch (e) {
        reportError('clear-all-bindings', e);
      }
      break;
    case 'sync-bindings':
      try {
        await syncBindings(msg.tokenMap, msg.scope);
      } catch (e) {
        reportError('sync-bindings', e);
      }
      break;
    case 'remap-bindings':
      try {
        await remapBindings(msg.remapMap, msg.scope, deepInspectEnabled);
      } catch (e) {
        reportError('remap-bindings', e);
      }
      break;
    case 'highlight-layer-by-token':
      try {
        await highlightLayersByToken(msg.tokenPath);
      } catch (e) {
        reportError('highlight-layer-by-token', e);
      }
      break;
    case 'notify':
      figma.notify(msg.message);
      break;
    case 'resize':
      figma.ui.resize(msg.width, msg.height);
      break;
    case 'delete-orphan-variables':
      try {
        await withSyncLock(() => deleteOrphanVariables(msg.knownPaths, msg.collectionMap ?? {}, msg.targets ?? [], msg.correlationId));
      } catch (e) {
        reportError('delete-orphan-variables', e);
      }
      break;
    case 'publish-icons':
      try {
        await withSyncLock(() => publishIcons(msg));
      } catch (e) {
        figma.ui.postMessage({
          type: 'icons-published',
          results: msg.icons.map((icon) => ({
            id: icon.id,
            error: getErrorMessage(e, 'Failed to publish icons'),
          })),
          correlationId: msg.correlationId,
        });
      }
      break;
    case 'read-icon-selection':
      try {
        const icons = await readSelectedIconsForImport();
        figma.ui.postMessage({
          type: 'icon-selection-read',
          icons,
          correlationId: msg.correlationId,
        });
      } catch (e) {
        figma.ui.postMessage({
          type: 'icon-selection-read',
          icons: [],
          error: getErrorMessage(e, 'Failed to read selected icons.'),
          correlationId: msg.correlationId,
        });
      }
      break;
    case 'insert-icon':
      try {
        const count = await insertIconInstance(msg.icon);
        figma.ui.postMessage({
          type: 'icon-canvas-action-result',
          action: 'insert',
          iconId: msg.icon.id,
          count,
          skipped: 0,
          correlationId: msg.correlationId,
        });
        await getSelection();
      } catch (e) {
        figma.ui.postMessage({
          type: 'icon-canvas-action-result',
          action: 'insert',
          iconId: msg.icon.id,
          count: 0,
          skipped: 0,
          error: getErrorMessage(e, 'Failed to insert icon.'),
          correlationId: msg.correlationId,
        });
      }
      break;
    case 'replace-selection-with-icon':
      try {
        const result = await replaceSelectionWithIcon(msg.icon);
        figma.ui.postMessage({
          type: 'icon-canvas-action-result',
          action: 'replace',
          iconId: msg.icon.id,
          ...result,
          correlationId: msg.correlationId,
        });
        await getSelection();
      } catch (e) {
        figma.ui.postMessage({
          type: 'icon-canvas-action-result',
          action: 'replace',
          iconId: msg.icon.id,
          count: 0,
          skipped: 0,
          error: getErrorMessage(e, 'Failed to replace selection.'),
          correlationId: msg.correlationId,
        });
      }
      break;
    case 'set-icon-swap-property':
      try {
        const result = await setSelectionIconSwapProperty(
          msg.icon,
          msg.propertyName,
          msg.targetNodeIds,
        );
        figma.ui.postMessage({
          type: 'icon-canvas-action-result',
          action: 'set-slot',
          iconId: msg.icon.id,
          ...result,
          correlationId: msg.correlationId,
        });
        await getSelection();
      } catch (e) {
        figma.ui.postMessage({
          type: 'icon-canvas-action-result',
          action: 'set-slot',
          iconId: msg.icon.id,
          count: 0,
          skipped: 0,
          error: getErrorMessage(e, 'Failed to set icon slot.'),
          correlationId: msg.correlationId,
        });
      }
      break;
    case 'create-icon-slot':
      try {
        const result = await createSelectionIconSlots(
          msg.icon,
          msg.targetNodeIds,
        );
        figma.ui.postMessage({
          type: 'icon-canvas-action-result',
          action: 'create-slot',
          iconId: msg.icon.id,
          ...result,
          correlationId: msg.correlationId,
        });
        await getSelection();
      } catch (e) {
        figma.ui.postMessage({
          type: 'icon-canvas-action-result',
          action: 'create-slot',
          iconId: msg.icon.id,
          count: 0,
          skipped: 0,
          error: getErrorMessage(e, 'Failed to create icon slot.'),
          correlationId: msg.correlationId,
        });
      }
      break;
    case 'scan-icon-usage':
      await scanIconUsage({
        scope: msg.scope,
        icons: msg.icons,
        correlationId: msg.correlationId,
      });
      break;
    case 'cancel-scan':
      cancelActiveScan(msg.requestId);
      break;
    case 'scan-token-usage': {
      const signal = createScanSignal('token-usage-map');
      try {
        await scanTokenUsageMap(signal);
      } catch (e) {
        reportError('scan-token-usage', e);
      } finally {
        clearScanSignal('token-usage-map', signal);
      }
      break;
    }
    case 'select-node':
      try {
        await selectNode(msg.nodeId);
      } catch (e) {
        reportError('select-node', e);
      }
      break;
    case 'select-next-sibling':
      selectNextSibling();
      break;
    case 'batch-bind-heatmap-nodes':
      try {
        await batchBindHeatmapNodes(msg.nodeIds, msg.tokenPath, msg.tokenType, msg.targetProperty, msg.resolvedValue, msg.skipNavigation);
      } catch (e) {
        reportError('batch-bind-heatmap-nodes', e);
      }
      break;
    case 'scan-token-variable-bindings':
      try {
        await scanTokenVariableBindings(msg.tokenPath);
      } catch (e) {
        reportError('scan-token-variable-bindings', e);
      }
      break;
    case 'extract-tokens-from-selection':
      try {
        await extractTokensFromSelection();
      } catch (e) {
        reportError('extract-tokens-from-selection', e);
      }
      break;
    case 'search-layers':
      try {
        searchLayers(msg.query, msg.correlationId);
      } catch (e) {
        reportError('search-layers', e);
      }
      break;
    case 'find-peers-for-property':
      try {
        findPeersForProperty(msg.nodeId, msg.property);
      } catch (e) {
        reportError('find-peers-for-property', e);
      }
      break;
    case 'apply-to-nodes':
      try {
        await applyToNodes(msg.nodeIds, msg.tokenPath, msg.tokenType, msg.targetProperty, msg.resolvedValue, msg.collectionId);
      } catch (e) {
        reportError('apply-to-nodes', e);
      }
      break;
    case 'remove-binding-from-node':
      try {
        await removeBindingFromNode(msg.nodeId, msg.property);
      } catch (e) {
        reportError('remove-binding-from-node', e);
      }
      break;
    case 'get-available-fonts': {
      try {
        invalidateFontCache();
        const { families, weightsByFamily } = await getAvailableFontData();
        figma.ui.postMessage({ type: 'fonts-loaded', families, weightsByFamily });
      } catch (e) {
        reportError('get-available-fonts', e);
      }
      break;
    }
    case 'eyedropper':
      try {
        sampleSelectionColor();
      } catch (e) {
        reportError('eyedropper', e);
      }
      break;
    default: {
      // Should be unreachable — validateMessage() returns early for unknown types.
      // This default branch is a compile-time exhaustiveness guard.
      const _exhaustive: never = msg;
      console.warn('[controller] Unhandled message type in switch:', (_exhaustive as { type: string }).type);
    }
  }
};

// Sample fill color from the first selected node and send it back to UI
function sampleSelectionColor() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.notify('Select a layer to sample its fill color');
    return;
  }
  const node = sel[0];
  if (!('fills' in node) || !Array.isArray(node.fills) || node.fills.length === 0) {
    figma.notify('Selected layer has no fills');
    return;
  }
  const fill = (node.fills as readonly Paint[]).find((f): f is SolidPaint => f.type === 'SOLID' && f.visible !== false);
  if (!fill) {
    figma.notify('No solid fill found on selected layer');
    return;
  }
  const { r, g, b } = fill.color;
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  let hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (fill.opacity !== undefined && fill.opacity < 1) {
    hex += toHex(fill.opacity);
  }
  figma.ui.postMessage({ type: 'eyedropper-result', hex });
}

// Listen for selection changes — store the handler so it can be removed on close
function _onSelectionChange() {
  getSelection();
}
figma.on('selectionchange', _onSelectionChange);

// Cancel any in-flight scan and remove event listeners when the plugin UI is closed
figma.on('close', () => {
  cancelActiveScan();
  figma.off('selectionchange', _onSelectionChange);
});
