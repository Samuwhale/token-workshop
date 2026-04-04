import { VARIABLE_COLLECTION_NAME } from './constants.js';
import { mapTokenTypeToVariableType, mapVariableTypeToTokenType, convertToFigmaValue, convertFromFigmaValue, findVariableInList } from './variableUtils.js';
import { getErrorMessage } from '../shared/utils.js';
import type { VariableSyncToken, ReadVariableCollection, ReadVariableMode, ReadVariableToken, ExportedVariableModeValue, ExportedVariableEntry, ExportedVariableCollection } from '../shared/types.js';

export async function applyVariables(tokens: VariableSyncToken[], collectionMap: Record<string, string> = {}, modeMap: Record<string, string> = {}, correlationId?: string) {
  // Rollback tracking — populated before any mutations occur
  interface VariableSnapshot {
    valuesByMode: Record<string, VariableValue>;
    name: string;
    description: string;
    hiddenFromPublishing: boolean;
    scopes: string[];
    pluginData: { tokenPath: string; tokenSet: string };
  }
  const variableSnapshots = new Map<string, VariableSnapshot>();
  const createdVariableIds: string[] = [];
  const createdCollectionIds: string[] = [];

  try {
    // Get or create collection by name, with caching
    const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
    const collectionCache = new Map<string, VariableCollection>(
      existingCollections.map(c => [c.name, c])
    );

    const getOrCreateCollection = (name: string): VariableCollection => {
      let col = collectionCache.get(name);
      if (!col) {
        col = figma.variables.createVariableCollection(name);
        createdCollectionIds.push(col.id);
        collectionCache.set(name, col);
      }
      return col;
    };

    // Find or create a mode by name within a collection
    const getOrCreateMode = (collection: VariableCollection, modeName: string): string => {
      const existing = collection.modes.find(m => m.name === modeName);
      if (existing) return existing.modeId;
      return collection.addMode(modeName);
    };

    // Load all local variables once to avoid redundant async calls per token
    const localVariables = await figma.variables.getLocalVariablesAsync();

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      // Emit incremental progress so the UI can show "Syncing N / M variables…"
      if (i % 5 === 0 || i === tokens.length - 1) {
        figma.ui.postMessage({ type: 'variable-sync-progress', current: i + 1, total: tokens.length, correlationId });
      }
      const variableType = mapTokenTypeToVariableType(token.$type);
      if (!variableType) continue;

      // Resolve which collection this token belongs to
      const colName = (token.setName && collectionMap[token.setName])
        ? collectionMap[token.setName]
        : VARIABLE_COLLECTION_NAME;
      const collection = getOrCreateCollection(colName);

      // Find existing or create new
      const figmaName = token.path.replace(/\./g, '/');
      const existing = findVariableInList(localVariables, collection.id, figmaName);
      let variable: Variable;

      if (existing) {
        // Snapshot all mutable state before modifying so we can roll back on error
        if (!variableSnapshots.has(existing.id)) {
          variableSnapshots.set(existing.id, {
            valuesByMode: structuredClone(existing.valuesByMode),
            name: existing.name,
            description: existing.description,
            hiddenFromPublishing: existing.hiddenFromPublishing,
            scopes: [...existing.scopes],
            pluginData: {
              tokenPath: existing.getPluginData('tokenPath'),
              tokenSet: existing.getPluginData('tokenSet'),
            },
          });
        }
        variable = existing;
      } else {
        variable = figma.variables.createVariable(figmaName, collection, variableType);
        createdVariableIds.push(variable.id);
        // Keep the local cache fresh so subsequent findVariableInList calls see just-created variables
        localVariables.push(variable);
      }

      // Resolve the target mode: use modeMap if provided, otherwise fall back to first mode
      const desiredModeName = token.setName ? modeMap[token.setName] : undefined;
      const modeId = desiredModeName
        ? getOrCreateMode(collection, desiredModeName)
        : collection.modes[0].modeId;
      const figmaValue = convertToFigmaValue(token.$value, token.$type);
      if (figmaValue !== null) {
        variable.setValueForMode(modeId, figmaValue);
      }

      // Apply scopes if specified (read from $extensions or legacy $scopes)
      const scopeOverrides: string[] = (
        (Array.isArray(token.$extensions?.['com.figma.scopes']) ? token.$extensions['com.figma.scopes'] : null) ??
        (Array.isArray(token.$scopes) ? token.$scopes : null) ??
        []
      );
      if (scopeOverrides.length > 0) {
        (variable as Variable & { scopes: string[] }).scopes = scopeOverrides;
      }

      // Store mapping in shared plugin data
      variable.setPluginData('tokenPath', token.path);
      variable.setPluginData('tokenSet', token.setName || '');
    }

    // Serialize snapshot so the UI can offer a "Revert last sync" action.
    // Records map varId → pre-sync state (only existing vars that were modified).
    // createdIds holds IDs of variables created fresh during this sync (to delete on revert).
    const snapshotRecords: Record<string, {
      valuesByMode: Record<string, VariableValue>;
      name: string;
      description: string;
      hiddenFromPublishing: boolean;
      scopes: string[];
      pluginData: { tokenPath: string; tokenSet: string };
    }> = {};
    for (const [varId, snap] of variableSnapshots) {
      snapshotRecords[varId] = snap;
    }

    figma.ui.postMessage({
      type: 'variables-applied',
      count: tokens.length,
      created: createdVariableIds.length,
      overwritten: variableSnapshots.size,
      correlationId,
      varSnapshot: { records: snapshotRecords, createdIds: [...createdVariableIds] },
    });
  } catch (error) {
    // Attempt to roll back all changes made before the failure
    const rollbackFailures: string[] = [];

    // Restore all original state for variables that existed before this operation — run in parallel
    const restoreTasks = Array.from(variableSnapshots.entries()).map(async ([varId, snapshot]) => {
      const v = await figma.variables.getVariableByIdAsync(varId);
      if (!v) return;
      const errs: string[] = [];
      for (const [modeId, value] of Object.entries(snapshot.valuesByMode)) {
        try { v.setValueForMode(modeId, value as VariableValue); } catch (e) { errs.push(`setValueForMode(${modeId}): ${e}`); }
      }
      try { v.name = snapshot.name; } catch (e) { errs.push(`name: ${e}`); }
      try { v.description = snapshot.description; } catch (e) { errs.push(`description: ${e}`); }
      try { v.hiddenFromPublishing = snapshot.hiddenFromPublishing; } catch (e) { errs.push(`hiddenFromPublishing: ${e}`); }
      try { (v as Variable & { scopes: string[] }).scopes = snapshot.scopes; } catch (e) { errs.push(`scopes: ${e}`); }
      try {
        v.setPluginData('tokenPath', snapshot.pluginData.tokenPath);
        v.setPluginData('tokenSet', snapshot.pluginData.tokenSet);
      } catch (e) { errs.push(`pluginData: ${e}`); }
      if (errs.length > 0) throw new Error(`var ${varId}: ${errs.join('; ')}`);
    });
    const restoreResults = await Promise.allSettled(restoreTasks);
    const restoresFailed = restoreResults.filter(r => r.status === 'rejected');
    for (const r of restoreResults) {
      if (r.status === 'rejected') rollbackFailures.push(`restore: ${r.reason}`);
    }

    if (restoresFailed.length > 0) {
      // Skip deletions — restores failed, so deleting created variables/collections now would
      // cause unrecoverable data loss (the originals didn't restore cleanly).
      console.error('[applyVariables] skipping deletion phase because restore(s) failed:', restoresFailed.map(r => (r as PromiseRejectedResult).reason));
    } else {
    // Delete variables created during this operation (reverse order) — run in parallel
    const deleteTasks = [...createdVariableIds].reverse().map(async (varId) => {
      const v = await figma.variables.getVariableByIdAsync(varId);
      if (v) v.remove();
    });
    const deleteResults = await Promise.allSettled(deleteTasks);
    for (const r of deleteResults) {
      if (r.status === 'rejected') rollbackFailures.push(`delete variable: ${r.reason}`);
    }

    // Delete collections created during this operation if they are now empty
    // Fetch once (not per-iteration) to avoid O(n²) re-fetching
    try {
      const [colsAfter, allVarsAfter] = await Promise.all([
        figma.variables.getLocalVariableCollectionsAsync(),
        figma.variables.getLocalVariablesAsync(),
      ]);
      const colsById = new Map(colsAfter.map(c => [c.id, c]));
      for (const colId of [...createdCollectionIds].reverse()) {
        const col = colsById.get(colId);
        if (col) {
          const hasVars = allVarsAfter.some(v => v.variableCollectionId === colId);
          if (!hasVars) { try { col.remove(); } catch (e) { rollbackFailures.push(`delete collection ${colId}: ${e}`); } }
        }
      }
    } catch (e) {
      rollbackFailures.push(`collection cleanup fetch failed: ${e}`);
    }
    } // end else (restores succeeded)

    const rolledBack = rollbackFailures.length === 0;
    const rollbackError = rolledBack
      ? undefined
      : `Partial rollback — ${rollbackFailures.length} step(s) failed: ${rollbackFailures.join('; ')}`;
    if (!rolledBack) console.error('[applyVariables] partial rollback failures:', rollbackFailures);

    figma.ui.postMessage({ type: 'apply-variables-error', error: String(error), correlationId, rolledBack, rollbackError });
  }
}

