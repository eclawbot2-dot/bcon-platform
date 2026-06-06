import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor } from "@/lib/permissions";

/** Add an action item to a meeting. Editor role, tenant-scoped via the meeting's project. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await requireTenant();
  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findFirst({ where: { id, project: { tenantId: tenant.id } } });
  if (!meeting) redirect(`/projects?error=Meeting+not+found`);
  if (!(await currentActor(tenant.id)).canEdit) {
    redirect(`/projects/${meeting!.projectId}/meetings/${id}?error=Editor+role+required`);
  }

  const form = await req.formData();
  const description = (form.get("description") as string | null)?.trim();
  const assignee = (form.get("assignee") as string | null)?.trim() || null;
  const dueRaw = (form.get("dueDate") as string | null) ?? "";
  const dueDate = dueRaw ? new Date(dueRaw) : null;

  if (!description) {
    redirect(`/projects/${meeting!.projectId}/meetings/${id}?error=Action+item+description+required`);
  }
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    redirect(`/projects/${meeting!.projectId}/meetings/${id}?error=Invalid+due+date`);
  }

  await prisma.meetingActionItem.create({
    data: { meetingId: id, description: description!, assignee, dueDate },
  });
  redirect(`/projects/${meeting!.projectId}/meetings/${id}?ok=Action+item+added`);
}
