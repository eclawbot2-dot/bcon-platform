/**
 * POST /api/tenant/automations/trust — flip a workflow's `trustGated` toggle.
 *
 * ADMIN-only + tenant-scoped. The trust gate only has effect for workflows
 * whose registry entry is `trustGatable` (none ship trustGatable today, so
 * this is forward-looking); even then the engine still clamps actions to 0
 * unless the workflow declares it can act. OFF by default.
 */

import { NextRequest } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { actorIsAdmin, currentActor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { publicRedirect } from "@/lib/redirect";
import { getWorkflow } from "@/lib/automations/registry";

const DEST = "/settings/automations";

export async function POST(req: NextRequest) {
  const tenant = await requireTenant();
  if (!(await actorIsAdmin(tenant.id))) return publicRedirect(req, `${DEST}?error=Admin+role+required`);

  const form = await req.formData();
  const workflowKey = String(form.get("workflowKey") ?? "");
  const def = getWorkflow(workflowKey);
  if (!def) return publicRedirect(req, `${DEST}?error=Unknown+workflow`);
  if (!def.trustGatable) return publicRedirect(req, `${DEST}?error=Workflow+is+advisory-only`);

  const actor = await currentActor(tenant.id);
  const existing = await prisma.automationConfig.findUnique({
    where: { tenantId_workflowKey: { tenantId: tenant.id, workflowKey } },
  });
  const next = !(existing?.trustGated ?? false);

  await prisma.automationConfig.upsert({
    where: { tenantId_workflowKey: { tenantId: tenant.id, workflowKey } },
    create: { tenantId: tenant.id, workflowKey, trustGated: next, updatedById: actor.userId },
    update: { trustGated: next, updatedById: actor.userId },
  });

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "AutomationConfig",
    entityId: workflowKey,
    action: next ? "AUTOMATION_TRUST_ENABLED" : "AUTOMATION_TRUST_DISABLED",
    after: { workflowKey, trustGated: next },
    source: "settings/automations",
  });

  return publicRedirect(req, `${DEST}?ok=Trust+${next ? "enabled" : "disabled"}+${workflowKey}`);
}
