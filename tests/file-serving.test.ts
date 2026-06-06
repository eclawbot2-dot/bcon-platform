import { describe, it, expect } from "vitest";
import { safeKeySegments } from "../src/lib/file-key";

/**
 * Authenticated file-serving route guards.
 *
 * The route itself needs the Next request/session runtime, so here we
 * test the two security-critical pure pieces:
 *   1. safeKeySegments rejects path-traversal / nul / backslash and
 *      reconstructs the storage key from the catch-all segments.
 *   2. The tenant-prefix isolation rule: a key's first segment is the
 *      owning tenant id, and only a matching active tenant may read it.
 */

describe("safeKeySegments", () => {
  it("joins normal tenant-prefixed segments", () => {
    expect(safeKeySegments(["tenantA", "abc123-photo.jpg"])).toBe("tenantA/abc123-photo.jpg");
  });

  it("url-decodes encoded segments", () => {
    expect(safeKeySegments(["tenantA", "a%20b.jpg"])).toBe("tenantA/a b.jpg");
  });

  it("rejects empty input", () => {
    expect(safeKeySegments([])).toBeNull();
  });

  it("rejects '..' traversal", () => {
    expect(safeKeySegments(["tenantA", "..", "etc", "passwd"])).toBeNull();
  });

  it("rejects single-encoded '..' traversal (%2e%2e)", () => {
    expect(safeKeySegments(["tenantA", "%2e%2e", "etc", "passwd"])).toBeNull();
  });

  it("neutralizes double-encoded '..' to a harmless literal (%252e%252e)", () => {
    // Decoded ONCE, `%252e%252e` becomes the literal `%2e%2e` — a real
    // directory name, not a `..` traversal. The key is therefore safe: when
    // path.join'd under the storage root it can never escape it.
    const key = safeKeySegments(["tenantA", "%252e%252e", "etc", "passwd"]);
    expect(key).toBe("tenantA/%2e%2e/etc/passwd");
    expect(key!.split("/")).not.toContain("..");
  });

  it("rejects an encoded path separator (%2f) injected into a segment", () => {
    expect(safeKeySegments(["tenantA", "a%2f..%2fsecret"])).toBeNull();
  });

  it("rejects malformed percent-encoding", () => {
    expect(safeKeySegments(["tenantA", "%"])).toBeNull();
  });

  it("rejects '.' segment", () => {
    expect(safeKeySegments(["tenantA", "."])).toBeNull();
  });

  it("rejects backslash and nul", () => {
    expect(safeKeySegments(["tenantA", "x\\y"])).toBeNull();
    expect(safeKeySegments(["tenantA", "x\0y"])).toBeNull();
  });
});

describe("tenant-prefix isolation rule", () => {
  // Mirrors the route's check: ownerTenantId = key.split('/')[0].
  function canRead(key: string, activeTenantId: string): boolean {
    return key.split("/")[0] === activeTenantId;
  }

  it("allows a tenant to read its own key", () => {
    expect(canRead("tenantA/abc-photo.jpg", "tenantA")).toBe(true);
  });

  it("denies cross-tenant reads", () => {
    expect(canRead("tenantA/abc-photo.jpg", "tenantB")).toBe(false);
  });
});
