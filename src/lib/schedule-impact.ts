/**
 * Push every not-yet-complete schedule task forward by a change order's
 * impact days. All incomplete tasks shift by the same offset (a uniform
 * baseline slip), so start/end ordering is preserved.
 */

import { prisma } from "@/lib/prisma";

export async function applyCoScheduleImpact(coId: string): Promise<{ ok: boolean; tasksMoved: number; note: string }> {
  const co = await prisma.changeOrder.findUnique({ where: { id: coId } });
  if (!co) return { ok: false, tasksMoved: 0, note: "CO not found" };
  // Only a CO whose value is committed to the contract may move the
  // baseline. Pushing a DRAFT/PENDING/REJECTED/VOID CO's slip would let an
  // unapproved (or dead) change rewrite the schedule.
  if (co.status !== "APPROVED" && co.status !== "EXECUTED") {
    return { ok: false, tasksMoved: 0, note: `Schedule impact can only be applied to an APPROVED or EXECUTED change order (status is ${co.status}).` };
  }
  if (co.scheduleImpactDays <= 0) return { ok: false, tasksMoved: 0, note: "no schedule impact" };
  if (co.scheduleImpactAppliedAt) {
    return { ok: false, tasksMoved: 0, note: "Schedule impact has already been applied for this change order." };
  }

  const shiftMs = co.scheduleImpactDays * 24 * 60 * 60 * 1000;

  // Apply every shift atomically AND claim the CO in the same transaction.
  //  - The conditional claim (updateMany guarded on scheduleImpactAppliedAt
  //    still null) makes re-application a no-op: a double-click or two
  //    concurrent "Apply" posts race on the same row, exactly one matches,
  //    the loser shifts nothing. Without this the slip would compound.
  //  - A partial failure mid-loop would leave some tasks moved and others
  //    not; the transaction rolls back the whole set (claim included) on
  //    any error.
  return prisma.$transaction(async (tx) => {
    const claim = await tx.changeOrder.updateMany({
      where: { id: coId, scheduleImpactAppliedAt: null },
      data: { scheduleImpactAppliedAt: new Date() },
    });
    if (claim.count === 0) {
      return { ok: false, tasksMoved: 0, note: "Schedule impact has already been applied for this change order." };
    }
    const tasks = await tx.scheduleTask.findMany({
      where: { projectId: co.projectId, percentComplete: { lt: 100 } },
      orderBy: { startDate: "asc" },
    });
    for (const t of tasks) {
      await tx.scheduleTask.update({
        where: { id: t.id },
        data: {
          startDate: new Date(new Date(t.startDate).getTime() + shiftMs),
          endDate: new Date(new Date(t.endDate).getTime() + shiftMs),
          notes: `${t.notes ?? ""}${t.notes ? " | " : ""}Shifted by CO ${co.coNumber} (+${co.scheduleImpactDays}d)`,
        },
      });
    }
    return { ok: true, tasksMoved: tasks.length, note: `Shifted ${tasks.length} tasks by ${co.scheduleImpactDays}d` };
  });
}
