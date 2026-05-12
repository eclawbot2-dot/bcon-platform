/**
 * Tests for publicRedirect — the helper that builds redirects that
 * survive the Cloudflare tunnel hop. A regression here sends the
 * browser to `localhost:3101` for public users, which the public
 * client cannot resolve. Critical correctness for the auth/login
 * round-trip.
 */
import { describe, it, expect } from "vitest";
import { publicRedirect } from "@/lib/redirect";

function reqWith(headers: Record<string, string>, url = "http://localhost:3101/auth/login"): Request {
  return new Request(url, { headers });
}

describe("publicRedirect", () => {
  it("prefers x-forwarded-host + x-forwarded-proto when both set", () => {
    const res = publicRedirect(
      reqWith({ "x-forwarded-host": "construction.jahdev.com", "x-forwarded-proto": "https" }),
      "/dashboard",
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://construction.jahdev.com/dashboard");
  });

  it("defaults x-forwarded-proto to https when only host header set", () => {
    const res = publicRedirect(reqWith({ "x-forwarded-host": "construction.jahdev.com" }), "/x");
    expect(res.headers.get("location")).toBe("https://construction.jahdev.com/x");
  });

  it("falls back to host header when x-forwarded-host absent", () => {
    const res = publicRedirect(reqWith({ host: "construction.jahdev.com" }), "/x");
    expect(res.headers.get("location")).toBe("https://construction.jahdev.com/x");
  });

  it("falls back to req.url origin when neither header set", () => {
    const res = publicRedirect(reqWith({}, "https://example.com/foo"), "/bar");
    expect(res.headers.get("location")).toBe("https://example.com/bar");
  });

  it("respects an explicit status code (302/307/308)", () => {
    const r302 = publicRedirect(reqWith({ host: "x.com" }), "/", 302);
    const r307 = publicRedirect(reqWith({ host: "x.com" }), "/", 307);
    const r308 = publicRedirect(reqWith({ host: "x.com" }), "/", 308);
    expect(r302.status).toBe(302);
    expect(r307.status).toBe(307);
    expect(r308.status).toBe(308);
  });

  it("handles absolute paths correctly", () => {
    const res = publicRedirect(reqWith({ "x-forwarded-host": "x.com" }), "/auth/callback?next=/dashboard");
    expect(res.headers.get("location")).toBe("https://x.com/auth/callback?next=/dashboard");
  });
});
