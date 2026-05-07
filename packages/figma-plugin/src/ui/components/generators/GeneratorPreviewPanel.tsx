import type {
  TokenCollection,
  TokenGeneratorPreviewOutput,
  TokenGeneratorPreviewResult,
} from "@token-workshop/core";
import { ValuePreview, previewIsValueBearing } from "../ValuePreview";

type PreviewChangeCounts = {
  collisions: number;
  created: number;
  updated: number;
  unchanged: number;
};

export function countPreviewChanges(
  outputs: TokenGeneratorPreviewOutput[],
): PreviewChangeCounts {
  return outputs.reduce<PreviewChangeCounts>(
    (counts, output) => {
      if (output.collision) {
        counts.collisions += 1;
      } else if (output.change === "created") {
        counts.created += 1;
      } else if (output.change === "updated") {
        counts.updated += 1;
      } else {
        counts.unchanged += 1;
      }
      return counts;
    },
    { collisions: 0, created: 0, updated: 0, unchanged: 0 },
  );
}

export function formatOutputChangeSummary(counts: PreviewChangeCounts): string {
  const parts: string[] = [];
  if (counts.collisions > 0) {
    parts.push(`${counts.collisions} need attention`);
  }
  if (counts.created > 0) parts.push(`${counts.created} new`);
  if (counts.updated > 0) parts.push(`${counts.updated} updated`);
  if (counts.unchanged > 0) parts.push(`${counts.unchanged} same`);
  return parts.length > 0 ? parts.join(", ") : "No output changes";
}

export function formatValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && "value" in value && "unit" in value) {
    return `${String((value as { value: unknown }).value)}${String((value as { unit: unknown }).unit)}`;
  }
  return JSON.stringify(value);
}

