import { useCallback, useEffect, useState } from "react";
import type { ValidationIssue } from "./useValidationCache";
import { apiFetch } from "../shared/apiFetch";
import {
  createTokenBody,
  deleteToken,
  updateToken,
} from "../shared/tokenMutations";
import { suppressKey } from "../shared/ruleLabels";

export interface UseIssueActionsParams {
  serverUrl: string;
  connected: boolean;
  onRefreshValidation: () => Promise<unknown> | void;
  onError: (msg: string) => void;
}

export interface UseIssueActionsResult {
  suppressedKeys: Set<string>;
  suppressingKey: string | null;
  fixingKeys: Set<string>;
  applyIssueFix: (issue: ValidationIssue) => Promise<void>;
  handleSuppress: (issue: ValidationIssue) => Promise<void>;
  handleUnsuppress: (key: string) => Promise<void>;
}

export function useIssueActions({
  serverUrl,
  connected,
  onRefreshValidation,
  onError,
}: UseIssueActionsParams): UseIssueActionsResult {
  const [suppressedKeys, setSuppressedKeys] = useState<Set<string>>(new Set());
  const [suppressingKey, setSuppressingKey] = useState<string | null>(null);
  const [fixingKeys, setFixingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!connected || !serverUrl) return;
    apiFetch<{ suppressions: string[] }>(`${serverUrl}/api/lint/suppressions`)
      .then((data) => {
        if (Array.isArray(data.suppressions)) setSuppressedKeys(new Set(data.suppressions));
      })
      .catch(() => {});
  }, [connected, serverUrl]);

  const handleSuppress = useCallback(async (issue: ValidationIssue) => {
    const key = suppressKey(issue);
    if (suppressedKeys.has(key)) return;
    setSuppressingKey(key);
    const next = new Set(suppressedKeys);
    next.add(key);
    setSuppressedKeys(next);
    try {
      await apiFetch(`${serverUrl}/api/lint/suppressions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suppressions: [...next] }),
      });
    } catch {
      setSuppressedKeys((prev) => { const r = new Set(prev); r.delete(key); return r; });
      onError("Failed to save suppression");
    } finally {
      setSuppressingKey(null);
    }
  }, [serverUrl, suppressedKeys, onError]);

  const handleUnsuppress = useCallback(async (key: string) => {
    setSuppressingKey(key);
    const next = new Set(suppressedKeys);
    next.delete(key);
    setSuppressedKeys(next);
    try {
      await apiFetch(`${serverUrl}/api/lint/suppressions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suppressions: [...next] }),
      });
    } catch {
      setSuppressedKeys((prev) => { const r = new Set(prev); r.add(key); return r; });
      onError("Failed to remove suppression");
    } finally {
      setSuppressingKey(null);
    }
  }, [serverUrl, suppressedKeys, onError]);

  const applyIssueFix = useCallback(async (issue: ValidationIssue) => {
    const key = suppressKey(issue);
    setFixingKeys((prev) => { const next = new Set(prev); next.add(key); return next; });
    try {
      if (issue.suggestedFix === "add-description") {
        await updateToken(serverUrl, issue.collectionId, issue.path, createTokenBody({ $description: "" }));
      } else if ((issue.suggestedFix === "flatten-alias-chain" || issue.suggestedFix === "extract-to-alias") && issue.suggestion) {
        await updateToken(serverUrl, issue.collectionId, issue.path, createTokenBody({ $value: issue.suggestion }));
      } else if (issue.suggestedFix === "delete-token") {
        await deleteToken(serverUrl, issue.collectionId, issue.path);
      } else if (issue.suggestedFix === "rename-token" && issue.suggestion) {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(issue.collectionId)}/tokens/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldPath: issue.path, newPath: issue.suggestion, updateAliases: true }),
        });
      } else if (issue.suggestedFix === "fix-type" && issue.suggestion) {
        await updateToken(serverUrl, issue.collectionId, issue.path, createTokenBody({ $type: issue.suggestion }));
      }
      await onRefreshValidation();
    } catch {
      onError("Fix failed — check connection and retry.");
    } finally {
      setFixingKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [serverUrl, onRefreshValidation, onError]);

  return {
    suppressedKeys,
    suppressingKey,
    fixingKeys,
    applyIssueFix,
    handleSuppress,
    handleUnsuppress,
  };
}
