import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-level tenant-isolation for GET /api/files/[...key].
 *
 * file-serving.test.ts already pins the pure helpers (safeKeySegments +
 * the prefix rule). This exercises the actual route handler end-to-end with
 * auth / tenant / storage mocked, proving the security contract holds where
 * it matters:
 *
 *   - no session            -> 401
 *   - bad / traversal key    -> 400
 *   - key owned by a DIFFERENT tenant -> 404 (and storage is never touched,
 *     so existence is not leaked)
 *   - key owned by the caller's tenant -> 200 with sniffed content-type
 *
 * The 404-without-storage-read assertion is the load-bearing one: an
 * attacker who guesses another tenant's key must not be able to learn
 * whether it exists, and must never receive its bytes.
 */

const authMock = vi.fn();
const requireTenantMock = vi.fn();
const storageGet = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/tenant", () => ({ requireTenant: () => requireTenantMock() }));
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ get: storageGet }) }));

import { GET } from "@/app/api/files/[...key]/route";

// Minimal NextRequest stand-in — the handler only reads nothing off req for
// GET (auth/tenant come from the mocked libs), so an empty object suffices.
function req() {
  return {} as unknown as Parameters<typeof GET>[0];
}
function ctx(parts: string[]) {
  return { params: Promise.resolve({ key: parts }) } as Parameters<typeof GET>[1];
}

// A 1x1 PNG so sniffMime classifies it and the 200 path returns image/png.
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082",
  "hex",
);

beforeEach(() => {
  authMock.mockReset();
  requireTenantMock.mockReset();
  storageGet.mockReset();
});

describe("GET /api/files/[...key] — auth + tenant isolation", () => {
  it("401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(req(), ctx(["tenantA", "photo.png"]));
    expect(res.status).toBe(401);
    expect(storageGet).not.toHaveBeenCalled();
  });

  it("400 on a path-traversal key", async () => {
    authMock.mockResolvedValue({ userId: "u1" });
    requireTenantMock.mockResolvedValue({ id: "tenantA" });
    const res = await GET(req(), ctx(["tenantA", "..", "secret"]));
    expect(res.status).toBe(400);
    expect(storageGet).not.toHaveBeenCalled();
  });

  it("404 on a cross-tenant key WITHOUT touching storage (no existence leak)", async () => {
    authMock.mockResolvedValue({ userId: "u1" });
    requireTenantMock.mockResolvedValue({ id: "tenantB" }); // caller is tenantB
    const res = await GET(req(), ctx(["tenantA", "abc-photo.png"])); // key owned by tenantA
    expect(res.status).toBe(404);
    expect(storageGet).not.toHaveBeenCalled();
  });

  it("200 + sniffed content-type when the key belongs to the caller's tenant", async () => {
    authMock.mockResolvedValue({ userId: "u1" });
    requireTenantMock.mockResolvedValue({ id: "tenantA" });
    storageGet.mockResolvedValue(PNG);
    const res = await GET(req(), ctx(["tenantA", "abc-photo.png"]));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(storageGet).toHaveBeenCalledWith("tenantA/abc-photo.png");
  });

  it("404 when the key belongs to the caller but storage has no such object", async () => {
    authMock.mockResolvedValue({ userId: "u1" });
    requireTenantMock.mockResolvedValue({ id: "tenantA" });
    storageGet.mockRejectedValue(new Error("ENOENT"));
    const res = await GET(req(), ctx(["tenantA", "missing.png"]));
    expect(res.status).toBe(404);
  });
});