export function PreviewPanel({
  preview,
  targetCollection,
  focusedDiagnosticId,
  compact = false,
  onNavigateToToken,
}: {
  preview: TokenGeneratorPreviewResult | null;
  targetCollection: TokenCollection | undefined;
  focusedDiagnosticId?: string;
  compact?: boolean;
  onNavigateToToken: (path: string) => void;
}) {
  if (!preview) {
    return (
      <div
        className={`flex h-full items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--color-figma-bg-secondary)_34%,var(--color-figma-bg))] p-3 text-center text-secondary text-[color:var(--color-figma-text-secondary)] ${
          compact ? "min-h-[120px]" : "min-h-[220px]"
        }`}
      >
        Preparing output preview.
      </div>
    );
  }

  const modes =
    targetCollection?.modes.map((mode) => mode.name) ?? preview.targetModes;
  const outputGroups = groupPreviewOutputs(preview.outputs);
  const focusedDiagnostic = preview.diagnostics.find(
    (diagnostic) => diagnostic.id === focusedDiagnosticId,
  );
  const changeCounts = countPreviewChanges(preview.outputs);

  return (
    <div className="space-y-3">
      <PreviewChangeSummary counts={changeCounts} compact={compact} />
      {preview.diagnostics.length > 0 && (
        <div className="space-y-1">
          {preview.diagnostics.map((diagnostic) => (
            <div
              key={diagnostic.id}
              className={`rounded-md bg-[var(--color-figma-bg-secondary)] p-2 text-secondary ${
                focusedDiagnosticId === diagnostic.id
                  ? "ring-1 ring-[var(--color-figma-accent)]"
                  : ""
              }`}
            >
              <span className="font-medium capitalize">
                {diagnostic.severity}
              </span>
              <span className="text-[color:var(--color-figma-text-secondary)]">
                {" "}
                - {diagnostic.message}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {preview.outputs.length === 0 ? (
          <div className="rounded-md bg-[var(--color-figma-bg-secondary)] p-2 text-secondary text-[color:var(--color-figma-text-error)]">
            No tokens will be created. Adjust the generator and wait for the
            preview to refresh.
          </div>
        ) : null}
        {outputGroups.map((group) => (
          <section key={group.id} className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-secondary font-semibold text-[color:var(--color-figma-text)]">
                {group.label}
              </h3>
              <span className="text-tertiary text-[color:var(--color-figma-text-secondary)]">
                {group.outputs.length}
              </span>
            </div>
            {compact ? (
              <PreviewOutputStack
                outputs={group.outputs}
                modes={modes}
                focusedNodeId={focusedDiagnostic?.nodeId}
                onNavigateToToken={onNavigateToToken}
              />
            ) : (
              <PreviewOutputTable
                outputs={group.outputs}
                modes={modes}
                focusedNodeId={focusedDiagnostic?.nodeId}
                onNavigateToToken={onNavigateToToken}
              />
            )}
          </section>
        ))}
        {preview.outputs.length === 0 && (
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            No outputs yet. Add an output node and connect a value.
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewChangeSummary({
  counts,
  compact,
}: {
  counts: PreviewChangeCounts;
  compact: boolean;
}) {
  const items = [
    {
      label: "Attention",
      value: counts.collisions,
      tone: "error",
      hidden: counts.collisions === 0,
    },
    { label: "New", value: counts.created, tone: "success", hidden: false },
    { label: "Updated", value: counts.updated, tone: "accent", hidden: false },
    { label: "Same", value: counts.unchanged, tone: "muted", hidden: false },
  ] as const;
  const toneClass: Record<(typeof items)[number]["tone"], string> = {
    error: "bg-[color-mix(in_srgb,var(--color-figma-error)_12%,var(--color-figma-bg-secondary))] text-[color:var(--color-figma-text-error)]",
    success: "bg-[color-mix(in_srgb,var(--color-figma-success)_16%,var(--color-figma-bg-secondary))] text-[color:var(--color-figma-text-success)]",
    accent: "bg-[color-mix(in_srgb,var(--color-figma-accent)_14%,var(--color-figma-bg-secondary))] text-[color:var(--color-figma-text-accent)]",
    muted: "bg-[var(--surface-muted)] text-[color:var(--color-figma-text-secondary)]",
  };

  return (
    <div
      className={`grid gap-1.5 ${
        compact ? "grid-cols-2" : "grid-cols-[repeat(auto-fit,minmax(96px,1fr))]"
      }`}
    >
      {items
        .filter((item) => !item.hidden)
        .map((item) => (
          <div
            key={item.label}
            className={`rounded-md px-2 py-1.5 ${toneClass[item.tone]}`}
          >
            <div className="text-primary font-semibold leading-tight">
              {item.value}
            </div>
            <div className="truncate text-tertiary font-medium leading-tight">
              {item.label}
            </div>
          </div>
        ))}
    </div>
  );
}

function PreviewOutputTable({
  outputs,
  modes,
  focusedNodeId,
  onNavigateToToken,
}: {
  outputs: TokenGeneratorPreviewOutput[];
  modes: string[];
  focusedNodeId?: string;
  onNavigateToToken: (path: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md bg-[var(--color-figma-bg-secondary)]">
      <table className="min-w-full border-separate border-spacing-0 text-left text-secondary">
        <thead>
          <tr className="text-tertiary text-[color:var(--color-figma-text-secondary)]">
            <th className="sticky left-0 z-[1] min-w-[200px] bg-[var(--color-figma-bg-secondary)] px-2 py-2 font-medium">
              Token
            </th>
            {modes.map((modeName) => (
              <th
                key={modeName}
                className="min-w-[150px] px-2 py-2 font-medium"
              >
                {modeName}
              </th>
            ))}
            <th className="min-w-[90px] px-2 py-2 font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {outputs.map((output) => (
            <PreviewOutputRow
              key={output.path}
              output={output}
              modes={modes}
              focused={focusedNodeId === output.nodeId}
              onNavigateToToken={onNavigateToToken}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewOutputRow({
  output,
  modes,
  focused,
  onNavigateToToken,
}: {
  output: TokenGeneratorPreviewOutput;
  modes: string[];
  focused: boolean;
  onNavigateToToken: (path: string) => void;
}) {
  return (
    <tr className={focused ? "ring-1 ring-[var(--color-figma-accent)]" : ""}>
      <td className="sticky left-0 z-[1] max-w-[260px] bg-[var(--color-figma-bg-secondary)] px-2 py-2 align-top">
        <PreviewOutputPath
          output={output}
          variant="table"
          onNavigateToToken={onNavigateToToken}
        />
      </td>
      {modes.map((modeName) => (
        <td
          key={modeName}
          className="px-2 py-2 align-top text-[color:var(--color-figma-text)]"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {previewIsValueBearing(output.type) ? (
              <ValuePreview
                type={output.type}
                value={output.modeValues[modeName]}
                size={14}
              />
            ) : null}
            <span className="truncate">
              {formatValue(output.modeValues[modeName])}
            </span>
          </span>
        </td>
      ))}
      <td className={`px-2 py-2 align-top text-tertiary ${changeToneClass(output)}`}>
        {output.collision ? "manual token" : output.change}
      </td>
    </tr>
  );
}

function PreviewOutputStack({
  outputs,
  modes,
  focusedNodeId,
  onNavigateToToken,
}: {
  outputs: TokenGeneratorPreviewOutput[];
  modes: string[];
  focusedNodeId?: string;
  onNavigateToToken: (path: string) => void;
}) {
  return (
    <div className="space-y-1">
      {outputs.map((output) => (
        <div
          key={output.path}
          className={`rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-2 text-secondary ${
            focusedNodeId === output.nodeId
              ? "ring-1 ring-[var(--color-figma-accent)]"
              : ""
          }`}
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <PreviewOutputPath
                output={output}
                variant="stack"
                onNavigateToToken={onNavigateToToken}
              />
            </div>
            <span className={`shrink-0 text-tertiary ${changeToneClass(output)}`}>
              {output.collision ? "manual" : output.change}
            </span>
          </div>
          <div className="mt-2 grid gap-1">
            {modes.map((modeName) => (
              <div
                key={modeName}
                className="flex min-w-0 items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
                  {modeName}
                </span>
                <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-[color:var(--color-figma-text)]">
                  {previewIsValueBearing(output.type) ? (
                    <ValuePreview
                      type={output.type}
                      value={output.modeValues[modeName]}
                      size={13}
                    />
                  ) : null}
                  <span className="truncate text-right">
                    {formatValue(output.modeValues[modeName])}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PreviewOutputPath({
  output,
  variant,
  onNavigateToToken,
}: {
  output: TokenGeneratorPreviewOutput;
  variant: "stack" | "table";
  onNavigateToToken: (path: string) => void;
}) {
  const pathClass =
    variant === "stack"
      ? "block truncate font-semibold text-[color:var(--color-figma-text)]"
      : "block truncate font-medium";
  const buttonClass =
    variant === "stack"
      ? "block max-w-full truncate text-left font-semibold text-[color:var(--color-figma-text)] hover:underline"
      : "block max-w-full truncate text-left font-medium hover:underline";

  return (
    <>
      {output.change === "created" ? (
        <span className={pathClass}>
          {output.path}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onNavigateToToken(output.path)}
          className={buttonClass}
        >
          {output.path}
        </button>
      )}
      {output.collision ? (
        <span className="mt-1 block text-tertiary text-[color:var(--color-figma-text-error)]">
          Manual token exists
        </span>
      ) : null}
    </>
  );
}

function changeToneClass(output: TokenGeneratorPreviewOutput): string {
  return output.collision
    ? "text-[color:var(--color-figma-text-error)]"
    : "text-[color:var(--color-figma-text-secondary)]";
}

function groupPreviewOutputs(outputs: TokenGeneratorPreviewResult["outputs"]) {
  const collisions = outputs.filter((output) => output.collision);
  const nonCollisions = outputs.filter((output) => !output.collision);
  return [
    { id: "collisions", label: "Needs attention", outputs: collisions },
    {
      id: "created",
      label: "New tokens",
      outputs: nonCollisions.filter((output) => output.change === "created"),
    },
    {
      id: "updated",
      label: "Updated tokens",
      outputs: nonCollisions.filter((output) => output.change === "updated"),
    },
    {
      id: "unchanged",
      label: "Unchanged tokens",
      outputs: nonCollisions.filter((output) => output.change === "unchanged"),
    },
  ].filter((group) => group.outputs.length > 0);
}
