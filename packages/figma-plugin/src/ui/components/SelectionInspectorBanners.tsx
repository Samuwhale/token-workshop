import type { BindableProperty } from "../../shared/types";
import { PROPERTY_LABELS } from "../../shared/types";
import { InlineBanner } from "./InlineBanner";

interface PeerSuggestion {
  property: BindableProperty;
  peerIds: string[];
  tokenPath: string;
  tokenType: string;
  resolvedValue: unknown;
}

interface PropTypeSuggestion {
  tokenPath: string;
  tokenType: string;
  resolvedValue: unknown;
  targetProps: BindableProperty[];
}

interface SelectionInspectorBannersProps {
  staleBindingCount: number;
  onOpenRepair?: () => void;
  peerSuggestion: PeerSuggestion | null;
  onApplyPeerSuggestion: () => void;
  onDismissPeerSuggestion: () => void;
  propTypeSuggestion: PropTypeSuggestion | null;
  onApplyPropTypeSuggestion: () => void;
  onDismissPropTypeSuggestion: () => void;
  allPropertiesBound: boolean;
  noMoreSiblings: boolean;
  onSelectNextSibling: () => void;
  applyProgress: { processed: number; total: number } | null;
  createdTokenPath: string | null;
  onNavigateToToken?: (tokenPath: string) => void;
  onDismissCreatedToken: () => void;
}

export function SelectionInspectorBanners({
  staleBindingCount,
  onOpenRepair,
  peerSuggestion,
  onApplyPeerSuggestion,
  onDismissPeerSuggestion,
  propTypeSuggestion,
  onApplyPropTypeSuggestion,
  onDismissPropTypeSuggestion,
  allPropertiesBound,
  noMoreSiblings,
  onSelectNextSibling,
  applyProgress,
  createdTokenPath,
  onNavigateToToken,
  onDismissCreatedToken,
}: SelectionInspectorBannersProps) {
  const showStaleBanner = staleBindingCount > 0 && Boolean(onOpenRepair);
  const showPropTypeSuggestion = !showStaleBanner && Boolean(propTypeSuggestion);
  return (
    <>
      {showStaleBanner && (
        <InlineBanner
          variant="warning"
          layout="strip"
          size="sm"
          className="border-b-0 border-t"
          action={{
            label: `Repair ${staleBindingCount} →`,
            onClick: () => onOpenRepair?.(),
          }}
        >
          <span className="text-secondary font-medium text-[color:var(--color-figma-text)]">
            {staleBindingCount} broken binding{staleBindingCount === 1 ? "" : "s"}
          </span>
        </InlineBanner>
      )}

      {peerSuggestion && (
        <div className="flex items-center gap-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-accent)]/5 px-3 py-2 shrink-0">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-[color:var(--color-figma-text-accent)]"
            aria-hidden="true"
          >
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
          <span className="flex-1 text-secondary text-[color:var(--color-figma-text)]">
            Apply <strong>{PROPERTY_LABELS[peerSuggestion.property]}</strong> to{" "}
            {peerSuggestion.peerIds.length} sibling
            {peerSuggestion.peerIds.length !== 1 ? "s" : ""}?
          </span>
          <button
            onClick={onApplyPeerSuggestion}
            className="shrink-0 rounded bg-[var(--color-figma-accent)]/10 px-2 py-1 text-secondary font-medium text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-accent)]/20"
          >
            Apply
          </button>
          <button
            onClick={onDismissPeerSuggestion}
            className="shrink-0 rounded p-0.5 text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            title="Dismiss"
            aria-label="Dismiss"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {showPropTypeSuggestion && propTypeSuggestion && (
        <div className="flex items-start gap-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-accent)]/5 px-3 py-2 shrink-0">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-px shrink-0 text-[color:var(--color-figma-text-accent)]"
            aria-hidden="true"
          >
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-secondary leading-snug text-[color:var(--color-figma-text)]">
              Apply{" "}
              <strong className="font-mono">
                {propTypeSuggestion.tokenPath}
              </strong>{" "}
              to all <strong>{propTypeSuggestion.tokenType}</strong> properties?
            </span>
            <span className="truncate text-secondary text-[color:var(--color-figma-text-secondary)]">
              {propTypeSuggestion.targetProps
                .map((prop) => PROPERTY_LABELS[prop])
                .join(", ")}
            </span>
          </div>
          <button
            onClick={onApplyPropTypeSuggestion}
            className="shrink-0 rounded bg-[var(--color-figma-accent)]/10 px-2 py-1 text-secondary font-medium text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-accent)]/20"
          >
            Apply to all
          </button>
          <button
            onClick={onDismissPropTypeSuggestion}
            className="shrink-0 rounded p-0.5 text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            title="Dismiss"
            aria-label="Dismiss"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {allPropertiesBound && (
        <InlineBanner
          variant="success"
          layout="strip"
          size="sm"
          className="border-b-0 border-t bg-[var(--color-figma-success)]/5"
          action={
            noMoreSiblings
              ? undefined
              : {
                  label: "Next layer →",
                  onClick: onSelectNextSibling,
                  className:
                    "bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-accent)]/20",
                }
          }
        >
          <div className="flex items-center gap-2">
            <span className="text-secondary font-medium text-[color:var(--color-figma-text)]">
              All properties bound
            </span>
            {noMoreSiblings ? (
              <span className="text-secondary italic text-[color:var(--color-figma-text-secondary)]">
                No more layers
              </span>
            ) : null}
          </div>
        </InlineBanner>
      )}

      {applyProgress && applyProgress.total > 1 && (
        <InlineBanner
          variant="loading"
          layout="strip"
          size="sm"
          className="border-b-0 border-t"
        >
          <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            Applying… {applyProgress.processed}/{applyProgress.total} layers
          </span>
        </InlineBanner>
      )}

      {createdTokenPath && (
        <InlineBanner
          variant="success"
          layout="strip"
          size="sm"
          className="border-b-0 border-t bg-[var(--color-figma-bg)]"
          action={
            onNavigateToToken
              ? {
                  label: "Go to token →",
                  onClick: () => {
                    onNavigateToToken(createdTokenPath);
                    onDismissCreatedToken();
                  },
                  className:
                    "bg-transparent text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-accent)]/10",
                }
              : undefined
          }
          onDismiss={onDismissCreatedToken}
          dismissMode="icon"
        >
          <span
            className="block truncate font-mono text-secondary text-[color:var(--color-figma-text)]"
            title={createdTokenPath}
          >
            {createdTokenPath}
          </span>
        </InlineBanner>
      )}
    </>
  );
}
