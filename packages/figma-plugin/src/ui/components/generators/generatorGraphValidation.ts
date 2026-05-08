import type {
  TokenGeneratorDocument,
  TokenGeneratorDocumentNode,
  TokenGeneratorPreviewResult,
} from "@token-workshop/core";
import {
  checkTokenGeneratorConnection,
  getTokenGeneratorInputPorts,
  validateStepName as validateGeneratorStepName,
  getTokenGeneratorOutputPorts,
} from "@token-workshop/core";
import type { TokenMapEntry } from "../../../shared/types";
import { validateGeneratorTokenPath } from "./generatorValidation";

export interface GraphIssue {
  id: string;
  nodeId?: string;
  edgeId?: string;
  targetPort?: string;
  severity: "error" | "warning" | "info";
  message: string;
}

export function collectGraphIssues(
  generator: TokenGeneratorDocument,
  preview: TokenGeneratorPreviewResult | null,
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodeById = new Map(generator.nodes.map((node) => [node.id, node]));
  const incomingEdgesByPort = new Map<string, typeof generator.edges>();
  const targetTokens = perCollectionFlat[generator.targetCollectionId] ?? {};

  for (const node of generator.nodes) {
    if (node.kind === "tokenInput" && !String(node.data.path ?? "").trim()) {
      issues.push({
        id: `${node.id}-token`,
        nodeId: node.id,
        severity: "error",
        message: "Choose a source token",
      });
    }

    if (
      node.kind === "literal" &&
      !Object.prototype.hasOwnProperty.call(readNodeTokenRefs(node), "value") &&
      String(node.data.value ?? "").trim() === ""
    ) {
      issues.push({
        id: `${node.id}-literal`,
        nodeId: node.id,
        severity: "warning",
        message: "Add a source value",
      });
    }

    if (node.kind === "groupOutput") {
      const pathError = validateGeneratorTokenPath(String(node.data.pathPrefix ?? ""));
      if (pathError) {
        issues.push({
          id: `${node.id}-output`,
          nodeId: node.id,
          severity: "error",
          message: pathError,
        });
      }
    }

    if (node.kind === "output") {
      const pathError = validateGeneratorTokenPath(String(node.data.path ?? ""));
      if (pathError) {
        issues.push({
          id: `${node.id}-path`,
          nodeId: node.id,
          severity: "error",
          message: pathError,
        });
      }
    }

    collectTokenRefIssues(node, issues, targetTokens);
    collectFormulaIssues(node, issues, targetTokens);
    collectStepIssues(node, issues);
    collectListIssues(node, issues, targetTokens);

    if (
      (node.kind === "output" || node.kind === "groupOutput") &&
      !generator.edges.some((edge) => edge.to.nodeId === node.id)
    ) {
      issues.push({
        id: `${node.id}-disconnected`,
        nodeId: node.id,
        targetPort: "value",
        severity: "error",
        message: "Connect an input",
      });
    }

    if (node.kind !== "output" && node.kind !== "groupOutput") {
      const requiredValuePort = getTokenGeneratorInputPorts(node).find(
        (port) => port.id === "value",
      );
      if (
        requiredValuePort &&
        !generator.edges.some(
          (edge) =>
            edge.to.nodeId === node.id && edge.to.port === requiredValuePort.id,
        )
      ) {
        issues.push({
          id: `${node.id}-missing-${requiredValuePort.id}`,
          nodeId: node.id,
          targetPort: requiredValuePort.id,
          severity: "error",
          message: `Connect ${requiredValuePort.label.toLowerCase()}`,
        });
      }
    }
  }

  for (const edge of generator.edges) {
    const sourceNode = nodeById.get(edge.from.nodeId);
    const targetNode = nodeById.get(edge.to.nodeId);
    if (!sourceNode || !targetNode) {
      issues.push({
        id: `${edge.id}-missing-node`,
        edgeId: edge.id,
        severity: "error",
        message: "Connection references a missing node",
      });
      continue;
    }

    const sourcePorts = getTokenGeneratorOutputPorts(sourceNode);
    const targetPorts = getTokenGeneratorInputPorts(targetNode);
    let missingPort = false;
    if (!sourcePorts.some((port) => port.id === edge.from.port)) {
      missingPort = true;
      issues.push({
        id: `${edge.id}-source-port`,
        nodeId: sourceNode.id,
        edgeId: edge.id,
        severity: "error",
        message: "Connection starts from an unavailable output",
      });
    }
    if (!targetPorts.some((port) => port.id === edge.to.port)) {
      missingPort = true;
      issues.push({
        id: `${edge.id}-target-port`,
        nodeId: targetNode.id,
        edgeId: edge.id,
        severity: "error",
        message: "Connection targets an unavailable input",
      });
    }
    if (missingPort) continue;

    const compatibility = checkTokenGeneratorConnection(generator, {
      sourceNodeId: edge.from.nodeId,
      sourcePort: edge.from.port,
      targetNodeId: edge.to.nodeId,
      targetPort: edge.to.port,
      edges: generator.edges,
    });
    if (!compatibility.valid) {
      issues.push({
        id: `${edge.id}-incompatible`,
        nodeId: targetNode.id,
        edgeId: edge.id,
        targetPort: edge.to.port,
        severity: "error",
        message: compatibility.reason ?? "Connection is not compatible.",
      });
    }

    const portKey = `${targetNode.id}:${edge.to.port}`;
    incomingEdgesByPort.set(portKey, [
      ...(incomingEdgesByPort.get(portKey) ?? []),
      edge,
    ]);
  }

  for (const incomingEdges of incomingEdgesByPort.values()) {
    if (incomingEdges.length <= 1) continue;
    const [{ to }] = incomingEdges;
    issues.push({
      id: `${to.nodeId}-${to.port}-multiple-inputs`,
      nodeId: to.nodeId,
      severity: "error",
      message: "Input has multiple connections. Reconnect it to choose one source.",
    });
  }

  for (const diagnostic of preview?.diagnostics ?? []) {
    issues.push({
      id: diagnostic.id,
      nodeId: diagnostic.nodeId,
      edgeId: diagnostic.edgeId,
      severity: diagnostic.severity,
      message: diagnostic.message,
    });
  }

  if (
    !generator.nodes.some(
      (node) => node.kind === "output" || node.kind === "groupOutput",
    )
  ) {
    issues.push({
      id: "missing-output",
      severity: "error",
      message: "Add an output node",
    });
  }

  return issues;
}

