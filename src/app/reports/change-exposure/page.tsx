/* eslint-disable @next/next/no-html-link-for-pages --
   The CSV export link points at the /api/reports/change-exposure route
   handler that streams a file download, not a Next.js *page*. A plain <a>
   is correct; <Link> would attempt a client-side navigation and break the
   download. */
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { changeExposureReport, type ExposureBucket } from "@/lib/reports";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency } from "@/lib/utils";

/**
 * Change-exposure pipeline — portfolio-wide RFI → PCO → CO cost tracing.
 * Surfaces where an RFI flagged a cost impact and whether that impact has
 * been captured into a change order, is still in flight, or has leaked
 * (uncaptured). Leakage first so the team can chase un-converted exposure.
 * Tenant-scoped via changeExposureReport.
 */
export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<ExposureBucket, string> = {
  CAPTURED: "Captured",
  IN_FLIGHT: "In flight",
  UNCAPTURED: "Uncaptured",
};

const BUCKET_TONE: Record<ExposureBucket, string> = {
  CAPTURED: "text-emerald-300",
  IN_FLIGHT: "text-amber-300",
  UNCAPTURED: "text-rose-300",
};

export default async function ChangeExposurePage() {
  const tenant = await requireTenant();
  const { rows, totals } = await changeExposureReport(tenant.id);

  return (
    <AppLayout
      eyebrow="Insights"
      title="Change exposure"
      description="Every RFI-flagged cost impact traced through its change orders. Uncaptured exposure first — estimated dollars nobody has converted into a billable change order yet."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <Tile
            label="Uncaptured exposure"
            value={formatCurrency(totals.uncapturedExposure)}
            sub={`${totals.uncapturedCount} RFI${totals.uncapturedCount === 1 ? "" : "s"} with no live CO`}
            tone="text-rose-300"
          />
          <Tile label="In flight" value={formatCurrency(totals.pendingCoValue)} sub={`${totals.inFlightCount} pending CO RFIs`} tone="text-amber-300" />
          <Tile label="Captured (approved COs)" value={formatCurrency(totals.approvedCoValue)} sub={`${totals.capturedCount} captured`} tone="text-emerald-300" />
          <Tile label="Total RFI cost impact" value={formatCurrency(totals.estimatedImpact)} sub="Estimated across all flagged RFIs" />
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Exposure by RFI</div>
              <p className="mt-1 text-xs text-slate-400">
                Uncaptured first, then largest impact. &quot;Delta&quot; is the approved CO value minus the RFI&apos;s estimate.
              </p>
            </div>
            <a href="/api/reports/change-exposure?format=csv" className="btn-outline text-xs">Export CSV</a>
          </div>
          <SortableTable
            className="mt-4 min-w-full divide-y divide-white/10 text-sm"
            emptyMessage="No RFIs carry a cost impact or linked change order yet."
            columns={[
              { header: "RFI", thClassName: "py-2 pr-4" },
              { header: "Subject", thClassName: "py-2 pr-4" },
              { header: "Project", thClassName: "py-2 pr-4" },
              { header: "Status", thClassName: "py-2 pr-4" },
              { header: "Est. impact", align: "right", thClassName: "py-2 pr-4" },
              { header: "Approved CO", align: "right", thClassName: "py-2 pr-4" },
              { header: "Pending CO", align: "right", thClassName: "py-2 pr-4" },
              { header: "Delta", align: "right", thClassName: "py-2 pr-4" },
              { header: "Bucket", thClassName: "py-2 pr-4" },
            ]}
            rows={rows.map((r) => ({
              key: r.rfiId,
              className: r.bucket === "UNCAPTURED" ? "bg-rose-500/5 hover:bg-rose-500/10" : "hover:bg-white/5",
              cells: [
                {
                  sort: r.number,
                  node: (
                    <a href={`/projects/${r.projectId}/rfis`} className="text-cyan-200 hover:underline">
                      {r.number}
                    </a>
                  ),
                  tdClassName: "py-2 pr-4 font-mono text-xs",
                },
                { sort: r.subject, node: r.subject, tdClassName: "py-2 pr-4 text-white max-w-xs truncate" },
                { sort: r.projectName, node: r.projectName, tdClassName: "py-2 pr-4 text-slate-300" },
                { sort: r.status, node: r.status, tdClassName: "py-2 pr-4 text-xs text-slate-400" },
                { sort: r.estimatedImpact, node: formatCurrency(r.estimatedImpact), tdClassName: "py-2 pr-4 text-slate-300" },
                { sort: r.approvedCoValue, node: r.approvedCoValue !== 0 ? formatCurrency(r.approvedCoValue) : "—", tdClassName: "py-2 pr-4 text-emerald-300" },
                { sort: r.pendingCoValue, node: r.pendingCoValue !== 0 ? formatCurrency(r.pendingCoValue) : "—", tdClassName: "py-2 pr-4 text-amber-300" },
                {
                  sort: r.capturedDelta,
                  node: r.bucket === "CAPTURED" ? formatCurrency(r.capturedDelta) : "—",
                  tdClassName: `py-2 pr-4 ${r.capturedDelta > 0 ? "text-rose-300" : "text-slate-300"}`,
                },
                {
                  sort: r.bucket,
                  node: <span className={`font-semibold ${BUCKET_TONE[r.bucket]}`}>{BUCKET_LABEL[r.bucket]}</span>,
                  tdClassName: "py-2 pr-4 text-xs",
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