/** Restore Figma variables to the state captured in a prior applyVariables() call. */
export async function revertVariables(
  data: {
    records: Record<string, {
      valuesByMode: Record<string, VariableValue>;
      name: string;
      description: string;
      hiddenFromPublishing: boolean;
      scopes: string[];
      pluginData: { tokenPath: string; tokenSet: string };
    }>;
    createdIds: string[];
  },
  correlationId?: string,
) {
  const failures: string[] = [];

  // Restore pre-sync state for every variable that was modified
  const restoreTasks = Object.entries(data.records).map(async ([varId, snapshot]) => {
    const v = await figma.variables.getVariableByIdAsync(varId);
    if (!v) { failures.push(`var ${varId} no longer exists`); return; }
    for (const [modeId, value] of Object.entries(snapshot.valuesByMode)) {
      try { v.setValueForMode(modeId, value as VariableValue); } catch (e) { failures.push(`setValueForMode(${varId}, ${modeId}): ${e}`); }
    }
    try { v.name = snapshot.name; } catch (e) { failures.push(`name(${varId}): ${e}`); }
    try { v.description = snapshot.description; } catch (e) { failures.push(`description(${varId}): ${e}`); }
    try { v.hiddenFromPublishing = snapshot.hiddenFromPublishing; } catch (e) { failures.push(`hiddenFromPublishing(${varId}): ${e}`); }
    try { (v as Variable & { scopes: string[] }).scopes = snapshot.scopes; } catch (e) { failures.push(`scopes(${varId}): ${e}`); }
    try {
      v.setPluginData('tokenPath', snapshot.pluginData.tokenPath);
      v.setPluginData('tokenSet', snapshot.pluginData.tokenSet);
    } catch (e) { failures.push(`pluginData(${varId}): ${e}`); }
  });
  await Promise.allSettled(restoreTasks);

  // Delete variables that were created during the sync
  const deleteTasks = [...data.createdIds].reverse().map(async (varId) => {
    const v = await figma.variables.getVariableByIdAsync(varId);
    if (v) {
      try { v.remove(); } catch (e) { failures.push(`delete(${varId}): ${e}`); }
    }
  });
  await Promise.allSettled(deleteTasks);

  figma.ui.postMessage({
    type: 'variables-reverted',
    correlationId,
    failures,
  });
}

