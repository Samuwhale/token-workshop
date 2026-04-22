import { useCallback, type MutableRefObject } from "react";
import type { TokenReference, TokenValue } from "@tokenmanager/core";
import type { TokenNode } from "../../hooks/useTokens";
import type {
  ApplyVariablesErrorMessage,
  TokenMapEntry,
  VariablesAppliedMessage,
  VariablesReadMessage,
} from "../../../shared/types";
import type { VariableDiffPendingState } from "../../shared/tokenListModalTypes";
import {
  isAlias,
  extractAliasPath,
  resolveTokenValue,
} from "../../../shared/resolveAlias";
import {
  selectVariableCollectionTokens,
  summarizeVariableDiff,
} from "../../shared/syncWorkflow";
import { buildStylePublishTokens } from "../../shared/stylePublish";
import { getErrorMessage } from "../../shared/utils";
import { dispatchToast } from "../../shared/toastBus";
import {
  getPluginMessageFromEvent,
  postPluginMessage,
} from "../../../shared/utils";

type VariablePreviewToken = Pick<
  VariableDiffPendingState["flat"][number],
  "path" | "$type" | "$value" | "collectionId" | "$extensions" | "$scopes"
>;

type RawVariablePreviewToken = Omit<VariablePreviewToken, "$value"> & {
  $value: TokenValue | TokenReference;
};

type PendingVariableRead = {
  resolve: (collections: VariablesReadMessage["collections"]) => void;
  reject: (error: Error) => void;
};

