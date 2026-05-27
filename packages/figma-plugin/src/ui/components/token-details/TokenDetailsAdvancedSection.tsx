import type { ReactNode } from "react";
import { Collapsible } from "../Collapsible";
import { MetadataEditor } from "../MetadataEditor";

interface TokenDetailsAdvancedSectionProps {
  open: boolean;
  onToggle: () => void;
  extendsSection?: ReactNode;
  readOnlyExtensionsText: string;
  extensionsJsonText: string;
  onExtensionsJsonTextChange: (value: string) => void;
  extensionsJsonError: string | null;
  onExtensionsJsonErrorChange: (value: string | null) => void;
  rawJsonPreview: string;
  editable?: boolean;
}

export function TokenDetailsAdvancedSection({
  open,
  onToggle,
  extendsSection,
  readOnlyExtensionsText,
  extensionsJsonText,
  onExtensionsJsonTextChange,
  extensionsJsonError,
  onExtensionsJsonErrorChange,
  rawJsonPreview,
  editable = true,
}: TokenDetailsAdvancedSectionProps) {
  return (
    <Collapsible
      open={open}
      onToggle={onToggle}
      label="Advanced"
      className="tm-token-details__advanced"
    >
      <div className="tm-token-details__advanced-content">
        <section className="tm-token-details__subsection">
          <div className="tm-token-details__subsection-copy">
            <h4 className="tm-token-details__subsection-title">Metadata</h4>
          </div>
          {!editable ? (
            <pre className="tm-token-details__code-block">{readOnlyExtensionsText}</pre>
          ) : (
            <MetadataEditor
              extensionsJsonText={extensionsJsonText}
              onExtensionsJsonTextChange={onExtensionsJsonTextChange}
              extensionsJsonError={extensionsJsonError}
              onExtensionsJsonErrorChange={onExtensionsJsonErrorChange}
            />
          )}
        </section>

        {extendsSection ? (
          <section className="tm-token-details__subsection">{extendsSection}</section>
        ) : null}

        <section className="tm-token-details__subsection">
          <div className="tm-token-details__subsection-copy">
            <h4 className="tm-token-details__subsection-title">JSON preview</h4>
          </div>
          <pre className="tm-token-details__code-block">{rawJsonPreview}</pre>
          {extensionsJsonError ? (
            <p className="tm-token-details__error-copy">
              Fix metadata JSON to include it in the preview.
            </p>
          ) : null}
        </section>
      </div>
    </Collapsible>
  );
}
