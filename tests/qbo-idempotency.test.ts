import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { freshPrisma } from "./_db";

/**
 * QBO sync idempotency + tenant isolation at the persistence layer.
 *
 * QBO ids (Customer.Id, Invoice.Id) are only unique PER REALM — two
 * tenants connected to two different QBO companies can legitimately hold
 * the same external id values. All mapping lookups/writes must therefore
 * be keyed by (tenantId, qboId), and pull-back writes must be scoped
 * through project.tenantId so external data can never flip another
 * tenant's rows.
 */

let prisma: PrismaClient;
let cleanup: () => Promise<void>;
let tenantA: string;
let tenantB: string;
let projectA: string;
let projectB: string;

beforeAll(async () => {
  ({ prisma, cleanup } = freshPrisma("qbo-idem"));
  const stamp = Date.now();
  const a = await prisma.tenant.create({ data: { name: "QBO A", slug: `qboA-${stamp}`, primaryMode: "VERTICAL" } });
  const b = await prisma.tenant.create({ data: { name: "QBO B", slug: `qboB-${stamp}`, primaryMode: "VERTICAL" } });
  tenantA = a.id;
  tenantB = b.id;
  const pa = await prisma.project.create({ data: { tenantId: tenantA, name: "A Tower", code: `QBA-${stamp}`, mode: "VERTICAL", ownerName: "Owner A" } });
  const pb = await prisma.project.create({ data: { tenantId: tenantB, name: "B Plaza", code: `QBB-${stamp}`, mode: "VERTICAL", ownerName: "Owner B" } });
  projectA = pa.id;
  projectB = pb.id;
});

afterAll(async () => {
  await prisma.m365CalendarEventLink.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await prisma.integrationSyncJob.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await prisma.payApplication.deleteMany({ where: { project: { tenantId: { in: [tenantA, tenantB] } } } });
  await prisma.company.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await prisma.project.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
  await cleanup?.();
});

