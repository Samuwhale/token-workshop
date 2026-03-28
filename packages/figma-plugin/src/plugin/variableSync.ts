import { VARIABLE_COLLECTION_NAME } from './constants.js';
import { mapTokenTypeToVariableType, mapVariableTypeToTokenType, convertToFigmaValue, convertFromFigmaValue, findVariableInList } from './variableUtils.js';
import { getErrorMessage } from '../shared/utils.js';

export async function applyVariables(tokens: any[], collectionMap: Record<string, string> = {}, modeMap: Record<string, string> = {}, correlationId?: string) {
  // Rollback tracking — populated before any mutations occur
  const variableSnapshots = new Map<string, Record<string, VariableValue>>(); // varId → {modeId → value}
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

    for (const token of tokens) {
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
        // Snapshot current values before modifying so we can roll back on error
        if (!variableSnapshots.has(existing.id)) {
          variableSnapshots.set(existing.id, structuredClone(existing.valuesByMode));
        }
        variable = existing;
      } else {
        variable = figma.variables.createVariable(figmaName, collection, variableType);
        createdVariableIds.push(variable.id);
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

    figma.ui.postMessage({ type: 'variables-applied', count: tokens.length, correlationId });
  } catch (error) {
    // Attempt to roll back all changes made before the failure
    let rolledBack = false;
    try {
      // Restore original values for variables that existed before this operation
      for (const [varId, snapshot] of variableSnapshots) {
        const v = await figma.variables.getVariableByIdAsync(varId);
        if (v) {
          for (const [modeId, value] of Object.entries(snapshot)) {
            try { v.setValueForMode(modeId, value as VariableValue); } catch { /* ignore individual restore errors */ }
          }
        }
      }
      // Delete variables created during this operation (reverse order)
      for (const varId of [...createdVariableIds].reverse()) {
        const v = await figma.variables.getVariableByIdAsync(varId);
        if (v) { try { v.remove(); } catch { /* ignore */ } }
      }
      // Delete collections created during this operation if they are now empty
      for (const colId of [...createdCollectionIds].reverse()) {
        const cols = await figma.variables.getLocalVariableCollectionsAsync();
        const col = cols.find(c => c.id === colId);
        if (col) {
          const allVars = await figma.variables.getLocalVariablesAsync();
          const hasVars = allVars.some(v => v.variableCollectionId === colId);
          if (!hasVars) { try { col.remove(); } catch { /* ignore */ } }
        }
      }
      rolledBack = true;
    } catch (rollbackError) {
      console.error('[applyVariables] rollback failed:', rollbackError);
    }

    figma.ui.postMessage({ type: 'apply-variables-error', message: String(error), correlationId, rolledBack, rollbackError: rolledBack ? undefined : 'Rollback failed — partial changes may persist. Check console for details.' });
  }
}

export async function readFigmaVariables(correlationId?: string) {
  let localCollections: VariableCollection[];
  try {
    localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  } catch (err) {
    const message = getErrorMessage(err);
    figma.ui.postMessage({ type: 'variables-read-error', message, correlationId });
    return;
  }
  const collections: any[] = [];

  for (const collection of localCollections) {
    if (collection.modes.length === 0) continue;

    const modes: any[] = [];
    for (const mode of collection.modes) {
      const tokens: any[] = [];
      for (const varId of collection.variableIds) {
        const variable = await figma.variables.getVariableByIdAsync(varId);
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

export async function deleteOrphanVariables(knownPaths: string[], collectionMap: Record<string, string> = {}) {
  try {
    const knownSet = new Set(knownPaths);
    // All collection names managed by TokenManager: the default plus any custom-mapped names
    const managedNames = new Set([VARIABLE_COLLECTION_NAME, ...Object.values(collectionMap)]);
    const allCollections = await figma.variables.getLocalVariableCollectionsAsync();
    const managedCollections = allCollections.filter(c => managedNames.has(c.name));
    if (managedCollections.length === 0) {
      figma.ui.postMessage({ type: 'orphans-deleted', count: 0 });
      return;
    }
    let deleted = 0;
    for (const collection of managedCollections) {
      for (const varId of collection.variableIds) {
        const variable = await figma.variables.getVariableByIdAsync(varId);
        if (!variable) continue;
        const path = variable.name.replace(/\//g, '.');
        if (!knownSet.has(path)) {
          variable.remove();
          deleted++;
        }
      }
    }
    figma.ui.postMessage({ type: 'orphans-deleted', count: deleted });
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: String(error) });
  }
}

interface ExportedModeValue {
  /** The resolved raw value (color hex, number, string, boolean) */
  resolvedValue: any;
  /** If this value is an alias, the DTCG reference string e.g. "{colors.primary}" */
  reference?: string;
  /** Whether this value is an alias to another variable */
  isAlias: boolean;
}

interface ExportedVariable {
  name: string;
  path: string;
  resolvedType: string;
  $type: string;
  description?: string;
  hiddenFromPublishing: boolean;
  scopes: string[];
  modeValues: Record<string, ExportedModeValue>;
}

interface ExportedCollection {
  name: string;
  modes: string[];
  variables: ExportedVariable[];
}

function convertExportValue(
  rawValue: any,
  resolvedType: VariableResolvedDataType,
  idToName: Map<string, string>,
): ExportedModeValue {
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
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const allVariables = await figma.variables.getLocalVariablesAsync();

    // Build a lookup: variable id -> variable name (for resolving aliases)
    const idToName = new Map<string, string>();
    for (const v of allVariables) {
      idToName.set(v.id, v.name.replace(/\//g, '.'));
    }

    const exportedCollections: ExportedCollection[] = [];

    for (const collection of collections) {
      const modes = collection.modes.map(m => ({ modeId: m.modeId, name: m.name }));
      const variables: ExportedVariable[] = [];

      for (const varId of collection.variableIds) {
        const variable = await figma.variables.getVariableByIdAsync(varId);
        if (!variable) continue;

        const modeValues: Record<string, ExportedModeValue> = {};

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
