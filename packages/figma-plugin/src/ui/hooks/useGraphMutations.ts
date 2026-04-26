import { useCallback } from "react";
import { useTokensWorkspaceController } from "../contexts/WorkspaceControllerContext";

/**
 * Thin wrapper around the rewire / detach controller methods. Lives outside
 * GraphPanel so non-panel surfaces (e.g. a future sidebar shortcut) can reuse
 * the same interaction without re-importing the controller directly.
 */
export function useGraphMutations() {
  const {
    applyAliasRewire,
    applyAliasDetach,
    createAliasToken,
    handlePaletteDeleteToken,
  } = useTokensWorkspaceController();

  const rewire = useCallback(
    (params: {
      tokenPath: string;
      tokenCollectionId: string;
      targetPath: string;
      targetCollectionId: string;
      modeNames: string[];
    }) => applyAliasRewire(params),
    [applyAliasRewire],
  );

  const detach = useCallback(
    (params: {
      tokenPath: string;
      tokenCollectionId: string;
      modeLiterals: Record<string, unknown>;
    }) => applyAliasDetach(params),
    [applyAliasDetach],
  );

  const createAlias = useCallback(
    (params: {
      newPath: string;
      collectionId: string;
      type: string | undefined;
      targetPath: string;
      targetCollectionId: string;
    }) => createAliasToken(params),
    [createAliasToken],
  );

  const deleteToken = useCallback(
    (path: string, collectionId: string) =>
      handlePaletteDeleteToken(path, collectionId),
    [handlePaletteDeleteToken],
  );

  return { rewire, detach, createAlias, deleteToken };
}
