import { notFound } from "next/navigation";
import Link from "next/link";
import { DetailShell } from "@/components/layout/detail-shell";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { scopeGapCheck } from "@/lib/estimating-ai";

export default async function GapsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenant();
  const draft = await prisma.bidDraft.findFirst({ where: { id, tenantId: tenant.id } });
  if (!draft) notFound();
  const gaps = await scopeGapCheck(id);

  return (
    <DetailShell
      eyebrow="AI · Scope gaps"
      title={`Likely omissions in ${draft.title}`}
      subtitle={`${gaps.length} typical cost codes not yet captured in this estimate.`}
      crumbs={[{ label: "Bid Hub", href: "/bids" }, { label: draft.title, href: `/bids/drafts/${id}` }, { label: "Gaps" }]}
    >
      {gaps.length === 0 ? (
        <div className="card p-6 text-sm text-slate-300">No material scope gaps detected — estimate covers typical cost codes for this mode.</div>
      ) : (
        <section className="card p-0 overflow-hidden">
          <SortableTable
            emptyMessage="No gaps."
            columns={[
              { header: "Cost code" },
              { header: "Description" },
              { header: "Why" },
            ]}
            rows={gaps.map((g) => ({
              key: g.costCode,
              cells: [
                { sort: g.costCode, tdClassName: "font-mono text-xs text-amber-200", node: g.costCode },
                { sort: g.description, node: g.description },
                { sort: g.rationale, tdClassName: "text-xs text-slate-400", node: g.rationale },
              ],
            }))}
          />
        </section>
      )}
      <Link href={`/bids/drafts/${id}`} className="btn-outline text-xs">← back to draft</Link>
    </DetailShell>
  );
}
