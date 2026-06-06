/* eslint-disable @next/next/no-html-link-for-pages --
   The CSV export links below point at /api/reports/* route handlers that
   stream a file download, not Next.js *pages*. A plain <a> is correct here;
   <Link> would attempt a client-side navigation and break the download. The
   rule matches the path shape and can't tell these are API routes. */
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import {
  wipReport,
  costToCompleteForecast,
  winRateAnalytics,
  bondingCapacityReport,
} from "@/lib/reports";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { addMoney } from "@/lib/money";

/**
 * Reports hub — surety-grade WIP, cost-to-complete, win rate, bonding
 * capacity, plus links to CSV exports for the rest. Tenant-scoped.
 */
export default async function ReportsPage() {
  const tenant = await requireTenant();
  const [wip, ctc, win, bonding] = await Promise.all([
    wipReport(tenant.id),
    costToCompleteForecast(tenant.id),
    winRateAnalytics(tenant.id),
    bondingCapacityReport(tenant.id),
  ]);

  // Aggregate CTC by cost code for a one-glance view.
  const ctcByCode = new Map<string, { budgeted: number; spent: number; committed: number; eac: number }>();
  for (const row of ctc) {
    const slot = ctcByCode.get(row.costCode) ?? { budgeted: 0, spent: 0, committed: 0, eac: 0 };
    slot.budgeted = addMoney(slot.budgeted, row.budgeted);
    slot.spent = addMoney(slot.spent, row.spent);
    slot.committed = addMoney(slot.committed, row.committed);
    slot.eac = addMoney(slot.eac, row.estimateAtCompletion);
    ctcByCode.set(row.costCode, slot);
  }
  const ctcSorted = Array.from(ctcByCode.entries()).sort((a, b) => b[1].eac - a[1].eac).slice(0, 15);

  return (
    <AppLayout eyebrow="Insights" title="Reports" description="Surety-grade WIP, cost-to-complete, bonding posture, and pipeline health. Export any report as CSV.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <Tile label="Backlog" value={formatCurrency(bonding.backlog)} sub="Contract − Billed" />
          <Tile label="Work in progress" value={formatCurrency(bonding.workInProgress)} sub="Costs − Billed" />
          <Tile label="Total contract value" value={formatCurrency(bonding.totalContractValue)} />
          <Tile label="Costs to date" value={formatCurrency(bonding.totalCostsToDate)} />
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Surety-grade WIP</div>
              <p className="mt-1 text-xs text-slate-400">Per-project earned revenue + over/under-billed for surety filings.</p>
            </div>
            <a href="/api/reports/wip?format=csv" className="btn-outline text-xs">Export CSV</a>
          </div>
          <SortableTable
            className="mt-4 min-w-full divide-y divide-white/10 text-sm"
            emptyMessage="No project P&L snapshots yet."
            columns={[
              { header: "Project", thClassName: "py-2 pr-4" },
              { header: "Contract", align: "right", thClassName: "py-2 pr-4" },
              { header: "% Complete", align: "right", thClassName: "py-2 pr-4" },
              { header: "Earned", align: "right", thClassName: "py-2 pr-4" },
              { header: "Billed", align: "right", thClassName: "py-2 pr-4" },
              { header: "Over", align: "right", thClassName: "py-2 pr-4" },
              { header: "Under", align: "right", thClassName: "py-2 pr-4" },
              { header: "Forecast GM", align: "right", thClassName: "py-2 pr-4" },
            ]}
            rows={wip.map((r) => ({
              key: r.projectId,
              className: "hover:bg-white/5",
              cells: [
                { sort: r.projectName, node: r.projectName, tdClassName: "py-2 pr-4 text-white" },
                { sort: r.contractValue, node: formatCurrency(r.contractValue), tdClassName: "py-2 pr-4 text-slate-300" },
                { sort: r.percentComplete, node: formatPercent(r.percentComplete * 100), tdClassName: "py-2 pr-4 text-slate-300" },
                { sort: r.earnedRevenue, node: formatCurrency(r.earnedRevenue), tdClassName: "py-2 pr-4 text-slate-300" },
                { sort: r.billedToDate, node: formatCurrency(r.billedToDate), tdClassName: "py-2 pr-4 text-slate-300" },
                { sort: r.overBilled, node: r.overBilled > 0 ? formatCurrency(r.overBilled) : "—", tdClassName: "py-2 pr-4 text-amber-300" },
                { sort: r.underBilled, node: r.underBilled > 0 ? formatCurrency(r.underBilled) : "—", tdClassName: "py-2 pr-4 text-rose-300" },
                { sort: r.forecastGrossMargin, node: formatCurrency(r.forecastGrossMargin), tdClassName: "py-2 pr-4 text-emerald-300" },
              ],
            }))}
          />
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Cost-to-complete (top 15 codes)</div>
              <p className="mt-1 text-xs text-slate-400">Across all projects, by cost code.</p>
            </div>
            <a href="/api/reports/cost-to-complete?format=csv" className="btn-outline text-xs">Export CSV</a>
          </div>
          <SortableTable
            className="mt-4 min-w-full divide-y divide-white/10 text-sm"
            emptyMessage="No budget lines yet."
            columns={[
              { header: "Cost code", thClassName: "py-2 pr-4" },
              { header: "Budgeted", align: "right", thClassName: "py-2 pr-4" },
              { header: "Spent", align: "right", thClassName: "py-2 pr-4" },
              { header: "Committed", align: "right", thClassName: "py-2 pr-4" },
              { header: "EAC", align: "right", thClassName: "py-2 pr-4" },
            ]}
            rows={ctcSorted.map(([code, s]) => ({
              key: code,
              cells: [
                { sort: code, node: code, tdClassName: "py-2 pr-4 font-mono text-xs text-cyan-200" },
                { sort: s.budgeted, node: formatCurrency(s.budgeted), tdClassName: "py-2 pr-4" },
                { sort: s.spent, node: formatCurrency(s.spent), tdClassName: "py-2 pr-4" },
                { sort: s.committed, node: formatCurrency(s.committed), tdClassName: "py-2 pr-4" },
                { sort: s.eac, node: formatCurrency(s.eac), tdClassName: "py-2 pr-4 text-white" },
              ],
            }))}
          />
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Win rate by owner</div>
              <p className="mt-1 text-xs text-slate-400">Bid win rate by PM / estimator over the trailing pipeline.</p>
            </div>
            <a href="/api/reports/win-rate?format=csv" className="btn-outline text-xs">Export CSV</a>
          </div>
          <SortableTable
            className="mt-4 min-w-full divide-y divide-white/10 text-sm"
            emptyMessage="No opportunities yet."
            columns={[
              { header: "Owner", thClassName: "py-2 pr-4" },
              { header: "Total bids", align: "right", thClassName: "py-2 pr-4" },
              { header: "Won", align: "right", thClassName: "py-2 pr-4" },
              { header: "Lost", align: "right", thClassName: "py-2 pr-4" },
              { header: "Win rate", align: "right", thClassName: "py-2 pr-4" },
            ]}
            rows={win.byOwner.map((r) => ({
              key: r.scope,
              cells: [
                { sort: r.scope, node: r.scope, tdClassName: "py-2 pr-4" },
                { sort: r.total, node: r.total, tdClassName: "py-2 pr-4" },
                { sort: r.won, node: r.won, tdClassName: "py-2 pr-4 text-emerald-300" },
                { sort: r.lost, node: r.lost, tdClassName: "py-2 pr-4 text-rose-300" },
                { sort: r.winRate, node: formatPercent(r.winRate * 100), tdClassName: "py-2 pr-4" },
              ],
            }))}
          />
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Ball-in-court aging</div>
              <p className="mt-1 text-xs text-slate-400">Open RFIs + submittals across the portfolio, by who owes the next move and how long it has waited.</p>
            </div>
            <div className="flex gap-2">
              <a href="/reports/ball-in-court" className="btn-primary text-xs">Open</a>
              <a href="/api/reports/ball-in-court?format=csv" className="btn-outline text-xs">Export CSV</a>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Change exposure (RFI → CO)</div>
              <p className="mt-1 text-xs text-slate-400">RFI-flagged cost impacts traced through change orders. Surfaces uncaptured exposure not yet converted into a billable CO.</p>
            </div>
            <div className="flex gap-2">
              <a href="/reports/change-exposure" className="btn-primary text-xs">Open</a>
              <a href="/api/reports/change-exposure?format=csv" className="btn-outline text-xs">Export CSV</a>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">More reports</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 text-xs">
            <a href="/api/reports/margin-fade?format=csv" className="panel p-3 hover:border-cyan-500/40">Margin-fade trend (CSV)</a>
            <a href="/api/reports/estimate-accuracy?format=csv" className="panel p-3 hover:border-cyan-500/40">Estimate-accuracy (CSV)</a>
            <a href="/api/reports/resource-heatmap?format=csv" className="panel p-3 hover:border-cyan-500/40">Resource heatmap, 8 weeks (CSV)</a>
            <a href="/api/reports/bonding-capacity?format=csv" className="panel p-3 hover:border-cyan-500/40">Bonding capacity (CSV)</a>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}
