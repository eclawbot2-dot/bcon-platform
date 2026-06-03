/**
 * POST /api/tenant/mail/toggle — flip the per-tenant `enabled` opt-in.
 *
 * ADMIN-only + tenant-scoped. OFF by default; turning it ON is what permits
 * any mail to be read. Audited both directions.
 */

import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { actorIsAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

const DEST = "/settings/workspace-transparency";

export async function POST(req: NextRequest) {
  const tenant = await requireTenant();
  if (!(await actorIsAdmin(tenant.id))) redirect(`${DEST}?error=Admin+role+required`);

  const conn = await prisma.mailConnection.findUnique({ where: { tenantId: tenant.id } });
  if (!conn) redirect(`${DEST}?error=Configure+a+connection+first`);

  const next = !conn!.enabled;
  await prisma.mailConnection.update({ where: { tenantId: tenant.id }, data: { enabled: next } });

  await recordAudit({
    tenantId: tenant.id,
    entityType: "MailConnection",
    entityId: tenant.id,
    action: next ? "MAIL_INGEST_ENABLED" : "MAIL_INGEST_DISABLED",
    after: { enabled: next },
    source: "settings/workspace-transparency",
  });

  redirect(`${DEST}?ok=${next ? "Enabled" : "Disabled"}`);
}
