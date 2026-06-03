/**
 * POST /api/tenant/mail/connect — save/replace the tenant's MailConnection.
 *
 * ADMIN-only + tenant-scoped. Secrets (service-account JSON, M365 client
 * secret) are encrypted at rest via encryptSecret(tenantId, …) before they
 * ever touch the DB. Empty secret fields leave the existing encrypted value
 * untouched (so an admin can edit non-secret fields without re-pasting keys).
 */

import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { actorIsAdmin } from "@/lib/permissions";
import { encryptSecret } from "@/lib/rfp-geo";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";

const DEST = "/settings/workspace-transparency";

export async function POST(req: NextRequest) {
  const tenant = await requireTenant();
  if (!(await actorIsAdmin(tenant.id))) redirect(`${DEST}?error=Admin+role+required`);

  const form = await req.formData();
  const provider = (form.get("provider") as string | null) === "m365" ? "m365" : "google";

  const existing = await prisma.mailConnection.findUnique({ where: { tenantId: tenant.id } });

  const data: Record<string, unknown> = { provider };

  if (provider === "google") {
    const json = (form.get("googleServiceAccountJson") as string | null)?.trim();
    const adminSubject = (form.get("googleAdminSubject") as string | null)?.trim() || null;
    const pubsub = (form.get("googlePubsubTopic") as string | null)?.trim() || null;
    if (json) data.googleServiceAccountJsonEnc = encryptSecret(tenant.id, json);
    data.googleAdminSubject = adminSubject;
    data.googlePubsubTopic = pubsub;
  } else {
    const azureTenant = (form.get("m365TenantId") as string | null)?.trim() || null;
    const clientId = (form.get("m365ClientId") as string | null)?.trim() || null;
    const clientSecret = (form.get("m365ClientSecret") as string | null)?.trim();
    data.m365TenantId = azureTenant;
    data.m365ClientId = clientId;
    if (clientSecret) data.m365ClientSecretEnc = encryptSecret(tenant.id, clientSecret);
  }

  if (existing) {
    await prisma.mailConnection.update({ where: { tenantId: tenant.id }, data });
  } else {
    await prisma.mailConnection.create({ data: { tenantId: tenant.id, ...data } });
  }

  await recordAudit({
    tenantId: tenant.id,
    entityType: "MailConnection",
    entityId: tenant.id,
    action: existing ? "MAIL_CONNECTION_UPDATED" : "MAIL_CONNECTION_CREATED",
    after: { provider },
    source: "settings/workspace-transparency",
  });

  redirect(`${DEST}?ok=Connection+saved`);
}
