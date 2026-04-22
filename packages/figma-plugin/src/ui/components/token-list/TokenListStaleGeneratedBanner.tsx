import { Spinner } from "../Spinner";
import { NoticeBanner } from "../../shared/noticeSystem";
import type { TokenGenerator } from "../../hooks/useGenerators";

interface TokenListStaleGeneratedBannerProps {
  staleGeneratorsForSet: TokenGenerator[];
  runningStaleGenerators: boolean;
  onDismiss: () => void;
  onRegenerateAll: () => void;
  onNavigateToGeneratedGroup?: (generatorId: string) => void;
}

export function TokenListStaleGeneratedBanner({
  staleGeneratorsForSet,
  runningStaleGenerators,
  onDismiss,
  onRegenerateAll,
  onNavigateToGeneratedGroup,
}: TokenListStaleGeneratedBannerProps) {
  return (
    <NoticeBanner
      severity="warning"
      onDismiss={!runningStaleGenerators ? onDismiss : undefined}
      dismissLabel="Dismiss"
      actions={
        <button
          type="button"
          onClick={onRegenerateAll}
          disabled={runningStaleGenerators}
          className="inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded bg-[var(--color-figma-generator)]/15 text-[var(--color-figma-generator)] font-medium hover:bg-[var(--color-figma-generator)]/25 disabled:opacity-50 transition-colors"
        >
          {runningStaleGenerators && <Spinner size="xs" />}
          <span>
            {runningStaleGenerators ? "Re-running..." : "Re-run all"}
          </span>
        </button>
      }
    >
      <span>
        {staleGeneratorsForSet.length === 1
          ? "1 generated group is"
          : `${staleGeneratorsForSet.length} generated groups are`}{" "}
        out of date:{" "}
        {staleGeneratorsForSet.map((generator, i) => (
          <span key={generator.id}>
            {i > 0 && ", "}
            {onNavigateToGeneratedGroup ? (
              <button
                type="button"
                onClick={() => onNavigateToGeneratedGroup(generator.id)}
                className="underline decoration-[var(--color-figma-generator)]/40 hover:decoration-[var(--color-figma-generator)] hover:text-[var(--color-figma-generator)] transition-colors"
              >
                {generator.name}
              </button>
            ) : (
              generator.name
            )}
          </span>
        ))}
      </span>
    </NoticeBanner>
  );
}
