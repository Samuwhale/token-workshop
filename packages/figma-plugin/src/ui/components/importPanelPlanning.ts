import {
  collectTokenReferencePaths,
  flattenTokenGroup,
  type DTCGGroup,
  type TokenExtensions,
} from "@token-workshop/core";
import {
  defaultCollectionName,
  modeKey,
  type CollectionData,
  type ImportSource as ImportSourceKind,
  type ImportToken,
} from "./importPanelTypes";

export const DEFAULT_FLAT_IMPORT_MODE_NAME = "Default";

export type ExistingTokenValue = { $type: string; $value: unknown };
export type ImportBatch = { collectionId: string; tokens: Record<string, unknown>[] };
export type ImportHistory = { operations: ImportRollbackOperation[] };
export type ImportStrategy = "overwrite" | "skip" | "merge";
export type ImportSource = ImportSourceKind | null;

export type CollectionImportTokenSource = {
  modeKey: string;
  sourceLabel: string;
  token: ImportToken;
  originalCollectionName: string;
  originalModeName: string;
  originalModeIndex: number;
};

export type CollectionImportPlan = {
  collectionId: string;
  writeTokens: CollectionImportTokenSource[];
  duplicateConflicts: {
    path: string;
    tokens: CollectionImportTokenSource[];
  }[];
  totalPathCount: number;
  secondaryModeNames: string[];
  primaryModeName: string | null;
};

export interface ImportRollbackOperation {
  operationId: string;
  collectionId: string;
  changedPaths: string[];
}

export function getImportPlanModeNames(plan: CollectionImportPlan): [string, ...string[]] {
  const modeNames = plan.primaryModeName
    ? [plan.primaryModeName, ...plan.secondaryModeNames]
    : plan.secondaryModeNames;
  const uniqueModeNames = [
    ...new Set(modeNames.map((modeName) => modeName.trim()).filter(Boolean)),
  ];
  return uniqueModeNames.length > 0
    ? [uniqueModeNames[0], ...uniqueModeNames.slice(1)]
    : [DEFAULT_FLAT_IMPORT_MODE_NAME];
}

export function buildImportPayload(
  token: ImportToken,
  source: ImportSource,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    path: token.path,
    $type: token.$type,
    $value: token.$value,
  };
  if (token.$description) payload.$description = token.$description;
  if (token.$scopes && token.$scopes.length > 0) {
    payload.$scopes = token.$scopes;
  }
  const sourceTag = getImportSourceTag(source);
  const existingExtensions = token.$extensions ?? {};
  const existingTokenWorkshop = readTokenWorkshopExtension(existingExtensions);
  if (sourceTag || Object.keys(existingTokenWorkshop).length > 0) {
    payload.$extensions = {
      ...existingExtensions,
      tokenworkshop: {
        ...existingTokenWorkshop,
        ...(sourceTag ? { source: sourceTag } : {}),
      },
    };
  }
  return payload;
}

export function flattenExistingTokens(
  tokens: Record<string, unknown> | undefined,
): Map<string, ExistingTokenValue> {
  const flat = flattenTokenGroup((tokens ?? {}) as DTCGGroup);
  const mapped = new Map<string, ExistingTokenValue>();
  for (const [path, token] of flat) {
    mapped.set(path, {
      $type: typeof token.$type === "string" ? token.$type : "unknown",
      $value: token.$value,
    });
  }
  return mapped;
}

export function buildFailedImportGroups(batches: ImportBatch[]) {
  return batches
    .map((batch) => ({
      collectionId: batch.collectionId,
      paths: batch.tokens
        .map((token) => token.path)
        .filter((path): path is string => typeof path === "string"),
    }))
    .filter((group) => group.paths.length > 0);
}

export function toImportRollbackOperation(
  collectionId: string,
  result: {
    changedPaths?: string[];
    operationId?: string;
  },
): ImportRollbackOperation | null {
  if (!result.operationId) {
    return null;
  }
  const changedPaths = result.changedPaths ?? [];
  if (changedPaths.length === 0) {
    return null;
  }
  return {
    operationId: result.operationId,
    collectionId,
    changedPaths,
  };
}

