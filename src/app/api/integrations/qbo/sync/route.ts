import { z } from "zod";
import { requireTenant } from "@/lib/tenant";
import { requireAdmin } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import {
  syncQboCustomers,
  pushPayAppsToQbo,
  pullQboInvoiceStatuses,
  pullQboArAging,
  runQboFullSync,
} from "@/lib/integrations/qbo";
import { publicRedirect } from "@/lib/redirect";

const KindSchema = z.enum(["customers", "invoices-push", "invoices-pull", "ar-aging", "all"]);

/**
 * Run one (or all) QBO sync routines for the caller's tenant. Admin-only.
 * Every run is recorded as IntegrationSyncJob rows (history table on the
 * settings page) + an audit event.
 */
export async function POST(req: Request) {
  const tenant = await requireTenant();
  const actor = await requireAdmin(tenant.id);
  const form = await req.formData();
  const parsed = KindSchema.safeParse(String(form.get("kind") ?? "all"));
  if (!parsed.success) {
    return publicRedirect(req, "/settings/integrations?qbo=bad-sync-kind", 303);
  }
  const kind = parsed.data;

  let outcome = "ok";
  try {
    if (kind === "customers") await syncQboCustomers(tenant.id);
    else if (kind === "invoices-push") await pushPayAppsToQbo(tenant.id);
    else if (kind === "invoices-pull") await pullQboInvoiceStatuses(tenant.id);
    else if (kind === "ar-aging") await pullQboArAging(tenant.id);
    else await runQboFullSync(tenant.id);
  } catch (err) {
    // runSyncJob already recorded the FAILED job row; surface a hint.
    outcome = err instanceof Error ? err.message.slice(0, 120) : "failed";
  }

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "QboConnection",
    entityId: tenant.id,
    action: `qbo.sync.${kind}`,
    after: { outcome },
    source: "settings/integrations",
  });

  return publicRedirect(req, "/settings/integrations", 303);
}
