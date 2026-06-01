import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { actorIsManager } from "@/lib/permissions";
import { awardSubBid } from "@/lib/subcontract-award";
import { publicRedirect } from "@/lib/redirect";

// Awarding a sub-bid creates an EXECUTED Subcontract with real committed
// dollars (lib/subcontract-award.ts performs the create with no internal
// role check). Gate to manager-class roles so a viewer / field user
// cannot commit the company to a subcontract.
export async function POST(req: Request, ctx: { params: Promise<{ packageId: string; subBidId: string }> }) {
  const { packageId, subBidId } = await ctx.params;
  const tenant = await requireTenant();
  if (!(await actorIsManager(tenant.id))) {
    return NextResponse.json({ error: "Manager role required to award subcontracts." }, { status: 403 });
  }
  const pkg = await prisma.bidPackage.findFirst({ where: { id: packageId, project: { tenantId: tenant.id } } });
  if (!pkg) return NextResponse.json({ error: "bid package not found" }, { status: 404 });
  const result = await awardSubBid(subBidId, tenant.id);
  if (!result.ok) return NextResponse.json({ error: result.note }, { status: 400 });
  return publicRedirect(req, `/projects/${pkg.projectId}/contracts/${result.contractId}`, 303);
}