function collectTokenRefIssues(
  node: TokenGeneratorDocumentNode,
  issues: GraphIssue[],
  targetTokens: Record<string, TokenMapEntry>,
): void {
  const supportedFields = supportedTokenRefTypes(node);
  for (const [field, path] of Object.entries(readNodeTokenRefs(node))) {
    const supportedTypes = supportedFields[field];
    if (!supportedTypes) {
      issues.push({
        id: `${node.id}-token-ref-${field}-unsupported`,
        nodeId: node.id,
        severity: "error",
        message: `${field} cannot use a token reference`,
      });
      continue;
    }

    const cleanPath = cleanTokenRefPath(path);
    if (!cleanPath) {
      issues.push({
        id: `${node.id}-token-ref-${field}`,
        nodeId: node.id,
        severity: "error",
        message: `Choose a token for ${field}`,
      });
      continue;
    }

    const token = targetTokens[cleanPath];
    if (!token) {
      issues.push({
        id: `${node.id}-token-ref-${field}-missing`,
        nodeId: node.id,
        severity: "error",
        message: `Token "${cleanPath}" was not found`,
      });
      continue;
    }

    if (!supportedTypes.includes(token.$type)) {
      issues.push({
        id: `${node.id}-token-ref-${field}-type`,
        nodeId: node.id,
        severity: "error",
        message: `${field} needs ${supportedTypes.join(" or ")}, not ${token.$type}`,
      });
    }
  }
}

function supportedTokenRefTypes(node: TokenGeneratorDocumentNode): Record<string, string[]> {
  if (node.kind === "literal") {
    const type = String(node.data.type ?? "string");
    if (type === "number") return { value: ["number", "dimension"] };
    if (type === "dimension") return { value: ["dimension", "number"] };
    return { value: [type] };
  }
  if (node.kind === "colorRamp") {
    return {
      lightEnd: ["number", "dimension"],
      darkEnd: ["number", "dimension"],
      chromaBoost: ["number", "dimension"],
    };
  }
  if (node.kind === "typeScale") return { ratio: ["number", "dimension"] };
  if (node.kind === "shadowScale") return { color: ["color"] };
  return {};
}

