const EMPTY_GROUP_PATH_MESSAGE = "Enter a group path";
const EMPTY_GROUP_SEGMENT_MESSAGE = "Remove empty path segments";

function splitGroupPath(path: string): string[] {
  return path.split(".").map((segment) => segment.trim());
}

export function normalizeGroupPath(parentPath: string, inputPath: string): string {
  const trimmedInput = inputPath.trim();
  const combinedPath = parentPath ? `${parentPath}.${trimmedInput}` : trimmedInput;
  return splitGroupPath(combinedPath).join(".");
}

export function getGroupPathPreview(parentPath: string, inputPath: string): string {
  return inputPath.trim() ? normalizeGroupPath(parentPath, inputPath) : parentPath;
}

export function getGroupPathValidationError(
  inputPath: string,
  options: { allowEmpty?: boolean } = {},
): string | null {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return options.allowEmpty ? null : EMPTY_GROUP_PATH_MESSAGE;
  }
  return splitGroupPath(trimmed).some((segment) => segment.length === 0)
    ? EMPTY_GROUP_SEGMENT_MESSAGE
    : null;
}
