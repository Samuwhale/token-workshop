import type { ReactNode } from "react";

interface LibraryWorkspaceHeaderProps {
  title: string;
  summary: string;
  meta?: ReactNode;
  controls?: ReactNode;
  actions?: ReactNode;
}

export function LibraryWorkspaceHeader({
  title,
  summary,
  meta,
  controls,
  actions,
}: LibraryWorkspaceHeaderProps) {
  return (
    <div className="shrink-0 bg-[var(--color-figma-bg)] px-4 pb-3 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold leading-[1.2] text-[var(--color-figma-text)]">
            {title}
          </h2>
          <p className="mt-1 max-w-[720px] text-body leading-[1.45] text-[var(--color-figma-text-secondary)]">
            {summary}
          </p>
          {meta ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-secondary text-[var(--color-figma-text-tertiary)]">
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {controls ? (
        <div className="mt-3 flex items-center gap-2">
          {controls}
        </div>
      ) : null}
    </div>
  );
}
