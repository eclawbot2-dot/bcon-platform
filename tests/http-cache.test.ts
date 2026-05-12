/**
 * Tests for the cache-header helpers. Used by every API that
 * returns user-scoped data — wrong default and a shared CDN can
 * serve one user's response to another.
 */
import { describe, it, expect } from "vitest";
import { noStore, shortCache } from "@/lib/http-cache";

describe("noStore", () => {
  it("sets a no-store / no-cache / must-revalidate cache-control", async () => {
    const res = noStore({ hello: "world" });
    expect(res.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate");
    const body = await res.json();
    expect(body).toEqual({ hello: "world" });
  });

  it("merges caller headers without overwriting cache-control", async () => {
    const res = noStore({ ok: true }, { headers: { "x-custom": "v" } });
    expect(res.headers.get("x-custom")).toBe("v");
    expect(res.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate");
  });

  it("respects an init.status from the caller", async () => {
    const res = noStore({ error: "bad" }, { status: 400 });
    expect(res.status).toBe(400);
  });
});

describe("shortCache", () => {
  it("uses default 30s + 60s stale-while-revalidate when no args", () => {
    const res = shortCache({});
    expect(res.headers.get("cache-control")).toBe("private, max-age=30, stale-while-revalidate=60");
    expect(res.headers.get("vary")).toBe("cookie");
  });

  it("honors explicit seconds + swrSeconds", () => {
    const res = shortCache({}, 120, 600);
    expect(res.headers.get("cache-control")).toBe("private, max-age=120, stale-while-revalidate=600");
  });

  it("always sets vary: cookie so per-user caches don't cross-pollinate", () => {
    expect(shortCache({}).headers.get("vary")).toBe("cookie");
    expect(shortCache({}, 1).headers.get("vary")).toBe("cookie");
  });
});
