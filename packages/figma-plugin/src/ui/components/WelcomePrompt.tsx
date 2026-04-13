import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { NoticeBanner } from "../shared/noticeSystem";
import {
  AUDIT_WORKSPACE_GUIDE,
  PRIMARY_WORKSPACE_SEQUENCE,
  PRIMARY_WORKSPACE_SEQUENCE_LABEL,
} from "../shared/navigationTypes";
import { QuickStartDialog } from "./QuickStartDialog";
import { QuickStartWizard } from "./QuickStartWizard";

export type StartHereBranch =
  | "root"
  | "import"
  | "template"
  | "guided-setup"
  | "template-library"
  | "manual";
type StartHereDetailBranch = Exclude<StartHereBranch, "root">;

type StartHereBranchCopy = {
  title: string;
  description: string;
};

const START_HERE_BRANCH_COPY: Record<
  StartHereDetailBranch,
  StartHereBranchCopy
> = {
  import: {
    title: "Import an existing system",
    description:
      "Bring in a system you already have, then refine it inside Token Manager.",
  },
  template: {
    title: "Start from a template",
    description:
      "Pick a guided or generated starting point, then shape it into your design system.",
  },
  "guided-setup": {
    title: "Guided system setup",
    description:
      "Recommended for new systems. Build foundations, semantics, and theme modes in one flow.",
  },
  "template-library": {
    title: "Foundation templates",
    description:
      "Generate common scales and foundations into your active token set.",
  },
  manual: {
    title: "Start manually",
    description:
      "Open the shared token creator once you already know the first token or group you want to add.",
  },
};

export const TOKENS_START_HERE_BRANCHES = [
  "guided-setup",
  "template-library",
  "import",
  "manual",
] as const satisfies readonly StartHereBranch[];

export function getStartHereBranchCopy(
  branch: StartHereDetailBranch,
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
  isFirstRun?: boolean;
  onRetryConnection?: () => void;
  onOpenSettings?: () => void;
  onClose: () => void;
  onImportFigma?: () => void;
  onPasteJSON: () => void;
  onCreateToken: () => void;
  onGenerateColorScale?: () => void;
  onTemplateCreated: (firstPath?: string) => void;
  onGuidedSetupComplete: () => void;
  onSetCreated?: (name: string) => void;
}

interface ActionCardProps {
  title: string;
  description: string;
  accent?: boolean;
  badge?: string;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
}

