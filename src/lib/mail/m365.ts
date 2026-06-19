/**
 * Microsoft 365 MailProvider — Microsoft Graph app-only (client credentials).
 *
 * Flow (no per-user OAuth; one app registration with admin consent reads the
 * whole tenant):
 *   1. Admin registers an Azure AD app, grants APPLICATION permissions
 *      `Mail.Read` + `User.Read.All` + `Files.Read.All` + `Calendars.Read`,
 *      and clicks "Grant admin consent".
 *   2. We store tenantId (directory id) + clientId + clientSecret (encrypted).
 *   3. Token: POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
 *      grant_type=client_credentials, scope=https://graph.microsoft.com/.default.
 *   4. List users:  GET https://graph.microsoft.com/v1.0/users
 *      Pull mail:   GET https://graph.microsoft.com/v1.0/users/{id}/messages
 *      Drive files: GET https://graph.microsoft.com/v1.0/users/{id}/drive/root/children
 *      Calendar:    GET https://graph.microsoft.com/v1.0/users/{id}/events
 *
 * All reads are READ-ONLY; the app permissions above are all *.Read.
 */

import type {
  MailProvider,
  MailUser,
  MailParsedMessage,
  WorkspaceDriveFile,
  WorkspaceCalendarEvent,
  WorkspaceListOpts,
} from "./provider";

const GRAPH = "https://graph.microsoft.com/v1.0";

/** Per-request timeout and retry budget for Graph reads. */
const GRAPH_TIMEOUT_MS = Number(process.env.M365_GRAPH_TIMEOUT_MS ?? 20_000);
const GRAPH_MAX_RETRIES = Number(process.env.M365_GRAPH_MAX_RETRIES ?? 3);
const GRAPH_BACKOFF_BASE_MS = 500;
const GRAPH_BACKOFF_CAP_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Exponential backoff with full jitter, capped. */
function backoffMs(attempt: number): number {
  const exp = Math.min(GRAPH_BACKOFF_CAP_MS, GRAPH_BACKOFF_BASE_MS * 2 ** attempt);
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

/** Honor a Retry-After header (seconds) when present, else exponential backoff. */
function retryAfterMs(res: Response, attempt: number): number {
  const ra = res.headers.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(GRAPH_BACKOFF_CAP_MS, secs * 1000);
  }
  return backoffMs(attempt);
}

/**
 * Graph APPLICATION permissions an admin must grant + consent for the full
 * workspace-transparency set. Rendered in the connect/settings UI.
 */
export const M365_GRAPH_PERMISSIONS = ["Mail.Read", "User.Read.All", "Files.Read.All", "Calendars.Read"];

type M365Config = {
  azureTenantId: string;
  clientId: string;
  clientSecret: string;
};

export class M365MailProvider implements MailProvider {
  readonly key = "m365";
  private azureTenantId: string;
  private clientId: string;
  private clientSecret: string;
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(cfg: M365Config) {
    if (!cfg.azureTenantId) throw new Error("m365: missing azure tenant id");
    if (!cfg.clientId) throw new Error("m365: missing client id");
    if (!cfg.clientSecret) throw new Error("m365: missing client secret");
    this.azureTenantId = cfg.azureTenantId;
    this.clientId = cfg.clientId;
    this.clientSecret = cfg.clientSecret;
  }

