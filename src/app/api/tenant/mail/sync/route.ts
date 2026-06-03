/**
 * POST /api/tenant/mail/sync — admin-triggered actions:
 *   action=verify  → test credentials (no ingest)
 *   action=users   → discover mailboxes via the provider directory
 *   action=ingest  → pull + classify recent mail for this tenant now
 *
 * ADMIN-only + tenant-scoped. Ingest/users refuse to run unless enabled.
 */

import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { actorIsAdmin } from "@/lib/permissions";
import { verifyConnection, syncMailboxes, ingestTenant } from "@/lib/mail/ingest";
import { recordAudit } from "@/lib/audit";

const DEST = "/settings/workspace-transparency";

export async function POST(req: NextRequest) {
  const tenant = await requireTenant();
  if (!(await actorIsAdmin(tenant.id))) redirect(`${DEST}?error=Admin+role+required`);

  const form = await req.formData();
  const action = (form.get("action") as string | null) ?? "verify";

  let msg = "";
  if (action === "verify") {
    const r = await verifyConnection(tenant.id);
    msg = r.ok ? "Credentials+verified" : `Verify+failed:+${encodeURIComponent(r.error ?? "error")}`;
  } else if (action === "users") {
    const r = await syncMailboxes(tenant.id);
    msg = r.ok ? `Discovered+${r.created}+new,+${r.updated}+updated` : `Sync+failed:+${encodeURIComponent(r.error ?? "error")}`;
  } else if (action === "ingest") {
    const r = await ingestTenant(tenant.id, 7);
    msg = r.errors.length === 0
      ? `Ingested+${r.ingested}+(scanned+${r.scanned})`
      : `Ingest+errors:+${encodeURIComponent(r.errors[0] ?? "error")}`;
  } else {
    msg = "Unknown+action";
  }

  await recordAudit({
    tenantId: tenant.id,
    entityType: "MailConnection",
    entityId: tenant.id,
    action: `MAIL_${action.toUpperCase()}`,
    source: "settings/workspace-transparency",
  });

  redirect(`${DEST}?ok=${msg}`);
}
