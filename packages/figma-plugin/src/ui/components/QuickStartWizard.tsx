import { useState, useCallback, useEffect } from "react";
import { MousePointer2, Plus, Upload } from "lucide-react";
import {
  buildCollectionModeNames,
  CollectionAuthoringFields,
  createInitialCollectionAuthoringDraft,
  type CollectionAuthoringDraft,
  validateCollectionAuthoringDraft,
} from "./CollectionAuthoringFields";
import type { CreateCollectionRequest } from "./CollectionCreateDialog";
import { Button } from "../primitives";

type PrereqPhase = "connect" | "create-collection" | null;

interface QuickStartWizardProps {
  serverUrl: string;
  currentCollectionId: string | null;
  collectionIds: string[];
  connected: boolean;
  checking?: boolean;
  onCollectionCreated?: (collectionId: string) => void;
  onRetryConnection?: () => void;
  onAuthorFirstToken?: (collectionId: string) => void;
  onImportExistingSystem?: () => void;
  onStartFromSelection?: () => void;
  onCreateCollection: (request: CreateCollectionRequest) => Promise<string>;
  selectedNodeCount?: number;
}

function ConnectStep({ serverUrl, checking, onRetry }: {
  serverUrl: string;
  checking?: boolean;
  onRetry?: () => void;
}) {
  const [showServerDetails, setShowServerDetails] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
        Start the local server, then retry.
      </p>

      <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2">
        <button
          type="button"
          onClick={() => setShowServerDetails((open) => !open)}
          aria-expanded={showServerDetails}
          className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)] transition-colors hover:text-[color:var(--color-figma-text)]"
        >
          Server command
        </button>
        {showServerDetails ? (
          <div className="mt-2 flex flex-col gap-2">
            <code className="block rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-body font-mono text-[color:var(--color-figma-text-accent)]">
              npx token-workshop --dir ./tokens
            </code>
            <div className="flex flex-wrap items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
              <span>URL</span>
              <code className="font-mono rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[color:var(--color-figma-text)]">
                {serverUrl}
              </code>
            </div>
          </div>
        ) : null}
      </div>

      {onRetry ? (
        <Button
          type="button"
          onClick={onRetry}
          disabled={checking}
          variant="primary"
          className="w-full"
        >
          {checking ? "Checking…" : "Retry connection"}
        </Button>
      ) : null}
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
      <CollectionAuthoringFields
        draft={draft}
        pending={saving}
        error={error}
        onNameChange={(value) => {
          setDraft((current) => ({ ...current, name: value }));
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

function QuickStartShell({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col">{children}</div>;
}

function NextStepButton({
  title,
  onClick,
  disabled,
  icon,
}: {
  title: string;
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
  onCollectionCreated,
  onRetryConnection,
  onAuthorFirstToken,
  onImportExistingSystem,
  onStartFromSelection,
  onCreateCollection,
  selectedNodeCount = 0,
}: QuickStartWizardProps) {
  const [wizardCreatedCollection, setWizardCreatedCollection] = useState<string | null>(null);
  const [wizardCreatedCollectionLabel, setWizardCreatedCollectionLabel] =
    useState<string | null>(null);
  const hasCollections =
    collectionIds.length > 0 || wizardCreatedCollection !== null;
  const [prereqPhase, setPrereqPhase] = useState<PrereqPhase>(() => {
    if (!connected) return "connect";
    if (!hasCollections) return "create-collection";
    return null;
  });
  const effectiveCollectionId = wizardCreatedCollection || currentCollectionId;

  useEffect(() => {
    if (!connected) {
      setPrereqPhase("connect");
      return;
    }
    setPrereqPhase(hasCollections ? null : "create-collection");
  }, [connected, hasCollections]);

  const handleCollectionCreated = useCallback((collectionId: string, _modeCount: number, collectionLabel: string) => {
    setWizardCreatedCollection(collectionId);
    setWizardCreatedCollectionLabel(collectionLabel);
    onCollectionCreated?.(collectionId);
    setPrereqPhase(null);
  }, [onCollectionCreated]);

  if (prereqPhase === "connect" || prereqPhase === "create-collection") {
    return (
      <QuickStartShell>
        <div className="p-3">
          {prereqPhase === "connect" ? (
            <ConnectStep
              serverUrl={serverUrl}
              checking={checking}
              onRetry={onRetryConnection}
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
    <QuickStartShell>
      <div className="flex-1 overflow-y-auto">
        {wizardCreatedCollection ? (
          <div className="px-4 pb-3 pt-4">
            <p className="text-body font-medium text-[color:var(--color-figma-text)]">
              "{wizardCreatedCollectionLabel ?? wizardCreatedCollection}" created.
            </p>
          </div>
        ) : null}
        <div className="px-2 pb-2">
          <NextStepButton
            title="Create token"
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
              onClick={onImportExistingSystem}
              disabled={!connected}
              icon={<Upload size={13} strokeWidth={1.75} aria-hidden />}
            />
          ) : null}
          {onStartFromSelection ? (
            <NextStepButton
              title="Extract from selection"
              onClick={onStartFromSelection}
              disabled={!connected || selectedNodeCount === 0}
              icon={<MousePointer2 size={13} strokeWidth={1.75} aria-hidden />}
            />
          ) : null}
        </div>
      </div>
    </QuickStartShell>
  );
}
