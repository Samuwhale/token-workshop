import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch, ApiError } from "../shared/apiFetch";
import { validateJsonRefs } from "../components/tokenListHelpers";
import { getErrorMessage } from "../shared/utils";
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

  // Load raw JSON when entering JSON view (or when collectionId changes in JSON view)
  useEffect(() => {
    if (viewMode !== "json" || !connected || !serverUrl || !collectionId) return;
    if (jsonDirty) return; // don't clobber unsaved edits
    apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/raw`)
      .then((data) => {
        const text = JSON.stringify(data, null, 2);
        setJsonText(text);
        setJsonError(null);
        setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
      })
      .catch(() => setJsonError("Failed to load JSON"));
  }, [viewMode, collectionId, connected, serverUrl, jsonDirty, allTokensFlat]);

  // Sync from list view → JSON when tokens change externally (not dirty)
  useEffect(() => {
    if (
      viewMode !== "json" ||
      jsonDirty ||
      !connected ||
      !serverUrl ||
      !collectionId
    )
      return;
    apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/raw`)
      .then((data) => {
        const text = JSON.stringify(data, null, 2);
        setJsonText(text);
        setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
      })
      .catch((err) => console.warn("[TokenList] fetch raw JSON failed:", err));
  }, [
    tokens,
    viewMode,
    jsonDirty,
    connected,
    serverUrl,
    collectionId,
    allTokensFlat,
  ]);

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
    apiFetch(
      `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/raw`,
    )
      .then((data) => {
        const text = JSON.stringify(data, null, 2);
        setJsonText(text);
        setJsonError(null);
        setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
      })
      .catch((err) =>
        console.warn("[TokenList] reload raw JSON failed:", err),
      );
  }, [serverUrl, collectionId, allTokensFlat]);

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
