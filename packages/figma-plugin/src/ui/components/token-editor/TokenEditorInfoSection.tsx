import { resolveRefValue } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import type {
  TokenDependencyNode,
  TokenDependencySnapshot,
} from "../TokenFlowPanel";
import type { TokenRecipe } from "../../hooks/useRecipes";
import { TokenUsages } from "../TokenUsages";
import { TokenHistorySection } from "../TokenHistorySection";
import { LONG_TEXT_CLASSES } from "../../shared/longTextStyles";
import { TokenStateSummary } from "./TokenStateSummary";

export interface TokenEditorInfoSectionProps {
  tokenPath: string;
  collectionId: string;
  serverUrl: string;
  tokenType: string;
  value: any;
  scopes: string[];
  lifecycle: "draft" | "published" | "deprecated";
  provenance: string | null;
  aliasPath: string | null;
  extendsPath: string | null;
  isDirty: boolean;
  aliasMode: boolean;
  // Dependency data
  referenceTrace: TokenDependencyNode[];
  dependentTrace: TokenDependencyNode[];
  dependencySnapshot: TokenDependencySnapshot | null;
  dependents: Array<{ path: string; collectionId: string }>;
  dependentsLoading: boolean;
  colorFlatMap: Record<string, unknown>;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  initialValue: any | undefined;
  activeProducingRecipe: TokenRecipe | null;
  existingRecipesForToken: TokenRecipe[];
  // UI state
  infoTab: 'dependencies' | 'usage' | 'history' | null;
  onInfoTabChange: (tab: 'dependencies' | 'usage' | 'history') => void;
  refsExpanded: boolean;
  onRefsExpandedChange: (v: boolean) => void;
  // Navigation
  onShowReferences?: (path: string) => void;
  onNavigateToToken?: (path: string, fromPath?: string) => void;
  onNavigateToGeneratedGroup?: (recipeId: string) => void;
}