function collectFormulaIssues(
  node: TokenGeneratorDocumentNode,
  issues: GraphIssue[],
  targetTokens: Record<string, TokenMapEntry>,
): void {
  const formula =
    node.kind === "formula"
      ? String(node.data.expression ?? "")
      : node.kind === "customScale"
        ? String(node.data.formula ?? "")
        : "";
  if (!formula) return;

  const openCount = (formula.match(/\{/g) ?? []).length;
  const closeCount = (formula.match(/\}/g) ?? []).length;
  if (openCount !== closeCount) {
    issues.push({
      id: `${node.id}-formula-braces`,
      nodeId: node.id,
      severity: "error",
      message: "Formula has an unclosed token reference",
    });
    return;
  }

  for (const path of formula.matchAll(/\{([^}]+)\}/g)) {
    const cleanPath = cleanTokenRefPath(path[1] ?? "");
    const token = targetTokens[cleanPath];
    if (!token) {
      issues.push({
        id: `${node.id}-formula-${cleanPath || "empty"}-missing`,
        nodeId: node.id,
        severity: "error",
        message: `Formula token "${cleanPath || "empty"}" was not found`,
      });
      continue;
    }
    if (token.$type !== "number" && token.$type !== "dimension") {
      issues.push({
        id: `${node.id}-formula-${cleanPath}-type`,
        nodeId: node.id,
        severity: "error",
        message: `Formula token "${cleanPath}" needs number or dimension, not ${token.$type}`,
      });
    }
  }
}

function collectStepIssues(
  node: TokenGeneratorDocumentNode,
  issues: GraphIssue[],
): void {
  if (node.kind === "colorRamp") {
    validateNumberStepRows(node, issues, node.data.steps);
    return;
  }
  if (node.kind === "spacingScale") {
    validateNamedStepRows(node, issues, node.data.steps, ["multiplier"]);
    return;
  }
  if (node.kind === "typeScale") {
    validateNamedStepRows(node, issues, node.data.steps, ["exponent"]);
    return;
  }
  if (node.kind === "borderRadiusScale") {
    validateNamedStepRows(
      node,
      issues,
      node.data.steps,
      ["multiplier"],
      ["exactValue"],
    );
    return;
  }
  if (node.kind === "opacityScale" || node.kind === "zIndexScale") {
    validateNamedStepRows(node, issues, node.data.steps, ["value"]);
    return;
  }
  if (node.kind === "shadowScale") {
    validateNamedStepRows(
      node,
      issues,
      node.data.steps,
      ["offsetX", "offsetY", "blur", "spread", "opacity"],
    );
    return;
  }
  if (node.kind === "customScale") {
    validateNamedStepRows(node, issues, node.data.steps, ["index"], ["multiplier"]);
  }
}

function collectListIssues(
  node: TokenGeneratorDocumentNode,
  issues: GraphIssue[],
  targetTokens: Record<string, TokenMapEntry>,
): void {
  if (node.kind !== "list") return;

  const items = Array.isArray(node.data.items) ? node.data.items : [];
  const keys = items.map((item, index) => listItemKey(item, index));
  const duplicates = duplicateStrings(keys);
  const type = String(node.data.type ?? "number");
  items.forEach((item, index) => {
    const key = keys[index] ?? "";
    const pathIssue = validatePathSegment(key, duplicates);
    if (pathIssue) {
      issues.push({
        id: `${node.id}-list-${index}-key`,
        nodeId: node.id,
        severity: "error",
        message: `List item ${index + 1}: ${pathIssue}`,
      });
    }

    const value = listItemValue(item);
    const valueIssue = validateListValue(type, value, item, targetTokens);
    if (valueIssue) {
      issues.push({
        id: `${node.id}-list-${index}-value`,
        nodeId: node.id,
        severity: "error",
        message: `List item ${index + 1}: ${valueIssue}`,
      });
    }
  });
}

function readNodeTokenRefs(node: TokenGeneratorDocumentNode): Record<string, string> {
  return readGeneratorTokenRefs(node.data.$tokenRefs);
}

function readGeneratorTokenRefs(value: unknown): Record<string, string> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {};
}

