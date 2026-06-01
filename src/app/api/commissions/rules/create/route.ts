import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireManager } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { publicRedirect } from "@/lib/redirect";
import { parseNumberField } from "@/lib/form-input";
import { CommissionSourceType, UserRoleTemplate } from "@prisma/client";

const VALID_SOURCES: CommissionSourceType[] = [
  "OPPORTUNITY", "PROJECT", "CONTRACT", "PAY_APPLICATION", "CHANGE_ORDER", "MANUAL",
];

const VALID_ROLES: UserRoleTemplate[] = [
  "ADMIN", "EXECUTIVE", "MANAGER", "RECRUITER", "COORDINATOR", "CAPTURE_MANAGER",
  "PROGRAM_MANAGER", "ACCOUNT_EXECUTIVE", "VIEWER", "PROJECT_ENGINEER",
  "SUPERINTENDENT", "FOREMAN", "CONTROLLER", "SAFETY_MANAGER", "QUALITY_MANAGER",
];

export async function POST(req: Request) {
  const tenant = await requireTenant();
  const actor = await requireManager(tenant.id);
  const form = await req.formData();

  const name = String(form.get("name") ?? "").trim();
  const appliesToRaw = String(form.get("appliesTo") ?? "");
  if (!name || !VALID_SOURCES.includes(appliesToRaw as CommissionSourceType)) {
    return NextResponse.json({ error: "name and appliesTo required" }, { status: 400 });
  }
  const appliesTo = appliesToRaw as CommissionSourceType;
  const recipientRoleRaw = String(form.get("recipientRole") ?? "");
  const recipientRole = VALID_ROLES.includes(recipientRoleRaw as UserRoleTemplate)
    ? (recipientRoleRaw as UserRoleTemplate)
    : null;

  const rule = await prisma.commissionRule.create({
    data: {
      tenantId: tenant.id,
      name,
      appliesTo,
      recipientRole,
      // parseNumberField guards against NaN being written to money columns.
      ratePct: parseNumberField(form.get("ratePct"), 0, { min: 0, max: 100 }) ?? 0,
      flatAmount: parseNumberField(form.get("flatAmount"), null, { min: 0 }),
      cap: parseNumberField(form.get("cap"), null, { min: 0 }),
    },
  });

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "CommissionRule",
    entityId: rule.id,
    action: "CREATE",
    after: { name, appliesTo, ratePct: rule.ratePct },
    source: "commissions/rules/create",
  });

  return publicRedirect(req, "/finance/commissions", 303);
}
