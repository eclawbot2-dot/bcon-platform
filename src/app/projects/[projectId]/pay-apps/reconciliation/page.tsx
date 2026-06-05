import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency } from "@/lib/utils";
import { reconcileSov } from "@/lib/reports";
import { Scale } from "lucide-react";

/**
 * Schedule-of-values vs pay-app reconciliation. Rolls every pay
 * application's G703 lines up to one SOV view: scheduled value,
 * billed-to-date, % complete, retainage held, balance to finish, and any
 * over-billing (billed beyond the scheduled value). Closeout/audit-grade.
 */
export default async function SovReconciliationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: {
      payApplications: {
        include: { lines: { orderBy: { lineNumber: "asc" } } },
        orderBy: { periodNumber: "asc" },
      },
    },
  });
  if (!project) notFound();

  const report = reconcileSov(
    project.payApplications.map((p) => ({
      periodNumber: p.periodNumber,
      status: p.status,
      lines: p.lines.map((l) => ({
        lineNumber: l.lineNumber,
        costCode: l.costCode,
        description: l.description,
        scheduledValue: l.scheduledValue,
        totalCompleted: l.totalCompleted,
        retainage: l.retainage,
      })),
    })),
  );

  const hasData = report.lines.length > 0;

  return (
    <AppLayout
      eyebrow={`${project.code} · SOV reconciliation`}
      title={project.name}
      description="Schedule of values reconciled against billed pay applications — % complete, retainage, and over/under-billing."
    >
      <div className="grid gap-6">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link href={`/projects/${projectId}`} className="hover:text-cyan-200">{project.code}</Link>
          <span className="px-1.5">/</span>
          <Link href={`/projects/${projectId}/pay-apps`} className="hover:text-cyan-200">Pay apps</Link>
          <span className="px-1.5">/</span>
          <span className="text-slate-300">SOV reconciliation</span>
        </nav>

        <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Scheduled value" value={formatCurrency(report.totals.scheduledValue)} />
          <StatTile label="Billed to date" value={formatCurrency(report.totals.billedToDate)} tone="good" />
          <StatTile label="% complete" value={`${report.totals.percentComplete}%`} />
          <StatTile label="Retainage held" value={formatCurrency(report.totals.retainageHeld)} tone="warn" />
          <StatTile
            label={report.hasOverBilling ? "Over-billed" : "Balance to finish"}
            value={report.hasOverBilling ? formatCurrency(report.totals.overBilled) : formatCurrency(report.totals.balanceToFinish)}
            tone={report.hasOverBilling ? "bad" : "default"}
          />
        </section>

        {report.hasOverBilling ? (
          <div role="alert" className="card border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-200">
            One or more SOV lines are billed beyond their scheduled value. Review highlighted rows — this may indicate an
            unincorporated change order or a billing error.
          </div>
        ) : null}

        {hasData ? (
          <section className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <SortableTable
                emptyMessage="No SOV lines."
                columns={[
                  { header: "#" },
                  { header: "Cost code" },
                  { header: "Description" },
                  { header: "Scheduled value" },
                  { header: "Billed to date" },
                  { header: "% complete" },
                  { header: "Retainage" },
                  { header: "Balance" },
                ]}
                rows={report.lines.map((l) => ({
                  key: l.key,
                  className: l.overBilled > 0 ? "bg-rose-500/5" : undefined,
                  cells: [
                    { sort: l.lineNumber, node: l.lineNumber, tdClassName: "font-mono text-xs text-slate-400" },
                    { sort: l.costCode ?? "", node: l.costCode ?? "—", tdClassName: "text-slate-400" },
                    { sort: l.description, node: l.description },
                    { sort: l.scheduledValue, node: formatCurrency(l.scheduledValue) },
                    { sort: l.billedToDate, node: formatCurrency(l.billedToDate) },
                    { sort: l.percentComplete, node: `${l.percentComplete}%`, tdClassName: l.percentComplete >= 100 ? "text-emerald-300" : "text-slate-200" },
                    { sort: l.retainageHeld, node: formatCurrency(l.retainageHeld), tdClassName: "text-amber-200" },
                    {
                      sort: l.overBilled > 0 ? -l.overBilled : l.balanceToFinish,
                      node:
                        l.overBilled > 0 ? (
                          <span className="text-rose-300">over {formatCurrency(l.overBilled)}</span>
                        ) : (
                          formatCurrency(l.balanceToFinish)
                        ),
                    },
                  ],
                }))}
              />
            </div>
            <div className="border-t border-white/10 px-5 py-3 text-sm">
              <div className="flex flex-wrap justify-between gap-4 font-semibold text-white">
                <span>Totals</span>
                <span className="flex flex-wrap gap-6">
                  <span>SOV {formatCurrency(report.totals.scheduledValue)}</span>
                  <span>Billed {formatCurrency(report.totals.billedToDate)}</span>
                  <span>{report.totals.percentComplete}%</span>
                  <span className="text-amber-200">Retainage {formatCurrency(report.totals.retainageHeld)}</span>
                  <span>Balance {formatCurrency(report.totals.balanceToFinish)}</span>
                </span>
              </div>
            </div>
          </section>
        ) : (
          <section className="card p-6">
            <EmptyState
              icon={Scale}
              title="No pay applications to reconcile"
              description="File a pay application with a schedule of values and this report will reconcile billed amounts against the SOV line by line."
              action={<Link href={`/projects/${projectId}/pay-apps`} className="btn-outline text-xs">Go to pay apps</Link>}
            />
          </section>
        )}

        <Link href={`/projects/${projectId}/pay-apps`} className="btn-outline text-xs self-start">← Back to pay apps</Link>
      </div>
    </AppLayout>
  );
}
