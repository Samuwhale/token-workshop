import { ArrowLeft } from "lucide-react";
import { LintConfigPanel } from "../LintConfigPanel";
import { useLintConfig } from "../../hooks/useLintConfig";

interface HealthRulesViewProps {
  serverUrl: string;
  connected: boolean;
  onRulesChanged?: () => Promise<unknown> | void;
  onBack: () => void;
}

export function HealthRulesView({
  serverUrl,
  connected,
  onRulesChanged,
  onBack,
}: HealthRulesViewProps) {
  const {
    config,
    loading,
    error,
    saving,
    updateRule,
    applyConfig,
    resetToDefaults,
  } = useLintConfig(serverUrl, connected);

  return (
    <div
      className="flex h-full flex-col overflow-y-auto px-4 py-4"
      style={{ scrollbarWidth: "thin" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
          aria-label="Back to Review"
        >
          <ArrowLeft size={12} strokeWidth={2} aria-hidden />
          <span>Review</span>
        </button>
        <h2 className="text-body font-semibold text-[color:var(--color-figma-text)]">
          Rules
        </h2>
      </div>

      {!connected ? (
        <p className="text-secondary text-[color:var(--color-figma-text-secondary)]">
          Connect to the server to manage rules.
        </p>
      ) : loading && !config ? (
        <p className="animate-pulse text-secondary text-[color:var(--color-figma-text-secondary)]">
          Loading rules…
        </p>
      ) : !config ? (
        <p className="text-secondary text-[color:var(--color-figma-error)]">
          {error ?? "Rules are unavailable right now."}
        </p>
      ) : (
        <>
          {error ? (
            <p className="mb-3 text-secondary text-[color:var(--color-figma-error)]">
              {error}
            </p>
          ) : null}
          <LintConfigPanel
            config={config}
            saving={saving}
            onUpdateRule={updateRule}
            onApplyConfig={applyConfig}
            onReset={resetToDefaults}
            onRulesChanged={onRulesChanged}
          />
        </>
      )}
    </div>
  );
}
