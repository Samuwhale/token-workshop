import type { Ref } from "react";
import { NoticeFieldMessage } from "../shared/noticeSystem";

export interface JsonEditorViewProps {
  jsonText: string;
  jsonDirty: boolean;
  jsonError: string | null;
  jsonSaving: boolean;
  jsonBrokenRefs: string[];
  jsonTextareaRef: Ref<HTMLTextAreaElement>;
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
  connected,
  hasTokens,
  onChange,
  onSave,
  onRevert,
}: JsonEditorViewProps) {
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
        className="flex-1 p-3 font-mono text-[10px] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none resize-none leading-relaxed placeholder:text-[var(--color-figma-text-tertiary)]"
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
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {!hasTokens
              ? "Paste DTCG JSON to import tokens"
              : jsonDirty
                ? "Unsaved changes"
                : "Up to date"}
          </span>
          <div className="flex gap-1">
            {jsonDirty && hasTokens && (
              <button
                onClick={onRevert}
                className="px-2 py-0.5 rounded text-[10px] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
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
              className="px-2 py-0.5 rounded text-[10px] transition-colors bg-[var(--color-figma-accent)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            >
              {jsonSaving ? "Saving\u2026" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
