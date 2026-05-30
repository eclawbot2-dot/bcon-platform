import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { actorIsManager } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await requireTenant();
  if (!(await actorIsManager(tenant.id))) redirect("/settings/api?error=Manager+role+required");
  const { id } = await ctx.params;
  const w = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: tenant.id } });
  if (!w) redirect("/settings/api?error=webhook+not+found");
  await prisma.webhookEndpoint.update({ where: { id }, data: { active: !w!.active } });
  const session = await auth();
  await recordAudit({
    tenantId: tenant.id,
    actorId: session?.userId ?? null,
    actorName: session?.user?.name ?? null,
    entityType: "WebhookEndpoint",
    entityId: id,
    action: "WEBHOOK_TOGGLED",
    before: { active: w!.active },
    after: { active: !w!.active },
    source: "settings/api",
  });
  redirect("/settings/api?ok=Webhook+toggled");
}
