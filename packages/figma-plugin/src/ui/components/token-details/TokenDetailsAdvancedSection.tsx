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
            <h4 className="tm-token-details__subsection-title">Developer metadata</h4>
            <p className="tm-token-details__subsection-description">
              Additional DTCG metadata and plugin-specific fields.
            </p>
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
            <h4 className="tm-token-details__subsection-title">Raw JSON</h4>
            <p className="tm-token-details__subsection-description">
              Preview of the token payload that will be saved.
            </p>
          </div>
          <pre className="tm-token-details__code-block">{rawJsonPreview}</pre>
          {extensionsJsonError ? (
            <p className="tm-token-details__error-copy">
              Extensions JSON is invalid. The preview excludes that invalid block until
              it parses.
            </p>
          ) : null}
        </section>
      </div>
    </Collapsible>
  );
}
