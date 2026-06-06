/**
 * Storage-key path safety for the authenticated file-serving route.
 *
 * Keys are tenant-prefixed (`<tenantId>/<id>-<name>`). The serving route
 * receives them as catch-all URL segments; this helper rejects any
 * path-traversal / nul / backslash attempt and reconstructs the key.
 *
 * Kept in its own module (no Next imports) so it is unit-testable under
 * vitest without pulling in the Next/next-auth runtime.
 */
export function safeKeySegments(parts: string[]): string | null {
  if (!parts || parts.length === 0) return null;
  const decoded: string[] = [];
  for (const raw of parts) {
    if (!raw) return null;
    // Decode FIRST, then validate. Validating the still-encoded segment and
    // decoding afterwards (the previous behaviour) let a double-encoded
    // payload such as `%2e%2e` / `%252e%252e` slip past the `..` check and
    // then decode back into a traversal sequence. Decode once here so the
    // checks below see exactly what will hit the filesystem.
    let p: string;
    try {
      p = decodeURIComponent(raw);
    } catch {
      // Malformed percent-encoding (e.g. a lone `%`).
      return null;
    }
    if (
      p === "" ||
      p === "." ||
      p === ".." ||
      p.includes("/") || // an encoded separator (%2f) must not inject a path part
      p.includes("\\") ||
      p.includes("\0")
    ) {
      return null;
    }
    decoded.push(p);
  }
  return decoded.join("/");
}
