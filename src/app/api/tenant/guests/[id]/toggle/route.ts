import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { actorIsManager } from "@/lib/permissions";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await requireTenant();
  if (!(await actorIsManager(tenant.id))) redirect("/settings/guests?error=Manager+role+required");
  const { id } = await ctx.params;
  const g = await prisma.guestAccount.findFirst({ where: { id, tenantId: tenant.id } });
  if (!g) redirect("/settings/guests?error=not+found");
  await prisma.guestAccount.update({ where: { id }, data: { active: !g!.active } });
  redirect("/settings/guests?ok=Guest+toggled");
}
