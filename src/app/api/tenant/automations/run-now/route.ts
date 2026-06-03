/**
 * POST /api/tenant/automations/run-now — manually run one workflow for the
 * current tenant. ADMIN-only + tenant-scoped. Bypasses the due check but
 * honors the RUNNING lock; triggeredBy is recorded as manual:<userId>.
 *
 * Does NOT require the workflow to be enabled — an admin may run a disabled
 * workflow once to preview its output before turning it on.
 */

import { NextRequest } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { actorIsAdmin, currentActor } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { publicRedirect } from "@/lib/redirect";
import { isValidWorkflowKey } from "@/lib/automations/registry";
import { runWorkflowForTenant } from "@/lib/automations/engine";

const DEST = "/settings/automations";

export async function POST(req: NextRequest) {
  const tenant = await requireTenant();
  if (!(await actorIsAdmin(tenant.id))) return publicRedirect(req, `${DEST}?error=Admin+role+required`);

  const form = await req.formData();
  const workflowKey = String(form.get("workflowKey") ?? "");
  if (!isValidWorkflowKey(workflowKey)) return publicRedirect(req, `${DEST}?error=Unknown+workflow`);

  const actor = await currentActor(tenant.id);
  const outcome = await runWorkflowForTenant(tenant.id, workflowKey, `manual:${actor.userId ?? "unknown"}`);

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "AutomationConfig",
    entityId: workflowKey,
    action: "AUTOMATION_RUN_NOW",
    after: { workflowKey, status: outcome.status, summary: outcome.summary.slice(0, 200) },
    source: "settings/automations",
  });

  const tag = outcome.status === "LOCKED" ? "error" : "ok";
  return publicRedirect(req, `${DEST}?${tag}=${encodeURIComponent(`${workflowKey}: ${outcome.status} — ${outcome.summary}`)}`);
}