export async function readFigmaVariables(correlationId?: string) {
  let localCollections: VariableCollection[];
  let allVariables: Variable[];
  try {
    [localCollections, allVariables] = await Promise.all([
      figma.variables.getLocalVariableCollectionsAsync(),
      figma.variables.getLocalVariablesAsync(),
    ]);
  } catch (err) {
    const message = getErrorMessage(err);
    figma.ui.postMessage({ type: 'variables-read-error', error: message, correlationId });
    return;
  }

  // Build a lookup map so each varId resolves in O(1) instead of a sequential async call
  const variableById = new Map<string, Variable>(allVariables.map(v => [v.id, v]));

  const collections: ReadVariableCollection[] = [];

  for (const collection of localCollections) {
    if (collection.modes.length === 0) continue;

    const modes: ReadVariableMode[] = [];
    for (const mode of collection.modes) {
      const tokens: ReadVariableToken[] = [];
      for (const varId of collection.variableIds) {
        const variable = variableById.get(varId);
        if (!variable) continue;
        const value = variable.valuesByMode[mode.modeId];
        tokens.push({
          path: variable.name.replace(/\//g, '.'),
          $type: mapVariableTypeToTokenType(variable.resolvedType),
          $value: convertFromFigmaValue(value, variable.resolvedType),
          $description: variable.description || '',
          $scopes: variable.scopes,
        });
      }
      modes.push({ modeId: mode.modeId, modeName: mode.name, tokens });
    }
    collections.push({ name: collection.name, modes });
  }

  figma.ui.postMessage({ type: 'variables-read', collections, correlationId });
}

export async function deleteOrphanVariables(knownPaths: string[], collectionMap: Record<string, string> = {}, correlationId?: string) {
  try {
    const knownSet = new Set(knownPaths);
    // All collection names managed by TokenManager: the default plus any custom-mapped names
    const managedNames = new Set([VARIABLE_COLLECTION_NAME, ...Object.values(collectionMap)]);
    const [allCollections, allVariables] = await Promise.all([
      figma.variables.getLocalVariableCollectionsAsync(),
      figma.variables.getLocalVariablesAsync(),
    ]);
    const managedCollections = allCollections.filter(c => managedNames.has(c.name));
    if (managedCollections.length === 0) {
      figma.ui.postMessage({ type: 'orphans-deleted', count: 0, correlationId });
      return;
    }
    // Build a lookup map so each varId resolves in O(1) instead of a sequential async call
    const variableById = new Map<string, Variable>(allVariables.map(v => [v.id, v]));
    let deleted = 0;
    for (const collection of managedCollections) {
      for (const varId of collection.variableIds) {
        const variable = variableById.get(varId);
        if (!variable) continue;
        const path = variable.name.replace(/\//g, '.');
        if (!knownSet.has(path)) {
          variable.remove();
          deleted++;
        }
      }
    }
    figma.ui.postMessage({ type: 'orphans-deleted', count: deleted, correlationId });
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: String(error) });
  }
}

