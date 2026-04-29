import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "../shared/apiFetch";
import { getErrorMessage } from "../shared/utils";
import {
  buildCollectionModeNames,
  CollectionAuthoringFields,
  type CollectionAuthoringDraft,
  validateCollectionAuthoringDraft,
} from "./CollectionAuthoringFields";

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
  onCollectionCreated?: (name: string) => void;
  onRetryConnection?: () => void;
  onAuthorFirstToken?: () => void;
  embedded?: boolean;
  onBack?: () => void;
}

function ConnectStep({ serverUrl, checking, onRetry, onClose }: {
  serverUrl: string;
  checking?: boolean;
  onRetry?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-body font-medium text-[color:var(--color-figma-text)]">
          Connect your token library
        </p>
        <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
          Start TokenManager in the folder that contains your tokens, then come back here:
        </p>
      </div>

      <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5">
        <code className="text-body font-mono text-[color:var(--color-figma-text-accent)]">token-manager start</code>
      </div>

      <div className="flex items-center gap-2 text-secondary text-[color:var(--color-figma-text-secondary)]">
        <span className="shrink-0">Looking for:</span>
        <code className="font-mono px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)]">{serverUrl}</code>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] text-body hover:bg-[var(--color-figma-bg-hover)]"
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => onRetry?.()}
          disabled={checking}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] text-body font-medium hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-60"
        >
          {checking ? "Checking…" : "Retry Connection"}
        </button>
      </div>
    </div>
  );
}

function CreateCollectionStep({ serverUrl, onCreated }: {
  serverUrl: string;
  onCreated: (name: string) => void;
}) {
  const [draft, setDraft] = useState<CollectionAuthoringDraft>({
    name: "primitives",
    modeNames: ["Default"],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = useCallback(async () => {
    const validationError = validateCollectionAuthoringDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    const collectionName = draft.name.trim();
    setSaving(true);
    setError("");
    try {
      await apiFetch(`${serverUrl}/api/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: collectionName,
          modes: buildCollectionModeNames(draft).map((modeName) => ({
            name: modeName,
          })),
        }),
      });
      onCreated(collectionName);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }, [draft, onCreated, serverUrl]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-body font-medium text-[color:var(--color-figma-text)]">
          Create your first token collection
        </p>
        <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
          Collections own their modes, so set up the collection and the mode contexts it needs together.
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

      <button
        type="button"
        onClick={handleCreate}
        disabled={saving || !draft.name.trim()}
        className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] text-body font-medium hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-50"
      >
        {saving ? "Creating…" : "Create Collection"}
      </button>
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
  const content = (
    <>
      {!embedded ? (
        <div className="flex items-center justify-between border-b border-[var(--color-figma-border)] px-4 py-3">
          <div className="text-heading font-semibold text-[color:var(--color-figma-text)]">
            {QUICK_START_TITLE}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : null}
      {children}
    </>
  );

  if (embedded) {
    return <div className="flex h-full min-h-0 flex-col">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]">
      <div
        className="flex w-80 flex-col rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl"
        style={{ maxHeight: "85vh" }}
      >
        {content}
      </div>
    </div>
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
  embedded = false,
  onBack,
}: QuickStartWizardProps) {
  const [wizardCreatedCollection, setWizardCreatedCollection] = useState<string | null>(null);
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

  const handleCollectionCreated = useCallback((name: string) => {
    setWizardCreatedCollection(name);
    onCollectionCreated?.(name);
    setPrereqPhase(null);
  }, [onCollectionCreated]);

  if (prereqPhase === "connect" || prereqPhase === "create-collection") {
    return (
      <QuickStartShell embedded={embedded} onClose={onClose}>
        <div className="p-4">
          {prereqPhase === "connect" ? (
            <ConnectStep
              serverUrl={serverUrl}
              checking={checking}
              onRetry={onRetryConnection}
              onClose={embedded && onBack ? onBack : onClose}
            />
          ) : (
            <CreateCollectionStep
              serverUrl={serverUrl}
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
            {effectiveCollectionId
              ? `"${effectiveCollectionId}" is ready. Create your first token next.`
              : "Create your first token next."}
          </p>
          <p className="mt-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
            Start by authoring one real token in the collection. You can add generators later.
          </p>
        </div>
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={() => onAuthorFirstToken?.()}
            disabled={!connected}
            className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] text-body font-medium hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40"
          >
            Create first token
          </button>
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
