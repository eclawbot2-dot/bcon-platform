import { notFound } from "next/navigation";
import Link from "next/link";
import { DetailShell } from "@/components/layout/detail-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { valueEngineeringIdeas } from "@/lib/estimating-ai";
import { formatCurrency } from "@/lib/utils";
import { toNum } from "@/lib/money";

export default async function VePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenant();
  const draft = await prisma.bidDraft.findFirst({ where: { id, tenantId: tenant.id } });
  if (!draft) notFound();
  const ideas = await valueEngineeringIdeas(id);
  const totalSavings = ideas.reduce((s, i) => s + i.savings, 0);

  return (
    <DetailShell
      eyebrow="AI · Value engineering"
      title={`VE ideas for ${draft.title}`}
      subtitle={`${ideas.length} options totaling potential savings of ${formatCurrency(totalSavings)}.`}
      crumbs={[{ label: "Bid Hub", href: "/bids" }, { label: draft.title, href: `/bids/drafts/${id}` }, { label: "Value engineering" }]}
    >
      <section className="grid gap-4 md:grid-cols-3">
        <StatTile label="Ideas" value={ideas.length} />
        <StatTile label="Potential savings" value={formatCurrency(totalSavings)} tone="good" />
        <StatTile label="% of total" value={`${((totalSavings / Math.max(1, toNum(draft.totalValue))) * 100).toFixed(1)}%`} />
      </section>
      {ideas.map((idea, i) => (
        <section key={i} className="card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">{idea.riskLevel} RISK</div>
              <div className="text-lg font-semibold text-white mt-1">{idea.title}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Savings</div>
              <div className="min-w-0 truncate text-xl font-semibold tabular-nums text-emerald-200" title={formatCurrency(idea.savings)}>{formatCurrency(idea.savings)}</div>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-200 leading-6">{idea.description}</p>
        </section>
      ))}
      <Link href={`/bids/drafts/${id}`} className="btn-outline text-xs">← back to draft</Link>
    </DetailShell>
  );
}
