import { AlertTriangle, RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";
import type { LintViolation } from "../../hooks/useLint";
import { TokenEditorLintBanner } from "../token-editor/TokenEditorLintBanner";

type DependentToken = {
  path: string;
  collectionId: string;
};

interface TokenDetailsStatusBannersProps {
  displayError: string | null;
  retryAction?: ReactNode;
  lintViolations: LintViolation[];
  lifecycle: "draft" | "published" | "deprecated";
  isCreateMode: boolean;
  isEditMode: boolean;
  pendingTypeChange: string | null;
  tokenType: string;
  dependents: DependentToken[];
  showPendingDependents: boolean;
  ownerCollectionId: string;
  tokenPath: string;
  onDismissTypeChange: () => void;
  onApplyTypeChange: () => void;
  onTogglePendingDependents: () => void;
  onNavigateToToken?: (
    path: string,
    fromPath?: string,
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
  dependents,
  showPendingDependents,
  ownerCollectionId,
  tokenPath,
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
              The current value will reset to the default for that token type.
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
                  <div className="tm-token-details__list-box">
                    {dependents.slice(0, 20).map((dep) =>
                      onNavigateToToken ? (
                        <button
                          key={dep.path}
                          type="button"
                          onClick={() =>
                            onNavigateToToken(
                              dep.path,
                              tokenPath,
                              dep.collectionId,
                            )
                          }
                          className="tm-token-details__list-row"
                          title={`Open ${dep.path}`}
                        >
                          <span className="tm-token-details__mono">{dep.path}</span>
                          {dep.collectionId !== ownerCollectionId ? (
                            <span className="tm-token-details__mini-tag">{dep.collectionId}</span>
                          ) : null}
                        </button>
                      ) : (
                        <div key={dep.path} className="tm-token-details__list-row">
                          <span className="tm-token-details__mono">{dep.path}</span>
                          {dep.collectionId !== ownerCollectionId ? (
                            <span className="tm-token-details__mini-tag">{dep.collectionId}</span>
                          ) : null}
                        </div>
                      ),
                    )}
                    {dependents.length > 20 ? (
                      <div className="tm-token-details__list-note">
                        and {dependents.length - 20} more…
                      </div>
                    ) : null}
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
