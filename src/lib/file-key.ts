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
  for (const p of parts) {
    if (!p || p === "." || p === ".." || p.includes("\\") || p.includes("\0")) return null;
  }
  return parts.map((p) => decodeURIComponent(p)).join("/");
}
