import type { ReactNode } from "react";

interface SecondaryPanelProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  beforeBody?: ReactNode;
  footer?: ReactNode;
}

export function SecondaryPanel({
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "",
  beforeBody,
  footer,
}: SecondaryPanelProps) {
  return (
    <div className={`tm-secondary-panel ${className}`}>
      <div className="tm-secondary-panel__header">
        <div className="tm-secondary-panel__header-copy">
          <h2 className="tm-secondary-panel__title">{title}</h2>
          {description ? (
            <p className="tm-secondary-panel__description">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="tm-secondary-panel__actions">{actions}</div>
        ) : null}
      </div>
      {beforeBody}
      <div className={`tm-secondary-panel__body ${bodyClassName}`}>{children}</div>
      {footer ? <div className="tm-secondary-panel__footer shrink-0">{footer}</div> : null}
    </div>
  );
}
