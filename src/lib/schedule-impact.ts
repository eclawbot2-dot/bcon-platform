/**
 * Push every not-yet-complete schedule task forward by a change order's
 * impact days. All incomplete tasks shift by the same offset (a uniform
 * baseline slip), so start/end ordering is preserved.
 */

import { prisma } from "@/lib/prisma";

export async function applyCoScheduleImpact(coId: string): Promise<{ ok: boolean; tasksMoved: number; note: string }> {
  const co = await prisma.changeOrder.findUnique({ where: { id: coId } });
  if (!co) return { ok: false, tasksMoved: 0, note: "CO not found" };
  if (co.scheduleImpactDays <= 0) return { ok: false, tasksMoved: 0, note: "no schedule impact" };

  const tasks = await prisma.scheduleTask.findMany({
    where: { projectId: co.projectId, percentComplete: { lt: 100 } },
    orderBy: { startDate: "asc" },
  });
  const shiftMs = co.scheduleImpactDays * 24 * 60 * 60 * 1000;

  // Apply every shift atomically: a partial failure mid-loop would otherwise
  // leave some tasks moved and others not, corrupting the baseline schedule
  // with no clean way to tell which slipped. $transaction rolls back the
  // whole set on any error.
  const updates = tasks.map((t) =>
    prisma.scheduleTask.update({
      where: { id: t.id },
      data: {
        startDate: new Date(new Date(t.startDate).getTime() + shiftMs),
        endDate: new Date(new Date(t.endDate).getTime() + shiftMs),
        notes: `${t.notes ?? ""}${t.notes ? " | " : ""}Shifted by CO ${co.coNumber} (+${co.scheduleImpactDays}d)`,
      },
    }),
  );
  await prisma.$transaction(updates);
  return { ok: true, tasksMoved: updates.length, note: `Shifted ${updates.length} tasks by ${co.scheduleImpactDays}d` };
}
