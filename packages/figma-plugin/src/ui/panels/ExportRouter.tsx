import type { ReactNode } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ExportPanel } from "../components/ExportPanel";
import { useConnectionContext } from "../contexts/ConnectionContext";
import { useNavigationContext } from "../contexts/NavigationContext";

export function ExportRouter(): ReactNode {
  const { serverUrl, connected } = useConnectionContext();
  const { navigateTo } = useNavigationContext();

  return (
    <ErrorBoundary
      panelName="Publish · Code"
      onReset={() => navigateTo("publish", "publish-code")}
    >
      <ExportPanel serverUrl={serverUrl} connected={connected} />
    </ErrorBoundary>
  );
}
