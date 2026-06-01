import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor } from "@/lib/permissions";

export async function POST(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  const tenant = await requireTenant();
  const { projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) redirect(`/projects?error=not+found`);
  // Look-ahead planning is a field/PM action — require an edit-capable
  // role so pure viewers cannot write commitments.
  if (!(await currentActor(tenant.id)).canEdit) {
    redirect(`/projects/${projectId}/look-ahead?error=Editor+role+required`);
  }
  const form = await req.formData();
  const description = (form.get("description") as string | null)?.trim();
  const responsibleParty = (form.get("responsibleParty") as string | null)?.trim();
  const weekRaw = form.get("weekStarting") as string;
  const weekStarting = new Date(weekRaw);
  if (!description || !responsibleParty || Number.isNaN(weekStarting.getTime())) {
    redirect(`/projects/${projectId}/look-ahead?error=invalid+input`);
  }
  await prisma.lookAheadCommitment.create({
    data: {
      projectId,
      weekStarting,
      description: description!,
      responsibleParty: responsibleParty!,
      plannedComplete: true,
    },
  });
  redirect(`/projects/${projectId}/look-ahead?ok=Commitment+added`);
}
