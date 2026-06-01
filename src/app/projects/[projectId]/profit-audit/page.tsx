import { notFound } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import { sumMoney, subtractMoney, addMoney, toNum } from "@/lib/money";
import { approvedCoValue, pendingCoValue } from "@/lib/change-order-totals";

/**
 * Bid-vs-execution profit audit. The full money lifecycle for one
 * job, in one view:
 *
 *   1. Bid summary    — what we estimated, what we won
 *   2. Contract       — original + approved COs + pending COs
 *   3. Execution      — billed, cost-to-date, committed, EAC
 *   4. Variance       — bid line vs current actual by cost code
 *   5. Profit audit   — forecast GM at bid vs current; fade trend
 *   6. Commissions    — accruals tied to this project / opportunity
 *
 * Surfaces under the "Profit audit" project tab.
 */
export default async function ProfitAuditPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: {
      pnlSnapshot: true,
      changeOrders: true,
      budgets: { include: { lines: true } },
      opportunities: { include: { bidDrafts: { include: { lineItems: true } } } },
    },
  });
  if (!project) notFound();

  // Find commissions tied to this project (via Opportunity.id matching
  // sourceId on CommissionAccrual).
  const opportunityIds = project.opportunities.map((o) => o.id);
  const commissions = opportunityIds.length > 0
    ? await prisma.commissionAccrual.findMany({
        where: { tenantId: tenant.id, sourceId: { in: opportunityIds } },
        include: { rule: true },
        orderBy: { earnedAt: "desc" },
      })
    : [];

  // Bid summary
  const opportunity = project.opportunities[0] ?? null;
  const bidDraft = opportunity?.bidDrafts[0] ?? null;
  const bidEstimate = toNum(opportunity?.estimatedValue);
  const bidLineTotal = bidDraft ? sumMoney(bidDraft.lineItems.map((l) => l.amount)) : 0;
  const awardedAt = opportunity?.awardDate ?? null;

  // Contract evolution
  const originalContract = toNum(project.contractValue);
  const approvedCOValue = approvedCoValue(project.changeOrders);
  const pendingCOValue = pendingCoValue(project.changeOrders);
  const currentContractValue = addMoney(originalContract, approvedCOValue);

  // Execution
  const pnl = project.pnlSnapshot;
  const billedToDate = toNum(pnl?.billedToDate);
  const costsToDate = toNum(pnl?.costsToDate);
  const committedCost = toNum(pnl?.committedCost);
  const forecastFinalCost = pnl?.forecastFinalCost == null ? costsToDate : toNum(pnl.forecastFinalCost);
  const forecastGM = pnl?.forecastGrossMargin == null ? subtractMoney(currentContractValue, forecastFinalCost) : toNum(pnl.forecastGrossMargin);
  const percentComplete = pnl?.percentComplete == null ? (forecastFinalCost > 0 ? (costsToDate / forecastFinalCost) * 100 : 0) : toNum(pnl.percentComplete);

  // Margin at bid vs now
  const marginAtBid = bidLineTotal > 0 ? subtractMoney(bidEstimate, bidLineTotal) : null;
  const marginPctAtBid = marginAtBid != null && bidEstimate > 0 ? (marginAtBid / bidEstimate) : null;
  const marginNow = subtractMoney(currentContractValue, forecastFinalCost);
  const marginPctNow = currentContractValue > 0 ? marginNow / currentContractValue : 0;
  const fade = marginAtBid != null ? subtractMoney(marginNow, marginAtBid) : null;

  // Variance by cost code — bid line vs current budget actual
  const bidByCode = new Map<string, number>();
  if (bidDraft) {
    for (const item of bidDraft.lineItems) {
      const k = item.costCode ?? item.description;
      bidByCode.set(k, addMoney(bidByCode.get(k) ?? 0, item.amount ?? 0));
    }
  }
  const actualByCode = new Map<string, { budget: number; actual: number; committed: number }>();
  for (const b of project.budgets) {
    for (const line of b.lines) {
      const k = line.code ?? line.description;
      const slot = actualByCode.get(k) ?? { budget: 0, actual: 0, committed: 0 };
      slot.budget = addMoney(slot.budget, line.budgetAmount ?? 0);
      slot.actual = addMoney(slot.actual, line.actualCost ?? 0);
      slot.committed = addMoney(slot.committed, line.committedCost ?? 0);
      actualByCode.set(k, slot);
    }
  }
  const allCodes = new Set([...bidByCode.keys(), ...actualByCode.keys()]);
  const varianceRows = Array.from(allCodes).map((code) => {
    const bid = bidByCode.get(code) ?? 0;
    const a = actualByCode.get(code) ?? { budget: 0, actual: 0, committed: 0 };
    const eac = addMoney(a.actual, a.committed);
    const variance = subtractMoney(eac, bid > 0 ? bid : a.budget);
    return { code, bid, budget: a.budget, actual: a.actual, committed: a.committed, eac, variance };
  }).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  const totalCommissions = sumMoney(commissions.map((c) => c.amount));
  const commissionsPaid = sumMoney(commissions.filter((c) => c.status === "PAID").map((c) => c.amount));
  const commissionsAccrued = sumMoney(commissions.filter((c) => c.status === "ACCRUED" || c.status === "PENDING_APPROVAL" || c.status === "APPROVED").map((c) => c.amount));

  return (
    <AppLayout
      eyebrow={`${project.code} · Profit audit`}
      title={project.name}
      description="Full money lifecycle: what we bid, what we contracted, how it's executing, where the margin moved, and what commissions accrued."
    >
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="profit-audit" mode={project.mode} />

        {/* Top tile bar — money at-a-glance */}
        <section className="grid gap-4 md:grid-cols-4">
          <Tile label="Bid estimate" value={formatCurrency(bidEstimate)} sub={awardedAt ? `awarded ${formatDate(awardedAt)}` : "no opportunity link"} />
          <Tile label="Current contract" value={formatCurrency(currentContractValue)} sub={`${formatCurrency(approvedCOValue)} approved COs`} />
          <Tile label="Forecast cost" value={formatCurrency(forecastFinalCost)} sub={`${formatCurrency(committedCost)} committed`} tone={forecastFinalCost > currentContractValue ? "warn" : "default"} />
          <Tile label="Forecast margin" value={formatCurrency(marginNow)} sub={formatPercent(marginPctNow * 100)} tone={marginNow >= 0 ? "good" : "bad"} />
        </section>

        {/* Bid vs contract vs execution lifecycle */}
        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Money lifecycle</div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Stage title="At bid" stage="BID">
              <Row label="Estimate" value={formatCurrency(bidEstimate)} />
              <Row label="Bid line items total" value={formatCurrency(bidLineTotal)} />
              {marginAtBid != null ? (
                <>
                  <Row label="Anticipated margin" value={formatCurrency(marginAtBid)} />
                  <Row label="Anticipated margin %" value={formatPercent((marginPctAtBid ?? 0) * 100)} />
                </>
              ) : (
                <div className="text-xs text-slate-500">No bid draft line items linked.</div>
              )}
            </Stage>
            <Stage title="At contract" stage="CONTRACT">
              <Row label="Original contract" value={formatCurrency(originalContract)} />
              <Row label="Approved COs (+/-)" value={formatCurrency(approvedCOValue)} />
              <Row label="Pending COs" value={formatCurrency(pendingCOValue)} sub="not yet executed" />
              <Row label="Current contract" value={formatCurrency(currentContractValue)} bold />
            </Stage>
            <Stage title="In execution" stage="EXEC">
              <Row label="% complete" value={formatPercent(percentComplete)} />
              <Row label="Billed to date" value={formatCurrency(billedToDate)} />
              <Row label="Cost to date" value={formatCurrency(costsToDate)} />
              <Row label="Committed" value={formatCurrency(committedCost)} />
              <Row label="EAC final cost" value={formatCurrency(forecastFinalCost)} bold />
            </Stage>
          </div>
        </section>

        {/* Profit audit / fade */}
        <section className="card p-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Profit audit</div>
              <p className="mt-1 text-xs text-slate-400">Margin at bid vs current. Negative fade = profit erosion since award.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Tile label="Margin at bid" value={marginAtBid != null ? formatCurrency(marginAtBid) : "—"} sub={marginPctAtBid != null ? formatPercent(marginPctAtBid * 100) : "no bid baseline"} />
            <Tile label="Margin now" value={formatCurrency(marginNow)} sub={formatPercent(marginPctNow * 100)} tone={marginNow >= 0 ? "good" : "bad"} />
            <Tile label="Fade" value={fade != null ? formatCurrency(fade) : "—"} sub={fade != null ? (fade < 0 ? "↓ erosion" : "↑ improvement") : ""} tone={fade == null ? "default" : fade < 0 ? "bad" : "good"} />
          </div>
        </section>

        {/* Variance by cost code — bid vs actual */}
        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Variance by cost code</div>
          <p className="mt-1 text-xs text-slate-400">Bid line vs current budget actual. Sorted by absolute variance.</p>
          <SortableTable
            className="mt-4 min-w-full divide-y divide-white/10 text-sm"
            emptyMessage="No bid lines or budget rows yet."
            columns={[
              { header: "Cost code" },
              { header: "Bid", align: "right" },
              { header: "Budget", align: "right" },
              { header: "Actual", align: "right" },
              { header: "Committed", align: "right" },
              { header: "EAC", align: "right" },
              { header: "Variance", align: "right" },
            ]}
            rows={varianceRows.slice(0, 20).map((r) => ({
              key: r.code,
              cells: [
                { sort: r.code, node: r.code, tdClassName: "font-mono text-xs" },
                { sort: r.bid, node: formatCurrency(r.bid), tdClassName: "text-slate-300" },
                { sort: r.budget, node: formatCurrency(r.budget), tdClassName: "text-slate-300" },
                { sort: r.actual, node: formatCurrency(r.actual), tdClassName: "text-slate-300" },
                { sort: r.committed, node: formatCurrency(r.committed), tdClassName: "text-slate-300" },
                { sort: r.eac, node: formatCurrency(r.eac), tdClassName: "text-white" },
                { sort: r.variance, node: r.variance === 0 ? "—" : formatCurrency(r.variance), tdClassName: r.variance > 0 ? "text-rose-300" : r.variance < 0 ? "text-emerald-300" : "text-slate-400" },
              ],
            }))}
          />
          {varianceRows.length > 20 ? <div className="mt-2 text-xs text-slate-500">Showing top 20 by variance · {varianceRows.length} total cost codes.</div> : null}
        </section>

        {/* Commission accruals */}
        <section className="card p-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Commissions tied to this job</div>
              <p className="mt-1 text-xs text-slate-400">Linked via the project&apos;s Opportunity record. Manage rules at <Link href="/finance/commissions" className="text-cyan-300 hover:underline">/finance/commissions</Link>.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Tile label="Total accrued" value={formatCurrency(totalCommissions)} sub={`${commissions.length} entries`} />
            <Tile label="Already paid" value={formatCurrency(commissionsPaid)} tone="good" />
            <Tile label="Open / pending" value={formatCurrency(commissionsAccrued)} tone={commissionsAccrued > 0 ? "warn" : "default"} />
          </div>
          <SortableTable
            className="mt-4 min-w-full divide-y divide-white/10 text-sm"
            emptyMessage={<>No commissions on file for this project. {opportunity ? `Linked opportunity: ${opportunity.name}` : "Project has no opportunity link."}</>}
            columns={[
              { header: "Recipient" },
              { header: "Source" },
              { header: "Basis", align: "right" },
              { header: "Rate", align: "right" },
              { header: "Amount", align: "right" },
              { header: "Status" },
            ]}
            rows={commissions.map((c) => ({
              key: c.id,
              cells: [
                { sort: c.recipientName, node: c.recipientName, tdClassName: "text-white" },
                { sort: c.sourceLabel ?? c.sourceType, node: c.sourceLabel ?? c.sourceType, tdClassName: "text-xs text-slate-400" },
                { sort: toNum(c.basis), node: formatCurrency(c.basis), tdClassName: "text-slate-300" },
                { sort: toNum(c.ratePct), node: formatPercent(c.ratePct), tdClassName: "text-slate-300" },
                { sort: toNum(c.amount), node: formatCurrency(c.amount), tdClassName: "text-white" },
                { sort: c.status, node: c.status, tdClassName: "text-xs" },
              ],
            }))}
          />
        </section>

        {/* Quick links to related views */}
        <section className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Drill in</div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Link href={`/projects/${project.id}/financials`} className="btn-outline">Financials (P&L)</Link>
            <Link href={`/projects/${project.id}/change-orders`} className="btn-outline">Change orders ({project.changeOrders.length})</Link>
            <Link href={`/projects/${project.id}/pay-apps`} className="btn-outline">Pay apps</Link>
            <Link href={`/projects/${project.id}/sub-invoices`} className="btn-outline">Sub invoices</Link>
            <Link href={`/projects/${project.id}/contracts`} className="btn-outline">Contracts</Link>
            <Link href={`/projects/${project.id}/bids`} className="btn-outline">Bid packages</Link>
            <Link href={`/projects/${project.id}/compliance`} className="btn-outline">Compliance</Link>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "good" | "warn" | "bad" | "default" }) {
  const color = tone === "warn" ? "text-amber-300" : tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-white";
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function Stage({ title, stage, children }: { title: string; stage: "BID" | "CONTRACT" | "EXEC"; children: React.ReactNode }) {
  const tone = stage === "BID" ? "border-violet-500/30 bg-violet-500/5" : stage === "CONTRACT" ? "border-cyan-500/30 bg-cyan-500/5" : "border-emerald-500/30 bg-emerald-500/5";
  return (
    <div className={`rounded-2xl border p-5 ${tone}`}>
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{title}</div>
      <div className="mt-3 space-y-2 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value, sub, bold }: { label: string; value: string; sub?: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-sm ${bold ? "text-white font-semibold" : "text-slate-200"}`}>
        {value}
        {sub ? <span className="ml-2 text-[10px] text-slate-500">({sub})</span> : null}
      </span>
    </div>
  );
}
