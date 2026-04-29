export interface ExportFilePathParts {
  fileName: string;
  directory: string | null;
}

export interface ExportPlatformResultSummary {
  platform: string;
  error?: string;
}

export interface ExportFileIdentity {
  platform: string;
  path: string;
}

export function exportFileId(file: ExportFileIdentity): string {
  return `${file.platform}:${file.path}`;
}

export function splitExportFilePath(path: string): ExportFilePathParts {
  const normalized = path.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");

  if (lastSlash < 0) {
    return { fileName: normalized, directory: null };
  }

  return {
    fileName: normalized.slice(lastSlash + 1),
    directory: normalized.slice(0, lastSlash) || null,
  };
}

export function exportDownloadFileName(
  path: string,
  fallback = "tokens.txt",
): string {
  return splitExportFilePath(path).fileName || fallback;
}

export function summarizeExportMessages(
  messages: string[] | undefined,
  visibleCount: number,
): string | null {
  if (!messages || messages.length === 0) {
    return null;
  }

  const visibleMessages = messages.slice(0, visibleCount);
  const remainingCount = messages.length - visibleMessages.length;
  return remainingCount > 0
    ? `${visibleMessages.join(" | ")} | ${remainingCount} more`
    : visibleMessages.join(" | ");
}

export function summarizeExportPlatformErrors(
  results: ExportPlatformResultSummary[],
): string | null {
  const failures = results
    .filter(
      (result): result is ExportPlatformResultSummary & { error: string } =>
        typeof result.error === "string" && result.error.trim().length > 0,
    )
    .map((result) => `${result.platform}: ${result.error.trim()}`);

  return summarizeExportMessages(failures, 3);
}
