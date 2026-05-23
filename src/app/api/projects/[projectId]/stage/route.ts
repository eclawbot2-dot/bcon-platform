import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireManager } from "@/lib/permissions";
import { ProjectStage, WarrantyStatus } from "@prisma/client";
import { publicRedirect } from "@/lib/redirect";

const ORDER: ProjectStage[] = [ProjectStage.PRECONSTRUCTION, ProjectStage.ACTIVE, ProjectStage.CLOSEOUT, ProjectStage.WARRANTY];

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;
  const tenant = await requireTenant();
  const actor = await requireManager(tenant.id);
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const form = await req.formData();
  const requested = String(form.get("stage") ?? "").trim().toUpperCase();
  const next: ProjectStage | null = ORDER.find((s) => s === requested) ?? null;
  if (!next) return NextResponse.json({ error: "invalid stage" }, { status: 400 });

  await prisma.project.update({ where: { id: project.id }, data: { stage: next } });

  if (next === ProjectStage.CLOSEOUT) {
    const existing = await prisma.punchItem.count({ where: { projectId: project.id } });
    if (existing < 3) {
      const closeoutItems = [
        { title: "Final cleaning and restoration", area: "Site-wide" },
        { title: "O&M manuals + as-builts delivery", area: "Closeout" },
        { title: "Warranty documentation package", area: "Closeout" },
      ];
      for (const item of closeoutItems) {
        await prisma.punchItem.create({
          data: { projectId: project.id, title: item.title, area: item.area, status: "DRAFT", dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000) },
        });
      }
    }
  }

  if (next === ProjectStage.WARRANTY) {
    const open = await prisma.warrantyItem.count({ where: { projectId: project.id } });
    if (open === 0) {
      await prisma.warrantyItem.create({
        data: {
          projectId: project.id,
          title: "General construction warranty",
          description: "One-year general warranty begins at substantial completion. Track any reported issues here.",
          severity: "NORMAL",
          status: WarrantyStatus.OPEN,
          warrantyExpires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  await prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      actorId: actor.userId,
      entityType: "Project",
      entityId: project.id,
      action: `STAGE_ADVANCED_TO_${next}`,
      beforeJson: JSON.stringify({ stage: project.stage }),
      afterJson: JSON.stringify({ stage: next, actor: actor.userName }),
      source: "projects/stage",
    },
  });

  return publicRedirect(req, `/projects/${project.id}`, 303);
}