function ActionCard({
  title,
  description,
  accent = false,
  badge,
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
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[var(--color-figma-text)]">
              {title}
            </span>
            {badge && (
              <span className="rounded-full bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
                {badge}
              </span>
            )}
          </div>
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
  isFirstRun = false,
  onRetryConnection,
  onOpenSettings,
  onClose,
  onImportFigma,
  onPasteJSON,
  onCreateToken,
  onGenerateColorScale,
  onTemplateCreated,
  onGuidedSetupComplete,
  onSetCreated,
}: WelcomePromptProps) {
  const [branch, setBranch] = useState<StartHereBranch>(initialBranch);
  const importCopy = getStartHereBranchCopy("import");
  const templateCopy = getStartHereBranchCopy("template");
  const guidedSetupCopy = getStartHereBranchCopy("guided-setup");
  const templateLibraryCopy = getStartHereBranchCopy("template-library");
  const manualCopy = getStartHereBranchCopy("manual");

  useEffect(() => {
    setBranch(initialBranch);
  }, [initialBranch]);

  const branchTitle = useMemo(() => {
    return branch === "root"
      ? "How do you want to begin?"
      : getStartHereBranchCopy(branch).title;
  }, [branch]);

  const branchDescription = useMemo(() => {
    return branch === "root"
      ? isFirstRun
        ? `Start with one clear decision, then move through ${PRIMARY_WORKSPACE_SEQUENCE_LABEL}. ${AUDIT_WORKSPACE_GUIDE.label} stays available whenever you need to review issues or history.`
        : `Choose one path, then continue on the shared ${PRIMARY_WORKSPACE_SEQUENCE_LABEL} workflow.`
      : getStartHereBranchCopy(branch).description;
  }, [branch, isFirstRun]);

  const requiresServer = !connected && branch !== "guided-setup";

  const handleAction = (action?: () => void) => {
    onClose();
    action?.();
  };

  const renderRoot = () => (
    <div className="flex flex-col gap-3">
      <ActionCard
        title={importCopy.title}
        description="Bring in Figma variables or an existing token file and use that as the starting point for your system."
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
        title={templateCopy.title}
        description="Use guided setup or generate proven foundations like color, spacing, and type scales."
        accent
        badge={isFirstRun ? "Recommended" : undefined}
        onClick={() => setBranch("template")}
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
            <path d="M4 12h10" />
            <path d="M4 18h7" />
            <path d="M18 10l2 2-5 5-3 1 1-3 5-5z" />
          </svg>
        }
      />
      <ActionCard
        title={manualCopy.title}
        description="Jump into the same token creator used from the Tokens workspace once you know what you want to add."
        onClick={() => setBranch("manual")}
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
      <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-3">
        <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
          Shared workflow
        </div>
        <div className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
          Follow the same order shown in the shell so each workspace answers one
          question before the next.
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {PRIMARY_WORKSPACE_SEQUENCE.map((workspace) => (
            <div key={workspace.id} className="flex items-start gap-2">
              <span className="inline-flex min-w-[58px] items-center justify-center rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--color-figma-text)]">
                {workspace.stepNumber}. {workspace.label}
              </span>
              <span className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                {workspace.role}
              </span>
            </div>
          ))}
          <div className="flex items-start gap-2 rounded-md border border-dashed border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5">
            <span className="inline-flex min-w-[58px] items-center justify-center rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--color-figma-text)]">
              {AUDIT_WORKSPACE_GUIDE.label}
            </span>
            <span className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              Cross-cutting review space. {AUDIT_WORKSPACE_GUIDE.role}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderImport = () => (
    <div className="flex flex-col gap-3">
      {onImportFigma && (
        <ActionCard
          title="Import from Figma variables"
          description="Pull your existing variables and modes into token sets, then continue evolving them here."
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
        description="Migrate a DTCG, Style Dictionary, or Tokens Studio file into a token system you can manage in one place."
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

  const renderTemplate = () => (
    <div className="flex flex-col gap-3">
      <ActionCard
        title={guidedSetupCopy.title}
        description="Walk through foundations, semantic roles, and theme modes in one recommended flow."
        accent
        badge="Recommended"
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
        title={templateLibraryCopy.title}
        description="Choose a foundation template, then finish it in the shared generator editor for your active token set."
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
      {onGenerateColorScale && (
        <ActionCard
          title="Generate a color scale"
          description="Use the dedicated palette builder when you want to start from a single source color."
          disabled={!connected}
          onClick={() => handleAction(onGenerateColorScale)}
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
              <circle cx="6" cy="6" r="4.5" />
              <path d="M3.5 6a2.5 2.5 0 0 1 5 0" />
            </svg>
          }
        />
      )}
    </div>
  );

  const renderManual = () => (
    <div className="flex flex-col gap-3">
      <ActionCard
        title="Open the token creator"
        description="Hand off to the same create flow used from the Tokens workspace so manual starts stay on the shared path."
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
      <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
        Manual setup works best once you already know how you want to organize
        primitives, semantics, and themes.
      </div>
    </div>
  );

  const showBack = branch !== "root";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="flex max-h-[85vh] w-[320px] flex-col overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg">
        <div className="border-b border-[var(--color-figma-border)] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {showBack && (
                  <button
                    onClick={() =>
                      setBranch(
                        branch === "guided-setup" ||
                          branch === "template-library"
                          ? "template"
                          : "root",
                      )
                    }
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
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                {branchDescription}
              </p>
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
          {requiresServer && (
            <p className="mt-2 text-[10px] text-[var(--color-figma-text-tertiary)]">
              Connect the local server first, or use guided setup to walk
              through the setup sequence.
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {branch === "root" && renderRoot()}
          {branch === "import" && renderImport()}
          {branch === "template" && renderTemplate()}
          {branch === "manual" && renderManual()}
          {branch === "template-library" && (
            <div className="h-full min-h-[360px]">
              <QuickStartDialog
                serverUrl={serverUrl}
                activeSet={activeSet}
                allSets={allSets}
                embedded
                title="Foundation templates"
                description="Choose a first layer of system foundations for the active set, then refine it in the shared generator editor or keep the generator live."
                onBack={() => setBranch("template")}
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
                onBack={() => setBranch("template")}
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
