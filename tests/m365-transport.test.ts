import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendEmail } from "@/lib/email";
import {
  buildGraphSendMailPayload,
  buildGraphEventPayload,
  maskId,
  m365Configured,
  m365Config,
  _clearM365TokenCache,
} from "@/lib/m365";

/**
 * Microsoft 365 (Graph) mail transport — transport selection in
 * sendEmail(), payload shapes, env gating, and graceful failure
 * (sendEmail never throws; unconfigured m365 yields ok:false).
 */

const ENV_KEYS = ["EMAIL_TRANSPORT", "MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_SENDER_UPN"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  _clearM365TokenCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  _clearM365TokenCache();
});

function configure() {
  process.env.MS_TENANT_ID = "11111111-2222-3333-4444-555555555555";
  process.env.MS_CLIENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  process.env.MS_CLIENT_SECRET = "s3cr3t-value";
  process.env.MS_SENDER_UPN = "no-reply@example.com";
}

describe("m365 env gating", () => {
  it("unconfigured when any var is missing", () => {
    expect(m365Configured()).toBe(false);
    configure();
    expect(m365Configured()).toBe(true);
    delete process.env.MS_SENDER_UPN;
    expect(m365Configured()).toBe(false);
    expect(m365Config()).toBeNull();
  });

  it("maskId shows only first/last 4 characters", () => {
    expect(maskId("11111111-2222-3333-4444-555555555555")).toBe("1111••••5555");
    expect(maskId("short")).toBe("••••");
    expect(maskId("")).toBe("—");
    expect(maskId(null)).toBe("—");
  });
});

describe("sendEmail transport selection", () => {
  it("defaults to log transport when EMAIL_TRANSPORT is unset", async () => {
    const result = await sendEmail({ to: "a@example.com", subject: "hi", text: "x" });
    expect(result.ok).toBe(true);
    expect(result.transport).toBe("log");
  });

  it("EMAIL_TRANSPORT=m365 without MS_* vars fails gracefully (never throws)", async () => {
    process.env.EMAIL_TRANSPORT = "m365";
    const result = await sendEmail({ to: "a@example.com", subject: "hi", text: "x" });
    expect(result.ok).toBe(false);
    expect(result.transport).toBe("m365");
    expect(result.error).toMatch(/not configured/i);
  });

  it("EMAIL_TRANSPORT=m365 configured sends via Graph (token + sendMail)", async () => {
    process.env.EMAIL_TRANSPORT = "m365";
    configure();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.includes("login.microsoftonline.com")) {
        return new Response(JSON.stringify({ access_token: "tok-123", expires_in: 3600 }), { status: 200 });
      }
      if (u.includes("/sendMail")) {
        return new Response(null, { status: 202 });
      }
      return new Response("unexpected", { status: 500 });
    });

    const result = await sendEmail({ to: ["a@example.com", "b@example.com"], subject: "hello", html: "<b>hi</b>" });
    expect(result.ok).toBe(true);
    expect(result.transport).toBe("m365");
    // token minted against the configured directory tenant
    expect(calls[0].url).toContain("11111111-2222-3333-4444-555555555555");
    // sendMail on the configured sender mailbox
    expect(calls[1].url).toContain("/users/no-reply%40example.com/sendMail");
    expect(calls[1].init?.headers).toMatchObject({ authorization: "Bearer tok-123" });
  });

  it("Graph non-202 surfaces as ok:false (no throw)", async () => {
    process.env.EMAIL_TRANSPORT = "m365";
    configure();
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const u = String(url);
      if (u.includes("login.microsoftonline.com")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      return new Response("denied", { status: 403 });
    });
    const result = await sendEmail({ to: "a@example.com", subject: "x", text: "y" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/403/);
  });

  it("existing transports are untouched by the new branch (log default + resend path)", async () => {
    process.env.EMAIL_TRANSPORT = "resend";
    // No RESEND_API_KEY → resend branch throws internally → ok:false resend.
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const result = await sendEmail({ to: "a@example.com", subject: "x", text: "y" });
    if (prev !== undefined) process.env.RESEND_API_KEY = prev;
    expect(result.ok).toBe(false);
    expect(result.transport).toBe("resend");
  });
});

describe("Graph payload builders", () => {
  it("sendMail payload: text body, recipients, no optional blocks", () => {
    const p = buildGraphSendMailPayload({ to: ["a@x.com"], subject: "s", text: "body" });
    expect(p.saveToSentItems).toBe(false);
    expect(p.message).toMatchObject({
      subject: "s",
      body: { contentType: "Text", content: "body" },
      toRecipients: [{ emailAddress: { address: "a@x.com" } }],
    });
    expect(p.message).not.toHaveProperty("ccRecipients");
    expect(p.message).not.toHaveProperty("bccRecipients");
    expect(p.message).not.toHaveProperty("replyTo");
  });

  it("sendMail payload: html wins over text; cc/bcc/replyTo mapped", () => {
    const p = buildGraphSendMailPayload({
      to: ["a@x.com"],
      subject: "s",
      text: "plain",
      html: "<p>rich</p>",
      cc: ["c@x.com"],
      bcc: ["b@x.com"],
      replyTo: "r@x.com",
    });
    expect(p.message.body).toEqual({ contentType: "HTML", content: "<p>rich</p>" });
    expect(p.message.ccRecipients).toEqual([{ emailAddress: { address: "c@x.com" } }]);
    expect(p.message.bccRecipients).toEqual([{ emailAddress: { address: "b@x.com" } }]);
    expect(p.message.replyTo).toEqual([{ emailAddress: { address: "r@x.com" } }]);
  });

  it("event payload: UTC datetimes, default end = start + 30 minutes", () => {
    const start = new Date("2026-07-01T09:00:00.000Z");
    const p = buildGraphEventPayload({ subject: "Due", start });
    expect(p.start).toEqual({ dateTime: "2026-07-01T09:00:00.000", timeZone: "UTC" });
    expect(p.end).toEqual({ dateTime: "2026-07-01T09:30:00.000", timeZone: "UTC" });
    expect(p.subject).toBe("Due");
  });
});