export function TokenEditorInfoSection({
  tokenPath,
  collectionId,
  serverUrl,
  tokenType,
  value,
  scopes,
  lifecycle,
  provenance,
  aliasPath,
  extendsPath,
  isDirty,
  aliasMode,
  referenceTrace,
  dependentTrace,
  dependencySnapshot,
  dependents,
  dependentsLoading,
  colorFlatMap,
  allTokensFlat,
  pathToCollectionId,
  initialValue,
  activeProducingRecipe,
  existingRecipesForToken,
  infoTab,
  onInfoTabChange,
  refsExpanded,
  onRefsExpandedChange,
  onShowReferences,
  onNavigateToToken,
  onNavigateToGeneratedGroup,
}: TokenEditorInfoSectionProps) {
  return (
    <div className="mt-1 border-t border-[var(--color-figma-border)] pt-2">
      <TokenStateSummary
        tokenType={tokenType}
        scopes={scopes}
        lifecycle={lifecycle}
        provenance={provenance}
        aliasPath={aliasPath}
        aliasCollectionId={
          aliasPath ? (pathToCollectionId[aliasPath] ?? null) : null
        }
        extendsPath={extendsPath}
        extendsCollectionId={
          extendsPath ? (pathToCollectionId[extendsPath] ?? null) : null
        }
        sourceRecipes={existingRecipesForToken}
        generatedRecipe={activeProducingRecipe}
        onNavigateToPath={
          onNavigateToToken
            ? (path) => onNavigateToToken(path, tokenPath)
            : undefined
        }
        onNavigateToGeneratedGroup={onNavigateToGeneratedGroup}
      />

      <div className="flex gap-0.5">
        {[
          { key: 'dependencies' as const, label: 'Dependencies', count: referenceTrace.length + dependentTrace.length },
          { key: 'usage' as const, label: 'Usage' },
          { key: 'history' as const, label: 'History' },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => onInfoTabChange(key)}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              infoTab === key
                ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            {label}{count ? ` (${count})` : ''}
          </button>
        ))}
      </div>

      {infoTab === 'dependencies' && (
        <div className="flex flex-col gap-1.5 mt-2">
          <div className="flex items-center justify-between gap-2">
            {onShowReferences && (
              <button
                type="button"
                onClick={() => onShowReferences(tokenPath)}
                className="flex items-center gap-1 text-[10px] text-[var(--color-figma-accent)] hover:underline transition-colors"
                title="Open graph"
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
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
                </svg>
                Open graph
              </button>
            )}
          </div>

          {dependencySnapshot?.hasCycles && (
            <div className="rounded border border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/10 px-2 py-1.5 text-[10px] text-[var(--color-figma-error)]">
              Circular reference detected.
            </div>
          )}

          {/* Outgoing: walk the full reference chain inline */}
          {referenceTrace.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-60">
                References
              </span>
              {referenceTrace.slice(0, 8).map((node) => {
                const resolvedColor =
                  node.$type === "color"
                    ? resolveRefValue(node.path, colorFlatMap)
                    : null;
                return (
                  <button
                    key={node.path}
                    type="button"
                    onClick={() =>
                      onNavigateToToken?.(node.path, tokenPath)
                    }
                    disabled={!onNavigateToToken}
                    className="flex items-center gap-1.5 px-1.5 py-1 rounded text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:cursor-default group"
                    title={
                      onNavigateToToken
                        ? `Navigate to ${node.path}`
                        : node.path
                    }
                    style={{
                      paddingLeft: `${6 + Math.max(0, node.depth - 1) * 12}px`,
                    }}
                  >
                    <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                      {node.depth === 1 ? "Direct" : `+${node.depth - 1}`}
                    </span>
                    {resolvedColor ? (
                      <span
                        className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                        style={{ backgroundColor: resolvedColor }}
                      />
                    ) : (
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
                        className="shrink-0 opacity-40"
                      >
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    )}
                    <span className={`${LONG_TEXT_CLASSES.mono} flex-1 text-[var(--color-figma-accent)] group-hover:underline`}>
                      {node.path}
                    </span>
                    {node.collectionId && node.collectionId !== collectionId && (
                      <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                        {node.collectionId}
                      </span>
                    )}
                    {onNavigateToToken && (
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className="shrink-0 opacity-0 group-hover:opacity-50 transition-opacity"
                      >
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
              {referenceTrace.length > 8 && (
                <div className="px-1.5 pt-0.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                  + {referenceTrace.length - 8} more
                </div>
              )}
            </div>
          )}

          {/* Incoming: direct and downstream impact */}
          {(dependentsLoading || dependentTrace.length > 0) && (
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => onRefsExpandedChange(!refsExpanded)}
                disabled={
                  dependentsLoading ? false : dependentTrace.length === 0
                }
                className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] opacity-60 hover:opacity-100 transition-opacity disabled:cursor-default"
              >
                {dependentsLoading ? (
                  <span>&larr; Loading…</span>
                ) : (
                  <>
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="currentColor"
                      className={`transition-transform shrink-0 ${refsExpanded ? "rotate-90" : ""}`}
                      aria-hidden="true"
                    >
                      <path d="M2 1l4 3-4 3V1z" />
                    </svg>
                    Dependents ({dependentTrace.length})
                  </>
                )}
              </button>
              {refsExpanded && dependentTrace.length > 0 && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {dependentTrace.slice(0, 20).map((dep) => {
                    const depColor =
                      dep.$type === "color"
                        ? resolveRefValue(dep.path, colorFlatMap)
                        : null;
                    return (
                      <button
                        key={dep.path}
                        type="button"
                        onClick={() =>
                          onNavigateToToken?.(dep.path, tokenPath)
                        }
                        disabled={!onNavigateToToken}
                        className="flex items-center gap-1.5 px-1.5 py-1 rounded text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:cursor-default group"
                        title={
                          onNavigateToToken
                            ? `Navigate to ${dep.path}`
                            : dep.path
                        }
                        style={{
                          paddingLeft: `${6 + Math.max(0, dep.depth - 1) * 12}px`,
                        }}
                      >
                        <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                          {dep.depth === 1
                            ? "Direct"
                            : `+${dep.depth - 1}`}
                        </span>
                        {depColor ? (
                          <span
                            className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                            style={{ backgroundColor: depColor }}
                          />
                        ) : (
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
                            className="shrink-0 opacity-40"
                          >
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                        )}
                        <span className={`${LONG_TEXT_CLASSES.monoPrimary} flex-1 group-hover:underline`}>
                          {dep.path}
                        </span>
                        {dep.collectionId && dep.collectionId !== collectionId && (
                          <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                            {dep.collectionId}
                          </span>
                        )}
                        {onNavigateToToken && (
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                            className="shrink-0 opacity-0 group-hover:opacity-50 transition-opacity"
                          >
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                  {dependentTrace.length > 20 && (
                    <div className="px-1.5 pt-0.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                      + {dependentTrace.length - 20} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {infoTab === 'usage' && (
        <div className="mt-2">
          <TokenUsages
            dependents={dependents}
            dependentsLoading={dependentsLoading}
            collectionId={collectionId}
            tokenPath={tokenPath}
            tokenType={tokenType}
            value={value}
            isDirty={isDirty}
            aliasMode={aliasMode}
            allTokensFlat={allTokensFlat}
            colorFlatMap={colorFlatMap}
            pathToCollectionId={pathToCollectionId}
            initialValue={initialValue}
            producingRecipe={activeProducingRecipe}
            sourceRecipes={existingRecipesForToken}
            onNavigateToToken={onNavigateToToken}
            onShowReferences={onShowReferences}
            onNavigateToGeneratedGroup={onNavigateToGeneratedGroup}
          />
        </div>
      )}

      {infoTab === 'history' && (
        <div className="mt-2">
          <TokenHistorySection
            tokenPath={tokenPath}
            serverUrl={serverUrl}
            tokenType={tokenType}
          />
        </div>
      )}
    </div>
  );
}
