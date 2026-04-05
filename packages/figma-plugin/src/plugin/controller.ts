// This runs in Figma's sandbox (no DOM access)

import type { PluginMessage } from '../shared/types.js';
import { applyVariables, readFigmaVariables, deleteOrphanVariables, exportAllVariables, scanTokenVariableBindings, revertVariables } from './variableSync.js';
import { applyStyles, readFigmaStyles, revertStyles } from './styleSync.js';
import { getAvailableFontData, invalidateFontCache } from './fontLoading.js';
import { applyToSelection, getSelection, removeBinding, clearAllBindings, syncBindings, remapBindings, highlightLayersByToken, extractTokensFromSelection, scanTokenUsageMap, searchLayers, findPeersForProperty, applyToNodes, removeBindingFromNode } from './selectionHandling.js';
import { scanComponentCoverage, selectNode, selectNextSibling, scanCanvasHeatmap, selectHeatmapNodes, batchBindHeatmapNodes, scanTokenUsage } from './heatmapScanning.js';
import { scanConsistency } from './consistencyScanner.js';

figma.showUI(__html__, { width: 420, height: 640, themeColors: true });

let deepInspectEnabled = false;

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
// Long-running scans (heatmap, consistency, coverage, token-usage) share a
// single active signal object. The UI sends `cancel-scan` to abort the current
// scan; each scan function checks `signal.aborted` at batch boundaries and
// posts a *-cancelled message before returning early.
// ---------------------------------------------------------------------------

let _activeScanSignal: { aborted: boolean } | null = null;

/** Abort any in-flight scan and return a fresh signal for the next one. */
function createScanSignal(): { aborted: boolean } {
  if (_activeScanSignal) _activeScanSignal.aborted = true;
  const signal = { aborted: false };
  _activeScanSignal = signal;
  return signal;
}

/** Abort the in-flight scan without starting a new one. */
function cancelActiveScan(): void {
  if (_activeScanSignal) {
    _activeScanSignal.aborted = true;
    _activeScanSignal = null;
  }
}

/** Clear the active signal after a scan completes, but only if it's still ours. */
function clearScanSignal(signal: { aborted: boolean }): void {
  if (_activeScanSignal === signal) _activeScanSignal = null;
}

