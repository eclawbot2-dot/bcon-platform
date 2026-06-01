import { NextResponse } from "next/server";
import { commitImport } from "@/lib/historical-import";
import { requireTenant } from "@/lib/tenant";
import { requireManager } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { publicRedirect } from "@/lib/redirect";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tenant = await requireTenant();
  const actor = await requireManager(tenant.id);
  const result = await commitImport(id, tenant.id);
  if (!result.ok) return NextResponse.json({ error: result.note }, { status: 400 });
  // Committing an import writes real financial ledger rows (JournalEntryRow /
  // FinancialStatement / Opportunity). Record who pushed it and how many rows
  // landed so the money mutation has an audit trail like every other.
  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "HistoricalImport",
    entityId: id,
    action: "COMMIT",
    after: { imported: result.imported, note: result.note },
    source: "imports/commit",
  });
  return publicRedirect(req, `/imports/${id}`, 303);
}
