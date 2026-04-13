import type { TableRow } from "../hooks/useTableCreate";

type TableRowField = keyof Omit<TableRow, "id">;
import { inferTypeFromValue } from "./tokenListHelpers";
import { InlineBanner } from "./InlineBanner";
import { NoticeFieldMessage } from "../shared/noticeSystem";

export interface TableCreateFormProps {
  setName: string;
  tableGroup: string;
  onSetTableGroup: (v: string) => void;
  tableRows: TableRow[];
  rowErrors: Record<string, string>;
  createAllError: string | null;
  busy: boolean;
  hasDraft: boolean;
  connected: boolean;
  allGroupPaths: string[];
  tableSuggestions: Array<{ value: string; label: string; source: string }>;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onUpdateRow: (id: string, field: TableRowField, value: string) => void;
  onClose: () => void;
  onRestoreDraft: () => void;
  onDismissDraft: () => void;
  onCreateAll: () => void;
}

export function TableCreateForm({
  setName,
  tableGroup,
  onSetTableGroup,
  tableRows,
  rowErrors,
  createAllError,
  busy,
  hasDraft,
  connected,
  allGroupPaths,
  tableSuggestions,
  onAddRow,
  onRemoveRow,
  onUpdateRow,
  onClose,
  onRestoreDraft,
  onDismissDraft,
  onCreateAll,
}: TableCreateFormProps) {
  return (
    <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      <div className="flex flex-col gap-2">
        {/* Draft recovery banner */}
        {hasDraft && (
          <InlineBanner
            variant="info"
            size="md"
            className="border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)]"
            action={{
              label: "Restore",
              onClick: onRestoreDraft,
              className:
                "bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)]",
            }}
            onDismiss={onDismissDraft}
            dismissLabel="Discard"
            dismissMode="text"
            dismissClassName="border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            <span className="block text-[var(--color-figma-text)]">
              You have unsaved bulk-create data. Restore it?
            </span>
          </InlineBanner>
        )}
        {/* Active set indicator */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0 text-[var(--color-figma-text-secondary)]"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Bulk create in:
          </span>
          <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate">
            {setName}
          </span>
        </div>
        {/* Group picker */}
        <div>
          <label
            className="block text-[10px] text-[var(--color-figma-text-tertiary)] mb-0.5"
            htmlFor="table-create-group"
          >
            Group
          </label>
          <input
            id="table-create-group"
            type="text"
            list="table-create-groups-list"
            placeholder="Root (none)"
            value={tableGroup}
            onChange={(e) => onSetTableGroup(e.target.value)}
            aria-label="Token group for bulk create"
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
          />
          <datalist id="table-create-groups-list">
            {allGroupPaths.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        {/* Smart name suggestions for table create */}
        {tableSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)] self-center mr-0.5">
              Suggest:
            </span>
            {tableSuggestions.map((s) => {
              const leafName = s.value.includes(".")
                ? s.value.slice(s.value.lastIndexOf(".") + 1)
                : s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  title={s.source}
                  onClick={() => {
                    const emptyRow = tableRows.find((r) => !r.name.trim());
                    if (emptyRow) {
                      onUpdateRow(emptyRow.id, "name", leafName);
                    } else {
                      onAddRow();
                      requestAnimationFrame(() => {
                        const inputs =
                          document.querySelectorAll<HTMLInputElement>(
                            "[data-table-name-input]",
                          );
                        const last = inputs[inputs.length - 1];
                        if (last) {
                          last.value = leafName;
                          last.dispatchEvent(
                            new Event("input", { bubbles: true }),
                          );
                        }
                      });
                    }
                  }}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors cursor-pointer"
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
        {/* Token rows */}
        <div>
          {/* Column headers */}
          <div
            className="grid gap-1 mb-1 px-0.5"
            style={{
              gridTemplateColumns: "minmax(0,1fr) 76px minmax(0,1fr) 18px",
            }}
          >
            <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wide">
              Name
            </span>
            <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wide">
              Type
            </span>
            <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wide">
              Value
            </span>
            <span />
          </div>
          {tableRows.map((row, idx) => (
            <div key={row.id} className="mb-1">
              <div
                className="grid gap-1 items-center"
                style={{
                  gridTemplateColumns:
                    "minmax(0,1fr) 76px minmax(0,1fr) 18px",
                }}
              >
                <input
                  type="text"
                  placeholder="name"
                  value={row.name}
                  onChange={(e) =>
                    onUpdateRow(row.id, "name", e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey))
                      onCreateAll();
                  }}
                  data-table-name-input="true"
                  aria-label={`Token ${idx + 1} name`}
                  autoFocus={idx === 0}
                  className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] ${rowErrors[row.id] ? "border-[var(--color-figma-error)]" : "border-[var(--color-figma-border)]"}`}
                />
                <select
                  value={row.type}
                  onChange={(e) =>
                    onUpdateRow(row.id, "type", e.target.value)
                  }
                  aria-label={`Token ${idx + 1} type`}
                  className="w-full px-1 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
                >
                  <option value="color">Color</option>
                  <option value="dimension">Dimension</option>
                  <option value="number">Number</option>
                  <option value="string">String</option>
                  <option value="boolean">Boolean</option>
                  <option value="duration">Duration</option>
                  <option value="fontFamily">Font Family</option>
                  <option value="fontWeight">Font Weight</option>
                  <option value="typography">Typography</option>
                  <option value="shadow">Shadow</option>
                  <option value="border">Border</option>
                  <option value="gradient">Gradient</option>
                  <option value="strokeStyle">Stroke Style</option>
                </select>
                <input
                  type="text"
                  placeholder="value"
                  value={row.value}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdateRow(row.id, "value", val);
                    const inferred = inferTypeFromValue(val);
                    if (inferred) onUpdateRow(row.id, "type", inferred);
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Tab" &&
                      !e.shiftKey &&
                      idx === tableRows.length - 1
                    ) {
                      e.preventDefault();
                      onAddRow();
                      requestAnimationFrame(() => {
                        const inputs =
                          document.querySelectorAll<HTMLInputElement>(
                            "[data-table-name-input]",
                          );
                        inputs[inputs.length - 1]?.focus();
                      });
                    }
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey))
                      onCreateAll();
                  }}
                  aria-label={`Token ${idx + 1} value`}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
                />
                <button
                  type="button"
                  onClick={() => onRemoveRow(row.id)}
                  tabIndex={-1}
                  aria-label={`Remove row ${idx + 1}`}
                  className="w-[18px] h-[18px] flex items-center justify-center rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      d="M1 1l6 6M7 1L1 7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </button>
              </div>
              {rowErrors[row.id] && (
                <NoticeFieldMessage severity="error" className="pl-0.5">
                  {rowErrors[row.id]}
                </NoticeFieldMessage>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => onAddRow()}
            className="mt-0.5 w-full px-2 py-1 rounded border border-dashed border-[var(--color-figma-border)] text-[var(--color-figma-text-tertiary)] text-[10px] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
          >
            + Add Row
          </button>
        </div>
        {createAllError && (
          <NoticeFieldMessage severity="error">
            {createAllError}
          </NoticeFieldMessage>
        )}
        <div className="flex gap-1.5">
          <button
            onClick={onCreateAll}
            disabled={
              busy ||
              !connected ||
              tableRows.every((r) => !r.name.trim())
            }
            title={
              tableRows.every((r) => !r.name.trim())
                ? "Enter at least one token name"
                : "Create all tokens (Ctrl+Enter)"
            }
            className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
          >
            {busy
              ? "Creating\u2026"
              : `Create ${tableRows.filter((r) => r.name.trim()).length > 0 ? tableRows.filter((r) => r.name.trim()).length + " " : ""}Token${tableRows.filter((r) => r.name.trim()).length !== 1 ? "s" : ""}`}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
