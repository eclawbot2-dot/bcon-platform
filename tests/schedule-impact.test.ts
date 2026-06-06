import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { freshPrisma } from "./_db";

/**
 * Guards for applyCoScheduleImpact (src/lib/schedule-impact.ts).
 *
 * Pushing a change order's schedule slip into the baseline must be:
 *   1. gated on status — only an APPROVED/EXECUTED CO may move tasks
 *      (a DRAFT/REJECTED/VOID CO rewriting the schedule is a data-integrity
 *      hole);
 *   2. idempotent — applying twice (double-click, retry, two concurrent
 *      posts) must shift each task exactly once, never compound the slip.
 *
 * These exercise REAL Prisma against a throwaway dev.db copy because the
 * idempotency claim is an atomic conditional updateMany inside a
 * transaction — mocking it away would prove nothing.
 */

const { prisma, cleanup } = freshPrisma("schedule-impact");
let tenantId: string;

beforeAll(async () => {
  vi.resetModules();
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  const t = await prisma.tenant.findFirst();
  tenantId = t ? t.id : (await prisma.tenant.create({ data: { name: "si-test", slug: `si-${Date.now()}`, primaryMode: "SIMPLE" } })).id;
});

afterAll(async () => {
  vi.doUnmock("@/lib/prisma");
  await cleanup();
});

async function makeProjectWithCo(status: string, impactDays: number) {
  const project = await prisma.project.create({
    data: { tenantId, name: "si-proj", code: `SI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, mode: "SIMPLE" },
  });
  const base = new Date("2026-01-01T00:00:00.000Z");
  const t1 = await prisma.scheduleTask.create({
    data: { projectId: project.id, name: "Task 1", startDate: base, endDate: new Date(base.getTime() + 86400000), percentComplete: 0 },
  });
  const co = await prisma.changeOrder.create({
    data: { projectId: project.id, coNumber: `CO-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, title: "slip", status: status as never, scheduleImpactDays: impactDays },
  });
  return { project, t1, co };
}

describe("applyCoScheduleImpact — status + idempotency guards", () => {
  it("refuses to shift the baseline for a non-approved CO", async () => {
    const { co, t1 } = await makeProjectWithCo("PENDING", 5);
    const { applyCoScheduleImpact } = await import("@/lib/schedule-impact");
    const r = await applyCoScheduleImpact(co.id);
    expect(r.ok).toBe(false);
    expect(r.note).toMatch(/APPROVED or EXECUTED/i);
    const after = await prisma.scheduleTask.findUnique({ where: { id: t1.id } });
    expect(after!.startDate.getTime()).toBe(t1.startDate.getTime()); // unmoved
  });

  it("shifts incomplete tasks once for an APPROVED CO", async () => {
    const { co, t1 } = await makeProjectWithCo("APPROVED", 3);
    const { applyCoScheduleImpact } = await import("@/lib/schedule-impact");
    const r = await applyCoScheduleImpact(co.id);
    expect(r.ok).toBe(true);
    expect(r.tasksMoved).toBe(1);
    const after = await prisma.scheduleTask.findUnique({ where: { id: t1.id } });
    expect(after!.startDate.getTime()).toBe(t1.startDate.getTime() + 3 * 86400000);
    const freshCo = await prisma.changeOrder.findUnique({ where: { id: co.id } });
    expect(freshCo!.scheduleImpactAppliedAt).not.toBeNull();
  });

  it("is idempotent — a second application is a no-op (no double-shift)", async () => {
    const { co, t1 } = await makeProjectWithCo("EXECUTED", 7);
    const { applyCoScheduleImpact } = await import("@/lib/schedule-impact");
    const first = await applyCoScheduleImpact(co.id);
    expect(first.ok).toBe(true);
    const movedOnce = (await prisma.scheduleTask.findUnique({ where: { id: t1.id } }))!.startDate.getTime();
    expect(movedOnce).toBe(t1.startDate.getTime() + 7 * 86400000);

    const second = await applyCoScheduleImpact(co.id);
    expect(second.ok).toBe(false);
    expect(second.note).toMatch(/already been applied/i);
    const movedTwice = (await prisma.scheduleTask.findUnique({ where: { id: t1.id } }))!.startDate.getTime();
    expect(movedTwice).toBe(movedOnce); // not compounded
  });

  it("concurrent applications shift exactly once", async () => {
    const { co, t1 } = await makeProjectWithCo("APPROVED", 2);
    const { applyCoScheduleImpact } = await import("@/lib/schedule-impact");
    const [a, b] = await Promise.all([applyCoScheduleImpact(co.id), applyCoScheduleImpact(co.id)]);
    const wins = [a, b].filter((r) => r.ok).length;
    expect(wins).toBe(1); // exactly one claimed the CO
    const after = (await prisma.scheduleTask.findUnique({ where: { id: t1.id } }))!.startDate.getTime();
    expect(after).toBe(t1.startDate.getTime() + 2 * 86400000); // shifted once only
  });
});
