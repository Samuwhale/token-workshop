import { useCallback, useEffect, useRef, useState } from "react";
import type { ValidationIssue } from "./useValidationCache";
import { apiFetch } from "../shared/apiFetch";
import {
  createTokenBody,
  deleteToken,
  updateToken,
} from "../shared/tokenMutations";
import {
  canApplyIssueFixDirectly,
  getUnsupportedIssueFixMessage,
} from "../shared/issueFixes";
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
  const suppressedKeysRef = useRef(suppressedKeys);
  const suppressionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const suppressionMutationVersionRef = useRef(0);

  useEffect(() => {
    suppressedKeysRef.current = suppressedKeys;
  }, [suppressedKeys]);

  const setSuppressedKeysState = useCallback((next: Set<string>) => {
    suppressedKeysRef.current = next;
    setSuppressedKeys(next);
  }, []);

  const enqueueSuppressionUpdate = useCallback((
    key: string,
    mutate: (current: Set<string>) => Set<string>,
    errorMessage: string,
  ) => {
    const task = suppressionQueueRef.current.then(async () => {
      const current = new Set(suppressedKeysRef.current);
      const next = mutate(current);
      const didChange =
        next.size !== current.size ||
        [...next].some((entry) => !current.has(entry));
      if (!didChange) {
        return;
      }

      setSuppressingKey(key);
      suppressionMutationVersionRef.current += 1;
      setSuppressedKeysState(next);

      try {
        await apiFetch(`${serverUrl}/api/lint/suppressions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suppressions: [...next] }),
        });
      } catch {
        setSuppressedKeysState(current);
        onError(errorMessage);
      } finally {
        setSuppressingKey((currentKey) => (currentKey === key ? null : currentKey));
      }
    });

    suppressionQueueRef.current = task.catch(() => {});
    return task;
  }, [onError, serverUrl, setSuppressedKeysState]);

  useEffect(() => {
    if (!connected || !serverUrl) {
      setSuppressedKeysState(new Set());
      setSuppressingKey(null);
      setFixingKeys(new Set());
      return;
    }

    let cancelled = false;
    const fetchVersion = suppressionMutationVersionRef.current;

    apiFetch<{ suppressions: string[] }>(`${serverUrl}/api/lint/suppressions`)
      .then((data) => {
        if (
          !cancelled &&
          Array.isArray(data.suppressions) &&
          suppressionMutationVersionRef.current === fetchVersion
        ) {
          setSuppressedKeysState(new Set(data.suppressions));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connected, serverUrl, setSuppressedKeysState]);

  const handleSuppress = useCallback(async (issue: ValidationIssue) => {
    const key = suppressKey(issue);
    await enqueueSuppressionUpdate(
      key,
      (current) => {
        const next = new Set(current);
        next.add(key);
        return next;
      },
      "Failed to save suppression",
    );
  }, [enqueueSuppressionUpdate]);

  const handleUnsuppress = useCallback(async (key: string) => {
    await enqueueSuppressionUpdate(
      key,
      (current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      },
      "Failed to remove suppression",
    );
  }, [enqueueSuppressionUpdate]);

  const applyIssueFix = useCallback(async (issue: ValidationIssue) => {
    const key = suppressKey(issue);
    setFixingKeys((prev) => { const next = new Set(prev); next.add(key); return next; });
    try {
      if (!canApplyIssueFixDirectly(issue)) {
        throw new Error(getUnsupportedIssueFixMessage(issue));
      }

      if (issue.suggestedFix === "add-description") {
        await updateToken(serverUrl, issue.collectionId, issue.path, createTokenBody({ $description: "" }));
      } else if (issue.suggestedFix === "flatten-alias-chain" || issue.suggestedFix === "extract-to-alias") {
        await updateToken(serverUrl, issue.collectionId, issue.path, createTokenBody({ $value: issue.suggestion! }));
      } else if (issue.suggestedFix === "delete-token") {
        await deleteToken(serverUrl, issue.collectionId, issue.path);
      } else if (issue.suggestedFix === "rename-token") {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(issue.collectionId)}/tokens/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldPath: issue.path, newPath: issue.suggestion!, updateAliases: true }),
        });
      } else if (issue.suggestedFix === "fix-type") {
        await updateToken(serverUrl, issue.collectionId, issue.path, createTokenBody({ $type: issue.suggestion! }));
      } else {
        throw new Error(getUnsupportedIssueFixMessage(issue));
      }
      await onRefreshValidation();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Fix failed — check connection and retry.");
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
