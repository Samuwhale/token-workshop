import { useMemo } from "react";
import type { TokenMapEntry } from "../../shared/types";
import { createRecipeOwnershipKey, type TokenCollection } from "@tokenmanager/core";
import type { TokenRecipe } from "../hooks/useRecipes";
import type { LintViolation } from "../hooks/useLint";
import { TOKEN_TYPE_BADGE_CLASS } from "../../shared/types";
import { ValuePreview } from "./ValuePreview";
import {
  resolveTokenValue,
  isAlias,
  buildResolutionChain,
} from "../../shared/resolveAlias";
import { formatDisplayPath, formatValue } from "./tokenListUtils";
import { TokenHistorySection } from "./TokenHistorySection";
import { stableStringify } from "../shared/utils";
import { buildTokenDependencySnapshot } from "./TokenFlowPanel";
import { readTokenPresentationMetadata } from "../shared/tokenMetadata";
import { TokenStateSummary } from "./token-editor/TokenStateSummary";

interface TokenDetailPreviewProps {
  tokenPath: string;
  tokenName?: string;
  storageCollectionId: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  tokenUsageCounts?: Record<string, number>;
  recipes?: TokenRecipe[];
  recipesBySource?: Map<string, TokenRecipe[]>;
  derivedTokenPaths?: Map<string, TokenRecipe>;
  lintViolations?: LintViolation[];
  syncSnapshot?: Record<string, string>;
  /** Server URL for fetching token value history. When omitted, history section is hidden. */
  serverUrl?: string;
  onEdit: () => void;
  onClose: () => void;
  onNavigateToAlias?: (path: string) => void;
  onNavigateToRecipe?: (recipeId: string) => void;
}