function validateNumberStepRows(
  node: TokenGeneratorDocumentNode,
  issues: GraphIssue[],
  value: unknown,
): void {
  const steps = Array.isArray(value) ? value : [];
  const names = steps.map((step) => String(step ?? ""));
  const duplicates = duplicateStrings(names);
  steps.forEach((step, index) => {
    if (!isFiniteNumberLike(step)) {
      issues.push({
        id: `${node.id}-step-${index}-value`,
        nodeId: node.id,
        severity: "error",
        message: `Step ${index + 1}: value must be a finite number`,
      });
      return;
    }

    const pathIssue = validatePathSegment(String(step), duplicates);
    if (pathIssue) {
      issues.push({
        id: `${node.id}-step-${index}-path`,
        nodeId: node.id,
        severity: "error",
        message: `Step ${index + 1}: ${pathIssue}`,
      });
    }
  });
}

function validateNamedStepRows(
  node: TokenGeneratorDocumentNode,
  issues: GraphIssue[],
  value: unknown,
  numberKeys: string[],
  optionalNumberKeys: string[] = [],
): void {
  const steps = asRecordArray(value);
  const names = steps.map((step) => String(step.name ?? ""));
  const duplicates = duplicateStrings(names);
  steps.forEach((step, index) => {
    const name = names[index] ?? "";
    const pathIssue = validatePathSegment(name, duplicates);
    if (pathIssue) {
      issues.push({
        id: `${node.id}-step-${index}-name`,
        nodeId: node.id,
        severity: "error",
        message: `Step "${name || index + 1}": ${pathIssue}`,
      });
    }

    for (const key of numberKeys) {
      if (isFiniteNumberLike(step[key])) continue;
      issues.push({
        id: `${node.id}-step-${index}-${key}`,
        nodeId: node.id,
        severity: "error",
        message: `Step "${name || index + 1}": ${key} must be a finite number`,
      });
    }

    for (const key of optionalNumberKeys) {
      if (step[key] == null || step[key] === "" || isFiniteNumberLike(step[key])) continue;
      issues.push({
        id: `${node.id}-step-${index}-${key}`,
        nodeId: node.id,
        severity: "error",
        message: `Step "${name || index + 1}": ${key} must be a finite number`,
      });
    }
  });
}

function validatePathSegment(name: string, duplicates: Set<string>): string | null {
  try {
    validateGeneratorStepName(name);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  if (duplicates.has(name)) return "name must be unique";
  return null;
}

function cleanTokenRefPath(path: string): string {
  return path.trim().replace(/^\{|\}$/g, "");
}

function duplicateStrings(values: string[]): Set<string> {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return duplicate;
}

function isFiniteNumberLike(value: unknown): boolean {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric);
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isPlainRecord)
    ? value
    : [];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function listItemKey(item: unknown, index: number): string {
  if (isPlainRecord(item)) {
    return String(item.key ?? item.label ?? index + 1);
  }
  return String(index + 1);
}

function listItemValue(item: unknown): unknown {
  return isPlainRecord(item) && "value" in item ? item.value : item;
}

function validateListValue(
  type: string,
  value: unknown,
  item: unknown,
  targetTokens: Record<string, TokenMapEntry>,
): string | null {
  if (type === "number" && !isFiniteNumberLike(value)) {
    return "value must be a finite number";
  }

  if (type === "dimension") {
    if (!isPlainRecord(value)) {
      return "value must be a dimension";
    }
    if (
      !isFiniteNumberLike(value.value) ||
      typeof value.unit !== "string" ||
      !value.unit.trim()
    ) {
      return "value must be a finite dimension";
    }
  }

  if (type === "boolean" && !isBooleanLike(value)) {
    return "value must be true or false";
  }

  if (type === "token") {
    if (!/^\{[^}]+\}$/.test(String(value ?? ""))) return "choose a token";
    const path = cleanTokenRefPath(String(value ?? ""));
    const token = targetTokens[path];
    if (!token) return `token "${path}" was not found`;
    if (isPlainRecord(item)) {
      const itemType = item.type;
      if (typeof itemType === "string" && itemType !== "token" && itemType !== token.$type) {
        return `token "${path}" is ${token.$type}, not ${itemType}`;
      }
    }
  }

  return null;
}

function isBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return value === 0 || value === 1;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "false" ||
    normalized === "true" ||
    normalized === "0" ||
    normalized === "1"
  );
}
