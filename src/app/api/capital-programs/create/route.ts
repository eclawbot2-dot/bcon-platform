import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { actorIsManager } from "@/lib/permissions";

// Capital programs are owner/executive-level budget envelopes (admin UI).
// Gate creation to manager-class roles.
export async function POST(req: NextRequest) {
  const tenant = await requireTenant();
  if (!(await actorIsManager(tenant.id))) redirect("/admin/capital-programs?error=Manager+role+required");
  const form = await req.formData();
  const name = (form.get("name") as string | null)?.trim();
  if (!name) redirect("/admin/capital-programs?error=name+required");
  const ownerName = (form.get("ownerName") as string | null)?.trim() || null;
  const totalBudgetRaw = Number(form.get("totalBudget"));
  const totalBudget = Number.isFinite(totalBudgetRaw) && totalBudgetRaw > 0 ? totalBudgetRaw : null;
  await prisma.capitalProgram.create({
    data: {
      tenantId: tenant.id,
      name: name!,
      ownerName,
      totalBudget,
    },
  });
  redirect("/admin/capital-programs?ok=Program+created");
}