export function TokenDetailPreview({
  tokenPath,
  tokenName,
  storageCollectionId,
  allTokensFlat,
  pathToCollectionId,
  tokenUsageCounts,
  recipes,
  recipesBySource,
  derivedTokenPaths,
  lintViolations = [],
  syncSnapshot,
  serverUrl,
  onEdit,
  onClose,
  onNavigateToAlias,
  onNavigateToRecipe,
}: TokenDetailPreviewProps) {
  const entry = allTokensFlat[tokenPath];
  const name = tokenName ?? tokenPath.split(".").pop() ?? tokenPath;
  const type = entry?.$type ?? "unknown";
  const rawValue = entry?.$value;

  const resolutionSteps = useMemo(() => {
    if (!rawValue || !isAlias(rawValue)) return null;
    return buildResolutionChain(
      tokenPath,
      rawValue,
      type,
      allTokensFlat,
      pathToCollectionId,
    );
  }, [tokenPath, rawValue, type, allTokensFlat, pathToCollectionId]);

  const resolved = useMemo(() => {
    if (!rawValue) return null;
    if (!isAlias(rawValue)) return null;
    const r = resolveTokenValue(String(rawValue), type, allTokensFlat);
    return r.error ? null : r;
  }, [rawValue, type, allTokensFlat]);

  const resolvedValue = resolved?.value ?? rawValue;

  const displayPath = useMemo(
    () => formatDisplayPath(tokenPath, name),
    [tokenPath, name],
  );

  const valueStr = useMemo(() => {
    if (rawValue == null) return "—";
    if (typeof rawValue === "object") return JSON.stringify(rawValue, null, 2);
    return String(rawValue);
  }, [rawValue]);

  const entryMeta = entry as TokenMapEntry & {
    $description?: string;
  };
  const dependencySnapshot = useMemo(
    () =>
      buildTokenDependencySnapshot(tokenPath, allTokensFlat, pathToCollectionId ?? {}),
    [tokenPath, allTokensFlat, pathToCollectionId],
  );
  const dependentNodes = dependencySnapshot?.dependentNodes ?? [];
  const directAliasPath =
    typeof rawValue === "string" && isAlias(rawValue)
      ? rawValue.slice(1, -1)
      : null;
  const sourceRecipes = useMemo(() => {
    if (recipesBySource) return recipesBySource.get(tokenPath) ?? [];
    return (recipes ?? []).filter(
      (recipe) => recipe.sourceToken === tokenPath,
    );
  }, [recipesBySource, recipes, tokenPath]);
  const derivedRecipe = derivedTokenPaths?.get(
    createRecipeOwnershipKey(
      pathToCollectionId?.[tokenPath] ?? storageCollectionId,
      tokenPath,
    ),
  );
  const tokenCollectionId =
    pathToCollectionId?.[tokenPath] ?? storageCollectionId;
  const usageCount = tokenUsageCounts?.[tokenPath] ?? 0;
  const presentation = readTokenPresentationMetadata(entry);
  const syncChanged = useMemo(() => {
    if (!syncSnapshot || !(tokenPath in syncSnapshot)) return false;
    return syncSnapshot[tokenPath] !== stableStringify(rawValue);
  }, [syncSnapshot, tokenPath, rawValue]);
  const lintTone = useMemo(() => {
    if (lintViolations.some((violation) => violation.severity === "error"))
      return "error";
    if (lintViolations.some((violation) => violation.severity === "warning"))
      return "warning";
    if (lintViolations.length > 0) return "info";
    return null;
  }, [lintViolations]);
  if (!entry) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-figma-border)]">
          <span className="text-[11px] font-semibold text-[var(--color-figma-text)] truncate">
            Token not found
          </span>
          <button
            onClick={onClose}
            className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
            title="Close"
            aria-label="Close"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-[10px] text-[var(--color-figma-text-tertiary)]">
          Token not found
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-figma-border)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--color-figma-text)] truncate mr-2">
          {name}
        </span>
        <button
          onClick={onClose}
          className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] shrink-0"
          title="Close"
          aria-label="Close"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Token path + type */}
        <div className="px-3 pt-1.5 pb-1.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ValuePreview type={type} value={resolvedValue} />
            <div
              className="text-[10px] text-[var(--color-figma-text-tertiary)] font-mono truncate flex-1 min-w-0"
              title={tokenPath}
            >
              {displayPath}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`px-1 py-0.5 rounded text-[8px] font-medium ${TOKEN_TYPE_BADGE_CLASS[type] ?? "token-type-string"}`}
            >
              {type}
            </span>
            <span className="text-[8px] text-[var(--color-figma-text-tertiary)]">
              {tokenCollectionId}
            </span>
          </div>
          {(lintViolations.length > 0 || syncChanged) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {lintViolations.length > 0 && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                    lintTone === "error"
                      ? "bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]"
                      : lintTone === "warning"
                        ? "bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-warning)]"
                        : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                  }`}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                  </svg>
                  {lintViolations.length === 1
                    ? "1 issue"
                    : `${lintViolations.length} issues`}
                </span>
              )}
              {syncChanged && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-figma-warning)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-warning)]">
                  <span
                    className="h-2 w-2 rounded-full bg-current"
                    aria-hidden="true"
                  />
                  Unsynced
                </span>
              )}
            </div>
          )}
        </div>

        {lintViolations.length > 0 && (
          <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)]">
            <div className="flex flex-col gap-1.5">
              {lintViolations.map((violation, index) => (
                <div
                  key={`${violation.path}-${violation.message}-${index}`}
                  className={`rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 border-l-2 ${
                    violation.severity === "error"
                      ? "border-l-[var(--color-figma-error)]"
                      : violation.severity === "warning"
                        ? "border-l-[var(--color-figma-warning)]"
                        : "border-l-[var(--color-figma-text-tertiary)]"
                  }`}
                >
                  <div className="text-[10px] text-[var(--color-figma-text)]">
                    {violation.message}
                  </div>
                  {violation.suggestion && (
                    <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                      {violation.suggestion}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-3 pt-2 pb-1.5">
          <div className="flex flex-col gap-2">
            <TokenStateSummary
              tokenType={type}
              scopes={presentation.scopes}
              lifecycle={presentation.lifecycle}
              provenance={presentation.provenance}
              aliasPath={directAliasPath}
              extendsPath={presentation.extendsPath}
              sourceRecipes={sourceRecipes}
              generatedRecipe={derivedRecipe ?? null}
              usageCount={usageCount}
              onNavigateToPath={onNavigateToAlias}
              onNavigateToRecipe={onNavigateToRecipe}
              onHighlightUsage={
                usageCount > 0
                  ? () => {
                      parent.postMessage(
                        {
                          pluginMessage: {
                            type: "highlight-layer-by-token",
                            tokenPath,
                          },
                        },
                        "*",
                      );
                    }
                  : undefined
              }
            />
            {entryMeta.$description && (
              <div className="text-[10px] text-[var(--color-figma-text)] whitespace-pre-wrap break-words">
                {entryMeta.$description}
              </div>
            )}
          </div>
        </div>

        {/* Value section */}
        <div className="px-3 pt-1.5 pb-1">
          <div className="text-[10px] font-mono text-[var(--color-figma-text)] break-all whitespace-pre-wrap bg-[var(--color-figma-bg-secondary)] rounded px-2 py-1.5 max-h-24 overflow-y-auto">
            {valueStr}
          </div>
        </div>

        {/* Inline dependency trace */}
        {((resolutionSteps && resolutionSteps.length >= 2) ||
          dependentNodes.length > 0 ||
          dependencySnapshot?.hasCycles) && (
          <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)]">
            {dependencySnapshot?.hasCycles && (
              <div className="mb-2 rounded border border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/10 px-2 py-1.5 text-[10px] text-[var(--color-figma-error)]">
                Circular alias detected. Open the full graph to debug.
              </div>
            )}

            {resolutionSteps && resolutionSteps.length >= 2 && (
              <div className="mb-2">
                <div className="text-[9px] font-semibold text-[var(--color-figma-text-tertiary)] mb-1">
                  Resolves to
                </div>
                {(() => {
                  const first = resolutionSteps[0];
                  const last = resolutionSteps[resolutionSteps.length - 1];
                  const middleCount = resolutionSteps.length - 2;
                  const isConcrete = !last.isError && last.value != null && !isAlias(last.value);
                  return (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)] shrink-0" />
                        <span className="text-[10px] font-mono text-[var(--color-figma-accent)] truncate">
                          {first.path}
                        </span>
                      </div>
                      {middleCount > 0 && (
                        <div className="flex items-center gap-1.5 pl-0.5">
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--color-figma-text-tertiary)] shrink-0" aria-hidden="true">
                            <path d="M4 0v4M1 4l3 4 3-4" />
                          </svg>
                          <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                            via {middleCount} alias{middleCount !== 1 ? "es" : ""}
                          </span>
                        </div>
                      )}
                      <div className="flex items-start gap-1.5 pl-0.5">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--color-figma-text-tertiary)] shrink-0 mt-0.5" aria-hidden="true">
                          <path d="M4 0v4M1 4l3 4 3-4" />
                        </svg>
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <button
                            className={`text-[10px] font-mono truncate text-left ${last.isError ? "text-[var(--color-figma-error)]" : "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:underline"}`}
                            onClick={() => !last.isError && onNavigateToAlias?.(last.path)}
                            title={last.isError ? last.errorMsg : last.path}
                          >
                            {last.path}
                          </button>
                          <div className="flex items-center gap-1 flex-wrap">
                            {isConcrete && (
                              <span className="flex items-center gap-1">
                                <ValuePreview type={last.$type} value={last.value} />
                                <span className="text-[10px] font-mono text-[var(--color-figma-text)] font-medium">
                                  {formatValue(last.$type, last.value)}
                                </span>
                              </span>
                            )}
                            {last.isError && (
                              <span className="text-[8px] text-[var(--color-figma-error)] italic">
                                {last.errorMsg}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {dependentNodes.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-[9px] font-semibold text-[var(--color-figma-text-tertiary)] mb-0.5">
                  Used by {dependentNodes.length}
                </div>
                <div className="flex flex-col gap-1">
                  {dependentNodes.slice(0, 6).map((node) => (
                    <button
                      key={node.path}
                      onClick={() => onNavigateToAlias?.(node.path)}
                      className="flex items-center gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-left hover:border-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)]"
                      style={{
                        marginLeft: `${Math.max(0, node.depth - 1) * 10}px`,
                      }}
                      title={node.path}
                    >
                      {node.depth > 1 && (
                        <span className="rounded bg-[var(--color-figma-bg-hover)] px-1 py-px text-[8px] font-medium text-[var(--color-figma-text-tertiary)]">
                          +{node.depth - 1}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 font-mono text-[10px] text-[var(--color-figma-text)] truncate">
                        {formatDisplayPath(
                          node.path,
                          node.path.split(".").pop() ?? node.path,
                        )}
                      </span>
                      {node.collectionId &&
                        node.collectionId !== storageCollectionId && (
                        <span className="shrink-0 rounded bg-[var(--color-figma-bg-hover)] px-1 py-px text-[8px] text-[var(--color-figma-text-secondary)]">
                          {node.collectionId}
                        </span>
                      )}
                    </button>
                  ))}
                  {dependentNodes.length > 6 && (
                    <div className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                      + {dependentNodes.length - 6} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Large visual preview for color tokens */}
        {type === "color" && typeof resolvedValue === "string" && (
          <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)]">
            <div
              className="w-full h-10 rounded border border-[var(--color-figma-border)]"
              style={{ backgroundColor: resolvedValue }}
            />
          </div>
        )}

        {/* Typography preview */}
        {type === "typography" &&
          typeof resolvedValue === "object" &&
          resolvedValue !== null &&
          (() => {
            const tv = resolvedValue as Record<string, unknown>;
            const fontSize = tv.fontSize as
              | { value: number; unit: string }
              | string
              | undefined;
            const lineHeight = tv.lineHeight as
              | { value: number; unit: string }
              | string
              | undefined;
            return (
              <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)]">
                <div
                  className="p-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden"
                  style={{
                    fontFamily: (tv.fontFamily as string) || "inherit",
                    fontWeight: (tv.fontWeight as number) || 400,
                    fontSize:
                      typeof fontSize === "object" && fontSize
                        ? `${fontSize.value}${fontSize.unit}`
                        : fontSize
                          ? `${fontSize}px`
                          : "14px",
                    lineHeight: lineHeight
                      ? typeof lineHeight === "object"
                        ? `${lineHeight.value}${lineHeight.unit}`
                        : String(lineHeight)
                      : undefined,
                  }}
                >
                  Aa Bb 123
                </div>
              </div>
            );
          })()}
        {/* Value history */}
        {serverUrl && (
          <TokenHistorySection
            tokenPath={tokenPath}
            serverUrl={serverUrl}
            tokenType={type}
          />
        )}
      </div>

      {/* Footer actions */}
      <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] shrink-0 flex gap-1.5">
        <button
          onClick={onEdit}
          className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
        >
          Edit
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(tokenPath);
          }}
          className="px-2 py-1.5 rounded text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        >
          Path
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(valueStr);
          }}
          className="px-2 py-1.5 rounded text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        >
          Value
        </button>
      </div>
    </div>
  );
}
