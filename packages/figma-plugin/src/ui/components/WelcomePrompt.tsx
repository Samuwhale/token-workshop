import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NoticeBanner } from "../shared/noticeSystem";
import { QuickStartWizard } from "./QuickStartWizard";

export type StartHereBranch =
  | "root"
  | "import"
  | "start-new";

type StartHereBranchCopy = {
  title: string;
  description: string;
};

const START_HERE_BRANCH_COPY: Record<StartHereBranch, StartHereBranchCopy> = {
  root: {
    title: "Get started",
    description: "",
  },
  import: {
    title: "Import an existing token system",
    description: "Bring in Figma variables or token files, then review the imported collections in Tokens.",
  },
  "start-new": {
    title: "Start a new token system",
    description: "Create your first collection, add modes if needed, generate foundations, and turn them into semantics.",
  },
};

export const TOKENS_START_HERE_BRANCHES = [
  "start-new",
  "import",
] as const satisfies readonly StartHereBranch[];

export function getStartHereBranchCopy(
  branch: StartHereBranch,
): StartHereBranchCopy {
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
  onImportFigma?: () => void;
  onPasteJSON: () => void;
  onGuidedSetupComplete: () => void;
  onCollectionCreated?: (name: string) => void;
}

interface ActionCardProps {
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
}: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "w-full flex items-start gap-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
  onImportFigma,
  onPasteJSON,
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
    <div className="flex flex-col gap-3">
      <ActionRow
        title="Start a new token system"
        description="Create a collection, add modes, generate foundations, and create semantic aliases."
        emphasized
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
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        }
      />
      <div>
        <ActionRow
          title="Import an existing token system"
          description="Bring in Figma variables or token files."
          onClick={() => setBranch("import")}
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
      </div>
    </div>
  );

  const renderImport = () => (
    <div>
      {onImportFigma && (
        <ActionRow
          title="Import from Figma variables"
          description="Pull variables and modes into token collections."
          disabled={!connected}
          onClick={() => handleAction(onImportFigma)}
          icon={
            <svg
              width="14"
              height="14"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 3h3v3H2zM7 3h3v3H7zM2 7h3v3H2z" />
              <path d="M7 8.5V10M7 7v0" />
            </svg>
          }
        />
      )}
      <ActionRow
        title="Paste token JSON"
        description="DTCG, Style Dictionary, or Tokens Studio format."
        disabled={!connected}
        onClick={() => handleAction(onPasteJSON)}
        icon={
          <svg
            width="14"
            height="14"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
            <path d="M4 1.5v1.5a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5V1.5" />
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
                    className="shrink-0 rounded-full border border-current/20 px-2.5 py-1 text-secondary font-medium text-current transition-colors hover:bg-current/10 disabled:cursor-not-allowed disabled:opacity-60"
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
          {branch === "import" && renderImport()}
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
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
