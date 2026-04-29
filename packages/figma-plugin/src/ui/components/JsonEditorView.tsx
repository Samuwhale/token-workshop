import { useEffect, useMemo, type Ref } from "react";
import { NoticeFieldMessage } from "../shared/noticeSystem";

export interface JsonEditorViewProps {
  jsonText: string;
  jsonDirty: boolean;
  jsonError: string | null;
  jsonSaving: boolean;
  jsonBrokenRefs: string[];
  jsonTextareaRef: Ref<HTMLTextAreaElement>;
  searchQuery?: string;
  connected: boolean;
  hasTokens: boolean;
  onChange: (val: string) => void;
  onSave: () => void;
  onRevert: () => void;
}

export function JsonEditorView({
  jsonText,
  jsonDirty,
  jsonError,
  jsonSaving,
  jsonBrokenRefs,
  jsonTextareaRef,
  searchQuery = "",
  connected,
  hasTokens,
  onChange,
  onSave,
  onRevert,
}: JsonEditorViewProps) {
  const jsonSearch = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) {
      return { query: "", firstIndex: -1, count: 0 };
    }

    const source = jsonText.toLocaleLowerCase();
    const needle = query.toLocaleLowerCase();
    let count = 0;
    let firstIndex = -1;
    let fromIndex = 0;

    while (fromIndex <= source.length) {
      const nextIndex = source.indexOf(needle, fromIndex);
      if (nextIndex === -1) break;
      if (firstIndex === -1) firstIndex = nextIndex;
      count += 1;
      fromIndex = nextIndex + Math.max(needle.length, 1);
    }

    return { query, firstIndex, count };
  }, [jsonText, searchQuery]);

  useEffect(() => {
    if (!jsonSearch.query || jsonSearch.firstIndex < 0) return;
    if (!jsonTextareaRef || typeof jsonTextareaRef === "function" || !("current" in jsonTextareaRef)) return;

    const textarea = jsonTextareaRef.current;
    if (!textarea) return;

    const start = jsonSearch.firstIndex;
    const end = start + jsonSearch.query.length;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(start, end);
  }, [jsonSearch.firstIndex, jsonSearch.query, jsonTextareaRef]);

  const searchStatus =
    jsonSearch.query.length === 0
      ? null
      : jsonSearch.count === 0
        ? "No matches"
        : `${jsonSearch.count} match${jsonSearch.count === 1 ? "" : "es"}`;

  return (
    <div className="h-full flex flex-col">
      <textarea
        ref={jsonTextareaRef}
        value={jsonText}
        onChange={(e) => onChange(e.target.value)}
        aria-label="JSON editor"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            onSave();
          }
        }}
        placeholder={
          '{\n  "color": {\n    "primary": {\n      "$value": "#3b82f6",\n      "$type": "color"\n    }\n  }\n}'
        }
        spellCheck={false}
        className="flex-1 p-3 font-mono text-secondary bg-[var(--color-figma-bg)] text-[color:var(--color-figma-text)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] resize-none leading-relaxed placeholder:text-[color:var(--color-figma-text-tertiary)]"
        style={{ minHeight: 0 }}
      />
      <div className="shrink-0 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 flex flex-col gap-1">
        {jsonError && (
          <NoticeFieldMessage severity="error" className="font-mono">
            {jsonError}
          </NoticeFieldMessage>
        )}
        {jsonBrokenRefs.length > 0 && !jsonError && (
          <NoticeFieldMessage severity="warning">
            <span className="flex flex-wrap gap-1 items-center">
              <span className="font-medium shrink-0">Broken refs:</span>
              {jsonBrokenRefs.map((r) => (
                <span
                  key={r}
                  className="font-mono bg-[var(--color-figma-warning)]/10 rounded px-1"
                >
                  {"{" + r + "}"}
                </span>
              ))}
            </span>
          </NoticeFieldMessage>
        )}
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
              {!hasTokens
                ? "Paste DTCG JSON to import tokens"
                : jsonDirty
                  ? "Unsaved changes"
                  : "Up to date"}
            </span>
            {searchStatus ? (
              <span className="truncate text-secondary text-[color:var(--color-figma-text-tertiary)]">
                {searchStatus}
              </span>
            ) : null}
          </div>
          <div className="flex gap-1">
            {jsonDirty && hasTokens && (
              <button
                onClick={onRevert}
                className="px-2 py-0.5 rounded text-secondary border border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Revert
              </button>
            )}
            <button
              onClick={onSave}
              disabled={
                !!jsonError ||
                jsonSaving ||
                !connected ||
                !jsonText.trim()
              }
              className="px-2 py-0.5 rounded text-secondary transition-colors bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] disabled:opacity-40 hover:opacity-90"
            >
              {jsonSaving ? "Saving\u2026" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
