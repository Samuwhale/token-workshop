import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import type { GraphModel, GraphNodeId } from "@tokenmanager/core";
import type {
  GraphIssueEntry,
  GraphIssueGroup,
  GraphIssueKind,
} from "../../hooks/useIssuesGroups";
import { IssueRow } from "./IssueRow";

interface GraphIssuesMenuProps {
  fullGraph: GraphModel;
  groups: GraphIssueGroup[];
  onOpenInFocus: (nodeId: GraphNodeId) => void;
  onRequestDetach?: (params: {
    edgeId: string;
    screenX: number;
    screenY: number;
  }) => void;
}

const KIND_ORDER: GraphIssueKind[] = [
  "cycle",
  "broken-alias",
  "ghost-reference",
  "ambiguous-generator-source",
];

const KIND_LABEL: Record<GraphIssueKind, string> = {
  cycle: "Circular reference",
  "broken-alias": "Broken alias",
  "ghost-reference": "Missing token",
  "ambiguous-generator-source": "Multiple matches",
};

interface KindBucket {
  kind: GraphIssueKind;
  entries: { entry: GraphIssueEntry; collectionId: string }[];
}

export function GraphIssuesMenu({
  fullGraph,
  groups,
  onOpenInFocus,
  onRequestDetach,
}: GraphIssuesMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const buckets = useMemo<KindBucket[]>(() => {
    const map = new Map<GraphIssueKind, KindBucket>();
    for (const group of groups) {
      for (const entry of group.entries) {
        const existing = map.get(entry.kind);
        if (existing) {
          existing.entries.push({ entry, collectionId: group.collectionId });
        } else {
          map.set(entry.kind, {
            kind: entry.kind,
            entries: [{ entry, collectionId: group.collectionId }],
          });
        }
      }
    }
    return KIND_ORDER.filter((kind) => map.has(kind)).map(
      (kind) => map.get(kind)!,
    );
  }, [groups]);

  const total = buckets.reduce((n, b) => n + b.entries.length, 0);

  const showCollections = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) ids.add(group.collectionId);
    return ids.size > 1;
  }, [groups]);

  if (total === 0) return null;

  const hasCritical = buckets.some(
    (b) => b.kind === "cycle" || b.kind === "broken-alias",
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${total} issue${total === 1 ? "" : "s"}`}
        className={`flex h-[26px] items-center gap-1.5 rounded px-2 text-secondary font-medium ${
          hasCritical
            ? "text-[var(--color-figma-error)] hover:bg-[color-mix(in_srgb,var(--color-figma-error)_10%,transparent)]"
            : "text-[var(--color-figma-warning)] hover:bg-[color-mix(in_srgb,var(--color-figma-warning)_12%,transparent)]"
        }`}
      >
        <AlertTriangle size={11} strokeWidth={2} aria-hidden />
        <span>
          {total} issue{total === 1 ? "" : "s"}
        </span>
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 flex max-h-[60vh] w-[300px] flex-col rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg">
          <div className="flex flex-1 flex-col gap-3 overflow-auto p-3">
            {buckets.map((bucket) => (
              <KindSection
                key={bucket.kind}
                bucket={bucket}
                fullGraph={fullGraph}
                showCollections={showCollections}
                onOpenInFocus={(nodeId) => {
                  onOpenInFocus(nodeId);
                  setOpen(false);
                }}
                onRequestDetach={onRequestDetach}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KindSection({
  bucket,
  fullGraph,
  showCollections,
  onOpenInFocus,
  onRequestDetach,
}: {
  bucket: KindBucket;
  fullGraph: GraphModel;
  showCollections: boolean;
  onOpenInFocus: (nodeId: GraphNodeId) => void;
  onRequestDetach?: (params: {
    edgeId: string;
    screenX: number;
    screenY: number;
  }) => void;
}) {
  const heading =
    bucket.entries.length === 1
      ? KIND_LABEL[bucket.kind]
      : `${KIND_LABEL[bucket.kind]} · ${bucket.entries.length}`;
  const Icon = bucket.kind === "cycle" ? RotateCw : AlertTriangle;
  const iconColor =
    bucket.kind === "broken-alias" || bucket.kind === "ghost-reference"
      ? "text-[var(--color-figma-error)]"
      : "text-[var(--color-figma-warning)]";

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-secondary text-[var(--color-figma-text-secondary)]">
        <Icon
          size={11}
          strokeWidth={2}
          aria-hidden
          className={`shrink-0 ${iconColor}`}
        />
        <span className="font-medium">{heading}</span>
      </div>
      <ul className="flex flex-col">
        {bucket.entries.map(({ entry, collectionId }) => (
          <li key={entry.id}>
            <IssueRow
              entry={entry}
              fullGraph={fullGraph}
              collectionLabel={showCollections ? collectionId : null}
              onOpenInFocus={onOpenInFocus}
              onRequestDetach={onRequestDetach}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
