import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toNum } from "@/lib/money";

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const tenant = await requireTenant();
  const sp = await searchParams;
  const where: Record<string, unknown> = { tenantId: tenant.id };
  if (sp.status) where.reconciliationStatus = sp.status;
  const [entries, projects, counts] = await Promise.all([
    prisma.journalEntryRow.findMany({ where, include: { project: true }, orderBy: { entryDate: "desc" }, take: 300 }),
    prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, code: true, name: true } }),
    prisma.journalEntryRow.groupBy({ by: ["reconciliationStatus"], where: { tenantId: tenant.id }, _count: { _all: true } }),
  ]);
  const statusMap = Object.fromEntries(counts.map((c) => [c.reconciliationStatus, c._count._all]));

  return (
    <AppLayout eyebrow="CFO · Journal" title="Journal entries" description="Every synced Xero journal row with project + cost-code allocation. Confirm AI suggestions or reassign.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-5">
          <StatTile label="Unreviewed" value={statusMap.UNREVIEWED ?? 0} href="/finance/journal?status=UNREVIEWED" tone={(statusMap.UNREVIEWED ?? 0) > 0 ? "warn" : "good"} />
          <StatTile label="AI suggested" value={statusMap.SUGGESTED ?? 0} href="/finance/journal?status=SUGGESTED" tone="warn" />
          <StatTile label="Confirmed" value={statusMap.CONFIRMED ?? 0} href="/finance/journal?status=CONFIRMED" tone="good" />
          <StatTile label="Needs input" value={statusMap.NEEDS_INPUT ?? 0} href="/finance/journal?status=NEEDS_INPUT" tone="bad" />
          <StatTile label="Rejected" value={statusMap.REJECTED ?? 0} href="/finance/journal?status=REJECTED" />
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No journal rows yet. Connect Xero or QuickBooks Online and run a sync."
              columns={[
                { header: "Date" },
                { header: "Source" },
                { header: "Account" },
                { header: "Memo" },
                { header: "Vendor" },
                { header: "Amount" },
                { header: "Project" },
                { header: "Cost code" },
                { header: "Status" },
                { header: "Confidence" },
                { header: "", sortable: false },
              ]}
              rows={entries.map((e) => {
                const sourceLabel = e.source === "qbo-sync" ? "QBO" : e.source === "xero-sync" ? "Xero" : e.source === "email-inbox" ? "Inbox" : e.source === "manual" ? "Manual" : e.source;
                const sourceClass = e.source === "qbo-sync" ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/30" : e.source === "xero-sync" ? "bg-sky-500/10 text-sky-200 border-sky-500/30" : e.source === "email-inbox" ? "bg-amber-500/10 text-amber-200 border-amber-500/30" : "bg-white/5 text-slate-300 border-white/10";
                return {
                  key: e.id,
                  className: "align-top transition hover:bg-white/5",
                  cells: [
                    { sort: new Date(e.entryDate).getTime(), node: formatDate(e.entryDate), tdClassName: "text-slate-400" },
                    { sort: sourceLabel, node: <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${sourceClass}`}>{sourceLabel}</span> },
                    { sort: `${e.accountName} ${e.accountCode}`, node: <><div>{e.accountName}</div><div className="font-mono text-[10px] text-slate-500">{e.accountCode}</div></> },
                    { sort: e.memo ?? "", node: e.memo, tdClassName: "max-w-[260px]" },
                    { sort: e.vendorName ?? "", node: e.vendorName ?? "—", tdClassName: "text-slate-400" },
                    { sort: toNum(e.amount), node: formatCurrency(e.amount), tdClassName: "font-medium " + (toNum(e.amount) < 0 ? "text-rose-200" : "text-emerald-200") },
                    { sort: e.project?.code ?? "", node: e.project ? <Link href={`/projects/${e.project.id}/financials`} className="text-cyan-300 hover:underline">{e.project.code}</Link> : <span className="text-slate-500">—</span> },
                    { sort: e.costCode ?? "", node: e.costCode ?? "—", tdClassName: "font-mono text-xs text-slate-400" },
                    { sort: e.reconciliationStatus, node: <StatusBadge status={e.reconciliationStatus} /> },
                    { sort: e.allocationConfidence ?? null, node: e.allocationConfidence !== null ? `${e.allocationConfidence}%` : "—", tdClassName: "text-slate-400" },
                    {
                      node: (
                        <form action={`/api/journal/${e.id}/assign`} method="post" className="flex flex-wrap gap-1">
                          <select name="projectId" defaultValue={e.projectId ?? ""} className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white">
                            <option value="">— unassigned —</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                          </select>
                          <input name="costCode" defaultValue={e.costCode ?? ""} placeholder="code" className="w-20 rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white" />
                          <button name="status" value="CONFIRMED" className="btn-primary text-[10px] px-2 py-1">Confirm</button>
                          <button name="status" value="NEEDS_INPUT" className="btn-outline text-[10px] px-2 py-1">Flag</button>
                        </form>
                      ),
                    },
                  ],
                };
              })}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
