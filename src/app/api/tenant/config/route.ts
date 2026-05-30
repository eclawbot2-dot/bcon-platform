import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireManager } from "@/lib/permissions";
import { ProjectMode } from "@prisma/client";
import { publicRedirect } from "@/lib/redirect";

const VALID_MODES = new Set(Object.values(ProjectMode));

export async function POST(req: Request) {
  // Membership-checked tenant resolution (was a raw slug lookup that let any
  // logged-in user rewrite another tenant's mode config by switching the
  // cx.tenant cookie). requireTenant enforces membership; requireManager
  // restricts this admin-class settings change to manager+ roles.
  const tenant = await requireTenant();
  try {
    await requireManager(tenant.id);
  } catch {
    return NextResponse.json({ error: "Manager-level role required." }, { status: 403 });
  }

  const form = await req.formData();
  const primaryMode = String(form.get("primaryMode") ?? tenant.primaryMode);
  const enabledModesRaw = form.getAll("enabledModes").map((v) => String(v));
  const enabledModes = enabledModesRaw.filter((m) => VALID_MODES.has(m as ProjectMode));
  if (!enabledModes.includes(primaryMode)) enabledModes.push(primaryMode);

  if (!VALID_MODES.has(primaryMode as ProjectMode)) {
    return NextResponse.json({ error: "invalid primaryMode" }, { status: 400 });
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      primaryMode: primaryMode as ProjectMode,
      enabledModes: JSON.stringify(enabledModes),
    },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      entityType: "Tenant",
      entityId: tenant.id,
      action: "MODE_CONFIG_UPDATED",
      afterJson: JSON.stringify({ primaryMode, enabledModes }),
      source: "settings",
    },
  });

  const redirectTo = String(form.get("redirect") ?? "/settings") || "/settings";
  return publicRedirect(req, redirectTo, 303);
}
