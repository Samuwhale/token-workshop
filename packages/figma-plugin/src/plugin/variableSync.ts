import { VARIABLE_COLLECTION_NAME } from './constants.js';
import { mapTokenTypeToVariableType, inferVariableTokenType, convertToFigmaValue, convertFromFigmaValueForTokenType, findVariableInList } from './variableUtils.js';
import { getErrorMessage } from '../shared/utils.js';
import { isReference, parseReference } from '@token-workshop/core';
import type {
  OrphanVariableDeleteTarget,
  VariableSyncToken,
  ReadVariableCollection,
  ReadVariableMode,
  ReadVariableToken,
  VarSnapshot,
} from '../shared/types.js';

function isTokenWorkshopManagedVariable(variable: Variable): boolean {
  return variable.getPluginData('tokenPath').trim().length > 0;
}

function isGeneratedStyleBackingVariable(variable: Variable): boolean {
  return variable.getPluginData('tm.styleBacking') === '1';
}

function toFigmaVariableName(path: string): string {
  return path.replace(/\./g, '/');
}

function tokenHasDerivation(token: VariableSyncToken): boolean {
  const tokenWorkshopExtension = token.$extensions?.tokenworkshop;
  return Boolean(
    tokenWorkshopExtension &&
    typeof tokenWorkshopExtension === 'object' &&
    !Array.isArray(tokenWorkshopExtension) &&
    'derivation' in tokenWorkshopExtension,
  );
}

function getReferencePath(token: VariableSyncToken): string | null {
  const value = token.$value;
  if (tokenHasDerivation(token)) {
    return null;
  }
  return typeof value === 'string' && isReference(value) ? parseReference(value) : null;
}

function addIndexedVariable(index: Map<string, Variable[]>, path: string, variable: Variable): void {
  const variables = index.get(path);
  if (variables) {
    if (!variables.some((candidate) => candidate.id === variable.id)) {
      variables.push(variable);
    }
    return;
  }
  index.set(path, [variable]);
}

function getTokenCollectionName(
  token: VariableSyncToken,
  collectionMap: Record<string, string>,
): string {
  const explicitCollectionName = token.figmaCollection?.trim();
  if (explicitCollectionName) {
    return explicitCollectionName;
  }
  if (token.collectionId && collectionMap[token.collectionId]) {
    return collectionMap[token.collectionId];
  }
  return VARIABLE_COLLECTION_NAME;
}

