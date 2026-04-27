import { useMemo } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCw,
} from "lucide-react";
import type {
  AliasEdge as AliasEdgeModel,
  GraphModel,
  GraphNodeId,
  TokenCollection,
} from "@tokenmanager/core";
import { Button, Section, Stack } from "../../../primitives";

interface AliasEdgeInspectorProps {
  graph: GraphModel;
  edge: AliasEdgeModel;
  collections: TokenCollection[];
  onNavigateToToken: (path: string, collectionId: string) => void;
  onSelectNode: (nodeId: GraphNodeId | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
}

export function AliasEdgeInspector({
  graph,
  edge,
  collections,
  onNavigateToToken,
  onSelectNode,
  onSelectEdge,
}: AliasEdgeInspectorProps) {
  const downstream = graph.nodes.get(edge.to);
  const upstream = graph.nodes.get(edge.from);
  const isCycle = Boolean(edge.inCycle);
  const isMissing = Boolean(edge.isMissingTarget);
  const isIssue = isCycle || isMissing || Boolean(edge.issueRules?.length);
  const downstreamCollection =
    downstream?.kind === "token"
      ? collections.find((collection) => collection.id === downstream.collectionId)
      : null;
  const allModeNames = downstreamCollection?.modes.map((mode) => mode.name) ?? [];
  const modeScope = describeModeScope(edge.modeNames, allModeNames);

  const issueQueue = useMemo(() => {
    if (!isIssue) return null;
    const ids: string[] = [];
    for (const e of graph.edges.values()) {
      if (e.kind !== "alias") continue;
      if (!(e.inCycle || e.isMissingTarget || e.issueRules?.length)) continue;
      ids.push(e.id);
    }
    if (ids.length <= 1) return null;
    const index = ids.indexOf(edge.id);
    if (index === -1) return null;
    const prev = ids[(index - 1 + ids.length) % ids.length];
    const next = ids[(index + 1) % ids.length];
    return { index, total: ids.length, prev, next };
  }, [graph, edge.id, isIssue]);

  return (
    <Stack gap={5}>
      <AliasChain
        downstream={downstream}
        upstream={upstream}
      />

      {isCycle ? (
        <div className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--color-figma-warning)_12%,transparent)] px-2.5 py-2 text-secondary text-[var(--color-figma-warning)]">
          <RotateCw
            size={11}
            strokeWidth={2}
            aria-hidden
            className="mt-0.5 shrink-0"
          />
          <span>This alias is part of a circular reference and cannot resolve.</span>
        </div>
      ) : isMissing ? (
        <div className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--color-figma-error)_10%,transparent)] px-2.5 py-2 text-secondary text-[var(--color-figma-error)]">
          <AlertTriangle
            size={11}
            strokeWidth={2}
            aria-hidden
            className="mt-0.5 shrink-0"
          />
          <span>The referenced token doesn't exist in scope.</span>
        </div>
      ) : null}

      {/* Show what the alias resolves to so users don't have to chase the chain.
          Skipped when the target is missing — the value is meaningless then. */}
      {upstream?.kind === "token" &&
      !isMissing &&
      (upstream.valuePreview || upstream.swatchColor) ? (
        <Section title="Resolves to" emphasis="secondary">
          <div className="flex items-center gap-2">
            {upstream.swatchColor ? (
              <span
                className="h-5 w-5 shrink-0 rounded border border-[var(--color-figma-border)]"
                style={{ background: upstream.swatchColor }}
                aria-hidden
              />
            ) : null}
            {upstream.valuePreview ? (
              <span
                className="min-w-0 flex-1 truncate font-mono text-secondary text-[var(--color-figma-text)]"
                title={upstream.valuePreview}
              >
                {upstream.valuePreview}
              </span>
            ) : null}
          </div>
        </Section>
      ) : null}

      {modeScope.names.length > 0 ? (
        <Section
          title={modeScope.title}
          emphasis="secondary"
        >
          <div className="mb-2 text-secondary text-[var(--color-figma-text-secondary)]">
            {modeScope.description}
          </div>
          <div className="flex flex-wrap gap-1">
            {modeScope.names.map((m) => (
              <span
                key={m}
                className="max-w-full truncate rounded-full bg-[var(--color-figma-bg-hover)] px-2 py-0.5 text-secondary text-[var(--color-figma-text)]"
                title={m}
              >
                {m}
              </span>
            ))}
          </div>
        </Section>
      ) : null}

      {issueQueue ? (
        <div className="flex items-center justify-between rounded-md bg-[var(--surface-muted)] px-2.5 py-1.5 text-secondary text-[var(--color-figma-text-secondary)]">
          <span>
            Issue {issueQueue.index + 1} of {issueQueue.total}
          </span>
          <span className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onSelectEdge(issueQueue.prev)}
              aria-label="Previous issue"
              title="Previous issue"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            >
              <ChevronLeft size={11} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onSelectEdge(issueQueue.next)}
              aria-label="Next issue"
              title="Next issue"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            >
              <ChevronRight size={11} strokeWidth={2} aria-hidden />
            </button>
          </span>
        </div>
      ) : null}

      <Stack gap={2}>
        {downstream?.kind === "token" ? (
          <Button
            variant="primary"
            onClick={() =>
              onNavigateToToken(downstream.path, downstream.collectionId)
            }
          >
            <ExternalLink size={11} strokeWidth={2} aria-hidden />
            Open {downstream.displayName}
          </Button>
        ) : null}
        {upstream?.kind === "token" ? (
          <Button variant="secondary" onClick={() => onSelectNode(upstream.id)}>
            Inspect referenced token
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}

function AliasChain({
  downstream,
  upstream,
}: {
  downstream: ReturnType<GraphModel["nodes"]["get"]>;
  upstream: ReturnType<GraphModel["nodes"]["get"]>;
}) {
  if (!downstream || !upstream) return null;
  return (
    <div className="flex flex-col gap-1">
      <ChainRow node={downstream} caption="Token with the alias" />
      <div className="ml-1 flex h-3 items-center gap-1.5 text-secondary text-[var(--color-figma-text-tertiary)]">
        <span aria-hidden className="font-mono">
          ↓
        </span>
        <span>reads from</span>
      </div>
      <ChainRow node={upstream} caption="Referenced token" />
    </div>
  );
}

function ChainRow({
  node,
  caption,
}: {
  node: NonNullable<ReturnType<GraphModel["nodes"]["get"]>>;
  caption: string;
}) {
  const isGhost = node.kind === "ghost";
  const label =
    node.kind === "token"
      ? node.path
      : node.kind === "generator"
        ? node.name
        : node.kind === "derivation"
          ? node.derivedPath
          : node.path;
  return (
    <div className="flex flex-col">
      <div className="text-secondary text-[var(--color-figma-text-tertiary)]">
        {caption}
      </div>
      <div
        className={`truncate font-mono text-[var(--color-figma-text)] ${
          isGhost ? "italic text-[var(--color-figma-error)]" : ""
        }`}
        title={label}
      >
        {label}
      </div>
    </div>
  );
}

function describeModeScope(
  edgeModeNames: string[],
  allModeNames: string[],
): { title: string; description: string; names: string[] } {
  if (allModeNames.length === 0) {
    return {
      title: `Modes · ${edgeModeNames.length}`,
      description: "These token modes use this alias.",
      names: edgeModeNames,
    };
  }
  if (edgeModeNames.length >= allModeNames.length) {
    return {
      title: `Modes · all ${allModeNames.length}`,
      description: "Every mode in this token's collection uses this alias.",
      names: allModeNames,
    };
  }
  return {
    title: `Modes · ${edgeModeNames.length} of ${allModeNames.length}`,
    description: "Only these modes use this alias; other modes use another value.",
    names: edgeModeNames,
  };
}
