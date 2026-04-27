import { useMemo } from "react";
import {
  AlertTriangle,
  ExternalLink,
  RotateCw,
  SlidersHorizontal,
} from "lucide-react";
import {
  tokenNodeId,
  type DerivationGraphNode,
  type DerivationSourceEdge,
  type GraphModel,
  type GraphNode,
  type GraphNodeId,
} from "@tokenmanager/core";
import { Button, Section, Stack } from "../../../primitives";
import { summarizeDerivationOp } from "../derivationSummary";
import { NodeLabel } from "./shared";

interface DerivationInspectorProps {
  derivation: DerivationGraphNode;
  graph: GraphModel;
  onNavigateToToken: (path: string, collectionId: string) => void;
  onSelectNode: (nodeId: GraphNodeId | null) => void;
}

interface SourceRow {
  edge: DerivationSourceEdge;
  node: GraphNode;
}

export function DerivationInspector({
  derivation,
  graph,
  onNavigateToToken,
  onSelectNode,
}: DerivationInspectorProps) {
  const derivedTokenId = tokenNodeId(
    derivation.collectionId,
    derivation.derivedPath,
  );
  const derivedToken = graph.nodes.get(derivedTokenId);
  const sources = useMemo(
    () => collectDerivationSources(graph, derivation.id),
    [graph, derivation.id],
  );
  const primarySources = sources.filter((source) => !source.edge.paramLabel);
  const secondarySources = sources.filter((source) => source.edge.paramLabel);
  const sourceSummary =
    primarySources.length === 1
      ? `Modified from ${nodePlainLabel(primarySources[0].node)}`
      : primarySources.length > 1
        ? `${primarySources.length} mode-specific sources`
        : "Source missing";

  return (
    <Stack gap={5}>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
          aria-hidden
        >
          <SlidersHorizontal size={15} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="truncate font-medium text-[var(--color-figma-text)]"
            title={derivation.derivedPath}
          >
            {derivation.derivedPath}
          </div>
          <div
            className="truncate text-secondary text-[var(--color-figma-text-tertiary)]"
            title={sourceSummary}
          >
            {sourceSummary}
          </div>
        </div>
      </div>

      <HealthCallout derivation={derivation} />

      <Section title="Relationship" emphasis="secondary">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <div className="text-secondary text-[var(--color-figma-text-tertiary)]">
              Starts with
            </div>
            {primarySources.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {primarySources.map(({ edge, node }) => (
                  <li key={edge.id}>
                    <button
                      type="button"
                      onClick={() => onSelectNode(node.id)}
                      className="grid w-full min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] gap-2 rounded px-1.5 py-1 text-left text-secondary hover:bg-[var(--surface-hover)]"
                    >
                      <span
                        className="truncate text-[var(--color-figma-text-tertiary)]"
                        title={modeScopeLabel(edge.modeNames)}
                      >
                        {modeScopeLabel(edge.modeNames)}
                      </span>
                      <NodeLabel node={node} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
                No source found
              </span>
            )}
          </div>
          <div className="ml-1 flex min-h-4 items-center gap-1.5 text-secondary text-[var(--color-figma-text-tertiary)]">
            <span aria-hidden className="font-mono">
              {"->"}
            </span>
            <span>{derivation.ops.map(summarizeDerivationOp).join(", ")}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-secondary text-[var(--color-figma-text-tertiary)]">
              Creates
            </div>
            {derivedToken ? (
              <NodeLabel node={derivedToken} />
            ) : (
              <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
                Derived token is missing
              </span>
            )}
          </div>
        </div>
      </Section>

      {secondarySources.length > 0 ? (
        <Section title="Extra inputs" emphasis="secondary">
          <ul className="flex flex-col gap-1">
            {secondarySources.map(({ edge, node }) => (
              <li key={edge.id}>
                <button
                  type="button"
                  onClick={() => onSelectNode(node.id)}
                  className="flex w-full min-w-0 items-center gap-2 rounded px-1.5 py-1 text-left text-body hover:bg-[var(--surface-hover)]"
                >
                  <span className="w-12 shrink-0 text-secondary text-[var(--color-figma-text-tertiary)]">
                    {edge.paramLabel}
                  </span>
                  <NodeLabel node={node} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {derivation.swatchColor || derivation.valuePreview ? (
        <Section title="Result" emphasis="secondary">
          <div className="flex items-center gap-2">
            {derivation.swatchColor ? (
              <span
                className="h-5 w-5 shrink-0 rounded border border-[var(--color-figma-border)]"
                style={{ background: derivation.swatchColor }}
                aria-hidden
              />
            ) : null}
            <span
              className="min-w-0 flex-1 truncate font-mono text-secondary text-[var(--color-figma-text)]"
              title={derivation.valuePreview ?? derivation.swatchColor}
            >
              {derivation.valuePreview ?? derivation.swatchColor}
            </span>
          </div>
        </Section>
      ) : null}

      <Stack gap={2}>
        <Button
          variant="primary"
          onClick={() =>
            onNavigateToToken(derivation.derivedPath, derivation.collectionId)
          }
        >
          <ExternalLink size={11} strokeWidth={2} aria-hidden />
          Open derived token
        </Button>
        {primarySources[0]?.node.kind === "token" ? (
          <Button
            variant="secondary"
            onClick={() => onSelectNode(primarySources[0].node.id)}
          >
            Inspect source token
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}

function HealthCallout({ derivation }: { derivation: DerivationGraphNode }) {
  if (derivation.health === "broken") {
    return (
      <div className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--color-figma-error)_10%,transparent)] px-2.5 py-2 text-secondary text-[var(--color-figma-error)]">
        <AlertTriangle
          size={11}
          strokeWidth={2}
          aria-hidden
          className="mt-0.5 shrink-0"
        />
        <span>A source token used by this modified value is missing.</span>
      </div>
    );
  }
  if (derivation.health === "cycle") {
    return (
      <div className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--color-figma-warning)_12%,transparent)] px-2.5 py-2 text-secondary text-[var(--color-figma-warning)]">
        <RotateCw
          size={11}
          strokeWidth={2}
          aria-hidden
          className="mt-0.5 shrink-0"
        />
        <span>This modified value is part of a circular reference.</span>
      </div>
    );
  }
  return null;
}

function modeScopeLabel(modeNames: string[] | undefined): string {
  if (!modeNames || modeNames.length === 0) return "All modes";
  if (modeNames.length === 1) return modeNames[0];
  return `${modeNames[0]} +${modeNames.length - 1}`;
}

function nodePlainLabel(node: GraphNode): string {
  if (node.kind === "token" || node.kind === "ghost") return node.path;
  if (node.kind === "derivation") return node.derivedPath;
  return node.name;
}

function collectDerivationSources(
  graph: GraphModel,
  derivationId: GraphNodeId,
): SourceRow[] {
  return (graph.incoming.get(derivationId) ?? [])
    .map((edgeId) => graph.edges.get(edgeId))
    .filter((edge): edge is DerivationSourceEdge => edge?.kind === "derivation-source")
    .map((edge) => {
      const node = graph.nodes.get(edge.from);
      return node ? { edge, node } : null;
    })
    .filter((row): row is SourceRow => row !== null);
}
