/**
 * Google Workspace MailProvider — domain-wide delegation.
 *
 * Ported from psd's lib/integrations/gmail-workspace.ts, adapted to a
 * per-tenant MailConnection (multi-tenant: each tenant has its OWN encrypted
 * service-account key, so credentials never cross tenants).
 *
 * The admin grants the service-account Client ID these DWD scopes in
 * Workspace Admin Console → Security → API controls → Domain-wide delegation:
 *   https://www.googleapis.com/auth/admin.directory.user.readonly
 *   https://www.googleapis.com/auth/gmail.readonly
 * plus an admin email as the impersonation subject (googleAdminSubject) for
 * the Directory listUsers() call.
 */

import {
  getServiceAccountToken,
  gapi,
  parseServiceAccountKey,
  type ServiceAccountKey,
} from "./google-jwt";
import type { MailProvider, MailUser, MailParsedMessage } from "./provider";

export const GOOGLE_DIRECTORY_SCOPE =
  "https://www.googleapis.com/auth/admin.directory.user.readonly";
export const GOOGLE_GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users";

type GoogleConfig = {
  serviceAccountJson: string;
  adminSubject: string;
};

export class GoogleMailProvider implements MailProvider {
  readonly key = "google";
  private key_: ServiceAccountKey;
  private adminSubject: string;

  constructor(cfg: GoogleConfig) {
    if (!cfg.serviceAccountJson) throw new Error("google: missing service account JSON");
    if (!cfg.adminSubject) throw new Error("google: missing admin subject email");
    this.key_ = parseServiceAccountKey(cfg.serviceAccountJson);
    this.adminSubject = cfg.adminSubject.toLowerCase();
  }

  async verify(): Promise<void> {
    // Mint a directory token AS the admin subject, then a single 1-result list.
    const token = await getServiceAccountToken(this.key_, GOOGLE_DIRECTORY_SCOPE, this.adminSubject);
    const url = new URL("https://admin.googleapis.com/admin/directory/v1/users");
    url.searchParams.set("customer", "my_customer");
    url.searchParams.set("maxResults", "1");
    await gapi(token, url.toString());
  }

