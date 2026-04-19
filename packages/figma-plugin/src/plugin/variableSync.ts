import { VARIABLE_COLLECTION_NAME } from './constants.js';
import { mapTokenTypeToVariableType, mapVariableTypeToTokenType, convertToFigmaValue, convertFromFigmaValue, findVariableInList } from './variableUtils.js';
import { getErrorMessage } from '../shared/utils.js';
import type {
  OrphanVariableDeleteTarget,
  VariableSyncToken,
  ReadVariableCollection,
  ReadVariableMode,
  ReadVariableToken,
  VarSnapshot,
} from '../shared/types.js';

function isTokenManagerManagedVariable(variable: Variable): boolean {
  return variable.getPluginData('tokenPath').trim().length > 0;
}

export async function applyVariables(tokens: VariableSyncToken[], collectionMap: Record<string, string> = {}, modeMap: Record<string, string> = {}, renames?: Array<{ oldPath: string; newPath: string }>, correlationId?: string) {
  // Rollback tracking — populated before any mutations occur
  interface VariableSnapshot {
    valuesByMode: Record<string, VariableValue>;
    name: string;
    description: string;
    hiddenFromPublishing: boolean;
    scopes: string[];
    pluginData: { tokenPath: string; tokenCollection: string };
  }
  const variableSnapshots = new Map<string, VariableSnapshot>();
  const createdVariableIds: string[] = [];
  const createdCollectionIds: string[] = [];
  // Tokens whose Figma variable type is unsupported, or whose value could not be converted
  const skipped: Array<{ path: string; $type: string }> = [];
  const failures: Array<{ path: string; error: string }> = [];
  let successCount = 0;

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

    // Pre-process renames: find variables with old names and rename them to their new names
    // before the main token loop. This preserves variable IDs (and all Figma node bindings
    // that reference them) when tokens are renamed on the server between syncs.
    if (renames && renames.length > 0) {
      for (const { oldPath, newPath } of renames) {
        const oldFigmaName = oldPath.replace(/\./g, '/');
        const newFigmaName = newPath.replace(/\./g, '/');
        if (oldFigmaName === newFigmaName) continue;

        // Only rename TokenManager-managed variables (identified by tokenPath plugin data)
        const oldVar = localVariables.find(
          v => v.name === oldFigmaName && v.getPluginData('tokenPath') === oldPath
        );
        if (!oldVar) continue;

        // Skip if the target name already exists in the same collection (would create a duplicate)
        const targetExists = localVariables.some(
          v => v.variableCollectionId === oldVar.variableCollectionId && v.name === newFigmaName
        );
        if (targetExists) continue;

        // Snapshot before modifying so rollback can restore the original name
        if (!variableSnapshots.has(oldVar.id)) {
          variableSnapshots.set(oldVar.id, {
            valuesByMode: structuredClone(oldVar.valuesByMode),
            name: oldVar.name,
            description: oldVar.description,
            hiddenFromPublishing: oldVar.hiddenFromPublishing,
            scopes: [...oldVar.scopes],
            pluginData: {
              tokenPath: oldVar.getPluginData('tokenPath'),
              tokenCollection: oldVar.getPluginData('tokenCollection'),
            },
          });
        }

        try {
          oldVar.name = newFigmaName;
          oldVar.setPluginData('tokenPath', newPath);
        } catch (renameErr) {
          console.warn(`[applyVariables] Failed to rename variable ${oldFigmaName} → ${newFigmaName}:`, renameErr);
        }
      }
    }

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      // Emit incremental progress so the UI can show "Syncing N / M variables…"
      if (i % 5 === 0 || i === tokens.length - 1) {
        figma.ui.postMessage({ type: 'variable-sync-progress', current: i + 1, total: tokens.length, correlationId });
      }
      const variableType = mapTokenTypeToVariableType(token.$type);
      if (!variableType) {
        // Type has no Figma variable equivalent (e.g. shadow, gradient, typography)
        skipped.push({ path: token.path, $type: token.$type });
        continue;
      }

      // Resolve which collection this token belongs to
      const explicitCollectionName = token.figmaCollection?.trim();
      const colName = explicitCollectionName
        ? explicitCollectionName
        : (token.collectionId && collectionMap[token.collectionId])
          ? collectionMap[token.collectionId]
          : VARIABLE_COLLECTION_NAME;
      const collection = getOrCreateCollection(colName);

      // Pre-compute the Figma value before deciding whether to create a new variable.
      // If the value cannot be converted, we should not create a valueless variable.
      const figmaValue = convertToFigmaValue(token.$value, token.$type);

      // Find existing or create new
      const figmaName = token.path.replace(/\./g, '/');
      const existing = findVariableInList(localVariables, collection.id, figmaName);
      let variable: Variable;
      let tokenSkipped = false;

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
              tokenCollection: existing.getPluginData('tokenCollection'),
            },
          });
        }
        variable = existing;
        if (figmaValue === null) {
          // Value not convertible — skip setting it but still update scopes and pluginData
          skipped.push({ path: token.path, $type: token.$type });
          tokenSkipped = true;
        }
      } else {
        if (figmaValue === null) {
          // Cannot create a meaningful new variable without a value — skip entirely
          skipped.push({ path: token.path, $type: token.$type });
          continue;
        }
        variable = figma.variables.createVariable(figmaName, collection, variableType);
        createdVariableIds.push(variable.id);
        // Keep the local cache fresh so subsequent findVariableInList calls see just-created variables
        localVariables.push(variable);
      }

      try {
        // Resolve the target mode: use modeMap if provided, otherwise fall back to first mode
        const explicitModeName = token.figmaMode?.trim();
        const desiredModeName = explicitModeName || (token.collectionId ? modeMap[token.collectionId] : undefined);
        const modeId = desiredModeName
          ? getOrCreateMode(collection, desiredModeName)
          : collection.modes[0].modeId;
        if (figmaValue !== null) {
          variable.setValueForMode(modeId, figmaValue);
        }

        // Apply scopes if specified (read from $extensions or legacy $scopes)
        const scopeOverrides: string[] = (
          (Array.isArray(token.$extensions?.['com.figma.scopes']) ? token.$extensions['com.figma.scopes'] : null) ??
          (Array.isArray(token.$scopes) ? token.$scopes : null) ??
          []
        );
        variable.scopes = scopeOverrides as VariableScope[];

        // Store mapping in shared plugin data
        variable.setPluginData('tokenPath', token.path);
        variable.setPluginData('tokenCollection', token.collectionId || '');
        if (!tokenSkipped) {
          successCount++;
        }
      } catch (tokenError) {
        console.error(`Failed to apply variable for ${token.path}:`, tokenError);
        failures.push({ path: token.path, error: getErrorMessage(tokenError) });
      }
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
      pluginData: { tokenPath: string; tokenCollection: string };
    }> = {};
    for (const [varId, snap] of variableSnapshots) {
      snapshotRecords[varId] = snap;
    }

    figma.ui.postMessage({
      type: 'variables-applied',
      count: successCount,
      total: tokens.length,
      created: createdVariableIds.length,
      overwritten: variableSnapshots.size,
      skipped,
      failures,
      correlationId,
      varSnapshot: { records: snapshotRecords, createdIds: [...createdVariableIds] },
    });
  } catch (error) {
    // Attempt to roll back all changes made before the failure
    const rollbackFailures: string[] = [];

    // Restore all original state for variables that existed before this operation — run in parallel.
    // Build from a stable array so result indices correlate with varIds.
    const varSnapshotEntries = Array.from(variableSnapshots.entries());
    const restoreTasks = varSnapshotEntries.map(async ([varId, snapshot]) => {
      const v = await figma.variables.getVariableByIdAsync(varId);
      if (!v) return;
      const errs: string[] = [];
      for (const [modeId, value] of Object.entries(snapshot.valuesByMode)) {
        try { v.setValueForMode(modeId, value as VariableValue); } catch (e) { errs.push(`setValueForMode(${modeId}): ${getErrorMessage(e)}`); }
      }
      try { v.name = snapshot.name; } catch (e) { errs.push(`name: ${getErrorMessage(e)}`); }
      try { v.description = snapshot.description; } catch (e) { errs.push(`description: ${getErrorMessage(e)}`); }
      try { v.hiddenFromPublishing = snapshot.hiddenFromPublishing; } catch (e) { errs.push(`hiddenFromPublishing: ${getErrorMessage(e)}`); }
      try { v.scopes = snapshot.scopes as VariableScope[]; } catch (e) { errs.push(`scopes: ${getErrorMessage(e)}`); }
      try {
        v.setPluginData('tokenPath', snapshot.pluginData.tokenPath);
        v.setPluginData('tokenCollection', snapshot.pluginData.tokenCollection);
      } catch (e) { errs.push(`pluginData: ${getErrorMessage(e)}`); }
      if (errs.length > 0) throw new Error(`var ${varId}: ${errs.join('; ')}`);
    });
    // Correlate results with varIds to know exactly which variables failed to restore
    const restoreResults = await Promise.allSettled(restoreTasks);
    const failedRestoreVarIds = new Set<string>();
    for (let i = 0; i < restoreResults.length; i++) {
      const r = restoreResults[i];
      if (r.status === 'rejected') {
        failedRestoreVarIds.add(varSnapshotEntries[i][0]);
        rollbackFailures.push(`restore: ${getErrorMessage(r.reason)}`);
      }
    }
    if (failedRestoreVarIds.size > 0) {
      console.error('[applyVariables] some variable restores failed:', [...failedRestoreVarIds]);
    }

    // Delete variables created during this operation (reverse order) — run in parallel.
    // Skip only variables whose own restore failed; created variables and snapshot variables
    // are disjoint sets so this guard is defensive, but keeps the intent explicit.
    const deleteTasks = [...createdVariableIds].reverse().map(async (varId) => {
      if (failedRestoreVarIds.has(varId)) return;
      const v = await figma.variables.getVariableByIdAsync(varId);
      if (v) v.remove();
    });
    const deleteResults = await Promise.allSettled(deleteTasks);
    for (const r of deleteResults) {
      if (r.status === 'rejected') rollbackFailures.push(`delete variable: ${getErrorMessage(r.reason)}`);
    }

    // Delete collections created during this operation if they are now empty
    // Fetch once (not per-iteration) to avoid O(n²) re-fetching
    try {
      const [colsAfter, allVarsAfter] = await Promise.all([
        figma.variables.getLocalVariableCollectionsAsync(),
        figma.variables.getLocalVariablesAsync(),
      ]);
      const colsById = new Map<string, VariableCollection>(colsAfter.map(c => [c.id, c] as [string, VariableCollection]));
      for (const colId of [...createdCollectionIds].reverse()) {
        const col = colsById.get(colId);
        if (col) {
          const hasVars = allVarsAfter.some(v => v.variableCollectionId === colId);
          if (!hasVars) { try { col.remove(); } catch (e) { rollbackFailures.push(`delete collection ${colId}: ${getErrorMessage(e)}`); } }
        }
      }
    } catch (e) {
      rollbackFailures.push(`collection cleanup fetch failed: ${getErrorMessage(e)}`);
    }

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
  data: VarSnapshot,
  correlationId?: string,
) {
  const failures: string[] = [];
  // Track which specific varIds had restore failures to avoid skipping unrelated deletions
  const failedRestoreVarIds = new Set<string>();

  // Restore pre-sync state for every variable that was modified — run in parallel
  const restoreTasks = Object.entries(data.records).map(async ([varId, snapshot]) => {
    const v = await figma.variables.getVariableByIdAsync(varId);
    if (!v) { failures.push(`var ${varId} no longer exists`); failedRestoreVarIds.add(varId); return; }
    let varFailed = false;
    for (const [modeId, value] of Object.entries(snapshot.valuesByMode)) {
      try { v.setValueForMode(modeId, value as VariableValue); } catch (e) { failures.push(`setValueForMode(${varId}, ${modeId}): ${getErrorMessage(e)}`); varFailed = true; }
    }
    try { v.name = snapshot.name; } catch (e) { failures.push(`name(${varId}): ${getErrorMessage(e)}`); varFailed = true; }
    try { v.description = snapshot.description; } catch (e) { failures.push(`description(${varId}): ${getErrorMessage(e)}`); varFailed = true; }
    try { v.hiddenFromPublishing = snapshot.hiddenFromPublishing; } catch (e) { failures.push(`hiddenFromPublishing(${varId}): ${getErrorMessage(e)}`); varFailed = true; }
    try { v.scopes = snapshot.scopes as VariableScope[]; } catch (e) { failures.push(`scopes(${varId}): ${getErrorMessage(e)}`); varFailed = true; }
    try {
      v.setPluginData('tokenPath', snapshot.pluginData.tokenPath);
      v.setPluginData('tokenCollection', snapshot.pluginData.tokenCollection);
    } catch (e) { failures.push(`pluginData(${varId}): ${getErrorMessage(e)}`); varFailed = true; }
    if (varFailed) failedRestoreVarIds.add(varId);
  });
  await Promise.allSettled(restoreTasks);

  if (failedRestoreVarIds.size > 0) {
    console.error('[revertVariables] some variable restores failed:', [...failedRestoreVarIds]);
  }

  // Delete variables that were created during the sync — run in parallel.
  // Skip only variables whose own restore failed; data.records and data.createdIds are disjoint
  // sets so failedRestoreVarIds will not intersect createdIds in practice — the guard is defensive.
  const deleteTasks = [...data.createdIds].reverse().map(async (varId) => {
    if (failedRestoreVarIds.has(varId)) return;
    const v = await figma.variables.getVariableByIdAsync(varId);
    if (v) {
      try { v.remove(); } catch (e) { failures.push(`delete(${varId}): ${getErrorMessage(e)}`); }
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
  const variableNameById = new Map<string, string>(allVariables.map(v => [v.id, v.name.replace(/\//g, '.')]));

  const collections: ReadVariableCollection[] = [];

  for (const collection of localCollections) {
    if (collection.modes.length === 0) continue;

    const modes: ReadVariableMode[] = [];
    for (const mode of collection.modes) {
      const tokens: ReadVariableToken[] = [];
      for (const varId of collection.variableIds) {
        const variable = variableById.get(varId);
        if (!variable) continue;
        const modeValue = toReadModeValue(variable.valuesByMode[mode.modeId], variable.resolvedType, variableNameById);
        tokens.push({
          path: variable.name.replace(/\//g, '.'),
          $type: mapVariableTypeToTokenType(variable.resolvedType),
          $value: modeValue.value,
          $description: variable.description || '',
          $scopes: variable.scopes,
          reference: modeValue.reference,
          isAlias: modeValue.isAlias,
          hiddenFromPublishing: variable.hiddenFromPublishing,
        });
      }
      modes.push({ modeId: mode.modeId, modeName: mode.name, tokens });
    }
    collections.push({ name: collection.name, modes });
  }

  figma.ui.postMessage({ type: 'variables-read', collections, correlationId });
}

function toReadModeValue(
  rawValue: VariableValue,
  resolvedType: VariableResolvedDataType,
  variableNameById: Map<string, string>,
): { value: string | number | boolean | null; reference?: string; isAlias: boolean } {
  if (rawValue && typeof rawValue === 'object' && 'type' in rawValue && rawValue.type === 'VARIABLE_ALIAS') {
    const reference = variableNameById.get(rawValue.id)
      ? `{${variableNameById.get(rawValue.id)}}`
      : `{unknown:${rawValue.id}}`;
    return {
      value: reference,
      reference,
      isAlias: true,
    };
  }

  return {
    value: convertFromFigmaValue(rawValue, resolvedType),
    isAlias: false,
  };
}

function getVariablePath(variable: Variable): string {
  return variable.name.replace(/\//g, '.');
}

async function deleteResolverOrphanVariables(
  targets: OrphanVariableDeleteTarget[],
  correlationId?: string,
) {
  const uniqueTargets = new Map<string, OrphanVariableDeleteTarget>();
  for (const target of targets) {
    if (!target.path || !target.collectionName) continue;
    uniqueTargets.set(`${target.collectionName}\u0000${target.path}`, target);
  }

  if (uniqueTargets.size === 0) {
    figma.ui.postMessage({ type: 'orphans-deleted', count: 0, correlationId });
    return;
  }

  const [allCollections, allVariables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);
  const collectionsByName = new Map<string, VariableCollection[]>();
  for (const collection of allCollections) {
    const existing = collectionsByName.get(collection.name);
    if (existing) existing.push(collection);
    else collectionsByName.set(collection.name, [collection]);
  }
  const variableById = new Map<string, Variable>(allVariables.map((variable) => [variable.id, variable]));
  const toDelete = new Map<string, Variable>();

  for (const target of uniqueTargets.values()) {
    const collections = collectionsByName.get(target.collectionName);
    if (!collections) continue;

    for (const collection of collections) {
      for (const varId of collection.variableIds) {
        const variable = variableById.get(varId);
        if (!variable) continue;
        if (!isTokenManagerManagedVariable(variable)) continue;
        if (getVariablePath(variable) !== target.path) continue;
        toDelete.set(variable.id, variable);
      }
    }
  }

  const failures: string[] = [];
  let deleted = 0;
  for (const variable of toDelete.values()) {
    try {
      variable.remove();
      deleted++;
    } catch (e) {
      failures.push(`${variable.name}: ${getErrorMessage(e)}`);
    }
  }

  figma.ui.postMessage({ type: 'orphans-deleted', count: deleted, failures, correlationId });
}

export async function deleteOrphanVariables(
  knownPaths: string[],
  collectionMap: Record<string, string> = {},
  targets: OrphanVariableDeleteTarget[] = [],
  correlationId?: string,
) {
  try {
    if (targets.length > 0) {
      await deleteResolverOrphanVariables(targets, correlationId);
      return;
    }

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

    // Collect all orphan variables before any mutations — avoids partial state if an
    // error occurs mid-iteration, and enables accurate failure reporting.
    const toDelete: Variable[] = [];
    for (const collection of managedCollections) {
      for (const varId of collection.variableIds) {
        const variable = variableById.get(varId);
        if (!variable) continue;
        if (!isTokenManagerManagedVariable(variable)) continue;
        const path = getVariablePath(variable);
        if (!knownSet.has(path)) {
          toDelete.push(variable);
        }
      }
    }

    // Delete each orphan individually so one failure does not abort the rest
    const failures: string[] = [];
    let deleted = 0;
    for (const variable of toDelete) {
      try {
        variable.remove();
        deleted++;
      } catch (e) {
        failures.push(`${variable.name}: ${getErrorMessage(e)}`);
      }
    }

    figma.ui.postMessage({ type: 'orphans-deleted', count: deleted, failures, correlationId });
  } catch (error) {
    // Use orphans-deleted (not the generic 'error' type) so the correlationId-based
    // promise in the UI resolves rather than timing out on an unexpected throw.
    figma.ui.postMessage({ type: 'orphans-deleted', count: 0, failures: [getErrorMessage(error)], correlationId });
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
