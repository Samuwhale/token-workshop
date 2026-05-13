import { useState, useCallback, useEffect, useRef } from "react";
import { MousePointer2, Plus, Upload, X } from "lucide-react";
import {
  buildCollectionModeNames,
  CollectionAuthoringFields,
  createInitialCollectionAuthoringDraft,
  type CollectionAuthoringDraft,
  validateCollectionAuthoringDraft,
} from "./CollectionAuthoringFields";
import type { CreateCollectionRequest } from "./CollectionCreateDialog";
import { Button, IconButton } from "../primitives";
import { useFocusTrap } from "../hooks/useFocusTrap";

type PrereqPhase = "connect" | "create-collection" | null;
const QUICK_START_TITLE = "Start a token library";

interface QuickStartWizardProps {
  serverUrl: string;
  currentCollectionId: string | null;
  collectionIds: string[];
  connected: boolean;
  checking?: boolean;
  onClose: () => void;
  onComplete: () => void;
  onCollectionCreated?: (collectionId: string) => void;
  onRetryConnection?: () => void;
  onAuthorFirstToken?: (collectionId: string) => void;
  onImportExistingSystem?: () => void;
  onStartFromSelection?: () => void;
  onCreateCollection: (request: CreateCollectionRequest) => Promise<string>;
  selectedNodeCount?: number;
  embedded?: boolean;
  onBack?: () => void;
}

function ConnectStep({ serverUrl, checking, onRetry, onClose, closeLabel }: {
  serverUrl: string;
  checking?: boolean;
  onRetry?: () => void;
  onClose: () => void;
  closeLabel?: string;
}) {
  const [showServerDetails, setShowServerDetails] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-body font-medium text-[color:var(--color-figma-text)]">
          Connect to your token library
        </p>
        <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
          Ask the library owner to start the shared token server for this file, then retry here.
        </p>
      </div>

      <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2">
        <button
          type="button"
          onClick={() => setShowServerDetails((open) => !open)}
          aria-expanded={showServerDetails}
          className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)] transition-colors hover:text-[color:var(--color-figma-text)]"
        >
          For developers: start the server
        </button>
        {showServerDetails ? (
          <div className="mt-2 flex flex-col gap-2">
            <code className="block rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-body font-mono text-[color:var(--color-figma-text-accent)]">
              npx token-workshop --dir ./tokens
            </code>
            <div className="flex flex-wrap items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
              <span>Looking for</span>
              <code className="font-mono rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[color:var(--color-figma-text)]">
                {serverUrl}
              </code>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={onClose}
          variant="secondary"
          className="flex-1"
        >
          {closeLabel ?? "Close"}
        </Button>
        <Button
          type="button"
          onClick={() => onRetry?.()}
          disabled={checking}
          variant="primary"
          className="flex-1"
        >
          {checking ? "Checking…" : "Retry connection"}
        </Button>
      </div>
    </div>
  );
}

