import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { actorIsManager } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const tenant = await requireTenant();
  if (!(await actorIsManager(tenant.id))) redirect("/settings/api?error=Manager+role+required");
  const form = await req.formData();
  const url = (form.get("url") as string | null)?.trim();
  if (!url || !/^https?:\/\//.test(url)) redirect("/settings/api?error=valid+url+required");
  const events = ((form.get("events") as string | null) ?? "*")
    .split(/\s+/).map((s) => s.trim()).filter(Boolean);
  const secret = crypto.randomBytes(24).toString("base64url");
  const created = await prisma.webhookEndpoint.create({
    data: {
      tenantId: tenant.id,
      url: url!,
      secret,
      eventsJson: JSON.stringify(events.length ? events : ["*"]),
    },
  });
  const session = await auth();
  await recordAudit({
    tenantId: tenant.id,
    actorId: session?.userId ?? null,
    actorName: session?.user?.name ?? null,
    entityType: "WebhookEndpoint",
    entityId: created.id,
    action: "WEBHOOK_CREATED",
    after: { url: url!, events },
    source: "settings/api",
  });
  redirect("/settings/api?ok=Webhook+created");
}
