/**
 * POST /api/tenant/automations/interval — set/clear the per-tenant cadence
 * override (in minutes) for one workflow. ADMIN-only + tenant-scoped.
 * Blank/0/negative clears the override (falls back to the registry default).
 */

import { NextRequest } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { actorIsAdmin, currentActor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { publicRedirect } from "@/lib/redirect";
import { isValidWorkflowKey } from "@/lib/automations/registry";

const DEST = "/settings/automations";

export async function POST(req: NextRequest) {
  const tenant = await requireTenant();
  if (!(await actorIsAdmin(tenant.id))) return publicRedirect(req, `${DEST}?error=Admin+role+required`);

  const form = await req.formData();
  const workflowKey = String(form.get("workflowKey") ?? "");
  if (!isValidWorkflowKey(workflowKey)) return publicRedirect(req, `${DEST}?error=Unknown+workflow`);

  const raw = String(form.get("intervalMinutes") ?? "").trim();
  const parsed = raw === "" ? null : Math.floor(Number(raw));
  const value = parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  const actor = await currentActor(tenant.id);
  await prisma.automationConfig.upsert({
    where: { tenantId_workflowKey: { tenantId: tenant.id, workflowKey } },
    create: { tenantId: tenant.id, workflowKey, intervalMinutesOverride: value, updatedById: actor.userId },
    update: { intervalMinutesOverride: value, updatedById: actor.userId },
  });

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "AutomationConfig",
    entityId: workflowKey,
    action: "AUTOMATION_INTERVAL_SET",
    after: { workflowKey, intervalMinutesOverride: value },
    source: "settings/automations",
  });

  return publicRedirect(req, `${DEST}?ok=Interval+updated+${workflowKey}`);
}