describe("customer mapping — (tenantId, qboCustomerId) keying", () => {
  it("two tenants can map the SAME qbo customer id without colliding", async () => {
    const a = await prisma.company.create({ data: { tenantId: tenantA, name: "Shared Name A", companyType: "Owner", qboCustomerId: "58" } });
    const b = await prisma.company.create({ data: { tenantId: tenantB, name: "Shared Name B", companyType: "Owner", qboCustomerId: "58" } });
    expect(a.id).not.toBe(b.id);
  });

  it("the same (tenant, qboCustomerId) pair is rejected — idempotent upsert key", async () => {
    await expect(
      prisma.company.create({ data: { tenantId: tenantA, name: "Duplicate Map", companyType: "Owner", qboCustomerId: "58" } }),
    ).rejects.toThrow();
  });

  it("scoped unique lookup returns only the caller-tenant row", async () => {
    const found = await prisma.company.findUnique({
      where: { tenantId_qboCustomerId: { tenantId: tenantB, qboCustomerId: "58" } },
    });
    expect(found?.name).toBe("Shared Name B");
  });

  it("multiple unmapped (null qboCustomerId) companies per tenant are allowed", async () => {
    await prisma.company.create({ data: { tenantId: tenantA, name: "Unmapped 1", companyType: "Owner" } });
    await prisma.company.create({ data: { tenantId: tenantA, name: "Unmapped 2", companyType: "Owner" } });
    const count = await prisma.company.count({ where: { tenantId: tenantA, qboCustomerId: null } });
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe("invoice pull-back — tenant-scoped guarded writes", () => {
  it("same qboInvoiceId on two tenants; a pull scoped to tenant A never touches tenant B", async () => {
    const appA = await prisma.payApplication.create({
      data: {
        projectId: projectA, periodNumber: 1,
        periodFrom: new Date("2026-05-01"), periodTo: new Date("2026-05-31"),
        status: "APPROVED", currentPaymentDue: 1000, qboInvoiceId: "777",
      },
    });
    const appB = await prisma.payApplication.create({
      data: {
        projectId: projectB, periodNumber: 1,
        periodFrom: new Date("2026-05-01"), periodTo: new Date("2026-05-31"),
        status: "APPROVED", currentPaymentDue: 2000, qboInvoiceId: "777",
      },
    });

    // This is the exact write shape pullQboInvoiceStatuses() uses.
    const updated = await prisma.payApplication.updateMany({
      where: { id: appA.id, project: { tenantId: tenantA }, status: "APPROVED" },
      data: { status: "PAID", paidAt: new Date(), paidBy: "QuickBooks Online sync" },
    });
    expect(updated.count).toBe(1);

    const b = await prisma.payApplication.findUnique({ where: { id: appB.id } });
    expect(b?.status).toBe("APPROVED"); // untouched

    // Cross-tenant attempt (external id under attacker influence): scoping
    // by the OTHER tenant must match zero rows.
    const cross = await prisma.payApplication.updateMany({
      where: { id: appB.id, project: { tenantId: tenantA } },
      data: { status: "PAID" },
    });
    expect(cross.count).toBe(0);
  });

  it("status-guarded promotion is idempotent — a second PAID pull writes nothing", async () => {
    const app = await prisma.payApplication.findFirst({ where: { project: { tenantId: tenantA }, qboInvoiceId: "777" } });
    const again = await prisma.payApplication.updateMany({
      where: { id: app!.id, project: { tenantId: tenantA }, status: "APPROVED" },
      data: { status: "PAID", paidAt: new Date() },
    });
    expect(again.count).toBe(0); // already PAID — guard filtered it out
  });
});

describe("m365 calendar links — (tenant, kind, recordId) idempotency key", () => {
  it("upsert reuses one row per record; same recordId across tenants is fine", async () => {
    const where = { tenantId_kind_recordId: { tenantId: tenantA, kind: "payapp-due", recordId: "rec1" } };
    const first = await prisma.m365CalendarEventLink.upsert({
      where,
      update: { eventId: "evt-1" },
      create: { tenantId: tenantA, kind: "payapp-due", recordId: "rec1", eventId: "evt-1", calendarUpn: "cal@x.com", subject: "s", startsAt: new Date() },
    });
    const second = await prisma.m365CalendarEventLink.upsert({
      where,
      update: { eventId: "evt-2" },
      create: { tenantId: tenantA, kind: "payapp-due", recordId: "rec1", eventId: "evt-2", calendarUpn: "cal@x.com", subject: "s", startsAt: new Date() },
    });
    expect(second.id).toBe(first.id);
    expect(second.eventId).toBe("evt-2");

    const other = await prisma.m365CalendarEventLink.create({
      data: { tenantId: tenantB, kind: "payapp-due", recordId: "rec1", eventId: "evt-3", calendarUpn: "cal@x.com", subject: "s", startsAt: new Date() },
    });
    expect(other.id).not.toBe(first.id);
  });
});

describe("sync-job history rows", () => {
  it("records runs per tenant; in-flight detection key is (tenant, provider, kind, RUNNING)", async () => {
    const { runSyncJob } = await import("@/lib/integrations/sync-job");
    // Point the lib singleton at the test DB row set — setup-env already
    // binds DATABASE_URL to the test database for every test file.
    const out = await runSyncJob(tenantA, "qbo", "qbo.test-kind", async () => ({ recordsRead: 3, recordsWritten: 2 }));
    expect(out.status).toBe("OK");
    const { prisma: libPrisma } = await import("@/lib/prisma");
    const row = await libPrisma.integrationSyncJob.findUnique({ where: { id: out.jobId } });
    expect(row?.tenantId).toBe(tenantA);
    expect(row?.recordsRead).toBe(3);
    expect(row?.recordsWritten).toBe(2);
    expect(row?.status).toBe("OK");
    expect(row?.completedAt).toBeTruthy();
  });

  it("a failing body records FAILED with the error message", async () => {
    const { runSyncJob } = await import("@/lib/integrations/sync-job");
    const out = await runSyncJob(tenantA, "qbo", "qbo.test-fail", async () => {
      throw new Error("simulated provider 500");
    });
    expect(out.status).toBe("FAILED");
    const { prisma: libPrisma } = await import("@/lib/prisma");
    const row = await libPrisma.integrationSyncJob.findUnique({ where: { id: out.jobId } });
    expect(row?.status).toBe("FAILED");
    expect(row?.error).toContain("simulated provider 500");
  });
});
