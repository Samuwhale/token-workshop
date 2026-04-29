import { QUERY_QUALIFIERS } from "../tokenListUtils";
import type { PromoteRow } from "../tokenListTypes";
import type { RelocateConflictAction } from "../../hooks/useTokenRelocate";
import type { FilterBuilderSection } from "../TokenSearchFilterBuilder";
import type { VariableDiffPendingState } from "../../shared/tokenListModalTypes";
import {
  ReviewPanelOverlay,
  VariableDiffReviewPanel,
  PromoteReviewPanel,
  RelocateTokenReviewPanel,
} from "../ContextualReviewPanel";
import { FeedbackPlaceholder } from "../FeedbackPlaceholder";

type ReviewOverlaysProps = {
  showBatchEditor: boolean;
  varDiffPending: VariableDiffPendingState | null;
  onCloseVarDiff: () => void;
  onApplyVarDiff: () => void;
  promoteRows: PromoteRow[] | null;
  promoteBusy: boolean;
  onPromoteRowsChange: (rows: PromoteRow[] | null) => void;
  onConfirmPromote: () => void;
  onClosePromote: () => void;
  movingToken: string | null;
  collectionId: string;
  collectionIds: string[];
  moveTokenTargetCollectionId: string;
  onChangeMoveTokenTargetCollection: (collectionId: string) => void;
  moveConflict: Parameters<typeof RelocateTokenReviewPanel>[0]["conflict"];
  moveConflictAction: RelocateConflictAction;
  onMoveConflictActionChange: (action: RelocateConflictAction) => void;
  moveConflictNewPath: string;
  onMoveConflictNewPathChange: (path: string) => void;
  moveSourceToken: Parameters<typeof RelocateTokenReviewPanel>[0]["sourceToken"];
  onConfirmMoveToken: () => void;
  onCloseMove: () => void;
  copyingToken: string | null;
  copyTokenTargetCollectionId: string;
  onChangeCopyTokenTargetCollection: (collectionId: string) => void;
  copyConflict: Parameters<typeof RelocateTokenReviewPanel>[0]["conflict"];
  copyConflictAction: RelocateConflictAction;
  onCopyConflictActionChange: (action: RelocateConflictAction) => void;
  copyConflictNewPath: string;
  onCopyConflictNewPathChange: (path: string) => void;
  copySourceToken: Parameters<typeof RelocateTokenReviewPanel>[0]["sourceToken"];
  onConfirmCopyToken: () => void;
  onCloseCopy: () => void;
};

export function TokenListReviewOverlays({
  showBatchEditor,
  varDiffPending,
  onCloseVarDiff,
  onApplyVarDiff,
  promoteRows,
  promoteBusy,
  onPromoteRowsChange,
  onConfirmPromote,
  onClosePromote,
  movingToken,
  collectionId,
  collectionIds,
  moveTokenTargetCollectionId,
  onChangeMoveTokenTargetCollection,
  moveConflict,
  moveConflictAction,
  onMoveConflictActionChange,
  moveConflictNewPath,
  onMoveConflictNewPathChange,
  moveSourceToken,
  onConfirmMoveToken,
  onCloseMove,
  copyingToken,
  copyTokenTargetCollectionId,
  onChangeCopyTokenTargetCollection,
  copyConflict,
  copyConflictAction,
  onCopyConflictActionChange,
  copyConflictNewPath,
  onCopyConflictNewPathChange,
  copySourceToken,
  onConfirmCopyToken,
  onCloseCopy,
}: ReviewOverlaysProps) {
  return (
    <>
      {!showBatchEditor && varDiffPending && (
        <ReviewPanelOverlay onClose={onCloseVarDiff}>
          <VariableDiffReviewPanel
            pending={varDiffPending}
            onApply={onApplyVarDiff}
            onClose={onCloseVarDiff}
          />
        </ReviewPanelOverlay>
      )}

      {!showBatchEditor && promoteRows !== null && (
        <ReviewPanelOverlay onClose={onClosePromote}>
          <PromoteReviewPanel
            rows={promoteRows}
            busy={promoteBusy}
            onRowsChange={onPromoteRowsChange}
            onConfirm={onConfirmPromote}
            onClose={onClosePromote}
          />
        </ReviewPanelOverlay>
      )}

      {!showBatchEditor && movingToken && (
        <ReviewPanelOverlay onClose={onCloseMove}>
          <RelocateTokenReviewPanel
            mode="move"
            tokenPath={movingToken}
            collectionId={collectionId}
            collectionIds={collectionIds}
            targetCollectionId={moveTokenTargetCollectionId}
            onTargetCollectionChange={onChangeMoveTokenTargetCollection}
            conflict={moveConflict}
            conflictAction={moveConflictAction}
            onConflictActionChange={onMoveConflictActionChange}
            conflictNewPath={moveConflictNewPath}
            onConflictNewPathChange={onMoveConflictNewPathChange}
            sourceToken={moveSourceToken}
            onConfirm={onConfirmMoveToken}
            onClose={onCloseMove}
          />
        </ReviewPanelOverlay>
      )}

      {!showBatchEditor && copyingToken && (
        <ReviewPanelOverlay onClose={onCloseCopy}>
          <RelocateTokenReviewPanel
            mode="copy"
            tokenPath={copyingToken}
            collectionId={collectionId}
            collectionIds={collectionIds}
            targetCollectionId={copyTokenTargetCollectionId}
            onTargetCollectionChange={onChangeCopyTokenTargetCollection}
            conflict={copyConflict}
            conflictAction={copyConflictAction}
            onConflictActionChange={onCopyConflictActionChange}
            conflictNewPath={copyConflictNewPath}
            onConflictNewPathChange={onCopyConflictNewPathChange}
            sourceToken={copySourceToken}
            onConfirm={onConfirmCopyToken}
            onClose={onCloseCopy}
          />
        </ReviewPanelOverlay>
      )}
    </>
  );
}

