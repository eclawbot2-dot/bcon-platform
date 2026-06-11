/**
 * QuickBooks Online — REAL integration (OAuth2 + sync), ported from the
 * portfolio's gcon pattern onto bcon's tenant-scoped domain model.
 *
 *   OAuth:   authorization-code flow against Intuit. Tokens are stored
 *            vault-ENCRYPTED at rest (encryptSecret — per-tenant AES-256-GCM
 *            key derived from BCON_VAULT_KEY) on the existing QboConnection
 *            row. Access tokens auto-refresh within 5 minutes of expiry;
 *            Intuit ROTATES refresh tokens on every refresh, so the new one
 *            is persisted each time. A failed refresh marks the connection
 *            EXPIRED (reconnect required).
 *   Sync:    customers ↔ QBO Customer, APPROVED pay applications → QBO
 *            Invoice (push), payment status ← QBO (pull, with downgrade
 *            guards — see qbo-core.ts), AR aging report ← QBO.
 *   Links:   QBO-hosted online-invoice/payment links (InvoiceLink) are
 *            stored on synced pay apps. Payment links come from the
 *            accounting system ONLY (house rule — never a direct
 *            processor charge from the app).
 *
 * Env (deployment-wide; see .env.example):
 *   QBO_CLIENT_ID / QBO_CLIENT_SECRET  Intuit app keys
 *   QBO_ENVIRONMENT                    sandbox (default) | production
 *   QBO_ITEM_ID                        QBO Item used on invoice lines
 *                                      (default "1" — usually "Services")
 *   APP_URL                            public origin; the OAuth redirect URI
 *                                      is `${APP_URL}/api/integrations/qbo/callback`
 *                                      (never derived from req.url — tunnel rule)
 *
 * Graceful degrade: with no env keys, qboEnvConfigured() is false; the
 * settings page shows setup instructions, the authorize route 409s, and
 * sync routines refuse with a clear note. The legacy demo connector
 * (src/lib/qbo-sync.ts) remains for unconfigured deployments.
 */

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { QboConnectionStatus, type PayApplicationStatus } from "@prisma/client";
import { encryptSecret, decryptSecret } from "@/lib/rfp-geo";
import { log } from "@/lib/log";
import { toNum } from "@/lib/money";
import { runSyncJob, type SyncJobResult } from "./sync-job";
import {
  buildQboInvoicePayload,
  classifyQboInvoice,
  decideLocalStatusFromQbo,
  parseArAgingReport,
  qboQueryEscape,
  maskClientId,
  type ArAgingSnapshot,
} from "./qbo-core";

/** CSRF state cookie used by the authorize → callback OAuth round-trip. */
export const QBO_STATE_COOKIE = "qbo.oauth.state";

export const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_SCOPES = "com.intuit.quickbooks.accounting";
const MINOR_VERSION = "70";
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Env config / status
// ---------------------------------------------------------------------------

export function qboEnv(): { clientId: string; clientSecret: string; environment: "sandbox" | "production" } | null {
  const clientId = (process.env.QBO_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.QBO_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) return null;
  const environment = (process.env.QBO_ENVIRONMENT ?? "sandbox").trim() === "production" ? "production" : "sandbox";
  return { clientId, clientSecret, environment };
}

export function qboEnvConfigured(): boolean {
  return qboEnv() !== null;
}

export function qboStatusForSettings(): {
  configured: boolean;
  environment: string;
  clientIdMasked: string;
  redirectUri: string | null;
  missing: string[];
} {
  const missing: string[] = [];
  if (!(process.env.QBO_CLIENT_ID ?? "").trim()) missing.push("QBO_CLIENT_ID");
  if (!(process.env.QBO_CLIENT_SECRET ?? "").trim()) missing.push("QBO_CLIENT_SECRET");
  return {
    configured: missing.length === 0,
    environment: (process.env.QBO_ENVIRONMENT ?? "sandbox").trim() || "sandbox",
    clientIdMasked: maskClientId(process.env.QBO_CLIENT_ID),
    redirectUri: qboRedirectUri(),
    missing,
  };
}

/**
 * OAuth redirect URI — built from APP_URL env, NEVER from req.url (behind
 * the Cloudflare tunnel req.url reflects localhost). Must exactly match a
 * redirect URI registered on the Intuit app.
 */
