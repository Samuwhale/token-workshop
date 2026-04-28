import { useMemo } from "react";
import { CommandPalette, type TokenEntry } from "./CommandPalette";
import { useCommandPaletteCommands } from "../hooks/useCommandPaletteCommands";
import {
  useCollectionStateContext,
  useTokenFlatMapContext,
} from "../contexts/TokenDataContext";
import { useUsageContext } from "../contexts/InspectContext";
import { useNavigationContext } from "../contexts/NavigationContext";
import { useEditorContext } from "../contexts/EditorContext";
import { useTokenContextNavigation } from "../hooks/useTokenContextNavigation";
import { buildCommandPaletteTokens } from "../shared/commandPaletteTokens";
import type { TokenContextNavigationRequest } from "../shared/navigationTypes";
import { useTokensWorkspaceController } from "../contexts/WorkspaceControllerContext";

export function AppCommandPalette({
  initialQuery,
  onClose,
}: {
  initialQuery: string;
  onClose: () => void;
}) {
  const {
    workingCollectionId: currentCollectionId,
    setWorkingCollectionId: setCurrentCollectionId,
  } = useCollectionStateContext();
  const { perCollectionFlat } = useTokenFlatMapContext();
  const { tokenUsageCounts, hasTokenUsageScanResult } = useUsageContext();
  const { navigateTo } = useNavigationContext();
  const {
    setHighlightedToken,
    switchContextualSurface,
  } = useEditorContext();
  const tokens = useTokensWorkspaceController();
  const { commands, currentCollectionPaletteTokens } = useCommandPaletteCommands();
  const { starredTokens } = tokens;
  const openTokenInContext = useTokenContextNavigation({
    currentCollectionId,
    navigateTo,
    switchContextualSurface,
    setCurrentCollectionId,
    setHighlightedToken,
  });

  const allPaletteTokenSources = useMemo(
    () =>
      Object.entries(perCollectionFlat).flatMap(([collectionId, collection]) =>
        Object.entries(collection).map(([path, entry]) => ({
          path,
          collectionId,
          entry,
        })),
      ),
    [perCollectionFlat],
  );

  const paletteTokens = useMemo<TokenEntry[]>(() => {
    return buildCommandPaletteTokens(
      allPaletteTokenSources,
      {
        tokenUsageCounts,
        tokenUsageReady: hasTokenUsageScanResult,
        duplicateTokenSources: allPaletteTokenSources,
        referenceTokenSources: allPaletteTokenSources,
      },
    );
  }, [
    allPaletteTokenSources,
    hasTokenUsageScanResult,
    tokenUsageCounts,
  ]);

  const starredPaletteTokens = useMemo<TokenEntry[]>(() => {
    return buildCommandPaletteTokens(
      starredTokens.tokens
        .filter(({ path, collectionId }) =>
          perCollectionFlat[collectionId]?.[path],
        )
        .map(({ path, collectionId }) => ({
          path,
          collectionId,
          entry: perCollectionFlat[collectionId][path],
        })),
      {
        tokenUsageCounts,
        tokenUsageReady: hasTokenUsageScanResult,
        duplicateTokenSources: allPaletteTokenSources,
        referenceTokenSources: allPaletteTokenSources,
      },
    );
  }, [
    allPaletteTokenSources,
    hasTokenUsageScanResult,
    perCollectionFlat,
    starredTokens.tokens,
    tokenUsageCounts,
  ]);

  const recentPaletteTokens = useMemo<TokenEntry[]>(() => {
    const maxRecent = 10;
    return buildCommandPaletteTokens(
      tokens.recentlyTouched
        .listEntries()
        .filter(
          ({ path, collectionId }) =>
            perCollectionFlat[collectionId]?.[path],
        )
        .slice(0, maxRecent)
        .map(({ path, collectionId }) => ({
          path,
          collectionId,
          entry: perCollectionFlat[collectionId][path],
        })),
      {
        tokenUsageCounts,
        tokenUsageReady: hasTokenUsageScanResult,
        duplicateTokenSources: allPaletteTokenSources,
        referenceTokenSources: allPaletteTokenSources,
      },
    );
  }, [
    allPaletteTokenSources,
    hasTokenUsageScanResult,
    perCollectionFlat,
    tokenUsageCounts,
    tokens.recentlyTouched,
  ]);

  return (
    <CommandPalette
      initialQuery={initialQuery}
      commands={commands}
      tokens={currentCollectionPaletteTokens}
      allCollectionTokens={paletteTokens}
      starredTokens={starredPaletteTokens}
      recentTokens={recentPaletteTokens}
      onGoToToken={(token) => {
        openTokenInContext({
          path: token.path,
          collectionId: token.collectionId,
          mode: "inspect",
          origin: "command-palette",
        } satisfies TokenContextNavigationRequest);
      }}
      onGoToGroup={(groupPath) => {
        navigateTo("library", "tokens");
        switchContextualSurface({ surface: null });
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
      onDuplicateToken={(token) =>
        tokens.handlePaletteDuplicate(token.path, token.collectionId)
      }
      onRenameToken={(token) =>
        tokens.handlePaletteRename(token.path, token.collectionId)
      }
      onMoveToken={(token) =>
        tokens.handlePaletteMove(token.path, token.collectionId)
      }
      onDeleteToken={(token) =>
        tokens.handlePaletteDeleteToken(token.path, token.collectionId)
      }
      onClose={onClose}
    />
  );
}