  /** Client-credentials token, cached until ~60s before expiry. */
  private async token(): Promise<string> {
    if (this.cached && this.cached.expiresAt - 60_000 > Date.now()) return this.cached.token;
    const url = `https://login.microsoftonline.com/${encodeURIComponent(this.azureTenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`m365 token exchange failed: ${res.status} ${t.slice(0, 400)}`);
    }
    const tok = (await res.json()) as { access_token: string; expires_in: number };
    this.cached = { token: tok.access_token, expiresAt: Date.now() + tok.expires_in * 1000 };
    return tok.access_token;
  }

  /**
   * Single Graph GET with a per-request timeout and bounded exponential
   * backoff. Graph throttles aggressively (429) and has transient 503s; a
   * naked fetch with no timeout can also hang a mailbox ingest indefinitely.
   *
   *   - AbortController caps each attempt at GRAPH_TIMEOUT_MS.
   *   - 429/503 retry up to GRAPH_MAX_RETRIES with exponential backoff,
   *     honoring a Retry-After header (seconds) when present.
   *   - Network/timeout errors retry the same way.
   * Non-retryable HTTP errors (4xx other than 429) throw immediately.
   */
  private async graph<T>(path: string): Promise<T> {
    const url = path.startsWith("http") ? path : `${GRAPH}${path}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= GRAPH_MAX_RETRIES; attempt++) {
      const token = await this.token();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
        if (res.ok) return (await res.json()) as T;

        const retryable = res.status === 429 || res.status === 503;
        if (retryable && attempt < GRAPH_MAX_RETRIES) {
          await sleep(retryAfterMs(res, attempt));
          continue;
        }
        const t = await res.text().catch(() => "");
        throw new Error(`graph ${url} ${res.status}: ${t.slice(0, 400)}`);
      } catch (err) {
        lastErr = err;
        // Abort (timeout) and network errors are transient — back off + retry.
        // A thrown HTTP error from above is an Error with the status baked in;
        // only retry transient (abort/network) failures, not deterministic 4xx.
        const isAbort = err instanceof Error && err.name === "AbortError";
        const isNetwork = err instanceof TypeError; // fetch network failures
        if ((isAbort || isNetwork) && attempt < GRAPH_MAX_RETRIES) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`graph ${url} failed after retries`);
  }

  async verify(): Promise<void> {
    await this.graph("/users?$top=1&$select=id");
  }

  async listUsers(): Promise<MailUser[]> {
    const out: MailUser[] = [];
    let url: string | undefined =
      "/users?$select=id,userPrincipalName,mail,displayName,accountEnabled&$top=200";
    while (url) {
      const data: {
        value?: Array<{
          id: string;
          userPrincipalName?: string;
          mail?: string | null;
          displayName?: string;
          accountEnabled?: boolean;
        }>;
        "@odata.nextLink"?: string;
      } = await this.graph(url);
      for (const u of data.value ?? []) {
        const email = (u.mail || u.userPrincipalName || "").toLowerCase();
        if (!email) continue;
        out.push({
          email,
          displayName: u.displayName ?? null,
          providerUserId: u.id,
          suspended: u.accountEnabled === false,
        });
      }
      url = data["@odata.nextLink"];
    }
    return out;
  }

  async pullMessages(userEmail: string, since: Date, max = 200): Promise<MailParsedMessage[]> {
    const sinceIso = since.toISOString();
    const sel = "id,subject,from,toRecipients,receivedDateTime,bodyPreview,body,hasAttachments,parentFolderId";
    // Graph $filter on receivedDateTime needs the messages collection (not a search).
    let url: string | undefined =
      `/users/${encodeURIComponent(userEmail)}/messages` +
      `?$select=${sel}&$top=50&$orderby=receivedDateTime desc` +
      `&$filter=receivedDateTime ge ${sinceIso}`;
    const out: MailParsedMessage[] = [];
    while (url && out.length < max) {
      const data: {
        value?: GraphMessage[];
        "@odata.nextLink"?: string;
      } = await this.graph(url);
      for (const m of data.value ?? []) {
        if (out.length >= max) break;
        out.push(parseGraphMessage(m));
      }
      url = data["@odata.nextLink"];
    }
    return out;
  }

  /**
   * List a user's OneDrive root files (read-only metadata, bounded). On-demand
   * transparency read via Graph `/users/{id}/drive/root/children`.
   */
  async listDriveFiles(userEmail: string, opts: WorkspaceListOpts = {}): Promise<WorkspaceDriveFile[]> {
    const max = Math.min(Math.max(1, opts.max ?? 50), 200);
    const sel = "id,name,size,file,folder,lastModifiedDateTime,webUrl";
    const url =
      `/users/${encodeURIComponent(userEmail)}/drive/root/children` +
      `?$select=${sel}&$top=${max}&$orderby=lastModifiedDateTime desc`;
    const data = await this.graph<{
      value?: Array<{
        id: string;
        name?: string;
        size?: number;
        file?: { mimeType?: string };
        folder?: { childCount?: number };
        lastModifiedDateTime?: string;
        webUrl?: string;
      }>;
    }>(url);
    return (data.value ?? []).slice(0, max).map((f) => ({
      id: String(f.id),
      name: f.name ?? "(untitled)",
      mimeType: f.file?.mimeType ?? (f.folder ? "folder" : null),
      size: typeof f.size === "number" ? f.size : null,
      modifiedAt: f.lastModifiedDateTime ? new Date(f.lastModifiedDateTime) : null,
      webUrl: f.webUrl ?? null,
      isFolder: !!f.folder,
    }));
  }

  /**
   * List a user's upcoming calendar events (read-only, bounded). On-demand
   * transparency read via Graph `/users/{id}/events`, filtered to events that
   * end on/after `since` (defaults to now), ordered by start time.
   */
  async listCalendarEvents(userEmail: string, opts: WorkspaceListOpts = {}): Promise<WorkspaceCalendarEvent[]> {
    const max = Math.min(Math.max(1, opts.max ?? 50), 200);
    const sinceIso = (opts.since ?? new Date()).toISOString();
    const sel = "id,subject,location,start,end,isAllDay,organizer,attendees";
    const url =
      `/users/${encodeURIComponent(userEmail)}/events` +
      `?$select=${sel}&$top=${max}&$orderby=start/dateTime` +
      `&$filter=end/dateTime ge '${sinceIso}'`;
    const data = await this.graph<{
      value?: Array<{
        id: string;
        subject?: string;
        location?: { displayName?: string };
        start?: { dateTime?: string };
        end?: { dateTime?: string };
        isAllDay?: boolean;
        organizer?: { emailAddress?: { address?: string } };
        attendees?: Array<{ emailAddress?: { address?: string } }>;
      }>;
    }>(url);
    return (data.value ?? []).slice(0, max).map((e) => ({
      id: String(e.id),
      subject: e.subject ?? null,
      start: e.start?.dateTime ? new Date(e.start.dateTime) : null,
      end: e.end?.dateTime ? new Date(e.end.dateTime) : null,
      allDay: !!e.isAllDay,
      location: e.location?.displayName ?? null,
      organizer: e.organizer?.emailAddress?.address ?? null,
      attendees: (e.attendees ?? [])
        .map((a) => a.emailAddress?.address ?? "")
        .filter(Boolean)
        .slice(0, 50),
    }));
  }
}

