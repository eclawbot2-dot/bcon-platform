import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor } from "@/lib/permissions";

/**
 * Create a meeting (minutes shell) for a project. Recording minutes is a
 * PM/field action — require an edit-capable role so pure viewers cannot
 * write records. Tenant-scoped: the project must belong to the active tenant.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  const tenant = await requireTenant();
  const { projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) redirect(`/projects?error=not+found`);
  if (!(await currentActor(tenant.id)).canEdit) {
    redirect(`/projects/${projectId}/meetings?error=Editor+role+required`);
  }

  const form = await req.formData();
  const title = (form.get("title") as string | null)?.trim();
  const meetingType = ((form.get("meetingType") as string | null)?.trim()) || "PROGRESS";
  const scheduledRaw = (form.get("scheduledAt") as string | null) ?? "";
  const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : new Date();
  const location = (form.get("location") as string | null)?.trim() || null;
  const attendees = (form.get("attendees") as string | null)?.trim() || null;
  const notes = (form.get("notes") as string | null)?.trim() || null;

  if (!title || Number.isNaN(scheduledAt.getTime())) {
    redirect(`/projects/${projectId}/meetings?error=Title+and+a+valid+date+are+required`);
  }

  const meeting = await prisma.meeting.create({
    data: {
      projectId,
      title: title!,
      meetingType,
      scheduledAt,
      location,
      attendees,
      notes,
      occurredAt: notes ? scheduledAt : null,
    },
  });
  redirect(`/projects/${projectId}/meetings/${meeting.id}?ok=Meeting+created`);
}
