import { AlertTriangle, RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";
import type { TokenLifecycle } from "@token-workshop/core";
import type { LintViolation } from "../../hooks/useLint";
import { ListItem, Stack } from "../../primitives";
import { TokenEditorLintBanner } from "../token-editor/TokenEditorLintBanner";

type DependentToken = {
  path: string;
  collectionId: string;
};

interface TokenDetailsStatusBannersProps {
  displayError: string | null;
  retryAction?: ReactNode;
  lintViolations: LintViolation[];
  lifecycle: TokenLifecycle;
  isCreateMode: boolean;
  isEditMode: boolean;
  pendingTypeChange: string | null;
  tokenType: string;
  modeValueCount: number;
  dependents: DependentToken[];
  showPendingDependents: boolean;
  ownerCollectionId: string;
  onDismissTypeChange: () => void;
  onApplyTypeChange: () => void;
  onTogglePendingDependents: () => void;
  onNavigateToToken?: (
    path: string,
    collectionId?: string,
  ) => void;
}

export function TokenDetailsStatusBanners({
  displayError,
  retryAction,
  lintViolations,
  lifecycle,
  isCreateMode,
  isEditMode,
  pendingTypeChange,
  tokenType,
  modeValueCount,
  dependents,
  showPendingDependents,
  ownerCollectionId,
  onDismissTypeChange,
  onApplyTypeChange,
  onTogglePendingDependents,
  onNavigateToToken,
}: TokenDetailsStatusBannersProps) {
  const lifecycleMessage =
    !isCreateMode && lifecycle === "draft"
      ? {
          tone: "warning" as const,
          title: "Draft token",
          description: "This token is still marked draft.",
        }
      : !isCreateMode && lifecycle === "deprecated"
        ? {
            tone: "muted" as const,
            title: "Deprecated token",
            description: "This token is kept for reference and should be phased out.",
          }
        : null;

  return (
    <>
      {displayError ? (
        <div className="tm-token-details__banner tm-token-details__banner--error" role="alert">
          <div className="tm-token-details__banner-copy">
            <div className="tm-token-details__banner-title">Could not save changes</div>
            <div className="tm-token-details__banner-description">{displayError}</div>
          </div>
          {retryAction ? <div className="tm-token-details__banner-actions">{retryAction}</div> : null}
        </div>
      ) : null}

      {lifecycleMessage ? (
        <div
          className={`tm-token-details__banner tm-token-details__banner--${lifecycleMessage.tone}`}
        >
          <div className="tm-token-details__banner-copy">
            <div className="tm-token-details__banner-title">{lifecycleMessage.title}</div>
            <div className="tm-token-details__banner-description">
              {lifecycleMessage.description}
            </div>
          </div>
        </div>
      ) : null}

      {lintViolations.length > 0 ? <TokenEditorLintBanner lintViolations={lintViolations} /> : null}

      {isEditMode && pendingTypeChange ? (
        <div className="tm-token-details__banner tm-token-details__banner--warning">
          <div className="tm-token-details__banner-copy">
            <div className="tm-token-details__banner-title">
              Switch to {pendingTypeChange}?
            </div>
            <div className="tm-token-details__banner-description">
              {modeValueCount > 1
                ? `All ${modeValueCount} mode values will reset to the default for that token type.`
                : "This mode value will reset to the default for that token type."}
            </div>
            {dependents.length > 0 ? (
              <div className="tm-token-details__dependent-warning">
                <button
                  type="button"
                  onClick={onTogglePendingDependents}
                  className="tm-token-details__inline-button"
                >
                  <AlertTriangle size={11} strokeWidth={1.7} aria-hidden />
                  {dependents.length} dependent token
                  {dependents.length !== 1 ? "s" : ""} may break
                </button>
                {showPendingDependents ? (
                  <div className="tm-token-details__dependent-list">
                    <Stack gap={1} className="p-1.5">
                      {dependents.slice(0, 20).map((dep) => {
                        const tag =
                          dep.collectionId !== ownerCollectionId ? (
                            <span className="tm-token-details__mini-tag">{dep.collectionId}</span>
                          ) : null;
                        return (
                          <ListItem
                            key={dep.path}
                            onClick={onNavigateToToken ? () => onNavigateToToken(dep.path, dep.collectionId) : undefined}
                            title={onNavigateToToken ? `Open ${dep.path}` : undefined}
                            trailing={tag}
                          >
                            <span className="tm-token-details__mono">{dep.path}</span>
                          </ListItem>
                        );
                      })}
                      {dependents.length > 20 ? (
                        <div className="tm-token-details__list-note">
                          and {dependents.length - 20} more…
                        </div>
                      ) : null}
                    </Stack>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="tm-token-details__banner-actions tm-token-details__banner-actions--split">
            <button
              type="button"
              onClick={onDismissTypeChange}
              className="tm-token-details__secondary-button"
            >
              Keep {tokenType}
            </button>
            <button
              type="button"
              onClick={onApplyTypeChange}
              className="tm-token-details__primary-button tm-token-details__primary-button--warning"
            >
              <RefreshCcw size={11} strokeWidth={1.7} aria-hidden />
              Switch type
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
