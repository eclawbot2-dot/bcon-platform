import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireManager } from "@/lib/permissions";
import { encryptSecret } from "@/lib/rfp-geo";
import { recordAudit } from "@/lib/audit";
import { publicRedirect } from "@/lib/redirect";

export async function POST(req: Request) {
  const tenant = await requireTenant();
  const actor = await requireManager(tenant.id);
  const form = await req.formData();
  const portalId = String(form.get("portalId") ?? "");
  if (!portalId) return NextResponse.json({ error: "portalId required" }, { status: 400 });

  const usernameRaw = String(form.get("username") ?? "").trim();
  const passwordRaw = String(form.get("password") ?? "").trim();
  const accountLabel = String(form.get("accountLabel") ?? "").trim() || null;
  const active = form.get("active") === "on";

  const existing = await prisma.tenantJurisdictionAccount.findUnique({
    where: { tenantId_portalId: { tenantId: tenant.id, portalId } },
  });

  // Empty username/password fields mean "leave as-is" — only overwrite
  // when the operator typed something. This makes Save idempotent and
  // safe to use just to flip the active flag without re-keying creds.
  const data = {
    accountLabel,
    active,
    usernameEnc: usernameRaw
      ? encryptSecret(tenant.id, usernameRaw)
      : existing?.usernameEnc ?? null,
    passwordEnc: passwordRaw
      ? encryptSecret(tenant.id, passwordRaw)
      : existing?.passwordEnc ?? null,
  };

  const saved = await prisma.tenantJurisdictionAccount.upsert({
    where: { tenantId_portalId: { tenantId: tenant.id, portalId } },
    create: { tenantId: tenant.id, portalId, ...data },
    update: data,
  });

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "TenantJurisdictionAccount",
    entityId: saved.id,
    action: "UPSERT",
    after: { active, hasUsername: !!data.usernameEnc, hasPassword: !!data.passwordEnc },
    source: "settings/jurisdictions",
  });

  return publicRedirect(req, "/settings/jurisdictions", 303);
}
