/* eslint-disable @next/next/no-html-link-for-pages --
   The CSV export link points at the /api/reports/ball-in-court route handler
   that streams a file download, not a Next.js *page*. A plain <a> is correct;
   <Link> would attempt a client-side navigation and break the download. */
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { ballInCourtAgingReport } from "@/lib/reports";
import { AGING_BUCKETS, type AgingBucketKey } from "@/lib/ball-in-court";
import { requireTenant } from "@/lib/tenant";

/**
 * Ball-in-court aging — portfolio-wide. Surfaces every open RFI and
 * submittal, who currently owes the next action, and how long it has sat
 * there. Overdue-first so the program team can chase the right party.
 * Tenant-scoped via ballInCourtAgingReport.
 */
export const dynamic = "force-dynamic";

const BUCKET_TONE: Record<AgingBucketKey, string> = {
  "0-7": "text-emerald-300",
  "8-14": "text-amber-300",
  "15-30": "text-orange-300",
  "31+": "text-rose-300",
};

export default async function BallInCourtPage() {
  const tenant = await requireTenant();
  const { items, summary } = await ballInCourtAgingReport(tenant.id);

  return (
    <AppLayout
      eyebrow="Insights"
      title="Ball-in-court aging"
      description="Every open RFI and submittal across the portfolio, by who owes the next move and how long it has waited. Overdue items first."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-5">
          <Tile label="Open items" value={String(summary.totalOpen)} sub="RFIs + submittals" />
          <Tile label="Overdue" value={String(summary.overdue)} sub="Past SLA or due date" tone="text-rose-300" />
          <Tile label="With reviewer" value={String(summary.withReviewer)} sub="Awaiting design team" />
          <Tile label="With contractor" value={String(summary.withContractor)} sub="Our court" />
          <Tile label="Oldest" value={`${summary.oldestDays}d`} sub={`Avg ${summary.avgDaysOpen}d in court`} />
        </section>

        {/* grid-cols-1 keeps the implicit mobile column clamped to the
            container (minmax(0,1fr)) so the 4-up aging strip can't widen
            the page at 390px. */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="card p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Aging buckets</div>
            <p className="mt-1 text-xs text-slate-400">Open items by days in their current court.</p>
            <div className="mt-4 grid grid-cols-4 gap-3">
              {AGING_BUCKETS.map((b) => (
                <div key={b} className="panel p-3 text-center">
                  <div className={`text-2xl font-semibold ${BUCKET_TONE[b]}`}>{summary.byBucket[b]}</div>
                  <div className="mt-1 text-[0.65rem] uppercase tracking-wide text-slate-500">{b} days</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Who&apos;s holding the ball</div>
            <p className="mt-1 text-xs text-slate-400">Responsible parties with the most open work, worst-first.</p>
            <SortableTable
              className="mt-4 min-w-full divide-y divide-white/10 text-sm"
              emptyMessage="Nothing open — every RFI and submittal is closed."
              columns={[
                { header: "Responsible party", thClassName: "py-2 pr-4" },
                { header: "Open", align: "right", thClassName: "py-2 pr-4" },
                { header: "Overdue", align: "right", thClassName: "py-2 pr-4" },
                { header: "Oldest", align: "right", thClassName: "py-2 pr-4" },
              ]}
              rows={summary.byParty.slice(0, 12).map((p) => ({
                key: p.party,
                cells: [
                  { sort: p.party, node: p.party, tdClassName: "py-2 pr-4 text-white" },
                  { sort: p.open, node: p.open, tdClassName: "py-2 pr-4 text-slate-300" },
                  { sort: p.overdue, node: p.overdue > 0 ? p.overdue : "—", tdClassName: "py-2 pr-4 text-rose-300" },
                  { sort: p.maxDays, node: `${p.maxDays}d`, tdClassName: "py-2 pr-4 text-slate-300" },
                ],
              }))}
            />
          </div>
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Open items</div>
              <p className="mt-1 text-xs text-slate-400">Overdue first, then oldest. Click a column to re-sort.</p>
            </div>
            <a href="/api/reports/ball-in-court?format=csv" className="btn-outline text-xs">Export CSV</a>
          </div>
          <SortableTable
            className="mt-4 min-w-full divide-y divide-white/10 text-sm"
            emptyMessage="No open RFIs or submittals."
            columns={[
              { header: "Type", thClassName: "py-2 pr-4" },
              { header: "Number", thClassName: "py-2 pr-4" },
              { header: "Title", thClassName: "py-2 pr-4" },
              { header: "Project", thClassName: "py-2 pr-4" },
              { header: "Court", thClassName: "py-2 pr-4" },
              { header: "Responsible", thClassName: "py-2 pr-4" },
              { header: "Days", align: "right", thClassName: "py-2 pr-4" },
              { header: "Status", thClassName: "py-2 pr-4" },
            ]}
            rows={items.map((it) => ({
              key: `${it.type}:${it.id}`,
              className: it.overdue ? "bg-rose-500/5 hover:bg-rose-500/10" : "hover:bg-white/5",
              cells: [
                { sort: it.type, node: it.type, tdClassName: "py-2 pr-4 text-[0.7rem] uppercase tracking-wide text-slate-400" },
                {
                  sort: it.number,
                  node: (
                    <a
                      href={`/projects/${it.projectId}/${it.type === "RFI" ? "rfis" : "submittals"}`}
                      className="text-cyan-200 hover:underline"
                    >
                      {it.number}
                    </a>
                  ),
                  tdClassName: "py-2 pr-4 font-mono text-xs",
                },
                { sort: it.title, node: it.title, tdClassName: "py-2 pr-4 text-white max-w-xs truncate" },
                { sort: it.projectName, node: it.projectName, tdClassName: "py-2 pr-4 text-slate-300" },
                {
                  sort: it.court,
                  node: it.court === "REVIEWER" ? "Reviewer" : "Contractor",
                  tdClassName: "py-2 pr-4 text-slate-300",
                },
                { sort: it.responsibleParty, node: it.responsibleParty, tdClassName: "py-2 pr-4 text-slate-300" },
                {
                  sort: it.daysInCourt,
                  node: <span className={`font-semibold ${BUCKET_TONE[it.bucket]}`}>{it.daysInCourt}d</span>,
                  tdClassName: "py-2 pr-4",
                },
                {
                  sort: it.overdue ? `0${it.status}` : it.status,
                  node: it.overdue ? `${it.status} · OVERDUE` : it.status,
                  tdClassName: `py-2 pr-4 text-xs ${it.overdue ? "text-rose-300" : "text-slate-400"}`,
                },
              ],
            }))}
          />
        </section>
      </div>
    </AppLayout>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="card p-5 min-w-0 overflow-hidden">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className={`mt-2 min-w-0 truncate text-2xl font-semibold tabular-nums ${tone ?? "text-white"}`} title={String(value)}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}
