import type { ReactNode } from "react";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

interface TokenDetailsSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function TokenDetailsSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: TokenDetailsSectionProps) {
  const hasHeader = title || description || actions;

  return (
    <section className={joinClasses("tm-token-details__section", className)}>
      {hasHeader ? (
        <div className="tm-token-details__section-header">
          <div className="tm-token-details__section-copy">
            {title ? <h3 className="tm-token-details__section-title">{title}</h3> : null}
            {description ? (
              <p className="tm-token-details__section-description">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="tm-token-details__section-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={joinClasses(contentClassName)}>{children}</div>
    </section>
  );
}
