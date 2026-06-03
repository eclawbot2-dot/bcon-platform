import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * Workspace-transparency ingestion must stay tenant-scoped:
 *   - MailMessage rows are isolated per tenant (a query scoped to tenant A
 *     never returns tenant B's mail).
 *   - The (mailboxId, externalId) unique constraint dedupes within a mailbox
 *     but does NOT collide across two tenants' mailboxes that share an
 *     external id (which Gmail/Graph ids can, across different mail systems).
 */

let prisma: PrismaClient;
let tmpDbPath: string;
let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  const devDb = path.resolve(__dirname, "..", "prisma", "dev.db");
  if (!fs.existsSync(devDb)) throw new Error("dev.db missing — run npx prisma db push first");
  tmpDbPath = path.join(os.tmpdir(), `bcon-test-mail-${Date.now()}.db`);
  fs.copyFileSync(devDb, tmpDbPath);
  const adapter = new PrismaBetterSqlite3({ url: `file:${tmpDbPath}` });
  prisma = new PrismaClient({ adapter });
  const a = await prisma.tenant.create({ data: { name: "Mail A", slug: `mA-${Date.now()}`, primaryMode: "VERTICAL" } });
  const b = await prisma.tenant.create({ data: { name: "Mail B", slug: `mB-${Date.now()}`, primaryMode: "VERTICAL" } });
  tenantA = a.id;
  tenantB = b.id;
});

afterAll(async () => {
  await prisma?.$disconnect();
  try { fs.unlinkSync(tmpDbPath); } catch { /* ignore */ }
});

async function seedMailbox(tenantId: string, email: string) {
  const conn = await prisma.mailConnection.create({ data: { tenantId, provider: "google", enabled: true } });
  return prisma.mailbox.create({ data: { tenantId, connectionId: conn.id, email } });
}

describe("mail ingestion tenant scoping", () => {
  it("isolates MailMessage rows per tenant and allows shared externalId across tenants", async () => {
    const mbA = await seedMailbox(tenantA, "user@a.com");
    const mbB = await seedMailbox(tenantB, "user@b.com");

    const shared = "MSG-SHARED-1";
    await prisma.mailMessage.create({
      data: { tenantId: tenantA, mailboxId: mbA.id, externalId: shared, fromAddress: "x@ext.com", toAddressesJson: "[]", receivedAt: new Date(), classification: "RFI" },
    });
    // Same externalId, different tenant + mailbox — must NOT collide.
    await prisma.mailMessage.create({
      data: { tenantId: tenantB, mailboxId: mbB.id, externalId: shared, fromAddress: "y@ext.com", toAddressesJson: "[]", receivedAt: new Date(), classification: "AP_INVOICE" },
    });

    const aMsgs = await prisma.mailMessage.findMany({ where: { tenantId: tenantA } });
    const bMsgs = await prisma.mailMessage.findMany({ where: { tenantId: tenantB } });
    expect(aMsgs).toHaveLength(1);
    expect(bMsgs).toHaveLength(1);
    expect(aMsgs[0].fromAddress).toBe("x@ext.com");
    expect(bMsgs[0].fromAddress).toBe("y@ext.com");
    // Tenant A's query never returns tenant B's mail.
    expect(aMsgs.some((m) => m.fromAddress === "y@ext.com")).toBe(false);
  });

  it("peekWorkspace refuses disabled connections and out-of-tenant mailboxes", async () => {
    // Stub prisma used inside ingest.ts to our test client.
    vi.doMock("@/lib/prisma", () => ({ prisma }));
    const { peekWorkspace } = await import("@/lib/mail/ingest");

    // tenantA's connection is enabled (seeded above) with mailbox user@a.com.
    // 1) Unknown mailbox for this tenant → refused (never reaches a provider).
    const r1 = await peekWorkspace(tenantA, "stranger@elsewhere.com");
    expect(r1.ok).toBe(false);
    expect(r1.error).toMatch(/unknown mailbox/i);
    expect(r1.files).toEqual([]);
    expect(r1.events).toEqual([]);

    // 2) tenantB owns user@b.com — asking tenantA to peek it is refused
    //    (tenant isolation: a mailbox is only visible to its own tenant).
    const r2 = await peekWorkspace(tenantA, "user@b.com");
    expect(r2.ok).toBe(false);
    expect(r2.error).toMatch(/unknown mailbox/i);

    // 3) A tenant with no connection at all → refused.
    const d = await prisma.tenant.create({ data: { name: "Mail D", slug: `mD-${Date.now()}`, primaryMode: "VERTICAL" } });
    const r3 = await peekWorkspace(d.id, "anyone@d.com");
    expect(r3.ok).toBe(false);
    expect(r3.error).toMatch(/no connection/i);
  });

  it("dedupes within a single mailbox via (mailboxId, externalId)", async () => {
    // Fresh tenant — MailConnection is @@unique([tenantId]), so reusing
    // tenantA (already connected above) would trip that constraint first.
    const c = await prisma.tenant.create({ data: { name: "Mail C", slug: `mC-${Date.now()}`, primaryMode: "VERTICAL" } });
    const mb = await seedMailbox(c.id, "dedupe@c.com");
    await prisma.mailMessage.create({
      data: { tenantId: c.id, mailboxId: mb.id, externalId: "DUP-1", fromAddress: "z@ext.com", toAddressesJson: "[]", receivedAt: new Date() },
    });
    await expect(
      prisma.mailMessage.create({
        data: { tenantId: c.id, mailboxId: mb.id, externalId: "DUP-1", fromAddress: "z@ext.com", toAddressesJson: "[]", receivedAt: new Date() },
      }),
    ).rejects.toThrow();
  });
});
