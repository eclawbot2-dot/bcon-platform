import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { actorIsManager } from "@/lib/permissions";
import { applyCoScheduleImpact } from "@/lib/schedule-impact";
import { publicRedirect } from "@/lib/redirect";

// Pushing a change order's schedule impact mutates the project's baseline
// schedule (task shifts). This is a manager/PM-class action — gate it so a
// viewer or field user cannot rewrite the schedule.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tenant = await requireTenant();
  if (!(await actorIsManager(tenant.id))) {
    return NextResponse.json({ error: "Manager role required to apply schedule impact." }, { status: 403 });
  }
  const co = await prisma.changeOrder.findFirst({ where: { id, project: { tenantId: tenant.id } }, include: { project: true } });
  if (!co) return NextResponse.json({ error: "CO not found" }, { status: 404 });
  const result = await applyCoScheduleImpact(co.id);
  return publicRedirect(req, `/projects/${co.projectId}/schedule`, 303);
}
