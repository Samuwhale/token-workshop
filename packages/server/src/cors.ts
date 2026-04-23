export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (origin === undefined) {
    return true;
  }

  if (origin === "null") {
    return true;
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  if (parsedOrigin.protocol === "https:") {
    return (
      parsedOrigin.hostname === "figma.com" ||
      parsedOrigin.hostname === "www.figma.com" ||
      parsedOrigin.hostname.endsWith(".figma.com")
    );
  }

  if (parsedOrigin.protocol !== "http:") {
    return false;
  }

  return (
    parsedOrigin.hostname === "localhost" ||
    parsedOrigin.hostname === "127.0.0.1" ||
    parsedOrigin.hostname === "::1" ||
    parsedOrigin.hostname === "[::1]"
  );
}
