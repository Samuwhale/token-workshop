import { LintConfigPanel } from "../LintConfigPanel";
import { useLintConfig } from "../../hooks/useLintConfig";
import { HealthSubViewHeader } from "./HealthSubViewHeader";

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
      className="flex h-full flex-col overflow-hidden"
      style={{ scrollbarWidth: "thin" }}
    >
      <HealthSubViewHeader title="Rules" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: "thin" }}>

        {!connected ? (
          <p className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            Connect to the server to manage rules.
          </p>
        ) : loading && !config ? (
          <p className="animate-pulse text-secondary text-[color:var(--color-figma-text-secondary)]">
            Loading rules…
          </p>
        ) : !config ? (
          <p className="text-secondary text-[color:var(--color-figma-text-error)]">
            {error ?? "Rules are unavailable right now."}
          </p>
        ) : (
          <>
            {error ? (
              <p className="mb-3 text-secondary text-[color:var(--color-figma-text-error)]">
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
    </div>
  );
}
