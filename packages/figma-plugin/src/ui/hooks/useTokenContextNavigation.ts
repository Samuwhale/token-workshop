import { useCallback } from "react";
import type { NavigationContextValue } from "../contexts/NavigationContext";
import type {
  EditorContextualSurfaceTarget,
  TokenDetailsTarget,
} from "../contexts/EditorContext";
import type {
  TokenContextNavigationRequest,
} from "../shared/navigationTypes";

interface UseTokenContextNavigationParams {
  currentCollectionId: string;
  navigateTo: NavigationContextValue["navigateTo"];
  switchContextualSurface: (
    target: EditorContextualSurfaceTarget,
  ) => void;
  setCurrentCollectionId: (collectionId: string) => void;
  setHighlightedToken: (path: string | null) => void;
  beginHandoff?: NavigationContextValue["beginHandoff"];
  returnFromHandoff?: NavigationContextValue["returnFromHandoff"];
  guardEditorAction?: (action: () => void) => void;
}

function getTokenNavigationName(path: string): string {
  const segments = path.split(".").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function buildTokenContextTarget(options: {
  request: TokenContextNavigationRequest;
  mode: "inspect" | "edit";
  currentCollectionId: string;
  preserveHandoff: boolean;
  navigateTo: NavigationContextValue["navigateTo"];
  switchContextualSurface: (
    target: EditorContextualSurfaceTarget,
  ) => void;
  setCurrentCollectionId: (collectionId: string) => void;
  setHighlightedToken: (path: string | null) => void;
  returnFromHandoff?: NavigationContextValue["returnFromHandoff"];
}): TokenDetailsTarget {
  const {
    request,
    mode: _mode,
    currentCollectionId,
    preserveHandoff,
    navigateTo,
    switchContextualSurface,
    setCurrentCollectionId,
    setHighlightedToken,
    returnFromHandoff,
  } = options;
  const isWorkingCollectionTarget =
    request.collectionId === currentCollectionId;
  const navigationHistory = request.navigationHistory ?? [];
  const resolvedName = request.name ?? getTokenNavigationName(request.path);

  return {
    path: request.path,
    name: resolvedName,
    collectionId: request.collectionId,
    mode: "edit",
    origin: request.origin,
    backLabel: request.returnLabel,
    navigationHistory,
    requiresWorkingCollectionForEdit: false,
    onBackToOrigin:
      request.returnLabel && returnFromHandoff
        ? returnFromHandoff
        : null,
    onMakeWorkingCollection:
      !isWorkingCollectionTarget
        ? () => {
            setCurrentCollectionId(request.collectionId);
            navigateTo("library", "tokens", {
              preserveHandoff,
            });
            switchContextualSurface({
              surface: "token-details",
              token: buildTokenContextTarget({
                ...options,
                mode: "edit",
                currentCollectionId: request.collectionId,
              }),
            });
            setHighlightedToken(request.path);
          }
        : null,
  };
}

export function useTokenContextNavigation({
  currentCollectionId,
  navigateTo,
  switchContextualSurface,
  setCurrentCollectionId,
  setHighlightedToken,
  beginHandoff,
  returnFromHandoff,
  guardEditorAction,
}: UseTokenContextNavigationParams) {
  return useCallback(
    (request: TokenContextNavigationRequest) => {
      const runAction =
        guardEditorAction ?? ((action: () => void) => action());
      runAction(() => {
        const isWorkingCollectionTarget =
          request.collectionId === currentCollectionId;
        const resolvedMode = "edit";
        const preserveHandoff = Boolean(request.returnLabel);

        if (request.returnLabel && beginHandoff) {
          beginHandoff({
            reason: `Open "${request.path}" from ${request.origin}.`,
            returnLabel: request.returnLabel,
            onReturn: request.onReturn ?? null,
          });
        }

        navigateTo("library", "tokens", {
          preserveHandoff,
        });
        switchContextualSurface({
          surface: "token-details",
          token: buildTokenContextTarget({
            request,
            mode: resolvedMode,
            currentCollectionId,
            preserveHandoff,
            navigateTo,
            switchContextualSurface,
            setCurrentCollectionId,
            setHighlightedToken,
            returnFromHandoff,
          }),
        });
        if (isWorkingCollectionTarget) {
          setHighlightedToken(request.path);
        } else {
          setHighlightedToken(null);
        }
      });
    },
    [
      beginHandoff,
      currentCollectionId,
      guardEditorAction,
      navigateTo,
      returnFromHandoff,
      setCurrentCollectionId,
      setHighlightedToken,
      switchContextualSurface,
    ],
  );
}
