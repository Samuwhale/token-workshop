import { useState, useRef, useEffect } from "react";
import type {
  GeneratedTokenResult,
  GeneratorSemanticLayer,
  SemanticTokenMapping,
} from "../hooks/useGenerators";
import { getErrorMessage } from "../shared/utils";
import { ApiError } from "../shared/apiFetch";
import { SEMANTIC_PATTERNS } from "../shared/semanticPatterns";
import { createTokenBody, upsertToken } from "../shared/tokenMutations";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { buildSemanticMappings, createEmptySemanticMapping } from "./semanticPlanning";

export interface SemanticMappingDialogProps {
  serverUrl: string;
  generatedTokens: GeneratedTokenResult[];
  generatorType: string;
  targetGroup: string;
  targetCollection: string;
  onClose: () => void;
  onCreated?: (count: number) => void;
  initialPrefix?: string;
  initialMappings?: SemanticTokenMapping[];
  initialPatternId?: string | null;
  onSaveLayer?: (layer: GeneratorSemanticLayer | null) => Promise<void> | void;
  /** When "panel", renders without the modal backdrop/chrome so a parent can host it inline. */
  presentation?: "modal" | "panel";
}

export function SemanticMappingDialog({
  serverUrl,
  generatedTokens,
  generatorType,
  targetGroup,
  targetCollection,
  onClose,
  onCreated,
  initialPrefix,
  initialMappings,
  initialPatternId,
  onSaveLayer,
  presentation = "modal",
}: SemanticMappingDialogProps) {
  const isPanel = presentation === "panel";
  const availableSteps = generatedTokens.map((token) => String(token.stepName));
  const suggestedPatterns = SEMANTIC_PATTERNS.filter((pattern) =>
    pattern.applicableTo.includes(generatorType),
  );
  const defaultPattern =
    (initialPatternId
      ? suggestedPatterns.find((pattern) => pattern.id === initialPatternId)
      : undefined) ?? suggestedPatterns[0];
  const hasInitialLayer = Boolean(initialMappings?.length);
  const isLayerEditor = Boolean(onSaveLayer);

  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(
    hasInitialLayer ? initialPatternId ?? null : defaultPattern?.id ?? null,
  );
  const [semanticPrefix, setSemanticPrefix] = useState(
    initialPrefix ?? "semantic",
  );
  const [mappings, setMappings] = useState<SemanticTokenMapping[]>(() => {
    if (initialMappings?.length) {
      return buildSemanticMappings(initialMappings, availableSteps);
    }
    if (!defaultPattern) return [];
    return buildSemanticMappings(defaultPattern.mappings, availableSteps);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isPanel ? { current: null } : dialogRef);

  useEffect(() => {
    if (isPanel) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPanel, onClose]);

  const validMappings = mappings.filter(
    (mapping) => mapping.semantic.trim() && mapping.step,
  );

  const handlePatternSelect = (patternId: string) => {
    const pattern = SEMANTIC_PATTERNS.find((candidate) => candidate.id === patternId);
    if (!pattern) return;
    setSelectedPatternId(patternId);
    setMappings(buildSemanticMappings(pattern.mappings, availableSteps));
  };

  const handleAddRow = () => {
    setMappings((current) => [
      ...current,
      createEmptySemanticMapping(availableSteps),
    ]);
  };

  const handleRemoveRow = (index: number) => {
    setMappings((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleCreateTokens = async () => {
    if (validMappings.length === 0) {
      setError("Add at least one mapping.");
      return;
    }

    setSaving(true);
    setError("");
    let created = 0;
    try {
      for (const mapping of validMappings) {
        const fullPath = `${semanticPrefix.trim()}.${mapping.semantic}`;
        const tokenType =
          generatedTokens.find((token) => String(token.stepName) === mapping.step)
            ?.type ?? "string";
        const body = createTokenBody({
          $type: tokenType,
          $value: `{${targetGroup}.${mapping.step}}`,
          $description: `Semantic reference for ${targetGroup}.${mapping.step}`,
        });
        await upsertToken(
          serverUrl,
          targetCollection,
          fullPath,
          body,
          (err): err is ApiError =>
            err instanceof ApiError && err.status === 409,
        );
        created++;
      }
      setSaving(false);
      onCreated?.(created);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create tokens"));
      setSaving(false);
    }
  };

  const handleSaveLayer = async () => {
    if (!onSaveLayer) return;
    if (validMappings.length === 0) {
      setError("Add at least one mapping.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSaveLayer({
        prefix: semanticPrefix.trim(),
        mappings: validMappings,
        ...(selectedPatternId !== undefined ? { patternId: selectedPatternId } : {}),
      });
      setSaving(false);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save semantic layer"));
      setSaving(false);
    }
  };

  const handleRemoveLayer = async () => {
    if (!onSaveLayer) return;
    setSaving(true);
    setError("");
    try {
      await onSaveLayer(null);
      setSaving(false);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to remove semantic layer"));
      setSaving(false);
    }
  };

  const title = isLayerEditor ? "Semantic Layer" : "Create Semantic Tokens";
  const subtitle = isLayerEditor
    ? `Semantic aliases for ${targetGroup}.* in ${targetCollection}`
    : `Reference tokens that point to ${targetGroup}`;

  const bodyContent = (
    <>
      {suggestedPatterns.length > 0 && (
        <div>
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">
            Suggested patterns
          </label>
          <div className="flex flex-wrap gap-1">
            {suggestedPatterns.map((pattern) => (
              <button
                key={pattern.id}
                onClick={() => handlePatternSelect(pattern.id)}
                className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                  selectedPatternId === pattern.id
                    ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                    : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                }`}
              >
                {pattern.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
          Semantic group prefix
        </label>
        <input
          type="text"
          value={semanticPrefix}
          onChange={(event) => setSemanticPrefix(event.target.value)}
          placeholder="semantic"
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Mappings ({mappings.length})
          </label>
          <button
            onClick={handleAddRow}
            className="text-[10px] text-[var(--color-figma-accent)] hover:underline flex items-center gap-0.5"
          >
            + Add row
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {mappings.map((mapping, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input
                type="text"
                value={mapping.semantic}
                onChange={(event) =>
                  setMappings((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, semantic: event.target.value }
                        : candidate,
                    ),
                  )
                }
                placeholder="action.default"
                className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)] min-w-0"
              />
              <svg
                width="8"
                height="8"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="shrink-0 text-[var(--color-figma-text-secondary)]"
              >
                <path d="M2 6h8M7 3l3 3-3 3" />
              </svg>
              <select
                aria-label="Scale step"
                value={mapping.step}
                onChange={(event) =>
                  setMappings((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, step: event.target.value }
                        : candidate,
                    ),
                  )
                }
                className="w-16 px-1 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]"
              >
                {availableSteps.map((step) => (
                  <option key={step} value={step}>
                    {step}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleRemoveRow(index)}
                aria-label="Remove mapping"
                className="shrink-0 p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            </div>
          ))}
          {mappings.length === 0 && (
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] py-2 text-center">
              No mappings. Click "Add row" to start.
            </div>
          )}
        </div>
      </div>

      {validMappings.length > 0 && (
        <div>
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
            Will create
          </label>
          <div className="border border-[var(--color-figma-border)] rounded p-2 bg-[var(--color-figma-bg-secondary)] flex flex-col gap-0.5">
            {validMappings.map((mapping, index) => (
              <div
                key={index}
                className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]"
              >
                <span className="text-[var(--color-figma-text)]">
                  {semanticPrefix}.{mapping.semantic}
                </span>
                {" → "}
                <span className="text-[var(--color-figma-accent)]">
                  {"{" + targetGroup + "." + mapping.step + "}"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="text-[10px] text-[var(--color-figma-error)]">
          {error}
        </div>
      )}
    </>
  );

  const footerContent = (
    <>
      {isLayerEditor && hasInitialLayer && (
        <button
          onClick={handleRemoveLayer}
          disabled={saving}
          className="px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-error)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
        >
          Remove layer
        </button>
      )}
      <button
        onClick={onClose}
        className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
      >
        {isLayerEditor ? "Cancel" : "Skip"}
      </button>
      <button
        onClick={isLayerEditor ? handleSaveLayer : handleCreateTokens}
        disabled={saving || validMappings.length === 0}
        className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
      >
        {saving
          ? isLayerEditor
            ? "Saving…"
            : "Creating…"
          : isLayerEditor
            ? `Save ${validMappings.length} alias${validMappings.length === 1 ? "" : "es"}`
            : `Create ${validMappings.length} reference${validMappings.length === 1 ? "" : "s"}`}
      </button>
    </>
  );

  if (isPanel) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {bodyContent}
        </div>
        <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
          {footerContent}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-end justify-center z-50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-[var(--color-figma-bg)] rounded-t border border-[var(--color-figma-border)] shadow-xl w-full max-w-sm flex flex-col max-h-[85vh]"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-figma-border)] shrink-0">
          <div>
            <span className="text-[14px] font-semibold text-[var(--color-figma-text)]">
              {title}
            </span>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
              {subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
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

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {bodyContent}
        </div>

        <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
          {footerContent}
        </div>
      </div>
    </div>
  );
}
