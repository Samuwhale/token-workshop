import { AlertTriangle } from "lucide-react";
import type {
  TokenCollection,
  TokenGeneratorDocument,
  TokenGeneratorDocumentNode,
  TokenGeneratorPreviewResult,
} from "@token-workshop/core";
import {
  generatorTemplateLabel,
  readGeneratorProvenance,
  readStructuredGeneratorDraft,
} from "@token-workshop/core";
import type { TokenMapEntry } from "../../../shared/types";
import { ValuePreview, previewIsValueBearing } from "../ValuePreview";
import {
  countPreviewChanges,
  formatOutputChangeSummary,
  withRemovedPreviewChanges,
} from "./GeneratorPreviewPanel";
import { formatGeneratorValue as formatValue } from "./generatorValueFormat";
import type { GraphIssue } from "./generatorGraphValidation";
import { collectGraphIssues } from "./generatorGraphValidation";
import { generatorWithInferredTokenInputTypes } from "./generatorGraphFlow";
import type { FullGeneratorStatusItem } from "../../shared/generatorStatus";
import {
  formatNodeKind,
  isGeneratorInputNode,
  isGeneratorOutputNode,
  readGeneratorDestinationSearchLabel,
  readGeneratorOutputLabel,
  readGeneratorStatusLabel,
} from "./generatorNodeMetadata";

export type GeneratorSelectorIssueTone = "error" | "warning" | "neutral";

export interface GeneratorSelectorRow {
  generator: TokenGeneratorDocument;
  status?: FullGeneratorStatusItem;
  graphIssues: GraphIssue[];
  sourceLabel: string;
  recipeLabel: string;
  outputLabel: string;
  outputTitle: string;
  outputChangeLabel: string;
  statusLabel: string;
  issueCount: number;
  issueTone: GeneratorSelectorIssueTone;
  collectionLabel: string;
  searchText: string;
  sortRank: number;
}

export function findGeneratorOwnedPathsToRemove({
  generatorId,
  targetCollectionId,
  preview,
  perCollectionFlat,
}: {
  generatorId: string | null;
  targetCollectionId: string | null;
  preview: TokenGeneratorPreviewResult | null;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
}): string[] {
  if (!generatorId || !targetCollectionId || !preview) {
    return [];
  }

  const previewOutputPaths = new Set(
    preview.outputs.map((output) => output.path),
  );
  return Object.entries(perCollectionFlat[targetCollectionId] ?? {})
    .filter(([, token]) => {
      const provenance = readGeneratorProvenance(token);
      return provenance?.generatorId === generatorId;
    })
    .map(([path]) => path)
    .filter((path) => !previewOutputPaths.has(path))
    .sort((a, b) => a.localeCompare(b));
}

export function readCollectionLabel(
  collection: TokenCollection | undefined,
): string {
  if (!collection) return "Unknown collection";
  return collection.publishRouting?.collectionName?.trim() || collection.id;
}