type FilteredEmptyStateProps = {
  searchQuery: string;
  availableTypes: string[];
  typeFilter: string;
  connected: boolean;
  onClearFilters: () => void;
  onSetSearchQuery: (query: string) => void;
  onSetTypeFilter: (type: string) => void;
  onCreateNew?: (path: string) => void;
  onAddQueryQualifierValue: (key: FilterBuilderSection, value: string) => void;
  onInsertSearchQualifier: (section: FilterBuilderSection) => void;
};

export function TokenListFilteredEmptyState({
  searchQuery,
  availableTypes,
  typeFilter,
  connected,
  onClearFilters,
  onSetSearchQuery,
  onSetTypeFilter,
  onCreateNew,
  onAddQueryQualifierValue,
  onInsertSearchQualifier,
}: FilteredEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-3 text-[color:var(--color-figma-text-secondary)]">
      <FeedbackPlaceholder
        variant="no-results"
        size="section"
        className="w-full max-w-[260px]"
        title="No matches"
        secondaryAction={{
          label: "Clear",
          onClick: onClearFilters,
        }}
      />

      {searchQuery &&
        (() => {
          const q = searchQuery.trim();
          const qLower = q.toLowerCase();
          const suggestions: {
            label: string;
            icon: string;
            action: () => void;
          }[] = [];

          const looksLikePath =
            q.includes(".") && /^[a-zA-Z0-9._-]+$/.test(q);
          if (looksLikePath && connected) {
            suggestions.push({
              label: `Create "${q.split(".").pop() || q}"`,
              icon: "create",
              action: () => {
                onCreateNew?.(q);
              },
            });
          }

          if (
            !looksLikePath &&
            connected &&
            /^[a-zA-Z0-9_-]+$/.test(q)
          ) {
            suggestions.push({
              label: `Create "${q}"`,
              icon: "create",
              action: () => {
                onCreateNew?.(q);
              },
            });
          }

          const matchingType =
            availableTypes.find((type) => type.toLowerCase() === qLower) ||
            availableTypes.find((type) =>
              type.toLowerCase().startsWith(qLower),
            );
          if (matchingType && typeFilter !== matchingType) {
            suggestions.push({
              label: `Type: ${matchingType}`,
              icon: "filter",
              action: () => {
                onSetSearchQuery("");
                onSetTypeFilter(matchingType);
              },
            });
          }

          const looksLikeValue =
            /^#[0-9a-fA-F]{3,8}$/.test(q) ||
            /^\d+(\.\d+)?(px|rem|em|%)?$/.test(q);
          if (looksLikeValue) {
            suggestions.push({
              label: `Value: "${q}"`,
              icon: "value",
              action: () => {
                onAddQueryQualifierValue("value", q);
              },
            });
          }

          if (!q.includes(":")) {
            const sectionLabels: Record<FilterBuilderSection, string> = {
              type: "Type",
              has: "Token state",
              path: "Path",
              name: "Leaf name",
              value: "Value",
              desc: "Description",
              scope: "Can apply to",
            };
            const matchingSections = new Map<FilterBuilderSection, string>();
            for (const qualifier of QUERY_QUALIFIERS) {
              if (qualifier.key === "group") continue;
              if (
                qualifier.qualifier.toLowerCase().startsWith(qLower) ||
                qualifier.key.toLowerCase().startsWith(qLower) ||
                qualifier.desc.toLowerCase().includes(qLower)
              ) {
                matchingSections.set(
                  qualifier.key,
                  sectionLabels[qualifier.key],
                );
              }
            }
            for (const [sectionKey, label] of Array.from(
              matchingSections.entries(),
            ).slice(0, 2)) {
              suggestions.push({
                label: `${label} filter`,
                icon: "hint",
                action: () => onInsertSearchQualifier(sectionKey),
              });
            }
          }

          if (suggestions.length === 0) return null;

          return (
            <div className="mt-2 flex flex-col gap-0.5 w-full max-w-[300px]">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={suggestion.action}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-secondary text-left hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text-accent)] transition-colors"
                >
                  {suggestion.icon === "create" && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  )}
                  {suggestion.icon === "filter" && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                    </svg>
                  )}
                  {suggestion.icon === "value" && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                  )}
                  {suggestion.icon === "hint" && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16" />
                    </svg>
                  )}
                  <span className="truncate">{suggestion.label}</span>
                </button>
              ))}
            </div>
          );
        })()}
    </div>
  );
}
