import type { ReactNode } from "react";

interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  emphasis?: "primary" | "secondary" | "support";
  children: ReactNode;
  className?: string;
}

const TITLE_SIZE: Record<NonNullable<SectionProps["emphasis"]>, string> = {
  primary: "text-[var(--font-size-md)]",
  secondary: "text-[var(--font-size-base)]",
  support: "text-[var(--font-size-sm)]",
};

const TOP_PADDING: Record<NonNullable<SectionProps["emphasis"]>, string> = {
  primary: "",
  secondary: "pt-5",
  support: "pt-5",
};

export function Section({
  title,
  description,
  actions,
  emphasis = "secondary",
  children,
  className = "",
}: SectionProps) {
  const showHeader = Boolean(title || description || actions);
  return (
    <section className={`flex min-w-0 flex-col gap-2.5 ${TOP_PADDING[emphasis]} ${className}`}>
      {showHeader ? (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {title ? (
              <h3
                className={`m-0 font-semibold leading-[var(--leading-tight)] text-[var(--color-figma-text)] ${TITLE_SIZE[emphasis]}`}
              >
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="m-0 min-w-0 text-secondary leading-[var(--leading-body)] text-[var(--color-figma-text-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </section>
  );
}
