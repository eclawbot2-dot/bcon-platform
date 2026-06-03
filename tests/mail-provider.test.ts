import { describe, it, expect, vi, afterEach } from "vitest";
import { M365MailProvider } from "@/lib/mail/m365";

/**
 * M365 client-credentials token request shape. The Graph app-only flow must
 * POST grant_type=client_credentials + scope=.default to the per-tenant token
 * endpoint with the configured clientId/secret — getting any of those wrong
 * means no tenant can connect.
 */
describe("M365 provider token + listUsers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requests a client-credentials token with the .default scope, then lists users", async () => {
    const calls: Array<{ url: string; body?: string; authz?: string }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const authz = new Headers(init?.headers).get("Authorization") ?? undefined;
      calls.push({ url: u, body: init?.body ? String(init.body) : undefined, authz });
      if (u.includes("/oauth2/v2.0/token")) {
        return new Response(JSON.stringify({ access_token: "tok-123", expires_in: 3600 }), { status: 200 });
      }
      // /users
      return new Response(
        JSON.stringify({ value: [{ id: "u1", userPrincipalName: "a@t.com", mail: "a@t.com", displayName: "A", accountEnabled: true }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const p = new M365MailProvider({ azureTenantId: "azure-tenant", clientId: "client-1", clientSecret: "secret-1" });
    const users = await p.listUsers();

    const tokenCall = calls.find((c) => c.url.includes("/oauth2/v2.0/token"));
    expect(tokenCall).toBeTruthy();
    expect(tokenCall!.url).toContain("login.microsoftonline.com/azure-tenant");
    expect(tokenCall!.body).toContain("grant_type=client_credentials");
    expect(tokenCall!.body).toContain("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default");
    expect(tokenCall!.body).toContain("client_id=client-1");

    const usersCall = calls.find((c) => c.url.includes("graph.microsoft.com") && c.url.includes("/users"));
    expect(usersCall!.authz).toBe("Bearer tok-123");

    expect(users).toEqual([{ email: "a@t.com", displayName: "A", providerUserId: "u1", suspended: false }]);
  });

  it("throws on missing credentials (never silently no-ops)", () => {
    expect(() => new M365MailProvider({ azureTenantId: "", clientId: "c", clientSecret: "s" })).toThrow();
    expect(() => new M365MailProvider({ azureTenantId: "t", clientId: "", clientSecret: "s" })).toThrow();
  });
});