export function sortPlansByAliasDependencies(
  plans: CollectionImportPlan[],
): CollectionImportPlan[] {
  if (plans.length <= 1) return plans;

  const pathToCollection = new Map<string, string>();
  for (const plan of plans) {
    for (const source of plan.writeTokens) {
      pathToCollection.set(source.token.path, plan.collectionId);
    }
  }

  const deps = new Map<string, Set<string>>();
  for (const plan of plans) {
    const planDeps = new Set<string>();
    for (const source of plan.writeTokens) {
      for (const target of collectTokenReferencePaths({
        $value: source.token.$value,
        $extensions: source.token.$extensions as TokenExtensions | undefined,
      }, { includeExtends: true })) {
        const targetCollection = pathToCollection.get(target);
        if (targetCollection && targetCollection !== plan.collectionId) {
          planDeps.add(targetCollection);
        }
      }
    }
    deps.set(plan.collectionId, planDeps);
  }

  const sorted: CollectionImportPlan[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const planById = new Map(plans.map((plan) => [plan.collectionId, plan]));

  function visit(id: string): boolean {
    if (visited.has(id)) return true;
    if (visiting.has(id)) return false;
    const plan = planById.get(id);
    if (!plan) return true;

    visiting.add(id);
    for (const dep of deps.get(id) ?? []) {
      if (!visit(dep)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    sorted.push(plan);
    return true;
  }

  for (const plan of plans) {
    if (!visit(plan.collectionId)) {
      console.warn(
        "[ImportPanel] cyclic import alias dependency detected; preserving source collection order",
      );
      return plans;
    }
  }

  return sorted;
}

export function buildCollectionImportPlans(
  collectionData: CollectionData[],
  modeEnabled: Record<string, boolean>,
  modeCollectionNames: Record<string, string>,
): {
  plans: CollectionImportPlan[];
  ambiguousPathCount: number;
} {
  const groupedPlans = new Map<
    string,
    {
      collectionId: string;
      pathSources: Map<string, CollectionImportTokenSource[]>;
    }
  >();

  for (const collection of collectionData) {
    for (let modeIndex = 0; modeIndex < collection.modes.length; modeIndex++) {
      const mode = collection.modes[modeIndex];
      const key = modeKey(collection.name, mode.modeId);
      if (!(modeEnabled[key] ?? true)) {
        continue;
      }

      const collectionId = (
        modeCollectionNames[key] ??
        defaultCollectionName(collection.name)
      ).trim();
      const sourceLabel = buildCollectionImportSourceLabel(
        collection.name,
        mode.modeName,
      );
      let plan = groupedPlans.get(collectionId);
      if (!plan) {
        plan = {
          collectionId,
          pathSources: new Map(),
        };
        groupedPlans.set(collectionId, plan);
      }

      for (const token of mode.tokens) {
        const pathSources = plan.pathSources.get(token.path) ?? [];
        pathSources.push({
          modeKey: key,
          sourceLabel,
          token,
          originalCollectionName: collection.name,
          originalModeName: mode.modeName,
          originalModeIndex: modeIndex,
        });
        plan.pathSources.set(token.path, pathSources);
      }
    }
  }

  const plans: CollectionImportPlan[] = [];
  let ambiguousPathCount = 0;

  for (const plan of groupedPlans.values()) {
    const writeTokens: CollectionImportTokenSource[] = [];
    const duplicateConflicts: CollectionImportPlan["duplicateConflicts"] = [];
    const mergedModeNames = new Set<string>();
    let primaryModeName: string | null = null;

    for (const [path, pathSources] of plan.pathSources) {
      if (pathSources.length === 1) {
        writeTokens.push(pathSources[0]);
        if (!primaryModeName) {
          primaryModeName = pathSources[0].originalModeName;
        }
        continue;
      }

      const originCollections = new Set(
        pathSources.map((source) => source.originalCollectionName),
      );
      if (originCollections.size === 1) {
        const sorted = [...pathSources].sort(
          (a, b) => a.originalModeIndex - b.originalModeIndex,
        );
        const primary = sorted[0];
        const secondaries = sorted.slice(1);

        if (!primaryModeName) {
          primaryModeName = primary.originalModeName;
        }
        for (const source of secondaries) {
          mergedModeNames.add(source.originalModeName);
        }

        const modeValues: Record<string, unknown> = {};
        for (const source of secondaries) {
          modeValues[source.originalModeName] = source.token.$value;
        }

        const existingTokenWorkshop = readTokenWorkshopExtension(
          primary.token.$extensions,
        );
        const existingModes = readModeValuesByCollection(
          existingTokenWorkshop.modes,
        );
        const mergedToken: ImportToken = {
          ...primary.token,
          $extensions: {
            ...(primary.token.$extensions ?? {}),
            tokenworkshop: {
              ...existingTokenWorkshop,
              modes: {
                ...existingModes,
                [plan.collectionId]: modeValues,
              },
            },
          },
        };

        writeTokens.push({ ...primary, token: mergedToken });
      } else {
        ambiguousPathCount += 1;
        duplicateConflicts.push({ path, tokens: pathSources });
      }
    }

    plans.push({
      collectionId: plan.collectionId,
      writeTokens,
      duplicateConflicts,
      totalPathCount: plan.pathSources.size,
      secondaryModeNames: [...mergedModeNames],
      primaryModeName,
    });
  }

  return {
    plans,
    ambiguousPathCount,
  };
}

function getImportSourceTag(source: ImportSource): string | null {
  if (source === "variables") return "figma-variables";
  if (source === "styles") return "figma-styles";
  return source;
}

function readTokenWorkshopExtension(
  extensions: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return readRecord(extensions?.tokenworkshop);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readModeValuesByCollection(
  value: unknown,
): Record<string, Record<string, unknown>> {
  const modes = readRecord(value);
  const modeValuesByCollection: Record<string, Record<string, unknown>> = {};

  for (const [collectionId, collectionModes] of Object.entries(modes)) {
    const values = readRecord(collectionModes);
    if (Object.keys(values).length > 0) {
      modeValuesByCollection[collectionId] = values;
    }
  }

  return modeValuesByCollection;
}

function buildCollectionImportSourceLabel(
  collectionName: string,
  modeName: string,
): string {
  return `${collectionName} / ${modeName}`;
}
