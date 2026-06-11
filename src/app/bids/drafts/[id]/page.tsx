import { notFound } from "next/navigation";
import Link from "next/link";
import { DetailShell, DetailGrid, DetailField } from "@/components/layout/detail-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toNum, sumMoney, multiplyMoney, addMoney } from "@/lib/money";

export default async function BidDraftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenant();
  const draft = await prisma.bidDraft.findFirst({
    where: { id, tenantId: tenant.id },
    include: {
      sections: { orderBy: { position: "asc" } },
      complianceRuns: { include: { items: true }, orderBy: { runAt: "desc" }, take: 5 },
      rfpListing: true,
      opportunity: true,
      lineItems: { orderBy: { position: "asc" } },
    },
  });
  if (!draft) notFound();

  const latestRun = draft.complianceRuns[0];
  const wordCount = draft.sections.reduce((s, sc) => s + sc.wordCount, 0);
  const rawTotal = sumMoney(draft.lineItems.map((l) => l.amount));
  const withOh = multiplyMoney(rawTotal, 1 + draft.overheadPct / 100);
  const withProfit = multiplyMoney(withOh, 1 + draft.profitPct / 100);
  const byCategory = draft.lineItems.reduce<Record<string, number>>((acc, l) => { acc[l.category] = addMoney(acc[l.category] ?? 0, l.amount); return acc; }, {});

  return (
    <DetailShell
      eyebrow="Bid draft"
      title={draft.title}
      subtitle={draft.rfpListing ? `Response to ${draft.rfpListing.agency} · ${draft.rfpListing.solicitationNo ?? ""}` : undefined}
      crumbs={[{ label: "Bid Hub", href: "/bids" }, { label: "RFPs", href: "/bids/listings" }, { label: draft.title }]}
      actions={<StatusBadge status={draft.status} />}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Proposed price" value={formatCurrency(draft.totalValue)} tone="good" />
        <StatTile label="Sections" value={draft.sections.length} />
        <StatTile label="Word count" value={wordCount.toLocaleString()} />
        <StatTile label="Compliance" value={latestRun ? latestRun.summary ?? latestRun.overall : "not run"} tone={latestRun?.overall === "PASS" ? "good" : latestRun?.overall === "FAIL" ? "bad" : "warn"} />
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Proposal overview</div>
        <DetailGrid>
          <DetailField label="Title">{draft.title}</DetailField>
          <DetailField label="Model">{draft.modelUsed}</DetailField>
          <DetailField label="Author">{draft.authorName ?? "—"}</DetailField>
          <DetailField label="Submitted">{formatDate(draft.submittedAt)}</DetailField>
          <DetailField label="Updated">{formatDate(draft.updatedAt)}</DetailField>
          <DetailField label="Win themes">{draft.winThemes ?? "—"}</DetailField>
          <DetailField label="Key differentiators">{draft.keyDifferentiators ?? "—"}</DetailField>
          <DetailField label="Linked listing">{draft.rfpListing ? <Link href={`/bids/listings?status=${draft.rfpListing.status}`} className="text-cyan-300 hover:underline">{draft.rfpListing.title}</Link> : "—"}</DetailField>
          <DetailField label="Linked opportunity">{draft.opportunity ? <Link href={`/opportunities/${draft.opportunity.id}`} className="text-cyan-300 hover:underline">{draft.opportunity.name}</Link> : "—"}</DetailField>
        </DetailGrid>
        <div className="mt-4 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-1">Core actions</div>
            <div className="flex flex-wrap gap-2">
              <form action={`/api/bid-drafts/${draft.id}/estimate`} method="post">
                <button className="btn-primary text-xs">{draft.lineItems.length > 0 ? "Regenerate estimate" : "Build line-item estimate"}</button>
              </form>
              <form action={`/api/bid-drafts/${draft.id}/compliance`} method="post">
                <button className="btn-outline text-xs">Run compliance check</button>
              </form>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300 mb-1">AI helpers</div>
            <div className="flex flex-wrap gap-2">
              <form action={`/api/bid-drafts/${draft.id}/tailor`} method="post">
                <button className="btn-outline text-xs" title="Regenerate win themes + differentiators">Tailor themes</button>
              </form>
              <Link href={`/bids/drafts/${draft.id}/pricing`} className="btn-outline text-xs">Pricing advisor</Link>
              <Link href={`/bids/drafts/${draft.id}/deep-compliance`} className="btn-outline text-xs">Deep compliance</Link>
              <Link href={`/bids/drafts/${draft.id}/takeoff`} className="btn-outline text-xs">SOW takeoff</Link>
              <Link href={`/bids/drafts/${draft.id}/gaps`} className="btn-outline text-xs">Scope gaps</Link>
              <Link href={`/bids/drafts/${draft.id}/value-engineering`} className="btn-outline text-xs">VE ideas</Link>
            </div>
          </div>
        </div>
      </section>

      {draft.lineItems.length > 0 ? (
        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Line-item estimate</div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            {Object.entries(byCategory).map(([cat, amt]) => (
              <div key={cat} className="panel p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{cat}</div>
                <div className="mt-1 text-xl font-semibold text-white">{formatCurrency(amt)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="table-header">Cost code</th>
                  <th className="table-header">Description</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Qty</th>
                  <th className="table-header">Unit</th>
                  <th className="table-header">Labor</th>
                  <th className="table-header">Material</th>
                  <th className="table-header">Equipment</th>
                  <th className="table-header">Sub</th>
                  <th className="table-header">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-slate-950/40">
                {draft.lineItems.map((l) => (
                  <tr key={l.id}>
                    <td className="table-cell font-mono text-xs">{l.costCode ?? "—"}</td>
                    <td className="table-cell">{l.description}</td>
                    <td className="table-cell">{l.category}</td>
                    <td className="table-cell">{l.quantity}</td>
                    <td className="table-cell">{l.unit ?? "—"}</td>
                    <td className="table-cell">{formatCurrency(l.laborCost)}</td>
                    <td className="table-cell">{formatCurrency(l.materialCost)}</td>
                    <td className="table-cell">{formatCurrency(l.equipmentCost)}</td>
                    <td className="table-cell">{formatCurrency(l.subCost)}</td>
                    <td className="table-cell font-medium text-white">{formatCurrency(l.amount)}</td>
                  </tr>
                ))}
                <tr className="bg-white/5">
                  <td className="table-cell" colSpan={9}><span className="text-slate-400">Subtotal</span></td>
                  <td className="table-cell font-semibold text-white">{formatCurrency(rawTotal)}</td>
                </tr>
                <tr className="bg-white/5">
                  <td className="table-cell" colSpan={9}><span className="text-slate-400">+ Overhead ({draft.overheadPct}%)</span></td>
                  <td className="table-cell font-semibold text-white">{formatCurrency(withOh - rawTotal)}</td>
                </tr>
                <tr className="bg-white/5">
                  <td className="table-cell" colSpan={9}><span className="text-slate-400">+ Profit ({draft.profitPct}%)</span></td>
                  <td className="table-cell font-semibold text-white">{formatCurrency(withProfit - withOh)}</td>
                </tr>
                <tr className="bg-cyan-500/10">
                  <td className="table-cell" colSpan={9}><span className="text-cyan-200 font-semibold">Proposed total</span></td>
                  <td className="table-cell font-semibold text-cyan-100">{formatCurrency(withProfit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {draft.sections.map((s) => (
        <section key={s.id} className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">{s.heading}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{s.wordCount} words</div>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-200">{s.body}</p>
        </section>
      ))}

      {latestRun ? (
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Compliance check · {formatDate(latestRun.runAt)}</div>
              <div className="text-sm text-slate-300">{latestRun.summary}</div>
            </div>
            <StatusBadge status={latestRun.overall} />
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No items."
              columns={[
                { header: "Category" },
                { header: "Requirement" },
                { header: "Outcome" },
                { header: "Evidence" },
              ]}
              rows={latestRun.items.map((i) => ({
                key: i.id,
                cells: [
                  { sort: i.category, node: i.category },
                  { sort: i.requirement, node: i.requirement },
                  { sort: i.outcome, node: <StatusBadge status={i.outcome} /> },
                  { sort: i.evidence ?? "", tdClassName: "text-xs text-slate-400", node: i.evidence ?? "—" },
                ],
              }))}
            />
          </div>
        </section>
      ) : null}
    </DetailShell>
  );
}
