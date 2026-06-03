/**
 * POST /api/tenant/automations/toggle — flip a workflow's `enabled` opt-in.
 *
 * ADMIN-only + tenant-scoped. OFF by default. When enabling, seed nextDueAt
 * to now so the next dispatcher tick picks it up immediately.
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

  const actor = await currentActor(tenant.id);
  const existing = await prisma.automationConfig.findUnique({
    where: { tenantId_workflowKey: { tenantId: tenant.id, workflowKey } },
  });
  const next = !(existing?.enabled ?? false);

  await prisma.automationConfig.upsert({
    where: { tenantId_workflowKey: { tenantId: tenant.id, workflowKey } },
    create: { tenantId: tenant.id, workflowKey, enabled: next, nextDueAt: next ? new Date() : null, updatedById: actor.userId },
    update: { enabled: next, nextDueAt: next ? new Date() : null, updatedById: actor.userId },
  });

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "AutomationConfig",
    entityId: workflowKey,
    action: next ? "AUTOMATION_ENABLED" : "AUTOMATION_DISABLED",
    after: { workflowKey, enabled: next },
    source: "settings/automations",
  });

  return publicRedirect(req, `${DEST}?ok=${next ? "Enabled" : "Disabled"}+${workflowKey}`);
}
