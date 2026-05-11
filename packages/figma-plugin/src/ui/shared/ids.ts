let idCounter = 0;

export function createUiId(prefix: string): string {
  idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}
