import { useMemo } from "react";
import { createGeneratorOwnershipKey } from "@tokenmanager/core";
import { CommandPalette, type TokenEntry } from "./CommandPalette";
import { useCommandPaletteCommands } from "../hooks/useCommandPaletteCommands";
import {
  useCollectionStateContext,
  useTokenFlatMapContext,
  useGeneratorContext,
} from "../contexts/TokenDataContext";
import { useNavigationContext } from "../contexts/NavigationContext";
import { useEditorContext } from "../contexts/EditorContext";
import { isAlias } from "../../shared/resolveAlias";
import { useTokensWorkspaceController } from "../contexts/WorkspaceControllerContext";

export function AppCommandPalette({
  initialQuery,
  onClose,
}: {
  initialQuery: string;
  onClose: () => void;
}) {
  const {
    currentCollectionId,
    setCurrentCollectionId,
  } = useCollectionStateContext();
  const { allTokensFlat, pathToCollectionId } = useTokenFlatMapContext();
  const { derivedTokenPaths } = useGeneratorContext();
  const { navigateTo } = useNavigationContext();
  const { setEditingToken, setHighlightedToken, setPendingHighlight } =
    useEditorContext();
  const tokens = useTokensWorkspaceController();
  const { commands, currentCollectionPaletteTokens } = useCommandPaletteCommands();
  const { starredTokens } = tokens;

  const paletteTokens = useMemo<TokenEntry[]>(() => {
    return Object.entries(allTokensFlat).map(([path, entry]) => ({
      set: pathToCollectionId[path],
      path,
      type: entry.$type,
      value:
        typeof entry.$value === "string"
          ? entry.$value
          : JSON.stringify(entry.$value),
      isAlias: isAlias(entry.$value),
      generatorName: derivedTokenPaths.get(
        createGeneratorOwnershipKey(pathToCollectionId[path] ?? "", path),
      )?.name,
    }));
  }, [allTokensFlat, derivedTokenPaths, pathToCollectionId]);

  const starredPaletteTokens = useMemo<TokenEntry[]>(() => {
    return starredTokens.tokens
      .filter(({ path, collectionId }) =>
        allTokensFlat[path] && pathToCollectionId[path] === collectionId,
      )
      .map(({ path, collectionId }) => {
        const entry = allTokensFlat[path];
        return {
          path,
          type: entry.$type,
          value:
            typeof entry.$value === "string"
              ? entry.$value
              : JSON.stringify(entry.$value),
          set: collectionId,
          isAlias: isAlias(entry.$value),
        };
      });
  }, [allTokensFlat, pathToCollectionId, starredTokens.tokens]);

  const recentPaletteTokens = useMemo<TokenEntry[]>(() => {
    const maxRecent = 10;
    return tokens.recentlyTouched
      .listEntries()
      .filter(
        ({ path, collectionId }) =>
          allTokensFlat[path] && pathToCollectionId[path] === collectionId,
      )
      .slice(0, maxRecent)
      .map(({ path }) => {
        const entry = allTokensFlat[path];
        return {
          path,
          type: entry.$type,
          value:
            typeof entry.$value === "string"
              ? entry.$value
              : JSON.stringify(entry.$value),
          set: pathToCollectionId[path],
          isAlias: isAlias(entry.$value),
        };
      });
  }, [allTokensFlat, pathToCollectionId, tokens.recentlyTouched]);

  return (
    <CommandPalette
      initialQuery={initialQuery}
      commands={commands}
      tokens={currentCollectionPaletteTokens}
      allSetTokens={paletteTokens}
      starredTokens={starredPaletteTokens}
      recentTokens={recentPaletteTokens}
      onGoToToken={(path) => {
        const targetCollectionId = pathToCollectionId[path];
        navigateTo("library");
        setEditingToken(null);
        if (targetCollectionId && targetCollectionId !== currentCollectionId) {
          setCurrentCollectionId(targetCollectionId);
          setPendingHighlight(path);
          return;
        }
        setHighlightedToken(path);
      }}
      onGoToGroup={(groupPath) => {
        navigateTo("library");
        setEditingToken(null);
        setHighlightedToken(groupPath);
      }}
      onCopyTokenPath={(path) => {
        navigator.clipboard.writeText(path).catch((error) => {
          console.warn("[App] clipboard write failed for token path:", error);
        });
      }}
      onCopyTokenRef={(path) => {
        navigator.clipboard.writeText(`{${path}}`).catch((error) => {
          console.warn("[App] clipboard write failed for token ref:", error);
        });
      }}
      onCopyTokenValue={(value) => {
        navigator.clipboard.writeText(value).catch((error) => {
          console.warn("[App] clipboard write failed for token value:", error);
        });
      }}
      onCopyTokenCssVar={(path) => {
        const cssVar = `var(--${path.replace(/\./g, "-")})`;
        navigator.clipboard.writeText(cssVar).catch((error) => {
          console.warn("[App] clipboard write failed for CSS var:", error);
        });
      }}
      onDuplicateToken={tokens.handlePaletteDuplicate}
      onRenameToken={tokens.handlePaletteRename}
      onMoveToken={tokens.handlePaletteMove}
      onDeleteToken={tokens.handlePaletteDeleteToken}
      onClose={onClose}
    />
  );
}
