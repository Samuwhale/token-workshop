import { stableStringify } from "@token-workshop/core";
import type {
  FieldChange,
  OperationEntry,
  SnapshotEntry,
} from "./operation-log.js";
import { getSnapshotTokenPath } from "./operation-log.js";

const MODIFIED_TOKEN_FIELDS = [
  "$value",
  "$type",
  "$description",
  "$extensions",
] as const;

type ModifiedTokenField = (typeof MODIFIED_TOKEN_FIELDS)[number];

export interface RollbackPreviewDiff {
  path: string;
  collectionId: string;
  status: "added" | "modified" | "removed";
  changedFields?: ModifiedTokenField[];
  before?: {
    $value: unknown;
    $type?: string;
    $description?: string;
  };
  after?: {
    $value: unknown;
    $type?: string;
    $description?: string;
  };
}

export interface RollbackPreview {
  diffs: RollbackPreviewDiff[];
  metadataChanges: FieldChange[];
}

function invertFieldChanges(metadata: OperationEntry["metadata"]): FieldChange[] {
  return Array.isArray(metadata?.changes)
    ? metadata.changes.map((change) => ({
        ...change,
        before: change.after,
        after: change.before,
      }))
    : [];
}

function buildGeneratorRestoreChange(entry: OperationEntry): FieldChange | null {
  const generatorRestoreStep = entry.rollbackSteps?.find(
    (step) => step.action === "restore-generators",
  );
  if (!generatorRestoreStep) {
    return null;
  }

  const metadata = entry.metadata as Record<string, unknown> | undefined;
  const generatorName =
    typeof metadata?.generatorName === "string"
      ? metadata.generatorName
      : "Generator";

  return {
    field: "generators",
    label: "Generator documents",
    before: `${generatorName} current state`,
    after: `${generatorRestoreStep.generators.length} stored generator${
      generatorRestoreStep.generators.length === 1 ? "" : "s"
    }`,
  };
}

function buildMetadataRollbackChanges(entry: OperationEntry): FieldChange[] {
  const changes = invertFieldChanges(entry.metadata);
  const generatorRestoreChange = buildGeneratorRestoreChange(entry);
  return generatorRestoreChange ? [...changes, generatorRestoreChange] : changes;
}

function tokenChangedFields(
  current: NonNullable<SnapshotEntry["token"]>,
  restored: NonNullable<SnapshotEntry["token"]>,
): ModifiedTokenField[] {
  return MODIFIED_TOKEN_FIELDS.filter((field) => {
    return stableStringify(current[field]) !== stableStringify(restored[field]);
  });
}

function buildTokenRollbackDiff(
  snapshotKey: string,
  currentEntry: SnapshotEntry | undefined,
  restoredEntry: SnapshotEntry | undefined,
): RollbackPreviewDiff | null {
  const currentToken = currentEntry?.token;
  const restoredToken = restoredEntry?.token;
  const collectionId = currentEntry?.collectionId ?? restoredEntry?.collectionId ?? "";
  const userFacingPath = getSnapshotTokenPath(snapshotKey, collectionId);

  if (currentToken && !restoredToken) {
    return {
      path: userFacingPath,
      collectionId,
      status: "removed",
      before: {
        $value: currentToken.$value,
        $type: currentToken.$type,
      },
    };
  }

  if (!currentToken && restoredToken) {
    return {
      path: userFacingPath,
      collectionId,
      status: "added",
      after: {
        $value: restoredToken.$value,
        $type: restoredToken.$type,
      },
    };
  }

  if (!currentToken || !restoredToken) {
    return null;
  }

  const changedFields = tokenChangedFields(currentToken, restoredToken);
  if (changedFields.length === 0) {
    return null;
  }

  return {
    path: userFacingPath,
    collectionId,
    status: "modified",
    changedFields,
    before: {
      $value: currentToken.$value,
      $type: currentToken.$type,
      $description: currentToken.$description,
    },
    after: {
      $value: restoredToken.$value,
      $type: restoredToken.$type,
      $description: restoredToken.$description,
    },
  };
}

export function buildRollbackPreview(entry: OperationEntry): RollbackPreview {
  const snapshotKeys = new Set([
    ...Object.keys(entry.afterSnapshot),
    ...Object.keys(entry.beforeSnapshot),
  ]);
  const diffs: RollbackPreviewDiff[] = [];

  for (const snapshotKey of snapshotKeys) {
    const diff = buildTokenRollbackDiff(
      snapshotKey,
      entry.afterSnapshot[snapshotKey],
      entry.beforeSnapshot[snapshotKey],
    );
    if (diff) {
      diffs.push(diff);
    }
  }

  return {
    diffs,
    metadataChanges: buildMetadataRollbackChanges(entry),
  };
}
