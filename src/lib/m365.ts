/**
 * Microsoft 365 (Graph) — env-driven, app-only (client-credentials)
 * integration. This is the WRITE-capable platform integration: outbound
 * mail (EMAIL_TRANSPORT=m365) + calendar events on a designated mailbox.
 * It is deliberately separate from src/lib/mail/m365.ts, which is the
 * per-tenant, READ-ONLY workspace-transparency provider built from
 * vault-encrypted MailConnection rows.
 *
 * Configuration (deployment-wide env vars; see .env.example):
 *   MS_TENANT_ID     Azure AD directory (tenant) id
 *   MS_CLIENT_ID     App registration's application (client) id
 *   MS_CLIENT_SECRET Client secret VALUE (not the secret id)
 *   MS_SENDER_UPN    Mailbox to send from / host calendar events on,
 *                    e.g. no-reply@yourdomain.com (must be a real,
 *                    licensed mailbox in the tenant)
 *
 * Azure AD app registration (one-time, by a Microsoft 365 admin):
 *   1. Entra admin center → App registrations → New registration.
 *   2. API permissions → Add → Microsoft Graph → APPLICATION permissions:
 *      Mail.Send + Calendars.ReadWrite → "Grant admin consent".
 *   3. Certificates & secrets → New client secret → copy the VALUE.
 *   4. Fill the four env vars above + restart the service.
 *
 * Graceful degrade: when any var is missing, m365Configured() is false,
 * every helper returns a structured failure (never throws at import or
 * call time for "unconfigured"), and the settings page shows setup
 * instructions instead of actions.
 */

import { log } from "@/lib/log";

const LOGIN_BASE = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";

/** Application permissions the app registration needs (shown in the UI). */
export const M365_REQUIRED_APP_PERMISSIONS = ["Mail.Send", "Calendars.ReadWrite"];

export type M365EnvConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderUpn: string;
};

/** Read the env config; null when any required var is missing/blank. */
export function m365Config(): M365EnvConfig | null {
  const tenantId = (process.env.MS_TENANT_ID ?? "").trim();
  const clientId = (process.env.MS_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.MS_CLIENT_SECRET ?? "").trim();
  const senderUpn = (process.env.MS_SENDER_UPN ?? "").trim();
  if (!tenantId || !clientId || !clientSecret || !senderUpn) return null;
  return { tenantId, clientId, clientSecret, senderUpn };
}

export function m365Configured(): boolean {
  return m365Config() !== null;
}

/**
 * Mask an Azure identifier for display: first 4 + last 4 characters.
 * Never used on the client secret (which is never rendered at all).
 */
