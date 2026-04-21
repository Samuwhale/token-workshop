import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch, ApiError, createFetchSignal } from "../shared/apiFetch";
import { validateJsonRefs } from "../components/tokenListHelpers";
import { getErrorMessage, isAbortError } from "../shared/utils";
import type { TokenMapEntry } from "../../shared/types";
import type { TokenNode } from "./useTokens";

export interface UseJsonEditorParams {
  viewMode: string;
  connected: boolean;
  serverUrl: string;
  collectionId: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  tokens: TokenNode[];
  onRefresh: () => void;
}

export function useJsonEditor({
  viewMode,
  connected,
  serverUrl,
  collectionId,
  allTokensFlat,
  tokens,
  onRefresh,
}: UseJsonEditorParams) {
  const [jsonText, setJsonText] = useState("");
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSaving, setJsonSaving] = useState(false);
  const [jsonBrokenRefs, setJsonBrokenRefs] = useState<string[]>([]);
  const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);

  const loadJson = useCallback(async (signal?: AbortSignal) => {
    const data = await apiFetch(
      `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/raw`,
      { signal: createFetchSignal(signal, 10_000) },
    );
    const text = JSON.stringify(data, null, 2);
    setJsonText(text);
    setJsonError(null);
    setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
  }, [allTokensFlat, collectionId, serverUrl]);

  useEffect(() => {
    if (
      viewMode !== "json" ||
      jsonDirty ||
      !connected ||
      !serverUrl ||
      !collectionId
    ) {
      return;
    }

    const controller = new AbortController();
    loadJson(controller.signal).catch((err) => {
      if (isAbortError(err)) return;
      console.warn("[TokenList] fetch raw JSON failed:", err);
      setJsonError("Failed to load JSON");
    });

    return () => {
      controller.abort();
    };
  }, [tokens, viewMode, jsonDirty, connected, serverUrl, collectionId, loadJson]);

  const handleJsonChange = useCallback(
    (val: string) => {
      setJsonText(val);
      setJsonDirty(true);
      try {
        JSON.parse(val);
        setJsonError(null);
        setJsonBrokenRefs(validateJsonRefs(val, allTokensFlat));
      } catch (err) {
        setJsonError(getErrorMessage(err, "Invalid JSON"));
        setJsonBrokenRefs([]);
      }
    },
    [allTokensFlat],
  );

  const handleJsonSave = useCallback(async () => {
    if (jsonError || !jsonText.trim()) return;
    setJsonSaving(true);
    try {
      const parsed = JSON.parse(jsonText);
      await apiFetch(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        },
      );
      setJsonDirty(false);
      onRefresh();
    } catch (err) {
      setJsonError(
        err instanceof ApiError
          ? err.message
          : "Invalid JSON — cannot save",
      );
    } finally {
      setJsonSaving(false);
    }
  }, [jsonError, jsonText, serverUrl, collectionId, onRefresh]);

  const handleJsonRevert = useCallback(() => {
    setJsonDirty(false);
    void loadJson().catch((err) => {
      if (isAbortError(err)) return;
      console.warn("[TokenList] reload raw JSON failed:", err);
      setJsonError("Failed to load JSON");
    });
  }, [loadJson]);

  return {
    jsonText,
    jsonDirty,
    jsonError,
    jsonSaving,
    jsonBrokenRefs,
    jsonTextareaRef,
    handleJsonChange,
    handleJsonSave,
    handleJsonRevert,
  };
}
