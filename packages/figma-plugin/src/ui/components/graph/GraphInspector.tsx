import { useMemo } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Diff } from "lucide-react";
import {
  readTokenModeValuesForCollection,
  type AliasEdge as AliasEdgeModel,
  type GeneratorGraphNode,
  type GhostGraphNode,
  type GraphModel,
  type GraphNode,
  type GraphNodeId,
  type TokenCollection,
  type TokenGraphNode,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import { formatTokenValueForDisplay } from "../../shared/tokenFormatting";
import { isAlias } from "../../../shared/resolveAlias";

interface GraphInspectorProps {
  graph: GraphModel;
  selectedNodeId: GraphNodeId | null;
  selectedEdgeId: string | null;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onNavigateToToken: (path: string, collectionId: string) => void;
  onEditGenerator: (generatorId: string) => void;
  onCompareTokens?: (
    a: { path: string; collectionId: string },
    b: { path: string; collectionId: string },
  ) => void;
  onSelectNode: (nodeId: GraphNodeId | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
}

export function GraphInspector({
  graph,
  selectedNodeId,
  selectedEdgeId,
  collections,
  perCollectionFlat,
  onNavigateToToken,
  onEditGenerator,
  onCompareTokens,
  onSelectNode,
  onSelectEdge,
}: GraphInspectorProps) {
  const node = selectedNodeId ? graph.nodes.get(selectedNodeId) : null;
  const edge = selectedEdgeId ? graph.edges.get(selectedEdgeId) : null;

  if (edge && edge.kind === "alias") {
    return (
      <Shell>
        <AliasEdgeInspector
          graph={graph}
          edge={edge}
          onNavigateToToken={onNavigateToToken}
          onSelectNode={onSelectNode}
          onSelectEdge={onSelectEdge}
          onClear={() => onSelectEdge(null)}
        />
      </Shell>
    );
  }

  if (node?.kind === "token") {
    return (
      <Shell>
        <TokenInspector
          graph={graph}
          token={node}
          collections={collections}
          perCollectionFlat={perCollectionFlat}
          onNavigateToToken={onNavigateToToken}
          onCompareTokens={onCompareTokens}
          onSelectNode={onSelectNode}
        />
      </Shell>
    );
  }

  if (node?.kind === "generator") {
    return (
      <Shell>
        <GeneratorInspector
          generator={node}
          graph={graph}
          onNavigateToToken={onNavigateToToken}
          onEditGenerator={onEditGenerator}
          onSelectNode={onSelectNode}
        />
      </Shell>
    );
  }

  if (node?.kind === "ghost") {
    return (
      <Shell>
        <GhostInspector ghost={node} graph={graph} onSelectNode={onSelectNode} />
      </Shell>
    );
  }

  return null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[var(--color-figma-bg)] px-3 py-3 text-secondary text-[var(--color-figma-text)]">
      {children}
    </div>
  );
}

function TokenInspector({
  graph,
  token,
  collections,
  perCollectionFlat,
  onNavigateToToken,
  onCompareTokens,
  onSelectNode,
}: {
  graph: GraphModel;
  token: TokenGraphNode;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onNavigateToToken: (path: string, collectionId: string) => void;
  onCompareTokens?: (
    a: { path: string; collectionId: string },
    b: { path: string; collectionId: string },
  ) => void;
  onSelectNode: (nodeId: GraphNodeId | null) => void;
}) {
  const collection = collections.find((c) => c.id === token.collectionId);
  const entry = perCollectionFlat[token.collectionId]?.[token.path];
  const modeValues = useMemo(() => {
    if (!collection || !entry) return null;
    return readTokenModeValuesForCollection(entry, collection);
  }, [collection, entry]);

  const upstream = useMemo(
    () => collectIncidentTokens(graph, token.id, "incoming"),
    [graph, token.id],
  );
  const downstream = useMemo(
    () => collectIncidentTokens(graph, token.id, "outgoing"),
    [graph, token.id],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        {token.swatchColor ? (
          <span
            className="mt-0.5 h-9 w-9 shrink-0 rounded border border-[var(--color-figma-border)]"
            style={{ background: token.swatchColor }}
            aria-hidden
          />
        ) : (
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] font-mono text-[10px] text-[var(--color-figma-text-secondary)]"
            aria-hidden
          >
            {tokenTypeGlyph(token.$type)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{token.displayName}</div>
          <div className="truncate font-mono text-[10px] text-[var(--color-figma-text-tertiary)]">
            {token.path}
          </div>
        </div>
      </div>

      <Meta>
        <MetaRow label="Collection" value={token.collectionId} />
        {token.$type ? <MetaRow label="Type" value={token.$type} /> : null}
        {token.isGeneratorManaged ? (
          <MetaRow label="Source" value="Generator-managed" />
        ) : null}
        {healthLabel(token.health) ? (
          <MetaRow
            label="Health"
            value={healthLabel(token.health) ?? ""}
            tone={healthTone(token.health)}
          />
        ) : null}
      </Meta>

      {collection && modeValues ? (
        <Section title="Values">
          <div className="flex flex-col gap-1">
            {collection.modes.map((mode) => {
              const value = modeValues[mode.name];
              const aliasRef = isAlias(value as never)
                ? String(value)
                : null;
              return (
                <div
                  key={mode.name}
                  className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-[var(--color-figma-bg-secondary)]"
                >
                  <span className="w-16 shrink-0 truncate text-[10px] text-[var(--color-figma-text-tertiary)]">
                    {mode.name}
                  </span>
                  {aliasRef ? (
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[var(--color-figma-accent)]">
                      {aliasRef}
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[var(--color-figma-text)]">
                      {formatTokenValueForDisplay(token.$type, value, {
                        emptyPlaceholder: "—",
                      })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      {upstream.length > 0 ? (
        <Section
          title="References"
          icon={<ArrowUp size={10} strokeWidth={2} aria-hidden />}
        >
          <RelatedList
            items={upstream}
            onClick={(t) => onSelectNode(t.id)}
            onDoubleClick={(t) => onNavigateToToken(t.path, t.collectionId)}
          />
        </Section>
      ) : null}

      {downstream.length > 0 ? (
        <Section
          title="Used by"
          icon={<ArrowDown size={10} strokeWidth={2} aria-hidden />}
        >
          <RelatedList
            items={downstream}
            onClick={(t) => onSelectNode(t.id)}
            onDoubleClick={(t) => onNavigateToToken(t.path, t.collectionId)}
          />
        </Section>
      ) : null}

      <div className="mt-2 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onNavigateToToken(token.path, token.collectionId)}
          className="rounded bg-[var(--color-figma-accent)] px-2.5 py-1.5 text-secondary font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
        >
          Open token
        </button>
        {onCompareTokens && upstream[0] ? (
          <button
            type="button"
            onClick={() =>
              onCompareTokens(
                { path: token.path, collectionId: token.collectionId },
                { path: upstream[0].path, collectionId: upstream[0].collectionId },
              )
            }
            className="flex items-center justify-center gap-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5 text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            <Diff size={10} strokeWidth={2} aria-hidden />
            Compare with {upstream[0].displayName}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function GeneratorInspector({
  generator,
  graph,
  onNavigateToToken,
  onEditGenerator,
  onSelectNode,
}: {
  generator: GeneratorGraphNode;
  graph: GraphModel;
  onNavigateToToken: (path: string, collectionId: string) => void;
  onEditGenerator: (generatorId: string) => void;
  onSelectNode: (nodeId: GraphNodeId | null) => void;
}) {
  const outputs = useMemo(
    () => collectIncidentTokens(graph, generator.id, "outgoing"),
    [graph, generator.id],
  );
  const sources = useMemo(
    () => collectIncidentTokens(graph, generator.id, "incoming"),
    [graph, generator.id],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-medium">{generator.name}</div>
        <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">
          {generator.generatorType}
        </div>
      </div>
      <Meta>
        <MetaRow label="Target" value={generator.targetCollection} />
        <MetaRow label="Group" value={generator.targetGroup} />
        <MetaRow label="Outputs" value={String(generator.outputCount)} />
        {!generator.enabled ? <MetaRow label="State" value="Disabled" /> : null}
        {healthLabel(generator.health) ? (
          <MetaRow
            label="Health"
            value={healthLabel(generator.health) ?? ""}
            tone={healthTone(generator.health)}
          />
        ) : null}
      </Meta>
      {generator.errorMessage ? (
        <div className="rounded border border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/10 px-2 py-1.5 text-[10px] text-[var(--color-figma-error)]">
          {generator.errorMessage}
        </div>
      ) : null}
      {sources.length > 0 ? (
        <Section title="Source">
          <RelatedList
            items={sources}
            onClick={(t) => onSelectNode(t.id)}
            onDoubleClick={(t) => onNavigateToToken(t.path, t.collectionId)}
          />
        </Section>
      ) : null}
      {outputs.length > 0 ? (
        <Section title="Produces">
          <RelatedList
            items={outputs}
            onClick={(t) => onSelectNode(t.id)}
            onDoubleClick={(t) => onNavigateToToken(t.path, t.collectionId)}
          />
        </Section>
      ) : null}
      <button
        type="button"
        onClick={() => onEditGenerator(generator.generatorId)}
        className="mt-2 rounded bg-[var(--color-figma-accent)] px-2.5 py-1.5 text-secondary font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
      >
        Edit generator
      </button>
    </div>
  );
}

function GhostInspector({
  ghost,
  graph,
  onSelectNode,
}: {
  ghost: GhostGraphNode;
  graph: GraphModel;
  onSelectNode: (nodeId: GraphNodeId | null) => void;
}) {
  const referrers = useMemo(
    () => collectIncidentTokens(graph, ghost.id, "outgoing"),
    [graph, ghost.id],
  );
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-medium text-[var(--color-figma-error)]">
          {ghost.path}
        </div>
        <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">
          {ghost.reason === "ambiguous"
            ? "Reference matches multiple collections"
            : "Reference target not found"}
        </div>
      </div>
      {referrers.length > 0 ? (
        <Section title="Referenced by">
          <RelatedList
            items={referrers}
            onClick={(t) => onSelectNode(t.id)}
          />
        </Section>
      ) : null}
    </div>
  );
}

function AliasEdgeInspector({
  graph,
  edge,
  onNavigateToToken,
  onSelectNode,
  onSelectEdge,
  onClear,
}: {
  graph: GraphModel;
  edge: AliasEdgeModel;
  onNavigateToToken: (path: string, collectionId: string) => void;
  onSelectNode: (nodeId: GraphNodeId | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onClear: () => void;
}) {
  const downstream = graph.nodes.get(edge.to);
  const upstream = graph.nodes.get(edge.from);
  const isIssue = Boolean(
    edge.inCycle || edge.isMissingTarget || edge.issueRules?.length,
  );
  const issueLabel = edge.inCycle
    ? "Circular reference"
    : edge.isMissingTarget
      ? "Broken alias"
      : "Alias";
  const tone = edge.inCycle
    ? "warning"
    : edge.isMissingTarget
      ? "error"
      : "neutral";

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
    <div className="flex flex-col gap-4">
      <div>
        <div
          className={`font-medium ${
            tone === "error"
              ? "text-[var(--color-figma-error)]"
              : tone === "warning"
                ? "text-[var(--color-figma-warning)]"
                : "text-[var(--color-figma-text)]"
          }`}
        >
          {issueLabel}
        </div>
        {downstream && upstream ? (
          <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-[var(--color-figma-text-secondary)]">
            <NodeLabel node={downstream} />
            <ChevronRight
              size={10}
              strokeWidth={2}
              className="text-[var(--color-figma-text-tertiary)]"
              aria-hidden
            />
            <NodeLabel node={upstream} />
          </div>
        ) : null}
      </div>
      {edge.modeNames.length > 0 ? (
        <Section title={`Modes (${edge.modeNames.length})`}>
          <div className="flex flex-wrap gap-1">
            {edge.modeNames.map((m) => (
              <span
                key={m}
                className="rounded bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)]"
              >
                {m}
              </span>
            ))}
          </div>
        </Section>
      ) : null}
      {issueQueue ? (
        <div className="flex items-center justify-between gap-2 rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
          <span className="text-[var(--color-figma-text-secondary)]">
            Issue {issueQueue.index + 1} of {issueQueue.total}
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelectEdge(issueQueue.prev)}
              aria-label="Previous issue"
              title="Previous issue"
              className="rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            >
              <ChevronLeft size={11} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onSelectEdge(issueQueue.next)}
              aria-label="Next issue"
              title="Next issue"
              className="rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            >
              <ChevronRight size={11} strokeWidth={2} aria-hidden />
            </button>
          </span>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        {downstream?.kind === "token" ? (
          <button
            type="button"
            onClick={() =>
              onNavigateToToken(downstream.path, downstream.collectionId)
            }
            className="rounded bg-[var(--color-figma-accent)] px-2.5 py-1.5 text-secondary font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
          >
            Open {downstream.displayName}
          </button>
        ) : null}
        {upstream?.kind === "token" ? (
          <button
            type="button"
            onClick={() => onSelectNode(upstream.id)}
            className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5 text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Inspect upstream
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-transparent px-2.5 py-1.5 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}

function NodeLabel({ node }: { node: GraphNode }) {
  if (node.kind === "token") {
    return <span className="truncate text-[var(--color-figma-text)]">{node.path}</span>;
  }
  if (node.kind === "ghost") {
    return (
      <span className="truncate italic text-[var(--color-figma-error)]">
        {node.path}
      </span>
    );
  }
  return <span className="truncate text-[var(--color-figma-text)]">{node.name}</span>;
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 font-medium text-[var(--color-figma-text-secondary)]">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

function MetaRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warning" | "error";
}) {
  const valueClass =
    tone === "warning"
      ? "text-[var(--color-figma-warning)]"
      : tone === "error"
        ? "text-[var(--color-figma-error)]"
        : "text-[var(--color-figma-text)]";
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-16 shrink-0 text-[10px] text-[var(--color-figma-text-tertiary)]">
        {label}
      </span>
      <span className={`min-w-0 flex-1 truncate ${valueClass}`}>{value}</span>
    </div>
  );
}

interface RelatedItem {
  id: GraphNodeId;
  path: string;
  collectionId: string;
  displayName: string;
  swatchColor?: string;
  $type?: string;
  isGhost?: boolean;
  isGenerator?: boolean;
}

function RelatedList({
  items,
  onClick,
  onDoubleClick,
}: {
  items: RelatedItem[];
  onClick: (item: RelatedItem) => void;
  onDoubleClick?: (item: RelatedItem) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onClick(item)}
            onDoubleClick={() => onDoubleClick?.(item)}
            className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)] ${
              item.isGhost
                ? "text-[var(--color-figma-error)]"
                : "text-[var(--color-figma-text)]"
            }`}
          >
            {item.swatchColor ? (
              <span
                className="h-3 w-3 shrink-0 rounded border border-[var(--color-figma-border)]"
                style={{ background: item.swatchColor }}
                aria-hidden
              />
            ) : (
              <span
                className="font-mono text-[10px] text-[var(--color-figma-text-tertiary)]"
                aria-hidden
              >
                {item.isGenerator
                  ? "✦"
                  : item.isGhost
                    ? "?"
                    : tokenTypeGlyph(item.$type)}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{item.displayName}</span>
            <span className="min-w-0 truncate font-mono text-[10px] text-[var(--color-figma-text-tertiary)]">
              {item.path}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function collectIncidentTokens(
  graph: GraphModel,
  nodeId: GraphNodeId,
  direction: "incoming" | "outgoing",
): RelatedItem[] {
  const edgeIds =
    direction === "incoming"
      ? graph.incoming.get(nodeId) ?? []
      : graph.outgoing.get(nodeId) ?? [];
  const seen = new Set<GraphNodeId>();
  const out: RelatedItem[] = [];
  for (const edgeId of edgeIds) {
    const edge = graph.edges.get(edgeId);
    if (!edge) continue;
    const otherId = direction === "incoming" ? edge.from : edge.to;
    if (seen.has(otherId)) continue;
    seen.add(otherId);
    const other = graph.nodes.get(otherId);
    if (!other) continue;
    if (other.kind === "token") {
      out.push({
        id: other.id,
        path: other.path,
        collectionId: other.collectionId,
        displayName: other.displayName,
        swatchColor: other.swatchColor,
        $type: other.$type,
      });
    } else if (other.kind === "ghost") {
      out.push({
        id: other.id,
        path: other.path,
        collectionId: other.collectionId ?? "?",
        displayName: other.path.split(".").pop() ?? other.path,
        isGhost: true,
      });
    } else {
      out.push({
        id: other.id,
        path: other.targetGroup,
        collectionId: other.targetCollection,
        displayName: other.name,
        isGenerator: true,
      });
    }
  }
  return out;
}

function healthLabel(health: string): string | null {
  if (health === "ok") return null;
  if (health === "broken") return "Broken alias";
  if (health === "cycle") return "In cycle";
  if (health === "generator-error") return "Generator error";
  return health;
}

function healthTone(health: string): "ok" | "warning" | "error" | undefined {
  if (health === "broken" || health === "generator-error") return "error";
  if (health === "cycle") return "warning";
  return undefined;
}

function tokenTypeGlyph(type: string | undefined): string {
  switch (type) {
    case "color":
      return "◐";
    case "dimension":
      return "⟷";
    case "number":
      return "#";
    case "fontFamily":
    case "fontWeight":
    case "typography":
      return "T";
    case "duration":
      return "⧖";
    case "shadow":
      return "◑";
    case "cubicBezier":
      return "~";
    default:
      return "•";
  }
}
