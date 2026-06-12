import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { sumMoney, addMoney, toNum } from "@/lib/money";

export default async function ProjectFinancialsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: {
      pnlSnapshot: true,
      journalEntries: { orderBy: { entryDate: "desc" }, take: 200 },
    },
  });
  if (!project) notFound();

  const pnl = project.pnlSnapshot;
  const journal = project.journalEntries; // capped display list (take: 200)

  // Headline totals must come from DB aggregates over ALL journal rows for this
  // project, not the take:200 display list — otherwise Revenue/Cost/Margin and the
  // cost-by-code panel silently understate once a project exceeds 200 entries.
  const [revAgg, costAgg, unreconciled, costByCodeGroups] = await Promise.all([
    prisma.journalEntryRow.aggregate({ where: { tenantId: tenant.id, projectId: project.id, entryType: "REVENUE" }, _sum: { amount: true } }),
    prisma.journalEntryRow.aggregate({ where: { tenantId: tenant.id, projectId: project.id, entryType: "COST_OF_GOODS" }, _sum: { amount: true } }),
    prisma.journalEntryRow.count({ where: { tenantId: tenant.id, projectId: project.id, reconciliationStatus: { in: ["UNREVIEWED", "NEEDS_INPUT"] } } }),
    prisma.journalEntryRow.groupBy({ by: ["costCode"], where: { tenantId: tenant.id, projectId: project.id, entryType: "COST_OF_GOODS" }, _sum: { amount: true } }),
  ]);
  const totalRev = sumMoney([revAgg._sum.amount]);
  const totalCost = Math.abs(sumMoney([costAgg._sum.amount]));
  const margin = totalRev > 0 ? ((totalRev - totalCost) / totalRev) * 100 : 0;
  const costByCode = costByCodeGroups.reduce<Record<string, number>>((acc, g) => {
    const k = g.costCode ?? "unassigned";
    acc[k] = addMoney(acc[k] ?? 0, Math.abs(toNum(g._sum.amount)));
    return acc;
  }, {});

  return (
    <AppLayout eyebrow={`${project.code} · P&L`} title={project.name} description="Project-level financials — contract value, billed vs earned, cost-to-date, forecast margin, WIP over/under billing.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="financials" mode={project.mode} />
        {pnl ? (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <StatTile label="Contract value" value={formatCurrency(pnl.totalContractValue)} sub={`orig ${formatCurrency(pnl.contractValue)} · COs ${formatCurrency(pnl.approvedCOValue)}`} />
              <StatTile label="Billed" value={formatCurrency(pnl.billedToDate)} tone="good" sub={`${toNum(pnl.percentComplete).toFixed(1)}% complete`} />
              <StatTile label="Cost to date" value={formatCurrency(pnl.costsToDate)} tone="warn" sub={`committed ${formatCurrency(pnl.committedCost)}`} />
              <StatTile label="Forecast margin" value={formatCurrency(pnl.forecastGrossMargin)} tone={toNum(pnl.forecastGrossMargin) > 0 ? "good" : "bad"} />
            </section>
            <section className="grid gap-4 md:grid-cols-3">
              <StatTile label="Over/under billing (WIP)" value={formatCurrency(pnl.wipOverUnder)} tone={toNum(pnl.wipOverUnder) > 0 ? "good" : toNum(pnl.wipOverUnder) < 0 ? "warn" : "default"} />
              <StatTile label="Forecast final cost" value={formatCurrency(pnl.forecastFinalCost)} />
              <StatTile label="Last reconciled" value={formatDate(pnl.lastReconciledAt)} />
            </section>
          </>
        ) : (
          <div className="card p-5 text-sm text-slate-400">No P&L snapshot yet. Visit <Link href="/finance" className="text-cyan-300 hover:underline">/finance</Link> and sync Xero to populate.</div>
        )}

        <section className="card p-5 min-w-0 overflow-hidden">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Cost by cost code</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {Object.entries(costByCode).map(([code, amt]) => (
              <div key={code} className="panel p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{code}</div>
                <div className="mt-1 min-w-0 truncate text-xl font-semibold tabular-nums text-white" title={formatCurrency(amt)}>{formatCurrency(amt)}</div>
              </div>
            ))}
            {Object.keys(costByCode).length === 0 ? <div className="text-sm text-slate-500">No cost allocations yet.</div> : null}
          </div>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">
            <div>Journal entries allocated to this project</div>
            <div className="flex gap-2 text-[10px] normal-case tracking-normal text-slate-500">
              <span>Revenue: {formatCurrency(totalRev)}</span>
              <span>· Cost: {formatCurrency(totalCost)}</span>
              <span>· Margin: {margin.toFixed(1)}%</span>
              <span>· Unreconciled: {unreconciled}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No journal entries allocated to this project yet."
              columns={[
                { header: "Date" },
                { header: "Account" },
                { header: "Memo" },
                { header: "Vendor" },
                { header: "Cost code" },
                { header: "Amount" },
                { header: "Conf." },
                { header: "Status" },
              ]}
              rows={journal.map((j) => ({
                key: j.id,
                cells: [
                  { sort: j.entryDate ? new Date(j.entryDate).getTime() : null, node: formatDate(j.entryDate), tdClassName: "text-slate-400" },
                  {
                    sort: j.accountName,
                    node: <>{j.accountName}<div className="font-mono text-[10px] text-slate-500">{j.accountCode}</div></>,
                  },
                  { sort: j.memo, node: j.memo, tdClassName: "max-w-[280px]" },
                  { sort: j.vendorName ?? "", node: j.vendorName ?? "—", tdClassName: "text-slate-400" },
                  { sort: j.costCode ?? "", node: j.costCode ?? "—", tdClassName: "font-mono text-xs text-slate-400" },
                  {
                    sort: toNum(j.amount),
                    node: formatCurrency(j.amount),
                    tdClassName: "font-medium " + (toNum(j.amount) < 0 ? "text-rose-200" : "text-emerald-200"),
                  },
                  { sort: j.allocationConfidence ?? null, node: j.allocationConfidence !== null ? `${j.allocationConfidence}%` : "—", tdClassName: "text-slate-400" },
                  { sort: j.reconciliationStatus, node: <StatusBadge status={j.reconciliationStatus} /> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
