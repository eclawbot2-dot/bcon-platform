import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { addMoney, toNum } from "@/lib/money";

function bucketize(days: number): "current" | "1-30" | "31-60" | "61-90" | "90+" {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export default async function ApAgingPage() {
  const tenant = await requireTenant();
  const invoices = await prisma.subInvoice.findMany({
    where: { project: { tenantId: tenant.id }, status: { notIn: ["PAID", "REJECTED"] } },
    include: { vendor: true, project: true },
    orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }],
  });

  const today = new Date();
  const totals: Record<string, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  const rows = invoices.map((i) => {
    const due = i.dueDate ?? i.invoiceDate;
    const daysPast = Math.floor((today.getTime() - new Date(due).getTime()) / (1000 * 60 * 60 * 24));
    const bucket = bucketize(daysPast);
    totals[bucket] = addMoney(totals[bucket], i.netDue);
    return { ...i, daysPast, bucket };
  });
  const totalOutstanding = Object.values(totals).reduce((s, v) => s + v, 0);

  return (
    <AppLayout eyebrow="CFO · Accounts payable" title="AP aging" description="Every unpaid sub-invoice bucketed by how far past due. Tells you exactly who to pay, how much, and when.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-5">
          <StatTile label="Current / not yet due" value={formatCurrency(totals.current)} tone="good" />
          <StatTile label="1-30 days" value={formatCurrency(totals["1-30"])} tone={totals["1-30"] > 0 ? "warn" : "good"} />
          <StatTile label="31-60 days" value={formatCurrency(totals["31-60"])} tone={totals["31-60"] > 0 ? "warn" : "good"} />
          <StatTile label="61-90 days" value={formatCurrency(totals["61-90"])} tone={totals["61-90"] > 0 ? "bad" : "good"} />
          <StatTile label="90+ days" value={formatCurrency(totals["90+"])} tone={totals["90+"] > 0 ? "bad" : "good"} />
        </section>
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Total outstanding</div>
              <div className="mt-1 min-w-0 truncate text-3xl font-semibold tabular-nums text-white" title={formatCurrency(totalOutstanding)}>{formatCurrency(totalOutstanding)}</div>
            </div>
            <div className="flex gap-2 text-xs text-slate-400">
              <Link href="/finance" className="btn-outline">Back to finance</Link>
              <Link href="/finance/journal" className="btn-outline">Journal</Link>
              <a href="/api/export/ap-aging" className="btn-outline">Export CSV</a>
            </div>
          </div>
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No outstanding sub invoices."
              columns={[
                { header: "Vendor" },
                { header: "Project" },
                { header: "Invoice #" },
                { header: "Invoice date" },
                { header: "Due" },
                { header: "Days past due" },
                { header: "Bucket" },
                { header: "Amount" },
                { header: "Net due" },
                { header: "Waiver" },
                { header: "Status" },
              ]}
              rows={rows.map((r) => ({
                key: r.id,
                className: "transition hover:bg-white/5",
                cells: [
                  { sort: r.vendor.name, node: <Link href={`/vendors/${r.vendor.id}`} className="text-cyan-300 hover:underline">{r.vendor.name}</Link> },
                  { sort: r.project.code, node: <Link href={`/projects/${r.project.id}/sub-invoices/${r.id}`} className="text-cyan-300 hover:underline">{r.project.code}</Link> },
                  { sort: r.invoiceNumber, node: r.invoiceNumber, tdClassName: "font-mono text-xs" },
                  { sort: new Date(r.invoiceDate).getTime(), node: formatDate(r.invoiceDate), tdClassName: "text-slate-400" },
                  { sort: r.dueDate ? new Date(r.dueDate).getTime() : null, node: formatDate(r.dueDate) },
                  { sort: r.daysPast, node: <span className={r.daysPast > 60 ? "text-rose-300" : r.daysPast > 30 ? "text-amber-300" : r.daysPast > 0 ? "text-slate-300" : "text-emerald-300"}>{r.daysPast}d</span> },
                  { sort: r.bucket, node: <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">{r.bucket}</span> },
                  { sort: toNum(r.amount), node: formatCurrency(r.amount) },
                  { sort: toNum(r.netDue), node: formatCurrency(r.netDue) },
                  { sort: r.waiverReceived ? "Received" : "Pending", node: r.waiverReceived ? <StatusBadge tone="good" label="Received" /> : <StatusBadge tone="warn" label="Pending" /> },
                  { sort: r.status, node: <StatusBadge status={r.status} /> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