function CreateCollectionStep({ onCreateCollection, onCreated }: {
  onCreateCollection: (request: CreateCollectionRequest) => Promise<string>;
  onCreated: (collectionId: string, modeCount: number, collectionLabel: string) => void;
}) {
  const [draft, setDraft] = useState<CollectionAuthoringDraft>(() =>
    createInitialCollectionAuthoringDraft(false),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = useCallback(async () => {
    const validationError = validateCollectionAuthoringDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    const collectionName = draft.name.trim();
    const modes = buildCollectionModeNames(draft);
    setSaving(true);
    setError("");
    try {
      const createdCollectionId = await onCreateCollection({
        name: collectionName,
        modes,
      });
      onCreated(createdCollectionId, modes.length, collectionName);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to create collection");
    } finally {
      setSaving(false);
    }
  }, [draft, onCreateCollection, onCreated]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-body font-medium text-[color:var(--color-figma-text)]">
          Create your first collection
        </p>
        <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
          Choose the contexts this collection needs. Tokens get one value per mode.
        </p>
      </div>

      <CollectionAuthoringFields
        draft={draft}
        pending={saving}
        error={error}
        onNameChange={(value) => {
          setDraft((current) => ({ ...current, name: value }));
          setError("");
        }}
        onModeNamesChange={(modeNames) => {
          setDraft((current) => ({ ...current, modeNames }));
          setError("");
        }}
        onModeNameChange={(index, value) => {
          setDraft((current) => ({
            ...current,
            modeNames: current.modeNames.map((modeName, modeIndex) =>
              modeIndex === index ? value : modeName,
            ),
          }));
          setError("");
        }}
        onAddMode={() => {
          setDraft((current) => ({
            ...current,
            modeNames: [...current.modeNames, ""],
          }));
          setError("");
        }}
        onRemoveMode={(index) => {
          setDraft((current) => ({
            ...current,
            modeNames: current.modeNames.filter((_, modeIndex) => modeIndex !== index),
          }));
          setError("");
        }}
      />

      <Button
        type="button"
        onClick={handleCreate}
        disabled={saving || !draft.name.trim()}
        variant="primary"
        className="w-full"
      >
        {saving ? "Creating…" : "Create collection"}
      </Button>
    </div>
  );
}

function QuickStartShell({
  embedded,
  onClose,
  children,
}: {
  embedded: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    if (embedded) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [embedded, onClose]);

  const content = (
    <>
      {!embedded ? (
        <div className="tm-modal-header tm-modal-header--split border-b border-[var(--color-figma-border)]">
          <div className="tm-modal-header__headline">
            <div className="tm-dialog-title">
              {QUICK_START_TITLE}
            </div>
          </div>
          <div className="tm-modal-header__actions">
            <IconButton
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close"
              size="sm"
              className="tm-modal-close-button"
            >
              <X size={12} strokeWidth={2} aria-hidden />
            </IconButton>
          </div>
        </div>
      ) : null}
      {children}
    </>
  );

  if (embedded) {
    return <div className="flex h-full min-h-0 flex-col">{content}</div>;
  }

  return (
    <div
      className="tm-modal-shell"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="tm-modal-panel tm-modal-panel--dialog"
        role="dialog"
        aria-modal="true"
        aria-label={QUICK_START_TITLE}
        style={{ inlineSize: "min(100%, 24rem)", maxBlockSize: "85vh" }}
      >
        {content}
      </div>
    </div>
  );
}

function NextStepButton({
  title,
  description,
  onClick,
  disabled,
  icon,
}: {
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
    >
      <span className="mt-0.5 shrink-0 text-[color:var(--color-figma-text-secondary)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-body font-medium text-[color:var(--color-figma-text)]">
          {title}
        </span>
        <span className="mt-0.5 block text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]">
          {description}
        </span>
      </span>
    </button>
  );
}

export function QuickStartWizard({
  serverUrl,
  currentCollectionId,
  collectionIds,
  connected,
  checking,
  onClose,
  onComplete,
  onCollectionCreated,
  onRetryConnection,
  onAuthorFirstToken,
  onImportExistingSystem,
  onStartFromSelection,
  onCreateCollection,
  selectedNodeCount = 0,
  embedded = false,
  onBack,
}: QuickStartWizardProps) {
  const [wizardCreatedCollection, setWizardCreatedCollection] = useState<string | null>(null);
  const [wizardCreatedCollectionLabel, setWizardCreatedCollectionLabel] =
    useState<string | null>(null);
  const [wizardCreatedModeCount, setWizardCreatedModeCount] = useState<number | null>(null);
  const hasCollections =
    collectionIds.length > 0 || wizardCreatedCollection !== null;
  const [prereqPhase, setPrereqPhase] = useState<PrereqPhase>(() => {
    if (!connected) return "connect";
    if (!hasCollections) return "create-collection";
    return null;
  });
  const effectiveCollectionId = wizardCreatedCollection || currentCollectionId;
  const createdModeCount = wizardCreatedModeCount ?? 1;

  useEffect(() => {
    if (!connected) {
      setPrereqPhase("connect");
      return;
    }
    setPrereqPhase(hasCollections ? null : "create-collection");
  }, [connected, hasCollections]);

  const handleCollectionCreated = useCallback((collectionId: string, modeCount: number, collectionLabel: string) => {
    setWizardCreatedCollection(collectionId);
    setWizardCreatedCollectionLabel(collectionLabel);
    setWizardCreatedModeCount(modeCount);
    onCollectionCreated?.(collectionId);
    setPrereqPhase(null);
  }, [onCollectionCreated]);

  if (prereqPhase === "connect" || prereqPhase === "create-collection") {
    return (
      <QuickStartShell embedded={embedded} onClose={onClose}>
        <div className="p-3">
          {prereqPhase === "connect" ? (
            <ConnectStep
              serverUrl={serverUrl}
              checking={checking}
              onRetry={onRetryConnection}
              onClose={embedded && onBack ? onBack : onClose}
              closeLabel={embedded && onBack ? "Back" : "Close"}
            />
          ) : (
            <CreateCollectionStep
              onCreateCollection={onCreateCollection}
              onCreated={handleCollectionCreated}
            />
          )}
        </div>
      </QuickStartShell>
    );
  }

  return (
    <QuickStartShell embedded={embedded} onClose={onClose}>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pb-3 pt-4">
          <p className="text-body font-medium text-[color:var(--color-figma-text)]">
            {wizardCreatedCollection
              ? `"${wizardCreatedCollectionLabel ?? wizardCreatedCollection}" is ready with ${createdModeCount} mode${createdModeCount === 1 ? "" : "s"}.`
              : effectiveCollectionId
                ? "Choose what to add next."
                : "Choose what to add next."}
          </p>
          <p className="mt-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
            Create a token, import an existing system, or extract values from the canvas.
          </p>
        </div>
        <div className="px-2 pb-2">
          <NextStepButton
            title="Create token"
            description="Add one token and set its values for each mode."
            onClick={() => {
              if (effectiveCollectionId) {
                onAuthorFirstToken?.(effectiveCollectionId);
              }
            }}
            disabled={!connected || !effectiveCollectionId}
            icon={<Plus size={13} strokeWidth={1.75} aria-hidden />}
          />
          {onImportExistingSystem ? (
            <NextStepButton
              title="Import tokens"
              description="Bring in Figma variables, styles, or token files."
              onClick={onImportExistingSystem}
              disabled={!connected}
              icon={<Upload size={13} strokeWidth={1.75} aria-hidden />}
            />
          ) : null}
          {onStartFromSelection ? (
            <NextStepButton
              title="Extract from selection"
              description={
                selectedNodeCount > 0
                  ? "Turn selected layer values into tokens."
                  : "Select a layer in Figma, then extract values."
              }
              onClick={onStartFromSelection}
              disabled={!connected || selectedNodeCount === 0}
              icon={<MousePointer2 size={13} strokeWidth={1.75} aria-hidden />}
            />
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          {embedded && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:text-[color:var(--color-figma-text)]"
            >
              Back
            </button>
          ) : (
            <span aria-hidden />
          )}
          <button
            type="button"
            onClick={onComplete}
            className="text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:text-[color:var(--color-figma-text)]"
          >
            Done for now
          </button>
        </div>
      </div>
    </QuickStartShell>
  );
}
