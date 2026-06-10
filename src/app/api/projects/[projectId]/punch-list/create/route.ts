import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireEditor } from "@/lib/permissions";
import { WorkflowStatus } from "@prisma/client";
import { publicRedirect } from "@/lib/redirect";

/**
 * Create a punch item directly (manual form on the punch-list page, or
 * "save" from the AI draft page). Editor-gated — viewers can read the
 * punch list but not add deficiencies.
 */
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;
  const tenant = await requireTenant();
  let actor;
  try {
    actor = await requireEditor(tenant.id);
  } catch {
    return NextResponse.json({ error: "Editor-level role required to create a punch item." }, { status: 403 });
  }
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const form = await req.formData();
  const text = (name: string): string | null => {
    const v = (form.get(name) as string | null)?.trim();
    return v || null;
  };

  const title = text("title");
  if (!title) {
    return publicRedirect(req, `/projects/${projectId}/punch-list?error=${encodeURIComponent("Title is required")}`, 303);
  }

  const dueRaw = text("dueDate");
  const due = dueRaw ? new Date(dueRaw) : null;

  // Double-submit guard: browsers re-POST on refresh/double-click and the
  // plain HTML form has no client-side disable. If an identical punch item
  // (same project + title) was created in the last 30 seconds, treat this
  // as the same submission and redirect to the existing item instead of
  // creating a duplicate deficiency.
  const recentDuplicate = await prisma.punchItem.findFirst({
    where: {
      projectId: project.id,
      title,
      createdAt: { gte: new Date(Date.now() - 30_000) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (recentDuplicate) {
    return publicRedirect(req, `/projects/${projectId}/punch-list/${recentDuplicate.id}?ok=${encodeURIComponent("Punch item created")}`, 303);
  }

  const punch = await prisma.punchItem.create({
    data: {
      projectId: project.id,
      title,
      area: text("area") ?? undefined,
      trade: text("trade") ?? undefined,
      description: text("description") ?? undefined,
      assignedTo: text("assignedTo") ?? undefined,
      status: WorkflowStatus.DRAFT,
      dueDate: due && !Number.isNaN(due.getTime()) ? due : undefined,
    },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      actorId: actor.userId,
      entityType: "PunchItem",
      entityId: punch.id,
      action: "CREATED",
      afterJson: JSON.stringify({ title: punch.title, area: punch.area, trade: punch.trade, actor: actor.userName }),
      source: "punch-list/create",
    },
  });

  return publicRedirect(req, `/projects/${projectId}/punch-list/${punch.id}?ok=${encodeURIComponent("Punch item created")}`, 303);
}
