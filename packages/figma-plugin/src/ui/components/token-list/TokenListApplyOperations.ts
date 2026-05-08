import { useCallback, type MutableRefObject } from "react";
import {
  isReference,
  parseReference,
  readTokenModeValuesForCollection,
  type TokenCollection,
  type TokenReference,
  type TokenValue,
} from "@token-workshop/core";
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
  buildStandardVariablePublishTargets,
  selectVariableModeTokens,
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
  | "path"
  | "$type"
  | "$value"
  | "collectionId"
  | "aliasTargetCollectionId"
  | "figmaCollection"
  | "figmaMode"
  | "$extensions"
  | "$scopes"
>;

type RawVariablePreviewToken = Omit<VariablePreviewToken, "$value"> & {
  $value: TokenValue | TokenReference;
};

function hasDerivation(entry: Pick<RawVariablePreviewToken, "$extensions">): boolean {
  const tokenWorkshopExtension = entry.$extensions?.tokenworkshop;
  return Boolean(
    tokenWorkshopExtension &&
    typeof tokenWorkshopExtension === "object" &&
    !Array.isArray(tokenWorkshopExtension) &&
    "derivation" in tokenWorkshopExtension,
  );
}

function buildPathCollectionIndex(
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
  activeCollectionId: string,
): Record<string, string> {
  const index: Record<string, string> = {};
  for (const [collectionId, collectionFlat] of Object.entries(perCollectionFlat)) {
    for (const path of Object.keys(collectionFlat)) {
      if (!(path in index)) {
        index[path] = collectionId;
      }
    }
  }
  for (const path of Object.keys(perCollectionFlat[activeCollectionId] ?? {})) {
    index[path] = activeCollectionId;
  }
  return index;
}

function getAliasTargetCollectionId(
  value: unknown,
  pathToCollectionId: Record<string, string>,
): string | undefined {
  return typeof value === "string" && isReference(value)
    ? pathToCollectionId[parseReference(value)]
    : undefined;
}

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
  pathToCollectionId: Record<string, string>,
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
    if (isAlias(t.$value) && !hasDerivation(t)) {
      return {
        ...t,
        aliasTargetCollectionId: getAliasTargetCollectionId(t.$value, pathToCollectionId),
      };
    }
    const resolved = resolveTokenValue(t.$value, t.$type, allTokensFlat);
    return {
      ...t,
      $value: resolved.value ?? t.$value,
      $type: resolved.$type,
    };
  });
}

function buildVariablePreviewTokens({
  rawTokens,
  collection,
  collectionId,
  collectionMap,
  modeMap,
  allTokensFlat,
  pathToCollectionId,
}: {
  rawTokens: RawVariablePreviewToken[];
  collection: TokenCollection | undefined;
  collectionId: string;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
}): VariablePreviewToken[] {
  const targets = buildStandardVariablePublishTargets({
    currentCollectionId: collectionId,
    collection,
    collectionMap,
    modeMap,
  });
  const rawEntries: RawVariablePreviewToken[] = [];

  for (const token of rawTokens) {
    const modeValues = collection
      ? readTokenModeValuesForCollection(token, collection)
      : {};

    for (const target of targets) {
      const targetModeValue = target.sourceModeName
        ? modeValues[target.sourceModeName]
        : undefined;
      const modeValue =
        targetModeValue !== undefined
          ? targetModeValue
          : token.$value;

      if (modeValue === undefined) {
        continue;
      }

      const extensions = token.$scopes?.length
        ? { ...token.$extensions, "com.figma.scopes": token.$scopes }
        : token.$extensions;

      rawEntries.push({
        ...token,
        $value: modeValue as TokenValue | TokenReference,
        collectionId,
        figmaCollection: target.collectionName,
        figmaMode: target.modeName,
        $extensions: extensions,
      });
    }
  }

  return resolveFlat(rawEntries, allTokensFlat, pathToCollectionId);
}

function summarizeVariablePreviewDiff({
  flat,
  figmaCollections,
  collection,
  collectionId,
  collectionMap,
  modeMap,
}: {
  flat: VariablePreviewToken[];
  figmaCollections: VariablesReadMessage["collections"];
  collection: TokenCollection | undefined;
  collectionId: string;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
}): Pick<VariableDiffPendingState, "added" | "modified" | "unchanged"> {
  const targets = buildStandardVariablePublishTargets({
    currentCollectionId: collectionId,
    collection,
    collectionMap,
    modeMap,
  });
  const totals = { added: 0, modified: 0, unchanged: 0 };

  for (const target of targets) {
    const localTokens = flat.filter(
      (token) =>
        token.figmaCollection === target.collectionName &&
        token.figmaMode === target.modeName,
    );
    if (localTokens.length === 0) {
      continue;
    }
    const figmaTokens = selectVariableModeTokens(
      figmaCollections,
      target.collectionName,
      target.modeName,
    );
    const summary = summarizeVariableDiff(localTokens, figmaTokens);
    totals.added += summary.added;
    totals.modified += summary.modified;
    totals.unchanged += summary.unchanged;
  }

  return totals;
}

interface ApplyOperationsConfig {
  tokens: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  collectionId: string;
  collections: TokenCollection[];
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
    const pathToCollectionId = buildPathCollectionIndex(perCollectionFlat, collectionId);
    const collection = collections.find((entry) => entry.id === collectionId);
    const flat = buildVariablePreviewTokens({
      rawTokens: flattenTokens(tokens, collectionId),
      collection,
      collectionId,
      collectionMap,
      modeMap,
      allTokensFlat,
      pathToCollectionId,
    });
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
      const summary = summarizeVariablePreviewDiff({
        flat,
        figmaCollections,
        collection,
        collectionId,
        collectionMap,
        modeMap,
      });
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
    collections,
    perCollectionFlat,
    collectionMap,
    modeMap,
    setVarDiffLoading,
    setVarDiffPending,
    varReadPendingRef,
    onError,
  ]);

  const handleApplyStyles = useCallback(async () => {
    setApplying(true);
    const flat = resolveFlat(
      flattenTokens(tokens, collectionId),
      allTokensFlat,
      buildPathCollectionIndex(perCollectionFlat, collectionId),
    );
    try {
      const result = await sendStyleApply("apply-styles", {
        tokens: buildStylePublishTokens({
          targets: flat
            .filter((token) =>
              token.$type === "color" ||
              token.$type === "gradient" ||
              token.$type === "typography" ||
              token.$type === "shadow",
            )
            .map((token) => ({
              path: token.path,
              collectionId,
            })),
          collections,
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
