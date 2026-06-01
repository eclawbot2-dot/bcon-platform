import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireManager } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { publicRedirect } from "@/lib/redirect";
import { parseNumberField } from "@/lib/form-input";

export async function POST(req: Request) {
  const tenant = await requireTenant();
  const actor = await requireManager(tenant.id);
  const form = await req.formData();

  const reqNumber = String(form.get("reqNumber") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  if (!reqNumber || !title) return NextResponse.json({ error: "reqNumber and title required" }, { status: 400 });

  const projectId = form.get("projectId") ? String(form.get("projectId")) : null;
  if (projectId) {
    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
    if (!project) return NextResponse.json({ error: "project not in tenant" }, { status: 400 });
  }

  const requisition = await prisma.jobRequisition.create({
    data: {
      tenantId: tenant.id,
      projectId,
      reqNumber,
      title,
      hiringManager: form.get("hiringManager") ? String(form.get("hiringManager")) : null,
      laborCategory: form.get("laborCategory") ? String(form.get("laborCategory")) : null,
      location: form.get("location") ? String(form.get("location")) : null,
      remoteAllowed: form.get("remoteAllowed") === "on",
      // parseNumberField guards non-numeric input (Number()->NaN would throw a
      // raw 500 on the Prisma write). Empty/garbage rate -> null; openings -> 1.
      rateMin: parseNumberField(form.get("rateMin"), null, { min: 0 }),
      rateMax: parseNumberField(form.get("rateMax"), null, { min: 0 }),
      openings: parseNumberField(form.get("openings"), 1, { min: 1 }) ?? 1,
      description: form.get("description") ? String(form.get("description")) : null,
      status: "OPEN",
      postedDate: new Date(),
    },
  });

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "JobRequisition",
    entityId: requisition.id,
    action: "CREATE",
    after: { reqNumber, title },
    source: "ats/reqs/create",
  });

  return publicRedirect(req, `/people/ats`, 303);
}
