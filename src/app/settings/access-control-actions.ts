"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireAdmin } from "@/lib/permissions";

/**
 * Toggle the current tenant's "Allow External Email Logins" setting.
 * Admin-gated (tenant ADMIN role or a platform super-admin acting as self —
 * requireAdmin enforces this). When false (default) only members of this
 * tenant may access it; when true, any provisioned user may. Super-admins
 * are always exempt from the restriction.
 */
export async function setAllowExternalEmailLoginsAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  const actor = await requireAdmin(tenant.id);
  const allow = formData.get("allow") === "on" || formData.get("allow") === "true";
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { allowExternalEmailLogins: allow },
  });
  await prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      actorId: actor.userId ?? undefined,
      entityType: "Tenant",
      entityId: tenant.id,
      action: "ACCESS_POLICY_CHANGED",
      afterJson: JSON.stringify({ allowExternalEmailLogins: allow }),
      source: "settings/access-control",
    },
  });
  revalidatePath("/settings");
}
