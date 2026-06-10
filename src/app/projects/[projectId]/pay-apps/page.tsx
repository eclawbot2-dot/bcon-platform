import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import { sumMoney, toNum } from "@/lib/money";

export default async function PayAppsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: {
      payApplications: {
        include: { lines: { orderBy: { lineNumber: "asc" } }, contract: true },
        orderBy: { periodNumber: "asc" },
      },
    },
  });
  if (!project) notFound();

  const totalBilled = sumMoney(project.payApplications.map((p) => p.workCompletedToDate));
  const retentionHeld = sumMoney(project.payApplications.map((p) => p.retainageHeld));
  const pendingPayment = sumMoney(project.payApplications.filter((p) => p.status !== "PAID").map((p) => p.currentPaymentDue));

  return (
    <AppLayout eyebrow={`${project.code} · Pay applications`} title={project.name} description="AIA G702/G703 progress billing with schedule of values, retainage, and approvals.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="pay-apps" mode={project.mode} />

        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${project.id}/pay-apps/reconciliation`} className="btn-outline text-xs">SOV reconciliation report</Link>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Draws filed" value={project.payApplications.length} />
          <Stat label="Billed to date" value={formatCurrency(totalBilled)} />
          <Stat label="Retainage held" value={formatCurrency(retentionHeld)} tone="warn" />
          <Stat label="Pending payment" value={formatCurrency(pendingPayment)} tone="warn" />
        </section>

        {project.payApplications.map((app) => (
          <section key={app.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Period #{app.periodNumber}</div>
                <div className="mt-1 text-lg font-semibold text-white">{formatDate(app.periodFrom)} → {formatDate(app.periodTo)}</div>
                <div className="text-xs text-slate-500">Contract: {app.contract?.title ?? "—"}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={app.status} />
                <div className="text-xs text-slate-400">Submitted: {formatDate(app.submittedAt)} · Paid: {formatDate(app.paidAt)}</div>
                <div className="flex items-center gap-3">
                  <a href={`/api/pay-applications/${app.id}/g702`} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-300 hover:text-white hover:underline" title="Print-ready AIA G702/G703 document">G702/G703 ↗</a>
                  <Link href={`/projects/${project.id}/pay-apps/${app.id}`} className="text-xs text-cyan-300 hover:text-cyan-200 hover:underline">View full schedule →</Link>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <Stat label="Original contract" value={formatCurrency(app.originalContractValue)} />
              <Stat label="Net change orders" value={formatCurrency(app.changeOrderValue)} />
              <Stat label="Total contract" value={formatCurrency(app.totalContractValue)} />
              <Stat label="Work completed" value={formatCurrency(app.workCompletedToDate)} tone="good" />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Stat label="Retainage held" value={formatCurrency(app.retainageHeld)} tone="warn" />
              <Stat label="Less prev. payments" value={formatCurrency(app.lessPreviousPayments)} />
              <Stat label="Current payment due" value={formatCurrency(app.currentPaymentDue)} tone="good" />
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
              <SortableTable
                className="min-w-full divide-y divide-white/10"
                columns={[
                  { header: "#" },
                  { header: "Cost code" },
                  { header: "Description" },
                  { header: "Scheduled value" },
                  { header: "Prior" },
                  { header: "This period" },
                  { header: "Total completed" },
                  { header: "% complete" },
                  { header: "Balance" },
                  { header: "Retainage" },
                ]}
                rows={app.lines.map((line) => ({
                  key: line.id,
                  cells: [
                    { sort: line.lineNumber, node: line.lineNumber, tdClassName: "font-mono text-xs text-slate-400" },
                    { sort: line.costCode ?? "", node: line.costCode ?? "—" },
                    { sort: line.description, node: line.description },
                    { sort: toNum(line.scheduledValue), node: formatCurrency(line.scheduledValue) },
                    { sort: toNum(line.workCompletedPrev), node: formatCurrency(line.workCompletedPrev) },
                    { sort: toNum(line.workCompletedThis), node: formatCurrency(line.workCompletedThis) },
                    { sort: toNum(line.totalCompleted), node: formatCurrency(line.totalCompleted) },
                    { sort: toNum(line.percentComplete), node: formatPercent(line.percentComplete) },
                    { sort: toNum(line.balanceToFinish), node: formatCurrency(line.balanceToFinish) },
                    { sort: toNum(line.retainage), node: formatCurrency(line.retainage) },
                  ],
                }))}
              />
            </div>
          </section>
        ))}
        {project.payApplications.length === 0 ? <div className="card p-8 text-center text-slate-500">No pay applications filed.</div> : null}
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-white";
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
