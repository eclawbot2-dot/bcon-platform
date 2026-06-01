import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import type { PrismaClient } from "@prisma/client";

/**
 * Alert-engine tests (round-3 review). Exercise:
 *   - expiry/overdue DATE MATH (expired vs expiring-soon thresholds);
 *   - TENANT SCOPING of the per-tenant scan (no cross-tenant bleed);
 *   - IDEMPOTENCY of repeated scans (the daily cron must not re-create or
 *     re-notify a still-true condition every run — the bug this round fixed).
 *
 * Strategy: copy dev.db to a temp file and point DATABASE_URL at it BEFORE
 * importing @/lib/prisma, so the library's own prisma singleton (which
 * runAlertScan uses) reads/writes the throwaway copy. The notify dispatcher
 * is mocked so we can count dispatch attempts without touching any channel.
 */

// Prepare the temp DB and env *before* any module that imports prisma loads.
const devDb = path.resolve(__dirname, "..", "prisma", "dev.db");
if (!fs.existsSync(devDb)) throw new Error("dev.db not found — run `npx prisma db push` first");
const tmpDbPath = path.join(os.tmpdir(), `bcon-test-alerts-${Date.now()}.db`);
fs.copyFileSync(devDb, tmpDbPath);
process.env.DATABASE_URL = `file:${tmpDbPath}`;

vi.mock("@/lib/notify", () => ({
  notifyForAlert: vi.fn(async () => 1),
}));

let prisma: PrismaClient;
let runAlertScan: (tenantId: string) => Promise<{ ok: boolean; produced: number; note: string }>;
let notifyMock: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ runAlertScan } = await import("@/lib/alerts"));
  const notify = await import("@/lib/notify");
  notifyMock = notify.notifyForAlert as unknown as ReturnType<typeof vi.fn>;
});

afterAll(async () => {
  await prisma?.$disconnect();
  try { fs.unlinkSync(tmpDbPath); } catch { /* ignore */ }
});

async function freshTenant(label: string) {
  return prisma.tenant.create({
    data: { name: `alerts-${label}`, slug: `alerts-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, primaryMode: "SIMPLE" },
  });
}

async function makeProject(tenantId: string, code: string) {
  return prisma.project.create({
    data: { tenantId, name: `Proj ${code}`, code: `${code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, mode: "VERTICAL" },
  });
}

function daysFromNow(d: number): Date {
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
}

describe("alert engine date math", () => {
  it("flags expired ISSUED permit as ALERT, soon-expiring as WARN; ignores far-out, FINALED, null-date", async () => {
    const tenant = await freshTenant("datemath");
    const project = await makeProject(tenant.id, "DM");

    await prisma.permit.create({ data: { projectId: project.id, permitType: "BUILDING", permitNumber: "P-EXPIRED", jurisdiction: "Charleston", status: "ISSUED", expiresAt: daysFromNow(-5) } });
    await prisma.permit.create({ data: { projectId: project.id, permitType: "ELECTRICAL", permitNumber: "P-SOON", jurisdiction: "Charleston", status: "ISSUED", expiresAt: daysFromNow(7) } });
    await prisma.permit.create({ data: { projectId: project.id, permitType: "MECH", permitNumber: "P-FAR", jurisdiction: "Charleston", status: "ISSUED", expiresAt: daysFromNow(90) } });
    await prisma.permit.create({ data: { projectId: project.id, permitType: "PLUMB", permitNumber: "P-FINALED", jurisdiction: "Charleston", status: "FINALED", expiresAt: daysFromNow(-30) } });
    await prisma.permit.create({ data: { projectId: project.id, permitType: "DEMO", permitNumber: "P-NODATE", jurisdiction: "Charleston", status: "ISSUED", expiresAt: null } });

    const res = await runAlertScan(tenant.id);
    expect(res.ok).toBe(true);

    const events = await prisma.alertEvent.findMany({ where: { tenantId: tenant.id, entityType: "Permit" } });
    const byTitle = events.map((e) => `${e.severity}:${e.title}`);
    expect(events).toHaveLength(2);
    expect(byTitle.some((t) => t.startsWith("ALERT:") && t.includes("P-EXPIRED"))).toBe(true);
    expect(byTitle.some((t) => t.startsWith("WARN:") && t.includes("P-SOON"))).toBe(true);
    expect(byTitle.some((t) => t.includes("P-FAR"))).toBe(false);
    expect(byTitle.some((t) => t.includes("P-FINALED"))).toBe(false);
    expect(byTitle.some((t) => t.includes("P-NODATE"))).toBe(false);
  });
});

describe("alert engine tenant scoping", () => {
  it("a scan for tenant A never sees tenant B's permits", async () => {
    const a = await freshTenant("scopeA");
    const b = await freshTenant("scopeB");
    const pa = await makeProject(a.id, "SA");
    const pb = await makeProject(b.id, "SB");
    await prisma.permit.create({ data: { projectId: pa.id, permitType: "BUILDING", permitNumber: "A-EXP", jurisdiction: "X", status: "ISSUED", expiresAt: daysFromNow(-2) } });
    await prisma.permit.create({ data: { projectId: pb.id, permitType: "BUILDING", permitNumber: "B-EXP", jurisdiction: "X", status: "ISSUED", expiresAt: daysFromNow(-2) } });

    await runAlertScan(a.id);

    const aEvents = await prisma.alertEvent.findMany({ where: { tenantId: a.id } });
    const bEvents = await prisma.alertEvent.findMany({ where: { tenantId: b.id } });
    expect(aEvents.some((e) => e.title.includes("A-EXP"))).toBe(true);
    expect(aEvents.some((e) => e.title.includes("B-EXP"))).toBe(false);
    expect(bEvents).toHaveLength(0);
  });
});

describe("alert engine idempotency (daily-cron safety)", () => {
  it("re-running the scan does not duplicate alerts or re-notify a still-true condition", async () => {
    const tenant = await freshTenant("idem");
    const project = await makeProject(tenant.id, "ID");
    await prisma.permit.create({ data: { projectId: project.id, permitType: "BUILDING", permitNumber: "I-EXP", jurisdiction: "X", status: "ISSUED", expiresAt: daysFromNow(-3) } });

    notifyMock.mockClear();
    await runAlertScan(tenant.id);
    const afterFirst = await prisma.alertEvent.findMany({ where: { tenantId: tenant.id } });
    expect(afterFirst).toHaveLength(1);
    expect(notifyMock.mock.calls.length).toBe(1);

    notifyMock.mockClear();
    await runAlertScan(tenant.id);
    const afterSecond = await prisma.alertEvent.findMany({ where: { tenantId: tenant.id } });
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].id).toBe(afterFirst[0].id);
    expect(notifyMock.mock.calls.length).toBe(0);
  });

  it("resolves (deletes) an unacknowledged alert once its condition clears", async () => {
    const tenant = await freshTenant("resolve");
    const project = await makeProject(tenant.id, "RS");
    const permit = await prisma.permit.create({ data: { projectId: project.id, permitType: "BUILDING", permitNumber: "R-EXP", jurisdiction: "X", status: "ISSUED", expiresAt: daysFromNow(-3) } });

    await runAlertScan(tenant.id);
    expect(await prisma.alertEvent.count({ where: { tenantId: tenant.id } })).toBe(1);

    await prisma.permit.update({ where: { id: permit.id }, data: { status: "FINALED" } });
    await runAlertScan(tenant.id);
    expect(await prisma.alertEvent.count({ where: { tenantId: tenant.id } })).toBe(0);
  });
});
