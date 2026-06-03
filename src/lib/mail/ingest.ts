/**
 * Workspace-transparency mail ingestion — multi-tenant.
 *
 * Every function here is tenant-scoped: a MailConnection, its Mailboxes, and
 * the ingested MailMessages all carry tenantId, and we ONLY ever read the
 * connection for the tenant passed in. Secrets are decrypted on demand via
 * lib/rfp-geo.ts (AES-256-GCM, per-tenant key) and never logged.
 *
 * Read/triage only — nothing here mutates the upstream mailbox or auto-acts on
 * a message. Ingestion is gated upstream to ADMIN + the connection's `enabled`
 * flag; this module additionally refuses to run when !enabled.
 */

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/rfp-geo";
import type { MailProvider } from "./provider";
import { GoogleMailProvider } from "./google";
import { M365MailProvider } from "./m365";
import { classifyMail } from "./classify";

type ConnRow = NonNullable<Awaited<ReturnType<typeof prisma.mailConnection.findUnique>>>;

/**
 * Build a concrete provider from a tenant's connection, decrypting secrets.
 * Throws on missing/invalid credentials — callers treat that as a hard error
 * (never fall back to another tenant's credentials).
 */
export function buildProvider(conn: ConnRow): MailProvider {
  if (conn.provider === "m365") {
    const secret = decryptSecret(conn.tenantId, conn.m365ClientSecretEnc);
    return new M365MailProvider({
      azureTenantId: conn.m365TenantId ?? "",
      clientId: conn.m365ClientId ?? "",
      clientSecret: secret ?? "",
    });
  }
  // default: google
  const json = decryptSecret(conn.tenantId, conn.googleServiceAccountJsonEnc);
  return new GoogleMailProvider({
    serviceAccountJson: json ?? "",
    adminSubject: conn.googleAdminSubject ?? "",
  });
}

/** Load the connection for THIS tenant only. Returns null if none. */
export async function loadConnection(tenantId: string): Promise<ConnRow | null> {
  return prisma.mailConnection.findUnique({ where: { tenantId } });
}

/** Verify credentials without ingesting anything. Updates status/lastError. */
export async function verifyConnection(tenantId: string): Promise<{ ok: boolean; error?: string }> {
  const conn = await loadConnection(tenantId);
  if (!conn) return { ok: false, error: "no connection configured" };
  try {
    const provider = buildProvider(conn);
    await provider.verify();
    await prisma.mailConnection.update({
      where: { tenantId },
      data: { status: "CONNECTED", lastError: null },
    });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.mailConnection.update({
      where: { tenantId },
      data: { status: "ERROR", lastError: error.slice(0, 500) },
    });
    return { ok: false, error };
  }
}

/**
 * Discover users via the provider directory and upsert one Mailbox per
 * (tenant, email). Skips suspended accounts. Tenant-scoped throughout.
 */
export async function syncMailboxes(
  tenantId: string,
): Promise<{ ok: boolean; created: number; updated: number; error?: string }> {
  const conn = await loadConnection(tenantId);
  if (!conn) return { ok: false, created: 0, updated: 0, error: "no connection" };
  if (!conn.enabled) return { ok: false, created: 0, updated: 0, error: "connection disabled" };
  let created = 0;
  let updated = 0;
  try {
    const provider = buildProvider(conn);
    const users = await provider.listUsers();
    for (const u of users) {
      if (u.suspended) continue;
      const existing = await prisma.mailbox.findUnique({
        where: { tenantId_email: { tenantId, email: u.email } },
      });
      if (existing) {
        await prisma.mailbox.update({
          where: { id: existing.id },
          data: {
            displayName: u.displayName ?? existing.displayName,
            providerUserId: u.providerUserId ?? existing.providerUserId,
            connectionId: conn.id,
            active: true,
            lastError: null,
          },
        });
        updated += 1;
      } else {
        await prisma.mailbox.create({
          data: {
            tenantId,
            connectionId: conn.id,
            email: u.email,
            displayName: u.displayName ?? null,
            providerUserId: u.providerUserId ?? null,
            active: true,
          },
        });
        created += 1;
      }
    }
    await prisma.mailConnection.update({
      where: { tenantId },
      data: { status: "CONNECTED", lastError: null, lastUsersSyncAt: new Date() },
    });
    return { ok: true, created, updated };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.mailConnection.update({
      where: { tenantId },
      data: { status: "ERROR", lastError: error.slice(0, 500) },
    });
    return { ok: false, created, updated, error };
  }
}

/**
 * Pull recent messages for every active mailbox in THIS tenant, dedupe by
 * (mailboxId, externalId), classify, and persist. Returns counts.
 */
