import { useCallback, type MutableRefObject } from "react";
import type { TokenNode } from "../../hooks/useTokens";
import type { TokenMapEntry } from "../../../shared/types";
import type { VariableDiffPendingState } from "../../shared/tokenListModalTypes";
import {
  isAlias,
  extractAliasPath,
  resolveTokenValue,
} from "../../../shared/resolveAlias";
import { getErrorMessage } from "../../shared/utils";
import { dispatchToast } from "../../shared/toastBus";

function flattenTokens(nodes: TokenNode[], collectionId: string): any[] {
  const result: any[] = [];
  const walk = (list: TokenNode[]) => {
    for (const node of list) {
      if (!node.isGroup) {
        result.push({
          path: node.path,
          $type: node.$type,
          $value: node.$value,
          collectionId,
        });
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

function resolveFlat(
  flat: any[],
  allTokensFlat: Record<string, TokenMapEntry>,
): any[] {
  return flat.map((t) => {
    if (t.$type === "gradient" && Array.isArray(t.$value)) {
      const resolvedStops = t.$value.map(
        (stop: { color: string; position: number }) => {
          if (isAlias(stop.color)) {
            const refPath = extractAliasPath(stop.color)!;
            const refEntry = allTokensFlat[refPath];
            if (refEntry) {
              const inner = resolveTokenValue(
                refEntry.$value,
                refEntry.$type,
                allTokensFlat,
              );
              return { ...stop, color: inner.value ?? refEntry.$value };
            }
          }
          return stop;
        },
      );
      return { ...t, $value: resolvedStops };
    }
    const resolved = resolveTokenValue(t.$value, t.$type, allTokensFlat);
    return {
      ...t,
      $value: resolved.value ?? t.$value,
      $type: resolved.$type,
    };
  });
}

interface ApplyOperationsConfig {
  tokens: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  collectionId: string;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  varReadPendingRef: MutableRefObject<
    Map<string, (tokens: any[]) => void>
  >;
  onRefresh: () => void;
  onError?: (msg: string) => void;
  setApplying: (v: boolean) => void;
  setVarDiffLoading: (v: boolean) => void;
  setVarDiffPending: (v: VariableDiffPendingState | null) => void;
  closeLongLivedReviewSurfaces: () => void;
  sendStyleApply: (
    type: string,
    payload: { tokens: any[] },
  ) => Promise<{
    count: number;
    total: number;
    failures: { path: string; error: string }[];
    skipped: Array<{ path: string; $type: string }>;
  }>;
}

export function useTokenListApplyOperations(config: ApplyOperationsConfig) {
  const {
    tokens,
    allTokensFlat,
    collectionId,
    collectionMap,
    modeMap,
    varReadPendingRef,
    onError,
    setApplying,
    setVarDiffLoading,
    setVarDiffPending,
    closeLongLivedReviewSurfaces,
    sendStyleApply,
  } = config;

  const doApplyVariables = useCallback(
    (flat: any[]) => {
      parent.postMessage(
        {
          pluginMessage: {
            type: "apply-variables",
            tokens: flat,
            collectionMap,
            modeMap,
          },
        },
        "*",
      );
      dispatchToast(`Applied ${flat.length} variables`, "success");
    },
    [collectionMap, modeMap],
  );

  const handleApplyVariables = useCallback(async () => {
    closeLongLivedReviewSurfaces();
    const flat = resolveFlat(
      flattenTokens(tokens, collectionId),
      allTokensFlat,
    ).map((t: any) => ({ ...t, collectionId }));
    setVarDiffLoading(true);
    try {
      const figmaTokens: any[] = await new Promise((resolve, reject) => {
        const cid = `tl-vars-${Date.now()}-${Math.random()}`;
        const timeout = setTimeout(() => {
          varReadPendingRef.current.delete(cid);
          reject(new Error("timeout"));
        }, 8000);
        varReadPendingRef.current.set(cid, (toks) => {
          clearTimeout(timeout);
          resolve(toks);
        });
        parent.postMessage(
          { pluginMessage: { type: "read-variables", correlationId: cid } },
          "*",
        );
      });
      const figmaMap = new Map(
        figmaTokens.map((t: any) => [t.path, String(t.$value ?? "")]),
      );
      let added = 0,
        modified = 0,
        unchanged = 0;
      for (const t of flat) {
        if (!figmaMap.has(t.path)) added++;
        else if (figmaMap.get(t.path) !== String(t.$value ?? "")) modified++;
        else unchanged++;
      }
      setVarDiffPending({ added, modified, unchanged, flat });
    } catch (err) {
      console.warn("[TokenList] Figma variable diff failed:", err);
      setVarDiffPending({
        added: flat.length,
        modified: 0,
        unchanged: 0,
        flat,
      });
    } finally {
      setVarDiffLoading(false);
    }
  }, [
    closeLongLivedReviewSurfaces,
    tokens,
    allTokensFlat,
    collectionId,
    setVarDiffLoading,
    setVarDiffPending,
    varReadPendingRef,
  ]);

  const handleApplyStyles = useCallback(async () => {
    setApplying(true);
    const flat = resolveFlat(flattenTokens(tokens, collectionId), allTokensFlat);
    try {
      const result = await sendStyleApply("apply-styles", { tokens: flat });
      dispatchToast(`Applied ${result.count} styles`, "success");
      if (result.failures.length > 0) {
        const failedPaths = result.failures.map((f) => f.path).join(", ");
        onError?.(
          `${result.count}/${result.total} styles created. Failed: ${failedPaths}`,
        );
      }
    } catch (err) {
      onError?.(getErrorMessage(err, "Failed to apply styles"));
    } finally {
      setApplying(false);
    }
  }, [setApplying, tokens, collectionId, allTokensFlat, sendStyleApply, onError]);

  return {
    doApplyVariables,
    handleApplyVariables,
    handleApplyStyles,
  };
}
