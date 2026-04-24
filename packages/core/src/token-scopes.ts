export const FIGMA_SCOPE_EXTENSION_KEY = "com.figma.scopes";

function cloneExtensions(
  extensions: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return extensions ? { ...extensions } : {};
}

export function normalizeTokenScopeValues(
  scopes: readonly unknown[] | null | undefined,
): string[] | undefined {
  if (!Array.isArray(scopes)) {
    return undefined;
  }

  const normalizedScopes = scopes
    .filter((scope): scope is string => typeof scope === "string")
    .map((scope) => scope.trim().toUpperCase())
    .filter(Boolean);

  return normalizedScopes.length > 0
    ? [...new Set(normalizedScopes)]
    : undefined;
}

export function readTokenScopes(token: {
  $extensions?: Record<string, unknown>;
}): string[] {
  return (
    normalizeTokenScopeValues(
      Array.isArray(token.$extensions?.[FIGMA_SCOPE_EXTENSION_KEY])
        ? (token.$extensions?.[FIGMA_SCOPE_EXTENSION_KEY] as unknown[])
        : undefined,
      ) ?? []
  );
}

export function stripTokenScopesFromExtensions(
  extensions: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  const nextExtensions = cloneExtensions(extensions);
  delete nextExtensions[FIGMA_SCOPE_EXTENSION_KEY];
  return Object.keys(nextExtensions).length > 0 ? nextExtensions : undefined;
}

export function buildTokenExtensionsWithScopes(
  extensions: Record<string, unknown> | null | undefined,
  scopes: readonly unknown[] | null | undefined,
): Record<string, unknown> | undefined {
  const nextExtensions = cloneExtensions(
    stripTokenScopesFromExtensions(extensions),
  );
  const normalizedScopes = normalizeTokenScopeValues(scopes);
  if (normalizedScopes) {
    nextExtensions[FIGMA_SCOPE_EXTENSION_KEY] = normalizedScopes;
  }
  return Object.keys(nextExtensions).length > 0 ? nextExtensions : undefined;
}
