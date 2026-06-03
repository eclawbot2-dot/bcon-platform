import { describe, it, expect, vi, afterEach } from "vitest";
import { M365MailProvider, M365_GRAPH_PERMISSIONS } from "@/lib/mail/m365";
import {
  GOOGLE_DWD_SCOPES,
  GOOGLE_DIRECTORY_SCOPE,
  GOOGLE_GMAIL_FULL,
  GOOGLE_GMAIL_MODIFY,
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_CALENDAR_SCOPE,
} from "@/lib/mail/google";

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

/**
 * Full workspace-transparency scope/permission set. These exact strings are
 * pasted by an admin into Google DWD / consented in Azure — a typo silently
 * locks the whole tenant out, so the set is asserted verbatim.
 */
describe("workspace-transparency scopes/permissions", () => {
  it("exposes the full Google DWD scope string (directory + full mail + drive + calendar)", () => {
    expect(GOOGLE_DIRECTORY_SCOPE).toBe("https://www.googleapis.com/auth/admin.directory.user.readonly");
    expect(GOOGLE_GMAIL_FULL).toBe("https://mail.google.com/");
    expect(GOOGLE_GMAIL_MODIFY).toBe("https://www.googleapis.com/auth/gmail.modify");
    expect(GOOGLE_DRIVE_SCOPE).toBe("https://www.googleapis.com/auth/drive");
    expect(GOOGLE_CALENDAR_SCOPE).toBe("https://www.googleapis.com/auth/calendar");
    expect(GOOGLE_DWD_SCOPES).toBe(
      "https://www.googleapis.com/auth/admin.directory.user.readonly " +
        "https://mail.google.com/ " +
        "https://www.googleapis.com/auth/gmail.modify " +
        "https://www.googleapis.com/auth/drive " +
        "https://www.googleapis.com/auth/calendar",
    );
  });

  it("exposes the M365 Graph application permissions (mail + users + files + calendar, read-only)", () => {
    expect(M365_GRAPH_PERMISSIONS).toEqual(["Mail.Read", "User.Read.All", "Files.Read.All", "Calendars.Read"]);
  });
});

/**
 * Drive + Calendar are on-demand, READ-ONLY transparency reads. Verify the
 * M365 provider issues GET (never POST/PATCH/DELETE) against the right Graph
 * endpoints and normalizes the response into the provider-neutral shape.
 */
describe("M365 provider Drive + Calendar reads", () => {
  afterEach(() => vi.restoreAllMocks());

  function mockGraph(routes: Record<string, unknown>) {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, method: (init?.method ?? "GET").toUpperCase() });
      if (u.includes("/oauth2/v2.0/token")) {
        return new Response(JSON.stringify({ access_token: "tok-x", expires_in: 3600 }), { status: 200 });
      }
      for (const [frag, body] of Object.entries(routes)) {
        if (u.includes(frag)) return new Response(JSON.stringify(body), { status: 200 });
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    return calls;
  }

  it("listDriveFiles GETs /drive/root/children and normalizes files + folders", async () => {
    const calls = mockGraph({
      "/drive/root/children": {
        value: [
          { id: "f1", name: "Bid.xlsx", size: 1234, file: { mimeType: "application/vnd.ms-excel" }, lastModifiedDateTime: "2026-06-01T10:00:00Z", webUrl: "https://x/f1" },
          { id: "d1", name: "Projects", folder: { childCount: 3 }, lastModifiedDateTime: "2026-05-30T10:00:00Z", webUrl: "https://x/d1" },
        ],
      },
    });
    const p = new M365MailProvider({ azureTenantId: "t", clientId: "c", clientSecret: "s" });
    const files = await p.listDriveFiles("user@t.com", { max: 10 });

    const driveCall = calls.find((c) => c.url.includes("/drive/root/children"));
    expect(driveCall).toBeTruthy();
    expect(driveCall!.method).toBe("GET");
    expect(driveCall!.url).toContain("/users/user%40t.com/drive/root/children");
    expect(files).toEqual([
      { id: "f1", name: "Bid.xlsx", mimeType: "application/vnd.ms-excel", size: 1234, modifiedAt: new Date("2026-06-01T10:00:00Z"), webUrl: "https://x/f1", isFolder: false },
      { id: "d1", name: "Projects", mimeType: "folder", size: null, modifiedAt: new Date("2026-05-30T10:00:00Z"), webUrl: "https://x/d1", isFolder: true },
    ]);
  });

  it("listCalendarEvents GETs /events and normalizes start/end/attendees", async () => {
    const calls = mockGraph({
      "/events": {
        value: [
          {
            id: "e1",
            subject: "Pre-bid walkthrough",
            location: { displayName: "Site B" },
            start: { dateTime: "2026-06-05T15:00:00Z" },
            end: { dateTime: "2026-06-05T16:00:00Z" },
            isAllDay: false,
            organizer: { emailAddress: { address: "pm@t.com" } },
            attendees: [{ emailAddress: { address: "sub@x.com" } }],
          },
        ],
      },
    });
    const p = new M365MailProvider({ azureTenantId: "t", clientId: "c", clientSecret: "s" });
    const events = await p.listCalendarEvents("user@t.com", { max: 10 });

    const calCall = calls.find((c) => c.url.includes("/events"));
    expect(calCall!.method).toBe("GET");
    expect(calCall!.url).toContain("/users/user%40t.com/events");
    expect(events).toEqual([
      {
        id: "e1",
        subject: "Pre-bid walkthrough",
        start: new Date("2026-06-05T15:00:00Z"),
        end: new Date("2026-06-05T16:00:00Z"),
        allDay: false,
        location: "Site B",
        organizer: "pm@t.com",
        attendees: ["sub@x.com"],
      },
    ]);
  });
});
