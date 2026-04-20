import { useCallback, useEffect, useRef } from "react";
import type { TokenNode } from "../../hooks/useTokens";
import { STORAGE_KEYS, lsGet } from "../../shared/storage";
import type { PreferredCopyFormat } from "../SettingsPanel";

/** Build nested DTCG JSON from a list of token nodes and copy to clipboard. */
function buildDtcgJson(nodes: TokenNode[]): string {
  const root: Record<string, any> = {};
  for (const node of nodes) {
    if (node.isGroup) continue;
    const segments = node.path.split(".");
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      if (!(segments[i] in cursor)) cursor[segments[i]] = {};
      cursor = cursor[segments[i]];
    }
    const leaf: Record<string, unknown> = {
      $value: node.$value,
      $type: node.$type,
    };
    if (node.$description) leaf.$description = node.$description;
    cursor[segments[segments.length - 1]] = leaf;
  }
  return JSON.stringify(root, null, 2);
}

export function useTokenListClipboard(callbacks: {
  setCopyFeedback: (v: boolean) => void;
  setCopyCssFeedback: (v: boolean) => void;
  setCopyPreferredFeedback: (v: boolean) => void;
  setCopyAliasFeedback: (v: boolean) => void;
}) {
  const {
    setCopyFeedback,
    setCopyCssFeedback,
    setCopyPreferredFeedback,
    setCopyAliasFeedback,
  } = callbacks;
  const feedbackTimersRef = useRef<{
    json: ReturnType<typeof setTimeout> | null;
    css: ReturnType<typeof setTimeout> | null;
    preferred: ReturnType<typeof setTimeout> | null;
    alias: ReturnType<typeof setTimeout> | null;
  }>({
    json: null,
    css: null,
    preferred: null,
    alias: null,
  });

  useEffect(() => {
    const feedbackTimers = feedbackTimersRef.current;
    return () => {
      for (const timer of Object.values(feedbackTimers)) {
        if (timer !== null) {
          clearTimeout(timer);
        }
      }
    };
  }, []);

  const flashFeedback = useCallback((
    key: keyof typeof feedbackTimersRef.current,
    setter: (value: boolean) => void,
  ) => {
    const existing = feedbackTimersRef.current[key];
    if (existing !== null) {
      clearTimeout(existing);
    }
    setter(true);
    feedbackTimersRef.current[key] = setTimeout(() => {
      feedbackTimersRef.current[key] = null;
      setter(false);
    }, 1500);
  }, []);

  const writeToClipboard = useCallback(async (
    text: string,
    key: keyof typeof feedbackTimersRef.current,
    setter: (value: boolean) => void,
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      flashFeedback(key, setter);
    } catch (err) {
      console.warn("[TokenList] clipboard write failed:", err);
    }
  }, [flashFeedback]);

  /** Build nested DTCG JSON from a list of token nodes and copy to clipboard. */
  const copyTokensAsJson = useCallback((nodes: TokenNode[]) => {
    if (nodes.length === 0) return;
    const json = buildDtcgJson(nodes);
    void writeToClipboard(json, "json", setCopyFeedback);
  }, [setCopyFeedback, writeToClipboard]);

  /** Convert token paths to CSS custom property references and copy to clipboard. */
  const copyTokensAsCssVar = useCallback((nodes: TokenNode[]) => {
    const leafNodes = nodes.filter((n) => !n.isGroup);
    if (leafNodes.length === 0) return;
    const text = leafNodes
      .map((n) => `var(--${n.path.replace(/\./g, "-")})`)
      .join("\n");
    void writeToClipboard(text, "css", setCopyCssFeedback);
  }, [setCopyCssFeedback, writeToClipboard]);

  /** Copy token paths as DTCG alias reference syntax ({path.to.token}). */
  const copyTokensAsDtcgRef = useCallback((nodes: TokenNode[]) => {
    const leafNodes = nodes.filter((n) => !n.isGroup);
    if (leafNodes.length === 0) return;
    const text = leafNodes.map((n) => `{${n.path}}`).join("\n");
    void writeToClipboard(text, "alias", setCopyAliasFeedback);
  }, [setCopyAliasFeedback, writeToClipboard]);

  /** Copy the focused/selected token(s) in the user's preferred format. */
  const copyTokensAsPreferred = useCallback((nodes: TokenNode[]) => {
    const leafNodes = nodes.filter((n) => !n.isGroup);
    if (leafNodes.length === 0) return;

    const fmt = (lsGet(STORAGE_KEYS.PREFERRED_COPY_FORMAT) ??
      "css-var") as PreferredCopyFormat;

    let text: string;
    if (fmt === "json") {
      text = buildDtcgJson(leafNodes);
    } else if (fmt === "raw") {
      text = leafNodes
        .map((n) =>
          typeof n.$value === "string" ? n.$value : JSON.stringify(n.$value),
        )
        .join("\n");
    } else if (fmt === "dtcg-ref") {
      text = leafNodes.map((n) => `{${n.path}}`).join("\n");
    } else if (fmt === "scss") {
      text = leafNodes.map((n) => `$${n.path.replace(/\./g, "-")}`).join("\n");
    } else {
      // css-var (default)
      text = leafNodes
        .map((n) => `var(--${n.path.replace(/\./g, "-")})`)
        .join("\n");
    }

    void writeToClipboard(text, "preferred", setCopyPreferredFeedback);
  }, [setCopyPreferredFeedback, writeToClipboard]);

  return {
    copyTokensAsJson,
    copyTokensAsCssVar,
    copyTokensAsDtcgRef,
    copyTokensAsPreferred,
  };
}