/** Extract a human-readable message from an unknown thrown value. */
function describeError(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

/** Post a generic error back to the UI so it doesn't hang waiting for a response. */
function reportError(handler: string, e: unknown): void {
  const message = describeError(e, `Unexpected error in ${handler}`);
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
  'export-all-variables':       [],
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
  'scan-component-coverage':    [],
  'select-node':                [['nodeId', 'string']],
  'select-next-sibling':        [],
  'scan-canvas-heatmap':        [],
  'select-heatmap-nodes':       [['nodeIds', 'array']],
  'batch-bind-heatmap-nodes':   [['nodeIds', 'array'], ['tokenPath', 'string'], ['tokenType', 'string'], ['targetProperty', 'string'], ['resolvedValue', 'any']],
  'scan-single-token-usage':    [['tokenPath', 'string']],
  'scan-token-variable-bindings': [['tokenPath', 'string']],
  'extract-tokens-from-selection': [],
  'scan-consistency':           [['tokenMap', 'object'], ['scope', 'string']],
  'search-layers':              [['query', 'string']],
  'find-peers-for-property':    [['nodeId', 'string'], ['property', 'string']],
  'apply-to-nodes':             [['nodeIds', 'array'], ['tokenPath', 'string'], ['tokenType', 'string'], ['targetProperty', 'string'], ['resolvedValue', 'any']],
  'remove-binding-from-node':   [['nodeId', 'string'], ['property', 'string']],
  'get-available-fonts':        [],
  'eyedropper':                 [],
  'get-active-themes':          [],
  'set-active-themes':          [['themes', 'object']],
  'revert-variables':           [['varSnapshot', 'object']],
  'revert-styles':              [['styleSnapshot', 'object']],
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
    if (typeof pd.tokenSet !== 'string') {
      return `varSnapshot.records["${varId}"].pluginData.tokenSet must be a string`;
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
        await withSyncLock(() => applyVariables(msg.tokens, msg.collectionMap ?? {}, msg.modeMap ?? {}, msg.correlationId));
      } catch (e) {
        figma.ui.postMessage({
          type: 'apply-variables-error',
          error: describeError(e, 'Failed to apply variables'),
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
          error: describeError(e, 'Failed to apply styles'),
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
          failures: [describeError(e, 'Failed to revert variables')],
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
          failures: [describeError(e, 'Failed to revert styles')],
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
          error: describeError(e, 'Failed to read Figma variables'),
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
          error: describeError(e, 'Failed to read Figma styles'),
          correlationId: msg.correlationId,
        });
      }
      break;
    case 'export-all-variables':
      try {
        await exportAllVariables();
      } catch (e) {
        reportError('export-all-variables', e);
      }
      break;
    case 'apply-to-selection':
      try {
        await applyToSelection(msg.tokenPath, msg.tokenType, msg.targetProperty, msg.resolvedValue);
      } catch (e) {
        reportError('apply-to-selection', e);
      }
      break;
    case 'get-selection':
      try {
        await getSelection(deepInspectEnabled);
      } catch (e) {
        reportError('get-selection', e);
      }
      break;
    case 'set-deep-inspect':
      try {
        deepInspectEnabled = msg.enabled;
        await getSelection(deepInspectEnabled);
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
        await withSyncLock(() => deleteOrphanVariables(msg.knownPaths, msg.collectionMap ?? {}, msg.correlationId));
      } catch (e) {
        reportError('delete-orphan-variables', e);
      }
      break;
    case 'cancel-scan':
      cancelActiveScan();
      figma.ui.postMessage({ type: 'scan-cancelled' });
      break;
    case 'scan-token-usage': {
      const signal = createScanSignal();
      try {
        await scanTokenUsageMap(signal);
      } catch (e) {
        reportError('scan-token-usage', e);
      } finally {
        clearScanSignal(signal);
      }
      break;
    }
    case 'scan-component-coverage': {
      const signal = createScanSignal();
      try {
        await scanComponentCoverage(msg.correlationId, signal);
      } catch (e) {
        reportError('scan-component-coverage', e);
      } finally {
        clearScanSignal(signal);
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
    case 'scan-canvas-heatmap': {
      const signal = createScanSignal();
      try {
        await scanCanvasHeatmap(msg.scope ?? 'page', signal);
      } catch (e) {
        reportError('scan-canvas-heatmap', e);
      } finally {
        clearScanSignal(signal);
      }
      break;
    }
    case 'select-heatmap-nodes':
      try {
        await selectHeatmapNodes(msg.nodeIds);
      } catch (e) {
        reportError('select-heatmap-nodes', e);
      }
      break;
    case 'batch-bind-heatmap-nodes':
      try {
        await batchBindHeatmapNodes(msg.nodeIds, msg.tokenPath, msg.tokenType, msg.targetProperty, msg.resolvedValue, msg.skipNavigation);
      } catch (e) {
        reportError('batch-bind-heatmap-nodes', e);
      }
      break;
    case 'scan-single-token-usage': {
      const signal = createScanSignal();
      try {
        await scanTokenUsage(msg.tokenPath, signal);
      } catch (e) {
        reportError('scan-single-token-usage', e);
      } finally {
        clearScanSignal(signal);
      }
      break;
    }
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
    case 'scan-consistency': {
      const signal = createScanSignal();
      try {
        await scanConsistency(msg.tokenMap, msg.scope, signal);
      } catch (e) {
        reportError('scan-consistency', e);
      } finally {
        clearScanSignal(signal);
      }
      break;
    }
    case 'search-layers':
      try {
        searchLayers(msg.query);
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
        await applyToNodes(msg.nodeIds, msg.tokenPath, msg.tokenType, msg.targetProperty, msg.resolvedValue);
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
    case 'get-active-themes': {
      try {
        const key = `active-themes:${figma.fileKey ?? 'default'}`;
        const themes = await figma.clientStorage.getAsync(key);
        figma.ui.postMessage({ type: 'active-themes-loaded', themes: themes ?? {} });
      } catch (e) {
        reportError('get-active-themes', e);
      }
      break;
    }
    case 'set-active-themes': {
      try {
        const key = `active-themes:${figma.fileKey ?? 'default'}`;
        if (msg.themes && Object.keys(msg.themes).length > 0) {
          await figma.clientStorage.setAsync(key, msg.themes);
        } else {
          await figma.clientStorage.deleteAsync(key);
        }
      } catch (e) {
        reportError('set-active-themes', e);
      }
      break;
    }
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

// Cancel any in-flight scan when the plugin UI is closed
figma.on('close', () => {
  cancelActiveScan();
});

// Listen for selection changes
figma.on('selectionchange', () => {
  getSelection(deepInspectEnabled);
});