export function formatCount(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatGeneratorCollectionMeta(
  generatorCount: number,
  outputCount: number | null,
): string {
  const generatorLabel = formatCount(generatorCount, "generator");
  if (outputCount === null) return `${generatorLabel} · refreshing outputs`;
  return `${generatorLabel} · ${formatCount(outputCount, "output")}`;
}

function readLiteralNodeValue(node: TokenGeneratorDocumentNode): string {
  if (
    node.kind === "literal" &&
    node.data.type === "dimension" &&
    typeof node.data.value === "number" &&
    typeof node.data.unit === "string"
  ) {
    return `${node.data.value}${node.data.unit}`;
  }
  return formatValue(node.data.value);
}

function readGeneratorSourceLabel(
  generator: TokenGeneratorDocument,
  collectionLabelById: Map<string, string>,
): string {
  const structured = readStructuredGeneratorDraft(generator);
  if (structured) {
    if (structured.sourceMode === "token") {
      const collectionLabel = structured.sourceCollectionId
        ? collectionLabelById.get(structured.sourceCollectionId)
        : null;
      const sourceToken = structured.sourceTokenPath || "Choose source token";
      return collectionLabel
        ? `${sourceToken} · ${collectionLabel}`
        : sourceToken;
    }
    if (structured.sourceValue) return structured.sourceValue;
    return "Configured values";
  }

  const sourceNodes = generator.nodes.filter(isGeneratorInputNode);
  if (sourceNodes.length === 0) {
    return generator.nodes.length === 0 ? "No source" : "Generated";
  }
  const labels = sourceNodes
    .map((node) => {
      if (node.kind === "tokenInput" || node.kind === "alias") {
        return String(node.data.path ?? "").trim();
      }
      return readLiteralNodeValue(node) || node.label;
    })
    .filter(Boolean);
  if (labels.length === 0) return "Generated";
  if (labels.length === 1) return labels[0]!;
  return `${labels[0]} + ${labels.length - 1} more`;
}

function readGeneratorRecipeLabel(generator: TokenGeneratorDocument): string {
  const structured = readStructuredGeneratorDraft(generator);
  if (structured) return generatorTemplateLabel(structured.kind);
  if (generator.nodes.length === 0) return "Blank graph";
  const stepCount = generator.nodes.filter(
    (node) => !isGeneratorInputNode(node) && !isGeneratorOutputNode(node),
  ).length;
  return stepCount > 0
    ? `Custom graph · ${formatCount(stepCount, "step")}`
    : "Custom graph";
}

function readGeneratorOutputChangeLabel(
  generator: TokenGeneratorDocument,
  status: FullGeneratorStatusItem | undefined,
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): string {
  if (!status) return "Refreshing preview";
  const deletedPaths = findGeneratorOwnedPathsToRemove({
    generatorId: generator.id,
    targetCollectionId: generator.targetCollectionId,
    preview: status.preview,
    perCollectionFlat,
  });
  const outputCount = status.preview.outputs.length;
  if (outputCount === 0 && deletedPaths.length === 0) return "No output";
  const counts = withRemovedPreviewChanges(
    countPreviewChanges(status.preview.outputs),
    deletedPaths.length,
  );
  return `${formatCount(outputCount, "output")} · ${formatOutputChangeSummary(counts)}`;
}

function readGeneratorSelectorStatusLabel(
  generator: TokenGeneratorDocument,
  status: FullGeneratorStatusItem | undefined,
  graphIssues: GraphIssue[],
): string {
  if (graphIssues.some((issue) => issue.severity === "error")) {
    return "Fix settings";
  }
  if (!status) return "Refreshing preview";
  if (
    status.preview.blocking ||
    status.preview.outputs.some((output) => output.collision)
  ) {
    return "Needs attention";
  }
  if (status.stale) return "Out of date";
  if (status.unapplied) return "Ready to apply";
  if (status.preview.outputs.length === 0) return "No output";
  return readGeneratorStatusLabel(generator);
}

function readGeneratorSelectorIssueTone(
  status: FullGeneratorStatusItem | undefined,
  graphIssues: GraphIssue[],
): GeneratorSelectorIssueTone {
  if (
    graphIssues.some((issue) => issue.severity === "error") ||
    status?.preview.blocking ||
    status?.preview.outputs.some((output) => output.collision)
  ) {
    return "error";
  }
  if (
    graphIssues.length > 0 ||
    status?.stale ||
    status?.unapplied ||
    status?.preview.outputs.length === 0 ||
    (status?.preview.diagnostics.length ?? 0) > 0
  ) {
    return "warning";
  }
  return "neutral";
}

function readGeneratorSelectorSortRank(
  status: FullGeneratorStatusItem | undefined,
  issueTone: GeneratorSelectorIssueTone,
): number {
  if (issueTone === "error") return 0;
  if (status?.stale || status?.unapplied || issueTone === "warning") return 1;
  if (!status) return 2;
  return 3;
}

export function buildGeneratorSelectorRow({
  generator,
  status,
  collectionLabelById,
  perCollectionFlat,
}: {
  generator: TokenGeneratorDocument;
  status?: FullGeneratorStatusItem;
  collectionLabelById: Map<string, string>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
}): GeneratorSelectorRow {
  const preview = status?.preview ?? null;
  const graphIssues = collectGraphIssues(
    generatorWithInferredTokenInputTypes(generator, perCollectionFlat),
    preview,
    perCollectionFlat,
  );
  const sourceLabel = readGeneratorSourceLabel(generator, collectionLabelById);
  const recipeLabel = readGeneratorRecipeLabel(generator);
  const outputLabel = readGeneratorOutputLabel(generator);
  const outputTitle = readGeneratorDestinationSearchLabel(generator);
  const outputChangeLabel = readGeneratorOutputChangeLabel(
    generator,
    status,
    perCollectionFlat,
  );
  const statusLabel = readGeneratorSelectorStatusLabel(
    generator,
    status,
    graphIssues,
  );
  const issueCount =
    graphIssues.length +
    (status?.preview.diagnostics.length ?? 0) +
    (status?.preview.outputs.filter((output) => output.collision).length ?? 0) +
    (status && status.preview.outputs.length === 0 ? 1 : 0);
  const issueTone = readGeneratorSelectorIssueTone(status, graphIssues);
  const collectionLabel =
    collectionLabelById.get(generator.targetCollectionId) ??
    "Unknown collection";
  const searchText = [
    generator.name,
    sourceLabel,
    recipeLabel,
    outputLabel,
    outputTitle,
    outputChangeLabel,
    statusLabel,
    collectionLabel,
  ]
    .join(" ")
    .toLowerCase();

  return {
    generator,
    status,
    graphIssues,
    sourceLabel,
    recipeLabel,
    outputLabel,
    outputTitle,
    outputChangeLabel,
    statusLabel,
    issueCount,
    issueTone,
    collectionLabel,
    searchText,
    sortRank: readGeneratorSelectorSortRank(status, issueTone),
  };
}

export function sortGeneratorSelectorRows(
  a: GeneratorSelectorRow,
  b: GeneratorSelectorRow,
): number {
  if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
  return a.generator.name.localeCompare(b.generator.name, undefined, {
    sensitivity: "base",
  });
}

export function formatGeneratorSelectorScopeSummary(
  rows: GeneratorSelectorRow[],
): string {
  if (rows.length === 0) return "No generators";
  const outputCountKnown = rows.every((row) => Boolean(row.status));
  const outputCount = outputCountKnown
    ? rows.reduce(
        (sum, row) => sum + (row.status?.preview.outputs.length ?? 0),
        0,
      )
    : null;
  const issueCount = rows.filter((row) => row.issueTone !== "neutral").length;
  const parts = [
    formatCount(rows.length, "generator"),
    outputCount === null
      ? "refreshing outputs"
      : formatCount(outputCount, "output"),
  ];
  if (issueCount > 0) {
    parts.push(
      `${issueCount} ${issueCount === 1 ? "needs attention" : "need attention"}`,
    );
  }
  return parts.join(" · ");
}

export function GeneratorSelectorRowDetails({
  row,
}: {
  row: GeneratorSelectorRow;
}) {
  const sourceNodes = row.generator.nodes.filter(isGeneratorInputNode);
  const outputNodes = row.generator.nodes.filter(isGeneratorOutputNode);
  const preview = row.status?.preview ?? null;
  const sampledOutputs = preview?.outputs.slice(0, 3) ?? [];
  const targetModes = preview?.targetModes ?? [];
  const remainingOutputCount = preview
    ? Math.max(0, preview.outputs.length - sampledOutputs.length)
    : 0;
  const diagnostics = [
    ...row.graphIssues.map((issue) => ({
      id: issue.id,
      severity: issue.severity,
      message: issue.message,
    })),
    ...(preview?.diagnostics ?? []),
  ];

  return (
    <div className="tm-generator-selector-row__details">
      <div className="tm-generator-selector-detail-grid">
        <section className="tm-generator-selector-detail-block">
          <h3>Inputs</h3>
          {sourceNodes.length > 0 ? (
            <div className="tm-generator-selector-node-list">
              {sourceNodes.map((node) => (
                <div key={node.id} className="tm-generator-selector-node-line">
                  <span className="tm-generator-selector-node-line__name">
                    {node.label}
                  </span>
                  <span className="tm-generator-selector-node-line__meta">
                    {formatNodeKind(node.kind)} ·{" "}
                    {node.kind === "literal"
                      ? readLiteralNodeValue(node)
                      : String(node.data.path ?? "").trim() || "No token"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p>{row.sourceLabel}</p>
          )}
        </section>

        <section className="tm-generator-selector-detail-block">
          <h3>Recipe</h3>
          <p>{row.recipeLabel}</p>
        </section>

        <section className="tm-generator-selector-detail-block">
          <h3>Outputs</h3>
          {preview ? (
            <p>{row.outputChangeLabel}</p>
          ) : outputNodes.length > 0 ? (
            <div className="tm-generator-selector-node-list">
              {outputNodes.map((node) => (
                <div key={node.id} className="tm-generator-selector-node-line">
                  <span className="tm-generator-selector-node-line__name">
                    {node.label}
                  </span>
                  <span className="tm-generator-selector-node-line__meta">
                    {String(
                      node.data.pathPrefix ?? node.data.path ?? "",
                    ).trim() || "No output path"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p>No output nodes</p>
          )}
        </section>
      </div>

      {diagnostics.length > 0 ? (
        <section className="tm-generator-selector-diagnostics">
          {diagnostics.slice(0, 4).map((diagnostic) => (
            <div
              key={diagnostic.id}
              className={`tm-generator-selector-diagnostic tm-generator-selector-diagnostic--${diagnostic.severity}`}
            >
              <AlertTriangle size={12} aria-hidden />
              <span>{diagnostic.message}</span>
            </div>
          ))}
        </section>
      ) : null}

      {sampledOutputs.length > 0 ? (
        <section className="tm-generator-selector-output-samples">
          {sampledOutputs.map((output) => (
            <div
              key={`${output.nodeId}:${output.outputKey}`}
              className="tm-generator-selector-output-sample"
            >
              <div className="tm-generator-selector-output-sample__header">
                <span title={output.path}>{output.path}</span>
                <span
                  className={`tm-generator-selector-output-sample__change tm-generator-selector-output-sample__change--${
                    output.collision ? "collision" : output.change
                  }`}
                >
                  {output.collision ? "Collision" : output.change}
                </span>
              </div>
              <div className="tm-generator-selector-mode-values">
                {targetModes.map((modeName) => {
                  const modeValue = output.modeValues[modeName];
                  return (
                    <div
                      key={modeName}
                      className="tm-generator-selector-mode-value"
                    >
                      <span className="tm-generator-selector-mode-value__mode">
                        {modeName}
                      </span>
                      <span className="tm-generator-selector-mode-value__value">
                        {previewIsValueBearing(output.type) ? (
                          <ValuePreview
                            type={output.type}
                            value={modeValue}
                            size={14}
                          />
                        ) : null}
                        <span title={formatValue(modeValue)}>
                          {formatValue(modeValue) || "Empty"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {remainingOutputCount > 0 ? (
            <div className="tm-generator-selector-output-more">
              {remainingOutputCount} more output
              {remainingOutputCount === 1 ? "" : "s"}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
