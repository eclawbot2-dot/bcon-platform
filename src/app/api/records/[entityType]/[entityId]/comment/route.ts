import { NextResponse } from "next/server";
import { logComment } from "@/lib/approvals";
import { currentActor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { publicRedirect } from "@/lib/redirect";

/**
 * Polymorphic comment endpoint backing the ActivityTrail on every record
 * page. `entityType` is attacker-controlled (it comes straight from the URL),
 * so we must (a) whitelist it to a known commentable model and (b) verify the
 * target record actually exists and belongs to the caller's tenant before
 * writing a RecordComment — otherwise any tenant member could spray
 * comments/audit notes onto arbitrary ids, including ids in other tenants, to
 * pollute data and spoof the audit trail.
 *
 * Every commentable entity hangs off a Project, so tenant ownership is checked
 * via `project: { tenantId }`. The map's keys are the exact `entityType`
 * strings the ActivityTrail emits (see the per-record pages); a Prisma
 * `findFirst` against the named delegate verifies existence + ownership in one
 * query.
 */
const COMMENTABLE: Record<string, (id: string, tenantId: string) => Promise<{ id: string } | null>> = {
  RFI: (id, tenantId) => prisma.rFI.findFirst({ where: { id, project: { tenantId } }, select: { id: true } }),
  Submittal: (id, tenantId) => prisma.submittal.findFirst({ where: { id, project: { tenantId } }, select: { id: true } }),
  SafetyIncident: (id, tenantId) => prisma.safetyIncident.findFirst({ where: { id, project: { tenantId } }, select: { id: true } }),
  PunchItem: (id, tenantId) => prisma.punchItem.findFirst({ where: { id, project: { tenantId } }, select: { id: true } }),
  ChangeOrder: (id, tenantId) => prisma.changeOrder.findFirst({ where: { id, project: { tenantId } }, select: { id: true } }),
  Contract: (id, tenantId) => prisma.contract.findFirst({ where: { id, project: { tenantId } }, select: { id: true } }),
  PayApplication: (id, tenantId) => prisma.payApplication.findFirst({ where: { id, project: { tenantId } }, select: { id: true } }),
  LienWaiver: (id, tenantId) => prisma.lienWaiver.findFirst({ where: { id, project: { tenantId } }, select: { id: true } }),
  SubInvoice: (id, tenantId) => prisma.subInvoice.findFirst({ where: { id, project: { tenantId } }, select: { id: true } }),
  PurchaseOrder: (id, tenantId) => prisma.purchaseOrder.findFirst({ where: { id, project: { tenantId } }, select: { id: true } }),
};

export async function POST(req: Request, ctx: { params: Promise<{ entityType: string; entityId: string }> }) {
  const { entityType, entityId } = await ctx.params;
  const tenant = await requireTenant();
  const actor = await currentActor(tenant.id);
  if (!actor.canEdit) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const resolve = COMMENTABLE[entityType];
  if (!resolve) return NextResponse.json({ error: "unknown entity type" }, { status: 404 });
  const target = await resolve(entityId, tenant.id);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData();
  const body = String(form.get("body") ?? "").trim();
  if (!body) return NextResponse.json({ error: "comment required" }, { status: 400 });
  await logComment({ tenantId: tenant.id, entityType, entityId, actorName: actor.userName, actorId: actor.userId, kind: "COMMENT", body });
  return publicRedirect(req, req.headers.get("referer") ?? "/", 303);
}
