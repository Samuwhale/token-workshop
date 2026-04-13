import { useState } from "react";

const MODE_PRESETS: { name: string; variants: [string, string] }[] = [
  { name: "Color Mode", variants: ["Light", "Dark"] },
  { name: "Brand", variants: ["Default", "Premium"] },
  { name: "Density", variants: ["Regular", "Compact"] },
];

interface QuickModeCreatorProps {
  onCreateMode: (modeName: string, variantNames: string[]) => Promise<void>;
}

export function QuickModeCreator({ onCreateMode }: QuickModeCreatorProps) {
  const [expanded, setExpanded] = useState(false);
  const [customName, setCustomName] = useState("");
  const [variantA, setVariantA] = useState("");
  const [variantB, setVariantB] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handlePreset = async (preset: (typeof MODE_PRESETS)[number]) => {
    setCreating(true);
    setError("");
    try {
      await onCreateMode(preset.name, preset.variants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create mode");
    } finally {
      setCreating(false);
    }
  };

  const handleCustomCreate = async () => {
    const name = customName.trim();
    const a = variantA.trim();
    const b = variantB.trim();
    if (!name || !a || !b) return;
    setCreating(true);
    setError("");
    try {
      await onCreateMode(name, [a, b]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create mode");
    } finally {
      setCreating(false);
    }
  };

  if (!expanded) {
    return (
      <div className="flex flex-col gap-2 py-1">
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
          Want different values for light/dark or other variants?
        </p>
        <div className="flex flex-wrap gap-1">
          {MODE_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => handlePreset(preset)}
              disabled={creating}
              className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] disabled:opacity-40"
            >
              {preset.name}
              <span className="ml-1 text-[var(--color-figma-text-tertiary)]">
                {preset.variants.join(" / ")}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setExpanded(true)}
          className="self-start text-[10px] text-[var(--color-figma-accent)] hover:underline"
        >
          Custom mode...
        </button>
        {error && (
          <p className="text-[10px] text-[var(--color-figma-error)]">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex flex-col gap-1.5">
        <input
          type="text"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Mode name (e.g. Color Mode)"
          className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          autoFocus
        />
        <div className="flex gap-1.5">
          <input
            type="text"
            value={variantA}
            onChange={(e) => setVariantA(e.target.value)}
            placeholder="Variant 1 (e.g. Light)"
            className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          />
          <input
            type="text"
            value={variantB}
            onChange={(e) => setVariantB(e.target.value)}
            placeholder="Variant 2 (e.g. Dark)"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCustomCreate();
            }}
            className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          />
        </div>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={handleCustomCreate}
          disabled={
            creating ||
            !customName.trim() ||
            !variantA.trim() ||
            !variantB.trim()
          }
          className="rounded bg-[var(--color-figma-accent)] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
        >
          {creating ? "Creating..." : "Create"}
        </button>
        <button
          onClick={() => setExpanded(false)}
          className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Back
        </button>
      </div>
      {error && (
        <p className="text-[10px] text-[var(--color-figma-error)]">{error}</p>
      )}
    </div>
  );
}