  async listUsers(): Promise<MailUser[]> {
    const token = await getServiceAccountToken(this.key_, GOOGLE_DIRECTORY_SCOPE, this.adminSubject);
    const out: MailUser[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL("https://admin.googleapis.com/admin/directory/v1/users");
      url.searchParams.set("customer", "my_customer");
      url.searchParams.set("maxResults", "200");
      url.searchParams.set("orderBy", "email");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const data = await gapi<{
        users?: Array<{ primaryEmail: string; name?: { fullName?: string }; suspended?: boolean }>;
        nextPageToken?: string;
      }>(token, url.toString());
      for (const u of data.users ?? []) {
        out.push({
          email: u.primaryEmail.toLowerCase(),
          displayName: u.name?.fullName ?? null,
          providerUserId: u.primaryEmail.toLowerCase(),
          suspended: u.suspended,
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    return out;
  }

  async pullMessages(userEmail: string, since: Date, max = 200): Promise<MailParsedMessage[]> {
    const days = Math.max(1, Math.ceil((Date.now() - since.getTime()) / 86_400_000));
    const freshToken = () => getServiceAccountToken(this.key_, GOOGLE_GMAIL_READONLY, userEmail.toLowerCase());
    let token = await freshToken();
    const labelMap = await this.loadLabelMap(token, userEmail).catch(() => new Map<string, string>());

    const out: MailParsedMessage[] = [];
    let scanned = 0;
    let pageToken: string | undefined;
    do {
      token = await freshToken(); // cached until near expiry; refreshes for long backfills
      const url = new URL(`${GMAIL_BASE}/${encodeURIComponent(userEmail)}/messages`);
      url.searchParams.set("q", `-in:spam -in:trash newer_than:${days}d`);
      url.searchParams.set("maxResults", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const data = await gapi<{ messages?: Array<{ id: string }>; nextPageToken?: string }>(token, url.toString());
      for (const m of data.messages ?? []) {
        if (scanned >= max) { pageToken = undefined; break; }
        scanned += 1;
        try {
          out.push(await this.fetchAndParse(token, userEmail, m.id, labelMap));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/\b401\b|UNAUTHENTICATED|Invalid Credentials/i.test(msg)) {
            token = await freshToken();
            out.push(await this.fetchAndParse(token, userEmail, m.id, labelMap));
          }
          // otherwise skip this one message; the caller continues.
        }
      }
      pageToken = data.nextPageToken && scanned < max ? data.nextPageToken : undefined;
    } while (pageToken);
    return out;
  }

  private async loadLabelMap(token: string, userEmail: string): Promise<Map<string, string>> {
    const data = await gapi<{ labels?: Array<{ id: string; name: string }> }>(
      token,
      `${GMAIL_BASE}/${encodeURIComponent(userEmail)}/labels`,
    );
    const map = new Map<string, string>();
    for (const l of data.labels ?? []) map.set(l.id, l.name);
    return map;
  }

  private async fetchAndParse(
    token: string,
    userEmail: string,
    messageId: string,
    labelMap: Map<string, string>,
  ): Promise<MailParsedMessage> {
    const m = await gapi<any>(
      token,
      `${GMAIL_BASE}/${encodeURIComponent(userEmail)}/messages/${messageId}?format=full`,
    );
    const headers = (m.payload?.headers ?? []) as Array<{ name: string; value: string }>;
    const h = (name: string) => headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value || "";
    const { name: fromName, address: fromAddr } = parseAddress(h("from"));
    const toList = splitAddresses(h("to")).map((a) => parseAddress(a).address || "").filter(Boolean);
    const dateRaw = h("date");
    const { text } = extractBodies(m.payload);
    const hasAttachments = (function walk(part: any): boolean {
      if (!part) return false;
      if (part.filename && part.body?.attachmentId) return true;
      return (part.parts || []).some(walk);
    })(m.payload);
    const HIDE = new Set(["UNREAD", "IMPORTANT", "STARRED"]);
    const labels = ((m.labelIds ?? []) as string[])
      .map((id) => labelMap.get(id) ?? id)
      .filter((n) => !HIDE.has(n) && !n.startsWith("CATEGORY_"));
    return {
      externalId: String(m.id),
      fromAddress: fromAddr || "unknown@unknown",
      fromName,
      to: toList,
      subject: h("subject") || null,
      receivedAt: dateRaw
        ? new Date(dateRaw)
        : m.internalDate
          ? new Date(parseInt(m.internalDate, 10))
          : new Date(),
      snippet: typeof m.snippet === "string" ? m.snippet.slice(0, 500) : null,
      bodyText: text,
      hasAttachments,
      labels,
    };
  }
}

function parseAddress(raw: string): { name: string | null; address: string | null } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { name: m[1].trim() || null, address: m[2].trim().toLowerCase() };
  const trimmed = raw.trim();
  if (/^\S+@\S+$/.test(trimmed)) return { name: null, address: trimmed.toLowerCase() };
  return { name: trimmed || null, address: null };
}

function splitAddresses(raw: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (const ch of raw) {
    if (ch === '"') inQuote = !inQuote;
    if (ch === "," && !inQuote) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function extractBodies(payload: any): { text: string | null } {
  let text: string | null = null;
  let html: string | null = null;
  function walk(p: any) {
    if (!p) return;
    const data = p.body?.data;
    if (data) {
      const decoded = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      if (p.mimeType === "text/plain" && !text) text = decoded;
      if (p.mimeType === "text/html" && !html) html = decoded;
    }
    for (const c of p.parts ?? []) walk(c);
  }
  walk(payload);
  // Prefer plain text; fall back to stripped HTML so the classifier always has body content.
  if (!text && html) text = String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { text };
}
