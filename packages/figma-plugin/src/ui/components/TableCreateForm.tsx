import { useEffect, useMemo, useRef } from "react";
import { Folder, Plus, X } from "lucide-react";
import type { NewTableRowFields, TableRow } from "../hooks/useTableCreate";
import { inferTypeFromValue } from "./tokenListHelpers";
import { InlineBanner } from "./InlineBanner";
import { NoticeFieldMessage } from "../shared/noticeSystem";
import { TypePicker } from "./TypePicker";

type TableRowField = keyof Omit<TableRow, "id" | "modeValues">;

export interface TableCreateFormProps {
  collectionId: string;
  collectionModeNames: string[];
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
  onAddRow: (fields?: NewTableRowFields) => void;
  onRemoveRow: (id: string) => void;
  onUpdateRow: (id: string, field: TableRowField, value: string) => void;
  onUpdateModeValue: (id: string, modeName: string, value: string) => void;
  onCopyFirstModeToEmptyModes: () => void;
  onClose: () => void;
  onRestoreDraft: () => void;
  onDismissDraft: () => void;
  onCreateAll: () => void;
}

export function TableCreateForm({
  collectionId,
  collectionModeNames,
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
  onUpdateModeValue,
  onCopyFirstModeToEmptyModes,
  onClose,
  onRestoreDraft,
  onDismissDraft,
  onCreateAll,
}: TableCreateFormProps) {
  const nameInputRefs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocusLastRowRef = useRef(false);
  const creatableRowCount = useMemo(
    () => tableRows.filter((r) => r.name.trim()).length,
    [tableRows],
  );
  const hasNamedRows = creatableRowCount > 0;
  const modeNames =
    collectionModeNames.length > 0 ? collectionModeNames : ["Default"];
  const multiMode = modeNames.length > 1;
  const rowGridTemplateColumns = multiMode
    ? `minmax(116px,1fr) 76px repeat(${modeNames.length}, minmax(104px,1fr)) 18px`
    : "minmax(0,1fr) 76px minmax(0,1fr) 18px";

  useEffect(() => {
    if (!pendingFocusLastRowRef.current) return;
    const lastRow = tableRows[tableRows.length - 1];
    if (!lastRow) return;
    const input = nameInputRefs.current.get(lastRow.id);
    if (!input) return;
    input.focus();
    pendingFocusLastRowRef.current = false;
  }, [tableRows]);

  const setRowNameInputRef = (id: string) => (node: HTMLInputElement | null) => {
    if (node) {
      nameInputRefs.current.set(id, node);
    } else {
      nameInputRefs.current.delete(id);
    }
  };

  const addRowAndFocus = (fields?: NewTableRowFields) => {
    pendingFocusLastRowRef.current = true;
    onAddRow(fields);
  };

  const addSuggestedName = (leafName: string) => {
    const emptyRow = tableRows.find((r) => !r.name.trim());
    if (emptyRow) {
      onUpdateRow(emptyRow.id, "name", leafName);
      return;
    }
    addRowAndFocus({ name: leafName });
  };

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
                "bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-action-bg-hover)]",
            }}
            onDismiss={onDismissDraft}
            dismissLabel="Discard"
            dismissMode="text"
            dismissClassName="border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            <span className="block text-[color:var(--color-figma-text)]">
              You have unsaved bulk-create data. Restore it?
            </span>
          </InlineBanner>
        )}
        {/* Collection indicator */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">
          <Folder aria-hidden="true" size={12} className="shrink-0 text-[color:var(--color-figma-text-secondary)]" />
          <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            Bulk create in:
          </span>
          <span className="text-secondary font-medium text-[color:var(--color-figma-text)] truncate">
            {collectionId}
          </span>
        </div>
        {/* Group picker */}
        <div>
          <label
            className="block text-secondary text-[color:var(--color-figma-text-tertiary)] mb-0.5"
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
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
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
            <span className="text-secondary text-[color:var(--color-figma-text-tertiary)] self-center mr-0.5">
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
                  onClick={() => addSuggestedName(leafName)}
                  className="px-1.5 py-0.5 rounded text-secondary bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[color:var(--color-figma-text-accent)] transition-colors cursor-pointer"
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
        {/* Token rows */}
        <div>
          {multiMode ? (
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 px-0.5">
              <p className="m-0 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                Fill each mode value. Use copy when the starting values should match.
              </p>
              <button
                type="button"
                onClick={onCopyFirstModeToEmptyModes}
                disabled={busy}
                className="shrink-0 rounded px-1.5 py-0.5 text-secondary font-medium text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
              >
                Copy {modeNames[0]} to empty modes
              </button>
            </div>
          ) : null}
          {/* Column headers */}
          <div className="overflow-x-auto">
            <div
              className="grid gap-1 mb-1 min-w-full px-0.5"
              style={{
                gridTemplateColumns: rowGridTemplateColumns,
              }}
            >
              <span className="text-secondary font-medium text-[color:var(--color-figma-text-tertiary)]">
                Name
              </span>
              <span className="text-secondary font-medium text-[color:var(--color-figma-text-tertiary)]">
                Type
              </span>
              {modeNames.map((modeName) => (
                <span
                  key={modeName}
                  className="truncate text-secondary font-medium text-[color:var(--color-figma-text-tertiary)]"
                  title={modeName}
                >
                  {multiMode ? modeName : "Value"}
                </span>
              ))}
              <span />
            </div>
            {tableRows.map((row, idx) => (
              <div key={row.id} className="mb-1 min-w-full">
              <div
                className="grid gap-1 items-center"
                style={{
                  gridTemplateColumns: rowGridTemplateColumns,
                }}
              >
                <input
                  ref={setRowNameInputRef(row.id)}
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
                  aria-label={`Token ${idx + 1} name`}
                  autoFocus={idx === 0}
                  className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[color:var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)] ${rowErrors[row.id] ? "border-[var(--color-figma-error)]" : "border-[var(--color-figma-border)]"}`}
                />
                <TypePicker
                  value={row.type}
                  onChange={(v) => onUpdateRow(row.id, "type", v)}
                  ariaLabel={`Token ${idx + 1} type`}
                  className="w-full px-1 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
                />
                {modeNames.map((modeName, modeIndex) => {
                  const isPrimaryMode = modeIndex === 0;
                  const modeValue = row.modeValues[modeName] ?? "";
                  return (
                    <input
                      key={modeName}
                      type="text"
                      placeholder={
                        multiMode && !isPrimaryMode
                          ? modeName
                          : multiMode
                            ? modeName
                            : "value"
                      }
                      value={modeValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        onUpdateModeValue(row.id, modeName, val);
                        if (isPrimaryMode) {
                          const inferred = inferTypeFromValue(val);
                          if (inferred) onUpdateRow(row.id, "type", inferred);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Tab" &&
                          !e.shiftKey &&
                          idx === tableRows.length - 1 &&
                          modeIndex === modeNames.length - 1
                        ) {
                          e.preventDefault();
                          addRowAndFocus();
                        }
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey))
                          onCreateAll();
                      }}
                      aria-label={
                        multiMode
                          ? `Token ${idx + 1} ${modeName} value`
                          : `Token ${idx + 1} value`
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
                    />
                  );
                })}
                <button
                  type="button"
                  onClick={() => onRemoveRow(row.id)}
                  tabIndex={-1}
                  aria-label={`Remove row ${idx + 1}`}
                  className="w-[18px] h-[18px] flex items-center justify-center rounded text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
              {rowErrors[row.id] && (
                <NoticeFieldMessage severity="error" className="pl-0.5">
                  {rowErrors[row.id]}
                </NoticeFieldMessage>
              )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => addRowAndFocus()}
            className="mt-0.5 w-full px-2 py-1 rounded border border-dashed border-[var(--color-figma-border)] text-[color:var(--color-figma-text-tertiary)] text-secondary hover:border-[var(--color-figma-accent)] hover:text-[color:var(--color-figma-text-accent)] transition-colors inline-flex items-center justify-center gap-1"
          >
            <Plus size={12} aria-hidden="true" />
            Add Row
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
              !hasNamedRows
            }
            title={
              !hasNamedRows
                ? "Enter at least one token name"
                : "Create all tokens (Ctrl+Enter)"
            }
            className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] text-body font-medium hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40"
          >
            {busy
              ? "Creating\u2026"
              : `Create ${creatableRowCount > 0 ? `${creatableRowCount} ` : ""}Token${creatableRowCount !== 1 ? "s" : ""}`}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[color:var(--color-figma-text-secondary)] text-body hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
