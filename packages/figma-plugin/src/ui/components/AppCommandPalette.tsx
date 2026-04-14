import { useMemo } from "react";
import { createRecipeOwnershipKey } from "@tokenmanager/core";
import { CommandPalette, type TokenEntry } from "./CommandPalette";
import { useCommandPaletteCommands } from "../hooks/useCommandPaletteCommands";
import {
  useTokenSetsContext,
  useTokenFlatMapContext,
  useRecipeContext,
} from "../contexts/TokenDataContext";
import { useNavigationContext } from "../contexts/NavigationContext";
import { useEditorContext } from "../contexts/EditorContext";
import { usePinnedTokens } from "../hooks/usePinnedTokens";
import { isAlias } from "../../shared/resolveAlias";
import { useTokensWorkspaceController } from "../contexts/WorkspaceControllerContext";

export function AppCommandPalette({
  initialQuery,
  onClose,
}: {
  initialQuery: string;
  onClose: () => void;
}) {
  const { activeSet, setActiveSet } = useTokenSetsContext();
  const { allTokensFlat, pathToSet } = useTokenFlatMapContext();
  const { derivedTokenPaths } = useRecipeContext();
  const { navigateTo } = useNavigationContext();
  const { setEditingToken, setHighlightedToken, setPendingHighlight } =
    useEditorContext();
  const tokens = useTokensWorkspaceController();
  const { commands, activeSetPaletteTokens } = useCommandPaletteCommands();
  const pinnedTokensState = usePinnedTokens(activeSet);

  const paletteTokens = useMemo<TokenEntry[]>(() => {
    return Object.entries(allTokensFlat).map(([path, entry]) => ({
      set: pathToSet[path],
      path,
      type: entry.$type,
      value:
        typeof entry.$value === "string"
          ? entry.$value
          : JSON.stringify(entry.$value),
      isAlias: isAlias(entry.$value),
      recipeName: derivedTokenPaths.get(
        createRecipeOwnershipKey(pathToSet[path] ?? "", path),
      )?.name,
    }));
  }, [allTokensFlat, derivedTokenPaths, pathToSet]);

  const pinnedPaletteTokens = useMemo<TokenEntry[]>(() => {
    return Array.from(pinnedTokensState.paths)
      .filter((path) => allTokensFlat[path])
      .map((path) => {
        const entry = allTokensFlat[path];
        return {
          path,
          type: entry.$type,
          value:
            typeof entry.$value === "string"
              ? entry.$value
              : JSON.stringify(entry.$value),
          set: pathToSet[path],
          isAlias: isAlias(entry.$value),
        };
      });
  }, [allTokensFlat, pathToSet, pinnedTokensState.paths]);

  const recentPaletteTokens = useMemo<TokenEntry[]>(() => {
    const maxRecent = 10;
    return Array.from(tokens.recentlyTouched.timestamps.entries())
      .filter(([path]) => allTokensFlat[path])
      .sort(([, left], [, right]) => right - left)
      .slice(0, maxRecent)
      .map(([path]) => {
        const entry = allTokensFlat[path];
        return {
          path,
          type: entry.$type,
          value:
            typeof entry.$value === "string"
              ? entry.$value
              : JSON.stringify(entry.$value),
          set: pathToSet[path],
          isAlias: isAlias(entry.$value),
        };
      });
  }, [allTokensFlat, pathToSet, tokens.recentlyTouched.timestamps]);

  return (
    <CommandPalette
      initialQuery={initialQuery}
      commands={commands}
      tokens={activeSetPaletteTokens}
      allSetTokens={paletteTokens}
      pinnedTokens={pinnedPaletteTokens}
      recentTokens={recentPaletteTokens}
      onGoToToken={(path) => {
        const targetSet = pathToSet[path];
        navigateTo("define", "tokens");
        setEditingToken(null);
        if (targetSet && targetSet !== activeSet) {
          setActiveSet(targetSet);
          setPendingHighlight(path);
          return;
        }
        setHighlightedToken(path);
      }}
      onGoToGroup={(groupPath) => {
        navigateTo("define", "tokens");
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
