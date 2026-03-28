// This runs in Figma's sandbox (no DOM access)

import type { PluginMessage } from '../shared/types.js';
import { applyVariables, readFigmaVariables, deleteOrphanVariables, exportAllVariables } from './variableSync.js';
import { applyStyles, readFigmaStyles } from './styleSync.js';
import { getAvailableFontFamilies } from './fontLoading.js';
import { applyToSelection, getSelection, removeBinding, clearAllBindings, syncBindings, remapBindings, highlightLayersByToken, extractTokensFromSelection, scanTokenUsageMap } from './selectionHandling.js';
import { scanComponentCoverage, selectNode, selectNextSibling, scanCanvasHeatmap, selectHeatmapNodes, batchBindHeatmapNodes, scanTokenUsage } from './heatmapScanning.js';
import { scanConsistency } from './consistencyScanner.js';

figma.showUI(__html__, { width: 400, height: 600, themeColors: true });

let deepInspectEnabled = false;

// Handle messages from UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  switch (msg.type) {
    case 'apply-variables':
      await applyVariables(msg.tokens, msg.collectionMap ?? {}, msg.modeMap ?? {}, msg.correlationId);
      break;
    case 'apply-styles':
      try {
        await applyStyles(msg.tokens);
      } catch (e) {
        figma.ui.postMessage({
          type: 'styles-apply-error',
          error: e instanceof Error ? e.message : 'Failed to apply styles',
        });
      }
      break;
    case 'read-variables':
      try {
        await readFigmaVariables(msg.correlationId);
      } catch (e) {
        figma.ui.postMessage({
          type: 'variables-read-error',
          error: e instanceof Error ? e.message : 'Failed to read Figma variables',
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
          error: e instanceof Error ? e.message : 'Failed to read Figma styles',
          correlationId: msg.correlationId,
        });
      }
      break;
    case 'export-all-variables':
      await exportAllVariables();
      break;
    case 'apply-to-selection':
      await applyToSelection(msg.tokenPath, msg.tokenType, msg.targetProperty, msg.resolvedValue);
      break;
    case 'get-selection':
      await getSelection(deepInspectEnabled);
      break;
    case 'set-deep-inspect':
      deepInspectEnabled = msg.enabled;
      await getSelection(deepInspectEnabled);
      break;
    case 'remove-binding':
      await removeBinding(msg.property);
      break;
    case 'clear-all-bindings':
      await clearAllBindings();
      break;
    case 'sync-bindings':
      await syncBindings(msg.tokenMap, msg.scope);
      break;
    case 'remap-bindings':
      await remapBindings(msg.remapMap, msg.scope, deepInspectEnabled);
      break;
    case 'highlight-layer-by-token':
      await highlightLayersByToken(msg.tokenPath);
      break;
    case 'notify':
      figma.notify(msg.message);
      break;
    case 'resize':
      figma.ui.resize(msg.width, msg.height);
      break;
    case 'delete-orphan-variables':
      await deleteOrphanVariables(msg.knownPaths, msg.collectionMap ?? {});
      break;
    case 'scan-token-usage':
      await scanTokenUsageMap();
      break;
    case 'scan-component-coverage':
      await scanComponentCoverage();
      break;
    case 'select-node':
      await selectNode(msg.nodeId);
      break;
    case 'select-next-sibling':
      selectNextSibling();
      break;
    case 'scan-canvas-heatmap':
      await scanCanvasHeatmap();
      break;
    case 'select-heatmap-nodes':
      await selectHeatmapNodes(msg.nodeIds);
      break;
    case 'batch-bind-heatmap-nodes':
      await batchBindHeatmapNodes(msg.nodeIds, msg.tokenPath, msg.tokenType, msg.targetProperty, msg.resolvedValue);
      break;
    case 'scan-single-token-usage':
      await scanTokenUsage(msg.tokenPath);
      break;
    case 'extract-tokens-from-selection':
      await extractTokensFromSelection();
      break;
    case 'scan-consistency':
      await scanConsistency(msg.tokenMap, msg.scope);
      break;
    case 'search-layers':
      searchLayers(msg.query);
      break;
    case 'get-available-fonts': {
      const families = await getAvailableFontFamilies();
      figma.ui.postMessage({ type: 'fonts-loaded', families });
      break;
    }
    case 'eyedropper':
      sampleSelectionColor();
      break;
    case 'get-active-themes': {
      const key = `active-themes:${figma.fileKey ?? 'default'}`;
      const themes = await figma.clientStorage.getAsync(key);
      figma.ui.postMessage({ type: 'active-themes-loaded', themes: themes ?? {} });
      break;
    }
    case 'set-active-themes': {
      const key = `active-themes:${figma.fileKey ?? 'default'}`;
      if (msg.themes && Object.keys(msg.themes).length > 0) {
        await figma.clientStorage.setAsync(key, msg.themes);
      } else {
        await figma.clientStorage.deleteAsync(key);
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
