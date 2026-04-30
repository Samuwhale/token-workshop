import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
  MousePointer2,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { NoticeBanner } from "../shared/noticeSystem";
import { QuickStartWizard } from "./QuickStartWizard";
import type { CreateCollectionRequest } from "./CollectionCreateDialog";

export type StartHereBranch = "root" | "start-new";

type StartHereBranchCopy = {
  title: string;
  description: string;
};

const START_HERE_BRANCH_COPY: Record<StartHereBranch, StartHereBranchCopy> = {
  root: {
    title: "Start with a collection",
    description: "Collections match Figma variable collections: tokens live inside them, and modes define their value contexts.",
  },
  "start-new": {
    title: "Create your first collection",
    description: "Name the collection, then add modes like Light and Dark. Every token gets one value for each mode.",
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
  selectedNodeCount?: number;
  initialBranch?: StartHereBranch;
  onRetryConnection?: () => void;
  onClose: () => void;
  onImportExistingSystem: () => void;
  onStartFromSelection: () => void;
  onAuthorFirstToken?: (collectionId: string) => void;
  onCreateCollection: (request: CreateCollectionRequest) => Promise<string>;
  onGuidedSetupComplete: () => void;
  onCollectionCreated?: (collectionId: string) => void;
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
        "w-full flex items-start gap-2.5 text-left transition-colors disabled:opacity-50",
        emphasized
          ? "border-t-0 px-0 pb-2 pt-0"
          : "border-t border-[var(--color-figma-border)] px-0 py-2 first:border-t-0 first:pt-0 last:pb-0",
      ].join(" ")}
    >
      <span
        className={[
          "mt-0.5 shrink-0",
          emphasized
            ? "text-[color:var(--color-figma-text-accent)]"
            : "text-[color:var(--color-figma-text-secondary)]",
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={[
            "text-body font-medium block",
            emphasized
              ? "text-[color:var(--color-figma-text-accent)]"
              : "text-[color:var(--color-figma-text)]",
          ].join(" ")}
        >
          {title}
        </span>
        <span className="mt-0.5 text-secondary leading-relaxed text-[color:var(--color-figma-text-secondary)] block">
          {description}
        </span>
      </span>
      <ChevronRight
        size={12}
        strokeWidth={2}
        className="shrink-0 mt-0.5 text-[color:var(--color-figma-text-tertiary)]"
        aria-hidden
      />
    </button>
  );
}

export function WelcomePrompt({
  connected,
  checking,
  serverUrl,
  currentCollectionId,
  collectionIds,
  selectedNodeCount = 0,
  initialBranch = "root",
  onRetryConnection,
  onClose,
  onImportExistingSystem,
  onStartFromSelection,
  onAuthorFirstToken,
  onCreateCollection,
  onGuidedSetupComplete,
  onCollectionCreated,
}: WelcomePromptProps) {
  const [branch, setBranch] = useState<StartHereBranch>(initialBranch);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    setBranch(initialBranch);
  }, [initialBranch]);

  const handleAction = (action?: () => void) => {
    onClose();
    action?.();
  };

  const handleRequiresConnection = (action: () => void) => {
    if (!connected) {
      setBranch("start-new");
      return;
    }
    handleAction(action);
  };

  const renderRoot = () => (
    <div>
      <ActionRow
        title="Create your first collection"
        description="Create the Figma-style home for related tokens and their modes."
        onClick={() => setBranch("start-new")}
        emphasized
        icon={<Plus size={14} strokeWidth={1.75} aria-hidden />}
      />
      <ActionRow
        title="Import existing tokens"
        description="Bring in Figma variables, styles, JSON, CSS, or Tokens Studio files."
        onClick={() => handleRequiresConnection(onImportExistingSystem)}
        icon={<Upload size={14} strokeWidth={1.75} aria-hidden />}
      />
      <ActionRow
        title="Start from current selection"
        description={
          !connected
            ? "Connect to the token library before inspecting selected layers."
            : selectedNodeCount > 0
            ? "Inspect selected layers and turn design values into tokens."
            : "Select at least one layer in Figma to use this path."
        }
        disabled={connected && selectedNodeCount === 0}
        onClick={() => handleRequiresConnection(onStartFromSelection)}
        icon={<MousePointer2 size={14} strokeWidth={1.75} aria-hidden />}
      />
    </div>
  );

  const showBack = branch !== "root";
  const branchCopy = getStartHereBranchCopy(branch);
  const branchTitle = branchCopy.title;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-figma-overlay)] p-2">
      <div
        ref={dialogRef}
        className="flex max-h-[calc(100vh-16px)] w-full max-w-[320px] flex-col overflow-hidden rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-dialog-title"
        aria-describedby={
          branchCopy.description ? "welcome-dialog-description" : undefined
        }
      >
        <div className="border-b border-[var(--color-figma-border)] px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {showBack && (
                <button
                  type="button"
                  onClick={() => setBranch("root")}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                  aria-label="Go back"
                >
                  <ArrowLeft size={12} strokeWidth={1.75} aria-hidden />
                </button>
              )}
              <h2
                id="welcome-dialog-title"
                className="text-heading font-semibold text-[color:var(--color-figma-text)]"
              >
                {branchTitle}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              aria-label="Close"
            >
              <X size={12} strokeWidth={2} aria-hidden />
            </button>
          </div>
          {branchCopy.description ? (
            <p
              id="welcome-dialog-description"
              className="mt-1.5 max-w-[28ch] text-secondary leading-[1.45] text-[color:var(--color-figma-text-secondary)]"
            >
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
                onCreateCollection={onCreateCollection}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
