import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireManager } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { publicRedirect } from "@/lib/redirect";
import { parseNumberField } from "@/lib/form-input";
import { roundCents } from "@/lib/money";
import { CommissionSourceType } from "@prisma/client";

const VALID_SOURCES: CommissionSourceType[] = [
  "OPPORTUNITY", "PROJECT", "CONTRACT", "PAY_APPLICATION", "CHANGE_ORDER", "MANUAL",
];

export async function POST(req: Request) {
  const tenant = await requireTenant();
  const actor = await requireManager(tenant.id);
  const form = await req.formData();

  const recipientName = String(form.get("recipientName") ?? "").trim();
  const sourceTypeRaw = String(form.get("sourceType") ?? "MANUAL");
  const sourceId = String(form.get("sourceId") ?? "manual").trim() || "manual";
  if (!recipientName) {
    return NextResponse.json({ error: "recipientName required" }, { status: 400 });
  }
  const sourceType = VALID_SOURCES.includes(sourceTypeRaw as CommissionSourceType)
    ? (sourceTypeRaw as CommissionSourceType)
    : "MANUAL";

  // parseNumberField guards against NaN being written to money columns.
  const ratePct = parseNumberField(form.get("ratePct"), 0, { min: 0, max: 100 }) ?? 0;
  const basis = parseNumberField(form.get("basis"), 0, { min: 0 }) ?? 0;
  const flatAmount = parseNumberField(form.get("flatAmount"), 0, { min: 0 }) ?? 0;
  const computed = roundCents(flatAmount || (basis * ratePct) / 100);

  const ruleId = form.get("ruleId") ? String(form.get("ruleId")) : null;
  if (ruleId) {
    const rule = await prisma.commissionRule.findFirst({ where: { id: ruleId, tenantId: tenant.id } });
    if (!rule) return NextResponse.json({ error: "rule not found" }, { status: 404 });
  }

  const accrual = await prisma.commissionAccrual.create({
    data: {
      tenantId: tenant.id,
      ruleId,
      recipientName,
      sourceType,
      sourceId,
      sourceLabel: form.get("sourceLabel") ? String(form.get("sourceLabel")) : null,
      basis,
      ratePct,
      amount: computed,
      status: "ACCRUED",
      notes: form.get("notes") ? String(form.get("notes")) : null,
    },
  });

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "CommissionAccrual",
    entityId: accrual.id,
    action: "CREATE",
    after: { recipientName, sourceType, amount: computed },
    source: "commissions/accruals/create",
  });

  return publicRedirect(req, "/finance/commissions", 303);
}
