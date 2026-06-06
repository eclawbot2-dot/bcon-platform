import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor } from "@/lib/permissions";

const VALID = new Set(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]);

/**
 * Transition a meeting action item's status. Editor role, tenant-scoped.
 * The item must belong to a meeting on a project in the active tenant —
 * the nested where enforces this so a forged itemId from another tenant
 * matches nothing (clean redirect, no cross-tenant write).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const tenant = await requireTenant();
  const { id, itemId } = await ctx.params;
  const item = await prisma.meetingActionItem.findFirst({
    where: { id: itemId, meetingId: id, meeting: { project: { tenantId: tenant.id } } },
    include: { meeting: { select: { projectId: true } } },
  });
  if (!item) redirect(`/projects?error=Action+item+not+found`);
  if (!(await currentActor(tenant.id)).canEdit) {
    redirect(`/projects/${item!.meeting.projectId}/meetings/${id}?error=Editor+role+required`);
  }

  const form = await req.formData();
  const status = ((form.get("status") as string | null) ?? "").toUpperCase();
  if (!VALID.has(status)) {
    redirect(`/projects/${item!.meeting.projectId}/meetings/${id}?error=Invalid+status`);
  }

  const actor = await currentActor(tenant.id);
  const done = status === "DONE";
  await prisma.meetingActionItem.update({
    where: { id: itemId },
    data: {
      status: status as never,
      completedAt: done ? new Date() : null,
      completedBy: done ? actor.userName : null,
    },
  });
  redirect(`/projects/${item!.meeting.projectId}/meetings/${id}?ok=Action+item+updated`);
}