function getTokenModeName(
  token: VariableSyncToken,
  modeMap: Record<string, string>,
): string | undefined {
  const explicitModeName = token.figmaMode?.trim();
  if (explicitModeName) {
    return explicitModeName;
  }
  return token.collectionId ? modeMap[token.collectionId] : undefined;
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
  interface VariableApplyPlan {
    token: VariableSyncToken;
    variable: Variable;
    variableType: VariableResolvedDataType;
    collection: VariableCollection;
    aliasTargetPath: string | null;
    literalValue: VariableValue | null;
    valueSkipped: boolean;
    created: boolean;
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

    const snapshotVariable = (variable: Variable): void => {
      if (createdVariableIds.includes(variable.id) || variableSnapshots.has(variable.id)) {
        return;
      }
      variableSnapshots.set(variable.id, {
        valuesByMode: structuredClone(variable.valuesByMode),
        name: variable.name,
        description: variable.description,
        hiddenFromPublishing: variable.hiddenFromPublishing,
        scopes: [...variable.scopes],
        pluginData: {
          tokenPath: variable.getPluginData('tokenPath'),
          tokenCollection: variable.getPluginData('tokenCollection'),
        },
      });
    };

    // Pre-process renames: find variables with old names and rename them to their new names
    // before the main token loop. This preserves variable IDs (and all Figma node bindings
    // that reference them) when tokens are renamed on the server between syncs.
    if (renames && renames.length > 0) {
      for (const { oldPath, newPath } of renames) {
        const oldFigmaName = oldPath.replace(/\./g, '/');
        const newFigmaName = newPath.replace(/\./g, '/');
        if (oldFigmaName === newFigmaName) continue;

        // Only rename Token Workshop-managed variables (identified by tokenPath plugin data)
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
        snapshotVariable(oldVar);

        try {
          oldVar.name = newFigmaName;
          oldVar.setPluginData('tokenPath', newPath);
        } catch (renameErr) {
          console.warn(`[applyVariables] Failed to rename variable ${oldFigmaName} → ${newFigmaName}:`, renameErr);
        }
      }
    }

    const variablesByTokenPath = new Map<string, Variable[]>();
    const variablesByFigmaName = new Map<string, Variable[]>();

    const indexVariable = (variable: Variable, tokenPath?: string): void => {
      const figmaNameVariables = variablesByFigmaName.get(variable.name);
      if (figmaNameVariables) {
        if (!figmaNameVariables.some((candidate) => candidate.id === variable.id)) {
          figmaNameVariables.push(variable);
        }
      } else {
        variablesByFigmaName.set(variable.name, [variable]);
      }

      const managedPath = tokenPath ?? variable.getPluginData('tokenPath').trim();
      if (managedPath) {
        addIndexedVariable(variablesByTokenPath, managedPath, variable);
      }
    };

    for (const variable of localVariables) {
      indexVariable(variable);
    }

    const findAliasTargetVariable = (
      path: string,
      source: VariableApplyPlan,
    ): Variable | null => {
      const candidatesById = new Map<string, Variable>();
      for (const candidate of variablesByTokenPath.get(path) ?? []) {
        candidatesById.set(candidate.id, candidate);
      }
      for (const candidate of variablesByFigmaName.get(toFigmaVariableName(path)) ?? []) {
        candidatesById.set(candidate.id, candidate);
      }

      const candidates = [...candidatesById.values()].filter(
        (candidate) =>
          candidate.id !== source.variable.id &&
          candidate.resolvedType === source.variableType,
      );
      if (candidates.length === 0) {
        return null;
      }

      return (
        candidates.find(
          (candidate) =>
            source.token.aliasTargetCollectionId &&
            candidate.getPluginData('tokenCollection') === source.token.aliasTargetCollectionId,
        ) ??
        candidates.find(
          (candidate) =>
            source.token.collectionId &&
            candidate.getPluginData('tokenCollection') === source.token.collectionId,
        ) ?? candidates[0]
      );
    };

    const plans: VariableApplyPlan[] = [];

    for (const token of tokens) {
      const variableType = mapTokenTypeToVariableType(token.$type);
      if (!variableType) {
        // Type has no Figma variable equivalent (e.g. shadow, gradient, typography)
        skipped.push({ path: token.path, $type: token.$type });
        continue;
      }

      // Resolve which collection this token belongs to
      const colName = getTokenCollectionName(token, collectionMap);
      const collection = getOrCreateCollection(colName);

      const aliasTargetPath = getReferencePath(token);
      const figmaValue = aliasTargetPath
        ? null
        : convertToFigmaValue(token.$value, token.$type);

      // Find existing or create new
      const figmaName = toFigmaVariableName(token.path);
      const existing = findVariableInList(localVariables, collection.id, figmaName);
      let variable: Variable;
      let valueSkipped = false;
      let created = false;

      if (existing) {
        // Snapshot all mutable state before modifying so we can roll back on error
        snapshotVariable(existing);
        variable = existing;
        if (!aliasTargetPath && figmaValue === null) {
          // Value not convertible — skip setting it but still update scopes and pluginData
          skipped.push({ path: token.path, $type: token.$type });
          valueSkipped = true;
        }
      } else {
        if (!aliasTargetPath && figmaValue === null) {
          // Cannot create a meaningful new variable without a value — skip entirely
          skipped.push({ path: token.path, $type: token.$type });
          continue;
        }
        variable = figma.variables.createVariable(figmaName, collection, variableType);
        createdVariableIds.push(variable.id);
        created = true;
        // Keep the local cache fresh so subsequent findVariableInList calls see just-created variables
        localVariables.push(variable);
      }

      variable.setPluginData('tokenPath', token.path);
      variable.setPluginData('tokenCollection', token.collectionId || '');
      indexVariable(variable, token.path);
      plans.push({
        token,
        variable,
        variableType,
        collection,
        aliasTargetPath,
        literalValue: figmaValue,
        valueSkipped,
        created,
      });
    }

    const aliasTargetsByVariableId = new Map<string, Variable>();
    const invalidAliasReasonByVariableId = new Map<string, string>();
    for (const plan of plans) {
      if (!plan.aliasTargetPath) {
        continue;
      }
      const targetVariable = findAliasTargetVariable(plan.aliasTargetPath, plan);
      if (!targetVariable) {
        invalidAliasReasonByVariableId.set(
          plan.variable.id,
          `Alias target not found in Figma variables: {${plan.aliasTargetPath}}`,
        );
        continue;
      }
      aliasTargetsByVariableId.set(plan.variable.id, targetVariable);
    }

    let invalidAliasChanged = true;
    while (invalidAliasChanged) {
      invalidAliasChanged = false;
      for (const plan of plans) {
        if (!plan.aliasTargetPath || invalidAliasReasonByVariableId.has(plan.variable.id)) {
          continue;
        }
        const targetVariable = aliasTargetsByVariableId.get(plan.variable.id);
        if (targetVariable && invalidAliasReasonByVariableId.has(targetVariable.id)) {
          invalidAliasReasonByVariableId.set(
            plan.variable.id,
            `Alias target could not be published: {${plan.aliasTargetPath}}`,
          );
          invalidAliasChanged = true;
        }
      }
    }

    for (const plan of plans) {
      const invalidReason = invalidAliasReasonByVariableId.get(plan.variable.id);
      if (!invalidReason) {
        continue;
      }
      failures.push({ path: plan.token.path, error: invalidReason });
      if (plan.created) {
        try {
          plan.variable.remove();
          const createdIndex = createdVariableIds.indexOf(plan.variable.id);
          if (createdIndex >= 0) {
            createdVariableIds.splice(createdIndex, 1);
          }
        } catch (cleanupError) {
          failures.push({
            path: plan.token.path,
            error: `Failed to remove variable after alias error: ${getErrorMessage(cleanupError)}`,
          });
        }
      }
    }

    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const { token, variable, collection, aliasTargetPath, literalValue, valueSkipped } = plan;
      // Emit incremental progress so the UI can show "Syncing N / M variables…"
      if (i % 5 === 0 || i === plans.length - 1) {
        figma.ui.postMessage({ type: 'variable-sync-progress', current: i + 1, total: plans.length, correlationId });
      }

      try {
        // Resolve the target mode: use modeMap if provided, otherwise fall back to first mode
        const desiredModeName = getTokenModeName(token, modeMap);
        const modeId = desiredModeName
          ? getOrCreateMode(collection, desiredModeName)
          : collection.modes[0].modeId;

        let valueToSet: VariableValue | null = literalValue;
        if (aliasTargetPath) {
          if (invalidAliasReasonByVariableId.has(variable.id)) {
            continue;
          }
          const targetVariable = aliasTargetsByVariableId.get(variable.id);
          if (!targetVariable) continue;
          valueToSet = figma.variables.createVariableAlias(targetVariable);
        }

        if (valueToSet !== null) {
          variable.setValueForMode(modeId, valueToSet);
        }

        const scopeOverrides = Array.isArray(token.$extensions?.['com.figma.scopes'])
          ? token.$extensions['com.figma.scopes']
          : [];
        variable.scopes = scopeOverrides as VariableScope[];

        // Store mapping in shared plugin data
        variable.setPluginData('tokenPath', token.path);
        variable.setPluginData('tokenCollection', token.collectionId || '');
        if (!valueSkipped) {
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
        if (isGeneratedStyleBackingVariable(variable)) continue;
        const tokenType = inferVariableTokenType(variable.resolvedType, variable.scopes);
        const modeValue = toReadModeValue(
          variable.valuesByMode[mode.modeId],
          tokenType,
          variableNameById,
        );
        tokens.push({
          path: variable.name.replace(/\//g, '.'),
          $type: tokenType,
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
  tokenType: string,
  variableNameById: Map<string, string>,
): { value: string | number | boolean | { value: number; unit: 'px' } | null; reference?: string; isAlias: boolean } {
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
    value: convertFromFigmaValueForTokenType(rawValue, tokenType),
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
        if (!isTokenWorkshopManagedVariable(variable)) continue;
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
    // All collection names managed by Token Workshop: the default plus any custom-mapped names
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
        if (!isTokenWorkshopManagedVariable(variable)) continue;
        // Style-generated backing variables are owned by style sync, not by the
        // standalone variable token set. Variable orphan cleanup must never
        // remove them here, or live bound styles will break.
        if (isGeneratedStyleBackingVariable(variable)) continue;
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