export async function ingestTenant(
  tenantId: string,
  sinceDays = 7,
  maxPerMailbox = 200,
): Promise<{ ok: boolean; mailboxes: number; ingested: number; scanned: number; errors: string[] }> {
  const conn = await loadConnection(tenantId);
  if (!conn) return { ok: false, mailboxes: 0, ingested: 0, scanned: 0, errors: ["no connection"] };
  if (!conn.enabled) return { ok: false, mailboxes: 0, ingested: 0, scanned: 0, errors: ["connection disabled"] };

  const mailboxes = await prisma.mailbox.findMany({ where: { tenantId, active: true } });
  // If we have a connection but no mailboxes yet, discover them first.
  if (mailboxes.length === 0) {
    await syncMailboxes(tenantId);
    mailboxes.push(...(await prisma.mailbox.findMany({ where: { tenantId, active: true } })));
  }

  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const errors: string[] = [];
  let ingested = 0;
  let scanned = 0;

  let provider: MailProvider;
  try {
    provider = buildProvider(conn);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.mailConnection.update({ where: { tenantId }, data: { status: "ERROR", lastError: error.slice(0, 500) } });
    return { ok: false, mailboxes: 0, ingested: 0, scanned: 0, errors: [error] };
  }

  for (const mb of mailboxes) {
    try {
      const messages = await provider.pullMessages(mb.email, since, maxPerMailbox);
      for (const msg of messages) {
        scanned += 1;
        const exists = await prisma.mailMessage.findUnique({
          where: { mailboxId_externalId: { mailboxId: mb.id, externalId: msg.externalId } },
          select: { id: true },
        });
        if (exists) continue;
        const cls = await classifyMail(
          { fromAddress: msg.fromAddress, fromName: msg.fromName, subject: msg.subject, bodyText: msg.bodyText },
          tenantId,
        );
        await prisma.mailMessage.create({
          data: {
            tenantId,
            mailboxId: mb.id,
            externalId: msg.externalId,
            fromAddress: msg.fromAddress,
            fromName: msg.fromName,
            toAddressesJson: JSON.stringify(msg.to),
            subject: msg.subject?.slice(0, 500) ?? null,
            receivedAt: msg.receivedAt,
            snippet: msg.snippet,
            bodyText: msg.bodyText?.slice(0, 50_000) ?? null,
            hasAttachments: msg.hasAttachments,
            labelsJson: JSON.stringify(msg.labels ?? []),
            classification: cls.classification,
            confidence: cls.confidence,
            classModel: cls.model,
            classReasoning: cls.reasoning,
          },
        });
        ingested += 1;
      }
      await prisma.mailbox.update({ where: { id: mb.id }, data: { lastSyncedAt: new Date(), lastError: null } });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      errors.push(`${mb.email}: ${error}`);
      await prisma.mailbox.update({ where: { id: mb.id }, data: { lastError: error.slice(0, 500) } }).catch(() => {});
    }
  }

  await prisma.mailConnection.update({
    where: { tenantId },
    data: { lastSyncedAt: new Date(), ...(errors.length ? {} : { lastError: null }) },
  });
  return { ok: errors.length === 0, mailboxes: mailboxes.length, ingested, scanned, errors: errors.slice(0, 20) };
}

/**
 * On-demand, READ-ONLY Drive + Calendar peek for a single user in THIS tenant.
 *
 * Unlike ingestTenant(), nothing here is persisted or classified — it is a live
 * passthrough for the admin transparency UI. Tenant-scoped (loads only this
 * tenant's connection) and refuses to run unless the connection is `enabled`.
 * `userEmail` must be one of this tenant's active mailboxes (so an admin can't
 * pivot to an arbitrary address outside the tenant's discovered directory).
 */
export async function peekWorkspace(
  tenantId: string,
  userEmail: string,
  opts: { max?: number } = {},
): Promise<{
  ok: boolean;
  error?: string;
  files: import("./provider").WorkspaceDriveFile[];
  events: import("./provider").WorkspaceCalendarEvent[];
}> {
  const empty = { files: [], events: [] };
  const conn = await loadConnection(tenantId);
  if (!conn) return { ok: false, error: "no connection configured", ...empty };
  if (!conn.enabled) return { ok: false, error: "connection disabled", ...empty };

  const email = userEmail.toLowerCase();
  const mailbox = await prisma.mailbox.findFirst({
    where: { tenantId, email, active: true },
    select: { id: true },
  });
  if (!mailbox) return { ok: false, error: "unknown mailbox for this tenant", ...empty };

  let provider: MailProvider;
  try {
    provider = buildProvider(conn);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), ...empty };
  }

  const max = Math.min(Math.max(1, opts.max ?? 50), 200);
  try {
    const [files, events] = await Promise.all([
      provider.listDriveFiles(email, { max }),
      provider.listCalendarEvents(email, { max }),
    ]);
    return { ok: true, files, events };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), ...empty };
  }
}

/** Poll every tenant whose connection is enabled. Used by the cron route. */
export async function ingestAllEnabledTenants(
  sinceDays = 7,
): Promise<{ tenants: number; ingested: number; scanned: number; errors: string[] }> {
  const conns = await prisma.mailConnection.findMany({ where: { enabled: true }, select: { tenantId: true } });
  let ingested = 0;
  let scanned = 0;
  const errors: string[] = [];
  for (const c of conns) {
    try {
      const r = await ingestTenant(c.tenantId, sinceDays);
      ingested += r.ingested;
      scanned += r.scanned;
      if (r.errors.length) errors.push(`tenant ${c.tenantId}: ${r.errors[0]}`);
    } catch (e) {
      errors.push(`tenant ${c.tenantId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { tenants: conns.length, ingested, scanned, errors: errors.slice(0, 20) };
}