export function maskId(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "—";
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

/** Settings-page status: which env vars are set, masked ids. */
export function m365Status(): {
  configured: boolean;
  tenantIdMasked: string;
  clientIdMasked: string;
  senderUpn: string | null;
  missing: string[];
} {
  const missing: string[] = [];
  if (!(process.env.MS_TENANT_ID ?? "").trim()) missing.push("MS_TENANT_ID");
  if (!(process.env.MS_CLIENT_ID ?? "").trim()) missing.push("MS_CLIENT_ID");
  if (!(process.env.MS_CLIENT_SECRET ?? "").trim()) missing.push("MS_CLIENT_SECRET");
  if (!(process.env.MS_SENDER_UPN ?? "").trim()) missing.push("MS_SENDER_UPN");
  return {
    configured: missing.length === 0,
    tenantIdMasked: maskId(process.env.MS_TENANT_ID),
    clientIdMasked: maskId(process.env.MS_CLIENT_ID),
    senderUpn: (process.env.MS_SENDER_UPN ?? "").trim() || null,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Token (client credentials), cached until ~60s before expiry. Keyed by
// tenant+client so an env change after hot-reload doesn't serve stale tokens.
// ---------------------------------------------------------------------------

let tokenCache: { key: string; token: string; expiresAt: number } | null = null;

async function appToken(cfg: M365EnvConfig): Promise<string> {
  const key = `${cfg.tenantId}:${cfg.clientId}`;
  if (tokenCache && tokenCache.key === key && tokenCache.expiresAt - 60_000 > Date.now()) {
    return tokenCache.token;
  }
  const res = await fetch(`${LOGIN_BASE}/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`m365 token exchange failed: ${res.status} ${t.slice(0, 300)}`);
  }
  const tok = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { key, token: tok.access_token, expiresAt: Date.now() + tok.expires_in * 1000 };
  return tok.access_token;
}

/** Test hook — clear the module token cache between env permutations. */
export function _clearM365TokenCache(): void {
  tokenCache = null;
}

async function graphFetch(cfg: M365EnvConfig, path: string, init?: RequestInit): Promise<Response> {
  const token = await appToken(cfg);
  return fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Mail — Graph sendMail on the configured sender mailbox. Consumed by
// src/lib/email.ts as the EMAIL_TRANSPORT=m365 transport.
// ---------------------------------------------------------------------------

export type M365MailInput = {
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
};

/** Build the Graph sendMail request body (pure — unit tested). */
export function buildGraphSendMailPayload(msg: M365MailInput): {
  message: Record<string, unknown>;
  saveToSentItems: boolean;
} {
  const rcpt = (addr: string) => ({ emailAddress: { address: addr } });
  return {
    message: {
      subject: msg.subject,
      body: msg.html
        ? { contentType: "HTML", content: msg.html }
        : { contentType: "Text", content: msg.text ?? "" },
      toRecipients: msg.to.map(rcpt),
      ...(msg.cc && msg.cc.length > 0 ? { ccRecipients: msg.cc.map(rcpt) } : {}),
      ...(msg.bcc && msg.bcc.length > 0 ? { bccRecipients: msg.bcc.map(rcpt) } : {}),
      ...(msg.replyTo ? { replyTo: [rcpt(msg.replyTo)] } : {}),
    },
    saveToSentItems: false,
  };
}

/**
 * Send one message via Graph from MS_SENDER_UPN. Throws on failure so the
 * email.ts dispatcher can convert it into its uniform { ok:false } shape.
 */
export async function m365SendMail(msg: M365MailInput): Promise<{ id?: string }> {
  const cfg = m365Config();
  if (!cfg) throw new Error("m365 transport not configured (MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET/MS_SENDER_UPN)");
  const payload = buildGraphSendMailPayload(msg);
  const res = await graphFetch(cfg, `/users/${encodeURIComponent(cfg.senderUpn)}/sendMail`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (res.status !== 202) {
    const t = await res.text().catch(() => "");
    throw new Error(`graph sendMail ${res.status}: ${t.slice(0, 300)}`);
  }
  // Graph sendMail returns 202 with no body / message id.
  return {};
}

// ---------------------------------------------------------------------------
// Calendar — create/update events on the configured mailbox's default
// calendar. Idempotency is handled by the caller via M365CalendarEventLink
// rows (tenant + kind + recordId → eventId).
// ---------------------------------------------------------------------------

export type M365EventInput = {
  subject: string;
  bodyText?: string;
  /** Event start (UTC). */
  start: Date;
  /** Event end (UTC); defaults to start + 30 minutes. */
  end?: Date;
};

/** Build the Graph event resource (pure — unit tested). */
export function buildGraphEventPayload(ev: M365EventInput): Record<string, unknown> {
  const end = ev.end ?? new Date(ev.start.getTime() + 30 * 60 * 1000);
  return {
    subject: ev.subject,
    body: { contentType: "Text", content: ev.bodyText ?? "" },
    start: { dateTime: ev.start.toISOString().replace(/Z$/, ""), timeZone: "UTC" },
    end: { dateTime: end.toISOString().replace(/Z$/, ""), timeZone: "UTC" },
  };
}

/** Create an event; returns the Graph event id. */
export async function m365CreateEvent(ev: M365EventInput): Promise<string> {
  const cfg = m365Config();
  if (!cfg) throw new Error("m365 not configured");
  const res = await graphFetch(cfg, `/users/${encodeURIComponent(cfg.senderUpn)}/events`, {
    method: "POST",
    body: JSON.stringify(buildGraphEventPayload(ev)),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`graph create event ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("graph create event: no id in response");
  return json.id;
}

/**
 * Update an existing event. Returns true on success, false when the event
 * no longer exists (deleted in Outlook) — the caller should re-create.
 */
export async function m365UpdateEvent(eventId: string, ev: M365EventInput): Promise<boolean> {
  const cfg = m365Config();
  if (!cfg) throw new Error("m365 not configured");
  const res = await graphFetch(
    cfg,
    `/users/${encodeURIComponent(cfg.senderUpn)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(buildGraphEventPayload(ev)) },
  );
  if (res.status === 404) return false;
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`graph update event ${res.status}: ${t.slice(0, 300)}`);
  }
  return true;
}

/**
 * Verify credentials work: mint a token and read the sender mailbox.
 * Returns a human-readable failure instead of throwing.
 */
export async function m365Verify(): Promise<{ ok: boolean; detail: string }> {
  const cfg = m365Config();
  if (!cfg) return { ok: false, detail: "not configured" };
  try {
    const res = await graphFetch(cfg, `/users/${encodeURIComponent(cfg.senderUpn)}?$select=id,userPrincipalName`);
    if (!res.ok) return { ok: false, detail: `graph ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
    return { ok: true, detail: `sender mailbox ${cfg.senderUpn} reachable` };
  } catch (err) {
    log.warn("m365 verify failed", { module: "m365" }, err);
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
