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
  // Look up first so audit captures the token name for context.
  const token = await prisma.apiToken.findFirst({ where: { id, tenantId: tenant.id }, select: { id: true, name: true, prefix: true } });
  if (!token) redirect("/settings/api?error=token+not+found");
  await prisma.apiToken.updateMany({
    where: { id, tenantId: tenant.id },
    data: { revokedAt: new Date() },
  });
  const session = await auth();
  await recordAudit({
    tenantId: tenant.id,
    actorId: session?.userId ?? null,
    actorName: session?.user?.name ?? null,
    entityType: "ApiToken",
    entityId: id,
    action: "API_TOKEN_REVOKED",
    before: { name: token!.name, prefix: token!.prefix },
    source: "settings/api",
  });
  redirect("/settings/api?ok=Token+revoked");
}