function convertExportValue(
  rawValue: VariableValue,
  resolvedType: VariableResolvedDataType,
  idToName: Map<string, string>,
): ExportedVariableModeValue {
  // Check if it's a variable alias
  if (rawValue && typeof rawValue === 'object' && 'type' in rawValue && rawValue.type === 'VARIABLE_ALIAS') {
    const referencedName = idToName.get(rawValue.id);
    return {
      resolvedValue: null,
      reference: referencedName ? `{${referencedName}}` : `{unknown:${rawValue.id}}`,
      isAlias: true,
    };
  }

  return {
    resolvedValue: convertFromFigmaValue(rawValue, resolvedType),
    isAlias: false,
  };
}

export async function exportAllVariables() {
  try {
    const [collections, allVariables] = await Promise.all([
      figma.variables.getLocalVariableCollectionsAsync(),
      figma.variables.getLocalVariablesAsync(),
    ]);

    // Build lookups: variable id -> variable name (for resolving aliases) and id -> Variable
    const idToName = new Map<string, string>();
    const variableById = new Map<string, Variable>();
    for (const v of allVariables) {
      idToName.set(v.id, v.name.replace(/\//g, '.'));
      variableById.set(v.id, v);
    }

    const exportedCollections: ExportedVariableCollection[] = [];

    for (const collection of collections) {
      const modes = collection.modes.map(m => ({ modeId: m.modeId, name: m.name }));
      const variables: ExportedVariableEntry[] = [];

      for (const varId of collection.variableIds) {
        const variable = variableById.get(varId);
        if (!variable) continue;

        const modeValues: Record<string, ExportedVariableModeValue> = {};

        for (const mode of modes) {
          const rawValue = variable.valuesByMode[mode.modeId];
          modeValues[mode.name] = convertExportValue(rawValue, variable.resolvedType, idToName);
        }

        variables.push({
          name: variable.name,
          path: variable.name.replace(/\//g, '.'),
          resolvedType: variable.resolvedType,
          $type: mapVariableTypeToTokenType(variable.resolvedType),
          description: variable.description || undefined,
          hiddenFromPublishing: variable.hiddenFromPublishing,
          scopes: variable.scopes,
          modeValues,
        });
      }

      exportedCollections.push({
        name: collection.name,
        modes: modes.map(m => m.name),
        variables,
      });
    }

    figma.ui.postMessage({ type: 'all-variables-exported', collections: exportedCollections });
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: `Failed to export variables: ${String(error)}` });
  }
}

/** Scan local Figma variables to find ones bound to a specific token path. */
export async function scanTokenVariableBindings(tokenPath: string) {
  try {
    const allVariables = await figma.variables.getLocalVariablesAsync();
    const figmaName = tokenPath.replace(/\./g, '/');

    const results: Array<{ name: string; collection: string; resolvedType: string }> = [];

    for (const variable of allVariables) {
      const boundPath = variable.getPluginData('tokenPath');
      if (boundPath === tokenPath || variable.name === figmaName) {
        let collectionName = '(unknown)';
        try {
          const col = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
          if (col) collectionName = col.name;
        } catch { /* ignore */ }

        results.push({
          name: variable.name,
          collection: collectionName,
          resolvedType: variable.resolvedType,
        });
      }
    }

    figma.ui.postMessage({
      type: 'token-variable-bindings-result',
      tokenPath,
      variables: results,
    });
  } catch (err) {
    figma.ui.postMessage({
      type: 'token-variable-bindings-result',
      tokenPath,
      variables: [],
      error: `Figma Variables API error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
