import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NoticeBanner } from "../shared/noticeSystem";
import { QuickStartDialog } from "./QuickStartDialog";
import { QuickStartWizard } from "./QuickStartWizard";

export type StartHereBranch =
  | "root"
  | "import"
  | "guided-setup"
  | "template-library";

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
    title: "Import existing tokens",
    description: "Bring in Figma variables or paste a token file.",
  },
  "guided-setup": {
    title: "Guided setup",
    description:
      "Build color, spacing, type, and mode foundations step by step.",
  },
  "template-library": {
    title: "Recipe templates",
    description:
      "Create a palette, type scale, or spacing system for your token set.",
  },
};

export const TOKENS_START_HERE_BRANCHES = [
  "guided-setup",
  "template-library",
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
  activeSet: string;
  allSets: string[];
  initialBranch?: StartHereBranch;
  onRetryConnection?: () => void;
  onClose: () => void;
  onImportFigma?: () => void;
  onPasteJSON: () => void;
  onCreateToken: () => void;
  onTemplateCreated: (firstPath?: string) => void;
  onGuidedSetupComplete: () => void;
  onSetCreated?: (name: string) => void;
}

interface ActionCardProps {
  title: string;
  description: string;
  accent?: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
}

function ActionCard({
  title,
  description,
  accent = false,
  disabled = false,
  onClick,
  icon,
}: ActionCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "w-full rounded-lg border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        accent
          ? "border-[var(--color-figma-accent)]/35 bg-[var(--color-figma-accent)]/5 hover:border-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10"
          : "border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
            accent
              ? "border-[var(--color-figma-accent)]/25 bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
              : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]",
          ].join(" ")}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-medium text-[var(--color-figma-text)]">
            {title}
          </span>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}

export function WelcomePrompt({
  connected,
  checking,
  serverUrl,
  activeSet,
  allSets,
  initialBranch = "root",
  onRetryConnection,
  onClose,
  onImportFigma,
  onPasteJSON,
  onCreateToken,
  onTemplateCreated,
  onGuidedSetupComplete,
  onSetCreated,
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
    <div className="flex flex-col gap-2.5">
      <ActionCard
        title="Guided setup"
        description="Build color, spacing, type, and mode foundations step by step."
        accent
        onClick={() => setBranch("guided-setup")}
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
      <ActionCard
        title="Recipe templates"
        description="Create a palette, type scale, or spacing system for your token set."
        disabled={!connected}
        onClick={() => setBranch("template-library")}
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
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h10" />
          </svg>
        }
      />
      <ActionCard
        title="Import existing tokens"
        description="Bring in Figma variables or paste a token file."
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
      <ActionCard
        title="Create a token"
        description="Add a single token or group directly."
        disabled={!connected}
        onClick={() => handleAction(onCreateToken)}
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
    </div>
  );

  const renderImport = () => (
    <div className="flex flex-col gap-2.5">
      {onImportFigma && (
        <ActionCard
          title="Import from Figma variables"
          description="Pull your existing variables and modes into token sets."
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
      <ActionCard
        title="Paste token JSON"
        description="Import a DTCG, Style Dictionary, or Tokens Studio file."
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
  const branchTitle =
    branch === "root" ? "Get started" : getStartHereBranchCopy(branch).title;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="flex max-h-[85vh] w-[320px] flex-col overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg">
        <div className="border-b border-[var(--color-figma-border)] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {showBack && (
                <button
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
              <h2 className="text-[13px] font-semibold text-[var(--color-figma-text)]">
                {branchTitle}
              </h2>
            </div>
            <button
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
          {!connected && (
            <NoticeBanner
              severity={checking ? "info" : "error"}
              actions={
                onRetryConnection ? (
                  <button
                    type="button"
                    onClick={onRetryConnection}
                    disabled={checking}
                    className="shrink-0 rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-medium text-current transition-colors hover:bg-current/10 disabled:cursor-not-allowed disabled:opacity-60"
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {branch === "root" && renderRoot()}
          {branch === "import" && renderImport()}
          {branch === "template-library" && (
            <div className="h-full min-h-[360px]">
              <QuickStartDialog
                serverUrl={serverUrl}
                activeSet={activeSet}
                allSets={allSets}
                embedded
                title="Foundation templates"
                description="Choose a foundation, then refine it in the recipe editor."
                onBack={() => setBranch("root")}
                onClose={onClose}
                onConfirm={onTemplateCreated}
              />
            </div>
          )}
          {branch === "guided-setup" && (
            <div className="h-full min-h-[360px]">
              <QuickStartWizard
                serverUrl={serverUrl}
                activeSet={activeSet}
                allSets={allSets}
                connected={connected}
                checking={checking}
                embedded
                onBack={() => setBranch("root")}
                onClose={onClose}
                onComplete={onGuidedSetupComplete}
                onSetCreated={onSetCreated}
                onRetryConnection={onRetryConnection}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
