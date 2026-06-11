import { requireTenant } from "@/lib/tenant";
import { requireAdmin } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { disconnectQboReal } from "@/lib/integrations/qbo";
import { publicRedirect } from "@/lib/redirect";

/** Disconnect the real QBO connection — clears the encrypted tokens. */
export async function POST(req: Request) {
  const tenant = await requireTenant();
  const actor = await requireAdmin(tenant.id);
  await disconnectQboReal(tenant.id);
  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "QboConnection",
    entityId: tenant.id,
    action: "qbo.disconnected",
    source: "settings/integrations",
  });
  return publicRedirect(req, "/settings/integrations?qbo=disconnected", 303);
}
