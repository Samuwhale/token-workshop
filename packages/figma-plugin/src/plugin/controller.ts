// This runs in Figma's sandbox (no DOM access)

import type { PluginMessage } from '../shared/types.js';
import { applyVariables, readFigmaVariables, deleteOrphanVariables, exportAllVariables, scanTokenVariableBindings } from './variableSync.js';
import { applyStyles, readFigmaStyles } from './styleSync.js';
import { getAvailableFontFamilies, invalidateFontCache } from './fontLoading.js';
import { applyToSelection, getSelection, removeBinding, clearAllBindings, syncBindings, remapBindings, highlightLayersByToken, extractTokensFromSelection, scanTokenUsageMap, searchLayers, findPeersForProperty, applyToNodes, removeBindingFromNode } from './selectionHandling.js';
import { scanComponentCoverage, selectNode, selectNextSibling, scanCanvasHeatmap, selectHeatmapNodes, batchBindHeatmapNodes, scanTokenUsage } from './heatmapScanning.js';
import { scanConsistency } from './consistencyScanner.js';

figma.showUI(__html__, { width: 400, height: 600, themeColors: true });

let deepInspectEnabled = false;

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

// Handle messages from UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  switch (msg.type) {
    case 'apply-variables':
      try {
        await applyVariables(msg.tokens, msg.collectionMap ?? {}, msg.modeMap ?? {}, msg.correlationId);
      } catch (e) {
        reportError('apply-variables', e);
      }
      break;
    case 'apply-styles':
      try {
        await applyStyles(msg.tokens, msg.correlationId);
      } catch (e) {
        figma.ui.postMessage({
          type: 'styles-apply-error',
          error: describeError(e, 'Failed to apply styles'),
          correlationId: msg.correlationId,
        });
      }
      break;
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
        await deleteOrphanVariables(msg.knownPaths, msg.collectionMap ?? {}, msg.correlationId);
      } catch (e) {
        reportError('delete-orphan-variables', e);
      }
      break;
    case 'scan-token-usage':
      try {
        await scanTokenUsageMap();
      } catch (e) {
        reportError('scan-token-usage', e);
      }
      break;
    case 'scan-component-coverage':
      try {
        await scanComponentCoverage(msg.correlationId);
      } catch (e) {
        reportError('scan-component-coverage', e);
      }
      break;
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
    case 'scan-canvas-heatmap':
      try {
        await scanCanvasHeatmap(msg.scope ?? 'page');
      } catch (e) {
        reportError('scan-canvas-heatmap', e);
      }
      break;
    case 'select-heatmap-nodes':
      try {
        await selectHeatmapNodes(msg.nodeIds);
      } catch (e) {
        reportError('select-heatmap-nodes', e);
      }
      break;
    case 'batch-bind-heatmap-nodes':
      try {
        await batchBindHeatmapNodes(msg.nodeIds, msg.tokenPath, msg.tokenType, msg.targetProperty, msg.resolvedValue);
      } catch (e) {
        reportError('batch-bind-heatmap-nodes', e);
      }
      break;
    case 'scan-single-token-usage':
      try {
        await scanTokenUsage(msg.tokenPath);
      } catch (e) {
        reportError('scan-single-token-usage', e);
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
    case 'scan-consistency':
      try {
        await scanConsistency(msg.tokenMap, msg.scope);
      } catch (e) {
        reportError('scan-consistency', e);
      }
      break;
    case 'search-layers':
      searchLayers(msg.query);
      break;
    case 'find-peers-for-property':
      findPeersForProperty(msg.nodeId, msg.property);
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
        const families = await getAvailableFontFamilies();
        figma.ui.postMessage({ type: 'fonts-loaded', families });
      } catch (e) {
        reportError('get-available-fonts', e);
      }
      break;
    }
    case 'eyedropper':
      sampleSelectionColor();
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

// Listen for selection changes
figma.on('selectionchange', () => {
  getSelection(deepInspectEnabled);
});