function flattenTokens(
  nodes: TokenNode[],
  collectionId: string,
): RawVariablePreviewToken[] {
  const result: RawVariablePreviewToken[] = [];
  const walk = (list: TokenNode[]) => {
    for (const node of list) {
      if (!node.isGroup && node.$type && node.$value !== undefined) {
        result.push({
          path: node.path,
          $type: node.$type,
          $value: node.$value,
          collectionId,
          $extensions: node.$extensions,
          $scopes: node.$scopes,
        });
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

function resolveFlat(
  flat: RawVariablePreviewToken[],
  allTokensFlat: Record<string, TokenMapEntry>,
): VariablePreviewToken[] {
  return flat.map((t) => {
    if (t.$type === "gradient" && Array.isArray(t.$value)) {
      const gradientStops = t.$value as unknown as Array<{
        color: string;
        position: number;
      }>;
      const resolvedStops = gradientStops.map((stop) => {
          if (isAlias(stop.color)) {
            const refPath = extractAliasPath(stop.color)!;
            const refEntry = allTokensFlat[refPath];
            if (refEntry) {
              const inner = resolveTokenValue(
                refEntry.$value,
                refEntry.$type,
                allTokensFlat,
              );
              const resolvedColor =
                typeof inner.value === "string"
                  ? inner.value
                  : typeof refEntry.$value === "string"
                    ? refEntry.$value
                    : stop.color;
              return { ...stop, color: resolvedColor };
            }
          }
          return stop;
        });
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
  collections: Array<{ id: string; modes: Array<{ name: string }> }>;
  pathToCollectionId: Record<string, string>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  varReadPendingRef: MutableRefObject<Map<string, PendingVariableRead>>;
  onError?: (msg: string) => void;
  setApplying: (v: boolean) => void;
  setVarDiffLoading: (v: boolean) => void;
  setVarDiffPending: (v: VariableDiffPendingState | null) => void;
  closeLongLivedReviewSurfaces: () => void;
  sendStyleApply: (
    type: string,
    payload: { tokens: unknown[] },
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
    collections,
    pathToCollectionId,
    perCollectionFlat,
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
    (flat: VariableDiffPendingState["flat"]) => {
      void (async () => {
        const correlationId = `tl-apply-vars-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setApplying(true);

        try {
          const result = await new Promise<VariablesAppliedMessage>(
            (resolve, reject) => {
              let timeoutId = 0;

              const cleanup = () => {
                window.clearTimeout(timeoutId);
                window.removeEventListener("message", handleMessage);
              };

              const handleMessage = (event: MessageEvent) => {
                const msg = getPluginMessageFromEvent<
                  VariablesAppliedMessage | ApplyVariablesErrorMessage
                >(event);
                if (!msg || msg.correlationId !== correlationId) {
                  return;
                }

                cleanup();

                if (msg.type === "variables-applied") {
                  resolve(msg);
                  return;
                }

                reject(
                  new Error(msg.error || "Failed to apply Figma variables"),
                );
              };

              timeoutId = window.setTimeout(() => {
                cleanup();
                reject(new Error("Timed out applying Figma variables"));
              }, 30000);

              window.addEventListener("message", handleMessage);

              if (
                !postPluginMessage({
                  type: "apply-variables",
                  tokens: flat,
                  collectionMap,
                  modeMap,
                  correlationId,
                })
              ) {
                cleanup();
                reject(new Error("Figma plugin host unavailable"));
              }
            },
          );

          const total = result.total ?? flat.length;
          const skippedCount = result.skipped?.length ?? 0;

          if ((result.failures?.length ?? 0) > 0) {
            const failedPaths = result.failures!.map((failure) => failure.path).join(", ");
            const skippedNote =
              skippedCount > 0
                ? ` ${skippedCount} skipped (unsupported type).`
                : "";
            dispatchToast(
              `${result.count}/${total} variables published with issues.`,
              "warning",
            );
            onError?.(
              `${result.count}/${total} variables published. Failed: ${failedPaths}.${skippedNote}`,
            );
            return;
          }

          dispatchToast(
            `${result.count} variable${result.count !== 1 ? "s" : ""} published${
              skippedCount > 0
                ? ` · ${skippedCount} skipped (unsupported type)`
                : ""
            }`,
            "success",
          );
        } catch (err) {
          onError?.(getErrorMessage(err, "Failed to apply variables"));
        } finally {
          setApplying(false);
        }
      })();
    },
    [collectionMap, modeMap, onError, setApplying],
  );

  const handleApplyVariables = useCallback(async () => {
    closeLongLivedReviewSurfaces();
    const flat = resolveFlat(
      flattenTokens(tokens, collectionId),
      allTokensFlat,
    ).map((token) => ({ ...token, collectionId }));
    setVarDiffLoading(true);
    try {
      const figmaCollections = await new Promise<VariablesReadMessage["collections"]>(
        (resolve, reject) => {
          const cid = `tl-vars-${Date.now()}-${Math.random()}`;
          const timeout = setTimeout(() => {
            varReadPendingRef.current.delete(cid);
            reject(new Error("Timed out reading Figma variables"));
          }, 8000);
          varReadPendingRef.current.set(cid, {
            resolve: (collections) => {
              clearTimeout(timeout);
              resolve(collections);
            },
            reject: (error) => {
              clearTimeout(timeout);
              reject(error);
            },
          });
          if (!postPluginMessage({ type: "read-variables", correlationId: cid })) {
            clearTimeout(timeout);
            varReadPendingRef.current.delete(cid);
            reject(new Error("Figma plugin host unavailable"));
          }
        },
      );
      const figmaTokens = selectVariableCollectionTokens(
        figmaCollections,
        collectionId,
        collectionMap,
        modeMap,
      );
      const summary = summarizeVariableDiff(flat, figmaTokens);
      setVarDiffPending({ ...summary, flat });
    } catch (err) {
      console.warn("[TokenList] Figma variable diff failed:", err);
      setVarDiffPending({
        added: flat.length,
        modified: 0,
        unchanged: 0,
        flat,
      });
      onError?.(
        "Could not compare against current Figma variables. Review is using local tokens only.",
      );
    } finally {
      setVarDiffLoading(false);
    }
  }, [
    closeLongLivedReviewSurfaces,
    tokens,
    allTokensFlat,
    collectionId,
    collectionMap,
    modeMap,
    setVarDiffLoading,
    setVarDiffPending,
    varReadPendingRef,
    onError,
  ]);

  const handleApplyStyles = useCallback(async () => {
    setApplying(true);
    const flat = resolveFlat(flattenTokens(tokens, collectionId), allTokensFlat);
    try {
      const result = await sendStyleApply("apply-styles", {
        tokens: buildStylePublishTokens({
          paths: flat
            .filter((token) =>
              token.$type === "color" ||
              token.$type === "gradient" ||
              token.$type === "typography" ||
              token.$type === "shadow",
            )
            .map((token) => token.path),
          collections,
          pathToCollectionId,
          perCollectionFlat,
          collectionMap,
          modeMap,
        }),
      });
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
  }, [
    setApplying,
    tokens,
    collectionId,
    allTokensFlat,
    collections,
    pathToCollectionId,
    perCollectionFlat,
    collectionMap,
    modeMap,
    sendStyleApply,
    onError,
  ]);

  return {
    doApplyVariables,
    handleApplyVariables,
    handleApplyStyles,
  };
}