type GraphRecipient = { emailAddress?: { address?: string; name?: string } };
type GraphMessage = {
  id?: string;
  subject?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  hasAttachments?: boolean;
  parentFolderId?: string;
};

function parseGraphMessage(m: GraphMessage): MailParsedMessage {
  const fromAddr = (m.from?.emailAddress?.address || "").toLowerCase() || "unknown@unknown";
  const fromName = m.from?.emailAddress?.name || null;
  const to = (m.toRecipients ?? [])
    .map((r) => (r.emailAddress?.address || "").toLowerCase())
    .filter(Boolean);
  const contentType = m.body?.contentType;
  let bodyText: string | null = null;
  if (m.body?.content) {
    bodyText =
      contentType === "html"
        ? String(m.body.content).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : String(m.body.content);
  } else if (m.bodyPreview) {
    bodyText = String(m.bodyPreview);
  }
  return {
    externalId: String(m.id),
    fromAddress: fromAddr,
    fromName,
    to,
    subject: m.subject ?? null,
    receivedAt: m.receivedDateTime ? new Date(m.receivedDateTime) : new Date(),
    snippet: m.bodyPreview ? String(m.bodyPreview).slice(0, 500) : null,
    bodyText,
    hasAttachments: !!m.hasAttachments,
    labels: m.parentFolderId ? [String(m.parentFolderId)] : [],
  };
}
