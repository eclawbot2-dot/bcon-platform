import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { sumMoney, subtractMoney, multiplyMoney, toNum } from "@/lib/money";

export default async function FinanceHubPage() {
  const tenant = await requireTenant();
  const [xero, qbo, inbox, statements, snapshots, unreconciled, flagged] = await Promise.all([
    prisma.xeroConnection.findUnique({ where: { tenantId: tenant.id } }),
    prisma.qboConnection.findUnique({ where: { tenantId: tenant.id } }),
    prisma.invoiceInboxConnection.findUnique({ where: { tenantId: tenant.id } }),
    prisma.financialStatement.findMany({ where: { tenantId: tenant.id, statementType: "INCOME_STATEMENT" }, orderBy: { periodStart: "desc" }, take: 12 }),
    prisma.projectPnlSnapshot.findMany({ where: { project: { tenantId: tenant.id } }, include: { project: true }, orderBy: { updatedAt: "desc" } }),
    prisma.journalEntryRow.count({ where: { tenantId: tenant.id, reconciliationStatus: "UNREVIEWED" } }),
    prisma.journalEntryRow.count({ where: { tenantId: tenant.id, reconciliationStatus: "NEEDS_INPUT" } }),
  ]);

  const ytdRevenue = sumMoney(statements.map((st) => st.revenue));
  const ytdCogs = sumMoney(statements.map((st) => st.cogs));
  const ytdOpex = sumMoney(statements.map((st) => st.opex));
  const ytdEbitda = sumMoney(statements.map((st) => st.ebitda));
  const ytdMargin = ytdRevenue > 0 ? (ytdEbitda / ytdRevenue) * 100 : 0;

  const totalBilled = sumMoney(snapshots.map((p) => p.billedToDate));
  const totalCost = sumMoney(snapshots.map((p) => p.costsToDate));
  const backlog = sumMoney(snapshots.map((p) => subtractMoney(p.totalContractValue, p.billedToDate)));
  const overbilled = sumMoney(snapshots.filter((p) => toNum(p.wipOverUnder) > 0).map((p) => p.wipOverUnder));
  const underbilled = sumMoney(snapshots.filter((p) => toNum(p.wipOverUnder) < 0).map((p) => Math.abs(toNum(p.wipOverUnder))));

  return (
    <AppLayout eyebrow="CFO · Finance hub" title="Financial operations" description="Xero-synced income statements, project-level P&amp;L, AI cost reconciliation, and invoice inbox monitoring.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Trailing 12mo revenue" value={formatCurrency(ytdRevenue)} tone="good" />
          <StatTile label="Trailing 12mo EBITDA" value={formatCurrency(ytdEbitda)} sub={`${ytdMargin.toFixed(1)}% margin`} tone={ytdMargin >= 10 ? "good" : "warn"} />
          <StatTile label="Backlog (contract - billed)" value={formatCurrency(backlog)} />
          <StatTile label="Unreconciled journal rows" value={unreconciled + flagged} sub={`${unreconciled} unreviewed · ${flagged} needs input`} tone={unreconciled + flagged > 0 ? "warn" : "good"} href="/finance/journal" />
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Billed to date (portfolio)" value={formatCurrency(totalBilled)} />
          <StatTile label="Costs to date (portfolio)" value={formatCurrency(totalCost)} />
          <StatTile label="Cash position est." value={formatCurrency(sumMoney([totalBilled, -totalCost, sumMoney(snapshots.map((p) => multiplyMoney(p.totalContractValue, 0.10)))]))} sub="billed - costs + retainage equiv." tone="good" />
          <StatTile label="Overbilled / underbilled" value={`${formatCurrency(overbilled)} / ${formatCurrency(underbilled)}`} tone="warn" href="/finance/ap-aging" />
        </section>
        <section className="flex flex-wrap gap-3">
          <Link href="/finance/ai" className="btn-primary text-xs">AI toolkit →</Link>
          <Link href="/finance/ap-aging" className="btn-outline text-xs">Open AP aging →</Link>
          <Link href="/finance/journal" className="btn-outline text-xs">Journal</Link>
          <Link href="/finance/inbox" className="btn-outline text-xs">Invoice inbox</Link>
          <a href="/api/export/journal" className="btn-outline text-xs">Export journal CSV</a>
          <a href="/api/export/ap-aging" className="btn-outline text-xs">Export AP CSV</a>
        </section>

        <section className="card p-5 min-w-0 overflow-hidden">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Data quality</div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div className="panel p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Xero sync</div>
              <div className="mt-1 text-sm text-white">{xero?.lastSyncedAt ? `Synced ${formatDate(xero.lastSyncedAt)}` : xero?.status === "CONNECTED" ? "Connected, never synced" : "Not connected"}</div>
              {xero?.lastSyncedAt && Date.now() - new Date(xero.lastSyncedAt).getTime() > 7 * 24 * 60 * 60 * 1000 ? <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-amber-300">Stale — run sync</div> : null}
            </div>
            <div className="panel p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">QBO sync</div>
              <div className="mt-1 text-sm text-white">{qbo?.lastSyncedAt ? `Synced ${formatDate(qbo.lastSyncedAt)}` : qbo?.status === "CONNECTED" ? "Connected, never synced" : "Not connected"}</div>
              {qbo?.lastSyncedAt && Date.now() - new Date(qbo.lastSyncedAt).getTime() > 7 * 24 * 60 * 60 * 1000 ? <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-amber-300">Stale — run sync</div> : null}
            </div>
            <div className="panel p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Invoice inbox</div>
              <div className="mt-1 text-sm text-white">{inbox?.lastPolledAt ? `Polled ${formatDate(inbox.lastPolledAt)}` : inbox?.status === "CONNECTED" ? "Connected, never polled" : "Not connected"}</div>
            </div>
            <div className="panel p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Unreconciled journal rows</div>
              <div className="mt-1 text-sm text-white">{unreconciled + flagged} rows awaiting action</div>
              {unreconciled + flagged > 0 ? <Link href="/finance/journal" className="mt-1 text-[10px] uppercase tracking-[0.18em] text-cyan-300">Review now →</Link> : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="card p-5 min-w-0 overflow-hidden">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Xero</div>
            <div className="mt-1 text-lg font-semibold text-white">{xero?.organizationName ?? "Not connected"}</div>
            <div className="text-xs text-slate-400">Status: <StatusBadge status={xero?.status ?? "DISCONNECTED"} /></div>
            {xero?.lastSyncedAt ? <div className="mt-1 text-xs text-slate-500">Last sync {formatDate(xero.lastSyncedAt)} · {xero.lastSyncNote}</div> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {xero?.status === "CONNECTED" ? (
                <>
                  <form action="/api/xero/connect" method="post">
                    <input type="hidden" name="action" value="sync" />
                    <button className="btn-primary text-xs">Sync now</button>
                  </form>
                  <form action="/api/xero/connect" method="post">
                    <input type="hidden" name="action" value="disconnect" />
                    <button className="btn-outline text-xs">Disconnect</button>
                  </form>
                </>
              ) : (
                <form action="/api/xero/connect" method="post">
                  <input type="hidden" name="action" value="connect" />
                  <button className="btn-primary text-xs">Connect Xero (demo)</button>
                </form>
              )}
            </div>
          </div>

          <div className="card p-5 min-w-0 overflow-hidden">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">QuickBooks Online</div>
            <div className="mt-1 text-lg font-semibold text-white">{qbo?.organizationName ?? "Not connected"}</div>
            <div className="text-xs text-slate-400">Status: <StatusBadge status={qbo?.status ?? "DISCONNECTED"} /></div>
            {qbo?.realmId ? <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">Realm {qbo.realmId} · {qbo.environment}</div> : null}
            {qbo?.lastSyncedAt ? <div className="mt-1 text-xs text-slate-500">Last sync {formatDate(qbo.lastSyncedAt)} · {qbo.lastSyncNote}</div> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {qbo?.status === "CONNECTED" ? (
                <>
                  <form action="/api/qbo/connect" method="post">
                    <input type="hidden" name="action" value="sync" />
                    <button className="btn-primary text-xs">Sync now</button>
                  </form>
                  <form action="/api/qbo/connect" method="post">
                    <input type="hidden" name="action" value="disconnect" />
                    <button className="btn-outline text-xs">Disconnect</button>
                  </form>
                </>
              ) : (
                <form action="/api/qbo/connect" method="post">
                  <input type="hidden" name="action" value="connect" />
                  <button className="btn-primary text-xs">Connect QBO (demo)</button>
                </form>
              )}
            </div>
            <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-slate-500">Pulls JournalEntry + ProfitAndLoss reports · Class / Customer:Job → project</div>
          </div>

          <div className="card p-5 min-w-0 overflow-hidden">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Invoice inbox</div>
            <div className="mt-1 text-lg font-semibold text-white">{inbox?.mailbox ?? "Not connected"}</div>
            <div className="text-xs text-slate-400">Status: <StatusBadge status={inbox?.status ?? "DISCONNECTED"} /></div>
            {inbox?.lastPolledAt ? <div className="mt-1 text-xs text-slate-500">Last poll {formatDate(inbox.lastPolledAt)} · {inbox.lastPollStatus}</div> : null}
            <div className="mt-4 flex gap-2">
              <Link href="/finance/inbox" className="btn-outline text-xs">Configure inbox →</Link>
              {inbox?.status === "CONNECTED" ? (
                <form action="/api/inbox/connect" method="post">
                  <input type="hidden" name="action" value="poll" />
                  <button className="btn-primary text-xs">Poll now</button>
                </form>
              ) : null}
            </div>
          </div>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Income statement — trailing months</div>
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No statements yet. Connect Xero + Sync."
              columns={[
                { header: "Period" },
                { header: "Revenue" },
                { header: "COGS" },
                { header: "Gross profit" },
                { header: "OpEx" },
                { header: "EBITDA" },
                { header: "Margin" },
              ]}
              rows={statements.map((st) => {
                const margin = toNum(st.revenue) > 0 ? (toNum(st.ebitda) / toNum(st.revenue)) * 100 : 0;
                return {
                  key: st.id,
                  cells: [
                    { sort: new Date(st.periodStart).getTime(), node: <>{formatDate(st.periodStart)} → {formatDate(st.periodEnd)}</> },
                    { sort: toNum(st.revenue), node: formatCurrency(st.revenue) },
                    { sort: toNum(st.cogs), node: formatCurrency(st.cogs) },
                    { sort: toNum(st.grossProfit), node: formatCurrency(st.grossProfit) },
                    { sort: toNum(st.opex), node: formatCurrency(st.opex) },
                    { sort: toNum(st.ebitda), node: formatCurrency(st.ebitda) },
                    { sort: margin, node: `${margin.toFixed(1)}%` },
                  ],
                };
              })}
            />
          </div>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Project P&L — portfolio</div>
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No P&L snapshots yet. Sync Xero."
              columns={[
                { header: "Project" },
                { header: "Contract value" },
                { header: "+COs" },
                { header: "Billed" },
                { header: "% complete" },
                { header: "Costs" },
                { header: "Forecast margin" },
                { header: "O/U billing" },
              ]}
              rows={snapshots.map((s) => ({
                key: s.id,
                className: "transition hover:bg-white/5",
                cells: [
                  { sort: `${s.project.code} ${s.project.name}`, node: <Link href={`/projects/${s.projectId}/financials`} className="text-cyan-300 hover:underline">{s.project.code} · {s.project.name}</Link> },
                  { sort: toNum(s.contractValue), node: formatCurrency(s.contractValue) },
                  { sort: toNum(s.approvedCOValue), node: formatCurrency(s.approvedCOValue) },
                  { sort: toNum(s.billedToDate), node: formatCurrency(s.billedToDate) },
                  { sort: toNum(s.percentComplete), node: `${toNum(s.percentComplete).toFixed(1)}%` },
                  { sort: toNum(s.costsToDate), node: formatCurrency(s.costsToDate) },
                  { sort: toNum(s.forecastGrossMargin), node: <span className={toNum(s.forecastGrossMargin) > 0 ? "text-emerald-300" : "text-rose-300"}>{formatCurrency(s.forecastGrossMargin)}</span> },
                  { sort: toNum(s.wipOverUnder), node: <span className={toNum(s.wipOverUnder) === 0 ? "text-slate-400" : toNum(s.wipOverUnder) > 0 ? "text-emerald-300" : "text-amber-300"}>{formatCurrency(s.wipOverUnder)}</span> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
