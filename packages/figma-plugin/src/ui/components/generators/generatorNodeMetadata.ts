import type {
  TokenGeneratorDocument,
  TokenGeneratorDocumentNode,
} from "@token-workshop/core";
import {
  getTokenGeneratorOutputPorts,
  readStructuredGeneratorDraft,
} from "@token-workshop/core";
import { formatGeneratorValue as formatValue } from "./generatorValueFormat";

export interface CategorizedGeneratorPaletteItem {
  category: string;
}

export function isGeneratorInputNode(
  node: TokenGeneratorDocumentNode,
): boolean {
  return (
    node.kind === "tokenInput" ||
    node.kind === "literal" ||
    node.kind === "alias"
  );
}

export function isGeneratorOutputNode(
  node: TokenGeneratorDocumentNode,
): boolean {
  return node.kind === "groupOutput" || node.kind === "output";
}

export function readGeneratorOutputLabel(
  generator: TokenGeneratorDocument,
): string {
  const structured = readStructuredGeneratorDraft(generator);
  if (structured?.outputPrefix) return structured.outputPrefix;
  const destinations = readGeneratorDestinationLabels(generator);
  if (destinations.length === 0) return "No output";
  if (destinations.length === 1) return destinations[0]!;
  return `${destinations[0]} + ${destinations.length - 1} more`;
}

export function readGeneratorDestinationSearchLabel(
  generator: TokenGeneratorDocument,
): string {
  const structured = readStructuredGeneratorDraft(generator);
  if (structured?.outputPrefix) return structured.outputPrefix;
  return readGeneratorDestinationLabels(generator).join(" ");
}

export function readGeneratorDestinationLabels(
  generator: TokenGeneratorDocument,
): string[] {
  return generator.nodes
    .filter(isGeneratorOutputNode)
    .map((node) => String(node.data.pathPrefix ?? node.data.path ?? "").trim())
    .filter(Boolean);
}

export function readGeneratorStatusLabel(
  generator: TokenGeneratorDocument,
): string {
  const diagnostics = generator.lastApplyDiagnostics ?? [];
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "Needs attention";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "Applied with warnings";
  }
  return generator.lastAppliedAt ? "Applied" : "Not applied";
}

export function formatNodeKind(
  kind: TokenGeneratorDocumentNode["kind"],
): string {
  switch (kind) {
    case "tokenInput":
      return "Token input";
    case "groupOutput":
      return "Series output";
    case "colorRamp":
      return "Color ramp";
    case "spacingScale":
      return "Spacing scale";
    case "typeScale":
      return "Type scale";
    case "borderRadiusScale":
      return "Radius scale";
    case "opacityScale":
      return "Opacity scale";
    case "shadowScale":
      return "Shadow scale";
    case "zIndexScale":
      return "Z-index scale";
    case "customScale":
      return "Custom scale";
    default:
      return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

export function nodeSummary(node: TokenGeneratorDocumentNode): string {
  if (node.kind === "tokenInput") {
    return String(node.data.path || "Choose token");
  }
  if (node.kind === "literal") return formatValue(node.data.value);
  if (node.kind === "math") {
    return `${node.data.operation ?? "add"} ${node.data.amount ?? ""}`.trim();
  }
  if (node.kind === "color") return String(node.data.operation ?? "lighten");
  if (node.kind === "formula") return String(node.data.expression ?? "Formula");
  if (node.kind === "colorRamp") return "Mode-aware color series";
  if (node.kind === "spacingScale") return "Spacing series";
  if (node.kind === "typeScale") return "Type series";
  if (node.kind === "borderRadiusScale") return "Radius series";
  if (node.kind === "opacityScale") return "Opacity series";
  if (node.kind === "shadowScale") return "Shadow series";
  if (node.kind === "zIndexScale") return "Z-index series";
  if (node.kind === "customScale") return "Formula series";
  if (node.kind === "output") return String(node.data.path || "Output path");
  if (node.kind === "groupOutput") {
    return String(node.data.pathPrefix || "Output series");
  }
  return node.kind;
}

export function nodeInspectorNote(
  node: TokenGeneratorDocumentNode,
): string | null {
  if (node.kind === "output") {
    return "Use this when the graph ends in one value. It creates one token at the path below.";
  }
  if (node.kind === "groupOutput") {
    return "Use this for ramps and scales. It creates one token per item in the connected series.";
  }
  if (
    getTokenGeneratorOutputPorts(node).some((port) => port.shape === "list")
  ) {
    return "This node outputs a series. Connect it to Series output to create one token per item.";
  }
  return null;
}

export function contextualPaletteItems<
  T extends CategorizedGeneratorPaletteItem,
>(
  palette: readonly T[],
  selectedNode: TokenGeneratorDocumentNode | null,
  generator: TokenGeneratorDocument | null,
): T[] {
  if (!generator) {
    return palette.filter(
      (item) => item.category === "Inputs" || item.category === "Scales",
    );
  }
  if (!selectedNode) {
    return palette.filter((item) => {
      if (item.category === "Inputs" || item.category === "Scales") {
        return true;
      }
      return item.category === "Outputs";
    });
  }
  if (
    selectedNode.kind === "tokenInput" ||
    selectedNode.kind === "literal" ||
    selectedNode.kind === "alias"
  ) {
    return palette.filter(
      (item) =>
        item.category === "Math" ||
        item.category === "Color" ||
        item.category === "Scales" ||
        item.category === "Outputs",
    );
  }
  if (selectedNode.kind === "output" || selectedNode.kind === "groupOutput") {
    return palette.filter(
      (item) => item.category === "Inputs" || item.category === "Scales",
    );
  }
  return palette.filter(
    (item) =>
      item.category === "Outputs" ||
      item.category === "Math" ||
      item.category === "Color",
  );
}
