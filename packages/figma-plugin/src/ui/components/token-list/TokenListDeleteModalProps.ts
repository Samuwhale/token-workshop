import type {
  AffectedRef,
  GeneratorImpact,
  ModeImpact,
  DeleteConfirm,
} from "../tokenListTypes";

export interface DeleteModalProps {
  title: string;
  description?: string;
  confirmLabel: string;
  pathList?: string[];
  affectedRefs?: AffectedRef[];
  generatorImpacts?: GeneratorImpact[];
  modeImpacts?: ModeImpact[];
}

export function getDeleteModalProps(
  deleteConfirm: DeleteConfirm | null,
): DeleteModalProps | null {
  if (!deleteConfirm) return null;
  const genImpacts =
    deleteConfirm.generatorImpacts.length > 0
      ? deleteConfirm.generatorImpacts
      : undefined;
  const thmImpacts =
    deleteConfirm.modeImpacts.length > 0
      ? deleteConfirm.modeImpacts
      : undefined;

  if (deleteConfirm.type === "token") {
    const name = deleteConfirm.path.split(".").pop() ?? deleteConfirm.path;
    const { orphanCount, affectedRefs } = deleteConfirm;
    const collectionCount = new Set(affectedRefs.map((r) => r.collectionId)).size;
    const parts: string[] = [];
    if (orphanCount > 0)
      parts.push(
        `break ${orphanCount} alias reference${orphanCount !== 1 ? "s" : ""} in ${collectionCount} collection${collectionCount !== 1 ? "s" : ""}`,
      );
    if (genImpacts)
      parts.push(
        `affect ${genImpacts.length} generated group${genImpacts.length !== 1 ? "s" : ""}`,
      );
    if (thmImpacts)
      parts.push(
        `affect ${thmImpacts.length} mode option${thmImpacts.length !== 1 ? "s" : ""}`,
      );
    return {
      title: `Delete "${name}"?`,
      description:
        parts.length > 0
          ? `This will ${parts.join(", ")}.`
          : `Token path: ${deleteConfirm.path}`,
      confirmLabel: "Delete",
      affectedRefs: orphanCount > 0 ? affectedRefs : undefined,
      generatorImpacts: genImpacts,
      modeImpacts: thmImpacts,
    };
  }

  if (deleteConfirm.type === "group") {
    const { orphanCount, affectedRefs } = deleteConfirm;
    const collectionCount = new Set(affectedRefs.map((r) => r.collectionId)).size;
    const parts: string[] = [
      `delete ${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? "s" : ""}`,
    ];
    if (orphanCount > 0)
      parts.push(
        `break ${orphanCount} alias reference${orphanCount !== 1 ? "s" : ""} in ${collectionCount} collection${collectionCount !== 1 ? "s" : ""}`,
      );
    if (genImpacts)
      parts.push(
        `affect ${genImpacts.length} generated group${genImpacts.length !== 1 ? "s" : ""}`,
      );
    if (thmImpacts)
      parts.push(
        `affect ${thmImpacts.length} mode option${thmImpacts.length !== 1 ? "s" : ""}`,
      );
    return {
      title: `Delete group "${deleteConfirm.name}"?`,
      description: `This will ${parts.join(", ")}.`,
      confirmLabel: `Delete group (${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? "s" : ""})`,
      affectedRefs: orphanCount > 0 ? affectedRefs : undefined,
      generatorImpacts: genImpacts,
      modeImpacts: thmImpacts,
    };
  }

  const { paths, orphanCount, affectedRefs } = deleteConfirm;
  const collectionCount = new Set(affectedRefs.map((r) => r.collectionId)).size;
  const parts: string[] = [];
  if (orphanCount > 0)
    parts.push(
      `break ${orphanCount} alias reference${orphanCount !== 1 ? "s" : ""} in ${collectionCount} collection${collectionCount !== 1 ? "s" : ""}`,
    );
  if (genImpacts)
    parts.push(
      `affect ${genImpacts.length} generated group${genImpacts.length !== 1 ? "s" : ""}`,
    );
  if (thmImpacts)
    parts.push(
      `affect ${thmImpacts.length} mode option${thmImpacts.length !== 1 ? "s" : ""}`,
    );
  return {
    title: `Delete ${paths.length} token${paths.length !== 1 ? "s" : ""}?`,
    description:
      parts.length > 0 ? `This will ${parts.join(", ")}.` : undefined,
    confirmLabel: `Delete ${paths.length} token${paths.length !== 1 ? "s" : ""}`,
    pathList: paths,
    affectedRefs: orphanCount > 0 ? affectedRefs : undefined,
    generatorImpacts: genImpacts,
    modeImpacts: thmImpacts,
  };
}