export function qboRedirectUri(): string | null {
  const base = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/api/integrations/qbo/callback`;
}

export function qboApiBase(environment: string): string {
  return environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

// ---------------------------------------------------------------------------
// OAuth — authorize URL, code exchange, refresh (Intuit uses HTTP Basic
// auth on the token endpoint, unlike the form-encoded client_id pattern).
// ---------------------------------------------------------------------------

export function buildQboAuthorizeUrl(state: string): string | null {
  const env = qboEnv();
  const redirectUri = qboRedirectUri();
  if (!env || !redirectUri) return null;
  const url = new URL(QBO_AUTH_URL);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QBO_SCOPES);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export function newOauthState(): string {
  return crypto.randomBytes(24).toString("hex");
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
};

async function intuitTokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const env = qboEnv();
  if (!env) throw new Error("QBO_CLIENT_ID/QBO_CLIENT_SECRET not configured");
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
  const res = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`intuit token endpoint ${res.status}: ${t.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeQboCode(code: string): Promise<TokenResponse> {
  const redirectUri = qboRedirectUri();
  if (!redirectUri) throw new Error("APP_URL not set — cannot build redirect_uri");
  return intuitTokenRequest(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  );
}

/**
 * Persist a fresh token set on the tenant's QboConnection, vault-encrypted.
 */
export async function saveQboConnection(args: {
  tenantId: string;
  realmId: string;
  tokens: TokenResponse;
  organizationName?: string | null;
}): Promise<void> {
  const env = qboEnv();
  const data = {
    realmId: args.realmId,
    organizationName: args.organizationName ?? "QuickBooks Online",
    environment: env?.environment ?? "sandbox",
    status: QboConnectionStatus.CONNECTED,
    accessToken: encryptSecret(args.tenantId, args.tokens.access_token),
    refreshToken: encryptSecret(args.tenantId, args.tokens.refresh_token),
    expiresAt: new Date(Date.now() + args.tokens.expires_in * 1000),
    scopes: QBO_SCOPES,
    connectedAt: new Date(),
    lastSyncNote: null as string | null,
  };
  await prisma.qboConnection.upsert({
    where: { tenantId: args.tenantId },
    update: data,
    create: { tenantId: args.tenantId, ...data },
  });
}

export async function disconnectQboReal(tenantId: string): Promise<void> {
  await prisma.qboConnection.upsert({
    where: { tenantId },
    update: {
      status: QboConnectionStatus.DISCONNECTED,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      lastSyncNote: "disconnected by user",
    },
    create: { tenantId, status: QboConnectionStatus.DISCONNECTED },
  });
}

/**
 * Resolve a usable access token for the tenant, auto-refreshing within
 * 5 minutes of expiry. Marks the connection EXPIRED when refresh fails
 * (or when the stored payload can't be decrypted — e.g. a legacy demo
 * row's plaintext placeholder), so the UI shows "reconnect required".
 */
export async function qboAccessToken(tenantId: string): Promise<{ token: string; realmId: string; environment: string }> {
  const conn = await prisma.qboConnection.findUnique({ where: { tenantId } });
  if (!conn || conn.status !== QboConnectionStatus.CONNECTED || !conn.realmId) {
    throw new Error("QuickBooks Online is not connected for this tenant");
  }
  const access = decryptSecret(tenantId, conn.accessToken);
  const needsRefresh = !access || !conn.expiresAt || conn.expiresAt.getTime() - Date.now() < REFRESH_THRESHOLD_MS;
  if (!needsRefresh && access) {
    return { token: access, realmId: conn.realmId, environment: conn.environment };
  }
  const refresh = decryptSecret(tenantId, conn.refreshToken);
  if (!refresh) {
    await prisma.qboConnection.update({
      where: { tenantId },
      data: { status: QboConnectionStatus.EXPIRED, lastSyncNote: "no usable refresh token — reconnect required" },
    });
    throw new Error("QBO refresh token unusable — reconnect required");
  }
  try {
    const tokens = await intuitTokenRequest(
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
    );
    await prisma.qboConnection.update({
      where: { tenantId },
      data: {
        accessToken: encryptSecret(tenantId, tokens.access_token),
        // Intuit rotates refresh tokens — always persist the new one.
        refreshToken: encryptSecret(tenantId, tokens.refresh_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        status: QboConnectionStatus.CONNECTED,
      },
    });
    return { token: tokens.access_token, realmId: conn.realmId, environment: conn.environment };
  } catch (err) {
    await prisma.qboConnection.update({
      where: { tenantId },
      data: { status: QboConnectionStatus.EXPIRED, lastSyncNote: `token refresh failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500) },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function qboFetch(
  tenantId: string,
  path: string,
  init?: RequestInit & { query?: Record<string, string> },
): Promise<Response> {
  const { token, realmId, environment } = await qboAccessToken(tenantId);
  const url = new URL(`${qboApiBase(environment)}/v3/company/${encodeURIComponent(realmId)}${path}`);
  url.searchParams.set("minorversion", MINOR_VERSION);
  for (const [k, v] of Object.entries(init?.query ?? {})) url.searchParams.set(k, v);
  return fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function qboQuery<T>(tenantId: string, query: string): Promise<T | null> {
  const res = await qboFetch(tenantId, "/query", { query: { query } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`qbo query ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { QueryResponse?: T };
  return json.QueryResponse ?? null;
}

export async function fetchQboCompanyName(tenantId: string): Promise<string | null> {
  try {
    const { realmId } = await qboAccessToken(tenantId);
    const res = await qboFetch(tenantId, `/companyinfo/${encodeURIComponent(realmId)}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { CompanyInfo?: { CompanyName?: string } };
    return j.CompanyInfo?.CompanyName ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Customers ↔ QBO Customer
// ---------------------------------------------------------------------------

type QboCustomer = { Id: string; DisplayName?: string; Active?: boolean };

/**
 * Pull QBO customers and link them to bcon Company rows by name
 * (case-insensitive); unmatched QBO customers become new Company rows
 * (companyType "Owner" — bcon's term for the paying client). Then push:
 * local Owner companies with no QBO mapping are created in QBO.
 * Idempotent: mapping is keyed on (tenantId, qboCustomerId).
 */
export async function syncQboCustomers(tenantId: string) {
  return runSyncJob(tenantId, "qbo", "qbo.customers", async (): Promise<SyncJobResult> => {
    const resp = await qboQuery<{ Customer?: QboCustomer[] }>(tenantId, "SELECT * FROM Customer MAXRESULTS 1000");
    const customers = (resp?.Customer ?? []).filter((c) => c.DisplayName);
    const companies = await prisma.company.findMany({ where: { tenantId } });
    const byName = new Map(companies.map((c) => [c.name.trim().toLowerCase(), c]));

    let wrote = 0;
    for (const c of customers) {
      const name = c.DisplayName!.trim();
      const local = byName.get(name.toLowerCase());
      if (local) {
        if (local.qboCustomerId !== c.Id) {
          // Scoped by primary key of a row we ALREADY loaded tenant-filtered.
          await prisma.company.update({ where: { id: local.id }, data: { qboCustomerId: c.Id } });
          wrote += 1;
        }
      } else {
        const already = await prisma.company.findUnique({
          where: { tenantId_qboCustomerId: { tenantId, qboCustomerId: c.Id } },
        });
        if (!already) {
          await prisma.company.create({
            data: { tenantId, name, companyType: "Owner", qboCustomerId: c.Id },
          });
          wrote += 1;
        }
      }
    }

    // Push direction: local Owner companies not yet in QBO.
    const unmapped = await prisma.company.findMany({
      where: { tenantId, qboCustomerId: null, companyType: { equals: "Owner", mode: "insensitive" } },
    });
    let pushed = 0;
    for (const co of unmapped) {
      try {
        const created = await createQboCustomer(tenantId, co.name);
        if (created) {
          await prisma.company.update({ where: { id: co.id }, data: { qboCustomerId: created.Id } });
          pushed += 1;
        }
      } catch (err) {
        log.warn("qbo customer push failed", { module: "integrations/qbo", companyId: co.id }, err);
      }
    }

    return { recordsRead: customers.length, recordsWritten: wrote + pushed, note: `${wrote} linked/imported · ${pushed} pushed to QBO` };
  });
}

async function createQboCustomer(tenantId: string, displayName: string): Promise<QboCustomer | null> {
  const res = await qboFetch(tenantId, "/customer", {
    method: "POST",
    body: JSON.stringify({ DisplayName: displayName }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`qbo create customer ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = (await res.json()) as { Customer?: QboCustomer };
  return j.Customer ?? null;
}

/**
 * Resolve (or create) the QBO customer for a project's owner. Mapping is
 * cached on the Company row when one matches by name.
 */
async function ensureQboCustomerForOwner(tenantId: string, ownerName: string): Promise<{ value: string; name?: string }> {
  const name = ownerName.trim();
  const local = await prisma.company.findFirst({
    where: { tenantId, name: { equals: name, mode: "insensitive" }, qboCustomerId: { not: null } },
  });
  if (local?.qboCustomerId) return { value: local.qboCustomerId, name };

  const found = await qboQuery<{ Customer?: QboCustomer[] }>(
    tenantId,
    `SELECT * FROM Customer WHERE DisplayName = '${qboQueryEscape(name)}'`,
  );
  let customer = found?.Customer?.[0] ?? null;
  if (!customer) customer = await createQboCustomer(tenantId, name);
  if (!customer) throw new Error(`could not resolve QBO customer for "${name}"`);

  const company = await prisma.company.findFirst({
    where: { tenantId, name: { equals: name, mode: "insensitive" } },
  });
  if (company && !company.qboCustomerId) {
    await prisma.company.update({ where: { id: company.id }, data: { qboCustomerId: customer.Id } });
  }
  return { value: customer.Id, name };
}

// ---------------------------------------------------------------------------
// Invoices — push APPROVED pay applications, pull payment status back
// ---------------------------------------------------------------------------

type QboInvoice = {
  Id: string;
  DocNumber?: string;
  TotalAmt?: number;
  Balance?: number;
  InvoiceLink?: string;
  PrivateNote?: string;
};

/**
 * Push APPROVED pay applications that have not been synced yet to QBO as
 * Invoices (AR). Idempotent: a pay app with qboInvoiceId set is never
 * pushed twice; the QBO id is stored back on the row immediately after
 * the create succeeds.
 */
export async function pushPayAppsToQbo(tenantId: string) {
  return runSyncJob(tenantId, "qbo", "qbo.invoices.push", async (): Promise<SyncJobResult> => {
    const itemRef = (process.env.QBO_ITEM_ID ?? "1").trim() || "1";
    const apps = await prisma.payApplication.findMany({
      where: { project: { tenantId }, status: "APPROVED", qboInvoiceId: null },
      include: { project: { select: { code: true, name: true, ownerName: true } } },
      orderBy: { approvedAt: "asc" },
      take: 50,
    });

    let pushed = 0;
    let skipped = 0;
    for (const app of apps) {
      if (toNum(app.currentPaymentDue) <= 0) {
        skipped += 1;
        continue;
      }
      const ownerName = (app.project.ownerName ?? "").trim();
      if (!ownerName) {
        skipped += 1;
        log.warn("qbo invoice push skipped — project has no ownerName", { module: "integrations/qbo", payAppId: app.id });
        continue;
      }
      const customerRef = await ensureQboCustomerForOwner(tenantId, ownerName);
      const payload = buildQboInvoicePayload(app, customerRef, itemRef);
      const res = await qboFetch(tenantId, "/invoice", {
        method: "POST",
        body: JSON.stringify(payload),
        query: { include: "invoiceLink" },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`qbo invoice POST ${res.status}: ${t.slice(0, 300)}`);
      }
      const j = (await res.json()) as { Invoice?: QboInvoice };
      const inv = j.Invoice;
      if (!inv?.Id) throw new Error("qbo invoice POST: no Invoice.Id in response");
      // Scoped write: row id came from the tenant-filtered query above.
      await prisma.payApplication.update({
        where: { id: app.id },
        data: {
          qboInvoiceId: inv.Id,
          qboDocNumber: inv.DocNumber ?? payload.DocNumber,
          qboSyncedAt: new Date(),
          qboBalance: inv.Balance ?? toNum(app.currentPaymentDue),
          qboPaymentStatus: "UNPAID",
          qboInvoiceLink: inv.InvoiceLink ?? null,
        },
      });
      pushed += 1;
    }

    await prisma.qboConnection.update({
      where: { tenantId },
      data: { lastSyncedAt: new Date(), lastSyncNote: `invoices.push: ${pushed} pushed, ${skipped} skipped` },
    });
    return { recordsRead: apps.length, recordsWritten: pushed, note: skipped > 0 ? `${skipped} skipped (zero due / no owner)` : undefined };
  });
}

/**
 * Pull payment status for every synced pay application. Lookups are keyed
 * by (tenant, qboInvoiceId); status transitions go through the guards in
 * qbo-core.ts (VOIDED never changes workflow status; PAID only promotes a
 * local APPROVED app; nothing ever downgrades a local PAID).
 */
export async function pullQboInvoiceStatuses(tenantId: string) {
  return runSyncJob(tenantId, "qbo", "qbo.invoices.pull", async (): Promise<SyncJobResult> => {
    const synced = await prisma.payApplication.findMany({
      where: { project: { tenantId }, qboInvoiceId: { not: null } },
      select: { id: true, status: true, qboInvoiceId: true },
    });
    if (synced.length === 0) {
      return { recordsRead: 0, recordsWritten: 0, note: "no synced invoices" };
    }

    let read = 0;
    let wrote = 0;
    for (let i = 0; i < synced.length; i += 20) {
      const batch = synced.slice(i, i + 20);
      const ids = batch.map((b) => `'${qboQueryEscape(b.qboInvoiceId!)}'`).join(",");
      const resp = await qboQuery<{ Invoice?: QboInvoice[] }>(
        tenantId,
        `SELECT * FROM Invoice WHERE Id IN (${ids})`,
      );
      const byQboId = new Map((resp?.Invoice ?? []).map((inv) => [inv.Id, inv]));
      for (const local of batch) {
        const inv = byQboId.get(local.qboInvoiceId!);
        if (!inv) continue;
        read += 1;
        const qboStatus = classifyQboInvoice(inv);
        const next = decideLocalStatusFromQbo(local.status as PayApplicationStatus, qboStatus);
        // Tenant-scoped guarded write: id + tenant + expected current status.
        const updated = await prisma.payApplication.updateMany({
          where: { id: local.id, project: { tenantId } },
          data: {
            qboPaymentStatus: qboStatus,
            qboBalance: inv.Balance ?? null,
            qboInvoiceLink: inv.InvoiceLink ?? undefined,
            qboSyncedAt: new Date(),
          },
        });
        wrote += updated.count;
        if (next === "PAID") {
          await prisma.payApplication.updateMany({
            where: { id: local.id, project: { tenantId }, status: "APPROVED" },
            data: { status: "PAID", paidAt: new Date(), paidBy: "QuickBooks Online sync" },
          });
        }
      }
    }

    await prisma.qboConnection.update({
      where: { tenantId },
      data: { lastSyncedAt: new Date(), lastSyncNote: `invoices.pull: ${read} read, ${wrote} updated` },
    });
    return { recordsRead: read, recordsWritten: wrote };
  });
}

// ---------------------------------------------------------------------------
// AR aging
// ---------------------------------------------------------------------------

export async function pullQboArAging(tenantId: string) {
  return runSyncJob(tenantId, "qbo", "qbo.ar-aging", async (): Promise<SyncJobResult> => {
    const res = await qboFetch(tenantId, "/reports/AgedReceivables");
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`qbo AgedReceivables ${res.status}: ${t.slice(0, 300)}`);
    }
    const report = (await res.json()) as Parameters<typeof parseArAgingReport>[0];
    const snapshot = parseArAgingReport(report);
    await prisma.qboConnection.update({
      where: { tenantId },
      data: { arAgingJson: JSON.stringify(snapshot), arAgingAt: new Date(), lastSyncedAt: new Date() },
    });
    return { recordsRead: snapshot.buckets.length, recordsWritten: 1, note: `AR total $${snapshot.total.toFixed(2)}` };
  });
}

/** Parse the stored AR aging snapshot (null when never pulled / invalid). */
export function readArAgingSnapshot(json: string | null | undefined): ArAgingSnapshot | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as ArAgingSnapshot;
    if (!Array.isArray(parsed.buckets)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Run every QBO sync routine in order (settings "Sync all" button). */
export async function runQboFullSync(tenantId: string) {
  const customers = await syncQboCustomers(tenantId);
  const push = await pushPayAppsToQbo(tenantId);
  const pull = await pullQboInvoiceStatuses(tenantId);
  const aging = await pullQboArAging(tenantId);
  return { customers, push, pull, aging };
}
