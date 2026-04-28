import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NoticeBanner } from "../shared/noticeSystem";
import { QuickStartWizard } from "./QuickStartWizard";

export type StartHereBranch = "root" | "start-new";

type StartHereBranchCopy = {
  title: string;
  description: string;
};

const START_HERE_BRANCH_COPY: Record<StartHereBranch, StartHereBranchCopy> = {
  root: {
    title: "Bring tokens into this file",
    description: "Start a collection, import an existing library, or turn your current selection into tokens.",
  },
  "start-new": {
    title: "Start a token library",
    description: "Create a collection, set its first mode, and start authoring tokens.",
  },
};

function getStartHereBranchCopy(branch: StartHereBranch): StartHereBranchCopy {
  return START_HERE_BRANCH_COPY[branch];
}

interface WelcomePromptProps {
  connected: boolean;
  checking?: boolean;
  serverUrl: string;
  currentCollectionId: string;
  collectionIds: string[];
  initialBranch?: StartHereBranch;
  onRetryConnection?: () => void;
  onClose: () => void;
  onImportExistingSystem: () => void;
  onStartFromSelection: () => void;
  onAuthorFirstToken?: () => void;
  onOpenGraph?: () => void;
  onGuidedSetupComplete: () => void;
  onCollectionCreated?: (name: string) => void;
}

interface ActionRowProps {
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
  emphasized?: boolean;
}

function ActionRow({
  title,
  description,
  disabled = false,
  onClick,
  icon,
  emphasized = false,
}: ActionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "w-full flex items-start gap-3 text-left transition-colors disabled:opacity-50",
        emphasized
          ? "border-t-0 px-0 pb-2.5 pt-0"
          : "border-t border-[var(--color-figma-border)] px-0 py-2.5 first:border-t-0 first:pt-0 last:pb-0",
      ].join(" ")}
    >
      <span
        className={[
          "mt-0.5 shrink-0",
          emphasized
            ? "text-[var(--color-figma-accent)]"
            : "text-[var(--color-figma-text-secondary)]",
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={[
            "text-body font-medium block",
            emphasized
              ? "text-[var(--color-figma-accent)]"
              : "text-[var(--color-figma-text)]",
          ].join(" ")}
        >
          {title}
        </span>
        <span className="mt-0.5 text-secondary leading-relaxed text-[var(--color-figma-text-secondary)] block">
          {description}
        </span>
      </span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 mt-0.5 text-[var(--color-figma-text-tertiary)]"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

export function WelcomePrompt({
  connected,
  checking,
  serverUrl,
  currentCollectionId,
  collectionIds,
  initialBranch = "root",
  onRetryConnection,
  onClose,
  onImportExistingSystem,
  onStartFromSelection,
  onAuthorFirstToken,
  onOpenGraph,
  onGuidedSetupComplete,
  onCollectionCreated,
}: WelcomePromptProps) {
  const [branch, setBranch] = useState<StartHereBranch>(initialBranch);

  useEffect(() => {
    setBranch(initialBranch);
  }, [initialBranch]);

  const handleAction = (action?: () => void) => {
    onClose();
    action?.();
  };

  const renderRoot = () => (
    <div>
      <ActionRow
        title="Start a new library"
        description="Create a collection for this file and start adding tokens from scratch."
        onClick={() => setBranch("start-new")}
        icon={
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        }
      />
      <ActionRow
        title="Import existing tokens"
        description="Bring in variables, styles, or token files and keep the structure you already have."
        onClick={() => handleAction(onImportExistingSystem)}
        icon={
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        }
      />
      <ActionRow
        title="Start from current selection"
        description="Extract colors, type, and spacing from the layers already selected in Figma."
        onClick={() => handleAction(onStartFromSelection)}
        icon={
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
          </svg>
        }
      />
    </div>
  );

  const showBack = branch !== "root";
  const branchCopy = getStartHereBranchCopy(branch);
  const branchTitle = branchCopy.title;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-figma-overlay)]">
      <div className="flex max-h-[85vh] w-full max-w-[320px] flex-col overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg" role="dialog" aria-modal="true" aria-labelledby="welcome-dialog-title">
        <div className="border-b border-[var(--color-figma-border)] px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {showBack && (
                <button
                  type="button"
                  onClick={() => setBranch("root")}
                  className="rounded p-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                  aria-label="Go back"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
              )}
              <h2 id="welcome-dialog-title" className="text-heading font-semibold text-[var(--color-figma-text)]">
                {branchTitle}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              aria-label="Close"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {branchCopy.description ? (
            <p className="mt-1.5 max-w-[28ch] text-secondary leading-relaxed text-[var(--color-figma-text-secondary)]">
              {branchCopy.description}
            </p>
          ) : null}
          {!connected && (
            <NoticeBanner
              severity={checking ? "info" : "error"}
              actions={
                onRetryConnection ? (
                  <button
                    type="button"
                    onClick={onRetryConnection}
                    disabled={checking}
                    className="shrink-0 rounded-full border border-current/20 px-2.5 py-1 text-secondary font-medium text-current transition-colors hover:bg-current/10 disabled:opacity-60"
                  >
                    {checking ? "Checking…" : "Retry"}
                  </button>
                ) : undefined
              }
              className="mt-3"
            >
              {checking ? "Checking connection…" : "Server offline"}
            </NoticeBanner>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {branch === "root" && renderRoot()}
          {branch === "start-new" && (
            <div className="h-full">
              <QuickStartWizard
                serverUrl={serverUrl}
                currentCollectionId={currentCollectionId}
                collectionIds={collectionIds}
                connected={connected}
                checking={checking}
                embedded
                onBack={() => setBranch("root")}
                onClose={onClose}
                onComplete={onGuidedSetupComplete}
                onCollectionCreated={onCollectionCreated}
                onRetryConnection={onRetryConnection}
                onAuthorFirstToken={onAuthorFirstToken}
                onOpenGraph={onOpenGraph}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
