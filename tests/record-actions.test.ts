import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { useTempDevDb } from "./_db";

/**
 * Integration coverage for the money/approval core in record-actions.ts:
 *
 *   1. Money-field validation — an edit carrying a negative / NaN / absurd
 *      money value must be rejected with a field-named error AND must NOT
 *      mutate the row (no poisoned rollup, no audit trail).
 *   2. Tamper-evident before/after audit on a financial transition —
 *      markPayAppPaid must emit an AuditEvent whose before/after JSON proves
 *      the status (and money snapshot) at the moment of the transition.
 *
 * The acting user is resolved through currentActor() -> auth(), so we mock
 * @/lib/auth to return a session for a seeded ADMIN-membership user; that
 * grants isManager/canEdit through the normal permission path (no
 * super-admin shortcut). Everything runs against a throwaway dev.db copy.
 */

// Bind DATABASE_URL to a temp copy before the lib's prisma singleton loads.
const { cleanupFile } = useTempDevDb("record-actions");

// auth() is read inside currentActor(); we point it at our seeded user.
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

let prisma: PrismaClient;
let editChangeOrder: typeof import("@/lib/record-actions").editChangeOrder;
let markPayAppPaid: typeof import("@/lib/record-actions").markPayAppPaid;
let approvePayApp: typeof import("@/lib/record-actions").approvePayApp;

let tenantId = "";
let projectId = "";
let adminUserId = "";

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ editChangeOrder, markPayAppPaid, approvePayApp } = await import("@/lib/record-actions"));

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await prisma.tenant.create({
    data: { name: `ra-${stamp}`, slug: `ra-${stamp}`, primaryMode: "VERTICAL" },
  });
  tenantId = tenant.id;

  const user = await prisma.user.create({
    data: { name: "Admin Tester", email: `ra-${stamp}@example.com`, active: true, password: "x" },
  });
  adminUserId = user.id;
  await prisma.membership.create({
    data: { tenantId, userId: user.id, roleTemplate: "ADMIN" },
  });

  const project = await prisma.project.create({
    data: { tenantId, name: "RA Project", code: `RA-${stamp}`, mode: "VERTICAL" },
  });
  projectId = project.id;

  // currentActor() sees this session and matches the ADMIN membership above.
  authMock.mockResolvedValue({ userId: adminUserId, superAdmin: false });
});

afterAll(async () => {
  await prisma?.$disconnect();
  cleanupFile();
});

describe("editChangeOrder — money-field validation", () => {
  it("rejects a negative amount and leaves the row unchanged (no write, no audit)", async () => {
    const co = await prisma.changeOrder.create({
      data: { projectId, coNumber: "CO-1", title: "Original", amount: 1000, status: "DRAFT" },
    });

    const res = await editChangeOrder(co.id, tenantId, { amount: -500 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/amount/);

    const after = await prisma.changeOrder.findUnique({ where: { id: co.id } });
    expect(Number(after?.amount)).toBe(1000); // untouched
    const audits = await prisma.auditEvent.count({ where: { entityType: "ChangeOrder", entityId: co.id } });
    expect(audits).toBe(0); // rejected before any write/audit
  });

  it("rejects an out-of-range markupPct", async () => {
    const co = await prisma.changeOrder.create({
      data: { projectId, coNumber: "CO-2", title: "Pct", amount: 1000, status: "DRAFT" },
    });
    const res = await editChangeOrder(co.id, tenantId, { markupPct: 250 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/markupPct/);
  });

  it("accepts a valid amount and persists it", async () => {
    const co = await prisma.changeOrder.create({
      data: { projectId, coNumber: "CO-3", title: "Good", amount: 1000, status: "DRAFT" },
    });
    const res = await editChangeOrder(co.id, tenantId, { amount: 2500.5 });
    expect(res.ok).toBe(true);
    const after = await prisma.changeOrder.findUnique({ where: { id: co.id } });
    expect(Number(after?.amount)).toBe(2500.5);
  });
});

describe("markPayAppPaid — tamper-evident before/after audit", () => {
  async function newApprovedPayApp(period: number) {
    return prisma.payApplication.create({
      data: {
        projectId,
        periodNumber: period,
        periodFrom: new Date("2026-01-01"),
        periodTo: new Date("2026-01-31"),
        status: "APPROVED",
        currentPaymentDue: 50000,
      },
    });
  }

  it("emits a PAY AuditEvent proving status APPROVED -> PAID with a money snapshot", async () => {
    const pa = await newApprovedPayApp(1);
    const res = await markPayAppPaid(pa.id, tenantId, "wire sent");
    expect(res.ok).toBe(true);

    const audit = await prisma.auditEvent.findFirst({
      where: { entityType: "PayApplication", entityId: pa.id, action: "PAY" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();

    const before = JSON.parse(audit!.beforeJson ?? "{}");
    const after = JSON.parse(audit!.afterJson ?? "{}");
    expect(before.status).toBe("APPROVED");
    expect(after.status).toBe("PAID");
    // money snapshot carried through (proves the diff is more than free text)
    expect(before.currentPaymentDue).toBe(50000);
    // actor is attributed in the after snapshot
    expect(after._actor).toBe("Admin Tester");
  });

  it("refuses to mark a non-APPROVED pay app paid (no audit emitted)", async () => {
    const pa = await prisma.payApplication.create({
      data: {
        projectId,
        periodNumber: 2,
        periodFrom: new Date("2026-02-01"),
        periodTo: new Date("2026-02-28"),
        status: "DRAFT",
        currentPaymentDue: 10000,
      },
    });
    const res = await markPayAppPaid(pa.id, tenantId);
    expect(res.ok).toBe(false);
    const audits = await prisma.auditEvent.count({ where: { entityType: "PayApplication", entityId: pa.id, action: "PAY" } });
    expect(audits).toBe(0);
  });

  it("approvePayApp emits an APPROVE audit before the pay transition is allowed", async () => {
    const pa = await prisma.payApplication.create({
      data: {
        projectId,
        periodNumber: 3,
        periodFrom: new Date("2026-03-01"),
        periodTo: new Date("2026-03-31"),
        status: "SUBMITTED",
        currentPaymentDue: 25000,
      },
    });
    const res = await approvePayApp(pa.id, tenantId, "looks good");
    expect(res.ok).toBe(true);
    const audit = await prisma.auditEvent.findFirst({
      where: { entityType: "PayApplication", entityId: pa.id, action: "APPROVE" },
    });
    expect(audit).toBeTruthy();
    expect(JSON.parse(audit!.afterJson ?? "{}").status).toBe("APPROVED");
  });
});
