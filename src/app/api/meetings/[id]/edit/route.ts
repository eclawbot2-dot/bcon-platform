import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor } from "@/lib/permissions";

/** Edit a meeting's minutes/attendees/location. Editor role, tenant-scoped. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await requireTenant();
  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findFirst({ where: { id, project: { tenantId: tenant.id } } });
  if (!meeting) redirect(`/projects?error=Meeting+not+found`);
  if (!(await currentActor(tenant.id)).canEdit) {
    redirect(`/projects/${meeting!.projectId}/meetings/${id}?error=Editor+role+required`);
  }

  const form = await req.formData();
  const title = (form.get("title") as string | null)?.trim();
  const location = (form.get("location") as string | null)?.trim() || null;
  const attendees = (form.get("attendees") as string | null)?.trim() || null;
  const notes = (form.get("notes") as string | null)?.trim() || null;
  const occurredRaw = (form.get("occurredAt") as string | null) ?? "";
  const occurredAt = occurredRaw ? new Date(occurredRaw) : meeting!.occurredAt;

  if (occurredRaw && Number.isNaN(new Date(occurredRaw).getTime())) {
    redirect(`/projects/${meeting!.projectId}/meetings/${id}?error=Invalid+date`);
  }

  await prisma.meeting.update({
    where: { id },
    data: {
      title: title || meeting!.title,
      location,
      attendees,
      notes,
      // Stamp occurredAt the first time minutes are recorded.
      occurredAt: occurredAt ?? (notes ? meeting!.scheduledAt : null),
    },
  });
  redirect(`/projects/${meeting!.projectId}/meetings/${id}?ok=Minutes+saved`);
}
